"""STIG models module."""

from .common import APIResponse, PaginatedResponse, Pagination
from .target import (
    Target,
    TargetBase,
    TargetCreate,
    TargetUpdate,
    Platform,
    ConnectionType,
)
from .definition import (
    STIGDefinition,
    STIGDefinitionBase,
    STIGRule,
    STIGSeverity,
)
from .audit import (
    AuditJob,
    AuditJobBase,
    AuditJobCreate,
    AuditStatus,
    AuditResult,
    AuditResultCreate,
    CheckStatus,
)
from .report import (
    ReportFormat,
    ReportRequest,
    ComplianceSummary,
    SeverityBreakdown,
    CKLData,
    CKLTargetData,
    CKLVuln,
)
from .dashboard import STIGDashboard, TargetCompliance, WorstFinding, ComplianceTrend

__all__ = [
    # Common
    "APIResponse",
    "PaginatedResponse",
    "Pagination",
    # Target
    "Target",
    "TargetBase",
    "TargetCreate",
    "TargetUpdate",
    "Platform",
    "ConnectionType",
    # Definition
    "STIGDefinition",
    "STIGDefinitionBase",
    "STIGRule",
    "STIGSeverity",
    # Audit
    "AuditJob",
    "AuditJobBase",
    "AuditJobCreate",
    "AuditStatus",
    "AuditResult",
    "AuditResultCreate",
    "CheckStatus",
    # Report
    "ReportFormat",
    "ReportRequest",
    "ComplianceSummary",
    "SeverityBreakdown",
    "CKLData",
    "CKLTargetData",
    "CKLVuln",
    # Dashboard
    "STIGDashboard",
    "TargetCompliance",
    "WorstFinding",
    "ComplianceTrend",
]
