"""STIG definition models."""

from datetime import date, datetime
from enum import Enum
from typing import Annotated, Any

from pydantic import BaseModel, Field


class STIGSeverity(str, Enum):
    """STIG rule severity levels."""

    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


class STIGRule(BaseModel):
    """Individual STIG rule/check definition."""

    id: str
    rule_id: str  # e.g., SV-12345r1_rule
    vuln_id: str  # e.g., V-12345
    group_id: str  # e.g., SRG-OS-000001
    title: str
    description: str
    severity: STIGSeverity
    check_content: str
    fix_content: str
    ccis: list[str] = Field(default_factory=list)  # CCI references


class STIGDefinitionBase(BaseModel):
    """Base STIG definition model."""

    stig_id: Annotated[str, Field(min_length=1, max_length=100)]
    title: Annotated[str, Field(min_length=1, max_length=512)]
    version: str | None = None
    release_date: date | None = None
    platform: str | None = None
    description: str | None = None


class STIGDefinitionCreate(STIGDefinitionBase):
    """Model for creating/importing a STIG definition."""

    xccdf_content: dict[str, Any] | None = None


class STIGDefinition(STIGDefinitionBase):
    """Full STIG definition with all fields."""

    id: str
    rules_count: int = 0
    xccdf_content: dict[str, Any] | None = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
