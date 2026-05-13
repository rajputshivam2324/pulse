"""
Webhooks Router for Pulse.
Receives real-time transaction events from Helius webhooks.
Signature verification ensures only Helius can push events.
"""

import os
import hmac
import hashlib
import logging
from collections import defaultdict

from fastapi import APIRouter, HTTPException, Request

from services.parser import parse_transactions_batch
from services.cache import cache_invalidate
from services.supabase import get_supabase, sb_execute

router = APIRouter(prefix="/webhooks", tags=["webhooks"])
logger = logging.getLogger(__name__)

HELIUS_WEBHOOK_SECRET = os.getenv("HELIUS_WEBHOOK_SECRET", "")
WEBHOOK_UPSERT_CHUNK = int(os.getenv("WEBHOOK_UPSERT_CHUNK", "400"))
PROGRAM_IN_LOOKUP_CHUNK = int(os.getenv("WEBHOOK_PROGRAM_LOOKUP_CHUNK", "100"))


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


def _extract_program_address(raw_txn: dict) -> str | None:
    instructions = raw_txn.get("instructions", [])
    for instruction in instructions:
        prog_id = instruction.get("programId")
        if prog_id:
            return prog_id
    account_data = raw_txn.get("accountData", [])
    for account in account_data:
        if account.get("nativeBalanceChange", 0) != 0:
            return account.get("account")
    return None


@router.post("/helius")
async def helius_webhook(request: Request):
    """
    Receive real-time transaction events from Helius.
    Groups payloads by program, resolves program IDs in one query, and
    batch-upserts transactions (avoids N+1 round trips per webhook item).
    """
    body = await request.body()
    raw_sig = request.headers.get("authorization") or request.headers.get("x-helius-signature")

    if not _verify_helius_signature(body, raw_sig):
        logger.warning(
            "Rejected webhook with invalid signature",
            extra={"ip": request.client.host if request.client else "unknown"},
        )
        raise HTTPException(status_code=401, detail="Invalid webhook signature")

    try:
        import json as _json

        body_json = _json.loads(body)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    if not isinstance(body_json, list):
        body_json = [body_json]

    by_address: dict[str, list[dict]] = defaultdict(list)
    for raw_txn in body_json:
        program_address = _extract_program_address(raw_txn)
        if program_address:
            by_address[program_address].append(raw_txn)

    if not by_address:
        return {"status": "processed", "count": 0}

    supabase = get_supabase()
    addrs = list(by_address.keys())
    id_by_addr: dict[str, str] = {}
    try:
        for i in range(0, len(addrs), PROGRAM_IN_LOOKUP_CHUNK):
            chunk = addrs[i : i + PROGRAM_IN_LOOKUP_CHUNK]
            prog_res = await sb_execute(
                supabase.table("programs").select("id, program_address").in_("program_address", chunk)
            )
            for r in prog_res.data or []:
                pa = r.get("program_address")
                pid = r.get("id")
                if pa and pid:
                    id_by_addr[pa] = pid
    except Exception as e:
        logger.error("Failed to resolve programs for webhook batch: %s", str(e))
        raise HTTPException(status_code=500, detail="Failed to resolve programs") from e

    processed = 0
    for addr, raw_list in by_address.items():
        db_pid = id_by_addr.get(addr)
        if not db_pid:
            continue

        all_parsed = parse_transactions_batch(raw_list, program_id=addr)
        if not all_parsed:
            continue

        rows = [
            {
                "program_id": db_pid,
                "signature": t["signature"],
                "wallet_address": t["wallet_address"],
                "transaction_type": t.get("transaction_type", "UNKNOWN"),
                "timestamp": t.get("timestamp"),
                "amount_sol": t.get("amount_sol"),
                "token_mint": t.get("token_mint"),
            }
            for t in all_parsed
            if t.get("signature")
        ]
        if not rows:
            continue

        try:
            for i in range(0, len(rows), WEBHOOK_UPSERT_CHUNK):
                chunk = rows[i : i + WEBHOOK_UPSERT_CHUNK]
                await sb_execute(
                    supabase.table("transactions").upsert(chunk, on_conflict="signature")
                )
            await cache_invalidate(f"metrics:{addr}")
            processed += len(rows)
        except Exception as e:
            logger.error("Failed to save webhook transactions: %s", str(e), extra={"address": addr})
            continue

    return {"status": "processed", "count": processed}
