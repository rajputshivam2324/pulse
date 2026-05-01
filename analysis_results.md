# Codebase Review & Security Analysis Report

This document contains findings from the comprehensive code review of the Pulse codebase.

## Phase 1: Security & Authentication

### Next.js Authentication (`apps/web/src/app/api/auth/verify/route.ts`)
- **Finding**: The nonce verification logic assumes `req.json()` returns an object with `{ wallet, signature, nonce }`, but `signature` is cast into `new Uint8Array(signature)`. If `signature` is an array of numbers sent from the client, this works, but Next.js clients might send it as a base58 string or something else depending on `@solana/wallet-adapter-react`. I need to check how the client sends it.
- **Finding**: The in-memory fallback `nonceStoreFallback` is fine for local dev but in production, if running on Vercel (Edge or Serverless), memory is not shared across instances. If Redis fails, authentication will fail inconsistently. This should only be used if `NODE_ENV === 'development'`.

### FastAPI Backend Authentication (`apps/api/services/auth.py`)
- **Pass**: JWT is securely validated using `HS256` and the correct secret. `require_auth` correctly extracts the `wallet` claim.
- **Pass**: Routers (`analytics.py` and `insights.py`) correctly cross-reference the JWT wallet claim with the `users` table, and then verify ownership of the requested `program_id`.

## Phase 2: Architecture & Data Pipeline (Backend)

### Webhooks Integration (`apps/api/routers/webhooks.py`)
- **Pass**: HMAC-SHA256 signature verification is implemented using `hmac.compare_digest` to prevent timing attacks.
- **Flaw (Data Consistency)**: The webhook endpoint processes incoming transactions and updates the Redis cache but **does not persist them to Supabase**. Because Redis is ephemeral (1 hour TTL), if the `/analytics/sync/{address}` endpoint isn't called before the cache expires, those real-time transactions are lost until a full sync is manually triggered. Webhooks should insert directly into the `transactions` table.

### Metrics Engine (`apps/api/services/metrics.py`)
- **Pass**: Logic for cohort retention and funnel calculations is sound and properly handles timezone offsets.
- **Flaw (Performance)**: The metrics computation functions (`compute_retention_cohorts`, etc.) parse thousands of date strings synchronously. In `analytics.py`, `build_metrics_payload(deduped)` is called directly within the async route handler. This blocks the FastAPI async event loop, which will cause severe performance degradation and timeout errors under heavy concurrent load.

## Phase 3: Frontend Code Quality

### State Management (`apps/web/src/store/index.ts`)
- **Pass**: Zustand is used effectively with a lazy hydration pattern (`_hydrate`) that prevents React 18+ strict mode/SSR mismatch errors.
- **Flaw (Security)**: The JWT token is persisted to `localStorage` instead of an `HttpOnly` cookie. While common in Web3 apps because the wallet itself is accessible to client scripts, it does make the session vulnerable to XSS if any 3rd party scripts are compromised.

## Phase 4: On-chain Program Review (Solana Anchor)

### Smart Contract Logic (`programs/pulse-subscription/programs/pulse-subscription/src/lib.rs`)
- **CRITICAL VULNERABILITY (Authorization Bypass)**: The `update_subscription` and `initialize_subscription` instructions allow the `owner` (the user) to pass in any `tier` and `expires_at` value. Since the program does **not** enforce an SPL token transfer (USDC payment) atomically within the instruction, **any user can manually construct a transaction to upgrade their own account to the highest paid tier for free**. 
- **Fix Recommendation**: Either the program must atomically execute a `token::transfer` of USDC from the user to a treasury account based on the requested `tier`, OR the program must only allow a privileged backend `admin` keypair to call these instructions after verifying the payment off-chain.
