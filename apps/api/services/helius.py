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
import logging
from typing import Optional
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception

logger = logging.getLogger(__name__)

HELIUS_API_KEY = os.getenv("HELIUS_API_KEY")
SOLANA_NETWORK = os.getenv("SOLANA_NETWORK", "devnet")
TREASURY_WALLET_ADDRESS = os.getenv("TREASURY_WALLET_ADDRESS", "")

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

# API / RPC pagination sizes
HELIUS_PAGE_SIZE = 100
RPC_SIGNATURE_PAGE_SIZE = 100

# Parallel in-flight limit for RPC fallback getTransaction (avoid hammering public RPC)
RPC_TX_CONCURRENCY = int(os.getenv("RPC_TX_CONCURRENCY", "48"))

# Pause between Helius pagination calls to reduce 429 bursts (sync worker).
HELIUS_PAGE_DELAY_SEC = float(os.getenv("HELIUS_PAGE_DELAY_SEC", "0.25"))


def _helius_retryable(exc: BaseException) -> bool:
    """Helius often returns 429 under burst pagination; also retry transient 5xx."""
    if isinstance(exc, (httpx.TimeoutException, httpx.ConnectError, httpx.NetworkError)):
        return True
    if isinstance(exc, httpx.HTTPStatusError):
        return exc.response.status_code in (429, 502, 503, 504)
    return False


async def get_transactions_for_address(
    address: str,
    before: Optional[str] = None,
    after: Optional[str] = None,
    limit: int = 100,
    client: Optional[httpx.AsyncClient] = None,
) -> list[dict]:
    """
    Helius Enhanced Transactions API.
    Returns human-readable parsed transactions — not raw bytes.
    Each transaction includes: signature, timestamp, type, feePayer,
    nativeTransfers, tokenTransfers, accountData, instructions.

    Use `after` for incremental sync (fetch transactions newer than a signature).
    Use `before` for historical pagination (older transactions).

    Pass a shared ``client`` from ``get_all_transactions`` to avoid opening a
    new TLS connection for every page.
    """
    url = f"{HELIUS_BASE}/addresses/{address}/transactions"
    params = {"api-key": HELIUS_API_KEY, "limit": limit}
    if before:
        params["before"] = before
    if after:
        params["after"] = after

    own_client = client is None
    if own_client:
        client = httpx.AsyncClient(timeout=30.0)

    @retry(
        stop=stop_after_attempt(6),
        wait=wait_exponential(multiplier=1, min=2, max=90),
        retry=retry_if_exception(_helius_retryable),
        reraise=True,
    )
    async def _fetch_with_retry():
        assert client is not None
        response = await client.get(url, params=params)
        try:
            response.raise_for_status()
        except httpx.HTTPStatusError as e:
            if "Failed to find events within the search period" in e.response.text or "not found" in e.response.text.lower():
                return []
            raise
        return response.json()

    try:
        return await _fetch_with_retry()
    except httpx.TimeoutException as e:
        logger.error(f"Helius API timeout after 3 retries for address {address}")
        raise
    finally:
        if own_client and client is not None:
            await client.aclose()


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
    seen_signatures = set()
    before = None

    async with httpx.AsyncClient(timeout=30.0) as client:
        for page_idx in range(max_pages):
            if page_idx > 0 and HELIUS_PAGE_DELAY_SEC > 0:
                await asyncio.sleep(HELIUS_PAGE_DELAY_SEC)
            batch = await get_transactions_for_address(
                address,
                before=before,
                after=after,
                limit=HELIUS_PAGE_SIZE,
                client=client,
            )
            if not batch:
                break

            new_batch = []
            for txn in batch:
                signature = txn.get("signature")
                if signature and signature not in seen_signatures:
                    seen_signatures.add(signature)
                    new_batch.append(txn)

            if not new_batch:
                break

            all_txns.extend(new_batch)
            last_sig = batch[-1].get("signature")
            if not last_sig:
                break
            before = last_sig
            if len(batch) < HELIUS_PAGE_SIZE:
                break

    # Fallback: if Helius returns nothing and we're on devnet, use Solana RPC
    if not all_txns and SOLANA_NETWORK == "devnet":
        all_txns = await _fallback_rpc_transactions(address, max_pages, after=after)

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


async def _fallback_rpc_transactions(
    address: str,
    max_pages: int = 10,
    after: Optional[str] = None,
) -> list[dict]:
    """
    Fallback: fetch transactions via Solana RPC when Helius has no data.
    Uses getSignaturesForAddress + getTransaction to build enhanced-like objects.

    All getTransaction calls run concurrently up to RPC_TX_CONCURRENCY in flight.
    """
    async with httpx.AsyncClient(timeout=60.0) as client:
        # Step 1: Get signatures, paging with `before` and preserving the
        # incremental cursor with `until` when `after` is supplied.
        signatures = []
        before = None
        seen_signatures = set()

        for _ in range(max_pages):
            options = {"limit": RPC_SIGNATURE_PAGE_SIZE}
            if before:
                options["before"] = before
            if after:
                options["until"] = after

            sig_response = await client.post(
                SOLANA_RPC_URL,
                json={
                    "jsonrpc": "2.0",
                    "id": 1,
                    "method": "getSignaturesForAddress",
                    "params": [address, options],
                },
            )
            sig_data = sig_response.json()
            page = [s for s in sig_data.get("result", []) if not s.get("err")]
            if not page:
                break

            new_page = []
            for sig_info in page:
                signature = sig_info.get("signature")
                if signature and signature not in seen_signatures:
                    seen_signatures.add(signature)
                    new_page.append(sig_info)

            if not new_page:
                break

            signatures.extend(new_page)
            before = page[-1]["signature"]
            if len(page) < RPC_SIGNATURE_PAGE_SIZE:
                break

        if not signatures:
            return []

        # Step 2: getTransaction for each signature — bounded parallel concurrency
        sig_list = [s["signature"] for s in signatures]
        sem = asyncio.Semaphore(RPC_TX_CONCURRENCY)

        async def _bounded_fetch(sig: str):
            async with sem:
                return await _fetch_single_rpc_tx(client, sig)

        batch_results = await asyncio.gather(
            *(_bounded_fetch(sig) for sig in sig_list),
            return_exceptions=True,
        )
        results = []
        for result in batch_results:
            if isinstance(result, dict):
                results.append(result)

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

async def verify_payment_transaction(signature: str, expected_wallet: str, expected_amount: float) -> bool:
    """
    Verify a payment transaction from Helius Enhanced API.
    Checks that the tx transfers at least expected_amount of USDC from expected_wallet to TREASURY_WALLET_ADDRESS.
    """
    if not TREASURY_WALLET_ADDRESS:
        logger.warning("TREASURY_WALLET_ADDRESS not set, skipping verification")
        return True # In dev, if treasury is missing, pass verification

    url = f"{HELIUS_BASE}/transactions"
    params = {"api-key": HELIUS_API_KEY}
    payload = {"transactions": [signature]}
    
    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=5),
        retry=retry_if_exception_type((httpx.TimeoutException, httpx.ConnectError)),
        reraise=True,
    )
    async def _verify_with_retry():
        async with httpx.AsyncClient(timeout=10.0) as client:
            try:
                response = await client.post(url, params=params, json=payload)
                response.raise_for_status()
                data = response.json()
                if not data or not isinstance(data, list) or len(data) == 0:
                    return False
                
                tx = data[0]
                # Check for USDC mints (Mainnet or Devnet)
                USDC_MINTS = {
                    "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", # Mainnet
                    "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU"  # Devnet
                }
                
                for transfer in tx.get("tokenTransfers", []):
                    mint = transfer.get("mint")
                    if mint in USDC_MINTS:
                        from_user = transfer.get("fromUserAccount", "")
                        to_user = transfer.get("toUserAccount", "")
                        amount = transfer.get("tokenAmount", 0)
                        
                        if from_user == expected_wallet and to_user == TREASURY_WALLET_ADDRESS and float(amount) >= expected_amount:
                            return True
                            
                return False
            except Exception as e:
                logger.error("Failed to verify payment transaction", extra={"signature": signature, "error": str(e)})
                return False
    
    try:
        return await _verify_with_retry()
    except httpx.TimeoutException:
        logger.error("Helius payment verification timeout", extra={"signature": signature})
        return False
