"""
Pydantic schemas for Pulse API request/response models.
"""

from pydantic import BaseModel
from typing import Optional
from datetime import datetime


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
    total_wallets: int
    total_transactions: int
    avg_daily_active_wallets: float
    d7_retention_rate: float
    d30_retention_rate: float
    worst_funnel_step: Optional[int]
    worst_funnel_drop_rate: Optional[float]
    highest_churn_transaction_type: Optional[str]
    highest_churn_rate: Optional[float]
    best_first_type_for_retention: Optional[str]
    best_first_type_return_rate: Optional[float]
    worst_first_type_for_retention: Optional[str]
    worst_first_type_return_rate: Optional[float]


class InsightItem(BaseModel):
    id: str
    finding: str
    why_it_matters: str
    severity: str
    recommendation: str
    metric_reference: str


class InsightsResponse(BaseModel):
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
