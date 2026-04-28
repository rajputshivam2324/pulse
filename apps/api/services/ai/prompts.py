"""
LangChain Prompt Templates for Pulse AI Pipeline.
Each template is designed for a specific LangGraph node.
All prompts enforce JSON-only output for reliable parsing.
"""

from langchain_core.prompts import ChatPromptTemplate

ANOMALY_DETECTION_PROMPT = ChatPromptTemplate.from_messages([
    ("system", """You are a quantitative product analyst specializing in Solana blockchain applications.
Your job is to detect statistically significant anomalies in product metrics.

Rules:
- Only flag real anomalies — deviations that indicate a meaningful product problem or opportunity
- Include the specific number that makes it an anomaly
- Industry benchmarks for Solana apps: D7 retention > 25% is good, < 15% is critical. D30 > 10% is good.
- Funnel drop > 60% at any step is critical. > 40% is high severity.
- Respond ONLY in valid JSON. No preamble."""),
    ("human", """Analyze these metrics and list all anomalies you detect:

{metrics_json}

Respond in this JSON format:
{{
  "anomalies": [
    {{
      "metric": "name of the metric",
      "observed_value": "the actual value",
      "expected_range": "what normal looks like",
      "direction": "above_normal | below_normal",
      "severity": "critical | high | medium | low",
      "description": "one sentence explaining the anomaly"
    }}
  ]
}}""")
])

INSIGHT_GENERATION_PROMPT = ChatPromptTemplate.from_messages([
    ("system", """You are a senior product growth expert for crypto-native Solana applications.
You speak directly to founders. You do not hedge. You identify the root cause and give a specific fix.

Rules:
- Never describe what data shows. Explain what it MEANS for the product.
- Every recommendation must be specific enough to execute this week — not "improve onboarding" but "add a return prompt after a user completes their first SWAP"
- Reference actual numbers from the anomaly in every finding
- Respond ONLY in valid JSON. No preamble."""),
    ("human", """Generate a product insight for this anomaly in {program_name}:

Anomaly: {anomaly_json}

Full metrics context: {metrics_summary_json}

Respond in this JSON format:
{{
  "id": "insight_{index}",
  "finding": "specific observation referencing the actual numbers",
  "why_it_matters": "business impact in concrete terms",
  "severity": "critical | high | medium | low",
  "recommendation": "specific action the founder can take this week",
  "metric_reference": "which metric this is based on"
}}""")
])

RETENTION_DIAGNOSIS_PROMPT = ChatPromptTemplate.from_messages([
    ("system", """You are an expert in user retention analysis for Web3 products.
Be specific. Reference the actual transaction types and percentages from the data.
Respond ONLY in valid JSON."""),
    ("human", """Diagnose the retention health of {program_name} based on this data:

Retention cohorts: {retention_cohorts_json}
Per-type retention: {per_type_retention_json}
Summary: {summary_json}

Respond in this JSON format:
{{
  "d7_assessment": "what D7 retention means for this product specifically",
  "d30_assessment": "what D30 retention means",
  "main_churn_trigger": "the specific transaction type or moment where most users leave and never return",
  "power_user_signal": "what your most retained wallets do differently from churned wallets",
  "retention_grade": "A | B | C | D | F"
}}""")
])

QUICK_WINS_PROMPT = ChatPromptTemplate.from_messages([
    ("system", """You identify high-leverage, low-effort product improvements for Solana app founders.
Quick wins must be implementable in under 24 hours. Be concrete, not generic.
Respond ONLY in valid JSON."""),
    ("human", """Based on these insights and metrics for {program_name}, list 3 quick wins:

Insights: {insights_json}
Metrics summary: {summary_json}

Respond in this JSON format:
{{
  "quick_wins": [
    "specific action the founder can implement today"
  ]
}}""")
])

HEADLINE_PROMPT = ChatPromptTemplate.from_messages([
    ("system", "You write punchy, specific one-sentence summaries for product analytics reports. No fluff. Reference actual numbers. Respond with plain text only."),
    ("human", """Write a headline for {program_name}'s analytics report based on these insights:

Top insight: {top_insight_json}
Health score: {health_score}

One sentence. Reference a specific number. Be direct.""")
])
