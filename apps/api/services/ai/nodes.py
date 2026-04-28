"""
LangGraph Node Functions for Pulse AI Insight Pipeline.
Each function represents one node in the graph.
7 nodes total: anomaly_detector → ranker → [insight_gen, retention, scorer] → quick_wins → assembler
"""

import json
from langchain_nvidia_ai_endpoints import ChatNVIDIA
from .prompts import (
    ANOMALY_DETECTION_PROMPT,
    INSIGHT_GENERATION_PROMPT,
    RETENTION_DIAGNOSIS_PROMPT,
    QUICK_WINS_PROMPT,
    HEADLINE_PROMPT,
)
from .state import InsightPipelineState

# Initialize model — use exactly this configuration per spec
model = ChatNVIDIA(
    model="moonshotai/kimi-k2-instruct-0905",
    api_key="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",
    temperature=0.6,
)


def safe_parse_json(text: str) -> dict:
    """Strip markdown fences and parse JSON safely."""
    cleaned = text.strip()
    if cleaned.startswith("```"):
        parts = cleaned.split("```")
        cleaned = parts[1] if len(parts) > 1 else cleaned
        if cleaned.startswith("json"):
            cleaned = cleaned[4:]
    return json.loads(cleaned.strip())


async def anomaly_detector_node(state: InsightPipelineState) -> dict:
    """
    Node 1: Scan all metrics and identify anomalies.
    Output: list of anomaly dicts ranked by severity.
    """
    chain = ANOMALY_DETECTION_PROMPT | model
    response = await chain.ainvoke(
        {"metrics_json": json.dumps(state["metrics_payload"], indent=2)}
    )
    result = safe_parse_json(response.content)
    trace = list(state.get("execution_trace", []))
    trace.append(
        f"anomaly_detector: found {len(result.get('anomalies', []))} anomalies"
    )

    return {
        "anomalies": result.get("anomalies", []),
        "execution_trace": trace,
    }


async def anomaly_ranker_node(state: InsightPipelineState) -> dict:
    """
    Node 2: Sort anomalies by severity for prioritized insight generation.
    Pure logic node — no LLM call needed.
    """
    severity_order = {"critical": 0, "high": 1, "medium": 2, "low": 3}
    ranked = sorted(
        state["anomalies"],
        key=lambda x: severity_order.get(x.get("severity", "low"), 3),
    )
    trace = list(state.get("execution_trace", []))
    trace.append(f"anomaly_ranker: ranked {len(ranked)} anomalies")

    return {"ranked_anomalies": ranked, "execution_trace": trace}


async def insight_generator_node(state: InsightPipelineState) -> dict:
    """
    Node 3: For each top anomaly, generate a structured insight.
    Run sequentially for top 4 anomalies only — avoid over-generation.
    """
    top_anomalies = state["ranked_anomalies"][:4]
    program_name = state.get("program_name") or "this Solana program"
    metrics_summary = json.dumps(
        state["metrics_payload"].get("summary", {}), indent=2
    )

    insights = []
    chain = INSIGHT_GENERATION_PROMPT | model

    for i, anomaly in enumerate(top_anomalies):
        try:
            response = await chain.ainvoke(
                {
                    "program_name": program_name,
                    "anomaly_json": json.dumps(anomaly, indent=2),
                    "metrics_summary_json": metrics_summary,
                    "index": i + 1,
                }
            )
            insight = safe_parse_json(response.content)
            insights.append(insight)
        except Exception as e:
            # Log but don't fail the pipeline
            print(f"Insight generation failed for anomaly {i}: {e}")
            continue

    trace = list(state.get("execution_trace", []))
    trace.append(f"insight_generator: generated {len(insights)} insights")

    return {"raw_insights": insights, "execution_trace": trace}


async def retention_analyst_node(state: InsightPipelineState) -> dict:
    """
    Node 4: Deep-dive retention diagnosis — separate node for focused analysis.
    This produces the most specific insight in the output.
    """
    chain = RETENTION_DIAGNOSIS_PROMPT | model
    try:
        response = await chain.ainvoke(
            {
                "program_name": state.get("program_name") or "this program",
                "retention_cohorts_json": json.dumps(
                    state["metrics_payload"].get("retention_cohorts", [])[:20],
                    indent=2,
                ),
                "per_type_retention_json": json.dumps(
                    state["metrics_payload"].get("per_type_retention", []),
                    indent=2,
                ),
                "summary_json": json.dumps(
                    state["metrics_payload"].get("summary", {}), indent=2
                ),
            }
        )
        result = safe_parse_json(response.content)
    except Exception as e:
        print(f"Retention analysis failed: {e}")
        result = {
            "d7_assessment": "Unable to assess",
            "d30_assessment": "Unable to assess",
            "main_churn_trigger": "Insufficient data",
            "power_user_signal": "Insufficient data",
            "retention_grade": "N/A",
        }

    trace = list(state.get("execution_trace", []))
    trace.append("retention_analyst: completed retention diagnosis")

    return {"retention_diagnosis": result, "execution_trace": trace}


async def health_scorer_node(state: InsightPipelineState) -> dict:
    """
    Node 5: Compute a 0-100 product health score from all metrics.
    Pure logic — weighted scoring, no LLM call.
    """
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
    trace = list(state.get("execution_trace", []))
    trace.append(f"health_scorer: score = {health_score}")

    return {"health_score": health_score, "execution_trace": trace}


async def quick_win_extractor_node(state: InsightPipelineState) -> dict:
    """
    Node 6: Extract 3 quick wins from the generated insights.
    """
    chain = QUICK_WINS_PROMPT | model
    try:
        response = await chain.ainvoke(
            {
                "program_name": state.get("program_name") or "this program",
                "insights_json": json.dumps(state["raw_insights"], indent=2),
                "summary_json": json.dumps(
                    state["metrics_payload"].get("summary", {}), indent=2
                ),
            }
        )
        result = safe_parse_json(response.content)
    except Exception as e:
        print(f"Quick win extraction failed: {e}")
        result = {"quick_wins": ["Review your highest churn transaction type"]}

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
    top_insight = state["raw_insights"][0] if state["raw_insights"] else {}

    try:
        chain = HEADLINE_PROMPT | model
        headline_response = await chain.ainvoke(
            {
                "program_name": state.get("program_name") or "your program",
                "top_insight_json": json.dumps(top_insight, indent=2),
                "health_score": state.get("health_score", 50),
            }
        )
        headline = headline_response.content.strip()
    except Exception as e:
        print(f"Headline generation failed: {e}")
        headline = f"Product Health Score: {state.get('health_score', 50)}/100"

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
