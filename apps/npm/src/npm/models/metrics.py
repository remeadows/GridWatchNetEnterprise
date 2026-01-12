"""Metrics models for NPM service."""

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class MetricPoint(BaseModel):
    """Single metric data point."""

    timestamp: datetime
    value: float


class MetricSeries(BaseModel):
    """Time series of metric values."""

    metric_name: str
    labels: dict[str, str] = Field(default_factory=dict)
    points: list[MetricPoint] = Field(default_factory=list)


class DeviceMetrics(BaseModel):
    """Aggregated device metrics."""

    device_id: str
    device_name: str
    timestamp: datetime
    # ICMP metrics
    icmp_latency_ms: float | None = None
    icmp_packet_loss_percent: float | None = None
    icmp_reachable: bool | None = None
    # SNMP metrics
    cpu_utilization: float | None = None
    memory_utilization: float | None = None
    memory_total_bytes: int | None = None
    memory_used_bytes: int | None = None
    temperature: float | None = None
    uptime_seconds: int | None = None
    # Disk/Storage metrics
    disk_utilization: float | None = None
    disk_total_bytes: int | None = None
    disk_used_bytes: int | None = None
    swap_utilization: float | None = None
    swap_total_bytes: int | None = None
    # Interface summary
    interface_count: int = 0
    interface_up_count: int = 0
    interface_down_count: int = 0
    total_in_octets: int = 0
    total_out_octets: int = 0
    total_in_errors: int = 0
    total_out_errors: int = 0
    # Service status (Sophos/vendor-specific)
    services_status: dict[str, bool] = Field(default_factory=dict)
    # Availability
    is_available: bool = False


class InterfaceMetrics(BaseModel):
    """Interface performance metrics."""

    interface_id: str
    device_id: str
    interface_name: str
    timestamp: datetime
    in_octets: int = 0
    out_octets: int = 0
    in_unicast_pkts: int = 0
    out_unicast_pkts: int = 0
    in_multicast_pkts: int = 0
    out_multicast_pkts: int = 0
    in_broadcast_pkts: int = 0
    out_broadcast_pkts: int = 0
    in_errors: int = 0
    out_errors: int = 0
    in_discards: int = 0
    out_discards: int = 0
    speed_mbps: int | None = None
    in_utilization_pct: float = 0.0
    out_utilization_pct: float = 0.0


class DashboardStats(BaseModel):
    """NPM dashboard statistics."""

    total_devices: int = 0
    devices_up: int = 0
    devices_down: int = 0
    devices_degraded: int = 0
    total_interfaces: int = 0
    interfaces_up: int = 0
    interfaces_down: int = 0
    active_alerts: int = 0
    critical_alerts: int = 0
    warning_alerts: int = 0
    avg_availability: float = 0.0
    total_bandwidth_in_mbps: float = 0.0
    total_bandwidth_out_mbps: float = 0.0


class TopDevice(BaseModel):
    """Top device by metric."""

    device_id: str
    device_name: str
    device_ip: str
    value: float
    unit: str


class TopInterface(BaseModel):
    """Top interface by metric."""

    interface_id: str
    interface_name: str
    device_id: str
    device_name: str
    value: float
    unit: str


class DashboardData(BaseModel):
    """Complete dashboard data."""

    stats: DashboardStats
    top_devices_by_cpu: list[TopDevice] = Field(default_factory=list)
    top_devices_by_memory: list[TopDevice] = Field(default_factory=list)
    top_interfaces_by_utilization: list[TopInterface] = Field(default_factory=list)
    top_interfaces_by_errors: list[TopInterface] = Field(default_factory=list)
    recent_alerts: list[Any] = Field(default_factory=list)
    bandwidth_history: list[MetricSeries] = Field(default_factory=list)
