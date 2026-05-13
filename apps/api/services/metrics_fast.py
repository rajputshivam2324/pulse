"""
Single-pass metrics aggregation for Pulse.
Used by build_metrics_payload to avoid 8+ full scans over all transactions.
"""

from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime, timedelta, timezone


def _week_tuple_add(yr: int, wk: int, offset: int) -> tuple[int, int]:
    jan4 = date(yr, 1, 4)
    monday_w1 = jan4 - timedelta(days=jan4.weekday())
    target_monday = monday_w1 + timedelta(weeks=wk - 1 + offset)
    iso = target_monday.isocalendar()
    return (iso[0], iso[1])


def _parse_ts(ts_raw) -> datetime | None:
    if not ts_raw:
        return None
    try:
        ts = datetime.fromisoformat(str(ts_raw).replace("Z", "+00:00"))
    except (ValueError, TypeError):
        return None
    if ts.tzinfo is None:
        ts = ts.replace(tzinfo=timezone.utc)
    return ts


def empty_metrics_payload() -> dict:
    return {
        "summary": {
            "total_wallets": 0,
            "total_transactions": 0,
            "avg_daily_active_wallets": 0,
            "d7_retention_rate": 0,
            "d30_retention_rate": 0,
            "worst_funnel_step": 2,
            "worst_funnel_drop_rate": 0,
            "highest_churn_transaction_type": None,
            "highest_churn_rate": None,
            "best_first_type_for_retention": None,
            "best_first_type_return_rate": None,
            "worst_first_type_for_retention": None,
            "worst_first_type_return_rate": None,
        },
        "daw_trend": [],
        "retention_cohorts": [],
        "funnel": [
            {"step": i, "label": f"Transaction {i}+", "wallet_count": 0, "drop_off_rate": 0}
            for i in range(1, 6)
        ],
        "drop_off_by_type": [],
        "per_type_retention": [],
        "activity_heatmap": [],
        "whales": [],
        "drop_off_breakdown": [],
    }


def _daw_from_daily(daily: dict) -> list[dict]:
    seen_wallets: set[str] = set()
    result = []
    for date_key in sorted(daily.keys()):
        wallets = daily[date_key]["wallets"]
        result.append(
            {
                "date": date_key,
                "daw": len(wallets),
                "new_wallets": len(wallets - seen_wallets),
                "returning_wallets": len(wallets & seen_wallets),
                "total_transactions": daily[date_key]["count"],
            }
        )
        seen_wallets.update(wallets)
    return result


def _retention_cohort_rows(first_seen: dict, wallet_activity: dict) -> list[dict]:
    cohorts: dict[str, list] = defaultdict(list)
    for wallet, (week_tuple, week_key) in first_seen.items():
        cohorts[week_key].append((wallet, week_tuple))

    result = []
    for cohort_week_key, wallet_tuples in sorted(cohorts.items()):
        cohort_size = len(wallet_tuples)
        for week_offset in range(5):
            retained = sum(
                1
                for wallet, (yr, wk) in wallet_tuples
                if _week_tuple_add(yr, wk, week_offset) in wallet_activity[wallet]
            )
            result.append(
                {
                    "cohort_week": cohort_week_key,
                    "week_number": week_offset,
                    "wallet_count": retained,
                    "retention_rate": (
                        round(retained / cohort_size * 100, 2) if cohort_size > 0 else 0
                    ),
                }
            )
    return result


def _funnel_from_counts(wallet_tx_count: dict[str, int]) -> list[dict]:
    result = []
    prev_count = None
    for step in range(1, 6):
        count = sum(1 for c in wallet_tx_count.values() if c >= step)
        drop_off = (
            round((1 - count / prev_count) * 100, 2) if prev_count and prev_count > 0 else 0
        )
        result.append(
            {
                "step": step,
                "label": f"Transaction {step}+",
                "wallet_count": count,
                "drop_off_rate": drop_off if step > 1 else 0,
            }
        )
        prev_count = count
    return result


def _drop_off_by_type(wallet_types_chrono: dict[str, list]) -> list[dict]:
    type_stats: dict[str, dict] = defaultdict(lambda: {"one_time": 0, "repeat": 0})
    for wallet, types in wallet_types_chrono.items():
        if not types:
            continue
        first_type = types[0]
        if len(types) == 1:
            type_stats[first_type]["one_time"] += 1
        else:
            type_stats[first_type]["repeat"] += 1

    result = []
    for tx_type, stats in type_stats.items():
        total = stats["one_time"] + stats["repeat"]
        result.append(
            {
                "transaction_type": tx_type,
                "one_time_count": stats["one_time"],
                "repeat_count": stats["repeat"],
                "churn_rate": round(stats["one_time"] / total * 100, 2) if total > 0 else 0,
            }
        )
    return sorted(result, key=lambda x: x["churn_rate"], reverse=True)


def _per_type_retention(first_type: dict[str, str], wallet_tx_count: dict[str, int]) -> list[dict]:
    type_groups: dict[str, dict] = defaultdict(lambda: {"total": 0, "returned": 0})
    for wallet, ft in first_type.items():
        type_groups[ft]["total"] += 1
        if wallet_tx_count.get(wallet, 0) > 1:
            type_groups[ft]["returned"] += 1

    result = []
    for tx_type, stats in type_groups.items():
        result.append(
            {
                "first_transaction_type": tx_type,
                "total_wallets": stats["total"],
                "returned_wallets": stats["returned"],
                "return_rate": (
                    round(stats["returned"] / stats["total"] * 100, 2)
                    if stats["total"] > 0
                    else 0
                ),
            }
        )
    return sorted(result, key=lambda x: x["return_rate"], reverse=True)


def _whales(wallet_stats: dict, total_vol: float) -> list[dict]:
    sorted_wallets = sorted(wallet_stats.items(), key=lambda x: x[1]["volume_sol"], reverse=True)[:5]
    result = []
    for wallet, stats in sorted_wallets:
        share = (stats["volume_sol"] / total_vol * 100) if total_vol > 0 else 0
        result.append(
            {
                "address": wallet,
                "txns": stats["txns"],
                "volume_sol": stats["volume_sol"],
                "share_pct": round(share, 1),
            }
        )
    return result


def _drop_off_breakdown(one_tx_ts: dict[str, datetime | None]) -> list[dict]:
    breakdown = {
        "Bounced (no return)": 0,
        "Went dormant >14d": 0,
        "Recent drop-off (<14d)": 0,
    }
    now = datetime.now(timezone.utc)
    for _wallet, ts in one_tx_ts.items():
        if ts is None:
            breakdown["Bounced (no return)"] += 1
            continue
        try:
            if ts.tzinfo is None:
                ts = ts.replace(tzinfo=timezone.utc)
            days_since = (now - ts).days
            if days_since > 30:
                breakdown["Bounced (no return)"] += 1
            elif days_since > 14:
                breakdown["Went dormant >14d"] += 1
            else:
                breakdown["Recent drop-off (<14d)"] += 1
        except Exception:
            breakdown["Bounced (no return)"] += 1
    return [{"label": k, "value": v} for k, v in breakdown.items() if v > 0]


def build_metrics_payload_fast(transactions: list[dict]) -> dict:
    """
    Same output contract as the legacy multi-pass build_metrics_payload,
    but one chronological ordering + one linear scan + small derived passes
    (cohorts are O(cohort wallets), not O(all txns)).
    """
    if not transactions:
        return empty_metrics_payload()

    cutoff_daw = datetime.now(timezone.utc) - timedelta(days=30)
    cutoff_heat = cutoff_daw

    wallet_tx_count: dict[str, int] = defaultdict(int)
    for txn in transactions:
        wallet_tx_count[txn["wallet_address"]] += 1

    enriched: list[tuple[datetime, str, dict, datetime | None]] = []
    for txn in transactions:
        ts = _parse_ts(txn.get("timestamp"))
        sk = ts if ts is not None else datetime.min.replace(tzinfo=timezone.utc)
        enriched.append((sk, txn.get("signature") or "", txn, ts))
    enriched.sort(key=lambda x: (x[0], x[1]))

    first_seen: dict[str, tuple] = {}
    wallet_activity: dict[str, set] = defaultdict(set)
    daily: dict = defaultdict(lambda: {"wallets": set(), "count": 0})
    heatmap: dict[tuple[int, int], int] = defaultdict(int)
    wallet_stats: dict[str, dict] = defaultdict(lambda: {"txns": 0, "volume_sol": 0.0})
    total_vol = 0.0
    wallet_types_chrono: dict[str, list] = defaultdict(list)
    first_type: dict[str, str] = {}
    visits = defaultdict(int)
    one_tx_ts: dict[str, datetime | None] = {}

    for sk, _sig, txn, ts in enriched:
        w = txn["wallet_address"]
        typ = txn.get("transaction_type", "UNKNOWN")
        vol = float(txn.get("amount_sol") or 0.0)
        wallet_stats[w]["txns"] += 1
        wallet_stats[w]["volume_sol"] += vol
        total_vol += vol

        visits[w] += 1
        if visits[w] == 1:
            one_tx_ts[w] = ts
        if visits[w] >= 2 and w in one_tx_ts:
            del one_tx_ts[w]

        if ts is None:
            continue
        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=timezone.utc)

        if w not in first_type:
            first_type[w] = typ

        iso = ts.isocalendar()
        week_tuple = (iso[0], iso[1])
        week_key = f"{iso[0]}-W{iso[1]:02d}"
        if w not in first_seen:
            first_seen[w] = (week_tuple, week_key)
        wallet_activity[w].add(week_tuple)

        if ts >= cutoff_daw:
            date_key = ts.date().isoformat()
            daily[date_key]["wallets"].add(w)
            daily[date_key]["count"] += 1

        if ts >= cutoff_heat:
            day_js = (ts.weekday() + 1) % 7
            heatmap[(ts.hour, day_js)] += 1

        wallet_types_chrono[w].append(typ)

    daw_data = _daw_from_daily(daily)
    retention = _retention_cohort_rows(first_seen, wallet_activity)
    funnel = _funnel_from_counts(wallet_tx_count)
    drop_off = _drop_off_by_type(wallet_types_chrono)
    per_type_retention = _per_type_retention(first_type, wallet_tx_count)
    activity_heatmap = [{"hour": h, "day": d, "count": c} for (h, d), c in heatmap.items()]
    whales = _whales(wallet_stats, total_vol)
    drop_off_breakdown = _drop_off_breakdown(one_tx_ts)

    total_wallets = len(wallet_tx_count)
    avg_daw = sum(d["daw"] for d in daw_data) / len(daw_data) if daw_data else 0
    d7_retention = next((r["retention_rate"] for r in retention if r["week_number"] == 1), 0)
    d30_retention = next((r["retention_rate"] for r in retention if r["week_number"] == 4), 0)
    worst_funnel_step = max(funnel[1:], key=lambda x: x["drop_off_rate"], default={})
    worst_type = drop_off[0] if drop_off else {}
    best_first_type = per_type_retention[0] if per_type_retention else {}
    worst_first_type = per_type_retention[-1] if per_type_retention else {}

    return {
        "summary": {
            "total_wallets": total_wallets,
            "total_transactions": len(transactions),
            "avg_daily_active_wallets": round(avg_daw, 1),
            "d7_retention_rate": d7_retention,
            "d30_retention_rate": d30_retention,
            "worst_funnel_step": worst_funnel_step.get("step"),
            "worst_funnel_drop_rate": worst_funnel_step.get("drop_off_rate"),
            "highest_churn_transaction_type": worst_type.get("transaction_type"),
            "highest_churn_rate": worst_type.get("churn_rate"),
            "best_first_type_for_retention": best_first_type.get("first_transaction_type"),
            "best_first_type_return_rate": best_first_type.get("return_rate"),
            "worst_first_type_for_retention": worst_first_type.get("first_transaction_type"),
            "worst_first_type_return_rate": worst_first_type.get("return_rate"),
        },
        "daw_trend": daw_data[-14:],
        "retention_cohorts": retention,
        "funnel": funnel,
        "drop_off_by_type": drop_off[:5],
        "per_type_retention": per_type_retention,
        "activity_heatmap": activity_heatmap,
        "whales": whales,
        "drop_off_breakdown": drop_off_breakdown,
    }
