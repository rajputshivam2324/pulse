"""
Metrics Engine for Pulse.
Pure functions that compute product analytics metrics from normalized transactions.
Each function is independently testable with hardcoded data.
"""

from datetime import datetime, timedelta, timezone
from collections import defaultdict
from typing import Optional


def compute_daily_active_wallets(
    transactions: list[dict], days: int = 30
) -> list[dict]:
    """
    Compute daily active wallets (DAW) with new vs returning breakdown.
    Returns a list of daily records sorted by date.
    """
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    seen_wallets: set[str] = set()
    daily: dict[str, dict] = defaultdict(lambda: {"wallets": set(), "count": 0})

    for txn in transactions:
        ts = datetime.fromisoformat(txn["timestamp"])
        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=timezone.utc)
        if ts < cutoff:
            continue
        date_key = ts.date().isoformat()
        daily[date_key]["wallets"].add(txn["wallet_address"])
        daily[date_key]["count"] += 1

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


def _week_tuple_add(yr: int, wk: int, offset: int) -> tuple[int, int]:
    """
    Add `offset` weeks to a (year, week) tuple, correctly handling year boundaries.
    Uses date arithmetic: find the Monday of (yr, wk), add timedelta(weeks=offset),
    then convert back to isocalendar.
    """
    # ISO week 1 Monday of the given year
    from datetime import date
    jan4 = date(yr, 1, 4)  # Jan 4 is always in ISO week 1
    monday_w1 = jan4 - timedelta(days=jan4.weekday())
    target_monday = monday_w1 + timedelta(weeks=wk - 1 + offset)
    iso = target_monday.isocalendar()
    return (iso[0], iso[1])


def compute_retention_cohorts(transactions: list[dict]) -> list[dict]:
    """
    Weekly cohort analysis.
    Group wallets by first-seen week. Track % returning each subsequent week.
    This is the core retention signal Pulse sells on.
    """
    first_seen: dict[str, tuple] = {}
    wallet_activity: dict[str, set] = defaultdict(set)

    for txn in transactions:
        wallet = txn["wallet_address"]
        ts = datetime.fromisoformat(txn["timestamp"])
        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=timezone.utc)
        iso = ts.isocalendar()
        week_tuple = (iso[0], iso[1])
        week_key = f"{iso[0]}-W{iso[1]:02d}"

        if wallet not in first_seen:
            first_seen[wallet] = (week_tuple, week_key)
        wallet_activity[wallet].add(week_tuple)

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
                        round(retained / cohort_size * 100, 2)
                        if cohort_size > 0
                        else 0
                    ),
                }
            )

    return result


def compute_transaction_funnel(transactions: list[dict]) -> list[dict]:
    """
    How many wallets reached transaction 1, 2, 3, 4, 5+.
    Drop-off rate at each step shows where founders are losing users.
    """
    wallet_tx_counts: dict[str, int] = defaultdict(int)
    for txn in transactions:
        wallet_tx_counts[txn["wallet_address"]] += 1

    result = []
    prev_count = None
    for step in range(1, 6):
        count = sum(1 for c in wallet_tx_counts.values() if c >= step)
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


def compute_drop_off_by_type(transactions: list[dict]) -> list[dict]:
    """
    For wallets that only ever did ONE transaction — what type was it?
    High churn rate on a type = that interaction fails to bring users back.
    """
    wallet_types: dict[str, list] = defaultdict(list)
    for txn in transactions:
        wallet_types[txn["wallet_address"]].append(txn["transaction_type"])

    type_stats: dict[str, dict] = defaultdict(
        lambda: {"one_time": 0, "repeat": 0}
    )
    for wallet, types in wallet_types.items():
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
                "churn_rate": (
                    round(stats["one_time"] / total * 100, 2) if total > 0 else 0
                ),
            }
        )

    return sorted(result, key=lambda x: x["churn_rate"], reverse=True)


def compute_per_type_retention(transactions: list[dict]) -> list[dict]:
    """
    For each transaction type — what % of wallets that started with that type
    came back for a second transaction?
    This feeds the AI's most specific insight: 'wallets that started with X retain at Y%'
    """
    wallet_first_type: dict[str, str] = {}
    wallet_tx_counts: dict[str, int] = defaultdict(int)

    for txn in sorted(transactions, key=lambda t: t["timestamp"]):
        wallet = txn["wallet_address"]
        if wallet not in wallet_first_type:
            wallet_first_type[wallet] = txn["transaction_type"]
        wallet_tx_counts[wallet] += 1

    type_groups: dict[str, dict] = defaultdict(
        lambda: {"total": 0, "returned": 0}
    )
    for wallet, first_type in wallet_first_type.items():
        type_groups[first_type]["total"] += 1
        if wallet_tx_counts[wallet] > 1:
            type_groups[first_type]["returned"] += 1

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


def build_metrics_payload(transactions: list[dict]) -> dict:
    """
    Assemble the complete metrics payload.
    This is the input to the LangGraph AI pipeline.
    """
    daw_data = compute_daily_active_wallets(transactions, days=30)
    retention = compute_retention_cohorts(transactions)
    funnel = compute_transaction_funnel(transactions)
    drop_off = compute_drop_off_by_type(transactions)
    per_type_retention = compute_per_type_retention(transactions)

    total_wallets = len(set(t["wallet_address"] for t in transactions))
    avg_daw = (
        sum(d["daw"] for d in daw_data) / len(daw_data) if daw_data else 0
    )
    d7_retention = next(
        (r["retention_rate"] for r in retention if r["week_number"] == 1), 0
    )
    d30_retention = next(
        (r["retention_rate"] for r in retention if r["week_number"] == 4), 0
    )
    worst_funnel_step = max(
        funnel[1:], key=lambda x: x["drop_off_rate"], default={}
    )
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
            "highest_churn_transaction_type": worst_type.get(
                "transaction_type"
            ),
            "highest_churn_rate": worst_type.get("churn_rate"),
            "best_first_type_for_retention": best_first_type.get(
                "first_transaction_type"
            ),
            "best_first_type_return_rate": best_first_type.get("return_rate"),
            "worst_first_type_for_retention": worst_first_type.get(
                "first_transaction_type"
            ),
            "worst_first_type_return_rate": worst_first_type.get(
                "return_rate"
            ),
        },
        "daw_trend": daw_data[-14:],
        "retention_cohorts": retention,
        "funnel": funnel,
        "drop_off_by_type": drop_off[:5],
        "per_type_retention": per_type_retention,
    }
