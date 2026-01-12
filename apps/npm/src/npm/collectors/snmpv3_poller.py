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
    next_cmd,
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
from ..services.crypto import get_crypto_service

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
# Vendor-Specific Disk/Storage OIDs
# ============================================

VENDOR_DISK_OIDS = {
    # Sophos XG/XGS Firewall (SFOS-FIREWALL-MIB)
    "sophos": {
        "disk_percent": "1.3.6.1.4.1.2604.5.1.2.4.2.0",   # sfosDiskPercentUsage
        "disk_capacity": "1.3.6.1.4.1.2604.5.1.2.4.1.0",  # sfosDiskCapacity (MB)
        "swap_percent": "1.3.6.1.4.1.2604.5.1.2.5.4.0",   # sfosSwapPercentUsage
        "swap_capacity": "1.3.6.1.4.1.2604.5.1.2.5.3.0",  # sfosSwapCapacity (MB)
    },
    # Fortinet
    "fortinet": {
        "disk_percent": "1.3.6.1.4.1.12356.101.4.1.6.0",  # fgSysDiskUsage
        "disk_capacity": "1.3.6.1.4.1.12356.101.4.1.7.0", # fgSysDiskCapacity (MB)
    },
    # Palo Alto
    "paloalto": {
        # Palo Alto uses hrStorageTable (HOST-RESOURCES-MIB)
    },
    # Generic (HOST-RESOURCES-MIB) - hrStorageTable
    "generic": {
        "storage_table": "1.3.6.1.2.1.25.2.3.1",  # hrStorageEntry
        # hrStorageDescr (.3), hrStorageAllocationUnits (.4), hrStorageSize (.5), hrStorageUsed (.6)
    },
}

# ============================================
# Sophos Service Status OIDs (SFOS-FIREWALL-MIB)
# ============================================

SOPHOS_SERVICE_OIDS = {
    # sfosXGFirewallServiceStatus branch: 1.3.6.1.4.1.2604.5.1.3.*
    "pop3_service": "1.3.6.1.4.1.2604.5.1.3.1.0",       # sfosPOP3Service
    "imap4_service": "1.3.6.1.4.1.2604.5.1.3.2.0",      # sfosIMAP4Service
    "smtp_service": "1.3.6.1.4.1.2604.5.1.3.3.0",       # sfosSMTPService
    "ftp_service": "1.3.6.1.4.1.2604.5.1.3.4.0",        # sfosFTPService
    "http_service": "1.3.6.1.4.1.2604.5.1.3.5.0",       # sfosHTTPService (Web Proxy)
    "av_service": "1.3.6.1.4.1.2604.5.1.3.6.0",         # sfosAVService (Antivirus)
    "as_service": "1.3.6.1.4.1.2604.5.1.3.7.0",         # sfosASService (Anti-Spam)
    "dns_service": "1.3.6.1.4.1.2604.5.1.3.8.0",        # sfosDNSService
    "ha_service": "1.3.6.1.4.1.2604.5.1.3.9.0",         # sfosHAService
    "ips_service": "1.3.6.1.4.1.2604.5.1.3.10.0",       # sfosIPSService
    "apache_service": "1.3.6.1.4.1.2604.5.1.3.11.0",    # sfosApacheService
    "ntpd_service": "1.3.6.1.4.1.2604.5.1.3.12.0",      # sfosNtpService
    "tomcat_service": "1.3.6.1.4.1.2604.5.1.3.13.0",    # sfosTomcatService
    "vpn_service": "1.3.6.1.4.1.2604.5.1.3.14.0",       # sfosSSLVPNService
    "ipsec_service": "1.3.6.1.4.1.2604.5.1.3.15.0",     # sfosIPSecVPNService
    "database_service": "1.3.6.1.4.1.2604.5.1.3.16.0",  # sfosDatabaseService
    "dgd_service": "1.3.6.1.4.1.2604.5.1.3.17.0",       # sfosDGDService
    "garner_service": "1.3.6.1.4.1.2604.5.1.3.18.0",    # sfosGarnerService
    "droutingd_service": "1.3.6.1.4.1.2604.5.1.3.19.0", # sfosDroutingService
    "snort_service": "1.3.6.1.4.1.2604.5.1.3.20.0",     # sfosSSHDService
}

# ============================================
# Interface MIB OIDs (RFC 2863 - IF-MIB)
# ============================================

# IF-MIB ifTable (1.3.6.1.2.1.2.2.1)
OID_IF_DESCR = "1.3.6.1.2.1.2.2.1.2"           # ifDescr
OID_IF_TYPE = "1.3.6.1.2.1.2.2.1.3"            # ifType
OID_IF_SPEED = "1.3.6.1.2.1.2.2.1.5"           # ifSpeed (bits per second)
OID_IF_ADMIN_STATUS = "1.3.6.1.2.1.2.2.1.7"    # ifAdminStatus
OID_IF_OPER_STATUS = "1.3.6.1.2.1.2.2.1.8"     # ifOperStatus
OID_IF_IN_OCTETS = "1.3.6.1.2.1.2.2.1.10"      # ifInOctets (32-bit)
OID_IF_OUT_OCTETS = "1.3.6.1.2.1.2.2.1.16"     # ifOutOctets (32-bit)
OID_IF_IN_ERRORS = "1.3.6.1.2.1.2.2.1.14"      # ifInErrors
OID_IF_OUT_ERRORS = "1.3.6.1.2.1.2.2.1.20"     # ifOutErrors
OID_IF_IN_DISCARDS = "1.3.6.1.2.1.2.2.1.13"    # ifInDiscards
OID_IF_OUT_DISCARDS = "1.3.6.1.2.1.2.2.1.19"   # ifOutDiscards

# IF-MIB ifXTable (1.3.6.1.2.1.31.1.1.1) - 64-bit counters
OID_IF_NAME = "1.3.6.1.2.1.31.1.1.1.1"         # ifName
OID_IF_HC_IN_OCTETS = "1.3.6.1.2.1.31.1.1.1.6"   # ifHCInOctets (64-bit)
OID_IF_HC_OUT_OCTETS = "1.3.6.1.2.1.31.1.1.1.10" # ifHCOutOctets (64-bit)
OID_IF_HIGH_SPEED = "1.3.6.1.2.1.31.1.1.1.15"    # ifHighSpeed (Mbps)
OID_IF_ALIAS = "1.3.6.1.2.1.31.1.1.1.18"         # ifAlias (description)

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
    # Sophos XG/XGS Firewall (SFOS doesn't expose CPU via SNMP, use generic fallback)
    "sophos": [
        "1.3.6.1.2.1.25.3.3.1.2.1",         # hrProcessorLoad (HOST-RESOURCES-MIB fallback)
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
    # Sophos XG/XGS Firewall (SFOS-FIREWALL-MIB)
    "sophos": {
        "used_percent": "1.3.6.1.4.1.2604.5.1.2.5.2.0",   # sfosMemoryPercentUsage
        "total": "1.3.6.1.4.1.2604.5.1.2.5.1.0",          # sfosMemoryCapacity (MB)
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

    async def walk(
        self,
        ip: str,
        port: int,
        credential: SNMPv3Credential,
        oid: str,
        timeout: float = 5.0,
        retries: int = 2,
        max_rows: int = 100,
    ) -> dict[str, Any]:
        """Perform SNMPv3 WALK operation using next_cmd to retrieve a table."""
        results = {}
        try:
            user_data = self._get_user_data(credential)
            context = ContextData(contextName=credential.context_name or "")
            transport = await UdpTransportTarget.create((ip, port), timeout=timeout, retries=retries)

            current_oid = oid
            rows_fetched = 0

            while rows_fetched < max_rows:
                error_indication, error_status, error_index, var_binds = await next_cmd(
                    self.engine,
                    user_data,
                    transport,
                    context,
                    ObjectType(ObjectIdentity(current_oid)),
                )

                if error_indication:
                    logger.warning("snmp_walk_error", ip=ip, oid=oid, error=str(error_indication))
                    break

                if error_status:
                    logger.warning(
                        "snmp_walk_status_error",
                        ip=ip,
                        oid=oid,
                        error=error_status.prettyPrint(),
                        index=error_index,
                    )
                    break

                if not var_binds:
                    break

                for var_bind in var_binds:
                    oid_str = str(var_bind[0])
                    if not oid_str.startswith(oid):
                        # We've walked past the requested OID tree
                        return results
                    results[oid_str] = var_bind[1]
                    current_oid = oid_str
                    rows_fetched += 1

        except Exception as e:
            logger.error("snmp_walk_exception", ip=ip, oid=oid, error=str(e))

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
            devices = await conn.fetch("""
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

        logger.info("polling_devices_for_metrics", count=len(devices))

        # Create semaphore to limit concurrent polls
        max_concurrent = getattr(settings, "max_concurrent_polls", 20)
        semaphore = asyncio.Semaphore(max_concurrent)

        async def poll_with_limit(device):
            async with semaphore:
                try:
                    await self._poll_device(device)
                except Exception as e:
                    logger.error("poll_device_exception", device_id=str(device['id']), error=str(e), exc_info=True)

        # Poll devices concurrently
        logger.info("starting_device_polls", device_count=len(devices))
        results = await asyncio.gather(
            *[poll_with_limit(device) for device in devices],
            return_exceptions=True,
        )
        # Log any exceptions from gather
        for i, result in enumerate(results):
            if isinstance(result, Exception):
                logger.error("gather_exception", index=i, error=str(result))
        logger.info("finished_device_polls")

    async def _poll_device(self, device) -> None:
        """Poll a single device for metrics."""
        # asyncpg Record uses dict-like access
        device_id = str(device['id'])
        device_name = device['name']
        # Remove CIDR suffix if present (e.g., "192.168.1.1/32" -> "192.168.1.1")
        ip_address_raw = device['ip_address']
        ip_address = ip_address_raw.split('/')[0] if ip_address_raw else ip_address_raw
        vendor = (device['vendor'] or "").lower()

        logger.debug("polling_device_metrics", device_id=device_id, name=device_name)

        collected_at = datetime.now(timezone.utc)
        metrics = DeviceMetrics(
            device_id=device_id,
            device_name=device_name,
            timestamp=collected_at,
        )

        # ICMP polling
        if device['poll_icmp']:
            icmp_result = await self.icmp_poller.ping(ip_address)
            metrics.icmp_reachable = icmp_result.reachable
            metrics.icmp_latency_ms = icmp_result.latency_ms
            metrics.icmp_packet_loss_percent = icmp_result.packet_loss_percent

        # SNMPv3 polling
        logger.info("snmp_check", device_id=device_id, poll_snmp=device['poll_snmp'], username=device['username'])
        if device['poll_snmp'] and device['username']:
            # Decrypt passwords from encrypted storage
            crypto = get_crypto_service()
            auth_password = None
            priv_password = None
            try:
                if device['auth_password_encrypted']:
                    auth_password = crypto.decrypt(device['auth_password_encrypted'])
                if device['priv_password_encrypted']:
                    priv_password = crypto.decrypt(device['priv_password_encrypted'])
            except Exception as e:
                logger.error("credential_decryption_failed", device_id=device_id, error=str(e))

            credential = SNMPv3Credential(
                username=device['username'],
                security_level=device['security_level'],
                auth_protocol=device['auth_protocol'],
                auth_password=auth_password,
                priv_protocol=device['priv_protocol'],
                priv_password=priv_password,
                context_name=device['context_name'],
            )

            # Get uptime
            logger.info("snmpv3_polling_device", ip=ip_address, username=credential.username, security_level=credential.security_level)
            snmp_port = device['snmp_port'] or 161
            uptime_raw = await self.snmp_client.get(
                ip_address, snmp_port, credential, OID_SYS_UPTIME
            )
            logger.info("snmpv3_uptime_result", ip=ip_address, uptime_raw=str(uptime_raw) if uptime_raw else None)
            if uptime_raw is not None:
                # sysUpTime is in hundredths of a second
                try:
                    metrics.uptime_seconds = int(uptime_raw) // 100
                except (ValueError, TypeError):
                    pass

            # Get CPU metrics (try vendor-specific OIDs)
            logger.info("collecting_cpu_metrics", ip=ip_address, vendor=vendor, vendor_key=self._normalize_vendor(vendor))
            cpu_value = await self._get_cpu_metrics(
                ip_address, snmp_port, credential, vendor
            )
            logger.info("cpu_metrics_result", ip=ip_address, cpu_value=cpu_value)
            if cpu_value is not None:
                metrics.cpu_utilization = cpu_value

            # Get memory metrics
            logger.info("collecting_memory_metrics", ip=ip_address, vendor=vendor)
            memory_data = await self._get_memory_metrics(
                ip_address, snmp_port, credential, vendor
            )
            logger.info("memory_metrics_result", ip=ip_address, memory_data=str(memory_data) if memory_data else None)
            if memory_data:
                metrics.memory_utilization = memory_data.get("utilization")
                metrics.memory_total_bytes = memory_data.get("total")
                metrics.memory_used_bytes = memory_data.get("used")

            # Get interface counts
            if_number = await self.snmp_client.get(
                ip_address, snmp_port, credential, OID_IF_NUMBER
            )
            if if_number is not None:
                try:
                    metrics.interface_count = int(if_number)
                except (ValueError, TypeError):
                    pass

            # Get disk/storage metrics
            logger.info("collecting_disk_metrics", ip=ip_address, vendor=vendor)
            disk_data = await self._get_disk_metrics(
                ip_address, snmp_port, credential, vendor
            )
            logger.info("disk_metrics_result", ip=ip_address, disk_data=str(disk_data) if disk_data else None)
            if disk_data:
                metrics.disk_utilization = disk_data.get("disk_utilization")
                metrics.disk_total_bytes = disk_data.get("disk_total")
                metrics.disk_used_bytes = disk_data.get("disk_used")
                metrics.swap_utilization = disk_data.get("swap_utilization")
                metrics.swap_total_bytes = disk_data.get("swap_total")

            # Get interface bandwidth and errors
            logger.info("collecting_interface_metrics", ip=ip_address)
            interface_data = await self._get_interface_metrics(
                ip_address, snmp_port, credential, device_id
            )
            logger.info("interface_metrics_result", ip=ip_address, interface_count=len(interface_data) if interface_data else 0)
            if interface_data:
                # Calculate summaries from interface data
                metrics.interface_up_count = sum(1 for iface in interface_data if iface.get("oper_status") == 1)
                metrics.interface_down_count = sum(1 for iface in interface_data if iface.get("oper_status") == 2)
                metrics.total_in_octets = sum(iface.get("in_octets", 0) or 0 for iface in interface_data)
                metrics.total_out_octets = sum(iface.get("out_octets", 0) or 0 for iface in interface_data)
                metrics.total_in_errors = sum(iface.get("in_errors", 0) or 0 for iface in interface_data)
                metrics.total_out_errors = sum(iface.get("out_errors", 0) or 0 for iface in interface_data)
                # Store detailed interface metrics
                await self._store_interface_metrics(device_id, interface_data, metrics.timestamp)

            # Get service status (vendor-specific)
            vendor_key = self._normalize_vendor(vendor)
            if vendor_key == "sophos":
                logger.info("collecting_service_status", ip=ip_address, vendor=vendor)
                services = await self._get_sophos_service_status(
                    ip_address, snmp_port, credential
                )
                logger.info("service_status_result", ip=ip_address, services=str(services) if services else None)
                if services:
                    metrics.services_status = services

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

    async def _get_disk_metrics(
        self,
        ip: str,
        port: int,
        credential: SNMPv3Credential,
        vendor: str,
    ) -> dict[str, Any] | None:
        """Get disk/storage utilization using vendor-specific OIDs."""
        vendor_key = self._normalize_vendor(vendor)
        vendor_oids = VENDOR_DISK_OIDS.get(vendor_key, {})

        if not vendor_oids:
            vendor_oids = VENDOR_DISK_OIDS.get("generic", {})

        result = {}

        # Sophos and Fortinet have direct percentage OIDs
        if "disk_percent" in vendor_oids:
            disk_pct = await self.snmp_client.get(
                ip, port, credential, vendor_oids["disk_percent"]
            )
            if disk_pct is not None:
                try:
                    result["disk_utilization"] = float(disk_pct)
                except (ValueError, TypeError):
                    pass

            # Get disk capacity if available (in MB, convert to bytes)
            if "disk_capacity" in vendor_oids:
                disk_cap = await self.snmp_client.get(
                    ip, port, credential, vendor_oids["disk_capacity"]
                )
                if disk_cap is not None:
                    try:
                        total_mb = int(disk_cap)
                        result["disk_total"] = total_mb * 1024 * 1024
                        if "disk_utilization" in result:
                            result["disk_used"] = int(result["disk_total"] * result["disk_utilization"] / 100)
                    except (ValueError, TypeError):
                        pass

        # Get swap metrics if available (Sophos)
        if "swap_percent" in vendor_oids:
            swap_pct = await self.snmp_client.get(
                ip, port, credential, vendor_oids["swap_percent"]
            )
            if swap_pct is not None:
                try:
                    result["swap_utilization"] = float(swap_pct)
                except (ValueError, TypeError):
                    pass

            if "swap_capacity" in vendor_oids:
                swap_cap = await self.snmp_client.get(
                    ip, port, credential, vendor_oids["swap_capacity"]
                )
                if swap_cap is not None:
                    try:
                        result["swap_total"] = int(swap_cap) * 1024 * 1024
                    except (ValueError, TypeError):
                        pass

        return result if result else None

    async def _get_interface_metrics(
        self,
        ip: str,
        port: int,
        credential: SNMPv3Credential,
        device_id: str,
    ) -> list[dict[str, Any]]:
        """Get interface bandwidth and error metrics using IF-MIB."""
        interfaces = []

        try:
            # Walk ifDescr to get interface list
            if_descr_results = await self.snmp_client.walk(
                ip, port, credential, OID_IF_DESCR, max_rows=200
            )

            if not if_descr_results:
                return interfaces

            # Extract interface indices from the OIDs
            for oid_str, descr_value in if_descr_results.items():
                # OID format: 1.3.6.1.2.1.2.2.1.2.<if_index>
                parts = oid_str.split(".")
                if_index = int(parts[-1])

                interface = {
                    "if_index": if_index,
                    "name": str(descr_value) if descr_value else f"Interface {if_index}",
                }

                # Get additional metrics for this interface
                # Operational status
                oper_status = await self.snmp_client.get(
                    ip, port, credential, f"{OID_IF_OPER_STATUS}.{if_index}"
                )
                if oper_status is not None:
                    try:
                        interface["oper_status"] = int(oper_status)
                    except (ValueError, TypeError):
                        pass

                # Admin status
                admin_status = await self.snmp_client.get(
                    ip, port, credential, f"{OID_IF_ADMIN_STATUS}.{if_index}"
                )
                if admin_status is not None:
                    try:
                        interface["admin_status"] = int(admin_status)
                    except (ValueError, TypeError):
                        pass

                # Try 64-bit counters first (ifHC*), fall back to 32-bit
                in_octets = await self.snmp_client.get(
                    ip, port, credential, f"{OID_IF_HC_IN_OCTETS}.{if_index}"
                )
                if in_octets is None:
                    in_octets = await self.snmp_client.get(
                        ip, port, credential, f"{OID_IF_IN_OCTETS}.{if_index}"
                    )
                if in_octets is not None:
                    try:
                        interface["in_octets"] = int(in_octets)
                    except (ValueError, TypeError):
                        pass

                out_octets = await self.snmp_client.get(
                    ip, port, credential, f"{OID_IF_HC_OUT_OCTETS}.{if_index}"
                )
                if out_octets is None:
                    out_octets = await self.snmp_client.get(
                        ip, port, credential, f"{OID_IF_OUT_OCTETS}.{if_index}"
                    )
                if out_octets is not None:
                    try:
                        interface["out_octets"] = int(out_octets)
                    except (ValueError, TypeError):
                        pass

                # Error counters
                in_errors = await self.snmp_client.get(
                    ip, port, credential, f"{OID_IF_IN_ERRORS}.{if_index}"
                )
                if in_errors is not None:
                    try:
                        interface["in_errors"] = int(in_errors)
                    except (ValueError, TypeError):
                        pass

                out_errors = await self.snmp_client.get(
                    ip, port, credential, f"{OID_IF_OUT_ERRORS}.{if_index}"
                )
                if out_errors is not None:
                    try:
                        interface["out_errors"] = int(out_errors)
                    except (ValueError, TypeError):
                        pass

                # Discard counters
                in_discards = await self.snmp_client.get(
                    ip, port, credential, f"{OID_IF_IN_DISCARDS}.{if_index}"
                )
                if in_discards is not None:
                    try:
                        interface["in_discards"] = int(in_discards)
                    except (ValueError, TypeError):
                        pass

                out_discards = await self.snmp_client.get(
                    ip, port, credential, f"{OID_IF_OUT_DISCARDS}.{if_index}"
                )
                if out_discards is not None:
                    try:
                        interface["out_discards"] = int(out_discards)
                    except (ValueError, TypeError):
                        pass

                # Interface speed (try ifHighSpeed first - in Mbps)
                speed = await self.snmp_client.get(
                    ip, port, credential, f"{OID_IF_HIGH_SPEED}.{if_index}"
                )
                if speed is not None:
                    try:
                        interface["speed_mbps"] = int(speed)
                    except (ValueError, TypeError):
                        pass
                else:
                    # Fall back to ifSpeed (in bps)
                    speed = await self.snmp_client.get(
                        ip, port, credential, f"{OID_IF_SPEED}.{if_index}"
                    )
                    if speed is not None:
                        try:
                            interface["speed_mbps"] = int(speed) // 1_000_000
                        except (ValueError, TypeError):
                            pass

                interfaces.append(interface)

        except Exception as e:
            logger.error("interface_metrics_error", ip=ip, error=str(e))

        return interfaces

    async def _get_sophos_service_status(
        self,
        ip: str,
        port: int,
        credential: SNMPv3Credential,
    ) -> dict[str, bool]:
        """Get Sophos firewall service status."""
        services = {}

        for service_name, oid in SOPHOS_SERVICE_OIDS.items():
            result = await self.snmp_client.get(ip, port, credential, oid)
            if result is not None:
                try:
                    # Sophos may return integer (1=running, 0=stopped) or string
                    result_str = str(result).lower().strip()
                    if result_str in ("1", "running", "active", "enabled", "up"):
                        services[service_name] = True
                    elif result_str in ("0", "stopped", "inactive", "disabled", "down"):
                        services[service_name] = False
                    else:
                        # Try integer conversion
                        status_val = int(result)
                        services[service_name] = status_val == 1
                except (ValueError, TypeError):
                    # Log unexpected values for debugging
                    logger.debug("service_status_parse_error", service=service_name, value=str(result))

        return services

    async def _store_interface_metrics(
        self,
        device_id: str,
        interfaces: list[dict[str, Any]],
        collected_at: datetime,
    ) -> None:
        """Store interface metrics in the database."""
        if not interfaces:
            return

        async with get_db() as conn:
            for iface in interfaces:
                # First, ensure the interface exists in npm.interfaces
                await conn.execute(
                    """
                    INSERT INTO npm.interfaces (device_id, if_index, name, speed_mbps, admin_status, oper_status)
                    VALUES ($1, $2, $3, $4, $5, $6)
                    ON CONFLICT (device_id, if_index) DO UPDATE SET
                        name = EXCLUDED.name,
                        speed_mbps = EXCLUDED.speed_mbps,
                        admin_status = EXCLUDED.admin_status,
                        oper_status = EXCLUDED.oper_status,
                        updated_at = NOW()
                    """,
                    device_id,
                    iface.get("if_index"),
                    iface.get("name"),
                    iface.get("speed_mbps"),
                    "up" if iface.get("admin_status") == 1 else "down" if iface.get("admin_status") == 2 else "unknown",
                    "up" if iface.get("oper_status") == 1 else "down" if iface.get("oper_status") == 2 else "unknown",
                )

                # Get interface_id
                interface_row = await conn.fetchrow(
                    """
                    SELECT id FROM npm.interfaces WHERE device_id = $1 AND if_index = $2
                    """,
                    device_id,
                    iface.get("if_index"),
                )

                if interface_row:
                    interface_id = str(interface_row["id"])

                    # Store interface metrics
                    await conn.execute(
                        """
                        INSERT INTO npm.interface_metrics (
                            interface_id, device_id, collected_at,
                            in_octets, out_octets, in_errors, out_errors,
                            in_discards, out_discards, admin_status, oper_status
                        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
                        """,
                        interface_id,
                        device_id,
                        collected_at,
                        iface.get("in_octets"),
                        iface.get("out_octets"),
                        iface.get("in_errors"),
                        iface.get("out_errors"),
                        iface.get("in_discards"),
                        iface.get("out_discards"),
                        "up" if iface.get("admin_status") == 1 else "down" if iface.get("admin_status") == 2 else "unknown",
                        "up" if iface.get("oper_status") == 1 else "down" if iface.get("oper_status") == 2 else "unknown",
                    )

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
        elif "sophos" in vendor or "sfos" in vendor:
            return "sophos"
        else:
            return "generic"

    async def _store_metrics(self, device_id: str, metrics: DeviceMetrics) -> None:
        """Store collected metrics in the database."""
        import json

        async with get_db() as conn:
            await conn.execute(
                """
                INSERT INTO npm.device_metrics (
                    device_id, collected_at,
                    icmp_latency_ms, icmp_packet_loss_percent, icmp_reachable,
                    cpu_utilization_percent, memory_utilization_percent,
                    memory_total_bytes, memory_used_bytes, uptime_seconds,
                    disk_utilization_percent, disk_total_bytes, disk_used_bytes,
                    swap_utilization_percent, swap_total_bytes,
                    total_interfaces, interfaces_up, interfaces_down,
                    total_in_octets, total_out_octets, total_in_errors, total_out_errors,
                    services_status, is_available
                ) VALUES (
                    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
                    $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24
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
                metrics.disk_utilization,
                metrics.disk_total_bytes,
                metrics.disk_used_bytes,
                metrics.swap_utilization,
                metrics.swap_total_bytes,
                metrics.interface_count,
                metrics.interface_up_count,
                metrics.interface_down_count,
                metrics.total_in_octets,
                metrics.total_out_octets,
                metrics.total_in_errors,
                metrics.total_out_errors,
                json.dumps(metrics.services_status) if metrics.services_status else None,
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
