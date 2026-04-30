---
name: langgraph-ai
description: >
  Use when working on the AI insight pipeline in apps/api/services/ai/ — LangGraph
  graph definition, node functions, prompt templates, state TypedDict, or adding
  new nodes/edges. Also applies when debugging LLM output parsing, changing the
  NVIDIA NIM model, adjusting health scoring logic, or modifying the insight schema.
  Trigger words: LangGraph, StateGraph, langgraph, nodes.py, graph.py, prompts.py,
  anomaly_detector, insight_generator, retention_analyst, health_scorer,
  quick_win_extractor, output_assembler, Kimi K2, NVIDIA NIM, InsightPipelineState.
version: "1.0"
---

# Skill: LangGraph AI — Pulse Insight Pipeline

## Location

```
apps/api/services/ai/
├── graph.py     # StateGraph definition + compile
├── nodes.py     # 7 async node functions
├── prompts.py   # ChatPromptTemplate objects
└── state.py     # InsightPipelineState TypedDict
```

---

## Pipeline Architecture

```
anomaly_detector
      ↓
anomaly_ranker          (pure logic — no LLM)
      ↓ (fan-out)
┌─────────────────────────────────────┐
│  insight_generator  (LLM × 4)       │
│  retention_analyst  (LLM × 1)       │  ← parallel fan-out
│  health_scorer      (pure logic)    │
└─────────────────────────────────────┘
      ↓ (fan-in — all 3 must complete)
quick_win_extractor    (LLM × 1)
      ↓
output_assembler       (LLM × 1 for headline)
      ↓
     END
```

**Total LLM calls per pipeline run: up to 7** (4 insights + 1 retention + 1 quick_wins + 1 headline)

---

## Model Configuration

```python
from langchain_nvidia_ai_endpoints import ChatNVIDIA

model = ChatNVIDIA(
    model="moonshotai/kimi-k2-instruct-0905",
    api_key=os.getenv("NVIDIA_API_KEY"),
    temperature=0.6,
)
```

**Provider:** NVIDIA NIM (hosted inference)  
**Model:** Kimi K2 Instruct — strong at structured JSON output  
**Auth:** `NVIDIA_API_KEY` env var (never hardcode)  
**Docs:** https://python.langchain.com/docs/integrations/providers/nvidia/

---

## State Schema (`state.py`)

```python
class InsightPipelineState(TypedDict):
    # Input
    metrics_payload: dict          # Full output of build_metrics_payload()
    program_name: Optional[str]

    # Intermediate
    anomalies: list[dict]          # Output of anomaly_detector
    ranked_anomalies: list[dict]   # Output of anomaly_ranker (sorted by severity)
    raw_insights: list[dict]       # Output of insight_generator
    retention_diagnosis: dict      # Output of retention_analyst
    health_score: int              # Output of health_scorer (0–100)
    quick_wins: list[str]          # Output of quick_win_extractor

    # Final output
    headline: str
    biggest_problem: str
    final_insights: list[dict]
    execution_trace: list[str]     # Append-only debug log
```

---

## Node Reference

### Node 1: `anomaly_detector_node`
- **Input:** `metrics_payload`
- **LLM:** Yes — ANOMALY_DETECTION_PROMPT
- **Output:** `anomalies` — list of `{metric, observed_value, expected_range, severity, reason}`
- **Severities:** `critical`, `high`, `medium`, `low`

### Node 2: `anomaly_ranker_node`
- **Input:** `anomalies`
- **LLM:** No — sorts by severity: critical → high → medium → low
- **Output:** `ranked_anomalies`

### Node 3: `insight_generator_node` (fan-out)
- **Input:** `ranked_anomalies[:4]`, `program_name`, `metrics_payload.summary`
- **LLM:** Yes — INSIGHT_GENERATION_PROMPT × 4 (sequential, not parallel)
- **Output:** `raw_insights` — each `InsightItem`:
  ```python
  { "id": str, "finding": str, "why_it_matters": str,
    "severity": str, "recommendation": str, "metric_reference": str }
  ```

### Node 4: `retention_analyst_node` (fan-out)
- **Input:** `retention_cohorts[:20]`, `per_type_retention`, `summary`
- **LLM:** Yes — RETENTION_DIAGNOSIS_PROMPT
- **Output:** `retention_diagnosis`:
  ```python
  { "d7_assessment": str, "d30_assessment": str, "main_churn_trigger": str,
    "power_user_signal": str, "retention_grade": str }
  ```

### Node 5: `health_scorer_node` (fan-out)
- **LLM:** No — weighted formula:
  - D7 retention ≥30% → +20, ≥20% → +12, ≥10% → +5, else −10
  - D30 retention ≥15% → +15, ≥8% → +8, else −5
  - Funnel worst drop <30% → +15, <50% → +8, >70% → −10
  - −8 per critical anomaly
  - Clamped to [0, 100]
- **Output:** `health_score` (int)

### Node 6: `quick_win_extractor_node` (fan-in)
- **Input:** `raw_insights`, `metrics_payload.summary`, `program_name`
- **LLM:** Yes — QUICK_WINS_PROMPT
- **Output:** `quick_wins` — list of 3 concise action strings

### Node 7: `output_assembler_node`
- **Input:** All state
- **LLM:** Yes — HEADLINE_PROMPT (single sentence headline)
- **Output:** `headline`, `biggest_problem`, `final_insights`, updated `execution_trace`

---

## JSON Parsing

All LLM responses must go through `safe_parse_json`:

```python
def safe_parse_json(text: str) -> dict:
    cleaned = text.strip()
    if cleaned.startswith("```"):
        parts = cleaned.split("```")
        cleaned = parts[1] if len(parts) > 1 else cleaned
        if cleaned.startswith("json"):
            cleaned = cleaned[4:]
    return json.loads(cleaned.strip())
```

**Always wrap LLM calls in try/except** — nodes degrade gracefully, never crash the pipeline.

---

## Adding a New Node

1. Define the async function in `nodes.py`:
   ```python
   async def my_node(state: InsightPipelineState) -> dict:
       # ... logic ...
       trace = list(state.get("execution_trace", []))
       trace.append("my_node: description")
       return {"my_field": result, "execution_trace": trace}
   ```

2. Add to `InsightPipelineState` TypedDict in `state.py`

3. Register in `graph.py`:
   ```python
   graph.add_node("my_node", my_node)
   graph.add_edge("previous_node", "my_node")
   graph.add_edge("my_node", "next_node")
   ```

4. Update `InsightsResponse` schema in `models/schemas.py` if output changes.

---

## Prompts (`prompts.py`)

All prompts are `ChatPromptTemplate.from_messages([("system", ...), ("human", ...)])`.  
Input variables match what's passed in `chain.ainvoke({...})`:

| Prompt                     | Input Variables                                              |
|----------------------------|--------------------------------------------------------------|
| `ANOMALY_DETECTION_PROMPT` | `metrics_json`                                               |
| `INSIGHT_GENERATION_PROMPT`| `program_name`, `anomaly_json`, `metrics_summary_json`, `index` |
| `RETENTION_DIAGNOSIS_PROMPT`| `program_name`, `retention_cohorts_json`, `per_type_retention_json`, `summary_json` |
| `QUICK_WINS_PROMPT`        | `program_name`, `insights_json`, `summary_json`             |
| `HEADLINE_PROMPT`          | `program_name`, `top_insight_json`, `health_score`          |

---

## Critical Rules

1. **`insight_pipeline` is a singleton** — compiled once in `graph.py`, imported by the router. Never recompile on each request.
2. **Fan-out nodes** (`insight_generator`, `retention_analyst`, `health_scorer`) run in parallel — don't add sequential dependencies between them.
3. **`execution_trace` is append-only** — always do `list(state.get("execution_trace", []))` before appending.
4. **Graceful degradation** — every node's LLM call must be in try/except; return a sensible default on failure.
5. **Never hardcode API keys** — always use `os.getenv("NVIDIA_API_KEY")`.

---

## Docs

- LangGraph: https://langchain-ai.github.io/langgraph/
- LangGraph StateGraph API: https://langchain-ai.github.io/langgraph/reference/graphs/
- LangChain NVIDIA NIM: https://python.langchain.com/docs/integrations/providers/nvidia/
- Kimi K2 on NVIDIA: https://build.nvidia.com/moonshotai/kimi-k2-instruct
- ChatPromptTemplate: https://python.langchain.com/docs/how_to/prompts_chat/