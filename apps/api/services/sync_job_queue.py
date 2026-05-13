"""
Redis-backed FIFO queue for program sync jobs.

Purpose: decouple HTTP latency from Helius + Supabase + metrics work by
enqueueing a job and returning a job_id immediately. A worker process (or
background task) dequeues with BLPOP and runs the existing sync pipeline.

This module is tested in isolation; wiring into /analytics/sync is a separate step.

Keys (override with env if needed):
  PULSE_SYNC_QUEUE_KEY      — Redis list used as FIFO (default pulse:sync_jobs:queue)
  PULSE_SYNC_JOB_KEY_PREFIX — prefix for per-job JSON blobs (default pulse:sync_jobs:job:)
  PULSE_SYNC_JOB_TTL_SECONDS — TTL on job records (default 7 days)
"""

from __future__ import annotations

import json
import os
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from services.cache import get_redis_client

QUEUE_KEY = os.getenv("PULSE_SYNC_QUEUE_KEY", "pulse:sync_jobs:queue")
JOB_KEY_PREFIX = os.getenv("PULSE_SYNC_JOB_KEY_PREFIX", "pulse:sync_jobs:job:")
JOB_TTL_SECONDS = int(os.getenv("PULSE_SYNC_JOB_TTL_SECONDS", str(7 * 86400)))


def _job_key(job_id: str) -> str:
    return f"{JOB_KEY_PREFIX}{job_id}"


async def enqueue_sync_job(payload: dict[str, Any]) -> str:
    """
    Persist job metadata and push job_id onto the FIFO queue.
    Payload is opaque JSON (e.g. program_address, program_db_id, user_wallet, force).
    """
    job_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    doc: dict[str, Any] = {
        "job_id": job_id,
        "status": "pending",
        "payload": payload,
        "result": None,
        "error": None,
        "created_at": now,
        "updated_at": now,
    }
    r = get_redis_client()
    await r.set(_job_key(job_id), json.dumps(doc, default=str), ex=JOB_TTL_SECONDS)
    await r.rpush(QUEUE_KEY, job_id)
    return job_id


async def get_sync_job(job_id: str) -> Optional[dict[str, Any]]:
    """Return job document or None if missing/expired."""
    r = get_redis_client()
    raw = await r.get(_job_key(job_id))
    if not raw:
        return None
    return json.loads(raw)


async def _save_job(job_id: str, doc: dict[str, Any]) -> None:
    doc["updated_at"] = datetime.now(timezone.utc).isoformat()
    r = get_redis_client()
    await r.set(_job_key(job_id), json.dumps(doc, default=str), ex=JOB_TTL_SECONDS)


async def mark_sync_job_running(job_id: str) -> None:
    job = await get_sync_job(job_id)
    if not job:
        raise ValueError(f"Unknown job_id: {job_id}")
    job["status"] = "running"
    job["error"] = None
    await _save_job(job_id, job)


async def mark_sync_job_completed(job_id: str, result: dict[str, Any]) -> None:
    job = await get_sync_job(job_id)
    if not job:
        raise ValueError(f"Unknown job_id: {job_id}")
    job["status"] = "completed"
    job["result"] = result
    job["error"] = None
    await _save_job(job_id, job)


async def mark_sync_job_failed(job_id: str, error: str) -> None:
    job = await get_sync_job(job_id)
    if not job:
        raise ValueError(f"Unknown job_id: {job_id}")
    job["status"] = "failed"
    job["error"] = error
    job["result"] = None
    await _save_job(job_id, job)


async def dequeue_sync_job(timeout_seconds: float = 5.0) -> Optional[str]:
    """
    Blocking left-pop from the FIFO queue (RPUSH + BLPOP).
    Returns job_id, or None when the queue is empty until timeout.

    Callers should mark the job running immediately after receiving an id.
    """
    r = get_redis_client()
    to = max(1, int(timeout_seconds))
    item = await r.blpop(QUEUE_KEY, timeout=to)
    if not item:
        return None
    _key, job_id = item
    return str(job_id)


async def sync_queue_length() -> int:
    """Number of jobs waiting in the queue (not including running work)."""
    r = get_redis_client()
    n = await r.llen(QUEUE_KEY)
    return int(n)
