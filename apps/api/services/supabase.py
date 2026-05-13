"""
Supabase client singleton for FastAPI backend.
Uses SUPABASE_SERVICE_ROLE_KEY for server-side operations.

The official client is synchronous; calling .execute() inside async route
handlers blocks the whole event loop. Use sb_execute() from async code.
"""

import os
from typing import Any

import httpx
from postgrest.constants import DEFAULT_POSTGREST_CLIENT_TIMEOUT
from starlette.concurrency import run_in_threadpool
from supabase import create_client
from supabase.lib.client_options import SyncClientOptions
from tenacity import retry, retry_if_exception_type, stop_after_attempt, wait_exponential

_supabase_client = None


def _supabase_httpx_client() -> httpx.Client:
    """Shared sync httpx client for PostgREST, Auth, Storage, and Edge Functions.

    postgrest-py defaults to HTTP/2. On some hosts (e.g. Render) that path can
    raise ``httpx.ReadError: [Errno 11] Resource temporarily unavailable`` during
    reads. HTTP/1.1 avoids that class of httpcore/http2 hiccups.
    """
    return httpx.Client(
        follow_redirects=True,
        http2=False,
        timeout=httpx.Timeout(DEFAULT_POSTGREST_CLIENT_TIMEOUT),
    )


def get_supabase():
    """Get or create the Supabase client singleton."""
    global _supabase_client
    if _supabase_client is None:
        _supabase_client = create_client(
            os.getenv("SUPABASE_URL"),
            os.getenv("SUPABASE_SERVICE_ROLE_KEY"),
            options=SyncClientOptions(httpx_client=_supabase_httpx_client()),
        )
    return _supabase_client


@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=0.5, min=0.25, max=3),
    retry=retry_if_exception_type(
        (httpx.ReadError, httpx.ConnectError, httpx.RemoteProtocolError)
    ),
    reraise=True,
)
async def sb_execute(builder: Any) -> Any:
    """Run a PostgREST builder's blocking .execute() in a worker thread."""
    return await run_in_threadpool(builder.execute)