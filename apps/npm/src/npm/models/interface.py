"""Interface models for NPM service."""

from datetime import datetime
from enum import Enum

from pydantic import BaseModel, Field


class InterfaceStatus(str, Enum):
    """Interface operational status."""
    UP = "up"
    DOWN = "down"
    TESTING = "testing"
    UNKNOWN = "unknown"
    DORMANT = "dormant"
    NOT_PRESENT = "notPresent"
    LOWER_LAYER_DOWN = "lowerLayerDown"


class AdminStatus(str, Enum):
    """Interface administrative status."""
    UP = "up"
    DOWN = "down"
    TESTING = "testing"


class InterfaceBase(BaseModel):
    """Base interface model."""

    if_index: int = Field(..., ge=0)
    name: str | None = Field(None, max_length=255)
    description: str | None = None
    mac_address: str | None = None
    speed_mbps: int | None = Field(None, ge=0)
    is_monitored: bool = Field(default=True)


class InterfaceCreate(InterfaceBase):
    """Model for creating a new interface."""

    device_id: str
    ip_addresses: list[str] | None = None
    admin_status: AdminStatus | None = None
    oper_status: InterfaceStatus | None = None


class InterfaceUpdate(BaseModel):
    """Model for updating an existing interface."""

    name: str | None = None
    description: str | None = None
    is_monitored: bool | None = None
    admin_status: AdminStatus | None = None
    oper_status: InterfaceStatus | None = None


class Interface(InterfaceBase):
    """Full interface model with all fields."""

    id: str
    device_id: str
    ip_addresses: list[str] | None = None
    admin_status: AdminStatus | None = None
    oper_status: InterfaceStatus | None = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class InterfaceWithMetrics(Interface):
    """Interface with current metric values."""

    in_octets: int | None = None
    out_octets: int | None = None
    in_errors: int | None = None
    out_errors: int | None = None
    in_utilization_pct: float | None = None
    out_utilization_pct: float | None = None

    class Config:
        from_attributes = True
