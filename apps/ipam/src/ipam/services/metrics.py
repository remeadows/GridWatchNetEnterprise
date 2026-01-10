"""Metrics service for VictoriaMetrics integration."""

import httpx
from datetime import datetime, timezone
from typing import Any

from ..core.config import settings
from ..core.logging import get_logger
from ..db import get_db, NetworkRepository

logger = get_logger(__name__)


def escape_label_value(value: str) -> str:
    """Escape a Prometheus label value.

    Per Prometheus text format spec, label values can contain any Unicode characters.
    Backslash, double-quote, and line feed must be escaped.
    """
    if not value:
        return ""
    return (
        value
        .replace("\\", "\\\\")  # Backslash must be escaped first
        .replace('"', '\\"')    # Double quotes must be escaped
        .replace("\n", "\\n")   # Newlines must be escaped
    )


class MetricsService:
    """Service for pushing and querying metrics from VictoriaMetrics."""

    def __init__(self) -> None:
        self.base_url = settings.victoria_url
        self.client = httpx.AsyncClient(timeout=30.0)

    async def close(self) -> None:
        """Close the HTTP client."""
        await self.client.aclose()

    async def push_network_utilization(
        self,
        network_id: str,
        network_name: str,
        total_addresses: int,
        used_addresses: int,
        active_addresses: int,
    ) -> None:
        """Push network utilization metrics to VictoriaMetrics."""
        timestamp = int(datetime.now(timezone.utc).timestamp() * 1000)
        utilization = (used_addresses / total_addresses * 100) if total_addresses > 0 else 0

        # Escape label values to prevent metric format corruption
        safe_network_id = escape_label_value(network_id)
        safe_network_name = escape_label_value(network_name)

        metrics = [
            f'ipam_network_total_addresses{{network_id="{safe_network_id}",network_name="{safe_network_name}"}} {total_addresses} {timestamp}',
            f'ipam_network_used_addresses{{network_id="{safe_network_id}",network_name="{safe_network_name}"}} {used_addresses} {timestamp}',
            f'ipam_network_active_addresses{{network_id="{safe_network_id}",network_name="{safe_network_name}"}} {active_addresses} {timestamp}',
            f'ipam_network_utilization_percent{{network_id="{safe_network_id}",network_name="{safe_network_name}"}} {utilization:.2f} {timestamp}',
        ]

        try:
            response = await self.client.post(
                f"{self.base_url}/api/v1/import/prometheus",
                content="\n".join(metrics),
                headers={"Content-Type": "text/plain"},
            )
            response.raise_for_status()
            logger.debug("metrics_pushed", network_id=network_id, metrics_count=len(metrics))
        except httpx.HTTPError as e:
            logger.warning("metrics_push_failed", network_id=network_id, error=str(e))

    async def push_scan_metrics(
        self,
        network_id: str,
        network_name: str,
        scan_type: str,
        duration_seconds: float,
        total_ips: int,
        active_ips: int,
        new_ips: int,
    ) -> None:
        """Push scan result metrics to VictoriaMetrics."""
        timestamp = int(datetime.now(timezone.utc).timestamp() * 1000)

        # Escape label values to prevent metric format corruption
        safe_network_id = escape_label_value(network_id)
        safe_network_name = escape_label_value(network_name)
        safe_scan_type = escape_label_value(scan_type)

        metrics = [
            f'ipam_scan_duration_seconds{{network_id="{safe_network_id}",network_name="{safe_network_name}",scan_type="{safe_scan_type}"}} {duration_seconds:.2f} {timestamp}',
            f'ipam_scan_total_ips{{network_id="{safe_network_id}",network_name="{safe_network_name}",scan_type="{safe_scan_type}"}} {total_ips} {timestamp}',
            f'ipam_scan_active_ips{{network_id="{safe_network_id}",network_name="{safe_network_name}",scan_type="{safe_scan_type}"}} {active_ips} {timestamp}',
            f'ipam_scan_new_ips{{network_id="{safe_network_id}",network_name="{safe_network_name}",scan_type="{safe_scan_type}"}} {new_ips} {timestamp}',
        ]

        try:
            response = await self.client.post(
                f"{self.base_url}/api/v1/import/prometheus",
                content="\n".join(metrics),
                headers={"Content-Type": "text/plain"},
            )
            response.raise_for_status()
        except httpx.HTTPError as e:
            logger.warning("scan_metrics_push_failed", network_id=network_id, error=str(e))

    async def query_utilization_history(
        self,
        network_id: str,
        start: datetime,
        end: datetime,
        step: str = "1h",
    ) -> list[dict[str, Any]]:
        """Query utilization history from VictoriaMetrics."""
        safe_network_id = escape_label_value(network_id)
        query = f'ipam_network_utilization_percent{{network_id="{safe_network_id}"}}'

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

            if data.get("status") == "success" and data.get("data", {}).get("result"):
                result = data["data"]["result"][0]
                return [
                    {"timestamp": int(point[0]), "value": float(point[1])}
                    for point in result.get("values", [])
                ]
            return []
        except httpx.HTTPError as e:
            logger.warning("metrics_query_failed", network_id=network_id, error=str(e))
            return []

    async def get_dashboard_metrics(self) -> dict[str, Any]:
        """Get aggregated metrics for the IPAM dashboard."""
        async with get_db() as conn:
            repo = NetworkRepository(conn)
            networks, total = await repo.find_all(limit=1000)

            total_addresses = 0
            total_used = 0
            total_active = 0

            for network in networks:
                stats = await repo.get_stats(network.id)
                if stats:
                    total_addresses += stats.total_addresses
                    total_used += stats.used_addresses
                    total_active += stats.active_count

            avg_utilization = (
                (total_used / total_addresses * 100) if total_addresses > 0 else 0
            )

            return {
                "total_networks": total,
                "total_addresses": total_addresses,
                "used_addresses": total_used,
                "active_addresses": total_active,
                "average_utilization": round(avg_utilization, 2),
            }

    async def refresh_all_network_metrics(self) -> int:
        """Refresh metrics for all networks (called periodically)."""
        async with get_db() as conn:
            repo = NetworkRepository(conn)
            networks, _ = await repo.find_all(limit=1000)
            count = 0

            for network in networks:
                stats = await repo.get_stats(network.id)
                if stats:
                    await self.push_network_utilization(
                        network_id=network.id,
                        network_name=network.name,
                        total_addresses=stats.total_addresses,
                        used_addresses=stats.used_addresses,
                        active_addresses=stats.active_count,
                    )
                    count += 1

            logger.info("metrics_refreshed", networks_count=count)
            return count
