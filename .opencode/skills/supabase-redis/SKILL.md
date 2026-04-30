---
name: supabase-redis
description: >
  Use when working with Supabase (database schema, auth, RLS) or Upstash Redis
  (caching, cache keys, TTL strategy) in this project. Covers schema.sql table
  definitions, Supabase Python/JS client usage, cache service patterns, and
  Redis key conventions. Trigger words: Supabase, schema.sql, supabase.ts,
  SUPABASE_URL, cache_get, cache_set, Upstash, UPSTASH_REDIS_URL, Redis, TTL,
  RLS, row level security, programs table, wallets table.
version: "1.0"
---

# Skill: Supabase + Redis — Pulse Data Layer

## Supabase

### Schema (`apps/api/schema.sql`)

Supabase is the persistent store for program metadata and analytics events.

Key tables (read `schema.sql` for the full DDL):

```sql
-- Programs registered by founders
programs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  program_address TEXT UNIQUE NOT NULL,
  name TEXT,
  network TEXT DEFAULT 'mainnet',
  owner_wallet TEXT NOT NULL,       -- wallet that registered the program
  created_at TIMESTAMPTZ DEFAULT now(),
  last_synced_at TIMESTAMPTZ
)

-- Normalized transactions (written by /analytics/sync and /webhooks/helius)
transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id UUID REFERENCES programs(id),
  signature TEXT UNIQUE NOT NULL,
  wallet_address TEXT NOT NULL,
  transaction_type TEXT,
  amount_sol FLOAT,
  token_mint TEXT,
  timestamp TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
)
```

---

### Python Client (`apps/api/services/`)

```python
from supabase import create_client
import os

supabase = create_client(
    os.getenv("SUPABASE_URL"),
    os.getenv("SUPABASE_SERVICE_ROLE_KEY"),  # Server-side: use service role
)

# Select
result = supabase.table("programs").select("*").eq("owner_wallet", wallet).execute()

# Insert
supabase.table("programs").insert({
    "program_address": address,
    "owner_wallet": wallet,
    "network": "mainnet",
}).execute()

# Update
supabase.table("programs").update({"last_synced_at": "now()"}).eq("id", prog_id).execute()
```

---

### JavaScript Client (`apps/web/src/lib/supabase.ts`)

```ts
import { createClient } from '@supabase/supabase-js'

// Client-side: use anon key only
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
)

// Server-side (API routes): use service role key
import { createClient } from '@supabase/supabase-js'
const supabaseAdmin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!)
```

**Key env vars:**
- `SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_URL` — project URL
- `SUPABASE_ANON_KEY` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` — safe for client
- `SUPABASE_SERVICE_ROLE_KEY` — server-only, never expose to browser

---

### Row-Level Security

All tables should have RLS enabled. The backend uses the service role key which bypasses RLS. The frontend uses the anon key with RLS policies.

Typical policy pattern for `programs`:
```sql
CREATE POLICY "Users can read own programs"
ON programs FOR SELECT
USING (owner_wallet = auth.jwt() ->> 'sub');
```

---

## Redis (Upstash)

### Cache Service (`apps/api/services/cache.py`)

Upstash Redis via HTTP-based REST client (`redis[asyncio]`):

```python
import redis.asyncio as redis
import os, json

_client = None

async def get_redis():
    global _client
    if _client is None:
        _client = redis.from_url(
            os.getenv("UPSTASH_REDIS_URL"),
            password=os.getenv("UPSTASH_REDIS_TOKEN"),
            decode_responses=True,
        )
    return _client

async def cache_get(key: str):
    r = await get_redis()
    val = await r.get(key)
    return json.loads(val) if val else None

async def cache_set(key: str, value, ttl_seconds: int = 3600):
    r = await get_redis()
    await r.setex(key, ttl_seconds, json.dumps(value))

async def close_redis():
    global _client
    if _client:
        await _client.aclose()
        _client = None
```

---

### Cache Key Conventions

| Key Pattern              | Helper Function           | TTL      | Contains                         |
|--------------------------|---------------------------|----------|----------------------------------|
| `txns:{program_address}` | `txn_cache_key(address)`  | 1 hour   | List of NormalizedTransaction dicts |
| `metrics:{program_id}`   | `metrics_cache_key(id)`   | 1 hour   | Full metrics payload dict        |
| `insights:{program_id}`  | (inline in router)        | 30 min   | InsightsResponse dict            |
| `nonce:{wallet}`         | (in auth route)           | 5 min    | SIWS nonce string                |

---

### TTL Strategy

- **Transactions:** 1 hour — re-sync refreshes the cache
- **Metrics:** 1 hour — derived from transactions, same TTL
- **Insights:** 30 min — AI is slow and expensive; short-circuit if cached
- **Nonces:** 5 min — must expire quickly for security

---

### Upstash vs Standard Redis

Upstash is accessed via HTTP REST in serverless environments. The `redis[asyncio]` package with `from_url()` handles this transparently when the URL is an Upstash REST URL (`https://...upstash.io`).

**Do not use** `redis.ConnectionPool` or `redis.StrictRedis` — use only `redis.asyncio.from_url()`.

---

## Critical Rules

1. **Service role key = server only.** Never send `SUPABASE_SERVICE_ROLE_KEY` to the client — it bypasses all RLS.
2. **Always check cache first** before hitting Helius API — saves quota and latency.
3. **`close_redis()`** must be called in FastAPI lifespan shutdown to prevent connection leaks.
4. **JSON serialize everything** going into Redis — `cache_set` calls `json.dumps`, `cache_get` calls `json.loads`.
5. **Migrations:** Use Supabase's migration system (`supabase db push`) — never alter `schema.sql` without a corresponding migration.

---

## Docs

- Supabase Python: https://supabase.com/docs/reference/python/introduction
- Supabase JS: https://supabase.com/docs/reference/javascript/introduction
- Supabase RLS: https://supabase.com/docs/guides/auth/row-level-security
- Upstash Redis: https://upstash.com/docs/redis/sdks/py/getstarted
- redis-py asyncio: https://redis-py.readthedocs.io/en/stable/examples/asyncio_examples.html