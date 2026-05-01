"""
Insights Router for Pulse.
Exposes the LangGraph insight pipeline as API endpoints.
All endpoints require JWT authentication.
"""

import logging
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from services.rate_limit import limiter
from services.auth import require_auth
from services.ai.graph import insight_pipeline
from services.ai.state import InsightPipelineState
from services.cache import cache_get, cache_set, metrics_cache_key, insights_cache_key
from services.validators import is_valid_solana_address
from services.supabase import get_supabase

router = APIRouter(prefix="/insights", tags=["insights"])
logger = logging.getLogger(__name__)

# Plan-gated features
AI_INIGHTS_PLANS = {"team", "protocol"}


async def _check_plan_feature(wallet: str, feature: str) -> bool:
    """Look up the user's plan from Supabase and check feature access."""
    try:
        supabase = get_supabase()
        result = supabase.table("users").select("plan").eq("wallet_pubkey", wallet).execute()
        if not result.data:
            return False
        plan = result.data[0].get("plan", "free")
        return plan in AI_INIGHTS_PLANS
    except Exception:
        logger.warning("Plan check failed, defaulting to deny", extra={"wallet": wallet})
        return False


@router.post("/generate/{program_id}")
@limiter.limit("5/hour")
async def generate_insights(
    request: Request,
    program_id: str,
    wallet: str = Depends(require_auth),
    program_name: str = Query(None),
):
    """
    Run the full LangGraph insight pipeline for a program.
    Requires metrics to be computed first (/analytics/sync).

    Pipeline: anomaly_detector → ranker → [insight_gen, retention, scorer] → quick_wins → assembler

    Access: Team and Protocol plans only.
    """
    if not is_valid_solana_address(program_id):
        raise HTTPException(status_code=400, detail="Invalid Solana address format")

    # Ownership check
    supabase = get_supabase()
    user_row = (
        supabase.table("users")
        .select("id")
        .eq("wallet_pubkey", wallet)
        .single()
        .execute()
    )
    if not user_row.data:
        raise HTTPException(status_code=401, detail="User not found.")

    program_row = (
        supabase.table("programs")
        .select("id, user_id")
        .eq("program_address", program_id)
        .eq("user_id", user_row.data["id"])
        .execute()
    )
    if not program_row.data:
        raise HTTPException(status_code=403, detail="You do not own this program.")

    # Server-side plan check
    has_access = await _check_plan_feature(wallet, "ai_insights")
    if not has_access:
        raise HTTPException(
            status_code=403,
            detail="AI Insights require a Team or Protocol plan. Upgrade at /settings.",
        )

    metrics = await cache_get(metrics_cache_key(program_id))
    if not metrics:
        raise HTTPException(
            status_code=404,
            detail="No metrics found. Run /analytics/sync/{address} first.",
        )

    initial_state: InsightPipelineState = {
        "metrics_payload": metrics,
        "program_name": program_name,
        "anomalies": [],
        "ranked_anomalies": [],
        "raw_insights": [],
        "retention_diagnosis": {},
        "quick_wins": [],
        "health_score": 50,
        "headline": "",
        "biggest_problem": "",
        "final_insights": [],
        "execution_trace": [],
    }

    try:
        result = await insight_pipeline.ainvoke(initial_state)
    except Exception as e:
        logger.error("Insight pipeline failed", extra={"error": str(e), "program_id": program_id})
        raise HTTPException(
            status_code=500,
            detail="Insight pipeline failed due to an internal error. Please try again.",
        )

    output = {
        "headline": result["headline"],
        "biggest_problem": result["biggest_problem"],
        "health_score": result["health_score"],
        "insights": result["final_insights"],
        "retention_diagnosis": result["retention_diagnosis"],
        "quick_wins": result["quick_wins"],
        "execution_trace": result["execution_trace"],
    }

    # Cache for 6 hours
    await cache_set(
        insights_cache_key(program_id), output, ttl_seconds=21600
    )

    return output


@router.get("/{program_id}")
async def get_insights(program_id: str, wallet: str = Depends(require_auth)):
    """Get cached insights for a program."""
    if not is_valid_solana_address(program_id):
        raise HTTPException(status_code=400, detail="Invalid Solana address format")

    # Ownership check
    supabase = get_supabase()
    user_row = (
        supabase.table("users")
        .select("id")
        .eq("wallet_pubkey", wallet)
        .single()
        .execute()
    )
    if not user_row.data:
        raise HTTPException(status_code=401, detail="User not found.")

    program_row = (
        supabase.table("programs")
        .select("id, user_id")
        .eq("program_address", program_id)
        .eq("user_id", user_row.data["id"])
        .execute()
    )
    if not program_row.data:
        raise HTTPException(status_code=403, detail="You do not own this program.")

    insights = await cache_get(insights_cache_key(program_id))
    if not insights:
        raise HTTPException(
            status_code=404,
            detail="No insights found. Run /insights/generate/{program_id} first.",
        )
    return insights