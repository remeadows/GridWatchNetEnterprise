"""Dashboard and analytics models."""

from datetime import datetime

from pydantic import BaseModel

from .target import Target
from .audit import AuditJob
from .definition import STIGSeverity


class ComplianceTrend(BaseModel):
    """Compliance score trend data point."""

    date: datetime
    score: float


class WorstFinding(BaseModel):
    """Finding that affects the most targets."""

    rule_id: str
    title: str
    severity: STIGSeverity
    affected_targets: int


class TargetCompliance(BaseModel):
    """Target with compliance status."""

    target: Target
    last_score: float | None = None
    last_audit: datetime | None = None


class STIGDashboard(BaseModel):
    """STIG Manager dashboard data."""

    total_targets: int
    active_targets: int
    total_definitions: int
    recent_audits: list[AuditJob] = []
    compliance_trend: list[ComplianceTrend] = []
    worst_findings: list[WorstFinding] = []
    target_compliance: list[TargetCompliance] = []
