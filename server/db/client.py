"""Supabase client and data-fetch helpers.

Provides a shared async Supabase client instance and async functions
for pulling initial data at startup.
"""

from __future__ import annotations
import os
import logging
from typing import List, Optional

from supabase import acreate_client, AsyncClient

from server.db.models import Character, Voice

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Shared client instance
# ---------------------------------------------------------------------------

_supabase: Optional[AsyncClient] = None


async def get_client() -> AsyncClient:
    """Return the shared Supabase async client, creating it on first call."""
    global _supabase
    if _supabase is None:
        url = os.environ.get("SUPABASE_URL", "")
        key = os.environ.get("SUPABASE_KEY", "")
        if not url or not key:
            raise RuntimeError(
                "SUPABASE_URL and SUPABASE_KEY environment variables are required"
            )
        _supabase = await acreate_client(url, key)
        logger.info("Supabase async client created")
    return _supabase


# ---------------------------------------------------------------------------
# Initial data fetches (used once at startup)
# ---------------------------------------------------------------------------

async def fetch_all_characters() -> List[Character]:
    """Fetch every character row from the database."""
    client = await get_client()
    response = await client.table("characters").select("*").execute()
    rows = response.data or []
    logger.info(f"Fetched {len(rows)} characters from database")
    return [Character.from_db_row(row) for row in rows]


async def fetch_all_voices() -> List[Voice]:
    """Fetch every voice row from the database."""
    client = await get_client()
    response = await client.table("voices").select("*").execute()
    rows = response.data or []
    logger.info(f"Fetched {len(rows)} voices from database")
    return [Voice.from_db_row(row) for row in rows]


async def fetch_voice(voice_id: str) -> Optional[Voice]:
    """Fetch a single voice by its primary key."""
    client = await get_client()
    response = (
        await client.table("voices")
        .select("*")
        .eq("voice_id", voice_id)
        .maybe_single()
        .execute()
    )
    if response.data:
        return Voice.from_db_row(response.data)
    return None
