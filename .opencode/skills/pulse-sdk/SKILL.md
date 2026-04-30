---
name: pulse-sdk
description: >
  Use when working on packages/sdk — the @pulse/sdk TypeScript tracking library
  that Solana founders embed in their frontends. Covers PulseTracker class,
  event batching, queue flushing, API endpoint config, and publishing to npm.
  Trigger words: packages/sdk, @pulse/sdk, PulseTracker, track(), trackWalletConnect(),
  trackTransaction(), flush(), destroy(), event queue, batch events, SDK install.
version: "1.0"
---

# Skill: @pulse/sdk — TypeScript Event Tracking SDK

## Location

```
packages/sdk/
└── src/
    └── index.ts     # Entire SDK — single file
```

---

## Installation (for end users)

```bash
npm install @pulse/sdk
# or
yarn add @pulse/sdk
# or
pnpm add @pulse/sdk
```

---

## Usage

```ts
import { PulseTracker } from '@pulse/sdk'

const pulse = new PulseTracker({
  programAddress: 'YOUR_SOLANA_PROGRAM_ADDRESS',
  apiKey: 'YOUR_PULSE_API_KEY',           // optional — for authenticated endpoints
  endpoint: 'https://api.usepulse.xyz',   // optional — defaults to production
})

// Track a custom event
pulse.track('swap_completed', { amount: 100, token: 'SOL' })

// Track wallet connection
pulse.trackWalletConnect(walletAddress)

// Track a transaction
pulse.trackTransaction(signature, 'SWAP', { amount: 0.5, slippage: 0.01 })

// Cleanup on unmount
pulse.destroy()
```

---

## API Reference

### `new PulseTracker(config: PulseConfig)`

```ts
interface PulseConfig {
  programAddress: string     // Required — Solana program address to attribute events to
  apiKey?: string            // Optional — sent as Bearer token in Authorization header
  endpoint?: string          // Optional — override API base URL
}
```

Auto-starts a 5-second flush interval on construction.

---

### `track(event: string, properties?: Record<string, unknown>): void`

Queues an event. Auto-flushes if queue reaches 10 items.

```ts
pulse.track('feature_used', { featureId: 'stake', version: '2.0' })
```

---

### `trackWalletConnect(walletAddress: string): void`

Shorthand for `track('wallet_connected', { walletAddress })`.

---

### `trackTransaction(signature: string, type: string, properties?: Record<string, unknown>): void`

Shorthand for `track('transaction', { signature, type, ...properties })`.

---

### `destroy(): void`

Clears the flush interval and fires one final flush. **Call this on component unmount.**

```ts
useEffect(() => {
  return () => pulse.destroy()
}, [])
```

---

## Internal Mechanics

**Queue:** Events are batched in `this.queue: TrackEvent[]`  
**Auto-flush:** Every 5 seconds via `setInterval`  
**Flush trigger:** Also fires immediately when queue ≥ 10 events  
**Endpoint:** `POST {endpoint}/events/batch`

```ts
// Payload sent to API
{
  "programAddress": "YOUR_PROGRAM_ADDRESS",
  "events": [
    {
      "event": "swap_completed",
      "properties": { "amount": 100, "token": "SOL" },
      "timestamp": "2026-04-29T12:00:00.000Z"
    }
  ]
}
```

**Headers:**
```
Content-Type: application/json
Authorization: Bearer <apiKey>    // only if apiKey provided
```

**On failure:** Events are re-queued at the front (`unshift`) for next flush attempt.

---

## Adding New Track Methods

When adding a new convenience method, follow this pattern:

```ts
trackMyEvent(param1: string, properties?: Record<string, unknown>): void {
  this.track('my_event_name', {
    param1,
    ...properties,
  })
}
```

Export it from `index.ts` — the class is the only public export.

---

## Building & Publishing

```bash
cd packages/sdk

# Build (requires tsconfig.json with outDir)
npx tsc

# Publish to npm
npm publish --access public
```

The package name is `@pulse/sdk` — ensure `package.json` has:
```json
{
  "name": "@pulse/sdk",
  "main": "dist/index.js",
  "types": "dist/index.d.ts"
}
```

---

## Critical Rules

1. **Zero dependencies** — this SDK is embedded in user frontends; keep bundle size minimal. No lodash, no axios.
2. **Never throw** — all errors are caught and logged with `console.warn('[Pulse] ...')`. Tracking should never break user apps.
3. **Re-queue on failure** — failed events go back to the front of the queue.
4. **`destroy()` must be called** on component unmount to prevent memory leaks from the interval.
5. **The `endpoint` must be configurable** so users can point to self-hosted or staging environments.
6. **No SSR assumptions** — `fetch` and `setInterval` are used directly; wrap in `typeof window !== 'undefined'` checks if adding Next.js/SSR support.