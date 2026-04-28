"""
Redis Cache Layer for Pulse.
Uses Upstash Redis for caching metrics, transactions, and insights.
Uses a singleton connection pool to avoid creating connections per request.
"""

import redis.asyncio as redis
import json
import os
from typing import Optional, Any

# Singleton Redis client — initialized once, reused across requests.
# The URL already contains credentials, so no separate password needed.
_redis_client: Optional[redis.Redis] = None


def _get_redis_client() -> redis.Redis:
    """Get or create the singleton Redis client."""
    global _redis_client
    if _redis_client is None:
        _redis_client = redis.from_url(
            os.getenv("UPSTASH_REDIS_URL", "redis://localhost:6379"),
            decode_responses=False,
        )
    return _redis_client


async def cache_get(key: str) -> Optional[Any]:
    """Get a value from cache, returns None if not found."""
    r = _get_redis_client()
    value = await r.get(key)
    return json.loads(value) if value else None


async def cache_set(key: str, value: Any, ttl_seconds: int = 3600):
    """Set a value in cache with a TTL."""
    r = _get_redis_client()
    await r.setex(key, ttl_seconds, json.dumps(value, default=str))


async def cache_invalidate(key: str):
    """Delete a key from cache."""
    r = _get_redis_client()
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
