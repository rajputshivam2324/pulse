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
        ts_raw = txn.get("timestamp")
        if not ts_raw:
            continue
        try:
            ts = datetime.fromisoformat(str(ts_raw))
        except (ValueError, TypeError):
            continue
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
        ts_raw = txn.get("timestamp")
        if not ts_raw:
            continue
        try:
            ts = datetime.fromisoformat(str(ts_raw))
        except (ValueError, TypeError):
            continue
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

    for txn in sorted(transactions, key=lambda t: t.get("timestamp") or ""):
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


def compute_activity_heatmap(transactions: list[dict], days: int = 30) -> list[dict]:
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    heatmap = defaultdict(int)
    for txn in transactions:
        ts_raw = txn.get("timestamp")
        if not ts_raw:
            continue
        try:
            ts = datetime.fromisoformat(str(ts_raw))
            if ts.tzinfo is None:
                ts = ts.replace(tzinfo=timezone.utc)
            if ts >= cutoff:
                # 0=Monday, 6=Sunday. In JS we use 0=Sun, 1=Mon, so shift it.
                day_js = (ts.weekday() + 1) % 7
                heatmap[(ts.hour, day_js)] += 1
        except Exception:
            pass
            
    result = []
    for (hour, day), count in heatmap.items():
        result.append({"hour": hour, "day": day, "count": count})
    return result


def compute_top_wallets(transactions: list[dict]) -> list[dict]:
    wallet_stats = defaultdict(lambda: {"txns": 0, "volume_sol": 0.0})
    total_vol = 0.0
    for txn in transactions:
        wallet = txn["wallet_address"]
        vol = float(txn.get("amount_sol") or 0.0)
        wallet_stats[wallet]["txns"] += 1
        wallet_stats[wallet]["volume_sol"] += vol
        total_vol += vol
        
    sorted_wallets = sorted(wallet_stats.items(), key=lambda x: x[1]["volume_sol"], reverse=True)[:5]
    result = []
    for wallet, stats in sorted_wallets:
        share = (stats["volume_sol"] / total_vol * 100) if total_vol > 0 else 0
        result.append({
            "address": wallet,
            "txns": stats["txns"],
            "volume_sol": stats["volume_sol"],
            "share_pct": round(share, 1)
        })
    return result


def compute_drop_off_breakdown(transactions: list[dict]) -> list[dict]:
    """Breakdown of wallets that dropped off after exactly 1 transaction."""
    wallet_txns = defaultdict(list)
    for txn in transactions:
        wallet_txns[txn["wallet_address"]].append(txn)
        
    breakdown = {
        "Bounced (no return)": 0,
        "Went dormant >14d": 0,
        "Recent drop-off (<14d)": 0,
    }
    
    now = datetime.now(timezone.utc)
    for wallet, txns in wallet_txns.items():
        if len(txns) == 1:
            txn = txns[0]
            ts_raw = txn.get("timestamp")
            if ts_raw:
                try:
                    ts = datetime.fromisoformat(str(ts_raw))
                    if ts.tzinfo is None: ts = ts.replace(tzinfo=timezone.utc)
                    days_since = (now - ts).days
                    if days_since > 30:
                        breakdown["Bounced (no return)"] += 1
                    elif days_since > 14:
                        breakdown["Went dormant >14d"] += 1
                    else:
                        breakdown["Recent drop-off (<14d)"] += 1
                except Exception:
                    breakdown["Bounced (no return)"] += 1
            else:
                breakdown["Bounced (no return)"] += 1
                
    return [{"label": k, "value": v} for k, v in breakdown.items() if v > 0]


def build_metrics_payload(transactions: list[dict]) -> dict:
    """
    Assemble the complete metrics payload.
    This is the input to the LangGraph AI pipeline.

    Uses a single chronological pass over transactions (see metrics_fast)
    instead of eight independent full scans.
    """
    from services.metrics_fast import build_metrics_payload_fast

    return build_metrics_payload_fast(transactions)
