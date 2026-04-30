"""
LangGraph Pipeline Definition for Pulse AI Insights.
Builds a multi-node graph with fan-out/fan-in topology.

anomaly_detector → anomaly_ranker → [insight_generator, retention_analyst, health_scorer] → quick_win_extractor → output_assembler → END

Parallelism: after anomaly_ranker, the three analysis nodes are dispatched
using langgraph.graph.Send for true concurrent execution before fan-in.
"""

from langgraph.graph import StateGraph, END
from langgraph.types import Send
from .state import InsightPipelineState
from .nodes import (
    anomaly_detector_node,
    anomaly_ranker_node,
    insight_generator_node,
    retention_analyst_node,
    health_scorer_node,
    quick_win_extractor_node,
    output_assembler_node,
)


def _fan_out_analysts(state: InsightPipelineState) -> list[Send]:
    """
    Dispatch all three analyst nodes in true parallel via Send.
    Each gets the full state and returns a partial update.
    """
    return [
        Send("insight_generator", state),
        Send("retention_analyst", state),
        Send("health_scorer", state),
    ]


def build_insight_graph():
    """
    Build the LangGraph insight pipeline.

    Graph flow:
    anomaly_detector
         ↓
    anomaly_ranker
         ↓  (conditional fan-out — all three analysts run truly in parallel)
    [insight_generator, retention_analyst, health_scorer]  ← Send-based parallel
         ↓  (fan-in — quick_win_extractor waits for all three)
    quick_win_extractor
         ↓
    output_assembler
         ↓
        END
    """
    graph = StateGraph(InsightPipelineState)

    # Add all nodes
    graph.add_node("anomaly_detector", anomaly_detector_node)
    graph.add_node("anomaly_ranker", anomaly_ranker_node)
    graph.add_node("insight_generator", insight_generator_node)
    graph.add_node("retention_analyst", retention_analyst_node)
    graph.add_node("health_scorer", health_scorer_node)
    graph.add_node("quick_win_extractor", quick_win_extractor_node)
    graph.add_node("output_assembler", output_assembler_node)

    # Set entry point
    graph.set_entry_point("anomaly_detector")

    # Sequential: detect → rank
    graph.add_edge("anomaly_detector", "anomaly_ranker")

    # Fan-out in parallel via conditional edge — all three analysts run concurrently
    graph.add_conditional_edges(
        "anomaly_ranker",
        _fan_out_analysts,
    )

    # Fan-in: wait for all three before proceeding to quick_win_extractor
    # (LangGraph automatically waits for all Send targets to complete)
    graph.add_edge("insight_generator", "quick_win_extractor")
    graph.add_edge("retention_analyst", "quick_win_extractor")
    graph.add_edge("health_scorer", "quick_win_extractor")

    # Final assembly
    graph.add_edge("quick_win_extractor", "output_assembler")
    graph.add_edge("output_assembler", END)

    return graph.compile()


# Singleton — compile once, reuse across all requests
insight_pipeline = build_insight_graph()