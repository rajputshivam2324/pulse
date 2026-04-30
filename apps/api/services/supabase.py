"""
Supabase client singleton for FastAPI backend.
Uses SUPABASE_SERVICE_ROLE_KEY for server-side operations.
"""

import os
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