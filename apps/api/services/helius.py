"""
Helius API Client for Pulse.
Fetches enhanced transaction data for any Solana program address.
Network-aware: uses mainnet or devnet Helius endpoints.
Falls back to Solana RPC for devnet when Helius returns no data.

Also supports incremental sync via `after` cursor (signature-based).
"""

import asyncio
import httpx
import os
from typing import Optional

HELIUS_API_KEY = os.getenv("HELIUS_API_KEY")
SOLANA_NETWORK = os.getenv("SOLANA_NETWORK", "devnet")

# Network-aware Helius base URL
HELIUS_BASE = (
    "https://api-devnet.helius.xyz/v0"
    if SOLANA_NETWORK == "devnet"
    else "https://api.helius.xyz/v0"
)

# Solana RPC endpoints for fallback
SOLANA_RPC_URL = (
    "https://api.devnet.solana.com"
    if SOLANA_NETWORK == "devnet"
    else "https://api.mainnet-beta.solana.com"
)

# Batch size for RPC fallback requests
RPC_BATCH_SIZE = 20


async def get_transactions_for_address(
    address: str,
    before: Optional[str] = None,
    after: Optional[str] = None,
    limit: int = 100,
) -> list[dict]:
    """
    Helius Enhanced Transactions API.
    Returns human-readable parsed transactions — not raw bytes.
    Each transaction includes: signature, timestamp, type, feePayer,
    nativeTransfers, tokenTransfers, accountData, instructions.

    Use `after` for incremental sync (fetch transactions newer than a signature).
    Use `before` for historical pagination (older transactions).
    """
    url = f"{HELIUS_BASE}/addresses/{address}/transactions"
    params = {"api-key": HELIUS_API_KEY, "limit": limit}
    if before:
        params["before"] = before
    if after:
        params["after"] = after

    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.get(url, params=params)
        try:
            response.raise_for_status()
        except httpx.HTTPStatusError as e:
            if "Failed to find events within the search period" in e.response.text or "not found" in e.response.text.lower():
                return []
            raise
        return response.json()


async def get_all_transactions(
    address: str,
    max_pages: int = 10,
    after: Optional[str] = None,
) -> list[dict]:
    """
    Paginate through complete transaction history.
    First tries Helius Enhanced API, then falls back to Solana RPC for devnet.

    Use `after` for incremental sync — only fetches transactions newer than `after`.
    This avoids re-fetching everything already processed.
    """
    all_txns = []
    before = None

    for _ in range(max_pages):
        batch = await get_transactions_for_address(address, before=before, after=after)
        if not batch:
            break
        all_txns.extend(batch)
        before = batch[-1]["signature"]
        if len(batch) < 100:
            break
        after = None  # only use 'after' on first page

    # Fallback: if Helius returns nothing and we're on devnet, use Solana RPC
    if not all_txns and SOLANA_NETWORK == "devnet":
        all_txns = await _fallback_rpc_transactions(address, max_pages)

    return all_txns


async def _fetch_single_rpc_tx(
    client: httpx.AsyncClient,
    sig: str,
) -> Optional[dict]:
    """Fetch a single transaction from the Solana RPC."""
    try:
        response = await client.post(
            SOLANA_RPC_URL,
            json={
                "jsonrpc": "2.0",
                "id": 1,
                "method": "getTransaction",
                "params": [
                    sig,
                    {"encoding": "jsonParsed", "maxSupportedTransactionVersion": 0},
                ],
            },
        )
        tx_data = response.json().get("result")
        if not tx_data:
            return None
        return _rpc_to_enhanced(tx_data, {"signature": sig, "blockTime": tx_data.get("blockTime")})
    except Exception:
        return None


async def _fallback_rpc_transactions(address: str, max_pages: int = 10) -> list[dict]:
    """
    Fallback: fetch transactions via Solana RPC when Helius has no data.
    Uses getSignaturesForAddress + getTransaction to build enhanced-like objects.

    Batches getTransaction calls in groups of RPC_BATCH_SIZE for efficiency.
    """
    async with httpx.AsyncClient(timeout=60.0) as client:
        # Step 1: Get signatures
        sig_response = await client.post(
            SOLANA_RPC_URL,
            json={
                "jsonrpc": "2.0",
                "id": 1,
                "method": "getSignaturesForAddress",
                "params": [address, {"limit": min(max_pages * 100, 1000)}],
            },
        )
        sig_data = sig_response.json()
        signatures = [s for s in sig_data.get("result", []) if not s.get("err")]

        if not signatures:
            return []

        # Step 2: Batch RPC calls — process in groups of RPC_BATCH_SIZE
        results = []
        sig_list = [s["signature"] for s in signatures]

        for i in range(0, len(sig_list), RPC_BATCH_SIZE):
            batch_sigs = sig_list[i : i + RPC_BATCH_SIZE]
            # Fire all requests in the batch concurrently
            batch_results = await asyncio.gather(
                *[
                    _fetch_single_rpc_tx(client, sig)
                    for sig in batch_sigs
                ],
                return_exceptions=True,
            )
            for result in batch_results:
                if isinstance(result, dict):  # success
                    results.append(result)
                # Silently skip errors and exceptions — partial batch is fine

        return results


def _rpc_to_enhanced(tx_data: dict, sig_info: dict) -> Optional[dict]:
    """
    Convert Solana RPC getTransaction response into a Helius-like enhanced format
    so the rest of the pipeline (parser → metrics) works unchanged.
    """
    try:
        meta = tx_data.get("meta", {})
        transaction = tx_data.get("transaction", {})
        message = transaction.get("message", {})
        account_keys = message.get("accountKeys", [])

        # Fee payer is the first account key
        fee_payer = None
        if account_keys:
            if isinstance(account_keys[0], dict):
                fee_payer = account_keys[0].get("pubkey")
            else:
                fee_payer = account_keys[0]

        # Build native transfers from pre/post balances
        native_transfers = []
        pre_balances = meta.get("preBalances", [])
        post_balances = meta.get("postBalances", [])
        for i, (pre, post) in enumerate(zip(pre_balances, post_balances)):
            diff = post - pre
            if diff != 0 and i < len(account_keys):
                acct = account_keys[i]
                if isinstance(acct, dict):
                    acct = acct.get("pubkey", "")
                native_transfers.append({
                    "fromUserAccount": fee_payer if diff < 0 else "",
                    "toUserAccount": acct if diff > 0 else "",
                    "amount": abs(diff),
                })

        # Build token transfers from meta
        token_transfers = []
        for tt in meta.get("preTokenBalances", []):
            token_transfers.append({
                "mint": tt.get("mint", ""),
                "tokenAmount": tt.get("uiTokenAmount", {}).get("uiAmountString", "0"),
            })

        # Determine transaction type from instructions
        tx_type = "UNKNOWN"
        instructions = message.get("instructions", [])
        if instructions:
            first = instructions[0]
            if isinstance(first, dict):
                program = first.get("programId", "")
                parsed = first.get("parsed", {})
                if isinstance(parsed, dict):
                    tx_type = parsed.get("type", "UNKNOWN").upper()
                elif "11111111111111111111111111111111" in program:
                    tx_type = "TRANSFER"

        return {
            "signature": sig_info["signature"],
            "timestamp": sig_info.get("blockTime") or tx_data.get("blockTime", 0),
            "type": tx_type,
            "feePayer": fee_payer,
            "fee": meta.get("fee", 0),
            "nativeTransfers": native_transfers,
            "tokenTransfers": token_transfers,
            "accountData": [],
        }
    except Exception:
        return None


async def register_webhook(program_address: str, webhook_url: str) -> dict:
    """
    Register Helius webhook for real-time transaction events.
    Helius will POST to webhook_url on every new transaction for this address.
    """
    url = f"{HELIUS_BASE}/webhooks"
    payload = {
        "webhookURL": webhook_url,
        "transactionTypes": ["ANY"],
        "accountAddresses": [program_address],
        "webhookType": "enhanced",
    }
    async with httpx.AsyncClient() as client:
        response = await client.post(
            url, json=payload, params={"api-key": HELIUS_API_KEY}
        )
        response.raise_for_status()
        return response.json()