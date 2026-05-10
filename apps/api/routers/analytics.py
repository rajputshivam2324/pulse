"""
Analytics Router for Pulse.
Handles transaction syncing, metrics computation, and data retrieval.
All endpoints require JWT authentication.
"""

import httpx
import logging
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from slowapi import Limiter
from services.rate_limit import limiter
from services.auth import require_auth, resolve_wallet_to_user_id
from services.helius import get_all_transactions
from services.parser import parse_transactions_batch
from services.metrics import build_metrics_payload
from services.cache import (
    cache_get,
    cache_set,
    metrics_cache_key,
)
from services.validators import is_valid_solana_address
from services.supabase import get_supabase
from models.schemas import convert_to_camel_case

router = APIRouter(prefix="/analytics", tags=["analytics"])
logger = logging.getLogger(__name__)

SUPABASE_PAGE_SIZE = 1000


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


def _fetch_existing_transactions_from_supabase(
    supabase,
    program_id: str,
    program_address: str,
) -> list[dict]:
    """
    Fetch persisted transactions with explicit Supabase range pagination.
    This keeps incremental sync correct even when the Redis cache has expired.
    """
    existing = []
    offset = 0

    while True:
        response = (
            supabase.table("transactions")
            .select("signature,wallet_address,transaction_type,timestamp,amount_sol,token_mint")
            .eq("program_id", program_id)
            .order("timestamp", desc=True)
            .range(offset, offset + SUPABASE_PAGE_SIZE - 1)
            .execute()
        )
        page = response.data or []
        if not page:
            break

        existing.extend(_db_txn_to_parsed(row, program_address) for row in page)
        if len(page) < SUPABASE_PAGE_SIZE:
            break
        offset += SUPABASE_PAGE_SIZE

    return existing


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
        user_id = resolve_wallet_to_user_id(wallet)
        if not user_id:
            raise HTTPException(status_code=401, detail="User not found.")

        # Verify wallet owns this program
        program_row = (
            supabase.table("programs")
            .select("id, name, last_synced_signature, user_id")
            .eq("program_address", address)
            .eq("user_id", user_id)
            .execute()
        )
        if not program_row.data:
            raise HTTPException(
                status_code=403,
                detail="You do not own this program. Register it first.",
            )

        program_data = program_row.data[0]

        program_id = program_data["id"]
        last_synced_signature = program_data.get("last_synced_signature")

        # `force=true` resets the cursor so the full history is re-fetched from Helius.
        # Without this, a stale or incorrect cursor would cause the sync to return
        # zero new transactions even when Helius has data.
        cursor = None if force else last_synced_signature
        if force:
            logger.info("Force resync requested — ignoring incremental cursor", extra={"address": address})

        # Step 1: Fetch transactions from Helius (incremental if cursor exists)
        raw_txns = await get_all_transactions(
            address,
            after=cursor,
            max_pages=50,  # Allow more pages for incremental
        )
        if not raw_txns:
            existing_txns = _fetch_existing_transactions_from_supabase(
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
            metrics = build_metrics_payload(deduped)
            # Only cache metrics (small) — raw txns exceed Redis 10MB limit
            await cache_set(metrics_cache_key(address), metrics, ttl_seconds=3600)

            return {
                "status": "up_to_date",
                "programAddress": address,
                "transactionsFetched": 0,
                "transactionsParsed": 0,
                "metrics": convert_to_camel_case(metrics),
            }

        # Step 2: Parse and normalize
        parsed = parse_transactions_batch(raw_txns, program_id=address)
        if not parsed:
            raise HTTPException(
                status_code=422,
                detail="Transactions fetched but none could be parsed",
            )

        # Step 3: Deduplicate — always read from Supabase (paginated).
        # We never cache raw transactions in Redis: large programs exceed the
        # Upstash 10 MB request limit. Supabase is the source of truth.
        existing_txns = _fetch_existing_transactions_from_supabase(
            supabase,
            program_id,
            address,
        )
        if not isinstance(existing_txns, list):
            existing_txns = []
        merged = {t["signature"]: t for t in existing_txns + parsed}
        deduped = _sort_transactions_newest_first(list(merged.values()))

        # Step 5: Persist to Supabase (source of truth) — upsert by signature
        try:
            rows_to_insert = [
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
            ]
            if rows_to_insert:
                supabase.table("transactions").upsert(
                    rows_to_insert,
                    on_conflict="signature",
                ).execute()
        except Exception as db_err:
            logger.error("Supabase write failed during sync", extra={"error": str(db_err), "address": address})
            # Non-fatal: Redis cache is still valid

        # Step 6: Compute metrics
        metrics = build_metrics_payload(deduped)

        # Step 7: Cache metrics
        await cache_set(metrics_cache_key(address), metrics, ttl_seconds=3600)

        # Step 8: Update last_synced_at, last_synced_signature, and name (if provided)
        try:
            # Helius/RPC responses are newest-first; the sync cursor must point
            # at the newest fetched transaction, not the oldest page boundary.
            latest_signature = raw_txns[0]["signature"] if raw_txns else None
            update_payload: dict = {
                "last_synced_at": "now()",
                "last_synced_signature": latest_signature,
            }
            # Persist program name when the caller provides one
            if program_name:
                update_payload["name"] = program_name
            supabase.table("programs").update(update_payload).eq("id", program_id).execute()
        except Exception:
            pass  # Non-fatal

        return {
            "status": "synced",
            "programAddress": address,
            "transactionsFetched": len(raw_txns),
            "transactionsParsed": len(parsed),
            "metrics": convert_to_camel_case(metrics),
        }

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
    user_id = resolve_wallet_to_user_id(wallet)
    if not user_id:
        raise HTTPException(status_code=401, detail="User not found.")

    program_row = (
        supabase.table("programs")
        .select("id, user_id")
        .eq("program_address", program_id)
        .eq("user_id", user_id)
        .execute()
    )
    if not program_row.data:
        raise HTTPException(status_code=403, detail="You do not own this program.")

    metrics = await cache_get(metrics_cache_key(program_id))
    if not metrics:
        db_program_id = program_row.data[0]["id"]
        txns = _fetch_existing_transactions_from_supabase(
            supabase,
            db_program_id,
            program_id,
        )
        if txns:
            txns = _sort_transactions_newest_first(txns)
            metrics = build_metrics_payload(txns)
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
    user_id = resolve_wallet_to_user_id(wallet)
    if not user_id:
        raise HTTPException(status_code=401, detail="User not found.")

    program_row = (
        supabase.table("programs")
        .select("id, user_id")
        .eq("program_address", program_id)
        .eq("user_id", user_id)
        .execute()
    )
    if not program_row.data:
        raise HTTPException(status_code=403, detail="You do not own this program.")

    # Always read from Supabase — no raw-txn Redis cache (exceeds 10 MB limit)
    db_program_id = program_row.data[0]["id"]
    txns = _fetch_existing_transactions_from_supabase(
        supabase,
        db_program_id,
        program_id,
    )

    if not txns:
        raise HTTPException(
            status_code=404,
            detail="No transactions found. Run /analytics/sync/{address} first.",
        )
    txns = _sort_transactions_newest_first(txns)
    return txns[offset : offset + limit]
