"""
User & Billing Router for Pulse.
Provides the /user/me endpoint (plan lookup from DB) and
/billing/upgrade endpoint (server-side plan activation after on-chain payment).
"""

import os
import logging
from fastapi import APIRouter, Depends, HTTPException, Request
from services.auth import require_auth
from services.supabase import get_supabase
from services.rate_limit import limiter
from services.helius import verify_payment_transaction

router = APIRouter(tags=["user"])
logger = logging.getLogger(__name__)


@router.get("/user/me")
async def get_me(wallet: str = Depends(require_auth)):
    """
    Return the authenticated user's profile from Supabase.
    Always reads plan from the database — not from the JWT — so the client
    always sees the live subscription state.
    """
    try:
        from services.auth import resolve_wallet_to_user_id
        supabase = get_supabase()
        
        user_id = resolve_wallet_to_user_id(wallet)
        
        if not user_id:
            # Auto-create user row on first access
            insert = (
                supabase.table("users")
                .upsert({"wallet_pubkey": wallet, "plan": "free"}, on_conflict="wallet_pubkey")
                .select("id, wallet_pubkey, plan, plan_expires_at, created_at")
                .single()
                .execute()
            )
            user = insert.data or {"id": None, "wallet_pubkey": wallet, "plan": "free"}
        else:
            result = (
                supabase.table("users")
                .select("id, wallet_pubkey, plan, plan_expires_at, created_at")
                .eq("id", user_id)
                .single()
                .execute()
            )
            user = result.data

        # Count programs and total transactions for usage meters
        programs_result = (
            supabase.table("programs")
            .select("id, name, program_address, last_synced_at, network")
            .eq("user_id", user["id"])
            .execute()
        )
        programs = programs_result.data or []

        total_txns = 0
        if programs:
            program_ids = [p["id"] for p in programs]
            for pid in program_ids:
                try:
                    txn_count = (
                        supabase.table("transactions")
                        .select("id", count="exact")
                        .eq("program_id", pid)
                        .execute()
                    )
                    total_txns += txn_count.count or 0
                except Exception:
                    pass

        # Fetch payment history
        payments_result = (
            supabase.table("payments")
            .select("plan, amount_usdc, paid_at, tx_signature")
            .eq("user_id", user["id"])
            .order("paid_at", desc=True)
            .limit(5)
            .execute()
        )

        # Fetch linked wallets
        linked_wallets_res = (
            supabase.table("linked_wallets")
            .select("wallet_pubkey, created_at")
            .eq("user_id", user["id"])
            .order("created_at", desc=False)
            .execute()
        )
        linked_wallets = [w["wallet_pubkey"] for w in (linked_wallets_res.data or [])]

        return {
            "wallet_pubkey": user["wallet_pubkey"],
            "linked_wallets": linked_wallets,
            "plan": user["plan"],
            "plan_expires_at": user.get("plan_expires_at"),
            "member_since": user.get("created_at"),
            "usage": {
                "programs_registered": len(programs),
                "total_transactions_indexed": total_txns,
            },
            "programs": programs,
            "payment_history": payments_result.data or [],
        }

    except Exception as e:
        logger.error("Failed to fetch user profile", extra={"error": str(e), "wallet": wallet})
        raise HTTPException(status_code=500, detail="Failed to fetch user profile")


@router.post("/billing/upgrade")
@limiter.limit("10/hour")
async def upgrade_plan(
    request: Request,
    wallet: str = Depends(require_auth),
):
    """
    Record a successful on-chain payment and upgrade the user's plan.

    Body: { plan: 'team' | 'protocol', tx_signature: str, amount_usdc: float }

    In production this should verify the on-chain transaction before upgrading.
    For demo mode (DEMO_BILLING=true), it upgrades immediately on signature submission.
    """
    DEMO_BILLING = os.getenv("DEMO_BILLING", "true").lower() == "true"
    VALID_PLANS = {"team", "protocol"}

    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    plan = body.get("plan")
    tx_signature = body.get("tx_signature", "demo")
    amount_usdc = body.get("amount_usdc", 0)

    if plan not in VALID_PLANS:
        raise HTTPException(status_code=400, detail=f"Invalid plan. Must be one of: {VALID_PLANS}")
    if not tx_signature:
        raise HTTPException(status_code=400, detail="tx_signature is required")

    try:
        supabase = get_supabase()

        from services.auth import resolve_wallet_to_user_id
        user_id = resolve_wallet_to_user_id(wallet)
        
        if not user_id:
            raise HTTPException(status_code=404, detail="User not found")

        if not DEMO_BILLING:
            # PRODUCTION: Verify tx_signature on-chain before upgrading
            is_valid = await verify_payment_transaction(tx_signature, wallet, amount_usdc)
            if not is_valid:
                raise HTTPException(status_code=400, detail="Payment verification failed: invalid signature, amount, or recipient")

        # Record payment
        try:
            supabase.table("payments").insert({
                "user_id": user_id,
                "tx_signature": tx_signature,
                "amount_usdc": amount_usdc,
                "plan": plan,
            }).execute()
        except Exception as pay_err:
            # Duplicate signature = already processed — non-fatal
            logger.warning("Payment insert skipped (possible duplicate)", extra={"error": str(pay_err)})

        # Upgrade the plan
        supabase.table("users").update({"plan": plan}).eq("id", user_id).execute()
        logger.info("Plan upgraded", extra={"wallet": wallet, "plan": plan})

        return {"status": "upgraded", "plan": plan, "wallet": wallet}

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Billing upgrade failed", extra={"error": str(e), "wallet": wallet})
        raise HTTPException(status_code=500, detail="Billing upgrade failed")


@router.post("/billing/downgrade")
async def downgrade_to_free(wallet: str = Depends(require_auth)):
    """Downgrade the authenticated user to the free plan."""
    try:
        from services.auth import resolve_wallet_to_user_id
        user_id = resolve_wallet_to_user_id(wallet)
        if not user_id:
             raise HTTPException(status_code=404, detail="User not found")
        
        supabase = get_supabase()
        supabase.table("users").update({"plan": "free"}).eq("id", user_id).execute()
        return {"status": "downgraded", "plan": "free"}
    except Exception as e:
        logger.error("Downgrade failed", extra={"error": str(e)})
        raise HTTPException(status_code=500, detail="Downgrade failed")
