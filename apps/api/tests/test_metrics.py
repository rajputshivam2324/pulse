"""
Unit tests for Pulse Metrics Engine.
Tests all metric computation functions with hardcoded transaction data.
These MUST pass before starting Phase 2 (LangGraph AI pipeline).
"""

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from datetime import datetime, timedelta, timezone
from services.metrics import (
    compute_daily_active_wallets,
    compute_retention_cohorts,
    compute_transaction_funnel,
    compute_drop_off_by_type,
    compute_per_type_retention,
    build_metrics_payload,
)


def generate_test_transactions() -> list[dict]:
    """
    Generate a realistic set of hardcoded transactions for testing.
    Simulates a Solana app with:
    - 20 unique wallets
    - Multiple transaction types (SWAP, TRANSFER, NFT_MINT, STAKE)
    - Various retention patterns (some wallets return, some churn)
    - Data spanning 4 weeks
    """
    now = datetime.now(timezone.utc)
    wallets = [f"wallet_{i}" for i in range(20)]
    transactions = []

    # Week 1: 15 wallets do their first transaction
    for i in range(15):
        ts = now - timedelta(days=28 - i % 7)
        tx_type = ["SWAP", "TRANSFER", "NFT_MINT", "STAKE"][i % 4]
        transactions.append(
            {
                "wallet_address": wallets[i],
                "transaction_type": tx_type,
                "timestamp": ts.isoformat(),
                "signature": f"sig_{i}_w1",
            }
        )

    # Week 2: 10 of the 15 return + 3 new wallets
    for i in range(10):
        ts = now - timedelta(days=21 - i % 7)
        transactions.append(
            {
                "wallet_address": wallets[i],
                "transaction_type": "SWAP",
                "timestamp": ts.isoformat(),
                "signature": f"sig_{i}_w2",
            }
        )
    for i in range(15, 18):
        ts = now - timedelta(days=18)
        transactions.append(
            {
                "wallet_address": wallets[i],
                "transaction_type": "TRANSFER",
                "timestamp": ts.isoformat(),
                "signature": f"sig_{i}_w2",
            }
        )

    # Week 3: 6 return + 2 new wallets
    for i in range(6):
        ts = now - timedelta(days=14 - i % 3)
        transactions.append(
            {
                "wallet_address": wallets[i],
                "transaction_type": "SWAP",
                "timestamp": ts.isoformat(),
                "signature": f"sig_{i}_w3",
            }
        )
    for i in range(18, 20):
        ts = now - timedelta(days=12)
        transactions.append(
            {
                "wallet_address": wallets[i],
                "transaction_type": "NFT_MINT",
                "timestamp": ts.isoformat(),
                "signature": f"sig_{i}_w3",
            }
        )

    # Week 4: 4 wallets still active (power users)
    for i in range(4):
        ts = now - timedelta(days=5 - i)
        transactions.append(
            {
                "wallet_address": wallets[i],
                "transaction_type": "SWAP",
                "timestamp": ts.isoformat(),
                "signature": f"sig_{i}_w4",
            }
        )

    return transactions


class TestDailyActiveWallets:
    def test_returns_list(self):
        txns = generate_test_transactions()
        result = compute_daily_active_wallets(txns, days=30)
        assert isinstance(result, list)
        assert len(result) > 0

    def test_has_required_fields(self):
        txns = generate_test_transactions()
        result = compute_daily_active_wallets(txns, days=30)
        for day in result:
            assert "date" in day
            assert "daw" in day
            assert "new_wallets" in day
            assert "returning_wallets" in day
            assert "total_transactions" in day

    def test_daw_values_are_positive(self):
        txns = generate_test_transactions()
        result = compute_daily_active_wallets(txns, days=30)
        for day in result:
            assert day["daw"] >= 0
            assert day["new_wallets"] >= 0
            assert day["returning_wallets"] >= 0
            assert day["total_transactions"] >= 0

    def test_new_plus_returning_equals_daw(self):
        txns = generate_test_transactions()
        result = compute_daily_active_wallets(txns, days=30)
        for day in result:
            assert day["new_wallets"] + day["returning_wallets"] == day["daw"]

    def test_sorted_by_date(self):
        txns = generate_test_transactions()
        result = compute_daily_active_wallets(txns, days=30)
        dates = [day["date"] for day in result]
        assert dates == sorted(dates)


class TestRetentionCohorts:
    def test_returns_list(self):
        txns = generate_test_transactions()
        result = compute_retention_cohorts(txns)
        assert isinstance(result, list)
        assert len(result) > 0

    def test_has_required_fields(self):
        txns = generate_test_transactions()
        result = compute_retention_cohorts(txns)
        for cohort in result:
            assert "cohort_week" in cohort
            assert "week_number" in cohort
            assert "wallet_count" in cohort
            assert "retention_rate" in cohort

    def test_week0_retention_is_100(self):
        txns = generate_test_transactions()
        result = compute_retention_cohorts(txns)
        week0_records = [r for r in result if r["week_number"] == 0]
        for record in week0_records:
            assert record["retention_rate"] == 100.0

    def test_retention_rate_bounded(self):
        txns = generate_test_transactions()
        result = compute_retention_cohorts(txns)
        for cohort in result:
            assert 0 <= cohort["retention_rate"] <= 100

    def test_week_numbers_range(self):
        txns = generate_test_transactions()
        result = compute_retention_cohorts(txns)
        week_numbers = set(r["week_number"] for r in result)
        assert week_numbers.issubset({0, 1, 2, 3, 4})


class TestTransactionFunnel:
    def test_returns_5_steps(self):
        txns = generate_test_transactions()
        result = compute_transaction_funnel(txns)
        assert len(result) == 5

    def test_step1_has_most_wallets(self):
        txns = generate_test_transactions()
        result = compute_transaction_funnel(txns)
        assert result[0]["wallet_count"] >= result[-1]["wallet_count"]

    def test_monotonically_decreasing(self):
        txns = generate_test_transactions()
        result = compute_transaction_funnel(txns)
        counts = [step["wallet_count"] for step in result]
        for i in range(1, len(counts)):
            assert counts[i] <= counts[i - 1]

    def test_first_step_no_dropoff(self):
        txns = generate_test_transactions()
        result = compute_transaction_funnel(txns)
        assert result[0]["drop_off_rate"] == 0

    def test_dropoff_rates_bounded(self):
        txns = generate_test_transactions()
        result = compute_transaction_funnel(txns)
        for step in result:
            assert 0 <= step["drop_off_rate"] <= 100


class TestDropOffByType:
    def test_returns_list(self):
        txns = generate_test_transactions()
        result = compute_drop_off_by_type(txns)
        assert isinstance(result, list)
        assert len(result) > 0

    def test_has_required_fields(self):
        txns = generate_test_transactions()
        result = compute_drop_off_by_type(txns)
        for item in result:
            assert "transaction_type" in item
            assert "one_time_count" in item
            assert "repeat_count" in item
            assert "churn_rate" in item

    def test_churn_rate_bounded(self):
        txns = generate_test_transactions()
        result = compute_drop_off_by_type(txns)
        for item in result:
            assert 0 <= item["churn_rate"] <= 100

    def test_sorted_by_churn_desc(self):
        txns = generate_test_transactions()
        result = compute_drop_off_by_type(txns)
        rates = [item["churn_rate"] for item in result]
        assert rates == sorted(rates, reverse=True)


class TestPerTypeRetention:
    def test_returns_list(self):
        txns = generate_test_transactions()
        result = compute_per_type_retention(txns)
        assert isinstance(result, list)
        assert len(result) > 0

    def test_has_required_fields(self):
        txns = generate_test_transactions()
        result = compute_per_type_retention(txns)
        for item in result:
            assert "first_transaction_type" in item
            assert "total_wallets" in item
            assert "returned_wallets" in item
            assert "return_rate" in item

    def test_return_rate_bounded(self):
        txns = generate_test_transactions()
        result = compute_per_type_retention(txns)
        for item in result:
            assert 0 <= item["return_rate"] <= 100

    def test_returned_lte_total(self):
        txns = generate_test_transactions()
        result = compute_per_type_retention(txns)
        for item in result:
            assert item["returned_wallets"] <= item["total_wallets"]

    def test_sorted_by_return_rate_desc(self):
        txns = generate_test_transactions()
        result = compute_per_type_retention(txns)
        rates = [item["return_rate"] for item in result]
        assert rates == sorted(rates, reverse=True)


class TestBuildMetricsPayload:
    def test_returns_dict(self):
        txns = generate_test_transactions()
        result = build_metrics_payload(txns)
        assert isinstance(result, dict)

    def test_has_all_sections(self):
        txns = generate_test_transactions()
        result = build_metrics_payload(txns)
        assert "summary" in result
        assert "daw_trend" in result
        assert "retention_cohorts" in result
        assert "funnel" in result
        assert "drop_off_by_type" in result
        assert "per_type_retention" in result

    def test_summary_has_all_fields(self):
        txns = generate_test_transactions()
        result = build_metrics_payload(txns)
        summary = result["summary"]
        expected_fields = [
            "total_wallets",
            "total_transactions",
            "avg_daily_active_wallets",
            "d7_retention_rate",
            "d30_retention_rate",
            "worst_funnel_step",
            "worst_funnel_drop_rate",
            "highest_churn_transaction_type",
            "highest_churn_rate",
            "best_first_type_for_retention",
            "best_first_type_return_rate",
            "worst_first_type_for_retention",
            "worst_first_type_return_rate",
        ]
        for field in expected_fields:
            assert field in summary, f"Missing field: {field}"

    def test_total_wallets_correct(self):
        txns = generate_test_transactions()
        result = build_metrics_payload(txns)
        unique_wallets = len(set(t["wallet_address"] for t in txns))
        assert result["summary"]["total_wallets"] == unique_wallets

    def test_total_transactions_correct(self):
        txns = generate_test_transactions()
        result = build_metrics_payload(txns)
        assert result["summary"]["total_transactions"] == len(txns)

    def test_daw_trend_max_14_days(self):
        txns = generate_test_transactions()
        result = build_metrics_payload(txns)
        assert len(result["daw_trend"]) <= 14

    def test_funnel_has_5_steps(self):
        txns = generate_test_transactions()
        result = build_metrics_payload(txns)
        assert len(result["funnel"]) == 5

    def test_drop_off_max_5(self):
        txns = generate_test_transactions()
        result = build_metrics_payload(txns)
        assert len(result["drop_off_by_type"]) <= 5


class TestEdgeCases:
    def test_empty_transactions(self):
        result = compute_daily_active_wallets([], days=30)
        assert result == []

    def test_empty_funnel(self):
        result = compute_transaction_funnel([])
        assert len(result) == 5
        for step in result:
            assert step["wallet_count"] == 0

    def test_single_transaction(self):
        txns = [
            {
                "wallet_address": "wallet_solo",
                "transaction_type": "SWAP",
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "signature": "sig_solo",
            }
        ]
        result = build_metrics_payload(txns)
        assert result["summary"]["total_wallets"] == 1
        assert result["summary"]["total_transactions"] == 1
