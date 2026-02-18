"""
NPM Network Discovery Collector

Scans networks to discover devices using ICMP ping and SNMPv3 queries.
"""

import asyncio
import ipaddress
import struct
import socket
import time
from dataclasses import dataclass
from typing import Optional
from datetime import datetime
import asyncpg
from pysnmp.hlapi.v3arch.asyncio import (
    SnmpEngine,
    CommunityData,
    UsmUserData,
    UdpTransportTarget,
    ContextData,
    ObjectType,
    ObjectIdentity,
    getCmd,
    usmHMACSHAAuthProtocol,
    usmHMAC128SHA224AuthProtocol,
    usmHMAC192SHA256AuthProtocol,
    usmHMAC256SHA384AuthProtocol,
    usmHMAC384SHA512AuthProtocol,
    usmAesCfb128Protocol,
    usmAesCfb192Protocol,
    usmAesCfb256Protocol,
    usmNoPrivProtocol,
    usmNoAuthProtocol,
)
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
import base64
import os

from ..core.config import settings
from ..core.logging import get_logger

logger = get_logger(__name__)

# SNMP OIDs for device information
SNMP_OIDS = {
    "sysDescr": "1.3.6.1.2.1.1.1.0",
    "sysObjectID": "1.3.6.1.2.1.1.2.0",
    "sysUpTime": "1.3.6.1.2.1.1.3.0",
    "sysContact": "1.3.6.1.2.1.1.4.0",
    "sysName": "1.3.6.1.2.1.1.5.0",
    "sysLocation": "1.3.6.1.2.1.1.6.0",
    "ifNumber": "1.3.6.1.2.1.2.1.0",  # Number of interfaces
}

# Auth protocol mapping
AUTH_PROTOCOLS = {
    "sha": usmHMACSHAAuthProtocol,
    "sha-224": usmHMAC128SHA224AuthProtocol,
    "sha-256": usmHMAC192SHA256AuthProtocol,
    "sha-384": usmHMAC256SHA384AuthProtocol,
    "sha-512": usmHMAC384SHA512AuthProtocol,
    "none": usmNoAuthProtocol,
}

# Privacy protocol mapping
PRIV_PROTOCOLS = {
    "aes-128": usmAesCfb128Protocol,
    "aes-192": usmAesCfb192Protocol,
    "aes-256": usmAesCfb256Protocol,
    "none": usmNoPrivProtocol,
}


@dataclass
class DiscoveredHost:
    """Represents a discovered host."""
    ip_address: str
    hostname: Optional[str] = None
    mac_address: Optional[str] = None
    vendor: Optional[str] = None
    model: Optional[str] = None
    device_type: Optional[str] = None
    os_family: Optional[str] = None
    sys_name: Optional[str] = None
    sys_description: Optional[str] = None
    sys_contact: Optional[str] = None
    sys_location: Optional[str] = None
    icmp_reachable: bool = False
    icmp_latency_ms: Optional[float] = None
    icmp_ttl: Optional[int] = None
    snmp_reachable: bool = False
    snmp_engine_id: Optional[str] = None
    interfaces_count: int = 0
    uptime_seconds: Optional[int] = None
    open_ports: Optional[str] = None
    fingerprint_confidence: str = "low"


@dataclass
class SNMPv3Credential:
    """SNMPv3 credential data."""
    username: str
    security_level: str
    auth_protocol: Optional[str]
    auth_password: Optional[str]
    priv_protocol: Optional[str]
    priv_password: Optional[str]


def decrypt_password(encrypted_data: str, encryption_key: bytes) -> str:
    """Decrypt an AES-GCM encrypted password."""
    try:
        data = base64.b64decode(encrypted_data)
        nonce = data[:12]
        ciphertext = data[12:]
        aesgcm = AESGCM(encryption_key)
        plaintext = aesgcm.decrypt(nonce, ciphertext, None)
        return plaintext.decode("utf-8")
    except Exception as e:
        logger.error("password_decryption_failed", error=str(e))
        return ""


class ICMPPinger:
    """ICMP ping implementation using raw sockets."""

    ICMP_ECHO_REQUEST = 8

    def __init__(self, timeout: float = 2.0):
        self.timeout = timeout
        self.sequence = 0

    def _checksum(self, data: bytes) -> int:
        """Calculate ICMP checksum."""
        if len(data) % 2:
            data += b'\x00'
        total = 0
        for i in range(0, len(data), 2):
            total += (data[i] << 8) + data[i + 1]
        total = (total >> 16) + (total & 0xffff)
        total += total >> 16
        return ~total & 0xffff

    def _create_packet(self) -> bytes:
        """Create ICMP echo request packet."""
        self.sequence = (self.sequence + 1) & 0xffff
        header = struct.pack('!BBHHH', self.ICMP_ECHO_REQUEST, 0, 0, os.getpid() & 0xffff, self.sequence)
        data = b'GridWatch' * 4
        checksum = self._checksum(header + data)
        header = struct.pack('!BBHHH', self.ICMP_ECHO_REQUEST, 0, checksum, os.getpid() & 0xffff, self.sequence)
        return header + data

    async def ping(self, ip: str) -> tuple[bool, Optional[float], Optional[int]]:
        """Ping a host and return (reachable, latency_ms, ttl)."""
        try:
            # Use subprocess for ping since raw sockets require root
            proc = await asyncio.create_subprocess_exec(
                'ping', '-c', '1', '-W', str(int(self.timeout)), ip,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            start = time.time()
            stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=self.timeout + 1)
            elapsed = (time.time() - start) * 1000

            if proc.returncode == 0:
                # Parse actual RTT and TTL from output if available
                output = stdout.decode()
                import re
                ttl = None
                if 'time=' in output:
                    match = re.search(r'time=(\d+\.?\d*)', output)
                    if match:
                        elapsed = float(match.group(1))
                # Extract TTL value (varies by OS output format)
                ttl_match = re.search(r'ttl=(\d+)', output, re.IGNORECASE)
                if ttl_match:
                    ttl = int(ttl_match.group(1))
                return True, round(elapsed, 3), ttl
            return False, None, None
        except asyncio.TimeoutError:
            return False, None, None
        except Exception as e:
            logger.debug("ping_error", ip=ip, error=str(e))
            return False, None, None


class SNMPv3Scanner:
    """SNMPv3 scanner for device discovery."""

    def __init__(self, credential: SNMPv3Credential, timeout: float = 5.0, retries: int = 2):
        self.credential = credential
        self.timeout = timeout
        self.retries = retries
        self.engine = SnmpEngine()

    def _get_user_data(self) -> UsmUserData:
        """Create USM user data from credential."""
        auth_proto = AUTH_PROTOCOLS.get(
            self.credential.auth_protocol.lower() if self.credential.auth_protocol else "none",
            usmNoAuthProtocol
        )
        priv_proto = PRIV_PROTOCOLS.get(
            self.credential.priv_protocol.lower() if self.credential.priv_protocol else "none",
            usmNoPrivProtocol
        )

        if self.credential.security_level == "noAuthNoPriv":
            return UsmUserData(self.credential.username)
        elif self.credential.security_level == "authNoPriv":
            return UsmUserData(
                self.credential.username,
                authKey=self.credential.auth_password,
                authProtocol=auth_proto
            )
        else:  # authPriv
            return UsmUserData(
                self.credential.username,
                authKey=self.credential.auth_password,
                authProtocol=auth_proto,
                privKey=self.credential.priv_password,
                privProtocol=priv_proto
            )

    async def get_system_info(self, ip: str, port: int = 161) -> Optional[dict]:
        """Get system information via SNMPv3."""
        try:
            user_data = self._get_user_data()
            target = await UdpTransportTarget.create((ip, port), timeout=self.timeout, retries=self.retries)

            results = {}
            for name, oid in SNMP_OIDS.items():
                error_indication, error_status, error_index, var_binds = await getCmd(
                    self.engine,
                    user_data,
                    target,
                    ContextData(),
                    ObjectType(ObjectIdentity(oid))
                )

                if error_indication or error_status:
                    continue

                for var_bind in var_binds:
                    value = var_bind[1].prettyPrint()
                    results[name] = value

            if results:
                return results
            return None

        except Exception as e:
            logger.debug("snmp_scan_error", ip=ip, error=str(e))
            return None


# OUI (MAC Address) vendor prefixes - common network equipment vendors
# Source: https://standards-oui.ieee.org/
OUI_VENDORS = {
    # Cisco
    "00:00:0C": "Cisco", "00:01:42": "Cisco", "00:01:43": "Cisco", "00:01:63": "Cisco",
    "00:01:64": "Cisco", "00:02:16": "Cisco", "00:02:17": "Cisco", "00:05:31": "Cisco",
    "00:05:9B": "Cisco", "00:07:0D": "Cisco", "00:0A:8A": "Cisco", "00:0B:BE": "Cisco",
    "00:0C:85": "Cisco", "00:0D:28": "Cisco", "00:0E:38": "Cisco", "00:0F:23": "Cisco",
    "00:10:07": "Cisco", "00:10:11": "Cisco", "00:14:69": "Cisco", "00:16:C7": "Cisco",
    "00:17:94": "Cisco", "00:18:0A": "Cisco", "00:19:2F": "Cisco", "00:1A:2F": "Cisco",
    "00:1A:6C": "Cisco", "00:1B:0C": "Cisco", "00:1B:53": "Cisco", "00:1C:0F": "Cisco",
    "00:1D:45": "Cisco", "00:1E:13": "Cisco", "00:1E:4A": "Cisco", "00:1F:26": "Cisco",
    "00:21:1B": "Cisco", "00:22:0D": "Cisco", "00:22:55": "Cisco", "00:23:04": "Cisco",
    "00:23:33": "Cisco", "00:24:13": "Cisco", "00:24:50": "Cisco", "00:24:97": "Cisco",
    "00:25:2E": "Cisco", "00:25:45": "Cisco", "00:25:B4": "Cisco", "00:26:0A": "Cisco",
    "00:26:51": "Cisco", "00:26:99": "Cisco", "00:26:CB": "Cisco", "00:27:0D": "Cisco",
    # Juniper
    "00:05:85": "Juniper", "00:10:DB": "Juniper", "00:12:1E": "Juniper", "00:14:F6": "Juniper",
    "00:17:CB": "Juniper", "00:19:E2": "Juniper", "00:1B:C0": "Juniper", "00:1D:B5": "Juniper",
    "00:1F:12": "Juniper", "00:21:59": "Juniper", "00:22:83": "Juniper", "00:23:9C": "Juniper",
    "00:24:DC": "Juniper", "00:26:88": "Juniper", "2C:21:31": "Juniper", "2C:21:72": "Juniper",
    "2C:6B:F5": "Juniper", "30:7C:5E": "Juniper", "38:4F:49": "Juniper", "40:A6:77": "Juniper",
    # Arista
    "00:1C:73": "Arista", "28:99:3A": "Arista", "44:4C:A8": "Arista", "74:83:EF": "Arista",
    # Palo Alto
    "00:1B:17": "Palo Alto", "00:90:0B": "Palo Alto", "08:30:6B": "Palo Alto",
    # Fortinet
    "00:09:0F": "Fortinet", "08:5B:0E": "Fortinet", "70:4C:A5": "Fortinet", "90:6C:AC": "Fortinet",
    # HPE/Aruba
    "00:0B:86": "HPE", "00:11:0A": "HPE", "00:1C:2E": "Aruba", "00:24:6C": "Aruba",
    "04:DA:D2": "Aruba", "20:4C:03": "Aruba", "24:DE:C6": "Aruba", "40:E3:D6": "Aruba",
    "6C:F3:7F": "Aruba", "70:3A:0E": "Aruba", "84:D4:7E": "Aruba", "94:B4:0F": "Aruba",
    "9C:8C:D8": "Aruba", "AC:A3:1E": "Aruba", "D8:C7:C8": "Aruba",
    # Dell
    "00:06:5B": "Dell", "00:08:74": "Dell", "00:0B:DB": "Dell", "00:0D:56": "Dell",
    "00:0F:1F": "Dell", "00:11:43": "Dell", "00:12:3F": "Dell", "00:13:72": "Dell",
    "00:14:22": "Dell", "00:15:C5": "Dell", "00:18:8B": "Dell", "00:19:B9": "Dell",
    "00:1A:A0": "Dell", "00:1C:23": "Dell", "00:1D:09": "Dell", "00:1E:4F": "Dell",
    # VMware
    "00:0C:29": "VMware", "00:50:56": "VMware", "00:05:69": "VMware",
    # Microsoft (Hyper-V)
    "00:15:5D": "Microsoft", "00:1D:D8": "Microsoft",
    # Linux (KVM/QEMU)
    "52:54:00": "QEMU/KVM", "FA:16:3E": "OpenStack",
    # Ubiquiti
    "00:27:22": "Ubiquiti", "04:18:D6": "Ubiquiti", "18:E8:29": "Ubiquiti",
    "24:A4:3C": "Ubiquiti", "44:D9:E7": "Ubiquiti", "68:72:51": "Ubiquiti",
    "74:83:C2": "Ubiquiti", "78:8A:20": "Ubiquiti", "80:2A:A8": "Ubiquiti",
    "B4:FB:E4": "Ubiquiti", "D0:21:F9": "Ubiquiti", "DC:9F:DB": "Ubiquiti",
    "E0:63:DA": "Ubiquiti", "F0:9F:C2": "Ubiquiti", "FC:EC:DA": "Ubiquiti",
    # MikroTik
    "00:0C:42": "MikroTik", "48:8F:5A": "MikroTik", "4C:5E:0C": "MikroTik",
    "6C:3B:6B": "MikroTik", "B8:69:F4": "MikroTik", "CC:2D:E0": "MikroTik",
    "D4:01:C3": "MikroTik", "E4:8D:8C": "MikroTik",
    # Mellanox
    "00:02:C9": "Mellanox", "24:8A:07": "Mellanox", "50:6B:4B": "Mellanox",
    "7C:FE:90": "Mellanox", "98:03:9B": "Mellanox", "B8:59:9F": "Mellanox",
    # pfSense/Netgate
    "00:08:A2": "Netgate",
}


def get_vendor_from_mac(mac_address: Optional[str]) -> Optional[str]:
    """Get vendor from MAC address OUI."""
    if not mac_address:
        return None
    # Normalize MAC address
    mac = mac_address.upper().replace("-", ":").replace(".", ":")
    # Get first 3 octets (OUI)
    parts = mac.split(":")
    if len(parts) >= 3:
        oui = ":".join(parts[:3])
        return OUI_VENDORS.get(oui)
    return None


def detect_os_from_ttl(ttl: Optional[int]) -> Optional[str]:
    """Detect OS family from ICMP TTL value."""
    if ttl is None:
        return None
    # Common TTL values by OS:
    # Linux/Unix: 64
    # Windows: 128
    # Cisco/Network: 255
    # Solaris: 255
    if ttl <= 64:
        return "Linux/Unix"
    elif ttl <= 128:
        return "Windows"
    elif ttl <= 255:
        return "Network Device"
    return None


def detect_device_type(sys_descr: Optional[str], sys_oid: Optional[str]) -> tuple[Optional[str], Optional[str], Optional[str]]:
    """Detect device type, vendor, and model from SNMP system info."""
    if not sys_descr:
        return None, None, None

    sys_descr_lower = sys_descr.lower()
    vendor = None
    device_type = None
    model = None
    import re

    # Cisco detection
    if "cisco" in sys_descr_lower:
        vendor = "Cisco"
        if "ios-xe" in sys_descr_lower or "ios xe" in sys_descr_lower:
            device_type = "Router/Switch"
        elif "ios" in sys_descr_lower:
            device_type = "Router/Switch"
        elif "nx-os" in sys_descr_lower:
            device_type = "Switch"
        elif "asa" in sys_descr_lower:
            device_type = "Firewall"
        elif "firepower" in sys_descr_lower:
            device_type = "Firewall"
        elif "ucs" in sys_descr_lower:
            device_type = "Server"
        elif "wireless" in sys_descr_lower or "wlc" in sys_descr_lower:
            device_type = "Wireless Controller"
        # Try to extract model
        match = re.search(r'(?:catalyst\s*)?(\d{4}[A-Z]*)', sys_descr, re.IGNORECASE)
        if match:
            model = f"Catalyst {match.group(1)}" if "catalyst" in sys_descr_lower else match.group(1)
        # Nexus model
        match = re.search(r'[Nn]exus\s*(\d+[A-Z]*)', sys_descr)
        if match:
            model = f"Nexus {match.group(1)}"

    # Juniper detection
    elif "juniper" in sys_descr_lower or "junos" in sys_descr_lower:
        vendor = "Juniper"
        if "srx" in sys_descr_lower:
            device_type = "Firewall"
            match = re.search(r'SRX(\d+)', sys_descr, re.IGNORECASE)
            if match:
                model = f"SRX{match.group(1)}"
        elif "ex" in sys_descr_lower:
            device_type = "Switch"
            match = re.search(r'EX(\d+)', sys_descr, re.IGNORECASE)
            if match:
                model = f"EX{match.group(1)}"
        elif "mx" in sys_descr_lower:
            device_type = "Router"
            match = re.search(r'MX(\d+)', sys_descr, re.IGNORECASE)
            if match:
                model = f"MX{match.group(1)}"
        elif "qfx" in sys_descr_lower:
            device_type = "Switch"
            match = re.search(r'QFX(\d+)', sys_descr, re.IGNORECASE)
            if match:
                model = f"QFX{match.group(1)}"

    # Palo Alto detection
    elif "paloalto" in sys_descr_lower or "pan-os" in sys_descr_lower:
        vendor = "Palo Alto"
        device_type = "Firewall"
        match = re.search(r'PA-(\d+)', sys_descr, re.IGNORECASE)
        if match:
            model = f"PA-{match.group(1)}"

    # Fortinet detection
    elif "fortinet" in sys_descr_lower or "fortigate" in sys_descr_lower or "fortios" in sys_descr_lower:
        vendor = "Fortinet"
        if "fortiswitch" in sys_descr_lower:
            device_type = "Switch"
        elif "fortiap" in sys_descr_lower:
            device_type = "Access Point"
        else:
            device_type = "Firewall"
        match = re.search(r'FortiGate-(\d+\w*)', sys_descr, re.IGNORECASE)
        if match:
            model = f"FortiGate-{match.group(1)}"

    # Arista detection
    elif "arista" in sys_descr_lower:
        vendor = "Arista"
        device_type = "Switch"
        match = re.search(r'DCS-(\d+[A-Z]*)', sys_descr, re.IGNORECASE)
        if match:
            model = f"DCS-{match.group(1)}"

    # HPE/Aruba detection
    elif "aruba" in sys_descr_lower or "procurve" in sys_descr_lower or "hpe" in sys_descr_lower:
        vendor = "HPE/Aruba"
        if "wireless" in sys_descr_lower or "mobility" in sys_descr_lower:
            device_type = "Wireless Controller"
        elif "instant" in sys_descr_lower:
            device_type = "Access Point"
        else:
            device_type = "Switch"

    # Ubiquiti detection
    elif "ubiquiti" in sys_descr_lower or "edgeswitch" in sys_descr_lower or "edgerouter" in sys_descr_lower or "unifi" in sys_descr_lower:
        vendor = "Ubiquiti"
        if "edgerouter" in sys_descr_lower:
            device_type = "Router"
        elif "edgeswitch" in sys_descr_lower or "us-" in sys_descr_lower:
            device_type = "Switch"
        elif "unifi" in sys_descr_lower:
            if "ap" in sys_descr_lower or "uap" in sys_descr_lower:
                device_type = "Access Point"
            else:
                device_type = "Switch"
        else:
            device_type = "Network Device"

    # MikroTik detection
    elif "mikrotik" in sys_descr_lower or "routeros" in sys_descr_lower:
        vendor = "MikroTik"
        device_type = "Router"

    # pfSense detection
    elif "pfsense" in sys_descr_lower:
        vendor = "pfSense"
        device_type = "Firewall"

    # Dell/EMC detection
    elif "dell" in sys_descr_lower or "force10" in sys_descr_lower or "powerconnect" in sys_descr_lower:
        vendor = "Dell"
        if "powerconnect" in sys_descr_lower:
            device_type = "Switch"
        elif "force10" in sys_descr_lower:
            device_type = "Switch"
        elif "server" in sys_descr_lower or "poweredge" in sys_descr_lower:
            device_type = "Server"
        else:
            device_type = "Switch"

    # Mellanox/NVIDIA detection
    elif "mellanox" in sys_descr_lower or "nvidia" in sys_descr_lower:
        vendor = "Mellanox/NVIDIA"
        device_type = "Switch"

    # VMware detection
    elif "vmware" in sys_descr_lower:
        vendor = "VMware"
        if "esxi" in sys_descr_lower:
            device_type = "Hypervisor"
        else:
            device_type = "Virtual Machine"

    # Linux detection
    elif "linux" in sys_descr_lower:
        vendor = "Linux"
        if "ubuntu" in sys_descr_lower:
            vendor = "Ubuntu"
        elif "centos" in sys_descr_lower:
            vendor = "CentOS"
        elif "debian" in sys_descr_lower:
            vendor = "Debian"
        elif "red hat" in sys_descr_lower or "rhel" in sys_descr_lower:
            vendor = "Red Hat"
        device_type = "Server"

    # FreeBSD detection
    elif "freebsd" in sys_descr_lower:
        vendor = "FreeBSD"
        device_type = "Server"

    # Windows detection
    elif "windows" in sys_descr_lower or "microsoft" in sys_descr_lower:
        vendor = "Microsoft"
        if "server" in sys_descr_lower:
            device_type = "Server"
        else:
            device_type = "Workstation"

    # Brocade/Ruckus detection
    elif "brocade" in sys_descr_lower or "ruckus" in sys_descr_lower:
        vendor = "Brocade/Ruckus"
        if "wireless" in sys_descr_lower:
            device_type = "Access Point"
        else:
            device_type = "Switch"

    # F5 detection
    elif "f5" in sys_descr_lower or "big-ip" in sys_descr_lower:
        vendor = "F5"
        device_type = "Load Balancer"

    # Generic network device detection
    elif any(x in sys_descr_lower for x in ["switch", "router", "firewall", "gateway", "access point", "load balancer"]):
        if "switch" in sys_descr_lower:
            device_type = "Switch"
        elif "router" in sys_descr_lower:
            device_type = "Router"
        elif "firewall" in sys_descr_lower:
            device_type = "Firewall"
        elif "gateway" in sys_descr_lower:
            device_type = "Gateway"
        elif "access point" in sys_descr_lower:
            device_type = "Access Point"
        elif "load balancer" in sys_descr_lower:
            device_type = "Load Balancer"

    return device_type, vendor, model


class DiscoveryCollector:
    """Discovery collector that processes discovery jobs."""

    def __init__(self, db_pool: asyncpg.Pool, encryption_key: bytes):
        self.db_pool = db_pool
        self.encryption_key = encryption_key
        self.pinger = ICMPPinger(timeout=2.0)
        self.running = False
        self._shutdown_event = asyncio.Event()

    async def start(self) -> None:
        """Start the discovery collector."""
        self.running = True
        logger.info("discovery_collector_started")

        while self.running:
            try:
                # Check for pending jobs
                job = await self._get_pending_job()
                if job:
                    await self._process_job(job)
                else:
                    # Wait before checking again
                    try:
                        await asyncio.wait_for(self._shutdown_event.wait(), timeout=5.0)
                    except asyncio.TimeoutError:
                        pass
            except Exception as e:
                logger.error("discovery_collector_error", error=str(e))
                await asyncio.sleep(5.0)

        logger.info("discovery_collector_stopped")

    async def stop(self) -> None:
        """Stop the discovery collector."""
        self.running = False
        self._shutdown_event.set()

    async def _get_pending_job(self) -> Optional[dict]:
        """Get the next pending discovery job."""
        async with self.db_pool.acquire() as conn:
            row = await conn.fetchrow("""
                UPDATE npm.discovery_jobs
                SET status = 'running', started_at = NOW()
                WHERE id = (
                    SELECT id FROM npm.discovery_jobs
                    WHERE status = 'pending'
                    ORDER BY created_at
                    LIMIT 1
                    FOR UPDATE SKIP LOCKED
                )
                RETURNING id, name, cidr, discovery_method, snmpv3_credential_id
            """)
            if row:
                return dict(row)
            return None

    async def _get_snmpv3_credential(self, credential_id: str) -> Optional[SNMPv3Credential]:
        """Get SNMPv3 credential by ID."""
        async with self.db_pool.acquire() as conn:
            row = await conn.fetchrow("""
                SELECT username, security_level, auth_protocol, auth_password_encrypted,
                       priv_protocol, priv_password_encrypted
                FROM npm.snmpv3_credentials WHERE id = $1
            """, credential_id)

            if not row:
                return None

            auth_password = None
            priv_password = None

            if row["auth_password_encrypted"]:
                auth_password = decrypt_password(row["auth_password_encrypted"], self.encryption_key)
            if row["priv_password_encrypted"]:
                priv_password = decrypt_password(row["priv_password_encrypted"], self.encryption_key)

            return SNMPv3Credential(
                username=row["username"],
                security_level=row["security_level"],
                auth_protocol=row["auth_protocol"],
                auth_password=auth_password,
                priv_protocol=row["priv_protocol"],
                priv_password=priv_password,
            )

    async def _process_job(self, job: dict) -> None:
        """Process a discovery job."""
        job_id = job["id"]
        logger.info("processing_discovery_job", job_id=job_id, cidr=job["cidr"])

        try:
            # Parse network
            network = ipaddress.ip_network(job["cidr"], strict=False)
            hosts = list(network.hosts())
            total_hosts = len(hosts)

            # Get SNMPv3 credential if needed
            snmp_credential = None
            if job["discovery_method"] in ("snmpv3", "both") and job["snmpv3_credential_id"]:
                snmp_credential = await self._get_snmpv3_credential(job["snmpv3_credential_id"])

            snmp_scanner = None
            if snmp_credential:
                snmp_scanner = SNMPv3Scanner(snmp_credential)

            # Process hosts in batches
            batch_size = 50
            discovered_count = 0

            for i in range(0, total_hosts, batch_size):
                if not self.running:
                    # Job cancelled
                    await self._update_job_status(job_id, "cancelled")
                    return

                batch = hosts[i:i + batch_size]
                tasks = []

                for host in batch:
                    ip = str(host)
                    tasks.append(self._scan_host(
                        ip,
                        job["discovery_method"],
                        snmp_scanner,
                    ))

                results = await asyncio.gather(*tasks, return_exceptions=True)

                # Save discovered hosts
                for result in results:
                    if isinstance(result, Exception):
                        continue
                    if result and (result.icmp_reachable or result.snmp_reachable):
                        await self._save_discovered_host(job_id, result)
                        discovered_count += 1

                # Update progress
                progress = int((i + len(batch)) / total_hosts * 100)
                await self._update_job_progress(job_id, progress, discovered_count)

            # Mark job as completed
            await self._update_job_status(job_id, "completed", discovered_count)
            logger.info("discovery_job_completed", job_id=job_id, discovered=discovered_count)

        except Exception as e:
            logger.error("discovery_job_failed", job_id=job_id, error=str(e))
            await self._update_job_status(job_id, "failed", error_message=str(e))

    async def _scan_host(
        self,
        ip: str,
        method: str,
        snmp_scanner: Optional[SNMPv3Scanner],
    ) -> Optional[DiscoveredHost]:
        """Scan a single host."""
        host = DiscoveredHost(ip_address=ip)
        confidence_score = 0  # Track confidence based on data sources

        # ICMP ping
        if method in ("icmp", "both"):
            reachable, latency, ttl = await self.pinger.ping(ip)
            host.icmp_reachable = reachable
            host.icmp_latency_ms = latency
            host.icmp_ttl = ttl

            # Detect OS from TTL
            if ttl:
                host.os_family = detect_os_from_ttl(ttl)
                confidence_score += 1  # TTL-based detection adds some confidence

        # SNMPv3 query
        if method in ("snmpv3", "both") and snmp_scanner:
            system_info = await snmp_scanner.get_system_info(ip)
            if system_info:
                host.snmp_reachable = True
                host.sys_name = system_info.get("sysName")
                host.sys_description = system_info.get("sysDescr")
                host.sys_contact = system_info.get("sysContact")
                host.sys_location = system_info.get("sysLocation")
                confidence_score += 2  # SNMP response adds significant confidence

                if system_info.get("ifNumber"):
                    try:
                        host.interfaces_count = int(system_info["ifNumber"])
                    except ValueError:
                        pass

                if system_info.get("sysUpTime"):
                    try:
                        # sysUpTime is in hundredths of seconds
                        host.uptime_seconds = int(system_info["sysUpTime"]) // 100
                    except ValueError:
                        pass

                # Detect device type from SNMP data
                device_type, vendor, model = detect_device_type(
                    host.sys_description,
                    system_info.get("sysObjectID")
                )
                host.device_type = device_type
                host.vendor = vendor
                host.model = model

                if vendor:
                    confidence_score += 2  # Vendor detection adds confidence
                if model:
                    confidence_score += 1  # Model detection adds confidence

        # Try MAC-based vendor detection if we don't have vendor from SNMP
        if not host.vendor and host.mac_address:
            mac_vendor = get_vendor_from_mac(host.mac_address)
            if mac_vendor:
                host.vendor = mac_vendor
                confidence_score += 1  # MAC OUI adds some confidence

        # Calculate fingerprint confidence level
        if confidence_score >= 5:
            host.fingerprint_confidence = "high"
        elif confidence_score >= 2:
            host.fingerprint_confidence = "medium"
        else:
            host.fingerprint_confidence = "low"

        return host

    async def _save_discovered_host(self, job_id: str, host: DiscoveredHost) -> None:
        """Save a discovered host to the database."""
        async with self.db_pool.acquire() as conn:
            await conn.execute("""
                INSERT INTO npm.discovered_hosts (
                    job_id, ip_address, hostname, mac_address, vendor, model,
                    device_type, sys_name, sys_description, sys_contact, sys_location,
                    icmp_reachable, icmp_latency_ms, snmp_reachable, snmp_engine_id,
                    interfaces_count, uptime_seconds, os_family, icmp_ttl, open_ports,
                    fingerprint_confidence
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
            """,
                job_id,
                host.ip_address,
                host.hostname,
                host.mac_address,
                host.vendor,
                host.model,
                host.device_type,
                host.sys_name,
                host.sys_description,
                host.sys_contact,
                host.sys_location,
                host.icmp_reachable,
                host.icmp_latency_ms,
                host.snmp_reachable,
                host.snmp_engine_id,
                host.interfaces_count,
                host.uptime_seconds,
                host.os_family,
                host.icmp_ttl,
                host.open_ports,
                host.fingerprint_confidence,
            )

    async def _update_job_progress(self, job_id: str, progress: int, discovered: int) -> None:
        """Update job progress."""
        async with self.db_pool.acquire() as conn:
            await conn.execute("""
                UPDATE npm.discovery_jobs
                SET progress_percent = $2, discovered_hosts = $3
                WHERE id = $1
            """, job_id, progress, discovered)

    async def _update_job_status(
        self,
        job_id: str,
        status: str,
        discovered_count: int = 0,
        error_message: Optional[str] = None,
    ) -> None:
        """Update job status."""
        async with self.db_pool.acquire() as conn:
            await conn.execute("""
                UPDATE npm.discovery_jobs
                SET status = $2, discovered_hosts = $3, error_message = $4,
                    completed_at = CASE WHEN $2 IN ('completed', 'failed', 'cancelled') THEN NOW() ELSE completed_at END,
                    progress_percent = CASE WHEN $2 = 'completed' THEN 100 ELSE progress_percent END
                WHERE id = $1
            """, job_id, status, discovered_count, error_message)


async def main():
    """Main entry point for discovery collector."""
    import os

    # Get encryption key
    encryption_key_b64 = os.getenv("ENCRYPTION_KEY", "")
    if not encryption_key_b64:
        logger.error("ENCRYPTION_KEY not set")
        return

    encryption_key = base64.b64decode(encryption_key_b64)

    # Create database pool
    db_pool = await asyncpg.create_pool(
        host=settings.POSTGRES_HOST,
        port=settings.POSTGRES_PORT,
        user=settings.POSTGRES_USER,
        password=settings.POSTGRES_PASSWORD,
        database=settings.POSTGRES_DB,
        min_size=2,
        max_size=10,
    )

    collector = DiscoveryCollector(db_pool, encryption_key)

    # Handle shutdown
    loop = asyncio.get_event_loop()

    def shutdown():
        logger.info("shutdown_signal_received")
        asyncio.create_task(collector.stop())

    import signal
    for sig in (signal.SIGTERM, signal.SIGINT):
        loop.add_signal_handler(sig, shutdown)

    try:
        await collector.start()
    finally:
        await db_pool.close()


if __name__ == "__main__":
    asyncio.run(main())
