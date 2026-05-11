import asyncio
import os
import logging
from dotenv import load_dotenv

logging.basicConfig(level=logging.INFO)
load_dotenv()

async def run_tests():
    from services.ai.graph import insight_pipeline
    from services.ai.state import InsightPipelineState

    print("\n=== AI Pipeline Test ===")
    initial_state: InsightPipelineState = {
        "metrics_payload": {
            "summary": {
                "total_wallets": 100, 
                "d7_retention_rate": 25.5, 
                "worst_funnel_drop_rate": 20,
                "worst_funnel_step": "1->2",
                "worst_first_type_for_retention": "SWAP",
                "worst_first_type_return_rate": 10.0
            }
        },
        "program_name": "Test Program",
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
            timeout=120,
        )
        print("Headline:", result.get("headline"))
        print("Health Score:", result.get("health_score"))
        print("Final Insights:", len(result.get("final_insights", [])))
        print("Execution Trace:", result.get("execution_trace"))
    except Exception as e:
        print("Error:", e)

if __name__ == "__main__":
    asyncio.run(run_tests())
