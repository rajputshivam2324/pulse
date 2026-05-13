"""
Analytics Router for Pulse.
Handles transaction syncing, metrics computation, and data retrieval.
All endpoints require JWT authentication.
"""

import asyncio
import httpx
import logging
import os
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import JSONResponse
from slowapi import Limiter
from starlette.concurrency import run_in_threadpool
from services.rate_limit import limiter
from services.auth import require_auth, resolve_wallet_to_user_id_async
from services.helius import get_all_transactions
from services.parser import parse_transactions_batch
from services.metrics import build_metrics_payload
from services.cache import (
    cache_get,
    cache_set,
    metrics_cache_key,
)
from services.sync_job_queue import (
    enqueue_sync_job,
    get_sync_job as get_sync_job_record,
)
from services.validators import is_valid_solana_address
from services.supabase import get_supabase, sb_execute
from models.schemas import convert_to_camel_case

router = APIRouter(prefix="/analytics", tags=["analytics"])
logger = logging.getLogger(__name__)

SUPABASE_PAGE_SIZE = 1000
# Signature-only pages are tiny per row — use a larger range to cut round trips.
SUPABASE_SIGNATURE_PAGE_SIZE = 4000
UPSERT_CHUNK_SIZE = int(os.getenv("SUPABASE_UPSERT_CHUNK", "400"))
# Concurrent PostgREST range reads — cuts wall time vs sequential pagination.
SUPABASE_FETCH_CONCURRENCY = max(1, int(os.getenv("SUPABASE_FETCH_CONCURRENCY", "4")))


def _sort_transactions_newest_first(txns: list[dict]) -> list[dict]:
    """Return transactions in deterministic newest-first order using proper datetime parsing."""
    from datetime import datetime, timezone

    def _parse_ts(t: dict):
        ts = t.get("timestamp")
        if not ts:
            return datetime.min.replace(tzinfo=timezone.utc)
        if isinstance(ts, datetime):
            return ts
        try:
            # Handle ISO format with Z or +00:00
            ts_str = str(ts).replace("Z", "+00:00")
            return datetime.fromisoformat(ts_str)
        except (ValueError, TypeError):
            return datetime.min.replace(tzinfo=timezone.utc)

    return sorted(
        txns,
        key=lambda t: (_parse_ts(t), t.get("signature") or ""),
        reverse=True,
    )


def _db_txn_to_parsed(row: dict, program_address: str) -> dict:
    """Map a Supabase transaction row back to the parsed transaction shape."""
    return {
        "program_id": program_address,
        "signature": row["signature"],
        "wallet_address": row["wallet_address"],
        "transaction_type": row.get("transaction_type", "UNKNOWN"),
        "timestamp": row.get("timestamp"),
        "amount_sol": row.get("amount_sol"),
        "token_mint": row.get("token_mint"),
    }


async def _fetch_existing_transactions_from_supabase(
    supabase,
    program_id: str,
    program_address: str,
) -> list[dict]:
    """
    Fetch persisted transactions with explicit Supabase range pagination.
    Uses concurrent range windows to reduce wall time vs a single sequential scan.
    """
    existing: list[dict] = []
    offset = 0
    page_size = SUPABASE_PAGE_SIZE
    conc = SUPABASE_FETCH_CONCURRENCY

    while True:
        offsets = [offset + i * page_size for i in range(conc)]
        pages = await asyncio.gather(
            *[
                _fetch_transactions_slice_from_supabase(
                    supabase, program_id, program_address, off, page_size
                )
                for off in offsets
            ]
        )
        if not any(pages):
            break
        for page in pages:
            existing.extend(page)
        if len(pages[-1]) < page_size:
            break
        offset += conc * page_size

    return existing


async def _fetch_transactions_slice_from_supabase(
    supabase,
    program_id: str,
    program_address: str,
    offset: int,
    limit: int,
) -> list[dict]:
    """Read only one page from Supabase (newest-first). Avoids loading full history into memory."""
    if limit <= 0:
        return []
    response = await sb_execute(
        supabase.table("transactions")
        .select("signature,wallet_address,transaction_type,timestamp,amount_sol,token_mint")
        .eq("program_id", program_id)
        .order("timestamp", desc=True)
        .range(offset, offset + limit - 1)
    )
    page = response.data or []
    return [_db_txn_to_parsed(row, program_address) for row in page]


async def _fetch_signatures_slice_from_supabase(
    supabase,
    program_id: str,
    offset: int,
    limit: int,
) -> list[str]:
    """One signatures-only page (newest-first), for parallel pagination."""
    if limit <= 0:
        return []
    response = await sb_execute(
        supabase.table("transactions")
        .select("signature")
        .eq("program_id", program_id)
        .order("timestamp", desc=True)
        .range(offset, offset + limit - 1)
    )
    page = response.data or []
    out: list[str] = []
    for row in page:
        s = row.get("signature")
        if s:
            out.append(s)
    return out


async def _fetch_existing_signatures_from_supabase(supabase, program_id: str) -> set[str]:
    """Return all known signatures for a program (minimal columns — fast to transfer)."""
    sigs: set[str] = set()
    offset = 0
    page_size = SUPABASE_SIGNATURE_PAGE_SIZE
    conc = SUPABASE_FETCH_CONCURRENCY

    while True:
        offsets = [offset + i * page_size for i in range(conc)]
        pages = await asyncio.gather(
            *[
                _fetch_signatures_slice_from_supabase(supabase, program_id, off, page_size)
                for off in offsets
            ]
        )
        if not any(pages):
            break
        for page in pages:
            sigs.update(page)
        if len(pages[-1]) < page_size:
            break
        offset += conc * page_size

    return sigs


async def _run_sync_pipeline(
    address: str,
    program_data: dict,
    program_name: str | None,
    force: bool,
) -> dict:
    """
    Helius fetch → parse → dedupe → upsert → metrics → cache → program row update.
    Returns the same JSON shape as the synchronous /analytics/sync endpoint.
    """
    supabase = get_supabase()
    program_id = program_data["id"]
    last_synced_signature = program_data.get("last_synced_signature")

    cursor = None if force else last_synced_signature
    if force:
        logger.info("Force resync requested — ignoring incremental cursor", extra={"address": address})

    raw_txns = await get_all_transactions(
        address,
        after=cursor,
        max_pages=50,
    )
    if not raw_txns:
        existing_txns = await _fetch_existing_transactions_from_supabase(
            supabase,
            program_id,
            address,
        )
        if not existing_txns:
            return {
                "status": "no_data",
                "message": f"No transactions found for {address}",
                "metrics": None,
            }

        deduped = _sort_transactions_newest_first(existing_txns)
        metrics = await run_in_threadpool(lambda: build_metrics_payload(deduped))
        await cache_set(metrics_cache_key(address), metrics, ttl_seconds=3600)

        return {
            "status": "up_to_date",
            "programAddress": address,
            "transactionsFetched": 0,
            "transactionsParsed": 0,
            "metrics": convert_to_camel_case(metrics),
        }

    parsed = await run_in_threadpool(
        lambda: parse_transactions_batch(raw_txns, program_id=address)
    )
    if not parsed:
        raise HTTPException(
            status_code=422,
            detail="Transactions fetched but none could be parsed",
        )

    existing_sigs = await _fetch_existing_signatures_from_supabase(supabase, program_id)
    new_rows = [
        {
            "program_id": program_id,
            "signature": t["signature"],
            "wallet_address": t["wallet_address"],
            "transaction_type": t.get("transaction_type", "UNKNOWN"),
            "timestamp": t.get("timestamp"),
            "amount_sol": t.get("amount_sol"),
            "token_mint": t.get("token_mint"),
        }
        for t in parsed
        if t.get("signature") and t["signature"] not in existing_sigs
    ]

    if not new_rows:
        cached = await cache_get(metrics_cache_key(address))
        if cached:
            return {
                "status": "up_to_date",
                "programAddress": address,
                "transactionsFetched": len(raw_txns),
                "transactionsParsed": len(parsed),
                "metrics": convert_to_camel_case(cached),
            }

    if new_rows:
        try:
            for i in range(0, len(new_rows), UPSERT_CHUNK_SIZE):
                chunk = new_rows[i : i + UPSERT_CHUNK_SIZE]
                await sb_execute(
                    supabase.table("transactions").upsert(
                        chunk,
                        on_conflict="signature",
                    )
                )
        except Exception as db_err:
            logger.error("Supabase write failed during sync", extra={"error": str(db_err), "address": address})

    deduped = await _fetch_existing_transactions_from_supabase(
        supabase,
        program_id,
        address,
    )
    if not deduped:
        raise HTTPException(status_code=500, detail="Failed to load transactions after sync")

    metrics = await run_in_threadpool(lambda: build_metrics_payload(deduped))
    await cache_set(metrics_cache_key(address), metrics, ttl_seconds=3600)

    try:
        latest_signature = raw_txns[0]["signature"] if raw_txns else None
        update_payload: dict = {
            "last_synced_at": "now()",
            "last_synced_signature": latest_signature,
        }
        if program_name:
            update_payload["name"] = program_name
        await sb_execute(
            supabase.table("programs").update(update_payload).eq("id", program_id)
        )
    except Exception:
        pass

    return {
        "status": "synced",
        "programAddress": address,
        "transactionsFetched": len(raw_txns),
        "transactionsParsed": len(parsed),
        "metrics": convert_to_camel_case(metrics),
    }


async def execute_sync_job_from_queue(payload: dict) -> dict:
    """
    Run the sync pipeline from a Redis job payload.
    Re-validates program ownership before executing (never trust stale jobs alone).
    """
    address = str(payload.get("program_address", ""))
    if not is_valid_solana_address(address):
        raise ValueError("Invalid program_address in sync job payload")

    supabase = get_supabase()
    user_id = str(payload["user_id"])
    program_db_id = str(payload["program_db_id"])
    program_name = payload.get("program_name")
    force = bool(payload.get("force", False))

    row = await sb_execute(
        supabase.table("programs")
        .select("id, name, last_synced_signature, user_id")
        .eq("id", program_db_id)
        .eq("user_id", user_id)
        .eq("program_address", address)
    )
    if not row.data:
        raise ValueError("Program not found or access denied for sync job")

    return await _run_sync_pipeline(address, row.data[0], program_name, force)


@router.post("/sync/{address}")
@limiter.limit("10/minute")
async def sync_program(
    request: Request,
    address: str,
    wallet: str = Depends(require_auth),
    program_name: str = Query(None),
    force: bool = Query(False, description="When true, ignore the incremental cursor and re-fetch all transactions from Helius."),
):
    """
    Full sync pipeline for a Solana program address:
    1. Validate address format
    2. Verify ownership (wallet owns a program entry in Supabase for this address)
    3. Fetch all transactions from Helius Enhanced API
    4. Parse and normalize transactions
    5. Persist transactions to Supabase (source of truth)
    6. Compute all product metrics
    7. Cache metrics in Redis
    8. Return the metrics payload

    This is the main entry point for getting analytics data.
    """
    # Validate Solana address format
    if not is_valid_solana_address(address):
        raise HTTPException(status_code=400, detail="Invalid Solana address format")

    try:
        supabase = get_supabase()
        user_id = await resolve_wallet_to_user_id_async(wallet)
        if not user_id:
            raise HTTPException(status_code=401, detail="User not found.")

        # Verify wallet owns this program
        program_row = await sb_execute(
            supabase.table("programs")
            .select("id, name, last_synced_signature, user_id")
            .eq("program_address", address)
            .eq("user_id", user_id)
        )
        if not program_row.data:
            raise HTTPException(
                status_code=403,
                detail="You do not own this program. Register it first.",
            )

        program_data = program_row.data[0]

        return await _run_sync_pipeline(address, program_data, program_name, force)

    except httpx.HTTPStatusError as e:
        logger.error("Helius API error", extra={"status": e.response.status_code, "address": address})
        raise HTTPException(
            status_code=502,
            detail="Failed to fetch data from Helius API",
        )
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        logger.error("Sync failed: %s\n%s", str(e), traceback.format_exc(), extra={"address": address})
        raise HTTPException(
            status_code=500,
            detail=f"Sync failed: {str(e)}",
        )


def _public_sync_job_view(job: dict) -> dict:
    """Strip internal payload from job documents returned to clients."""
    payload = job.get("payload") or {}
    return {
        "job_id": job["job_id"],
        "status": job["status"],
        "result": job.get("result"),
        "error": job.get("error"),
        "program_address": payload.get("program_address"),
        "created_at": job.get("created_at"),
        "updated_at": job.get("updated_at"),
    }


@router.get("/sync-queue/jobs/{job_id}")
@limiter.limit("120/minute")
async def get_sync_job_status(
    request: Request,
    job_id: str,
    wallet: str = Depends(require_auth),
):
    """Poll sync job status; only the owning user may read the job."""
    job = await get_sync_job_record(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found or expired.")

    user_id = await resolve_wallet_to_user_id_async(wallet)
    if not user_id:
        raise HTTPException(status_code=401, detail="User not found.")

    payload = job.get("payload") or {}
    if str(payload.get("user_id", "")) != str(user_id):
        raise HTTPException(status_code=403, detail="Not allowed to view this job.")

    return _public_sync_job_view(job)


@router.post("/sync-queue/{address}")
@limiter.limit("10/minute")
async def enqueue_program_sync(
    request: Request,
    address: str,
    wallet: str = Depends(require_auth),
    program_name: str = Query(None),
    force: bool = Query(False, description="When true, ignore the incremental cursor and re-fetch all transactions from Helius."),
):
    """
    Enqueue a full program sync and return 202 + job_id immediately.
    A background worker runs the same pipeline as POST /analytics/sync/{address}.
    """
    if not is_valid_solana_address(address):
        raise HTTPException(status_code=400, detail="Invalid Solana address format")

    supabase = get_supabase()
    user_id = await resolve_wallet_to_user_id_async(wallet)
    if not user_id:
        raise HTTPException(status_code=401, detail="User not found.")

    program_row = await sb_execute(
        supabase.table("programs")
        .select("id, name, last_synced_signature, user_id")
        .eq("program_address", address)
        .eq("user_id", user_id)
    )
    if not program_row.data:
        raise HTTPException(
            status_code=403,
            detail="You do not own this program. Register it first.",
        )

    program_data = program_row.data[0]
    payload = {
        "program_address": address,
        "program_db_id": str(program_data["id"]),
        "user_id": str(user_id),
        "program_name": program_name,
        "force": force,
    }
    new_id = await enqueue_sync_job(payload)
    return JSONResponse(
        status_code=202,
        content={"job_id": new_id, "status": "queued"},
    )


@router.get("/metrics/{program_id}")
async def get_metrics(program_id: str, wallet: str = Depends(require_auth)):
    """
    Get metrics for a program.
    Uses Redis first, then rebuilds from paginated Supabase transactions when
    the cache has expired.
    """
    if not is_valid_solana_address(program_id):
        raise HTTPException(status_code=400, detail="Invalid Solana address format")

    # Ownership check
    supabase = get_supabase()
    user_id = await resolve_wallet_to_user_id_async(wallet)
    if not user_id:
        raise HTTPException(status_code=401, detail="User not found.")

    program_row = await sb_execute(
        supabase.table("programs")
        .select("id, user_id")
        .eq("program_address", program_id)
        .eq("user_id", user_id)
    )
    if not program_row.data:
        raise HTTPException(status_code=403, detail="You do not own this program.")

    metrics = await cache_get(metrics_cache_key(program_id))
    if not metrics:
        db_program_id = program_row.data[0]["id"]
        txns = await _fetch_existing_transactions_from_supabase(
            supabase,
            db_program_id,
            program_id,
        )
        if txns:
            metrics = await run_in_threadpool(lambda: build_metrics_payload(txns))
            # Only cache metrics — raw txns exceed Redis 10MB limit
            await cache_set(metrics_cache_key(program_id), metrics, ttl_seconds=3600)

    if not metrics:
        raise HTTPException(
            status_code=404,
            detail="No metrics found. Run /analytics/sync/{address} first.",
        )
    return convert_to_camel_case(metrics)


@router.get("/transactions/{program_id}")
async def get_transactions(
    program_id: str,
    wallet: str = Depends(require_auth),
    limit: int = Query(default=100, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
):
    """
    Get cached parsed transactions for a program.
    Supports offset/limit pagination over newest-first transactions.
    """
    if not is_valid_solana_address(program_id):
        raise HTTPException(status_code=400, detail="Invalid Solana address format")

    # Ownership check
    supabase = get_supabase()
    user_id = await resolve_wallet_to_user_id_async(wallet)
    if not user_id:
        raise HTTPException(status_code=401, detail="User not found.")

    program_row = await sb_execute(
        supabase.table("programs")
        .select("id, user_id")
        .eq("program_address", program_id)
        .eq("user_id", user_id)
    )
    if not program_row.data:
        raise HTTPException(status_code=403, detail="You do not own this program.")

    # Always read from Supabase — no raw-txn Redis cache (exceeds 10 MB limit)
    db_program_id = program_row.data[0]["id"]
    txns = await _fetch_transactions_slice_from_supabase(
        supabase,
        db_program_id,
        program_id,
        offset,
        limit,
    )

    if not txns:
        raise HTTPException(
            status_code=404,
            detail="No transactions found. Run /analytics/sync/{address} first.",
        )
    return txns
