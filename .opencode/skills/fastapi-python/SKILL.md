---
name: fastapi-python
description: >
  Use when working in apps/api — the FastAPI Python backend. Covers routers
  (analytics, webhooks, insights), Pydantic schemas, Helius transaction fetching,
  Redis caching with Upstash, Supabase persistence, JWT auth, metrics engine,
  parser, and all Python service files. Trigger words: FastAPI, uvicorn,
  requirements.txt, main.py, routers/, services/, helius, anchorpy, solders,
  metrics, parser, cache_get, cache_set, /analytics/sync, /webhooks, /insights.
version: "1.0"
---

# Skill: FastAPI Python — Pulse API Backend

## Location & Entrypoint

```
apps/api/
├── main.py                      # FastAPI app, CORS, lifespan, router mounts
├── requirements.txt             # All deps — see below
├── .env.example                 # Required env vars
├── schema.sql                   # Supabase table definitions
├── models/schemas.py            # Pydantic request/response models
├── routers/
│   ├── analytics.py             # POST /analytics/sync/{address}, GET /analytics/metrics/{id}
│   ├── webhooks.py              # POST /webhooks/helius — real-time tx ingestion
│   └── insights.py             # GET /insights/{program_id} — AI analysis
└── services/
    ├── helius.py                # Helius Enhanced API client + Solana RPC fallback
    ├── parser.py                # Raw tx → normalized NormalizedTransaction dicts
    ├── metrics.py               # Pure metric functions: DAW, retention, funnel, churn
    ├── cache.py                 # Redis (Upstash) cache layer
    ├── auth.py                  # JWT validation
    └── ai/
        ├── graph.py             # LangGraph pipeline definition
        ├── nodes.py             # 7 node functions (async)
        ├── prompts.py           # ChatPromptTemplate definitions
        └── state.py             # InsightPipelineState TypedDict
```

---

## Running Locally

```bash
cd apps/api
cp .env.example .env            # fill in keys
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

Health check: `GET http://localhost:8000/health`  
Swagger UI: `http://localhost:8000/docs`

---

## Environment Variables

| Variable                  | Required | Description                                      |
|---------------------------|----------|--------------------------------------------------|
| `HELIUS_API_KEY`          | Yes      | Helius API key for Enhanced Transactions         |
| `HELIUS_WEBHOOK_SECRET`   | Yes      | HMAC secret for verifying Helius webhooks        |
| `NVIDIA_API_KEY`          | Yes      | NVIDIA NIM key — for Kimi K2 via NIM endpoints   |
| `SUPABASE_URL`            | Yes      | Supabase project URL                             |
| `SUPABASE_ANON_KEY`       | Yes      | Supabase anon key (public)                       |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes    | Supabase service role key (server-side only)     |
| `UPSTASH_REDIS_URL`       | Yes      | Upstash Redis REST URL                           |
| `UPSTASH_REDIS_TOKEN`     | Yes      | Upstash Redis REST token                         |
| `JWT_SECRET`              | Yes      | Secret for verifying Next.js-issued JWTs         |
| `TREASURY_WALLET_ADDRESS` | Yes      | Pulse treasury wallet for SOL payment detection  |
| `SOLANA_NETWORK`          | Yes      | `mainnet-beta` or `devnet`                       |
| `ANCHOR_PROGRAM_ID`       | Yes      | On-chain program ID (from Anchor.toml)           |
| `FRONTEND_URL`            | No       | CORS origin for frontend (default: localhost:3000)|
| `FASTAPI_HOST`            | No       | Bind host (default: 0.0.0.0)                    |
| `FASTAPI_PORT`            | No       | Bind port (default: 8000)                        |

---

## Key Dependencies (requirements.txt)

```
fastapi          # Web framework
uvicorn[standard] # ASGI server
httpx            # Async HTTP — Helius calls
supabase         # Supabase Python client
redis[asyncio]   # Upstash Redis (asyncio mode)
langchain        # LLM orchestration
langgraph        # Agent graph runtime
langchain-nvidia-ai-endpoints  # NVIDIA NIM / Kimi K2
langchain-core
pydantic         # Request/response validation
python-jose[cryptography]  # JWT decode/verify
anchorpy         # Anchor IDL client — on-chain subscription reads
solana           # Solana Python SDK
solders          # Low-level Solana types (pubkeys, etc.)
python-dotenv    # .env loading
pytest / pytest-asyncio  # Tests
```

---

## API Routes

### Analytics
| Method | Path                              | Description                                      |
|--------|-----------------------------------|--------------------------------------------------|
| POST   | `/analytics/sync/{address}`       | Full sync: Helius → parse → metrics → cache      |
| GET    | `/analytics/metrics/{program_id}` | Get cached metrics (404 if not synced)           |
| GET    | `/analytics/transactions/{id}`    | Get cached parsed transactions                   |

### Webhooks
| Method | Path               | Description                                               |
|--------|--------------------|-----------------------------------------------------------|
| POST   | `/webhooks/helius` | Receives Helius enhanced transaction POSTs in real-time   |

### Insights (AI)
| Method | Path                      | Description                                          |
|--------|---------------------------|------------------------------------------------------|
| GET    | `/insights/{program_id}`  | Run LangGraph pipeline, return structured insights   |

---

## Helius Service (`services/helius.py`)

- **Network-aware:** `SOLANA_NETWORK=devnet` → `api-devnet.helius.xyz`, else `api.helius.xyz`
- **Pagination:** `get_all_transactions(address, max_pages=50)` — fetches until empty batch
- **Devnet fallback:** If Helius returns nothing on devnet, falls back to `getSignaturesForAddress` + `getTransaction` via Solana RPC, converts to Helius-like format
- **Webhook registration:** `register_webhook(program_address, webhook_url)`

## Parser (`services/parser.py`)

Converts raw Helius enhanced transactions to `NormalizedTransaction` dicts:
```python
{
  "signature": str,
  "wallet_address": str,       # feePayer
  "timestamp": str,            # ISO 8601
  "transaction_type": str,     # e.g. "SWAP", "TRANSFER", "UNKNOWN"
  "program_id": str,
  "amount_sol": float,
  "token_mint": Optional[str],
}
```

## Metrics Engine (`services/metrics.py`)

All pure functions — no I/O, fully testable:
- `compute_daily_active_wallets(transactions, days=30)` → DAW time series
- `compute_retention_cohorts(transactions)` → weekly cohort retention table
- `compute_funnel_drop_off(transactions)` → step-by-step funnel with drop rates
- `compute_churn_by_type(transactions)` → churn rates per transaction type
- `build_metrics_payload(transactions)` → full payload dict consumed by AI pipeline

## Cache (`services/cache.py`)

Upstash Redis via `redis[asyncio]`:
```python
await cache_get(key)               # Returns None if missing
await cache_set(key, value, ttl_seconds=3600)
txn_cache_key(address)             # "txns:{address}"
metrics_cache_key(address)         # "metrics:{address}"
await close_redis()                # Call in lifespan shutdown
```

---

## AI Insight Pipeline (`services/ai/`)

LangGraph DAG — compile once (`insight_pipeline = build_insight_graph()`), reuse:

```
anomaly_detector → anomaly_ranker → ┌─ insight_generator ─┐
                                    ├─ retention_analyst  ─┤→ quick_win_extractor → output_assembler → END
                                    └─ health_scorer ──────┘
```

**Model:** `moonshotai/kimi-k2-instruct-0905` via NVIDIA NIM (`langchain-nvidia-ai-endpoints`)  
**Temperature:** 0.6  
**State:** `InsightPipelineState` TypedDict — passed between all nodes

**Output schema** (`InsightsResponse`):
```python
{
  "headline": str,
  "biggest_problem": str,
  "health_score": int,          # 0–100 weighted score
  "insights": [InsightItem],    # list of 4 structured insights
  "retention_diagnosis": dict,
  "quick_wins": [str],          # 3 actionable quick wins
  "execution_trace": [str],     # debug log of each node
}
```

---

## Pydantic Schemas (`models/schemas.py`)

Key models:
- `ProgramRegister` — `program_address`, `name?`, `network`
- `SyncRequest` — `program_address`, `program_name?`
- `MetricsSummary` — full metrics object
- `InsightsResponse` / `InsightItem` — AI output
- `HealthResponse` — `/health` endpoint

---

## Critical Rules

1. **Never import from `routers/` inside `services/`** — services are dependency-free.
2. **All Helius calls are async** — always use `async with httpx.AsyncClient()`.
3. **Cache before and after** — sync sets both `txn_cache_key` and `metrics_cache_key`.
4. **`safe_parse_json`** must be used for all LLM JSON responses — LLMs often wrap in ```json fences.
5. **Devnet fallback** in `helius.py` is only active when `SOLANA_NETWORK=devnet` — don't remove it.
6. **`close_redis()`** must be called in the FastAPI lifespan shutdown handler.
7. **Tests live in** `apps/api/tests/` — run with `pytest` from `apps/api/`.

---

## Docs

- FastAPI: https://fastapi.tiangolo.com/
- LangGraph: https://langchain-ai.github.io/langgraph/
- LangChain NVIDIA: https://python.langchain.com/docs/integrations/providers/nvidia/
- Helius Enhanced Transactions API: https://docs.helius.dev/solana-apis/enhanced-transactions-api
- Helius Webhooks: https://docs.helius.dev/webhooks-and-websockets/webhooks
- Upstash Redis Python: https://upstash.com/docs/redis/sdks/py/getstarted
- Supabase Python: https://supabase.com/docs/reference/python/introduction
- anchorpy: https://kevinheavey.github.io/anchorpy/