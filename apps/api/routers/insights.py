"""
Insights Router for Pulse.
Exposes the LangGraph insight pipeline as API endpoints.
All endpoints require JWT authentication.
"""

import asyncio
import logging
import os
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from services.rate_limit import limiter
from services.auth import require_auth, resolve_wallet_to_user_id
from services.ai.graph import insight_pipeline
from services.ai.state import InsightPipelineState
from services.cache import cache_get, cache_set, metrics_cache_key, insights_cache_key
from services.validators import is_valid_solana_address
from services.supabase import get_supabase
import json
import uuid

router = APIRouter(prefix="/insights", tags=["insights"])
logger = logging.getLogger(__name__)

# Plan-gated features
AI_INIGHTS_PLANS = {"team", "protocol"}
INSIGHT_PIPELINE_TIMEOUT_SECONDS = float(os.getenv("INSIGHT_PIPELINE_TIMEOUT_SECONDS", "25"))


async def _check_plan_feature(wallet: str, feature: str) -> bool:
    """Look up the user's plan from Supabase and check feature access.
    Resolves linked wallets to their primary user before checking plan."""
    try:
        supabase = get_supabase()
        user_id = resolve_wallet_to_user_id(wallet)
        if not user_id:
            return False
        result = supabase.table("users").select("plan").eq("id", user_id).execute()
        if not result.data:
            return False
        plan = result.data[0].get("plan", "free")
        return plan in AI_INIGHTS_PLANS
    except Exception:
        logger.warning("Plan check failed, defaulting to deny", extra={"wallet": wallet})
        return False


def _num(value, fallback=0):
    try:
        return float(value)
    except (TypeError, ValueError):
        return fallback


def _health_score_from_metrics(summary: dict) -> int:
    score = 50
    d7 = _num(summary.get("d7_retention_rate"))
    d30 = _num(summary.get("d30_retention_rate"))
    worst_drop = _num(summary.get("worst_funnel_drop_rate"), 100)

    if d7 >= 30:
        score += 20
    elif d7 >= 20:
        score += 12
    elif d7 >= 10:
        score += 5
    else:
        score -= 10

    if d30 >= 15:
        score += 15
    elif d30 >= 8:
        score += 8
    else:
        score -= 5

    if worst_drop < 30:
        score += 15
    elif worst_drop < 50:
        score += 8
    elif worst_drop > 70:
        score -= 10

    return max(0, min(100, round(score)))


def _severity(rate: float, critical_below: float, high_below: float) -> str:
    if rate < critical_below:
        return "critical"
    if rate < high_below:
        return "high"
    return "medium"


def _fallback_insights(metrics: dict, program_name: str | None) -> dict:
    """Fast deterministic report when LLM is slow or unavailable."""
    summary = metrics.get("summary", {}) if isinstance(metrics, dict) else {}
    total_wallets = round(_num(summary.get("total_wallets")))
    d7 = _num(summary.get("d7_retention_rate"))
    d30 = _num(summary.get("d30_retention_rate"))
    worst_step = summary.get("worst_funnel_step") or "unknown"
    worst_drop = _num(summary.get("worst_funnel_drop_rate"))
    worst_type = (
        summary.get("worst_first_type_for_retention")
        or summary.get("highest_churn_transaction_type")
        or "the weakest first action"
    )
    worst_return = _num(summary.get("worst_first_type_return_rate"))
    best_type = summary.get("best_first_type_for_retention") or "the strongest first action"
    best_return = _num(summary.get("best_first_type_return_rate"))
    one_and_done = max(0, round(total_wallets * (1 - d7 / 100)))
    score = _health_score_from_metrics(summary)

    insights = [
        {
            "id": "fast_retention",
            "finding": f"D7 retention is {d7:g}% and D30 retention is {d30:g}%",
            "why_it_matters": f"About {one_and_done:,} wallets are not becoming repeat users after first contact.",
            "severity": _severity(d7, 15, 25),
            "recommendation": f"Add a return prompt or reward after the first {worst_type} interaction.",
            "metric_reference": "retention",
        },
        {
            "id": "fast_funnel",
            "finding": f"Step {worst_step} has {worst_drop:g}% funnel drop-off",
            "why_it_matters": "This is the clearest conversion break between initial use and repeat behavior.",
            "severity": "critical" if worst_drop >= 70 else "high" if worst_drop >= 50 else "medium",
            "recommendation": f"Instrument step {worst_step}, remove one required action, and test a next-step CTA.",
            "metric_reference": "funnel",
        },
        {
            "id": "fast_type_retention",
            "finding": f"{best_type} retains at {best_return:g}% while {worst_type} retains at {worst_return:g}%",
            "why_it_matters": "Your highest-retention action shows what motivated users understand that churned users miss.",
            "severity": "high",
            "recommendation": f"Move the {best_type} value cue earlier and add education before {worst_type}.",
            "metric_reference": "per_type_retention",
        },
    ]

    output = {
        "headline": f"{program_name or 'Your program'} has {d7:g}% D7 retention and {worst_drop:g}% worst-step drop-off",
        "biggest_problem": insights[0]["finding"],
        "health_score": score,
        "insights": insights,
        "retention_diagnosis": {
            "d7_assessment": f"D7 retention is {d7:g}%, below the 25% Solana DeFi benchmark." if d7 < 25 else f"D7 retention is {d7:g}%, above benchmark.",
            "d30_assessment": f"D30 retention is {d30:g}%, benchmark is 10%.",
            "main_churn_trigger": f"{worst_type} is the weakest first action with {worst_return:g}% return rate.",
            "power_user_signal": f"{best_type} has the strongest first-action return rate at {best_return:g}%.",
            "retention_grade": "A" if score >= 80 else "B" if score >= 65 else "C" if score >= 50 else "D" if score >= 35 else "F",
        },
        "quick_wins": [
            f"Add a return CTA after first {worst_type}",
            f"Fix step {worst_step} before optimizing later funnel steps",
            f"Reuse {best_type} messaging in onboarding",
        ],
        "execution_trace": [
            f"fast_fallback: generated from metrics after {INSIGHT_PIPELINE_TIMEOUT_SECONDS:g}s AI timeout",
        ],
        "is_fallback": True,
    }

    from services.ai.followup import fallback_suggestions
    output["suggested_questions"] = fallback_suggestions(metrics, output)
    return output


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

    # Ownership check — resolve linked wallets to primary user
    supabase = get_supabase()
    user_id = resolve_wallet_to_user_id(wallet)
    if not user_id:
        raise HTTPException(status_code=401, detail="User not found.")

    program_row = (
        supabase.table("programs")
        .select("id, user_id")
        .eq("program_address", program_id)
        .eq("user_id", user_id)
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
        result = await asyncio.wait_for(
            insight_pipeline.ainvoke(initial_state),
            timeout=INSIGHT_PIPELINE_TIMEOUT_SECONDS,
        )
    except asyncio.TimeoutError:
        logger.warning(
            "Insight pipeline timed out; using fast fallback",
            extra={"program_id": program_id, "timeout": INSIGHT_PIPELINE_TIMEOUT_SECONDS},
        )
        output = _fallback_insights(metrics, program_name)
        await cache_set(insights_cache_key(program_id), output, ttl_seconds=900)
        return output
    except Exception as e:
        import traceback
        logger.error(
            "Insight pipeline failed: %s\n%s",
            str(e),
            traceback.format_exc(),
            extra={"program_id": program_id},
        )
        output = _fallback_insights(metrics, program_name)
        await cache_set(insights_cache_key(program_id), output, ttl_seconds=900)
        return output

    output = {
        "headline": result["headline"],
        "biggest_problem": result["biggest_problem"],
        "health_score": result["health_score"],
        "insights": result["final_insights"],
        "retention_diagnosis": result["retention_diagnosis"],
        "quick_wins": result["quick_wins"],
        "execution_trace": result["execution_trace"],
    }

    from services.ai.followup import fallback_suggestions
    output["suggested_questions"] = fallback_suggestions(metrics, output)

    # Cache for 6 hours
    await cache_set(
        insights_cache_key(program_id), output, ttl_seconds=21600
    )

    # ── Persist insight report for history ──
    try:
        program_db_id = program_row.data[0]["id"]
        supabase.table("insight_reports").insert({
            "program_id": program_db_id,
            "health_score": output.get("health_score"),
            "headline": output.get("headline"),
            "full_json": output,
        }).execute()

        # Prune: keep max 10 reports per program, delete the rest.
        # IMPORTANT: never fetch all rows (can grow unbounded and slow down requests).
        old_reports = (
            supabase.table("insight_reports")
            .select("id")
            .eq("program_id", program_db_id)
            .order("generated_at", desc=True)
            .range(10, 60)  # delete up to 51 old rows per request; avoids unbounded select
            .execute()
        )
        if old_reports.data:
            old_ids = [r.get("id") for r in old_reports.data if r.get("id")]
            if old_ids:
                # Batch delete (Supabase supports `in` filter)
                supabase.table("insight_reports").delete().in_("id", old_ids).execute()
    except Exception as e:
        logger.warning("Failed to persist insight report: %s", str(e))

    return output


@router.get("/{program_id}")
async def get_insights(program_id: str, wallet: str = Depends(require_auth)):
    """Get cached insights for a program."""
    if not is_valid_solana_address(program_id):
        raise HTTPException(status_code=400, detail="Invalid Solana address format")

    # Ownership check — resolve linked wallets to primary user
    supabase = get_supabase()
    user_id = resolve_wallet_to_user_id(wallet)
    if not user_id:
        raise HTTPException(status_code=401, detail="User not found.")

    program_row = (
        supabase.table("programs")
        .select("id, user_id")
        .eq("program_address", program_id)
        .eq("user_id", user_id)
        .execute()
    )
    if not program_row.data:
        raise HTTPException(status_code=403, detail="You do not own this program.")

    # Plan gate — same requirement as /generate
    has_access = await _check_plan_feature(wallet, "ai_insights")
    if not has_access:
        raise HTTPException(
            status_code=403,
            detail="AI Insights require a Team or Protocol plan. Upgrade at /settings.",
        )

    insights = await cache_get(insights_cache_key(program_id))
    if not insights:
        raise HTTPException(
            status_code=404,
            detail="No insights found. Run /insights/generate/{program_id} first.",
        )
    return insights


@router.get("/history/{program_id}")
async def get_insight_history(
    program_id: str,
    wallet: str = Depends(require_auth),
):
    """Get previous insight report summaries for trend comparison."""
    if not is_valid_solana_address(program_id):
        raise HTTPException(status_code=400, detail="Invalid Solana address format")

    supabase = get_supabase()
    user_id = resolve_wallet_to_user_id(wallet)
    if not user_id:
        raise HTTPException(status_code=401, detail="User not found.")

    program_row = (
        supabase.table("programs")
        .select("id, user_id")
        .eq("program_address", program_id)
        .eq("user_id", user_id)
        .execute()
    )
    if not program_row.data:
        raise HTTPException(status_code=403, detail="You do not own this program.")

    try:
        result = (
            supabase.table("insight_reports")
            .select("id, generated_at, health_score, headline")
            .eq("program_id", program_row.data[0]["id"])
            .order("generated_at", desc=True)
            .limit(10)
            .execute()
        )
        return {"reports": result.data or []}
    except Exception as e:
        logger.warning("Failed to fetch insight history: %s", str(e))
        return {"reports": []}


@router.post("/followup/{program_id}")
@limiter.limit("20/hour")
async def followup_question(
    request: Request,
    program_id: str,
    wallet: str = Depends(require_auth),
):
    """Answer a follow-up question about a program's metrics."""
    if not is_valid_solana_address(program_id):
        raise HTTPException(status_code=400, detail="Invalid Solana address format")

    has_access = await _check_plan_feature(wallet, "ai_insights")
    if not has_access:
        raise HTTPException(
            status_code=403,
            detail="AI follow-up requires a Team or Protocol plan.",
        )

    supabase = get_supabase()
    user_id = resolve_wallet_to_user_id(wallet)
    if not user_id:
        raise HTTPException(status_code=401, detail="User not found.")

    program_row = (
        supabase.table("programs")
        .select("id, user_id")
        .eq("program_address", program_id)
        .eq("user_id", user_id)
        .execute()
    )
    if not program_row.data:
        raise HTTPException(status_code=403, detail="You do not own this program.")

    try:
        body = await request.json()
    except Exception:
        body = {}

    question = str(body.get("question", "")).strip()
    if not question:
        raise HTTPException(status_code=400, detail="Question is required.")

    metrics = await cache_get(metrics_cache_key(program_id))
    if not metrics:
        raise HTTPException(
            status_code=404,
            detail="No metrics found. Run /analytics/sync/{address} first.",
        )

    insights = await cache_get(insights_cache_key(program_id))

    from services.ai.followup import answer_followup

    return await answer_followup(
        question=question,
        metrics=metrics,
        insights=insights,
        program_name=body.get("program_name") or program_id,
    )


@router.post("/generate_stream/{program_id}")
@limiter.limit("5/hour")
async def generate_insights_stream(
    request: Request,
    program_id: str,
    wallet: str = Depends(require_auth),
    program_name: str = Query(None),
):
    """
    Stream insight generation progress via Server-Sent Events (SSE).

    Why POST (not EventSource GET):
    - Allows Authorization header (Bearer JWT) and program_name query.

    Stream events:
    - event: status  data: {"status": "...", ...}
    - event: insight data: {"insight": {...}, "index": n, "total": m}
    - event: final   data: {"report": {...}}
    - event: error   data: {"error": "..."}
    """
    if not is_valid_solana_address(program_id):
        raise HTTPException(status_code=400, detail="Invalid Solana address format")

    # Ownership check
    supabase = get_supabase()
    user_id = resolve_wallet_to_user_id(wallet)
    if not user_id:
        raise HTTPException(status_code=401, detail="User not found.")

    program_row = (
        supabase.table("programs")
        .select("id, user_id")
        .eq("program_address", program_id)
        .eq("user_id", user_id)
        .execute()
    )
    if not program_row.data:
        raise HTTPException(status_code=403, detail="You do not own this program.")

    # Plan gate
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

    async def _sse():
        def emit(event: str, data: dict):
            payload = json.dumps(data, separators=(",", ":"), ensure_ascii=False)
            return f"event: {event}\ndata: {payload}\n\n"

        # SSE comment frames (": ...") are ignored by clients but help keep proxies flushing.
        def comment(text: str = "keep-alive"):
            return f": {text}\n\n"

        client_id = str(uuid.uuid4())
        yield emit("status", {"status": "connected", "client_id": client_id})
        yield comment("connected")

        # Fast path: cached report
        cached = await cache_get(insights_cache_key(program_id))
        if cached:
            yield emit("status", {"status": "cache_hit"})
            yield emit("final", {"report": cached})
            return

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

        # Track accumulated state from streamed updates.
        accumulated: dict = dict(initial_state)

        # Thread id helps isolate concurrent streaming runs.
        config = {"configurable": {"thread_id": f"insights:{program_id}:{client_id}"}}

        yield emit("status", {"status": "starting_pipeline", "timeout_s": INSIGHT_PIPELINE_TIMEOUT_SECONDS})
        yield comment("starting")

        try:
            async with asyncio.timeout(INSIGHT_PIPELINE_TIMEOUT_SECONDS):
                async for part in insight_pipeline.astream(
                    initial_state,
                    stream_mode=["custom", "updates"],
                    version="v2",
                    config=config,
                ):
                    if await request.is_disconnected():
                        return

                    if part.get("type") == "custom":
                        data = part.get("data") or {}
                        # Writer payloads from nodes.py:
                        # - {"status": "...", ...}
                        # - {"insight": {...}, "index": ..., "total": ...}
                        if isinstance(data, dict) and data.get("insight"):
                            yield emit("insight", data)
                        elif isinstance(data, dict) and data.get("status"):
                            yield emit("status", data)
                        else:
                            yield emit("status", {"status": "progress", "data": data})

                    elif part.get("type") == "updates":
                        # Apply node deltas to our accumulated state.
                        updates = part.get("data") or {}
                        if isinstance(updates, dict):
                            try:
                                # Emit a lightweight progress event even if custom writer is unavailable.
                                yield emit("status", {"status": "node_update", "nodes": list(updates.keys())})
                            except Exception:
                                pass
                            for _, node_update in updates.items():
                                if isinstance(node_update, dict):
                                    accumulated.update(node_update)
                        yield comment("tick")

        except asyncio.TimeoutError:
            yield emit("status", {"status": "timeout_fallback"})
            output = _fallback_insights(metrics, program_name)
            await cache_set(insights_cache_key(program_id), output, ttl_seconds=900)
            yield emit("final", {"report": output})
            return
        except Exception as e:
            logger.warning("Streaming pipeline failed; using fallback", extra={"error": str(e), "program_id": program_id})
            yield emit("status", {"status": "error_fallback", "error": str(e)})
            output = _fallback_insights(metrics, program_name)
            await cache_set(insights_cache_key(program_id), output, ttl_seconds=900)
            yield emit("final", {"report": output})
            return

        # Build the same output shape as /generate
        output = {
            "headline": accumulated.get("headline", ""),
            "biggest_problem": accumulated.get("biggest_problem", ""),
            "health_score": accumulated.get("health_score", 50),
            "insights": accumulated.get("final_insights") or accumulated.get("raw_insights") or [],
            "retention_diagnosis": accumulated.get("retention_diagnosis") or {},
            "quick_wins": accumulated.get("quick_wins") or [],
            "execution_trace": accumulated.get("execution_trace") or [],
        }

        from services.ai.followup import fallback_suggestions
        output["suggested_questions"] = fallback_suggestions(metrics, output)

        # Cache for 6 hours
        await cache_set(insights_cache_key(program_id), output, ttl_seconds=21600)

        # Persist insight report for history (same as /generate)
        try:
            program_db_id = program_row.data[0]["id"]
            supabase.table("insight_reports").insert({
                "program_id": program_db_id,
                "health_score": output.get("health_score"),
                "headline": output.get("headline"),
                "full_json": output,
            }).execute()

            old_reports = (
                supabase.table("insight_reports")
                .select("id")
                .eq("program_id", program_db_id)
                .order("generated_at", desc=True)
                .range(10, 60)
                .execute()
            )
            if old_reports.data:
                old_ids = [r.get("id") for r in old_reports.data if r.get("id")]
                if old_ids:
                    supabase.table("insight_reports").delete().in_("id", old_ids).execute()
        except Exception as e:
            logger.warning("Failed to persist streamed insight report: %s", str(e))

        yield emit("final", {"report": output})

    headers = {
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
    }
    return StreamingResponse(_sse(), media_type="text/event-stream", headers=headers)
