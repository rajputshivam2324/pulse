"""
Transaction Parser for Pulse.
Normalizes Helius enhanced transactions into the Pulse schema.
"""

from datetime import datetime, timezone
from typing import Optional


def parse_transaction(raw_txn: dict, program_id: str) -> Optional[dict]:
    """
    Normalize Helius enhanced transaction into the Pulse schema.
    feePayer = the wallet interacting with the program.
    """
    try:
        wallet = raw_txn.get("feePayer") or raw_txn.get("source")
        if not wallet:
            return None

        ts = raw_txn.get("timestamp")
        if not ts:
            return None
        timestamp = datetime.fromtimestamp(ts, tz=timezone.utc)

        # SOL amount from native transfers to this wallet
        amount_sol = sum(
            t.get("amount", 0) / 1e9
            for t in raw_txn.get("nativeTransfers", [])
            if t.get("toUserAccount") == wallet
        )

        # Token transfer info
        token_transfers = raw_txn.get("tokenTransfers", [])
        amount_token = (
            float(token_transfers[0].get("tokenAmount", 0))
            if token_transfers
            else 0
        )
        token_mint = token_transfers[0].get("mint") if token_transfers else None

        return {
            "program_id": program_id,
            "signature": raw_txn["signature"],
            "wallet_address": wallet,
            "transaction_type": raw_txn.get("type", "UNKNOWN"),
            "timestamp": timestamp.isoformat(),
            "fee_lamports": raw_txn.get("fee", 0),
            "amount_sol": amount_sol,
            "amount_token": amount_token,
            "token_mint": token_mint,
        }
    except Exception:
        return None


def parse_transactions_batch(raw_txns: list[dict], program_id: str) -> list[dict]:
    """Parse a batch of raw transactions, filtering out any failures."""
    return [
        p
        for p in (parse_transaction(t, program_id) for t in raw_txns)
        if p is not None
    ]
