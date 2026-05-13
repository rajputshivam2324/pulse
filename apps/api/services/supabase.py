"""
Supabase client singleton for FastAPI backend.
Uses SUPABASE_SERVICE_ROLE_KEY for server-side operations.

The official client is synchronous; calling .execute() inside async route
handlers blocks the whole event loop. Use sb_execute() from async code.
"""

import os
from typing import Any

from starlette.concurrency import run_in_threadpool
from supabase import create_client

_supabase_client = None


def get_supabase():
    """Get or create the Supabase client singleton."""
    global _supabase_client
    if _supabase_client is None:
        _supabase_client = create_client(
            os.getenv("SUPABASE_URL"),
            os.getenv("SUPABASE_SERVICE_ROLE_KEY"),
        )
    return _supabase_client


async def sb_execute(builder: Any) -> Any:
    """Run a PostgREST builder's blocking .execute() in a worker thread."""
    return await run_in_threadpool(builder.execute)