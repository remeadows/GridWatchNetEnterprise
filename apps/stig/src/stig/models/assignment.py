"""Target-STIG assignment models for multi-STIG support."""

from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field

from .audit import AuditStatus


class TargetDefinitionBase(BaseModel):
    """Base model for target-STIG assignment."""

    is_primary: bool = Field(default=False, description="Primary STIG for quick audits")
    enabled: bool = Field(default=True, description="Include in 'Audit All' operations")
    notes: Optional[str] = Field(default=None, description="Admin notes about applicability")


class TargetDefinitionCreate(TargetDefinitionBase):
    """Model for creating a target-STIG assignment."""

    definition_id: str = Field(..., description="UUID of the STIG definition to assign")


class TargetDefinitionUpdate(BaseModel):
    """Model for updating a target-STIG assignment."""

    is_primary: Optional[bool] = None
    enabled: Optional[bool] = None
    notes: Optional[str] = None


class TargetDefinition(TargetDefinitionBase):
    """Full target-STIG assignment with related data."""

    id: str
    target_id: str
    definition_id: str
    created_at: datetime
    updated_at: datetime

    # Joined fields from definition (populated by queries)
    stig_id: Optional[str] = None
    stig_title: Optional[str] = None
    stig_version: Optional[str] = None
    rules_count: Optional[int] = None

    class Config:
        from_attributes = True


class TargetDefinitionWithCompliance(TargetDefinition):
    """Target-STIG assignment with compliance information."""

    last_audit_date: Optional[datetime] = None
    last_audit_status: Optional[AuditStatus] = None
    compliance_score: Optional[float] = None
    passed: Optional[int] = None
    failed: Optional[int] = None
    not_reviewed: Optional[int] = None


# ============================================================================
# Audit Group Models
# ============================================================================


class AuditGroupBase(BaseModel):
    """Base model for audit groups."""

    name: str = Field(..., description="Name of the audit group")


class AuditGroupCreate(AuditGroupBase):
    """Model for creating an audit group."""

    target_id: str = Field(..., description="UUID of the target to audit")
    definition_ids: Optional[list[str]] = Field(
        default=None,
        description="Specific definition IDs to audit (None = all enabled)"
    )


class AuditGroup(AuditGroupBase):
    """Full audit group with status."""

    id: str
    target_id: str
    status: AuditStatus = AuditStatus.PENDING
    total_jobs: int = 0
    completed_jobs: int = 0
    created_by: Optional[str] = None
    created_at: datetime
    completed_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class AuditGroupWithJobs(AuditGroup):
    """Audit group with individual job details."""

    jobs: list[dict] = Field(default_factory=list)

    # Computed progress
    @property
    def progress_percent(self) -> float:
        if self.total_jobs == 0:
            return 0.0
        return (self.completed_jobs / self.total_jobs) * 100


class AuditGroupSummary(BaseModel):
    """Aggregated compliance summary for an audit group."""

    group_id: str
    target_id: str
    target_name: str
    status: AuditStatus

    # Overall counts
    total_checks: int = 0
    passed: int = 0
    failed: int = 0
    not_applicable: int = 0
    not_reviewed: int = 0
    errors: int = 0

    # Overall compliance
    compliance_score: float = 0.0

    # Per-STIG breakdown
    stig_summaries: list[dict] = Field(default_factory=list)

    @property
    def total_stigs(self) -> int:
        return len(self.stig_summaries)


# ============================================================================
# Bulk Assignment Models
# ============================================================================


class BulkAssignmentRequest(BaseModel):
    """Request to assign multiple STIGs to a target."""

    definition_ids: list[str] = Field(..., description="List of definition UUIDs to assign")
    primary_id: Optional[str] = Field(
        default=None,
        description="Which definition to set as primary (must be in definition_ids)"
    )


class BulkAssignmentResponse(BaseModel):
    """Response from bulk assignment operation."""

    target_id: str
    assigned: int = 0
    skipped: int = 0  # Already assigned
    errors: list[str] = Field(default_factory=list)
