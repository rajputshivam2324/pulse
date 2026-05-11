"""
Follow-up question handler for Pulse AI.
Uses the same NVIDIA ChatNVIDIA model as the main insight pipeline.
"""

import asyncio
import json
import logging
import os

from langchain_core.prompts import ChatPromptTemplate

from .nodes import _get_model, safe_parse_json

logger = logging.getLogger(__name__)
FOLLOWUP_TIMEOUT_SECONDS = float(os.getenv("FOLLOWUP_TIMEOUT_SECONDS", "12"))
SUGGESTION_TIMEOUT_SECONDS = float(os.getenv("SUGGESTION_TIMEOUT_SECONDS", "4"))


FOLLOWUP_PROMPT = ChatPromptTemplate.from_messages([
    ("system", """You are a product analytics expert for Solana programs.
You have complete metrics for {program_name}. Answer with SPECIFIC NUMBERS from the data.
Keep answers to 2-3 sentences. Never give generic advice.

Metrics data:
{metrics_json}

Previous AI insights:
{insights_json}
"""),
    ("human", "{question}"),
])

SUGGESTION_PROMPT = ChatPromptTemplate.from_messages([
    ("system", """Generate 3 follow-up questions a founder would want to ask based on these insights.
Each question must be answerable from the metrics data.
Respond ONLY in valid JSON: {"suggestions": ["q1", "q2", "q3"]}"""),
    ("human", "Insights: {insights_json}\nMetrics summary: {summary_json}"),
])


def _summary(metrics: dict) -> dict:
    return metrics.get("summary") or {}


def _fallback_answer(question: str, metrics: dict) -> str:
    summary = _summary(metrics)
    total_wallets = summary.get("total_wallets", 0)
    d7 = summary.get("d7_retention_rate", 0)
    d30 = summary.get("d30_retention_rate", 0)
    worst_step = summary.get("worst_funnel_step") or "unknown"
    worst_drop = summary.get("worst_funnel_drop_rate", 0)
    worst_type = summary.get("worst_first_type_for_retention") or summary.get("highest_churn_transaction_type") or "the top churn action"
    worst_return = summary.get("worst_first_type_return_rate", 0)

    lowered = question.lower()
    if "retention" in lowered or "d7" in lowered or "d30" in lowered:
        return (
            f"D7 retention is {d7}% and D30 retention is {d30}% across {total_wallets} wallets. "
            f"The weakest first action is {worst_type}, with {worst_return}% return rate."
        )
    if "funnel" in lowered or "drop" in lowered or "step" in lowered:
        return (
            f"The largest funnel loss is step {worst_step}, where {worst_drop}% of wallets drop off. "
            "That is the first place to test a re-engagement prompt or clearer next action."
        )
    return (
        f"Current health is driven by {d7}% D7 retention, {d30}% D30 retention, and a {worst_drop}% worst funnel drop. "
        f"Focus first on {worst_type}, because its return rate is {worst_return}%."
    )


def fallback_suggestions(metrics: dict, insights: dict | None = None) -> list[str]:
    summary = _summary(metrics)
    worst_type = (
        summary.get("worst_first_type_for_retention")
        or summary.get("highest_churn_transaction_type")
        or "the top action"
    )
    worst_step = summary.get("worst_funnel_step") or "1->2"
    return [
        f"Why does {worst_type} cause churn?",
        f"What's the fastest fix for step {worst_step} drop-off?",
        "Which wallets are worth re-engaging?",
    ]


async def answer_followup(
    question: str,
    metrics: dict,
    insights: dict | None,
    program_name: str,
) -> dict:
    """Answer a founder's follow-up question with metrics context."""
    try:
        chain = FOLLOWUP_PROMPT | _get_model()
        response = await asyncio.wait_for(
            chain.ainvoke({
                "program_name": program_name,
                # Keep payload compact for latency + token usage.
                "metrics_json": json.dumps(metrics, separators=(",", ":"), ensure_ascii=False),
                "insights_json": json.dumps(insights or {}, separators=(",", ":"), ensure_ascii=False),
                "question": question,
            }),
            timeout=FOLLOWUP_TIMEOUT_SECONDS,
        )
        answer = response.content.strip()
    except Exception as e:
        logger.warning("Follow-up answer failed; using fallback", extra={"error": str(e)})
        answer = _fallback_answer(question, metrics)

    return {
        "answer": answer,
        "program_name": program_name,
        "suggested_followups": fallback_suggestions(metrics, insights),
    }


async def generate_suggestions(metrics: dict, insights: dict | None) -> list[str]:
    """Generate AI question chips, with deterministic fallback."""
    try:
        chain = SUGGESTION_PROMPT | _get_model()
        response = await asyncio.wait_for(
            chain.ainvoke({
                "insights_json": json.dumps(insights or {}, indent=2),
                "summary_json": json.dumps(_summary(metrics), indent=2),
            }),
            timeout=SUGGESTION_TIMEOUT_SECONDS,
        )
        result = safe_parse_json(response.content, fallback={})
        suggestions = result.get("suggestions", [])
        if isinstance(suggestions, list) and suggestions:
            return [str(s) for s in suggestions[:3]]
    except Exception as e:
        logger.warning("Suggestion generation failed; using fallback", extra={"error": str(e)})

    return fallback_suggestions(metrics, insights)
