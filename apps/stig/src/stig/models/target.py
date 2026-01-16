"""Target (audit asset) models."""

from datetime import datetime
from enum import Enum
from typing import Annotated

from pydantic import BaseModel, Field, field_validator
import ipaddress


class Platform(str, Enum):
    """Supported platforms for STIG audits."""

    LINUX = "linux"
    REDHAT = "redhat"
    MACOS = "macos"
    WINDOWS = "windows"
    CISCO_IOS = "cisco_ios"
    CISCO_NXOS = "cisco_nxos"
    ARISTA_EOS = "arista_eos"
    HPE_ARUBA_CX = "hpe_aruba_cx"
    HP_PROCURVE = "hp_procurve"
    MELLANOX = "mellanox"
    JUNIPER_SRX = "juniper_srx"
    JUNIPER_JUNOS = "juniper_junos"
    PFSENSE = "pfsense"
    PALOALTO = "paloalto"
    FORTINET = "fortinet"
    F5_BIGIP = "f5_bigip"
    VMWARE_ESXI = "vmware_esxi"
    VMWARE_VCENTER = "vmware_vcenter"


class ConnectionType(str, Enum):
    """Connection types for remote audits."""

    SSH = "ssh"
    NETMIKO = "netmiko"
    WINRM = "winrm"
    API = "api"
    CONFIG = "config"  # Configuration file analysis (no live connection)


class TargetBase(BaseModel):
    """Base target model with common fields."""

    name: Annotated[str, Field(min_length=1, max_length=255)]
    ip_address: str
    platform: Platform
    os_version: str | None = None
    connection_type: ConnectionType
    credential_id: str | None = None  # Vault reference
    port: Annotated[int | None, Field(ge=1, le=65535)] = None

    @field_validator("ip_address")
    @classmethod
    def validate_ip(cls, v: str) -> str:
        """Validate IP address format."""
        try:
            ipaddress.ip_address(v)
            return v
        except ValueError:
            raise ValueError(f"Invalid IP address: {v}")


class TargetCreate(TargetBase):
    """Model for creating a new target."""

    pass


class TargetUpdate(BaseModel):
    """Model for updating a target."""

    name: Annotated[str | None, Field(min_length=1, max_length=255)] = None
    ip_address: str | None = None
    platform: Platform | None = None
    os_version: str | None = None
    connection_type: ConnectionType | None = None
    credential_id: str | None = None
    port: Annotated[int | None, Field(ge=1, le=65535)] = None
    is_active: bool | None = None

    @field_validator("ip_address")
    @classmethod
    def validate_ip(cls, v: str | None) -> str | None:
        """Validate IP address format if provided."""
        if v is None:
            return None
        try:
            ipaddress.ip_address(v)
            return v
        except ValueError:
            raise ValueError(f"Invalid IP address: {v}")


class Target(TargetBase):
    """Full target model with all fields."""

    id: str
    is_active: bool = True
    last_audit: datetime | None = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
