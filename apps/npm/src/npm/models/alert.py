"""Alert models for NPM service."""

from datetime import datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


class AlertSeverity(str, Enum):
    """Alert severity levels."""
    CRITICAL = "critical"
    WARNING = "warning"
    INFO = "info"


class AlertStatus(str, Enum):
    """Alert status values."""
    ACTIVE = "active"
    ACKNOWLEDGED = "acknowledged"
    RESOLVED = "resolved"


class ConditionType(str, Enum):
    """Alert condition types."""
    GREATER_THAN = "gt"
    LESS_THAN = "lt"
    EQUAL = "eq"
    NOT_EQUAL = "ne"
    GREATER_EQUAL = "gte"
    LESS_EQUAL = "lte"


class MetricType(str, Enum):
    """Metric types for alerting."""
    CPU_UTILIZATION = "cpu_utilization"
    MEMORY_UTILIZATION = "memory_utilization"
    INTERFACE_UTILIZATION = "interface_utilization"
    INTERFACE_ERRORS = "interface_errors"
    INTERFACE_DISCARDS = "interface_discards"
    LATENCY = "latency"
    PACKET_LOSS = "packet_loss"
    AVAILABILITY = "availability"


# Alert Rule Models
class AlertRuleBase(BaseModel):
    """Base alert rule model."""

    name: str = Field(..., min_length=1, max_length=255)
    description: str | None = None
    metric_type: str = Field(..., max_length=100)
    condition: ConditionType
    threshold: float
    duration_seconds: int = Field(default=60, ge=0, le=3600)
    severity: AlertSeverity = Field(default=AlertSeverity.WARNING)
    is_active: bool = Field(default=True)


class AlertRuleCreate(AlertRuleBase):
    """Model for creating a new alert rule."""
    pass


class AlertRuleUpdate(BaseModel):
    """Model for updating an existing alert rule."""

    name: str | None = Field(None, min_length=1, max_length=255)
    description: str | None = None
    metric_type: str | None = None
    condition: ConditionType | None = None
    threshold: float | None = None
    duration_seconds: int | None = Field(None, ge=0, le=3600)
    severity: AlertSeverity | None = None
    is_active: bool | None = None


class AlertRule(AlertRuleBase):
    """Full alert rule model with all fields."""

    id: str
    created_by: str | None = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# Alert Models
class AlertBase(BaseModel):
    """Base alert model."""

    message: str
    severity: AlertSeverity
    details: dict[str, Any] | None = None


class AlertCreate(AlertBase):
    """Model for creating a new alert."""

    rule_id: str | None = None
    device_id: str | None = None
    interface_id: str | None = None


class AlertUpdate(BaseModel):
    """Model for updating an existing alert."""

    status: AlertStatus | None = None
    acknowledged_by: str | None = None


class Alert(AlertBase):
    """Full alert model with all fields."""

    id: str
    rule_id: str | None = None
    device_id: str | None = None
    interface_id: str | None = None
    status: AlertStatus = Field(default=AlertStatus.ACTIVE)
    triggered_at: datetime
    acknowledged_at: datetime | None = None
    acknowledged_by: str | None = None
    resolved_at: datetime | None = None

    class Config:
        from_attributes = True


class AlertWithContext(Alert):
    """Alert with device and interface context."""

    device_name: str | None = None
    device_ip: str | None = None
    interface_name: str | None = None
    rule_name: str | None = None

    class Config:
        from_attributes = True
