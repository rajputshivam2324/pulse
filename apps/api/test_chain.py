import asyncio
from dotenv import load_dotenv
load_dotenv()
from langchain_core.prompts import PromptTemplate
from services.ai.nodes import _get_model
from services.ai.prompts import ANOMALY_DETECTION_PROMPT

model = _get_model()
chain = ANOMALY_DETECTION_PROMPT | model
print(hasattr(chain, 'prompt'))
print(dir(chain))
try:
    print(chain.first)
except Exception as e:
    print(e)
