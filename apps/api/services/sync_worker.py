"""
Background worker: BLPOP sync job ids, run execute_sync_job_from_queue, update job status.

Started from FastAPI lifespan when PULSE_SYNC_WORKER_ENABLED is true (default).
"""

from __future__ import annotations

import asyncio
import logging

import httpx
from fastapi import HTTPException

logger = logging.getLogger(__name__)


async def run_sync_worker_task() -> None:
    """Loop until cancelled; processes Redis-backed sync jobs."""
    from routers import analytics as analytics_mod

    from services.sync_job_queue import (
        dequeue_sync_job,
        get_sync_job,
        mark_sync_job_completed,
        mark_sync_job_failed,
        mark_sync_job_running,
    )

    execute = analytics_mod.execute_sync_job_from_queue

    while True:
        job_id: str | None = None
        try:
            job_id = await dequeue_sync_job(timeout_seconds=5.0)
            if not job_id:
                continue

            job = await get_sync_job(job_id)
            if not job:
                logger.warning("sync_job_missing_after_dequeue", extra={"job_id": job_id})
                continue

            try:
                await mark_sync_job_running(job_id)
            except ValueError:
                logger.warning("sync_job_mark_running_missing", extra={"job_id": job_id})
                continue

            try:
                result = await execute(job["payload"])
                await mark_sync_job_completed(job_id, result)
            except HTTPException as he:
                detail = he.detail
                if not isinstance(detail, str):
                    detail = str(detail)
                await mark_sync_job_failed(job_id, detail)
            except httpx.HTTPStatusError as e:
                code = e.response.status_code
                hint = ""
                if code == 429:
                    hint = " (Helius rate limit — wait a few minutes, increase HELIUS_PAGE_DELAY_SEC, or upgrade Helius plan)"
                await mark_sync_job_failed(
                    job_id,
                    f"Upstream HTTP error ({code}){hint}",
                )
            except Exception as e:
                await mark_sync_job_failed(job_id, str(e))
        except asyncio.CancelledError:
            logger.info("sync_worker_cancelled")
            raise
        except Exception as e:
            logger.exception("sync_worker_loop_error", extra={"error": str(e), "job_id": job_id})
            if job_id:
                try:
                    await mark_sync_job_failed(job_id, str(e))
                except Exception:
                    pass
