---
name: nextjs-web3
description: >
  Use when working in apps/web — the Next.js 16 + React 19 frontend. Covers wallet
  auth (SIWS), dashboard pages, Zustand store, Recharts charts, Supabase client,
  Tailwind v4, Solana wallet adapter, plan gating, and API route handlers.
  Trigger words: apps/web, Next.js, page.tsx, layout.tsx, WalletProvider,
  useStore, dashboard, InsightsPanel, Charts, SubscriptionCheckout, connect,
  onboarding, settings, zustand, recharts, tailwind, SIWS, nonce, verify.
version: "1.0"
---

# Skill: Next.js Web3 — Pulse Frontend

## Stack

| Layer         | Package / Version                                    |
|---------------|------------------------------------------------------|
| Framework     | Next.js 16.2.4 (App Router)                          |
| React         | 19.2.4                                               |
| Styling       | Tailwind CSS v4 (`@tailwindcss/postcss`)             |
| State         | Zustand 5.x                                          |
| Charts        | Recharts 3.x                                         |
| Wallet        | `@solana/wallet-adapter-react` 0.15.x                |
| Solana        | `@solana/web3.js` 1.98.x                             |
| Auth          | SIWS (Sign-In With Solana) + JWT (`jose` 6.x)        |
| Data          | Supabase JS client                                   |
| Crypto        | `tweetnacl` (signature verify), `bs58` (encoding)   |

> ⚠️ **This is Next.js 16 with React 19.** APIs differ from Next.js 14/15.
> Before writing any App Router code, check `node_modules/next/dist/docs/` for breaking changes.
> The `apps/web/CLAUDE.md` file already warns: "This is NOT the Next.js you know."

---

## File Structure

```
apps/web/src/
├── app/
│   ├── layout.tsx                        # Root layout — WalletProvider wraps everything
│   ├── page.tsx                          # Landing page
│   ├── globals.css                       # Tailwind v4 imports
│   ├── favicon.ico
│   ├── (auth)/
│   │   └── connect/page.tsx             # Wallet connect + SIWS flow
│   ├── (dashboard)/
│   │   ├── dashboard/[programId]/page.tsx  # Main analytics dashboard
│   │   ├── onboarding/page.tsx           # Register first program
│   │   └── settings/page.tsx            # Plan/subscription settings
│   └── api/
│       ├── auth/
│       │   ├── nonce/route.ts           # GET — generate nonce for SIWS
│       │   └── verify/route.ts          # POST — verify signature, issue JWT
│       └── programs/route.ts            # GET/POST — list/register programs
├── components/
│   ├── StoreHydrator.tsx                # Hydrates Zustand from server
│   ├── dashboard/
│   │   ├── Charts.tsx                   # Recharts wrappers (DAW, retention, funnel)
│   │   ├── InsightsPanel.tsx            # AI insights display panel
│   │   └── SubscriptionCheckout.tsx     # SOL payment + on-chain sub init
│   └── wallet/
│       └── WalletProvider.tsx           # Solana wallet adapter setup
├── lib/
│   ├── auth.ts                          # JWT sign/verify helpers
│   ├── plans.ts                         # PLAN_LIMITS, canAccess(), getPlanLabel()
│   └── supabase.ts                      # Supabase client singleton
└── store/
    └── index.ts                         # Zustand store (wallet, program, metrics state)
```

---

## Authentication Flow (SIWS)

1. User clicks "Connect Wallet" → `apps/web/src/app/(auth)/connect/page.tsx`
2. Frontend calls `GET /api/auth/nonce` → returns a random nonce stored in Supabase
3. User signs message containing nonce with their Solana wallet (via wallet adapter)
4. Frontend calls `POST /api/auth/verify` with `{ publicKey, signature, message }`
5. Server verifies signature with `tweetnacl.sign.detached.verify`
6. Server issues a JWT (via `jose`) with `{ sub: publicKey, plan, programCount }`
7. JWT stored client-side; attached to all FastAPI calls as `Authorization: Bearer <token>`

---

## Zustand Store (`store/index.ts`)

Central state — do not bypass with local state for global concerns:
```ts
{
  walletAddress: string | null
  jwt: string | null
  plan: 'free' | 'team' | 'protocol'
  programCount: number
  selectedProgramId: string | null
  metrics: MetricsSummary | null
  insights: InsightsResponse | null
}
```
`StoreHydrator.tsx` pre-populates from cookies/localStorage on first render.

---

## Plan Gating (`lib/plans.ts`)

```ts
import { canAccess, PLAN_LIMITS } from '@/lib/plans'

// Check feature access
canAccess(plan, 'ai_insights')   // true/false
canAccess(plan, 'retention')

// Plan limits
PLAN_LIMITS.free.max_programs    // 1
PLAN_LIMITS.team.max_programs    // 5
PLAN_LIMITS.protocol.max_programs  // -1 (unlimited)
```

**UX rule:** Never completely hide gated features. Show blurred content with an upgrade CTA overlay so users understand what they're missing.

---

## Wallet Provider (`components/wallet/WalletProvider.tsx`)

Set up at root layout. Includes Phantom, Solflare, Backpack, and Ledger adapters.  
Always use `useWallet()` hook from `@solana/wallet-adapter-react` — never access wallet directly.

```tsx
// Correct
const { publicKey, signMessage, connected } = useWallet()

// Wrong — don't access window.solana directly
```

---

## Dashboard Page (`app/(dashboard)/dashboard/[programId]/page.tsx`)

Fetches metrics from FastAPI: `GET http://localhost:8000/analytics/metrics/{programId}`  
Fetches insights from FastAPI: `GET http://localhost:8000/insights/{programId}`  
Both calls require `Authorization: Bearer {jwt}` header.

If metrics are stale, triggers sync: `POST http://localhost:8000/analytics/sync/{programId}`

---

## Subscription Checkout (`components/dashboard/SubscriptionCheckout.tsx`)

Handles payment + on-chain subscription via:
1. Send SOL to `TREASURY_WALLET_ADDRESS` (from env)
2. Call FastAPI to detect payment and record subscription
3. Call Anchor program's `initialize_subscription` (or `update_subscription`) instruction
4. Uses `@solana/web3.js` `Transaction` + `sendAndConfirmTransaction`

---

## Charts (`components/dashboard/Charts.tsx`)

Recharts wrappers. All charts accept typed props:
- `DAWChart` — daily active wallets time series (`LineChart`)
- `RetentionHeatmap` — weekly cohort grid
- `FunnelChart` — funnel steps + drop rates (`BarChart`)
- `ChurnChart` — churn by transaction type (`PieChart`)

---

## Critical Rules

1. **App Router only** — do not use `pages/` directory.
2. **Server Components by default** — add `"use client"` only when needed (hooks, wallet, browser APIs).
3. **Tailwind v4** uses `@import "tailwindcss"` in CSS, not `@tailwind base/components/utilities`. Do not use v3 syntax.
4. **`jose`** not `jsonwebtoken` for JWT in Edge/Server Components (jsonwebtoken is Node-only).
5. **Never expose `SUPABASE_SERVICE_ROLE_KEY`** in client-side code — use anon key only on client.
6. **All wallet operations** must be inside components wrapped by `WalletProvider`.
7. **`canAccess()` before rendering** any paid feature — never trust plan from client state alone.

---

## Docs

- Next.js 16 App Router: https://nextjs.org/docs/app
- Solana Wallet Adapter: https://github.com/anza-xyz/wallet-adapter
- @solana/web3.js v1: https://solana-labs.github.io/solana-web3.js/
- Tailwind CSS v4: https://tailwindcss.com/docs/v4-beta
- Zustand v5: https://zustand.docs.pmnd.rs/
- Recharts: https://recharts.org/en-US/api
- jose (JWT): https://github.com/panva/jose
- Supabase JS: https://supabase.com/docs/reference/javascript/introduction