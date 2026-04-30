"""
Analytics Router for Pulse.
Handles transaction syncing, metrics computation, and data retrieval.
All endpoints require JWT authentication.
"""

import httpx
import logging
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from slowapi import Limiter
from slowapi.util import get_remote_address
from services.auth import require_auth
from services.helius import get_all_transactions
from services.parser import parse_transactions_batch
from services.metrics import build_metrics_payload
from services.cache import (
    cache_get,
    cache_set,
    txn_cache_key,
    metrics_cache_key,
)
from services.validators import is_valid_solana_address
from services.supabase import get_supabase
from models.schemas import convert_to_camel_case

router = APIRouter(prefix="/analytics", tags=["analytics"])
logger = logging.getLogger(__name__)

# Rate limiter shared with main.py
limiter = Limiter(key_func=get_remote_address)


@router.post("/sync/{address}")
@limiter.limit("10/minute")
async def sync_program(
    request: Request,
    address: str,
    wallet: str = Depends(require_auth),
    program_name: str = Query(None),
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
        # Verify wallet owns this program
        program_row = (
            supabase.table("programs")
            .select("id, name, last_synced_signature")
            .eq("program_address", address)
            .execute()
        )
        if not program_row.data:
            raise HTTPException(
                status_code=403,
                detail="You do not own this program. Register it first.",
            )
        program_id = program_row.data[0]["id"]
        last_synced_signature = program_row.data[0].get("last_synced_signature")

        # Step 1: Fetch transactions from Helius (incremental if cursor exists)
        raw_txns = await get_all_transactions(
            address,
            after=last_synced_signature,
            max_pages=50,  # Allow more pages for incremental
        )
        if not raw_txns:
            return {
                "status": "no_data",
                "message": f"No transactions found for {address}",
                "metrics": None,
            }

        # Step 2: Parse and normalize
        parsed = parse_transactions_batch(raw_txns, program_id=address)
        if not parsed:
            raise HTTPException(
                status_code=422,
                detail="Transactions fetched but none could be parsed",
            )

        # Step 3: Deduplicate on signature before writing
        existing_txns = await cache_get(txn_cache_key(address)) or []
        merged = {t["signature"]: t for t in existing_txns + parsed}
        deduped = list(merged.values())

        # Step 4: Cache raw transactions (Redis as read-through cache)
        await cache_set(txn_cache_key(address), deduped, ttl_seconds=3600)

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

        # Step 8: Update last_synced_at and last_synced_signature
        try:
            # Get the latest signature from the fetched transactions
            latest_signature = parsed[-1]["signature"] if parsed else None
            supabase.table("programs").update(
                {"last_synced_at": "now()", "last_synced_signature": latest_signature}
            ).eq("id", program_id).execute()
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
        raise HTTPException(
            status_code=e.response.status_code,
            detail=f"Helius API error: {e.response.text}",
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Sync failed", extra={"error": str(e), "address": address})
        raise HTTPException(
            status_code=500,
            detail=f"Sync failed: {str(e)}",
        )


@router.get("/metrics/{program_id}")
async def get_metrics(program_id: str, wallet: str = Depends(require_auth)):
    """
    Get cached metrics for a program.
    Returns 404 if sync hasn't been run yet.
    """
    if not is_valid_solana_address(program_id):
        raise HTTPException(status_code=400, detail="Invalid Solana address format")
    metrics = await cache_get(metrics_cache_key(program_id))
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
    limit: int = Query(default=100, le=1000),
):
    """
    Get cached parsed transactions for a program.
    """
    if not is_valid_solana_address(program_id):
        raise HTTPException(status_code=400, detail="Invalid Solana address format")
    txns = await cache_get(txn_cache_key(program_id))
    if not txns:
        raise HTTPException(
            status_code=404,
            detail="No transactions found. Run /analytics/sync/{address} first.",
        )
    return txns[:limit]