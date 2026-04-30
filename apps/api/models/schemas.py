"""
Pydantic schemas for Pulse API request/response models.
"""

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel
from typing import Optional
from datetime import datetime


def to_camel_snaker(s: str) -> str:
    """Convert camelCase to snake_case for aliases."""
    result = ""
    for i, char in enumerate(s):
        if char.isupper() and i > 0:
            result += "_"
        result += char.lower()
    return result


def to_camel_case(s: str) -> str:
    """Convert snake_case to camelCase."""
    components = s.split('_')
    return components[0] + ''.join(x.title() for x in components[1:])


def convert_to_camel_case(data: dict | list) -> dict | list:
    """Recursively convert dict keys from snake_case to camelCase."""
    if isinstance(data, dict):
        return {to_camel_case(k): convert_to_camel_case(v) for k, v in data.items()}
    elif isinstance(data, list):
        return [convert_to_camel_case(item) for item in data]
    return data


class ProgramRegister(BaseModel):
    program_address: str
    name: Optional[str] = None
    network: str = "mainnet"


class ProgramResponse(BaseModel):
    id: str
    program_address: str
    name: Optional[str]
    network: str
    created_at: Optional[str]
    last_synced_at: Optional[str]


class SyncRequest(BaseModel):
    program_address: str
    program_name: Optional[str] = None


class MetricsSummary(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
    )

    total_wallets: int
    total_transactions: int
    avg_daily_active_wallets: float
    d7_retention_rate: float
    d30_retention_rate: float
    worst_funnel_step: Optional[int] = None
    worst_funnel_drop_rate: Optional[float] = None
    highest_churn_transaction_type: Optional[str] = None
    highest_churn_rate: Optional[float] = None
    best_first_type_for_retention: Optional[str] = None
    best_first_type_return_rate: Optional[float] = None
    worst_first_type_for_retention: Optional[str] = None
    worst_first_type_return_rate: Optional[float] = None


class InsightItem(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
    )

    id: str
    finding: str
    why_it_matters: str
    severity: str
    recommendation: str
    metric_reference: str


class InsightsResponse(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
    )

    headline: str
    biggest_problem: str
    health_score: int
    insights: list[InsightItem]
    retention_diagnosis: Optional[dict] = None
    quick_wins: list[str]
    execution_trace: list[str]


class HealthResponse(BaseModel):
    status: str
    version: str
