"""
Redis Cache Layer for Pulse.
Uses Upstash Redis for caching metrics, transactions, and insights.
Redis client is injected via FastAPI lifespan — no lazy singletons.
"""

import redis.asyncio as redis
import json
import os
from typing import Optional, Any

# Module-level redis client — injected via inject_redis()
_redis_client: Optional[redis.Redis] = None


def inject_redis(client: redis.Redis) -> None:
    """Inject the Redis client from the FastAPI lifespan."""
    global _redis_client
    _redis_client = client


def _get_redis() -> redis.Redis:
    """Get the injected Redis client."""
    if _redis_client is None:
        raise RuntimeError("Redis client not initialized. Call inject_redis() in the lifespan.")
    return _redis_client


async def cache_get(key: str) -> Optional[Any]:
    """Get a value from cache, returns None if not found."""
    r = _get_redis()
    value = await r.get(key)
    return json.loads(value) if value else None


async def cache_set(key: str, value: Any, ttl_seconds: int = 3600):
    """Set a value in cache with a TTL."""
    r = _get_redis()
    await r.setex(key, ttl_seconds, json.dumps(value, default=str))


async def cache_invalidate(key: str):
    """Delete a key from cache."""
    r = _get_redis()
    await r.delete(key)


async def close_redis():
    """Close the Redis connection. Call on app shutdown."""
    global _redis_client
    if _redis_client is not None:
        await _redis_client.aclose()
        _redis_client = None


def txn_cache_key(program_address: str) -> str:
    """Cache key for raw transactions."""
    return f"txns:{program_address}"


def metrics_cache_key(program_id: str) -> str:
    """Cache key for computed metrics."""
    return f"metrics:{program_id}"


def insights_cache_key(program_id: str) -> str:
    """Cache key for AI-generated insights."""
    return f"insights:{program_id}"