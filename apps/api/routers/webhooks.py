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
from services.cache import cache_invalidate
from services.supabase import get_supabase

router = APIRouter(prefix="/webhooks", tags=["webhooks"])
logger = logging.getLogger(__name__)

HELIUS_WEBHOOK_SECRET = os.getenv("HELIUS_WEBHOOK_SECRET", "")


def _verify_helius_signature(body: bytes, header_sig: str | None) -> bool:
    """
    Verify Helius webhook HMAC-SHA256 signature.
    Helius sends the signature in the 'authorization' header as a hex digest.
    """
    if not HELIUS_WEBHOOK_SECRET:
        logger.error("HELIUS_WEBHOOK_SECRET not set — rejecting all webhook requests")
        return False
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

    # Parse JSON from the already-consumed body bytes (request.json() would fail here
    # because the body stream is already exhausted after request.body())
    try:
        import json as _json
        body_json = _json.loads(body)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    # Helius sends an array of enhanced transactions
    if not isinstance(body_json, list):
        body_json = [body_json]

    processed = 0
    for raw_txn in body_json:
        # Extract program address from instructions (more reliable than balance changes)
        instructions = raw_txn.get("instructions", [])
        program_address = None
        for instruction in instructions:
            prog_id = instruction.get("programId")
            if prog_id:
                program_address = prog_id
                break

        # Fallback to accountData if no instructions found
        if not program_address:
            account_data = raw_txn.get("accountData", [])
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

        # Resolve program_id from Supabase
        supabase = get_supabase()
        try:
            prog_res = supabase.table("programs").select("id").eq("program_address", program_address).execute()
            if not prog_res.data:
                continue
            
            db_program_id = prog_res.data[0]["id"]
            
            rows_to_insert = [
                {
                    "program_id": db_program_id,
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
        except Exception as e:
            logger.error(f"Failed to save webhook transactions: {e}")
            continue

        await cache_invalidate(f"metrics:{program_address}")
        processed += 1

    return {"status": "processed", "count": processed}