"""
Insights Router for Pulse.
Exposes the LangGraph insight pipeline as API endpoints.
"""

from fastapi import APIRouter, HTTPException
from services.ai.graph import insight_pipeline
from services.ai.state import InsightPipelineState
from services.cache import cache_get, cache_set, metrics_cache_key, insights_cache_key

router = APIRouter(prefix="/insights", tags=["insights"])


@router.post("/generate/{program_id}")
async def generate_insights(program_id: str, program_name: str = None):
    """
    Run the full LangGraph insight pipeline for a program.
    Requires metrics to be computed first (/analytics/sync).

    Pipeline: anomaly_detector → ranker → [insight_gen, retention, scorer] → quick_wins → assembler
    """
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
        raise HTTPException(
            status_code=500,
            detail=f"Insight pipeline failed: {str(e)}",
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
async def get_insights(program_id: str):
    """Get cached insights for a program."""
    insights = await cache_get(insights_cache_key(program_id))
    if not insights:
        raise HTTPException(
            status_code=404,
            detail="No insights found. Run /insights/generate/{program_id} first.",
        )
    return insights
