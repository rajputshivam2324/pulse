import asyncio
import os
import logging
from dotenv import load_dotenv

logging.basicConfig(level=logging.INFO)
load_dotenv()

async def run_tests():
    from services.ai.nodes import check_ai_health
    from services.ai.followup import answer_followup

    print("=== AI Health Check ===")
    health = check_ai_health()
    print(health)

    print("\n=== AI Followup Test ===")
    try:
        res = await answer_followup(
            question="Please write a very detailed report (more than 300 characters) about the retention metrics of this program. Make sure to use markdown headings (###) and bullet points (-). Talk about the 25.5% D7 retention.",
            metrics={"summary": {"total_wallets": 100, "d7_retention_rate": 25.5, "worst_funnel_drop_rate": 20}},
            insights={"insights": [{"finding": "Retention is good", "why_it_matters": "Good retention", "recommendation": "Keep it up"}]},
            program_name="Test Program",
            conversation_history=None
        )
        print("Answer:", res.get("answer"))
        print("Used Fallback:", res.get("used_fallback", False))
    except Exception as e:
        print("Error:", e)

if __name__ == "__main__":
    asyncio.run(run_tests())
