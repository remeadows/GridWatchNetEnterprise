"""SNMP polling service for device monitoring."""

import asyncio
from datetime import datetime, timezone
from typing import Any

from ..core.config import settings
from ..core.logging import get_logger, configure_logging
from ..db import init_db, close_db, get_db, DeviceRepository, InterfaceRepository
from ..models.device import Device, DeviceStatus
from ..models.interface import InterfaceCreate, InterfaceStatus, AdminStatus
from ..models.metrics import DeviceMetrics, InterfaceMetrics
from ..services.device import DeviceService
from ..services.metrics import MetricsService

logger = get_logger(__name__)

# Standard SNMP OIDs
OID_SYSTEM_DESCR = "1.3.6.1.2.1.1.1.0"
OID_SYSTEM_UPTIME = "1.3.6.1.2.1.1.3.0"
OID_SYSTEM_NAME = "1.3.6.1.2.1.1.5.0"

# Interface OIDs (ifTable)
OID_IF_NUMBER = "1.3.6.1.2.1.2.1.0"
OID_IF_TABLE = "1.3.6.1.2.1.2.2.1"
OID_IF_DESCR = "1.3.6.1.2.1.2.2.1.2"
OID_IF_TYPE = "1.3.6.1.2.1.2.2.1.3"
OID_IF_SPEED = "1.3.6.1.2.1.2.2.1.5"
OID_IF_PHYS_ADDRESS = "1.3.6.1.2.1.2.2.1.6"
OID_IF_ADMIN_STATUS = "1.3.6.1.2.1.2.2.1.7"
OID_IF_OPER_STATUS = "1.3.6.1.2.1.2.2.1.8"
OID_IF_IN_OCTETS = "1.3.6.1.2.1.2.2.1.10"
OID_IF_OUT_OCTETS = "1.3.6.1.2.1.2.2.1.16"
OID_IF_IN_ERRORS = "1.3.6.1.2.1.2.2.1.14"
OID_IF_OUT_ERRORS = "1.3.6.1.2.1.2.2.1.20"

# ifXTable for 64-bit counters
OID_IF_HC_IN_OCTETS = "1.3.6.1.2.1.31.1.1.1.6"
OID_IF_HC_OUT_OCTETS = "1.3.6.1.2.1.31.1.1.1.10"
OID_IF_NAME = "1.3.6.1.2.1.31.1.1.1.1"
OID_IF_ALIAS = "1.3.6.1.2.1.31.1.1.1.18"


class SNMPPoller:
    """SNMP polling service for collecting device metrics."""

    def __init__(self) -> None:
        self.device_service = DeviceService()
        self.metrics_service = MetricsService()
        self._running = False
        self._poll_task: asyncio.Task | None = None

    async def start(self) -> None:
        """Start the polling loop."""
        self._running = True
        logger.info("snmp_poller_starting")
        self._poll_task = asyncio.create_task(self._poll_loop())

    async def stop(self) -> None:
        """Stop the polling loop."""
        self._running = False
        if self._poll_task:
            self._poll_task.cancel()
            try:
                await self._poll_task
            except asyncio.CancelledError:
                pass
        await self.metrics_service.close()
        logger.info("snmp_poller_stopped")

    async def _poll_loop(self) -> None:
        """Main polling loop."""
        while self._running:
            try:
                await self._poll_all_devices()
            except Exception as e:
                logger.error("poll_loop_error", error=str(e))

            # Wait for next poll interval
            await asyncio.sleep(settings.default_poll_interval)

    async def _poll_all_devices(self) -> None:
        """Poll all active devices."""
        devices = await self.device_service.get_active_devices_for_polling()
        logger.info("polling_devices", count=len(devices))

        # Create semaphore to limit concurrent polls
        semaphore = asyncio.Semaphore(settings.max_concurrent_polls)

        async def poll_with_limit(device: Device):
            async with semaphore:
                await self._poll_device(device)

        # Poll devices concurrently
        await asyncio.gather(
            *[poll_with_limit(device) for device in devices],
            return_exceptions=True,
        )

    async def _poll_device(self, device: Device) -> None:
        """Poll a single device via SNMP."""
        logger.debug("polling_device", device_id=device.id, name=device.name)

        try:
            # Get SNMP community
            community = await self.device_service.get_snmp_community(device.id)
            if not community:
                logger.warning("no_snmp_community", device_id=device.id)
                await self._update_device_status(device.id, DeviceStatus.UNKNOWN)
                return

            # Perform SNMP queries
            device_metrics = await self._get_device_metrics(device, community)

            if device_metrics:
                # Device is responding - mark as UP
                await self._update_device_status(device.id, DeviceStatus.UP)

                # Push metrics to VictoriaMetrics
                await self.metrics_service.push_device_metrics(
                    device.id, device.name, device_metrics
                )

                # Poll interfaces
                await self._poll_interfaces(device, community)
            else:
                # Device not responding - mark as DOWN
                await self._update_device_status(device.id, DeviceStatus.DOWN)

        except Exception as e:
            logger.error("device_poll_failed", device_id=device.id, error=str(e))
            await self._update_device_status(device.id, DeviceStatus.DOWN)

    async def _get_device_metrics(
        self,
        device: Device,
        community: str,
    ) -> DeviceMetrics | None:
        """Get device-level metrics via SNMP."""
        try:
            # For now, return simulated metrics
            # In production, use pysnmp to perform actual SNMP queries
            uptime = await self._snmp_get(device.ip_address, community, OID_SYSTEM_UPTIME)

            if uptime is None:
                return None

            return DeviceMetrics(
                device_id=device.id,
                device_name=device.name,
                timestamp=datetime.now(timezone.utc),
                uptime_seconds=uptime,
                cpu_utilization=None,  # Would need vendor-specific OIDs
                memory_utilization=None,
            )
        except Exception as e:
            logger.warning("device_metrics_failed", device_id=device.id, error=str(e))
            return None

    async def _poll_interfaces(self, device: Device, community: str) -> None:
        """Poll and update interface information."""
        try:
            # Get interface count
            if_count = await self._snmp_get(device.ip_address, community, OID_IF_NUMBER)
            if not if_count:
                return

            # Walk interface table
            interfaces_data = await self._snmp_walk_interfaces(
                device.ip_address, community, if_count
            )

            async with get_db() as conn:
                repo = InterfaceRepository(conn)

                for if_data in interfaces_data:
                    # Upsert interface
                    interface = await repo.upsert(
                        InterfaceCreate(
                            device_id=device.id,
                            if_index=if_data["if_index"],
                            name=if_data.get("name"),
                            description=if_data.get("description"),
                            mac_address=if_data.get("mac_address"),
                            speed_mbps=if_data.get("speed_mbps"),
                            admin_status=if_data.get("admin_status"),
                            oper_status=if_data.get("oper_status"),
                        )
                    )

                    # Push interface metrics
                    if interface:
                        metrics = InterfaceMetrics(
                            interface_id=interface.id,
                            device_id=device.id,
                            interface_name=interface.name or f"if{interface.if_index}",
                            timestamp=datetime.now(timezone.utc),
                            in_octets=if_data.get("in_octets", 0),
                            out_octets=if_data.get("out_octets", 0),
                            in_errors=if_data.get("in_errors", 0),
                            out_errors=if_data.get("out_errors", 0),
                            speed_mbps=if_data.get("speed_mbps"),
                        )
                        await self.metrics_service.push_interface_metrics(
                            interface.id, device.id, interface.name or "", metrics
                        )

        except Exception as e:
            logger.warning("interface_poll_failed", device_id=device.id, error=str(e))

    async def _snmp_get(self, ip: str, community: str, oid: str) -> Any:
        """Perform SNMP GET operation.

        This is a placeholder implementation. In production, use pysnmp:

        from pysnmp.hlapi.asyncio import get_cmd, CommunityData, UdpTransportTarget, ObjectType, ObjectIdentity

        errorIndication, errorStatus, errorIndex, varBinds = await get_cmd(
            snmpEngine,
            CommunityData(community),
            UdpTransportTarget((ip, 161), timeout=settings.snmp_timeout, retries=settings.snmp_retries),
            ObjectType(ObjectIdentity(oid))
        )
        """
        # Placeholder - return simulated values for development
        if oid == OID_SYSTEM_UPTIME:
            return 86400  # 1 day in seconds
        if oid == OID_IF_NUMBER:
            return 4  # 4 interfaces
        return None

    async def _snmp_walk_interfaces(
        self,
        ip: str,
        community: str,
        if_count: int,
    ) -> list[dict[str, Any]]:
        """Walk interface table via SNMP.

        This is a placeholder. In production, use pysnmp bulk operations.
        """
        # Placeholder - return simulated interface data
        interfaces = []
        for i in range(1, if_count + 1):
            interfaces.append({
                "if_index": i,
                "name": f"eth{i-1}",
                "description": f"Ethernet interface {i}",
                "speed_mbps": 1000,
                "admin_status": AdminStatus.UP,
                "oper_status": InterfaceStatus.UP if i < if_count else InterfaceStatus.DOWN,
                "in_octets": 1000000 * i,
                "out_octets": 500000 * i,
                "in_errors": 0,
                "out_errors": 0,
            })
        return interfaces

    async def _update_device_status(self, device_id: str, status: DeviceStatus) -> None:
        """Update device status in database."""
        async with get_db() as conn:
            repo = DeviceRepository(conn)
            await repo.update_poll_status(device_id, status)


async def main() -> None:
    """Main entry point for running the poller as a standalone service."""
    configure_logging()
    logger.info("starting_snmp_poller_service")

    await init_db()

    poller = SNMPPoller()
    await poller.start()

    try:
        # Keep running until interrupted
        while True:
            await asyncio.sleep(3600)
    except (KeyboardInterrupt, asyncio.CancelledError):
        logger.info("shutting_down_snmp_poller")
    finally:
        await poller.stop()
        await close_db()


if __name__ == "__main__":
    asyncio.run(main())
