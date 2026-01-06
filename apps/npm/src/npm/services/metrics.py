"""Metrics service for VictoriaMetrics integration."""

import httpx
from datetime import datetime, timezone, timedelta
from typing import Any

from ..core.config import settings
from ..core.logging import get_logger
from ..db import get_db, DeviceRepository, InterfaceRepository, AlertRepository
from ..models.metrics import (
    MetricPoint, MetricSeries, DeviceMetrics, InterfaceMetrics,
    DashboardStats, DashboardData, TopDevice, TopInterface
)

logger = get_logger(__name__)


class MetricsService:
    """Service for pushing and querying metrics from VictoriaMetrics."""

    def __init__(self) -> None:
        self.base_url = settings.victoria_url
        self.client = httpx.AsyncClient(timeout=30.0)

    async def close(self) -> None:
        """Close the HTTP client."""
        await self.client.aclose()

    async def push_device_metrics(
        self,
        device_id: str,
        device_name: str,
        metrics: DeviceMetrics,
    ) -> None:
        """Push device metrics to VictoriaMetrics."""
        timestamp = int(datetime.now(timezone.utc).timestamp() * 1000)

        metric_lines = [
            f'npm_device_cpu_utilization{{device_id="{device_id}",device_name="{device_name}"}} {metrics.cpu_utilization or 0} {timestamp}',
            f'npm_device_memory_utilization{{device_id="{device_id}",device_name="{device_name}"}} {metrics.memory_utilization or 0} {timestamp}',
            f'npm_device_uptime_seconds{{device_id="{device_id}",device_name="{device_name}"}} {metrics.uptime_seconds or 0} {timestamp}',
            f'npm_device_interfaces_total{{device_id="{device_id}",device_name="{device_name}"}} {metrics.interface_count} {timestamp}',
            f'npm_device_interfaces_up{{device_id="{device_id}",device_name="{device_name}"}} {metrics.interface_up_count} {timestamp}',
            f'npm_device_interfaces_down{{device_id="{device_id}",device_name="{device_name}"}} {metrics.interface_down_count} {timestamp}',
        ]

        try:
            response = await self.client.post(
                f"{self.base_url}/api/v1/import/prometheus",
                content="\n".join(metric_lines),
                headers={"Content-Type": "text/plain"},
            )
            response.raise_for_status()
            logger.debug("device_metrics_pushed", device_id=device_id)
        except httpx.HTTPError as e:
            logger.warning("device_metrics_push_failed", device_id=device_id, error=str(e))

    async def push_interface_metrics(
        self,
        interface_id: str,
        device_id: str,
        interface_name: str,
        metrics: InterfaceMetrics,
    ) -> None:
        """Push interface metrics to VictoriaMetrics."""
        timestamp = int(datetime.now(timezone.utc).timestamp() * 1000)

        metric_lines = [
            f'npm_interface_in_octets{{interface_id="{interface_id}",device_id="{device_id}",interface_name="{interface_name}"}} {metrics.in_octets} {timestamp}',
            f'npm_interface_out_octets{{interface_id="{interface_id}",device_id="{device_id}",interface_name="{interface_name}"}} {metrics.out_octets} {timestamp}',
            f'npm_interface_in_errors{{interface_id="{interface_id}",device_id="{device_id}",interface_name="{interface_name}"}} {metrics.in_errors} {timestamp}',
            f'npm_interface_out_errors{{interface_id="{interface_id}",device_id="{device_id}",interface_name="{interface_name}"}} {metrics.out_errors} {timestamp}',
            f'npm_interface_in_utilization{{interface_id="{interface_id}",device_id="{device_id}",interface_name="{interface_name}"}} {metrics.in_utilization_pct} {timestamp}',
            f'npm_interface_out_utilization{{interface_id="{interface_id}",device_id="{device_id}",interface_name="{interface_name}"}} {metrics.out_utilization_pct} {timestamp}',
        ]

        try:
            response = await self.client.post(
                f"{self.base_url}/api/v1/import/prometheus",
                content="\n".join(metric_lines),
                headers={"Content-Type": "text/plain"},
            )
            response.raise_for_status()
        except httpx.HTTPError as e:
            logger.warning("interface_metrics_push_failed", interface_id=interface_id, error=str(e))

    async def query_metric_history(
        self,
        metric_name: str,
        labels: dict[str, str],
        start: datetime,
        end: datetime,
        step: str = "1m",
    ) -> MetricSeries:
        """Query metric history from VictoriaMetrics."""
        label_str = ",".join(f'{k}="{v}"' for k, v in labels.items())
        query = f'{metric_name}{{{label_str}}}'

        try:
            response = await self.client.get(
                f"{self.base_url}/api/v1/query_range",
                params={
                    "query": query,
                    "start": start.timestamp(),
                    "end": end.timestamp(),
                    "step": step,
                },
            )
            response.raise_for_status()
            data = response.json()

            points = []
            if data.get("status") == "success" and data.get("data", {}).get("result"):
                result = data["data"]["result"][0]
                points = [
                    MetricPoint(
                        timestamp=datetime.fromtimestamp(point[0], tz=timezone.utc),
                        value=float(point[1]),
                    )
                    for point in result.get("values", [])
                ]

            return MetricSeries(
                metric_name=metric_name,
                labels=labels,
                points=points,
            )
        except httpx.HTTPError as e:
            logger.warning("metric_query_failed", metric=metric_name, error=str(e))
            return MetricSeries(metric_name=metric_name, labels=labels)

    async def query_instant(
        self,
        query: str,
    ) -> list[dict[str, Any]]:
        """Query instant metric values."""
        try:
            response = await self.client.get(
                f"{self.base_url}/api/v1/query",
                params={"query": query},
            )
            response.raise_for_status()
            data = response.json()

            if data.get("status") == "success":
                return data.get("data", {}).get("result", [])
            return []
        except httpx.HTTPError as e:
            logger.warning("instant_query_failed", query=query, error=str(e))
            return []

    async def get_device_metrics(
        self,
        device_id: str,
        start: datetime | None = None,
        end: datetime | None = None,
        step: str = "1m",
    ) -> dict[str, MetricSeries]:
        """Get all metrics for a device."""
        end = end or datetime.now(timezone.utc)
        start = start or (end - timedelta(hours=1))

        labels = {"device_id": device_id}
        metrics = {}

        for metric_name in [
            "npm_device_cpu_utilization",
            "npm_device_memory_utilization",
            "npm_device_uptime_seconds",
        ]:
            metrics[metric_name] = await self.query_metric_history(
                metric_name, labels, start, end, step
            )

        return metrics

    async def get_interface_metrics(
        self,
        interface_id: str,
        start: datetime | None = None,
        end: datetime | None = None,
        step: str = "1m",
    ) -> dict[str, MetricSeries]:
        """Get all metrics for an interface."""
        end = end or datetime.now(timezone.utc)
        start = start or (end - timedelta(hours=1))

        labels = {"interface_id": interface_id}
        metrics = {}

        for metric_name in [
            "npm_interface_in_octets",
            "npm_interface_out_octets",
            "npm_interface_in_errors",
            "npm_interface_out_errors",
            "npm_interface_in_utilization",
            "npm_interface_out_utilization",
        ]:
            metrics[metric_name] = await self.query_metric_history(
                metric_name, labels, start, end, step
            )

        return metrics

    async def get_dashboard_stats(self) -> DashboardStats:
        """Get aggregated statistics for the NPM dashboard."""
        async with get_db() as conn:
            device_repo = DeviceRepository(conn)
            interface_repo = InterfaceRepository(conn)
            alert_repo = AlertRepository(conn)

            device_stats = await device_repo.get_stats()
            interface_stats = await interface_repo.get_stats()
            alert_counts = await alert_repo.get_active_count()

            return DashboardStats(
                total_devices=device_stats.get("total", 0),
                devices_up=device_stats.get("up", 0),
                devices_down=device_stats.get("down", 0),
                devices_degraded=device_stats.get("degraded", 0),
                total_interfaces=interface_stats.get("total", 0),
                interfaces_up=interface_stats.get("up", 0),
                interfaces_down=interface_stats.get("down", 0),
                active_alerts=alert_counts.get("total", 0),
                critical_alerts=alert_counts.get("critical", 0),
                warning_alerts=alert_counts.get("warning", 0),
            )

    async def get_dashboard_data(self) -> DashboardData:
        """Get complete dashboard data including top metrics."""
        stats = await self.get_dashboard_stats()

        # Get recent alerts
        async with get_db() as conn:
            alert_repo = AlertRepository(conn)
            recent_alerts = await alert_repo.get_recent(limit=10)

        # Query top devices by CPU (from VictoriaMetrics)
        top_cpu = await self.query_instant("topk(5, npm_device_cpu_utilization)")
        top_devices_cpu = [
            TopDevice(
                device_id=r.get("metric", {}).get("device_id", ""),
                device_name=r.get("metric", {}).get("device_name", ""),
                device_ip="",
                value=float(r.get("value", [0, 0])[1]),
                unit="%",
            )
            for r in top_cpu
        ]

        # Query top interfaces by utilization
        top_util = await self.query_instant(
            "topk(5, max(npm_interface_in_utilization, npm_interface_out_utilization))"
        )
        top_interfaces = [
            TopInterface(
                interface_id=r.get("metric", {}).get("interface_id", ""),
                interface_name=r.get("metric", {}).get("interface_name", ""),
                device_id=r.get("metric", {}).get("device_id", ""),
                device_name=r.get("metric", {}).get("device_name", ""),
                value=float(r.get("value", [0, 0])[1]),
                unit="%",
            )
            for r in top_util
        ]

        return DashboardData(
            stats=stats,
            top_devices_by_cpu=top_devices_cpu,
            top_interfaces_by_utilization=top_interfaces,
            recent_alerts=recent_alerts,
        )
