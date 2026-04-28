"""
Webhooks Router for Pulse.
Receives real-time transaction events from Helius webhooks.
"""

import os
from fastapi import APIRouter, HTTPException, Request
from services.parser import parse_transactions_batch
from services.cache import cache_get, cache_set, txn_cache_key, metrics_cache_key, cache_invalidate

router = APIRouter(prefix="/webhooks", tags=["webhooks"])

HELIUS_WEBHOOK_SECRET = os.getenv("HELIUS_WEBHOOK_SECRET")


@router.post("/helius")
async def helius_webhook(request: Request):
    """
    Receive real-time transaction events from Helius.
    On each new transaction:
    1. Parse the enhanced transaction
    2. Append to cached transactions
    3. Invalidate metrics cache (will be recomputed on next request)
    """
    body = await request.json()

    # Helius sends an array of enhanced transactions
    if not isinstance(body, list):
        body = [body]

    for raw_txn in body:
        # Extract program address from account data
        account_data = raw_txn.get("accountData", [])
        program_address = None
        for account in account_data:
            if account.get("nativeBalanceChange", 0) != 0:
                program_address = account.get("account")
                break

        if not program_address:
            continue

        # Parse the transaction
        parsed = parse_transactions_batch([raw_txn], program_id=program_address)
        if not parsed:
            continue

        # Append to cached transactions
        existing = await cache_get(txn_cache_key(program_address)) or []
        existing.extend(parsed)
        await cache_set(txn_cache_key(program_address), existing, ttl_seconds=3600)

        # Invalidate metrics cache so they get recomputed
        await cache_invalidate(metrics_cache_key(program_address))

    return {"status": "processed", "count": len(body)}
