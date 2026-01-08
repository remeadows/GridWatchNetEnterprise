"""SNMPv3 polling service for device monitoring with real metrics collection."""

import asyncio
import subprocess
import re
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any
from dataclasses import dataclass

from pysnmp.hlapi.v3arch.asyncio import (
    get_cmd,
    bulk_cmd,
    UsmUserData,
    UdpTransportTarget,
    ContextData,
    ObjectType,
    ObjectIdentity,
    SnmpEngine,
)
from pysnmp.hlapi.v3arch.asyncio import (
    usmHMACSHAAuthProtocol,
    usmHMAC128SHA224AuthProtocol,
    usmHMAC192SHA256AuthProtocol,
    usmHMAC256SHA384AuthProtocol,
    usmHMAC384SHA512AuthProtocol,
    usmAesCfb128Protocol,
    usmAesCfb192Protocol,
    usmAesCfb256Protocol,
    usmNoAuthProtocol,
    usmNoPrivProtocol,
)

from ..core.config import settings
from ..core.logging import get_logger, configure_logging
from ..db import init_db, close_db, get_db
from ..models.metrics import DeviceMetrics

logger = get_logger(__name__)

# ============================================
# Standard SNMP OIDs (RFC 1213/2863)
# ============================================

# System MIB
OID_SYS_DESCR = "1.3.6.1.2.1.1.1.0"
OID_SYS_UPTIME = "1.3.6.1.2.1.1.3.0"
OID_SYS_NAME = "1.3.6.1.2.1.1.5.0"

# Interface MIB
OID_IF_NUMBER = "1.3.6.1.2.1.2.1.0"
OID_IF_TABLE = "1.3.6.1.2.1.2.2.1"

# ============================================
# Vendor-Specific CPU OIDs
# ============================================

VENDOR_CPU_OIDS = {
    # Cisco IOS/IOS-XE (5-minute CPU average)
    "cisco": [
        "1.3.6.1.4.1.9.9.109.1.1.1.1.8.1",  # cpmCPUTotal5minRev
        "1.3.6.1.4.1.9.9.109.1.1.1.1.5.1",  # cpmCPUTotal5min (older)
        "1.3.6.1.4.1.9.2.1.58.0",           # avgBusy5 (very old IOS)
    ],
    # Cisco NX-OS
    "cisco_nxos": [
        "1.3.6.1.4.1.9.9.305.1.1.1.0",      # cpmCPUTotal5minRev for NX-OS
    ],
    # Juniper
    "juniper": [
        "1.3.6.1.4.1.2636.3.1.13.1.8.9.1.0.0",  # jnxOperatingCPU RE0
        "1.3.6.1.4.1.2636.3.1.13.1.8.9.2.0.0",  # jnxOperatingCPU RE1
    ],
    # Palo Alto
    "paloalto": [
        "1.3.6.1.4.1.25461.2.1.2.3.1.0",    # panSessionUtilization
        "1.3.6.1.4.1.25461.2.1.2.1.1.0",    # panMgmtPanoramaConnected
    ],
    # Fortinet
    "fortinet": [
        "1.3.6.1.4.1.12356.101.4.1.3.0",    # fgSysCpuUsage
    ],
    # Arista
    "arista": [
        "1.3.6.1.2.1.25.3.3.1.2.1",         # hrProcessorLoad (HOST-RESOURCES-MIB)
    ],
    # Generic (HOST-RESOURCES-MIB)
    "generic": [
        "1.3.6.1.2.1.25.3.3.1.2.1",         # hrProcessorLoad
    ],
}

# ============================================
# Vendor-Specific Memory OIDs
# ============================================

VENDOR_MEMORY_OIDS = {
    # Cisco IOS/IOS-XE
    "cisco": {
        "used": "1.3.6.1.4.1.9.9.48.1.1.1.5.1",   # ciscoMemoryPoolUsed (processor pool)
        "free": "1.3.6.1.4.1.9.9.48.1.1.1.6.1",   # ciscoMemoryPoolFree
    },
    # Cisco NX-OS
    "cisco_nxos": {
        "used": "1.3.6.1.4.1.9.9.305.1.1.2.0",    # cpmCPUMemoryUsed
        "free": "1.3.6.1.4.1.9.9.305.1.1.3.0",    # cpmCPUMemoryFree
    },
    # Juniper
    "juniper": {
        "used": "1.3.6.1.4.1.2636.3.1.13.1.11.9.1.0.0",  # jnxOperatingBuffer RE0
        "total": "1.3.6.1.4.1.2636.3.1.13.1.15.9.1.0.0", # jnxOperatingMemory
    },
    # Palo Alto
    "paloalto": {
        "used_percent": "1.3.6.1.4.1.25461.2.1.2.3.3.0",  # panSessionMax
    },
    # Fortinet
    "fortinet": {
        "used_percent": "1.3.6.1.4.1.12356.101.4.1.4.0",  # fgSysMemUsage
        "total": "1.3.6.1.4.1.12356.101.4.1.5.0",         # fgSysMemCapacity
    },
    # Generic (HOST-RESOURCES-MIB)
    "generic": {
        "total": "1.3.6.1.2.1.25.2.2.0",          # hrMemorySize (KB)
        "storage_table": "1.3.6.1.2.1.25.2.3.1",  # hrStorageTable
    },
}

# Auth protocol mapping
AUTH_PROTOCOLS = {
    "SHA": usmHMACSHAAuthProtocol,
    "SHA-224": usmHMAC128SHA224AuthProtocol,
    "SHA-256": usmHMAC192SHA256AuthProtocol,
    "SHA-384": usmHMAC256SHA384AuthProtocol,
    "SHA-512": usmHMAC384SHA512AuthProtocol,
    None: usmNoAuthProtocol,
}

# Privacy protocol mapping
PRIV_PROTOCOLS = {
    "AES": usmAesCfb128Protocol,
    "AES-128": usmAesCfb128Protocol,
    "AES-192": usmAesCfb192Protocol,
    "AES-256": usmAesCfb256Protocol,
    None: usmNoPrivProtocol,
}


@dataclass
class SNMPv3Credential:
    """SNMPv3 credential data."""
    username: str
    security_level: str  # noAuthNoPriv, authNoPriv, authPriv
    auth_protocol: str | None
    auth_password: str | None
    priv_protocol: str | None
    priv_password: str | None
    context_name: str | None = None


@dataclass
class ICMPResult:
    """ICMP ping result."""
    reachable: bool
    latency_ms: float | None
    packet_loss_percent: float


class SNMPv3Client:
    """SNMPv3 client for querying devices."""

    def __init__(self) -> None:
        self.engine = SnmpEngine()

    def _get_user_data(self, credential: SNMPv3Credential) -> UsmUserData:
        """Build USM user data from credential."""
        auth_proto = AUTH_PROTOCOLS.get(credential.auth_protocol, usmNoAuthProtocol)
        priv_proto = PRIV_PROTOCOLS.get(credential.priv_protocol, usmNoPrivProtocol)

        if credential.security_level == "noAuthNoPriv":
            return UsmUserData(credential.username)
        elif credential.security_level == "authNoPriv":
            return UsmUserData(
                credential.username,
                authKey=credential.auth_password,
                authProtocol=auth_proto,
            )
        else:  # authPriv
            return UsmUserData(
                credential.username,
                authKey=credential.auth_password,
                authProtocol=auth_proto,
                privKey=credential.priv_password,
                privProtocol=priv_proto,
            )

    async def get(
        self,
        ip: str,
        port: int,
        credential: SNMPv3Credential,
        oid: str,
        timeout: float = 5.0,
        retries: int = 2,
    ) -> Any:
        """Perform SNMPv3 GET operation."""
        try:
            user_data = self._get_user_data(credential)
            context = ContextData(contextName=credential.context_name or "")

            error_indication, error_status, error_index, var_binds = await get_cmd(
                self.engine,
                user_data,
                await UdpTransportTarget.create((ip, port), timeout=timeout, retries=retries),
                context,
                ObjectType(ObjectIdentity(oid)),
            )

            if error_indication:
                logger.warning("snmp_get_error", ip=ip, oid=oid, error=str(error_indication))
                return None

            if error_status:
                logger.warning(
                    "snmp_get_status_error",
                    ip=ip,
                    oid=oid,
                    error=error_status.prettyPrint(),
                    index=error_index,
                )
                return None

            for var_bind in var_binds:
                return var_bind[1]

            return None

        except Exception as e:
            logger.error("snmp_get_exception", ip=ip, oid=oid, error=str(e))
            return None

    async def get_multiple(
        self,
        ip: str,
        port: int,
        credential: SNMPv3Credential,
        oids: list[str],
        timeout: float = 5.0,
        retries: int = 2,
    ) -> dict[str, Any]:
        """Perform multiple SNMPv3 GET operations."""
        results = {}
        for oid in oids:
            result = await self.get(ip, port, credential, oid, timeout, retries)
            results[oid] = result
        return results


class ICMPPoller:
    """ICMP ping poller using system ping command."""

    async def ping(
        self,
        ip: str,
        count: int = 3,
        timeout: int = 2,
    ) -> ICMPResult:
        """Ping a host and return results."""
        try:
            # Use system ping command
            import platform
            if platform.system().lower() == "windows":
                cmd = ["ping", "-n", str(count), "-w", str(timeout * 1000), ip]
            else:
                cmd = ["ping", "-c", str(count), "-W", str(timeout), ip]

            process = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            stdout, _ = await asyncio.wait_for(
                process.communicate(),
                timeout=timeout * count + 5,
            )

            output = stdout.decode("utf-8", errors="ignore")

            # Parse results
            if process.returncode == 0:
                # Extract latency (average)
                latency_match = re.search(
                    r"(?:rtt|round-trip)\s+min/avg/max.*?=\s*[\d.]+/([\d.]+)/",
                    output,
                    re.IGNORECASE,
                )
                if not latency_match:
                    # Windows format
                    latency_match = re.search(r"Average\s*=\s*(\d+)ms", output, re.IGNORECASE)

                latency = float(latency_match.group(1)) if latency_match else None

                # Extract packet loss
                loss_match = re.search(r"(\d+)%\s+(?:packet\s+)?loss", output, re.IGNORECASE)
                packet_loss = float(loss_match.group(1)) if loss_match else 0.0

                return ICMPResult(
                    reachable=True,
                    latency_ms=latency,
                    packet_loss_percent=packet_loss,
                )
            else:
                return ICMPResult(
                    reachable=False,
                    latency_ms=None,
                    packet_loss_percent=100.0,
                )

        except asyncio.TimeoutError:
            return ICMPResult(
                reachable=False,
                latency_ms=None,
                packet_loss_percent=100.0,
            )
        except Exception as e:
            logger.error("icmp_ping_error", ip=ip, error=str(e))
            return ICMPResult(
                reachable=False,
                latency_ms=None,
                packet_loss_percent=100.0,
            )


class SNMPv3MetricsCollector:
    """Collects CPU, memory, and interface metrics via SNMPv3."""

    def __init__(self) -> None:
        self.snmp_client = SNMPv3Client()
        self.icmp_poller = ICMPPoller()
        self._running = False
        self._poll_task: asyncio.Task | None = None

    async def start(self) -> None:
        """Start the metrics collection loop."""
        self._running = True
        logger.info("snmpv3_metrics_collector_starting")
        self._poll_task = asyncio.create_task(self._poll_loop())

    async def stop(self) -> None:
        """Stop the metrics collection loop."""
        self._running = False
        if self._poll_task:
            self._poll_task.cancel()
            try:
                await self._poll_task
            except asyncio.CancelledError:
                pass
        logger.info("snmpv3_metrics_collector_stopped")

    async def _poll_loop(self) -> None:
        """Main polling loop."""
        while self._running:
            try:
                await self._poll_all_devices()
            except Exception as e:
                logger.error("metrics_poll_loop_error", error=str(e))

            # Wait for next poll interval
            poll_interval = getattr(settings, "default_poll_interval", 60)
            await asyncio.sleep(poll_interval)

    async def _poll_all_devices(self) -> None:
        """Poll all active devices for metrics."""
        async with get_db() as conn:
            # Get all active devices with SNMP or ICMP enabled
            result = await conn.execute("""
                SELECT
                    d.id, d.name, d.ip_address::text as ip_address, d.device_type,
                    d.vendor, d.poll_icmp, d.poll_snmp, d.snmp_port,
                    c.username, c.security_level, c.auth_protocol,
                    c.auth_password_encrypted, c.priv_protocol, c.priv_password_encrypted,
                    c.context_name
                FROM npm.devices d
                LEFT JOIN npm.snmpv3_credentials c ON d.snmpv3_credential_id = c.id
                WHERE d.is_active = true
                ORDER BY d.last_poll NULLS FIRST
                LIMIT 100
            """)
            devices = result.fetchall()

        logger.info("polling_devices_for_metrics", count=len(devices))

        # Create semaphore to limit concurrent polls
        max_concurrent = getattr(settings, "max_concurrent_polls", 20)
        semaphore = asyncio.Semaphore(max_concurrent)

        async def poll_with_limit(device):
            async with semaphore:
                await self._poll_device(device)

        # Poll devices concurrently
        await asyncio.gather(
            *[poll_with_limit(device) for device in devices],
            return_exceptions=True,
        )

    async def _poll_device(self, device) -> None:
        """Poll a single device for metrics."""
        device_id = str(device.id)
        device_name = device.name
        ip_address = device.ip_address
        vendor = (device.vendor or "").lower()

        logger.debug("polling_device_metrics", device_id=device_id, name=device_name)

        collected_at = datetime.now(timezone.utc)
        metrics = DeviceMetrics(
            device_id=device_id,
            device_name=device_name,
            timestamp=collected_at,
        )

        # ICMP polling
        if device.poll_icmp:
            icmp_result = await self.icmp_poller.ping(ip_address)
            metrics.icmp_reachable = icmp_result.reachable
            metrics.icmp_latency_ms = icmp_result.latency_ms
            metrics.icmp_packet_loss_percent = icmp_result.packet_loss_percent

        # SNMPv3 polling
        if device.poll_snmp and device.username:
            credential = SNMPv3Credential(
                username=device.username,
                security_level=device.security_level,
                auth_protocol=device.auth_protocol,
                auth_password=device.auth_password_encrypted,  # Should be decrypted from Vault
                priv_protocol=device.priv_protocol,
                priv_password=device.priv_password_encrypted,  # Should be decrypted from Vault
                context_name=device.context_name,
            )

            # Get uptime
            uptime_raw = await self.snmp_client.get(
                ip_address, device.snmp_port or 161, credential, OID_SYS_UPTIME
            )
            if uptime_raw is not None:
                # sysUpTime is in hundredths of a second
                try:
                    metrics.uptime_seconds = int(uptime_raw) // 100
                except (ValueError, TypeError):
                    pass

            # Get CPU metrics (try vendor-specific OIDs)
            cpu_value = await self._get_cpu_metrics(
                ip_address, device.snmp_port or 161, credential, vendor
            )
            if cpu_value is not None:
                metrics.cpu_utilization = cpu_value

            # Get memory metrics
            memory_data = await self._get_memory_metrics(
                ip_address, device.snmp_port or 161, credential, vendor
            )
            if memory_data:
                metrics.memory_utilization = memory_data.get("utilization")
                metrics.memory_total_bytes = memory_data.get("total")
                metrics.memory_used_bytes = memory_data.get("used")

            # Get interface counts
            if_number = await self.snmp_client.get(
                ip_address, device.snmp_port or 161, credential, OID_IF_NUMBER
            )
            if if_number is not None:
                try:
                    metrics.interface_count = int(if_number)
                except (ValueError, TypeError):
                    pass

        # Determine availability
        metrics.is_available = (
            (metrics.icmp_reachable is True) or
            (metrics.uptime_seconds is not None and metrics.uptime_seconds > 0)
        )

        # Store metrics in database
        await self._store_metrics(device_id, metrics)

        # Update device status
        await self._update_device_status(device_id, metrics)

    async def _get_cpu_metrics(
        self,
        ip: str,
        port: int,
        credential: SNMPv3Credential,
        vendor: str,
    ) -> float | None:
        """Get CPU utilization using vendor-specific OIDs."""
        # Determine vendor type
        vendor_key = self._normalize_vendor(vendor)

        # Try vendor-specific OIDs first
        oid_lists = []
        if vendor_key in VENDOR_CPU_OIDS:
            oid_lists.append(VENDOR_CPU_OIDS[vendor_key])

        # Always try generic as fallback
        if vendor_key != "generic":
            oid_lists.append(VENDOR_CPU_OIDS["generic"])

        for oids in oid_lists:
            for oid in oids:
                result = await self.snmp_client.get(ip, port, credential, oid)
                if result is not None:
                    try:
                        cpu_value = float(result)
                        if 0 <= cpu_value <= 100:
                            return cpu_value
                    except (ValueError, TypeError):
                        continue

        return None

    async def _get_memory_metrics(
        self,
        ip: str,
        port: int,
        credential: SNMPv3Credential,
        vendor: str,
    ) -> dict[str, Any] | None:
        """Get memory utilization using vendor-specific OIDs."""
        vendor_key = self._normalize_vendor(vendor)

        # Try vendor-specific OIDs
        vendor_oids = VENDOR_MEMORY_OIDS.get(vendor_key, {})
        if not vendor_oids:
            vendor_oids = VENDOR_MEMORY_OIDS.get("generic", {})

        result = {}

        if "used_percent" in vendor_oids:
            # Direct percentage available
            mem_pct = await self.snmp_client.get(
                ip, port, credential, vendor_oids["used_percent"]
            )
            if mem_pct is not None:
                try:
                    result["utilization"] = float(mem_pct)
                except (ValueError, TypeError):
                    pass

        elif "used" in vendor_oids and "free" in vendor_oids:
            # Calculate from used + free
            used = await self.snmp_client.get(ip, port, credential, vendor_oids["used"])
            free = await self.snmp_client.get(ip, port, credential, vendor_oids["free"])

            if used is not None and free is not None:
                try:
                    used_bytes = int(used)
                    free_bytes = int(free)
                    total_bytes = used_bytes + free_bytes
                    if total_bytes > 0:
                        result["used"] = used_bytes
                        result["total"] = total_bytes
                        result["utilization"] = (used_bytes / total_bytes) * 100
                except (ValueError, TypeError):
                    pass

        elif "total" in vendor_oids:
            # HOST-RESOURCES-MIB approach (need to walk storage table)
            total = await self.snmp_client.get(ip, port, credential, vendor_oids["total"])
            if total is not None:
                try:
                    # hrMemorySize is in KB
                    result["total"] = int(total) * 1024
                except (ValueError, TypeError):
                    pass

        return result if result else None

    def _normalize_vendor(self, vendor: str) -> str:
        """Normalize vendor name to match OID mapping keys."""
        vendor = vendor.lower().strip()

        if "cisco" in vendor:
            if "nexus" in vendor or "nxos" in vendor or "nx-os" in vendor:
                return "cisco_nxos"
            return "cisco"
        elif "juniper" in vendor:
            return "juniper"
        elif "palo" in vendor or "pan-os" in vendor:
            return "paloalto"
        elif "fortinet" in vendor or "fortigate" in vendor:
            return "fortinet"
        elif "arista" in vendor:
            return "arista"
        else:
            return "generic"

    async def _store_metrics(self, device_id: str, metrics: DeviceMetrics) -> None:
        """Store collected metrics in the database."""
        async with get_db() as conn:
            await conn.execute(
                """
                INSERT INTO npm.device_metrics (
                    device_id, collected_at,
                    icmp_latency_ms, icmp_packet_loss_percent, icmp_reachable,
                    cpu_utilization_percent, memory_utilization_percent,
                    memory_total_bytes, memory_used_bytes, uptime_seconds,
                    total_interfaces, interfaces_up, interfaces_down, is_available
                ) VALUES (
                    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14
                )
                """,
                device_id,
                metrics.timestamp,
                metrics.icmp_latency_ms,
                metrics.icmp_packet_loss_percent,
                metrics.icmp_reachable,
                metrics.cpu_utilization,
                metrics.memory_utilization,
                metrics.memory_total_bytes,
                metrics.memory_used_bytes,
                metrics.uptime_seconds,
                metrics.interface_count,
                metrics.interface_up_count,
                metrics.interface_down_count,
                metrics.is_available,
            )

    async def _update_device_status(self, device_id: str, metrics: DeviceMetrics) -> None:
        """Update device status based on collected metrics."""
        status = "up" if metrics.is_available else "down"
        icmp_status = "up" if metrics.icmp_reachable else "down"
        snmp_status = "up" if metrics.uptime_seconds is not None else "unknown"

        async with get_db() as conn:
            await conn.execute(
                """
                UPDATE npm.devices
                SET
                    status = $2,
                    icmp_status = $3,
                    snmp_status = $4,
                    last_poll = $5,
                    last_icmp_poll = CASE WHEN $6 THEN $5 ELSE last_icmp_poll END,
                    last_snmp_poll = CASE WHEN $7 THEN $5 ELSE last_snmp_poll END,
                    updated_at = NOW()
                WHERE id = $1
                """,
                device_id,
                status,
                icmp_status,
                snmp_status,
                metrics.timestamp,
                metrics.icmp_reachable is not None,
                metrics.uptime_seconds is not None,
            )


async def main() -> None:
    """Main entry point for running the collector as a standalone service."""
    configure_logging()
    logger.info("starting_snmpv3_metrics_collector")

    await init_db()

    collector = SNMPv3MetricsCollector()
    await collector.start()

    try:
        # Keep running until interrupted
        while True:
            await asyncio.sleep(3600)
    except (KeyboardInterrupt, asyncio.CancelledError):
        logger.info("shutting_down_snmpv3_metrics_collector")
    finally:
        await collector.stop()
        await close_db()


if __name__ == "__main__":
    asyncio.run(main())
