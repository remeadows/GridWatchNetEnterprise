"""Network scanning service with ICMP ping and NMAP support."""

import asyncio
import socket
import subprocess
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from typing import AsyncIterator
import shutil

from netaddr import IPNetwork

from ..db import get_db, NetworkRepository, AddressRepository, ScanRepository
from ..models.network import Network
from ..models.address import IPAddressCreate, IPStatus, IPAddressDiscovered
from ..models.scan import ScanJob, ScanJobCreate, ScanType, ScanStatus, ScanProgress, ScanResult
from ..core.config import settings
from ..core.logging import get_logger

logger = get_logger(__name__)


# Check for nmap availability
NMAP_AVAILABLE = shutil.which("nmap") is not None


async def icmp_ping(ip: str, count: int = 2, timeout: float = 2.0) -> tuple[str, bool, float | None]:
    """
    Ping a host using system ICMP ping command.
    Returns (ip, is_alive, response_time_ms).
    """
    try:
        import platform
        system = platform.system().lower()

        if system == "windows":
            cmd = ["ping", "-n", str(count), "-w", str(int(timeout * 1000)), ip]
        else:
            cmd = ["ping", "-c", str(count), "-W", str(int(timeout)), ip]

        process = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )

        try:
            stdout, _ = await asyncio.wait_for(
                process.communicate(),
                timeout=timeout * count + 5,
            )
        except asyncio.TimeoutError:
            process.kill()
            return ip, False, None

        output = stdout.decode("utf-8", errors="ignore")

        if process.returncode == 0:
            # Extract average latency
            import re
            # macOS/Linux: rtt min/avg/max/mdev = 0.123/0.456/0.789/0.012 ms
            latency_match = re.search(
                r"(?:rtt|round-trip)\s+min/avg/max.*?=\s*[\d.]+/([\d.]+)/",
                output,
                re.IGNORECASE,
            )
            if not latency_match:
                # Windows: Average = 10ms
                latency_match = re.search(r"Average\s*=\s*(\d+)ms", output, re.IGNORECASE)

            latency = float(latency_match.group(1)) if latency_match else None
            return ip, True, latency

        return ip, False, None

    except Exception as e:
        logger.debug("icmp_ping_error", ip=ip, error=str(e))
        return ip, False, None


async def tcp_ping(ip: str, ports: list[int] | None = None, timeout: float = 1.0) -> tuple[str, bool, float | None, list[int]]:
    """
    TCP connect scan to check host reachability and open ports.
    Returns (ip, is_alive, response_time_ms, open_ports).
    """
    ports = ports or [22, 80, 443, 3389, 445, 23, 21, 25, 53, 8080]
    open_ports = []

    for port in ports:
        try:
            start = asyncio.get_event_loop().time()
            reader, writer = await asyncio.wait_for(
                asyncio.open_connection(ip, port),
                timeout=timeout,
            )
            writer.close()
            await writer.wait_closed()

            elapsed = (asyncio.get_event_loop().time() - start) * 1000
            open_ports.append(port)

            if len(open_ports) == 1:
                # Return after first successful connection with latency
                return ip, True, elapsed, open_ports

        except (asyncio.TimeoutError, OSError, ConnectionRefusedError):
            continue

    return ip, len(open_ports) > 0, None, open_ports


async def resolve_hostname(ip: str) -> str | None:
    """Resolve IP address to hostname via reverse DNS."""
    try:
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(
            None, socket.gethostbyaddr, ip
        )
        return result[0] if result else None
    except (socket.herror, socket.gaierror, OSError):
        return None


async def nmap_scan(
    cidr: str,
    scan_type: str = "ping",
    ports: str | None = None,
    timeout: int = 300,
) -> list[dict]:
    """
    Run nmap scan and parse results.

    Args:
        cidr: Network CIDR to scan (e.g., 192.168.1.0/24)
        scan_type: Type of scan ('ping', 'quick', 'full', 'service')
        ports: Port specification (e.g., '22,80,443' or '1-1000')
        timeout: Maximum scan time in seconds

    Returns:
        List of discovered hosts with their details
    """
    if not NMAP_AVAILABLE:
        raise RuntimeError("nmap is not installed or not in PATH")

    # Build nmap command based on scan type
    cmd = ["nmap", "-oX", "-"]  # Output XML to stdout

    if scan_type == "ping":
        # Fast ping scan only
        cmd.extend(["-sn", "-PE", "-PA80,443"])
    elif scan_type == "quick":
        # Quick TCP scan on common ports
        cmd.extend(["-sT", "-F", "--top-ports", "100"])
    elif scan_type == "service":
        # Service detection on specified or top ports
        cmd.extend(["-sT", "-sV", "--version-intensity", "2"])
        if ports:
            cmd.extend(["-p", ports])
        else:
            cmd.extend(["--top-ports", "100"])
    elif scan_type == "full":
        # Full port scan with service detection
        cmd.extend(["-sT", "-sV", "-p-"])
    else:
        # Default to ping scan
        cmd.extend(["-sn", "-PE"])

    # Add target network
    cmd.append(cidr)

    logger.info("starting_nmap_scan", cidr=cidr, scan_type=scan_type, cmd=" ".join(cmd))

    try:
        process = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )

        try:
            stdout, stderr = await asyncio.wait_for(
                process.communicate(),
                timeout=timeout,
            )
        except asyncio.TimeoutError:
            process.kill()
            raise RuntimeError(f"nmap scan timed out after {timeout} seconds")

        if process.returncode != 0:
            error_msg = stderr.decode("utf-8", errors="ignore")
            raise RuntimeError(f"nmap failed: {error_msg}")

        # Parse XML output
        xml_output = stdout.decode("utf-8", errors="ignore")
        return _parse_nmap_xml(xml_output)

    except Exception as e:
        logger.error("nmap_scan_error", cidr=cidr, error=str(e))
        raise


def _parse_nmap_xml(xml_output: str) -> list[dict]:
    """Parse nmap XML output into structured host data."""
    hosts = []

    try:
        root = ET.fromstring(xml_output)

        for host in root.findall(".//host"):
            status = host.find("status")
            if status is None or status.get("state") != "up":
                continue

            host_data = {
                "ip_address": None,
                "hostname": None,
                "mac_address": None,
                "vendor": None,
                "is_alive": True,
                "latency_ms": None,
                "open_ports": [],
                "os_guess": None,
            }

            # Get IP address
            for addr in host.findall("address"):
                if addr.get("addrtype") == "ipv4":
                    host_data["ip_address"] = addr.get("addr")
                elif addr.get("addrtype") == "mac":
                    host_data["mac_address"] = addr.get("addr")
                    host_data["vendor"] = addr.get("vendor")

            # Get hostname
            hostnames = host.find("hostnames")
            if hostnames is not None:
                hostname_elem = hostnames.find("hostname")
                if hostname_elem is not None:
                    host_data["hostname"] = hostname_elem.get("name")

            # Get latency from times element
            times = host.find("times")
            if times is not None:
                srtt = times.get("srtt")
                if srtt:
                    host_data["latency_ms"] = int(srtt) / 1000  # Convert microseconds to ms

            # Get open ports
            ports_elem = host.find("ports")
            if ports_elem is not None:
                for port in ports_elem.findall("port"):
                    state = port.find("state")
                    if state is not None and state.get("state") == "open":
                        port_info = {
                            "port": int(port.get("portid", 0)),
                            "protocol": port.get("protocol", "tcp"),
                        }
                        service = port.find("service")
                        if service is not None:
                            port_info["service"] = service.get("name")
                            port_info["product"] = service.get("product")
                            port_info["version"] = service.get("version")
                        host_data["open_ports"].append(port_info)

            # Get OS detection if available
            os_elem = host.find("os")
            if os_elem is not None:
                osmatch = os_elem.find("osmatch")
                if osmatch is not None:
                    host_data["os_guess"] = osmatch.get("name")

            if host_data["ip_address"]:
                hosts.append(host_data)

    except ET.ParseError as e:
        logger.error("nmap_xml_parse_error", error=str(e))

    return hosts


class ScannerService:
    """Service for network scanning operations."""

    def __init__(self) -> None:
        self.concurrency = getattr(settings, "scan_concurrency", 50)
        self.ping_timeout = getattr(settings, "ping_timeout", 2.0)

    async def start_scan(
        self,
        network_id: str,
        scan_type: ScanType = ScanType.PING,
        created_by: str | None = None,
    ) -> ScanJob:
        """Start a new network scan."""
        async with get_db() as conn:
            network_repo = NetworkRepository(conn)
            scan_repo = ScanRepository(conn)

            network = await network_repo.find_by_id(network_id)
            if not network:
                raise ValueError(f"Network {network_id} not found")

            # Create scan job
            job = await scan_repo.create(
                ScanJobCreate(network_id=network_id, scan_type=scan_type)
            )

            logger.info(
                "scan_started",
                scan_id=job.id,
                network_id=network_id,
                network=network.network,
                scan_type=scan_type.value,
            )

            return job

    async def run_scan(self, scan_id: str) -> ScanResult:
        """Execute a scan job."""
        async with get_db() as conn:
            scan_repo = ScanRepository(conn)
            network_repo = NetworkRepository(conn)
            address_repo = AddressRepository(conn)

            scan = await scan_repo.find_by_id(scan_id)
            if not scan:
                raise ValueError(f"Scan {scan_id} not found")

            network = await network_repo.find_by_id(scan.network_id)
            if not network:
                raise ValueError(f"Network {scan.network_id} not found")

            # Update status to running
            await scan_repo.update_status(scan_id, ScanStatus.RUNNING)

            start_time = datetime.now(timezone.utc)
            active_ips: set[str] = set()
            new_ips = 0
            total_ips = 0

            try:
                if scan.scan_type == ScanType.NMAP:
                    # Use nmap for comprehensive scanning
                    result = await self._run_nmap_scan(
                        network, scan_id, scan_repo, address_repo
                    )
                else:
                    # Use built-in ICMP/TCP scanning
                    result = await self._run_builtin_scan(
                        network, scan, scan_id, scan_repo, address_repo
                    )

                return result

            except Exception as e:
                error_msg = str(e)
                logger.error("scan_failed", scan_id=scan_id, error=error_msg)

                await scan_repo.update_status(
                    scan_id,
                    ScanStatus.FAILED,
                    error_message=error_msg,
                )

                end_time = datetime.now(timezone.utc)
                return ScanResult(
                    scan_id=scan_id,
                    network_id=network.id,
                    scan_type=scan.scan_type,
                    status=ScanStatus.FAILED,
                    started_at=start_time,
                    completed_at=end_time,
                    duration_seconds=(end_time - start_time).total_seconds(),
                    total_ips=0,
                    active_ips=0,
                    new_ips=0,
                    updated_ips=0,
                    disappeared_ips=0,
                    error_message=error_msg,
                )

    async def _run_nmap_scan(
        self,
        network: Network,
        scan_id: str,
        scan_repo: ScanRepository,
        address_repo: AddressRepository,
    ) -> ScanResult:
        """Run nmap-based network scan."""
        start_time = datetime.now(timezone.utc)
        active_ips: set[str] = set()
        new_ips = 0

        # Calculate total hosts
        ip_network = IPNetwork(network.network)
        total_ips = ip_network.size - 2  # Exclude network and broadcast

        logger.info(
            "running_nmap_scan",
            scan_id=scan_id,
            network=network.network,
            total_ips=total_ips,
        )

        # Run nmap scan
        hosts = await nmap_scan(network.network, scan_type="ping")

        for host in hosts:
            ip = host["ip_address"]
            if not ip:
                continue

            active_ips.add(ip)

            # Check if this is a new IP
            existing = await address_repo.find_by_ip(network.id, ip)
            if not existing:
                new_ips += 1

            # Upsert the discovered address
            await address_repo.upsert(
                IPAddressCreate(
                    network_id=network.id,
                    address=ip,
                    hostname=host.get("hostname"),
                    mac_address=host.get("mac_address"),
                    status=IPStatus.ACTIVE,
                )
            )

        # Mark addresses not seen as inactive
        disappeared = await address_repo.mark_inactive(network.id, active_ips)

        end_time = datetime.now(timezone.utc)
        duration = (end_time - start_time).total_seconds()

        # Update scan with results
        await scan_repo.update_status(
            scan_id,
            ScanStatus.COMPLETED,
            total_ips=total_ips,
            active_ips=len(active_ips),
            new_ips=new_ips,
        )

        logger.info(
            "nmap_scan_completed",
            scan_id=scan_id,
            duration_seconds=duration,
            total_ips=total_ips,
            active_ips=len(active_ips),
            new_ips=new_ips,
        )

        return ScanResult(
            scan_id=scan_id,
            network_id=network.id,
            scan_type=ScanType.NMAP,
            status=ScanStatus.COMPLETED,
            started_at=start_time,
            completed_at=end_time,
            duration_seconds=duration,
            total_ips=total_ips,
            active_ips=len(active_ips),
            new_ips=new_ips,
            updated_ips=len(active_ips) - new_ips,
            disappeared_ips=disappeared,
        )

    async def _run_builtin_scan(
        self,
        network: Network,
        scan: ScanJob,
        scan_id: str,
        scan_repo: ScanRepository,
        address_repo: AddressRepository,
    ) -> ScanResult:
        """Run built-in ICMP/TCP network scan."""
        start_time = datetime.now(timezone.utc)
        active_ips: set[str] = set()
        new_ips = 0

        # Generate IP range from CIDR
        ip_network = IPNetwork(network.network)
        all_ips = [str(ip) for ip in ip_network.iter_hosts()]
        total_ips = len(all_ips)

        logger.info(
            "scanning_network",
            scan_id=scan_id,
            network=network.network,
            total_ips=total_ips,
            scan_type=scan.scan_type.value,
        )

        # Scan in batches
        use_tcp = scan.scan_type == ScanType.TCP
        async for discovered in self._scan_batch(all_ips, use_tcp=use_tcp):
            if discovered.is_alive:
                active_ips.add(discovered.address)

                # Check if this is a new IP
                existing = await address_repo.find_by_ip(
                    network.id, discovered.address
                )
                if not existing:
                    new_ips += 1

                # Upsert the discovered address
                await address_repo.upsert(
                    IPAddressCreate(
                        network_id=network.id,
                        address=discovered.address,
                        hostname=discovered.hostname,
                        mac_address=discovered.mac_address,
                        status=IPStatus.ACTIVE,
                    )
                )

        # Mark addresses not seen as inactive
        disappeared = await address_repo.mark_inactive(network.id, active_ips)

        end_time = datetime.now(timezone.utc)
        duration = (end_time - start_time).total_seconds()

        # Update scan with results
        await scan_repo.update_status(
            scan_id,
            ScanStatus.COMPLETED,
            total_ips=total_ips,
            active_ips=len(active_ips),
            new_ips=new_ips,
        )

        logger.info(
            "scan_completed",
            scan_id=scan_id,
            duration_seconds=duration,
            total_ips=total_ips,
            active_ips=len(active_ips),
            new_ips=new_ips,
            disappeared_ips=disappeared,
        )

        return ScanResult(
            scan_id=scan_id,
            network_id=network.id,
            scan_type=scan.scan_type,
            status=ScanStatus.COMPLETED,
            started_at=start_time,
            completed_at=end_time,
            duration_seconds=duration,
            total_ips=total_ips,
            active_ips=len(active_ips),
            new_ips=new_ips,
            updated_ips=len(active_ips) - new_ips,
            disappeared_ips=disappeared,
        )

    async def _scan_batch(
        self, ips: list[str], use_tcp: bool = False
    ) -> AsyncIterator[IPAddressDiscovered]:
        """Scan IPs in concurrent batches."""
        semaphore = asyncio.Semaphore(self.concurrency)

        async def scan_with_limit(ip: str) -> IPAddressDiscovered | None:
            async with semaphore:
                if use_tcp:
                    ip_addr, is_alive, response_time, open_ports = await tcp_ping(
                        ip, timeout=self.ping_timeout
                    )
                else:
                    ip_addr, is_alive, response_time = await icmp_ping(
                        ip, timeout=self.ping_timeout
                    )

                if is_alive:
                    hostname = await resolve_hostname(ip)
                    return IPAddressDiscovered(
                        address=ip_addr,
                        hostname=hostname,
                        response_time_ms=response_time,
                        is_alive=True,
                    )
                return IPAddressDiscovered(address=ip_addr, is_alive=False)

        # Process all IPs concurrently (respecting semaphore limit)
        tasks = [scan_with_limit(ip) for ip in ips]
        for coro in asyncio.as_completed(tasks):
            result = await coro
            if result:
                yield result

    async def run_quick_scan(
        self, cidr: str, scan_type: str = "ping"
    ) -> list[dict]:
        """
        Run a quick scan without database storage.
        Useful for ad-hoc scanning.
        """
        if scan_type == "nmap" and NMAP_AVAILABLE:
            return await nmap_scan(cidr, scan_type="ping")
        else:
            # Use built-in scanner
            ip_network = IPNetwork(cidr)
            all_ips = [str(ip) for ip in ip_network.iter_hosts()]

            results = []
            async for discovered in self._scan_batch(all_ips, use_tcp=False):
                if discovered.is_alive:
                    results.append({
                        "ip_address": discovered.address,
                        "hostname": discovered.hostname,
                        "response_time_ms": discovered.response_time_ms,
                        "is_alive": True,
                    })

            return results

    async def get_scan_status(self, scan_id: str) -> ScanJob | None:
        """Get current status of a scan job."""
        async with get_db() as conn:
            scan_repo = ScanRepository(conn)
            return await scan_repo.find_by_id(scan_id)

    async def get_network_scans(
        self, network_id: str, limit: int = 10
    ) -> list[ScanJob]:
        """Get recent scans for a network."""
        async with get_db() as conn:
            scan_repo = ScanRepository(conn)
            return await scan_repo.find_by_network(network_id, limit)

    @property
    def nmap_available(self) -> bool:
        """Check if nmap is available."""
        return NMAP_AVAILABLE
