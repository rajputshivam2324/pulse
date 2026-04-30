---
name: pulse-agent
description: AI-Powered Product Analytics for Solana Founders
model: claude-sonnet-4
tools:
  read: true
  edit: true
  write: true
  glob: true
  grep: true
  list: true
  bash: true
  task: true
  question: true
---

# Pulse — Agent Guide

> **AI-Powered Product Analytics for Solana Founders**  
> Last updated: 2026-04-29

---

## What Is Pulse?

Pulse is a full-stack analytics platform for Solana dapp founders. It ingests on-chain transaction data via the Helius Enhanced API, computes product metrics (retention, DAW, funnel, churn), and surfaces AI-generated insights using a LangGraph pipeline backed by NVIDIA NIM / Kimi K2. Founders connect their Solana wallet, register their program address, and get a Mixpanel-like dashboard for their on-chain product — without writing any tracking code.

---

## Monorepo Structure

```
pulse/
├── apps/
│   ├── api/              # Python FastAPI backend (AI + analytics engine)
│   └── web/              # Next.js 16 + React 19 frontend
├── packages/
│   └── sdk/src/          # @pulse/sdk — TypeScript event tracking library
├── programs/
│   └── pulse-subscription/  # Anchor/Rust on-chain subscription program
└── arch.mmd              # Mermaid architecture diagram
```

---

## Stack at a Glance

| Layer         | Tech                                                                |
|---------------|---------------------------------------------------------------------|
| Frontend      | Next.js 16.2.4, React 19, Tailwind CSS v4, Zustand 5, Recharts 3   |
| Wallet Auth   | SIWS (Sign-In With Solana), @solana/wallet-adapter-react, jose JWT  |
| Backend       | Python 3.12+, FastAPI, uvicorn, httpx                               |
| AI Pipeline   | LangGraph, langchain-nvidia-ai-endpoints, Kimi K2 (NVIDIA NIM)      |
| Blockchain    | Solana (@solana/web3.js v1), Anchor 0.31+, anchorpy                 |
| On-chain      | Rust, anchor-lang — `programs/pulse-subscription`                   |
| Data Index    | Helius Enhanced Transactions API + Helius Webhooks                  |
| Database      | Supabase (PostgreSQL)                                               |
| Cache         | Upstash Redis (redis[asyncio] via HTTP REST)                         |
| SDK           | TypeScript, zero-dependency, batched event queue                    |

---

## Skills Available

Load the relevant skill before touching any layer of this codebase:

| Skill              | Triggers When Working On                                   |
|--------------------|------------------------------------------------------------|
| `solana-anchor`    | `programs/pulse-subscription/` — Rust, PDA, instructions  |
| `fastapi-python`   | `apps/api/` — routes, services, Helius, metrics, parser    |
| `langgraph-ai`     | `apps/api/services/ai/` — LangGraph nodes, prompts, state  |
| `nextjs-web3`      | `apps/web/` — pages, components, wallet, store, API routes |
| `pulse-sdk`        | `packages/sdk/` — @pulse/sdk tracking library              |
| `supabase-redis`   | Supabase schema/client or Upstash Redis cache layer        |

All skills live in `.opencode/skills/`. They are **project-scoped** (share via git).

---

## Key Env Files

```
apps/api/.env          # Copy from .env.example — required for backend
apps/web/.env.local    # Next.js env — NEXT_PUBLIC_ prefix for client vars
```

Critical variables:
- `HELIUS_API_KEY` — Helius Enhanced Transactions API
- `NVIDIA_API_KEY` — NVIDIA NIM for Kimi K2 LLM
- `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` — database
- `UPSTASH_REDIS_URL` + `UPSTASH_REDIS_TOKEN` — cache
- `JWT_SECRET` — shared between API and web for SIWS JWT verification
- `ANCHOR_PROGRAM_ID` — deployed on-chain program address
- `SOLANA_NETWORK` — `devnet` or `mainnet-beta`

---

## Running the Project

### Backend (FastAPI)

```bash
cd apps/api
cp .env.example .env     # Fill in all keys
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

- API: http://localhost:8000
- Swagger: http://localhost:8000/docs
- Health: http://localhost:8000/health

### Frontend (Next.js)

```bash
cd apps/web
npm install
cp .env.example .env.local   # Fill NEXT_PUBLIC_* vars
npm run dev
```

- App: http://localhost:3000

### On-chain Program (Anchor)

```bash
cd programs/pulse-subscription
anchor build             # Compile to SBF
anchor test              # Run ts-mocha tests
anchor deploy --provider.cluster devnet
```

Program ID (devnet): `6qVHRzwu1CuDgaCmtaZZwG1sKv1uEjBKkHUA62UYxsww`

---

## Authentication Flow

1. User visits `/connect` → wallet adapter modal → user selects wallet
2. Frontend: `GET /api/auth/nonce?wallet={pubkey}` → receives `nonce`
3. User signs: `nacl.sign.detached(Buffer.from(message), secretKey)`  
   Message format: `"Sign in to Pulse\nWallet: {pubkey}\nNonce: {nonce}"`
4. Frontend: `POST /api/auth/verify` `{ publicKey, signature, message }`
5. Server verifies with `tweetnacl`, issues JWT `{ sub: publicKey, plan, programCount }`
6. JWT stored client-side, passed as `Authorization: Bearer {jwt}` to FastAPI

---

## Subscription Plans (On-chain + Frontend)

| Tier     | On-chain `tier` | Price    | Programs | Features               |
|----------|-----------------|----------|----------|------------------------|
| Free     | 0               | $0       | 1        | Basic metrics only     |
| Team     | 1               | $99/mo   | 5        | + AI insights, retention, funnel |
| Protocol | 2               | $499/mo  | Unlimited| Everything             |

**Sync rule:** The values in `lib/plans.ts` → `PLAN_LIMITS` must always match the Rust program's `match sub.tier { 0 => 1, 1 => 5, 2 => 255 }`.

---

## Analytics Pipeline

```
User's dapp (Helius webhook / @pulse/sdk) 
    → POST /webhooks/helius
    → services/parser.py (normalize txns)
    → services/metrics.py (compute DAW, retention, funnel, churn)
    → Upstash Redis (cache for 1hr)
    → GET /insights/{id}
    → services/ai/graph.py (LangGraph pipeline)
    → InsightsResponse (headline, health_score, insights, quick_wins)
```

Full sync (historical): `POST /analytics/sync/{address}` — fetches all history from Helius, parses, caches.  
Real-time: Helius Webhook → `POST /webhooks/helius` — processes each new transaction as it lands.

---

## Architecture Diagram

See `arch.mmd` (Mermaid) at the repo root. Render with any Mermaid viewer or:

```bash
npx mmdc -i arch.mmd -o arch.png
```

---

## Code Conventions

### Python (apps/api)
- Python 3.12+ — use `list[dict]`, `str | None` syntax (not `List`, `Optional`)
- All I/O functions are `async` — use `await` everywhere
- Pydantic v2 for schemas — use `model_validate()` not `.parse_obj()`
- `safe_parse_json()` for all LLM JSON responses
- Never import from `routers/` inside `services/` — one-way dependency

### TypeScript (apps/web, packages/sdk)
- Strict TypeScript — no `any`
- App Router only — no `pages/` directory
- `"use client"` only when using hooks or browser APIs
- Tailwind v4: `@import "tailwindcss"` — do not use v3 directives
- `jose` for JWT (not `jsonwebtoken`) in Edge/Server Components

### Rust (programs/)
- Use `#[derive(InitSpace)]` — never hardcode space sizes
- All custom errors via `#[error_code]` enum, never `panic!`
- Emit events for all state changes that clients need to react to

---

## Important Constraints

- **NVIDIA_API_KEY** — The Kimi K2 model runs via NVIDIA NIM. Key must be in env; never hardcode.
- **Helius devnet fallback** — When `SOLANA_NETWORK=devnet` and Helius returns empty, the service automatically falls back to `api.devnet.solana.com` via `getSignaturesForAddress`.
- **PDA seeds are immutable** — `["subscription", owner_pubkey]` — changing these breaks all existing accounts.
- **Service role key** — `SUPABASE_SERVICE_ROLE_KEY` is server-only; never in `NEXT_PUBLIC_*` vars.
- **Plan limits must be in sync** — `programs/pulse-subscription/src/lib.rs` and `apps/web/src/lib/plans.ts` must agree.

---

## Docs & References

| Topic                         | URL                                                                   |
|-------------------------------|-----------------------------------------------------------------------|
| Helius Enhanced Transactions  | https://docs.helius.dev/solana-apis/enhanced-transactions-api        |
| Helius Webhooks               | https://docs.helius.dev/webhooks-and-websockets/webhooks             |
| Anchor Book                   | https://book.anchor-lang.com/                                        |
| Anchor Docs (docs.rs)         | https://docs.rs/anchor-lang/latest/anchor_lang/                      |
| Solana Cookbook               | https://solanacookbook.com/                                          |
| Solana RPC API                | https://solana.com/docs/rpc                                          |
| LangGraph                     | https://langchain-ai.github.io/langgraph/                            |
| LangChain NVIDIA NIM          | https://python.langchain.com/docs/integrations/providers/nvidia/     |
| Kimi K2 on NVIDIA             | https://build.nvidia.com/moonshotai/kimi-k2-instruct                 |
| FastAPI                       | https://fastapi.tiangolo.com/                                        |
| Next.js 16 App Router         | https://nextjs.org/docs/app                                          |
| Tailwind CSS v4               | https://tailwindcss.com/docs/v4-beta                                 |
| Solana Wallet Adapter         | https://github.com/anza-xyz/wallet-adapter                           |
| @solana/web3.js v1            | https://solana-labs.github.io/solana-web3.js/                        |
| Zustand v5                    | https://zustand.docs.pmnd.rs/                                         |
| Recharts                      | https://recharts.org/en-US/api                                       |
| jose (JWT)                    | https://github.com/panva/jose                                        |
| Supabase Python               | https://supabase.com/docs/reference/python/introduction              |
| Supabase JS                   | https://supabase.com/docs/reference/javascript/introduction        |
| Upstash Redis                 | https://upstash.com/docs/redis/sdks/py/getstarted                   |
| anchorpy                      | https://kevinheavey.github.io/anchorpy/                              |