import asyncio
import os
import logging
from dotenv import load_dotenv

logging.basicConfig(level=logging.INFO)
load_dotenv()

async def run_tests():
    from services.ai.nodes import _get_model
    from langchain_core.messages import HumanMessage

    model = _get_model()
    try:
        res = await model.ainvoke([HumanMessage(content="Say Hello")])
        print("Response:", res.content)
    except Exception as e:
        print("Error Type:", type(e).__name__)
        print("Error Details:", str(e))
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(run_tests())
