"""Report and compliance models."""

from datetime import datetime
from enum import Enum

from pydantic import BaseModel, Field

from .audit import CheckStatus


class ReportFormat(str, Enum):
    """Supported report formats."""

    PDF = "pdf"
    HTML = "html"
    CKL = "ckl"
    JSON = "json"
    SARIF = "sarif"


class ReportRequest(BaseModel):
    """Request to generate a report."""

    job_id: str
    format: ReportFormat
    include_details: bool = True
    include_remediation: bool = True


class SeverityBreakdown(BaseModel):
    """Breakdown of results by severity."""

    passed: int = 0
    failed: int = 0


class ComplianceSummary(BaseModel):
    """Summary of compliance audit results."""

    job_id: str
    target_name: str
    stig_title: str
    audit_date: datetime
    total_checks: int
    passed: int
    failed: int
    not_applicable: int
    not_reviewed: int
    errors: int
    compliance_score: float  # percentage 0-100
    severity_breakdown: dict[str, SeverityBreakdown] = Field(default_factory=dict)


class CKLTargetData(BaseModel):
    """Target information for CKL export."""

    role: str = "None"
    asset_type: str = "Computing"
    hostname: str
    ip_address: str
    mac_address: str | None = None
    fqdn: str | None = None


class CKLVuln(BaseModel):
    """Vulnerability entry for CKL export."""

    vuln_id: str
    rule_id: str
    status: CheckStatus
    finding_details: str | None = None
    comments: str | None = None


class CKLData(BaseModel):
    """Complete CKL (Checklist) data structure."""

    target_data: CKLTargetData
    stig_info: dict[str, str]
    vulns: list[CKLVuln] = Field(default_factory=list)
