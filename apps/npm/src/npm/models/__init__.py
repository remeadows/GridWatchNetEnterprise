"""NPM data models."""

from .common import APIResponse, PaginatedResponse, Pagination, ErrorResponse
from .device import (
    Device,
    DeviceCreate,
    DeviceUpdate,
    DeviceWithInterfaces,
    DeviceStatus,
    SNMPVersion,
)
from .interface import Interface, InterfaceCreate, InterfaceUpdate, InterfaceStatus
from .alert import (
    Alert,
    AlertCreate,
    AlertUpdate,
    AlertRule,
    AlertRuleCreate,
    AlertRuleUpdate,
    AlertSeverity,
    AlertStatus,
    ConditionType,
)
from .metrics import (
    MetricPoint,
    MetricSeries,
    DeviceMetrics,
    InterfaceMetrics,
    DashboardStats,
)

__all__ = [
    # Common
    "APIResponse",
    "PaginatedResponse",
    "Pagination",
    "ErrorResponse",
    # Device
    "Device",
    "DeviceCreate",
    "DeviceUpdate",
    "DeviceWithInterfaces",
    "DeviceStatus",
    "SNMPVersion",
    # Interface
    "Interface",
    "InterfaceCreate",
    "InterfaceUpdate",
    "InterfaceStatus",
    # Alert
    "Alert",
    "AlertCreate",
    "AlertUpdate",
    "AlertRule",
    "AlertRuleCreate",
    "AlertRuleUpdate",
    "AlertSeverity",
    "AlertStatus",
    "ConditionType",
    # Metrics
    "MetricPoint",
    "MetricSeries",
    "DeviceMetrics",
    "InterfaceMetrics",
    "DashboardStats",
]
