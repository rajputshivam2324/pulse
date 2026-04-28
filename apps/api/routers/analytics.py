"""
Analytics Router for Pulse.
Handles transaction syncing, metrics computation, and data retrieval.
"""

import httpx
from fastapi import APIRouter, HTTPException
from services.helius import get_all_transactions
from services.parser import parse_transactions_batch
from services.metrics import build_metrics_payload
from services.cache import (
    cache_get,
    cache_set,
    txn_cache_key,
    metrics_cache_key,
)

router = APIRouter(prefix="/analytics", tags=["analytics"])


@router.post("/sync/{address}")
async def sync_program(address: str, program_name: str = None):
    """
    Full sync pipeline for a Solana program address:
    1. Fetch all transactions from Helius Enhanced API
    2. Parse and normalize transactions
    3. Compute all product metrics
    4. Cache everything
    5. Return the metrics payload

    This is the main entry point for getting analytics data.
    """
    try:
        # Step 1: Fetch transactions from Helius
        raw_txns = await get_all_transactions(address)
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

        # Step 3: Cache raw transactions
        await cache_set(
            txn_cache_key(address), parsed, ttl_seconds=3600
        )

        # Step 4: Compute metrics
        metrics = build_metrics_payload(parsed)

        # Step 5: Cache metrics
        await cache_set(
            metrics_cache_key(address), metrics, ttl_seconds=3600
        )

        return {
            "status": "synced",
            "program_address": address,
            "transactions_fetched": len(raw_txns),
            "transactions_parsed": len(parsed),
            "metrics": metrics,
        }

    except httpx.HTTPStatusError as e:
        raise HTTPException(
            status_code=e.response.status_code,
            detail=f"Helius API error: {e.response.text}",
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Sync failed: {str(e)}",
        )


@router.get("/metrics/{program_id}")
async def get_metrics(program_id: str):
    """
    Get cached metrics for a program.
    Returns 404 if sync hasn't been run yet.
    """
    metrics = await cache_get(metrics_cache_key(program_id))
    if not metrics:
        raise HTTPException(
            status_code=404,
            detail="No metrics found. Run /analytics/sync/{address} first.",
        )
    return metrics


@router.get("/transactions/{program_id}")
async def get_transactions(program_id: str, limit: int = 100):
    """
    Get cached parsed transactions for a program.
    """
    txns = await cache_get(txn_cache_key(program_id))
    if not txns:
        raise HTTPException(
            status_code=404,
            detail="No transactions found. Run /analytics/sync/{address} first.",
        )
    return txns[:limit]
