"""Tests for Redis-backed sync job queue (fakeredis; no real Redis required)."""

import os
import sys

import pytest
import pytest_asyncio

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


@pytest_asyncio.fixture
async def redis_client():
    """Inject an in-memory async Redis for the duration of each test."""
    import fakeredis.aioredis as faker_aioredis

    from services.cache import close_redis, inject_redis

    r = faker_aioredis.FakeRedis(decode_responses=True)
    inject_redis(r)
    yield r
    await r.flushall()
    await close_redis()


@pytest.mark.asyncio
async def test_enqueue_returns_job_and_is_pending(redis_client):
    from services import sync_job_queue as jq

    job_id = await jq.enqueue_sync_job({"program_address": "Prog111", "x": 1})
    assert len(job_id) == 36

    job = await jq.get_sync_job(job_id)
    assert job is not None
    assert job["status"] == "pending"
    assert job["payload"]["program_address"] == "Prog111"
    assert job["result"] is None
    assert job["error"] is None


@pytest.mark.asyncio
async def test_queue_length_increments(redis_client):
    from services import sync_job_queue as jq

    assert await jq.sync_queue_length() == 0
    await jq.enqueue_sync_job({"a": 1})
    assert await jq.sync_queue_length() == 1
    await jq.enqueue_sync_job({"b": 2})
    assert await jq.sync_queue_length() == 2


@pytest.mark.asyncio
async def test_fifo_dequeue_order(redis_client):
    from services import sync_job_queue as jq

    j1 = await jq.enqueue_sync_job({"order": 1})
    j2 = await jq.enqueue_sync_job({"order": 2})
    assert await jq.dequeue_sync_job(timeout_seconds=1) == j1
    assert await jq.dequeue_sync_job(timeout_seconds=1) == j2
    assert await jq.sync_queue_length() == 0


@pytest.mark.asyncio
async def test_dequeue_empty_times_out(redis_client):
    from services import sync_job_queue as jq

    out = await jq.dequeue_sync_job(timeout_seconds=1)
    assert out is None


@pytest.mark.asyncio
async def test_mark_running_completed_roundtrip(redis_client):
    from services import sync_job_queue as jq

    job_id = await jq.enqueue_sync_job({"program_address": "X"})
    popped = await jq.dequeue_sync_job(timeout_seconds=1)
    assert popped == job_id

    await jq.mark_sync_job_running(job_id)
    job = await jq.get_sync_job(job_id)
    assert job["status"] == "running"

    await jq.mark_sync_job_completed(job_id, {"metrics": {"ok": True}})
    job = await jq.get_sync_job(job_id)
    assert job["status"] == "completed"
    assert job["result"]["metrics"]["ok"] is True


@pytest.mark.asyncio
async def test_mark_failed(redis_client):
    from services import sync_job_queue as jq

    job_id = await jq.enqueue_sync_job({})
    await jq.dequeue_sync_job(timeout_seconds=1)
    await jq.mark_sync_job_running(job_id)
    await jq.mark_sync_job_failed(job_id, "Helius timeout")
    job = await jq.get_sync_job(job_id)
    assert job["status"] == "failed"
    assert "Helius" in job["error"]


@pytest.mark.asyncio
async def test_mark_unknown_job_raises(redis_client):
    from services import sync_job_queue as jq

    with pytest.raises(ValueError, match="Unknown job_id"):
        await jq.mark_sync_job_running("00000000-0000-0000-0000-000000000000")
