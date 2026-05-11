"""
LangGraph Node Functions for Pulse AI Insight Pipeline.
Each function represents one node in the graph.
7 nodes total: anomaly_detector → ranker → [insight_gen, retention, scorer] → quick_wins → assembler
"""

import json
import logging
import os
from langchain_nvidia_ai_endpoints import ChatNVIDIA
from langgraph.config import get_stream_writer
from .prompts import (
    ANOMALY_DETECTION_PROMPT,
    INSIGHT_GENERATION_PROMPT,
    RETENTION_DIAGNOSIS_PROMPT,
    QUICK_WINS_PROMPT,
    HEADLINE_PROMPT,
)
from .state import InsightPipelineState

logger = logging.getLogger(__name__)

# Module-level model singleton — initialized lazily
_model: ChatNVIDIA | None = None

# NVIDIA NIM model to use — must be a known, supported type on api.nvidia.com
_NVIDIA_MODEL = os.getenv("NVIDIA_MODEL", "mistralai/mistral-nemotron")

# Valid fallback models when primary is degraded (from build.nvidia.com)
_FALLBACK_MODELS = [
    "meta/llama-3.1-8b-instruct",
    "mistralai/mistral-small-4-119b-2603",
    "meta/llama-3.1-70b-instruct",
]

# Timeout in seconds for each LLM HTTP request.
# aiohttp default is 5 s which is far too short for large LLM responses.
_LLM_TIMEOUT_SECONDS = int(os.getenv("LLM_TIMEOUT_SECONDS", "120"))


def _get_model(model_name: str | None = None) -> ChatNVIDIA:
    """Lazily create and cache the ChatNVIDIA model singleton.
    
    Args:
        model_name: Optional specific model to use. If None, uses default _NVIDIA_MODEL.
    """
    global _model
    if model_name is None:
        if _model is not None:
            return _model
        model_name = _NVIDIA_MODEL
    
    api_key = os.getenv("NVIDIA_API_KEY")
    if not api_key:
        logger.error("NVIDIA_API_KEY environment variable is not set - AI insights will not work")
        raise RuntimeError("NVIDIA_API_KEY environment variable is not set")
    
    try:
        model = ChatNVIDIA(
            model=model_name,
            nvidia_api_key=api_key,
            temperature=0.6,
            top_p=0.7,
            max_completion_tokens=4096,
        )
        logger.info("ChatNVIDIA model initialised", extra={"model": model_name})
        if model_name == _NVIDIA_MODEL:
            _model = model
        return model
    except Exception as e:
        logger.error("Failed to initialize ChatNVIDIA model", extra={"error": str(e), "model": model_name})
        raise


async def _invoke_with_fallback(chain, payload: dict, timeout: int = _LLM_TIMEOUT_SECONDS):
    """Invoke chain with automatic model fallback on degradation.
    
    Tries primary model first, then falls back through _FALLBACK_MODELS.
    """
    last_error = None
    models_to_try = [_NVIDIA_MODEL] + _FALLBACK_MODELS
    
    for model_name in models_to_try:
        try:
            # Create fresh model instance for this attempt
            current_model = _get_model(model_name)
            
            # Recreate chain with current model
            from langchain_core.prompts import ChatPromptTemplate
            if hasattr(chain, 'first'):
                new_chain = chain.first | current_model
            elif hasattr(chain, 'prompt'):
                new_chain = chain.prompt | current_model
            else:
                new_chain = current_model
            
            logger.info(f"Trying model: {model_name}")
            
            import asyncio
            response = await asyncio.wait_for(
                new_chain.ainvoke(payload),
                timeout=timeout,
            )
            return response
            
        except Exception as e:
            last_error = e
            error_str = str(e).lower()
            # Degraded model - try next fallback
            if "degraded" in error_str or "400" in error_str or "cannot be invoked" in error_str:
                logger.warning(f"Model {model_name} degraded, trying fallback")
                continue
            # Other errors - don't retry
            raise
    
    # All models failed
    logger.error(f"All models failed. Last error: {last_error}")
    raise last_error


def _reset_model() -> None:
    """Reset cached model singleton to force re-initialization on next call.
    Use when a persistent error (e.g. DEGRADED) may be resolved by
    re-creating the client."""
    global _model
    _model = None
    logger.info("ChatNVIDIA model singleton reset")


def check_ai_health() -> dict:
    """Check if AI layer is properly configured. Called at startup."""
    api_key = os.getenv("NVIDIA_API_KEY")
    if not api_key:
        return {"status": "unconfigured", "error": "NVIDIA_API_KEY not set"}
    # Don't actually initialize the model here, just check config
    return {"status": "configured", "model": _NVIDIA_MODEL}


def safe_parse_json(text: str, fallback: dict | None = None) -> dict:
    """Strip markdown fences and parse JSON safely. Returns fallback on failure."""
    try:
        cleaned = text.strip()
        if cleaned.startswith("```"):
            parts = cleaned.split("```")
            cleaned = parts[1] if len(parts) > 1 else cleaned
            if cleaned.startswith("json"):
                cleaned = cleaned[4:]
        return json.loads(cleaned.strip())
    except (json.JSONDecodeError, IndexError, ValueError) as e:
        logger.warning("safe_parse_json failed", extra={"error": str(e), "text_preview": text[:200]})
        return fallback if fallback is not None else {}


async def anomaly_detector_node(state: InsightPipelineState) -> dict:
    """
    Node 1: Scan all metrics and identify anomalies.
    Output: list of anomaly dicts ranked by severity.
    """
    writer = get_stream_writer()
    writer({"status": "Scanning metrics for anomalies..."})

    try:
        chain = ANOMALY_DETECTION_PROMPT | _get_model()
        response = await _invoke_with_fallback(
            chain,
            {"metrics_json": json.dumps(state["metrics_payload"], separators=(",", ":"), ensure_ascii=False)}
        )
        result = safe_parse_json(response.content)
    except Exception as e:
        logger.error("Anomaly detection failed", extra={"error": str(e)})
        # Return synthetic anomalies from metrics as fallback
        result = _synthetic_anomalies_from_metrics(state["metrics_payload"])

    writer({"status": f"Found {len(result.get('anomalies', []))} anomalies"})
    trace = list(state.get("execution_trace", []))
    trace.append(
        f"anomaly_detector: found {len(result.get('anomalies', []))} anomalies"
    )

    return {
        "anomalies": result.get("anomalies", []),
        "execution_trace": trace,
    }


def _synthetic_anomalies_from_metrics(metrics: dict) -> dict:
    """Generate synthetic anomalies from metrics when AI fails."""
    summary = metrics.get("summary", {})
    anomalies = []
    
    d7 = summary.get("d7_retention_rate", 0)
    if d7 < 20:
        anomalies.append({
            "severity": "critical",
            "metric": "d7_retention_rate",
            "finding": f"D7 retention is critically low at {d7:.1f}%",
            "why_it_matters": "Most users abandon the product within a week",
            "recommendation": "Add re-engagement emails and onboarding improvements",
        })
    elif d7 < 30:
        anomalies.append({
            "severity": "high",
            "metric": "d7_retention_rate",
            "finding": f"D7 retention is below benchmark at {d7:.1f}%",
            "why_it_matters": "Users are not returning after first week",
            "recommendation": "Improve first-week user experience",
        })
    
    worst_drop = summary.get("worst_funnel_drop_rate", 0)
    if worst_drop > 50:
        anomalies.append({
            "severity": "high",
            "metric": "funnel_drop",
            "finding": f"Funnel drop-off is severe at {worst_drop:.1f}%",
            "why_it_matters": "Users are dropping at the critical conversion step",
            "recommendation": "Simplify the conversion flow and add progress indicators",
        })
    
    worst_type = summary.get("worst_first_type_for_retention", "")
    worst_return = summary.get("worst_first_type_return_rate", 0)
    if worst_type and worst_return < 30:
        anomalies.append({
            "severity": "medium",
            "metric": "per_type_retention",
            "finding": f"{worst_type} has poor retention at {worst_return:.1f}%",
            "why_it_matters": "This action type leads to high churn",
            "recommendation": f"Add post-{worst_type} engagement flows",
        })
    
    return {"anomalies": anomalies}


async def anomaly_ranker_node(state: InsightPipelineState) -> dict:
    """
    Node 2: Sort anomalies by severity for prioritized insight generation.
    Pure logic node — no LLM call needed.
    """
    writer = get_stream_writer()
    writer({"status": "Ranking anomalies by severity..."})
    severity_order = {"critical": 0, "high": 1, "medium": 2, "low": 3}
    ranked = sorted(
        state["anomalies"],
        key=lambda x: severity_order.get(x.get("severity", "low"), 3),
    )
    writer({"status": f"Ranked {len(ranked)} anomalies"})
    trace = list(state.get("execution_trace", []))
    trace.append(f"anomaly_ranker: ranked {len(ranked)} anomalies")

    return {"ranked_anomalies": ranked, "execution_trace": trace}


async def insight_generator_node(state: InsightPipelineState) -> dict:
    """
    Node 3: For each top anomaly, generate a structured insight.
    Run sequentially for top 4 anomalies only — avoid over-generation.
    """
    writer = get_stream_writer()
    writer({"status": "Generating insight cards..."})

    top_anomalies = state["ranked_anomalies"][:4]
    program_name = state.get("program_name") or "this Solana program"
    metrics_summary = json.dumps(
        state["metrics_payload"].get("summary", {}), separators=(",", ":"), ensure_ascii=False
    )

    insights = []
    try:
        chain = INSIGHT_GENERATION_PROMPT | _get_model()
    except Exception as e:
        logger.error("Failed to initialize insight generator model", extra={"error": str(e)})
        # Convert anomalies directly to insights as fallback
        for i, anomaly in enumerate(top_anomalies):
            insight = {
                "title": anomaly.get("finding", f"Issue {i+1}"),
                "finding": anomaly.get("finding", ""),
                "why_it_matters": anomaly.get("why_it_matters", ""),
                "recommendation": anomaly.get("recommendation", ""),
                "severity": anomaly.get("severity", "medium"),
            }
            insights.append(insight)
            writer({"insight": insight, "index": i + 1, "total": len(top_anomalies)})
        writer({"status": f"Generated {len(insights)} insight cards (fallback mode)"})
        trace = list(state.get("execution_trace", []))
        trace.append(f"insight_generator: generated {len(insights)} insights (fallback)")
        return {"raw_insights": insights, "execution_trace": trace}

    for i, anomaly in enumerate(top_anomalies):
        try:
            writer({"status": f"Drafting insight {i + 1}/{len(top_anomalies)}..."})
            response = await _invoke_with_fallback(
                chain,
                {
                    "program_name": program_name,
                    "anomaly_json": json.dumps(anomaly, separators=(",", ":"), ensure_ascii=False),
                    "metrics_summary_json": metrics_summary,
                    "index": i + 1,
                }
            )
            insight = safe_parse_json(response.content)
            insights.append(insight)
            # Stream the card immediately so the UI can render progressively.
            writer({"insight": insight, "index": i + 1, "total": len(top_anomalies)})
        except Exception as e:
            # Log but don't fail the pipeline
            logger.warning("Insight generation failed for anomaly", extra={"index": i, "error": str(e)})
            # Use anomaly data as fallback insight
            insight = {
                "title": anomaly.get("finding", f"Issue {i+1}"),
                "finding": anomaly.get("finding", ""),
                "why_it_matters": anomaly.get("why_it_matters", ""),
                "recommendation": anomaly.get("recommendation", ""),
                "severity": anomaly.get("severity", "medium"),
            }
            insights.append(insight)
            writer({"insight": insight, "index": i + 1, "total": len(top_anomalies)})
            continue

    writer({"status": f"Generated {len(insights)} insight cards"})
    trace = list(state.get("execution_trace", []))
    trace.append(f"insight_generator: generated {len(insights)} insights")

    return {"raw_insights": insights, "execution_trace": trace}


async def retention_analyst_node(state: InsightPipelineState) -> dict:
    """
    Node 4: Deep-dive retention diagnosis — separate node for focused analysis.
    This produces the most specific insight in the output.
    """
    writer = get_stream_writer()
    writer({"status": "Computing retention diagnosis..."})
    try:
        chain = RETENTION_DIAGNOSIS_PROMPT | _get_model()
        response = await _invoke_with_fallback(
            chain,
            {
                "program_name": state.get("program_name") or "this program",
                "retention_cohorts_json": json.dumps(
                    state["metrics_payload"].get("retention_cohorts", [])[:20],
                    separators=(",", ":"), ensure_ascii=False,
                ),
                "per_type_retention_json": json.dumps(
                    state["metrics_payload"].get("per_type_retention", []),
                    separators=(",", ":"), ensure_ascii=False,
                ),
                "summary_json": json.dumps(
                    state["metrics_payload"].get("summary", {}), separators=(",", ":"), ensure_ascii=False
                ),
            }
        )
        result = safe_parse_json(response.content)
    except Exception as e:
        logger.warning("Retention analysis failed", extra={"error": str(e)})
        result = {
            "d7_assessment": "Unable to assess",
            "d30_assessment": "Unable to assess",
            "main_churn_trigger": "Insufficient data",
            "power_user_signal": "Insufficient data",
            "retention_grade": "N/A",
        }

    writer({"status": "Retention diagnosis ready"})
    trace = list(state.get("execution_trace", []))
    trace.append("retention_analyst: completed retention diagnosis")

    return {"retention_diagnosis": result, "execution_trace": trace}


async def health_scorer_node(state: InsightPipelineState) -> dict:
    """
    Node 5: Compute a 0-100 product health score from all metrics.
    Pure logic — weighted scoring, no LLM call.
    """
    writer = get_stream_writer()
    writer({"status": "Computing health score..."})
    summary = state["metrics_payload"].get("summary", {})
    score = 50  # baseline

    # D7 retention scoring (max +20)
    d7 = summary.get("d7_retention_rate", 0)
    if d7 >= 30:
        score += 20
    elif d7 >= 20:
        score += 12
    elif d7 >= 10:
        score += 5
    else:
        score -= 10

    # D30 retention scoring (max +15)
    d30 = summary.get("d30_retention_rate", 0)
    if d30 >= 15:
        score += 15
    elif d30 >= 8:
        score += 8
    else:
        score -= 5

    # Funnel drop-off scoring (max +15)
    worst_drop = summary.get("worst_funnel_drop_rate", 100)
    if worst_drop is None:
        worst_drop = 100
    if worst_drop < 30:
        score += 15
    elif worst_drop < 50:
        score += 8
    elif worst_drop > 70:
        score -= 10

    # Critical anomaly penalty
    critical_count = sum(
        1
        for a in state.get("anomalies", [])
        if a.get("severity") == "critical"
    )
    score -= critical_count * 8

    health_score = max(0, min(100, score))
    writer({"status": f"Health score computed: {health_score}/100", "health_score": health_score})
    trace = list(state.get("execution_trace", []))
    trace.append(f"health_scorer: score = {health_score}")

    return {"health_score": health_score, "execution_trace": trace}


async def quick_win_extractor_node(state: InsightPipelineState) -> dict:
    """
    Node 6: Extract 3 quick wins from the generated insights.
    """
    writer = get_stream_writer()
    writer({"status": "Extracting quick wins..."})
    try:
        chain = QUICK_WINS_PROMPT | _get_model()
        response = await _invoke_with_fallback(
            chain,
            {
                "program_name": state.get("program_name") or "this program",
                "insights_json": json.dumps(state["raw_insights"], separators=(",", ":"), ensure_ascii=False),
                "summary_json": json.dumps(
                    state["metrics_payload"].get("summary", {}), separators=(",", ":"), ensure_ascii=False
                ),
            }
        )
        result = safe_parse_json(response.content)
    except Exception as e:
        logger.warning("Quick win extraction failed", extra={"error": str(e)})
        result = {"quick_wins": ["Review your highest churn transaction type"]}

    writer({"status": "Quick wins ready", "quick_wins": result.get("quick_wins", [])})
    trace = list(state.get("execution_trace", []))
    trace.append("quick_win_extractor: extracted quick wins")

    return {
        "quick_wins": result.get("quick_wins", []),
        "execution_trace": trace,
    }


async def output_assembler_node(state: InsightPipelineState) -> dict:
    """
    Node 7: Assemble final output — generate headline, pick top insights, structure response.
    """
    writer = get_stream_writer()
    writer({"status": "Assembling final report..."})
    top_insight = state["raw_insights"][0] if state["raw_insights"] else {}

    try:
        chain = HEADLINE_PROMPT | _get_model()
        headline_response = await _invoke_with_fallback(
            chain,
            {
                "program_name": state.get("program_name") or "your program",
                "top_insight_json": json.dumps(top_insight, separators=(",", ":"), ensure_ascii=False),
                "health_score": state.get("health_score", 50),
            }
        )
        headline = headline_response.content.strip()
    except Exception as e:
        logger.warning("Headline generation failed", extra={"error": str(e)})
        headline = f"Product Health Score: {state.get('health_score', 50)}/100"

    writer({"status": "Report ready", "headline": headline})
    # Pick biggest problem from highest severity insight
    biggest_problem = top_insight.get(
        "finding", "No critical issues detected"
    )

    trace = list(state.get("execution_trace", []))
    trace.append("output_assembler: final output assembled")

    return {
        "headline": headline,
        "biggest_problem": biggest_problem,
        "final_insights": state["raw_insights"],
        "execution_trace": trace,
    }
