"""
Follow-up question handler for Pulse AI.
Uses the same NVIDIA ChatNVIDIA model as the main insight pipeline.
"""

import asyncio
import json
import logging
import os
import re

from langchain_core.prompts import ChatPromptTemplate

from .nodes import _get_model, safe_parse_json

logger = logging.getLogger(__name__)
FOLLOWUP_TIMEOUT_SECONDS = float(os.getenv("FOLLOWUP_TIMEOUT_SECONDS", "12"))
SUGGESTION_TIMEOUT_SECONDS = float(os.getenv("SUGGESTION_TIMEOUT_SECONDS", "4"))


FOLLOWUP_PROMPT = ChatPromptTemplate.from_messages([
    ("system", """You are a product analytics expert for Solana programs.
You have complete metrics for {program_name}. Answer with SPECIFIC NUMBERS from the data.
Respond in clean Markdown with sections and concrete numbers.
When user asks for comparison/difference, always return:
1) a comparison table,
2) delta/difference callouts,
3) specific recommendations tied to those deltas.
If the user asks for formulas or projections, include math notation (inline or block).
Do not invent numbers. Never give generic advice.

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


def _per_type_rows(metrics: dict) -> list[dict]:
    return metrics.get("per_type_retention") or metrics.get("perTypeRetention") or []


def _format_comparison_table(rows: list[dict]) -> str:
    if not rows:
        return "_No per-action retention rows available._"
    lines = [
        "| Transaction Type | Return Rate | Returned Wallets | Total Wallets |",
        "|---|---:|---:|---:|",
    ]
    for row in rows:
        tx_type = str(
            row.get("first_transaction_type")
            or row.get("firstTransactionType")
            or row.get("transaction_type")
            or row.get("type")
            or "UNKNOWN"
        ).upper()
        rr = row.get("return_rate", row.get("returnRate", 0))
        returned = row.get("returned_wallets", row.get("returnedWallets", 0))
        total = row.get("total_wallets", row.get("totalWallets", 0))
        lines.append(f"| {tx_type} | {rr}% | {returned} | {total} |")
    return "\n".join(lines)


def _build_delta_notes(rows: list[dict]) -> list[str]:
    if len(rows) < 2:
        return []
    sorted_rows = sorted(
        rows,
        key=lambda r: float(r.get("return_rate", r.get("returnRate", 0)) or 0),
        reverse=True,
    )
    top = sorted_rows[0]
    low = sorted_rows[-1]
    top_name = str(top.get("first_transaction_type") or top.get("firstTransactionType") or top.get("type") or "TOP").upper()
    low_name = str(low.get("first_transaction_type") or low.get("firstTransactionType") or low.get("type") or "LOW").upper()
    top_rr = float(top.get("return_rate", top.get("returnRate", 0)) or 0)
    low_rr = float(low.get("return_rate", low.get("returnRate", 0)) or 0)
    return [
        f"- **Gap:** {top_name} ({top_rr:.1f}%) vs {low_name} ({low_rr:.1f}%) = **{(top_rr - low_rr):.1f}pp**.",
        f"- **Priority:** Improve flows after **{low_name}** first, where retention is weakest.",
    ]


def _fallback_answer(question: str, metrics: dict) -> str:
    summary = _summary(metrics)
    total_wallets = summary.get("total_wallets", 0)
    d7 = summary.get("d7_retention_rate", 0)
    d30 = summary.get("d30_retention_rate", 0)
    worst_step = summary.get("worst_funnel_step") or "unknown"
    worst_drop = summary.get("worst_funnel_drop_rate", 0)
    worst_type = summary.get("worst_first_type_for_retention") or summary.get("highest_churn_transaction_type") or "the top churn action"
    worst_return = summary.get("worst_first_type_return_rate", 0)
    per_type = _per_type_rows(metrics)

    lowered = question.lower()
    asks_compare = any(k in lowered for k in ["compare", "comparison", "difference", "diff", "versus", "vs"])

    if asks_compare:
        table_md = _format_comparison_table(per_type)
        deltas = _build_delta_notes(per_type)
        delta_block = "\n".join(deltas) if deltas else "- Not enough rows for robust delta analysis."
        return (
            "### Comparison Summary\n"
            f"- D7 retention: **{d7}%**\n"
            f"- D30 retention: **{d30}%**\n"
            f"- Worst funnel drop: **{worst_drop}%**\n\n"
            "### Action Comparison\n"
            f"{table_md}\n\n"
            "### Differences (Deltas)\n"
            f"{delta_block}\n\n"
            "### Recommendation\n"
            f"Prioritize **{worst_type}** path first; it currently returns at **{worst_return}%**."
        )

    if "retention" in lowered or "d7" in lowered or "d30" in lowered:
        return (
            f"### Retention snapshot\n"
            f"- **D7:** {d7}%\n"
            f"- **D30:** {d30}%\n"
            f"- **Wallets analyzed:** {total_wallets}\n\n"
            f"Weakest first action is **{worst_type}** with **{worst_return}%** return rate."
        )
    if "funnel" in lowered or "drop" in lowered or "step" in lowered:
        return (
            f"### Funnel leak\n"
            f"The largest loss is **step {worst_step}** with **{worst_drop}%** drop-off.\n\n"
            f"Start by testing one intervention at that step (re-engagement prompt or clearer next action)."
        )
    return (
        f"### Key metrics\n"
        f"- D7 retention: **{d7}%**\n"
        f"- D30 retention: **{d30}%**\n"
        f"- Worst funnel drop: **{worst_drop}%**\n\n"
        f"Prioritize **{worst_type}** first, since it returns at only **{worst_return}%**."
    )


def _insight_items(insights: dict | None) -> list[dict]:
    if not insights:
        return []
    data = insights.get("insights") or []
    return data if isinstance(data, list) else []


def _detailed_breakdown_answer(metrics: dict, insights: dict | None) -> str:
    summary = _summary(metrics)
    d7 = summary.get("d7_retention_rate", 0)
    d30 = summary.get("d30_retention_rate", 0)
    worst_drop = summary.get("worst_funnel_drop_rate", 0)
    worst_step = summary.get("worst_funnel_step") or "unknown"
    total_wallets = summary.get("total_wallets", 0)
    worst_type = summary.get("worst_first_type_for_retention") or summary.get("highest_churn_transaction_type") or "UNKNOWN"
    worst_return = summary.get("worst_first_type_return_rate", 0)

    items = _insight_items(insights)[:3]
    anomaly_lines: list[str] = []
    for item in items:
        finding = item.get("finding") or "Anomaly detected"
        why = item.get("why_it_matters") or item.get("whyItMatters") or "Impacts retention/activation."
        recommendation = item.get("recommendation") or "Run a targeted product experiment for this metric."
        anomaly_lines.append(f"- **{finding}**\n  - Why: {why}\n  - Fix: {recommendation}")
    if not anomaly_lines:
        anomaly_lines.append(
            f"- **Retention bottleneck in {worst_type}**\n"
            f"  - Why: this path returns at only {worst_return}%.\n"
            "  - Fix: add in-flow prompts + post-action guidance for that path."
        )

    quick_wins = []
    if insights:
        quick_wins = insights.get("quick_wins") or insights.get("quickWins") or []
    quick_wins = quick_wins[:3] if isinstance(quick_wins, list) else []
    quick_lines = [f"- {str(win)}" for win in quick_wins] or [
        f"- Add next-step CTA after step {worst_step} to reduce {worst_drop}% drop-off.",
        f"- Rework first-session UX for **{worst_type}** path.",
        "- Ship one re-engagement nudge within 24h for first-time wallets.",
    ]

    per_type = _per_type_rows(metrics)
    table_md = _format_comparison_table(per_type)
    deltas = _build_delta_notes(per_type)
    delta_block = "\n".join(deltas) if deltas else "- Need more per-action samples to compute robust deltas."

    return (
        "### Current Report Breakdown\n"
        f"- **D7 retention:** {d7}%\n"
        f"- **D30 retention:** {d30}%\n"
        f"- **Worst funnel drop:** {worst_drop}% (step {worst_step})\n"
        f"- **Total wallets:** {total_wallets}\n\n"
        "### Top Issues\n"
        f"{chr(10).join(anomaly_lines)}\n\n"
        "### Action Comparison\n"
        f"{table_md}\n\n"
        "### Difference Signals\n"
        f"{delta_block}\n\n"
        "### Recommended Next 3 Moves\n"
        f"{chr(10).join(quick_lines)}\n\n"
        "### What to Measure Next\n"
        "- D1->D7 conversion change by first action type.\n"
        "- Step-wise drop-off after each intervention.\n"
        "- Re-engagement rate of one-time wallets within 24-72h."
    )


def _is_low_quality_answer(answer: str) -> bool:
    text = (answer or "").strip()
    if len(text) < 220:
        return True
    has_heading = "###" in text or "##" in text
    has_table = "|" in text and "---" in text
    bullet_count = len(re.findall(r"(?m)^\s*[-*]\s+", text))
    if not has_heading and bullet_count < 3:
        return True
    return "key metrics" in text.lower() and bullet_count <= 3 and not has_table


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
            timeout=max(FOLLOWUP_TIMEOUT_SECONDS, 18),
        )
        answer = response.content.strip()
        lowered = question.lower()
        asks_breakdown = any(k in lowered for k in ["breakdown", "detailed", "report", "explain"])
        asks_compare = any(k in lowered for k in ["compare", "comparison", "difference", "diff", "versus", "vs"])
        if asks_breakdown:
            answer = _detailed_breakdown_answer(metrics, insights)
        elif asks_compare and _is_low_quality_answer(answer):
            answer = _fallback_answer(question, metrics)
        elif _is_low_quality_answer(answer):
            answer = _detailed_breakdown_answer(metrics, insights)
    except Exception as e:
        logger.warning("Follow-up answer failed; using fallback", extra={"error": str(e)})
        lowered = question.lower()
        if any(k in lowered for k in ["breakdown", "detailed", "report", "explain", "compare", "difference", "versus", "vs"]):
            answer = _detailed_breakdown_answer(metrics, insights)
        else:
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
