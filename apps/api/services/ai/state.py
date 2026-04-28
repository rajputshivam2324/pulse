"""
LangGraph State Schema for Pulse AI Insight Pipeline.
Defines the typed state that flows through all graph nodes.
"""

from typing import TypedDict, Optional, Annotated
import operator


class MetricsSummary(TypedDict):
    """Summary metrics extracted from the full metrics payload."""
    total_wallets: int
    avg_daily_active_wallets: float
    d7_retention_rate: float
    d30_retention_rate: float
    worst_funnel_step: Optional[int]
    worst_funnel_drop_rate: Optional[float]
    highest_churn_transaction_type: Optional[str]
    highest_churn_rate: Optional[float]
    best_first_type_for_retention: Optional[str]
    best_first_type_return_rate: Optional[float]
    worst_first_type_for_retention: Optional[str]
    worst_first_type_return_rate: Optional[float]


class InsightItem(TypedDict):
    """A single structured insight produced by the pipeline."""
    id: str
    finding: str
    why_it_matters: str
    severity: str          # critical | high | medium | low
    recommendation: str
    metric_reference: str


class InsightPipelineState(TypedDict):
    """
    Complete state schema for the LangGraph insight pipeline.
    State is built up progressively as the graph executes.
    """
    # Input
    metrics_payload: dict
    program_name: Optional[str]

    # Node outputs — built up as graph executes
    anomalies: Annotated[list[dict], operator.add]          # from anomaly_detector node
    ranked_anomalies: list[dict]                             # from ranker node
    raw_insights: Annotated[list[InsightItem], operator.add] # from insight_generator node
    retention_diagnosis: dict                                # from retention_analyst node
    quick_wins: list[str]                                    # from quick_win_extractor node
    health_score: int                                        # from scorer node

    # Final output
    headline: str
    biggest_problem: str
    final_insights: list[InsightItem]
    execution_trace: Annotated[list[str], operator.add]
