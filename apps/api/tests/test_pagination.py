"""Pagination regression tests for analytics sync helpers."""

import asyncio
import os
import sys
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from routers.analytics import _sort_transactions_newest_first
from services import helius


def test_helius_incremental_cursor_is_preserved_across_pages(monkeypatch):
    """Incremental Helius pagination must not drop `after` after page 1."""
    calls = []

    async def fake_get_transactions_for_address(address, before=None, after=None, limit=100):
        calls.append({"address": address, "before": before, "after": after, "limit": limit})
        if len(calls) == 1:
            return [{"signature": f"sig_1_{i}", "timestamp": 100 - i} for i in range(100)]
        if len(calls) == 2:
            return [{"signature": f"sig_2_{i}", "timestamp": i} for i in range(100)]
        return [{"signature": "sig_3_0", "timestamp": 0}]

    monkeypatch.setattr(helius, "get_transactions_for_address", fake_get_transactions_for_address)
    monkeypatch.setattr(helius, "SOLANA_NETWORK", "mainnet")

    txns = asyncio.run(helius.get_all_transactions("program", max_pages=3, after="last_seen"))

    assert len(txns) == 201
    assert calls == [
        {"address": "program", "before": None, "after": "last_seen", "limit": 100},
        {"address": "program", "before": "sig_1_99", "after": "last_seen", "limit": 100},
        {"address": "program", "before": "sig_2_99", "after": "last_seen", "limit": 100},
    ]


def test_sort_transactions_newest_first_is_deterministic():
    now = datetime.now(timezone.utc)
    older = (now - timedelta(days=1)).isoformat()
    newer = now.isoformat()

    txns = [
        {"signature": "b", "timestamp": older},
        {"signature": "a", "timestamp": newer},
        {"signature": "c", "timestamp": newer},
    ]

    assert [t["signature"] for t in _sort_transactions_newest_first(txns)] == ["c", "a", "b"]
