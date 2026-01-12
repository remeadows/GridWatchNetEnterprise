"""Device models for NPM service."""

from datetime import datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field, field_validator
import netaddr


class DeviceStatus(str, Enum):
    """Device status enumeration."""
    UP = "up"
    DOWN = "down"
    DEGRADED = "degraded"
    UNKNOWN = "unknown"
    MAINTENANCE = "maintenance"


class SNMPVersion(str, Enum):
    """SNMP version enumeration."""
    V1 = "v1"
    V2C = "v2c"
    V3 = "v3"


class DeviceBase(BaseModel):
    """Base device model with common fields."""

    name: str = Field(..., min_length=1, max_length=255)
    ip_address: str = Field(..., description="Device IP address")
    device_type: str | None = Field(None, max_length=100)
    vendor: str | None = Field(None, max_length=100)
    model: str | None = Field(None, max_length=100)
    snmp_version: SNMPVersion = Field(default=SNMPVersion.V2C)
    ssh_enabled: bool = Field(default=False)
    poll_interval: int = Field(default=60, ge=10, le=3600)
    is_active: bool = Field(default=True)

    @field_validator("ip_address")
    @classmethod
    def validate_ip_address(cls, v: str) -> str:
        """Validate IP address format."""
        try:
            netaddr.IPAddress(v)
            return v
        except (netaddr.AddrFormatError, ValueError) as e:
            raise ValueError(f"Invalid IP address: {v}") from e


class DeviceCreate(DeviceBase):
    """Model for creating a new device."""

    snmp_community: str | None = Field(None, description="SNMP community string (will be encrypted)")


class DeviceUpdate(BaseModel):
    """Model for updating an existing device."""

    name: str | None = Field(None, min_length=1, max_length=255)
    ip_address: str | None = None
    device_type: str | None = None
    vendor: str | None = None
    model: str | None = None
    snmp_community: str | None = None
    snmp_version: SNMPVersion | None = None
    ssh_enabled: bool | None = None
    poll_interval: int | None = Field(None, ge=10, le=3600)
    is_active: bool | None = None
    status: DeviceStatus | None = None

    @field_validator("ip_address")
    @classmethod
    def validate_ip_address(cls, v: str | None) -> str | None:
        """Validate IP address format."""
        if v is None:
            return v
        try:
            netaddr.IPAddress(v)
            return v
        except (netaddr.AddrFormatError, ValueError) as e:
            raise ValueError(f"Invalid IP address: {v}") from e


class Device(DeviceBase):
    """Full device model with all fields."""

    id: str
    status: DeviceStatus = Field(default=DeviceStatus.UNKNOWN)
    last_poll: datetime | None = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class LatestDeviceMetrics(BaseModel):
    """Latest metrics snapshot for a device."""

    collected_at: datetime | None = None
    # ICMP
    icmp_latency_ms: float | None = None
    icmp_packet_loss_percent: float | None = None
    icmp_reachable: bool | None = None
    # SNMP
    cpu_utilization: float | None = None
    memory_utilization: float | None = None
    memory_total_bytes: int | None = None
    memory_used_bytes: int | None = None
    uptime_seconds: int | None = None
    # Disk/Storage
    disk_utilization: float | None = None
    disk_total_bytes: int | None = None
    disk_used_bytes: int | None = None
    swap_utilization: float | None = None
    swap_total_bytes: int | None = None
    # Interface summary
    total_interfaces: int = 0
    interfaces_up: int = 0
    interfaces_down: int = 0
    total_in_octets: int = 0
    total_out_octets: int = 0
    total_in_errors: int = 0
    total_out_errors: int = 0
    # Service status (vendor-specific)
    services_status: dict[str, bool] = Field(default_factory=dict)
    # Availability
    is_available: bool = False


class DeviceWithInterfaces(Device):
    """Device model with associated interfaces."""

    interfaces: list["Interface"] = Field(default_factory=list)
    interface_count: int = 0
    active_alerts: int = 0
    # Latest metrics snapshot
    latest_metrics: LatestDeviceMetrics | None = None

    class Config:
        from_attributes = True


# Forward reference for circular import
from .interface import Interface
DeviceWithInterfaces.model_rebuild()
