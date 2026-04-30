"""
Webhooks Router for Pulse.
Receives real-time transaction events from Helius webhooks.
Signature verification ensures only Helius can push events.
"""

import os
import hmac
import hashlib
import logging
from fastapi import APIRouter, HTTPException, Request
from services.parser import parse_transactions_batch
from services.cache import cache_get, cache_set, txn_cache_key, cache_invalidate

router = APIRouter(prefix="/webhooks", tags=["webhooks"])
logger = logging.getLogger(__name__)

HELIUS_WEBHOOK_SECRET = os.getenv("HELIUS_WEBHOOK_SECRET", "")


def _verify_helius_signature(body: bytes, header_sig: str | None) -> bool:
    """
    Verify Helius webhook HMAC-SHA256 signature.
    Helius sends the signature in the 'authorization' header as a hex digest.
    """
    if not HELIUS_WEBHOOK_SECRET:
        logger.warning("HELIUS_WEBHOOK_SECRET not set — webhook signature verification disabled")
        return True
    if not header_sig:
        return False
    expected = hmac.new(
        HELIUS_WEBHOOK_SECRET.encode(),
        body,
        hashlib.sha256,
    ).hexdigest()
    return hmac.compare_digest(expected, header_sig)


@router.post("/helius")
async def helius_webhook(request: Request):
    """
    Receive real-time transaction events from Helius.
    On each new transaction:
    1. Verify HMAC-SHA256 signature from Helius
    2. Parse the enhanced transaction
    3. Deduplicate against existing cache
    4. Append to cached transactions
    5. Invalidate metrics cache (will be recomputed on next request)
    """
    body = await request.body()
    raw_sig = request.headers.get("authorization") or request.headers.get("x-helius-signature")

    if not _verify_helius_signature(body, raw_sig):
        logger.warning("Rejected webhook with invalid signature", extra={"ip": request.client.host if request.client else "unknown"})
        raise HTTPException(status_code=401, detail="Invalid webhook signature")

    try:
        body_json = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    # Helius sends an array of enhanced transactions
    if not isinstance(body_json, list):
        body_json = [body_json]

    processed = 0
    for raw_txn in body_json:
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

        # Deduplicate: merge with existing, keyed by signature
        existing = await cache_get(txn_cache_key(program_address)) or []
        existing_dict = {t["signature"]: t for t in existing}
        for txn in parsed:
            existing_dict[txn["signature"]] = txn  # overwrites if duplicate
        merged = list(existing_dict.values())

        await cache_set(txn_cache_key(program_address), merged, ttl_seconds=3600)
        await cache_invalidate(f"metrics:{program_address}")
        processed += 1

    return {"status": "processed", "count": processed}