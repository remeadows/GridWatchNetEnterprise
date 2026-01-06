"""Audit job and result models."""

from datetime import datetime
from enum import Enum
from typing import Annotated

from pydantic import BaseModel, Field

from .definition import STIGSeverity


class AuditStatus(str, Enum):
    """Status of an audit job."""

    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class CheckStatus(str, Enum):
    """Status of an individual STIG check."""

    PASS = "pass"
    FAIL = "fail"
    NOT_APPLICABLE = "not_applicable"
    NOT_REVIEWED = "not_reviewed"
    ERROR = "error"


class AuditJobBase(BaseModel):
    """Base audit job model."""

    name: Annotated[str, Field(min_length=1, max_length=255)]
    target_id: str
    definition_id: str


class AuditJobCreate(BaseModel):
    """Model for creating a new audit job."""

    name: Annotated[str | None, Field(min_length=1, max_length=255)] = None
    target_id: str
    definition_id: str


class AuditJob(AuditJobBase):
    """Full audit job model."""

    id: str
    status: AuditStatus = AuditStatus.PENDING
    started_at: datetime | None = None
    completed_at: datetime | None = None
    created_by: str | None = None
    error_message: str | None = None
    progress: int = 0  # 0-100
    total_checks: int = 0
    completed_checks: int = 0
    created_at: datetime

    class Config:
        from_attributes = True


class AuditResultBase(BaseModel):
    """Base audit result model."""

    job_id: str
    rule_id: Annotated[str, Field(min_length=1, max_length=100)]
    title: str | None = None
    severity: STIGSeverity | None = None
    status: CheckStatus
    finding_details: str | None = None
    comments: str | None = None


class AuditResultCreate(AuditResultBase):
    """Model for creating an audit result."""

    pass


class AuditResult(AuditResultBase):
    """Full audit result model."""

    id: str
    checked_at: datetime

    class Config:
        from_attributes = True
