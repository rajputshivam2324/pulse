"""
LangGraph Pipeline Definition for Pulse AI Insights.
Builds a multi-node graph with fan-out/fan-in topology:

anomaly_detector → anomaly_ranker → [insight_generator, retention_analyst, health_scorer] → quick_win_extractor → output_assembler → END
"""

from langgraph.graph import StateGraph, END
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


def build_insight_graph():
    """
    Build the LangGraph insight pipeline.

    Graph flow:
    anomaly_detector
         ↓
    anomaly_ranker
         ↓
    [insight_generator, retention_analyst, health_scorer]  ← parallel fan-out
         ↓
    quick_win_extractor  ← fan-in (waits for all three)
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

    # Fan out to parallel nodes after ranking
    graph.add_edge("anomaly_ranker", "insight_generator")
    graph.add_edge("anomaly_ranker", "retention_analyst")
    graph.add_edge("anomaly_ranker", "health_scorer")

    # Fan back in — all three must complete before quick wins
    graph.add_edge("insight_generator", "quick_win_extractor")
    graph.add_edge("retention_analyst", "quick_win_extractor")
    graph.add_edge("health_scorer", "quick_win_extractor")

    # Final assembly
    graph.add_edge("quick_win_extractor", "output_assembler")
    graph.add_edge("output_assembler", END)

    return graph.compile()


# Singleton — compile once, reuse
insight_pipeline = build_insight_graph()
