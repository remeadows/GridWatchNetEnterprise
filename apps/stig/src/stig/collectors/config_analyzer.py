"""Configuration file analyzer for STIG compliance checking.

This module provides parsers and analyzers for device configuration files.
Supported formats:
- Arista EOS (.txt)
- HPE Aruba CX (.txt)
- Juniper JunOS (.txt, .conf)
- Mellanox (.txt)
- pfSense (.xml)
- Red Hat Linux (various config files)
"""

import re
import xml.etree.ElementTree as ET
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from enum import Enum
from typing import Any

from ..core.logging import get_logger
from ..models import (
    Platform,
    STIGRule,
    AuditResultCreate,
    CheckStatus,
    STIGSeverity,
)

logger = get_logger(__name__)


@dataclass
class ConfigFinding:
    """A finding from configuration analysis."""

    rule_id: str
    vuln_id: str
    title: str
    severity: STIGSeverity
    status: CheckStatus
    finding_details: str
    config_line: str | None = None
    line_number: int | None = None
    expected_value: str | None = None
    actual_value: str | None = None


@dataclass
class ParsedConfig:
    """Parsed configuration data."""

    platform: Platform
    hostname: str | None = None
    version: str | None = None
    raw_content: str = ""
    sections: dict[str, Any] = field(default_factory=dict)
    settings: dict[str, Any] = field(default_factory=dict)
    interfaces: list[dict[str, Any]] = field(default_factory=list)
    users: list[dict[str, Any]] = field(default_factory=list)
    acls: list[dict[str, Any]] = field(default_factory=list)
    routing: dict[str, Any] = field(default_factory=dict)
    services: dict[str, bool] = field(default_factory=dict)
    ntp_servers: list[str] = field(default_factory=list)
    dns_servers: list[str] = field(default_factory=list)
    syslog_servers: list[str] = field(default_factory=list)
    snmp_config: dict[str, Any] = field(default_factory=dict)
    aaa_config: dict[str, Any] = field(default_factory=dict)
    ssh_config: dict[str, Any] = field(default_factory=dict)
    banner: str | None = None


class ConfigParser(ABC):
    """Abstract base class for configuration parsers."""

    @property
    @abstractmethod
    def platform(self) -> Platform:
        """Return the platform this parser handles."""
        pass

    @abstractmethod
    def parse(self, content: str) -> ParsedConfig:
        """Parse configuration content."""
        pass


class AristaEOSParser(ConfigParser):
    """Parser for Arista EOS configurations."""

    @property
    def platform(self) -> Platform:
        return Platform.ARISTA_EOS

    def parse(self, content: str) -> ParsedConfig:
        """Parse Arista EOS configuration."""
        config = ParsedConfig(platform=self.platform, raw_content=content)
        lines = content.split("\n")

        current_section = None
        current_interface = None

        for line in lines:
            stripped = line.strip()

            # Skip empty lines and comments
            if not stripped or stripped.startswith("!"):
                continue

            # Hostname
            if stripped.startswith("hostname "):
                config.hostname = stripped.split("hostname ", 1)[1]

            # Version (from show version output if included)
            if "Software image version:" in stripped:
                config.version = stripped.split(":", 1)[1].strip()

            # Interface section
            if stripped.startswith("interface "):
                current_section = "interface"
                current_interface = {"name": stripped.split("interface ", 1)[1], "config": []}
                continue

            if current_section == "interface" and current_interface:
                if not stripped.startswith(" ") and not stripped.startswith("\t"):
                    config.interfaces.append(current_interface)
                    current_interface = None
                    current_section = None
                else:
                    current_interface["config"].append(stripped)

            # SSH configuration
            if "ssh" in stripped.lower():
                if "management ssh" in stripped.lower():
                    config.ssh_config["enabled"] = True
                if "ssh server" in stripped.lower():
                    config.ssh_config["server_enabled"] = True

            # AAA configuration
            if stripped.startswith("aaa "):
                config.aaa_config["enabled"] = True
                if "authentication" in stripped:
                    config.aaa_config["authentication"] = stripped

            # NTP servers
            if stripped.startswith("ntp server "):
                server = stripped.split("ntp server ", 1)[1].split()[0]
                config.ntp_servers.append(server)

            # DNS servers
            if stripped.startswith("ip name-server "):
                servers = stripped.split("ip name-server ", 1)[1].split()
                config.dns_servers.extend(servers)

            # Syslog servers
            if stripped.startswith("logging host "):
                server = stripped.split("logging host ", 1)[1].split()[0]
                config.syslog_servers.append(server)

            # SNMP configuration
            if stripped.startswith("snmp-server "):
                if "community" in stripped:
                    parts = stripped.split()
                    if len(parts) >= 3:
                        config.snmp_config.setdefault("communities", []).append(parts[2])
                if "host" in stripped:
                    config.snmp_config.setdefault("hosts", []).append(stripped)

            # Banner
            if stripped.startswith("banner"):
                config.banner = stripped

            # Users
            if stripped.startswith("username "):
                parts = stripped.split()
                if len(parts) >= 2:
                    config.users.append({"name": parts[1], "config": stripped})

            # Services
            if stripped.startswith("no "):
                service = stripped[3:].split()[0] if len(stripped) > 3 else ""
                config.services[service] = False
            elif stripped.startswith("service "):
                service = stripped.split("service ", 1)[1].split()[0]
                config.services[service] = True

        # Add last interface if pending
        if current_interface:
            config.interfaces.append(current_interface)

        return config


class HPEArubaCXParser(ConfigParser):
    """Parser for HPE Aruba CX configurations."""

    @property
    def platform(self) -> Platform:
        return Platform.HPE_ARUBA_CX

    def parse(self, content: str) -> ParsedConfig:
        """Parse HPE Aruba CX configuration."""
        config = ParsedConfig(platform=self.platform, raw_content=content)
        lines = content.split("\n")

        current_interface = None

        for line in lines:
            stripped = line.strip()

            if not stripped or stripped.startswith("!"):
                continue

            # Hostname
            if stripped.startswith("hostname "):
                config.hostname = stripped.split("hostname ", 1)[1].strip('"')

            # SSH configuration
            if "ssh server" in stripped.lower():
                config.ssh_config["server_enabled"] = True
            if "ssh server vrf" in stripped.lower():
                config.ssh_config["vrf"] = stripped.split("vrf", 1)[1].strip()

            # Interface
            if stripped.startswith("interface "):
                if current_interface:
                    config.interfaces.append(current_interface)
                current_interface = {"name": stripped.split("interface ", 1)[1], "config": []}
                continue

            if current_interface:
                if not line.startswith(" ") and not line.startswith("\t") and stripped:
                    config.interfaces.append(current_interface)
                    current_interface = None
                else:
                    current_interface["config"].append(stripped)

            # NTP
            if stripped.startswith("ntp server "):
                server = stripped.split("ntp server ", 1)[1].split()[0]
                config.ntp_servers.append(server)

            # Users
            if stripped.startswith("user "):
                parts = stripped.split()
                if len(parts) >= 2:
                    config.users.append({"name": parts[1], "config": stripped})

            # SNMP
            if stripped.startswith("snmp-server "):
                if "community" in stripped:
                    parts = stripped.split()
                    for i, part in enumerate(parts):
                        if part == "community" and i + 1 < len(parts):
                            config.snmp_config.setdefault("communities", []).append(parts[i + 1])

            # Syslog
            if stripped.startswith("logging "):
                parts = stripped.split()
                if len(parts) >= 2 and parts[1] not in ["console", "facility", "severity"]:
                    config.syslog_servers.append(parts[1])

            # Banner
            if stripped.startswith("banner"):
                config.banner = stripped

        if current_interface:
            config.interfaces.append(current_interface)

        return config


class JuniperJunOSParser(ConfigParser):
    """Parser for Juniper JunOS configurations."""

    @property
    def platform(self) -> Platform:
        return Platform.JUNIPER_JUNOS

    def parse(self, content: str) -> ParsedConfig:
        """Parse Juniper JunOS configuration."""
        config = ParsedConfig(platform=self.platform, raw_content=content)

        # JunOS uses hierarchical { } structure
        lines = content.split("\n")

        section_stack = []
        current_path = []

        for line in lines:
            stripped = line.strip()

            if not stripped or stripped.startswith("#"):
                continue

            # Track section depth
            if stripped.endswith("{"):
                section_name = stripped[:-1].strip()
                current_path.append(section_name)
                section_stack.append(section_name)

            elif stripped == "}":
                if current_path:
                    current_path.pop()

            else:
                full_path = " ".join(current_path)

                # Hostname
                if "system host-name" in full_path or stripped.startswith("host-name "):
                    config.hostname = stripped.split()[-1].rstrip(";")

                # Version
                if "version" in stripped:
                    config.version = stripped.split()[-1].rstrip(";")

                # NTP
                if "ntp" in full_path and "server" in stripped:
                    server = stripped.split()[-1].rstrip(";")
                    config.ntp_servers.append(server)

                # Syslog
                if "syslog" in full_path and "host" in stripped:
                    parts = stripped.split()
                    for part in parts:
                        if re.match(r"\d+\.\d+\.\d+\.\d+", part.rstrip(";")):
                            config.syslog_servers.append(part.rstrip(";"))

                # SSH
                if "ssh" in full_path.lower():
                    config.ssh_config["enabled"] = True
                    if "protocol-version" in stripped:
                        config.ssh_config["protocol_version"] = stripped.split()[-1].rstrip(";")

                # Users
                if "login user" in full_path:
                    user_match = re.search(r"user (\S+)", full_path)
                    if user_match:
                        config.users.append({"name": user_match.group(1), "config": stripped})

                # SNMP
                if "snmp" in full_path:
                    if "community" in stripped:
                        parts = stripped.split()
                        for i, part in enumerate(parts):
                            if part == "community" and i + 1 < len(parts):
                                config.snmp_config.setdefault("communities", []).append(
                                    parts[i + 1].rstrip(";")
                                )

                # Interfaces
                if "interfaces" in full_path:
                    iface_match = re.search(r"interfaces (\S+)", full_path)
                    if iface_match:
                        iface_name = iface_match.group(1)
                        # Find or create interface entry
                        iface = next(
                            (i for i in config.interfaces if i["name"] == iface_name), None
                        )
                        if not iface:
                            iface = {"name": iface_name, "config": []}
                            config.interfaces.append(iface)
                        iface["config"].append(stripped)

        return config


class MellanoxParser(ConfigParser):
    """Parser for Mellanox/NVIDIA switch configurations."""

    @property
    def platform(self) -> Platform:
        return Platform.MELLANOX

    def parse(self, content: str) -> ParsedConfig:
        """Parse Mellanox configuration."""
        config = ParsedConfig(platform=self.platform, raw_content=content)
        lines = content.split("\n")

        for line in lines:
            stripped = line.strip()

            if not stripped or stripped.startswith("#") or stripped.startswith("!"):
                continue

            # Hostname
            if stripped.startswith("hostname "):
                config.hostname = stripped.split("hostname ", 1)[1]

            # SSH
            if "ssh server" in stripped.lower():
                config.ssh_config["server_enabled"] = True
            if "ssh server enable" in stripped.lower():
                config.ssh_config["enabled"] = True

            # NTP
            if stripped.startswith("ntp server "):
                server = stripped.split("ntp server ", 1)[1].split()[0]
                config.ntp_servers.append(server)

            # Users
            if stripped.startswith("username "):
                parts = stripped.split()
                if len(parts) >= 2:
                    config.users.append({"name": parts[1], "config": stripped})

            # SNMP
            if stripped.startswith("snmp-server "):
                if "community" in stripped:
                    parts = stripped.split()
                    for i, part in enumerate(parts):
                        if part == "community" and i + 1 < len(parts):
                            config.snmp_config.setdefault("communities", []).append(parts[i + 1])

            # Syslog
            if stripped.startswith("logging "):
                parts = stripped.split()
                if len(parts) >= 2:
                    config.syslog_servers.append(parts[1])

            # Interfaces
            if stripped.startswith("interface "):
                config.interfaces.append(
                    {"name": stripped.split("interface ", 1)[1], "config": []}
                )

        return config


class PfSenseParser(ConfigParser):
    """Parser for pfSense XML configurations."""

    @property
    def platform(self) -> Platform:
        return Platform.PFSENSE

    def parse(self, content: str) -> ParsedConfig:
        """Parse pfSense XML configuration."""
        config = ParsedConfig(platform=self.platform, raw_content=content)

        try:
            root = ET.fromstring(content)
        except ET.ParseError as e:
            logger.error("pfsense_xml_parse_error", error=str(e))
            return config

        # System info
        system = root.find("system")
        if system is not None:
            hostname_elem = system.find("hostname")
            if hostname_elem is not None:
                config.hostname = hostname_elem.text

            # DNS servers
            dns_elem = system.find("dnsserver")
            if dns_elem is not None and dns_elem.text:
                config.dns_servers.append(dns_elem.text)

            # NTP
            timeservers = system.find("timeservers")
            if timeservers is not None and timeservers.text:
                config.ntp_servers.extend(timeservers.text.split())

            # SSH
            ssh_elem = system.find("ssh")
            if ssh_elem is not None:
                config.ssh_config["enabled"] = True
                port = ssh_elem.find("port")
                if port is not None:
                    config.ssh_config["port"] = port.text

        # Interfaces
        interfaces = root.find("interfaces")
        if interfaces is not None:
            for iface in interfaces:
                iface_data = {
                    "name": iface.tag,
                    "config": [],
                }
                for child in iface:
                    iface_data["config"].append(f"{child.tag}: {child.text}")
                    if child.tag == "ipaddr":
                        iface_data["ip"] = child.text
                    if child.tag == "descr":
                        iface_data["description"] = child.text
                config.interfaces.append(iface_data)

        # Firewall rules
        filter_elem = root.find("filter")
        if filter_elem is not None:
            for rule in filter_elem.findall("rule"):
                rule_data = {}
                for child in rule:
                    rule_data[child.tag] = child.text
                config.acls.append(rule_data)

        # Users
        for user in root.findall(".//user"):
            user_data = {"name": "", "config": ""}
            name_elem = user.find("name")
            if name_elem is not None:
                user_data["name"] = name_elem.text
            config.users.append(user_data)

        # Syslog
        syslog = root.find(".//syslog")
        if syslog is not None:
            for server in syslog.findall("remoteserver"):
                if server.text:
                    config.syslog_servers.append(server.text)
            for server in syslog.findall("remoteserver2"):
                if server.text:
                    config.syslog_servers.append(server.text)
            for server in syslog.findall("remoteserver3"):
                if server.text:
                    config.syslog_servers.append(server.text)

        # SNMP
        snmpd = root.find(".//snmpd")
        if snmpd is not None:
            config.snmp_config["enabled"] = True
            community = snmpd.find("rocommunity")
            if community is not None:
                config.snmp_config.setdefault("communities", []).append(community.text)

        return config


class RedHatParser(ConfigParser):
    """Parser for Red Hat Linux configurations.

    This parser handles various config files that may be provided:
    - /etc/ssh/sshd_config
    - /etc/login.defs
    - /etc/audit/auditd.conf
    - /etc/selinux/config
    - etc.
    """

    @property
    def platform(self) -> Platform:
        return Platform.REDHAT

    def parse(self, content: str) -> ParsedConfig:
        """Parse Red Hat configuration files."""
        config = ParsedConfig(platform=self.platform, raw_content=content)
        lines = content.split("\n")

        for line in lines:
            stripped = line.strip()

            if not stripped or stripped.startswith("#"):
                continue

            # Key=value or Key value format
            if "=" in stripped:
                key, _, value = stripped.partition("=")
                key = key.strip()
                value = value.strip().strip('"').strip("'")
                config.settings[key] = value

                # Specific handling
                if key.lower() == "hostname":
                    config.hostname = value
                elif key == "SELINUX":
                    config.services["selinux"] = value
                elif key == "PASS_MAX_DAYS":
                    config.settings["pass_max_days"] = value
                elif key == "PASS_MIN_DAYS":
                    config.settings["pass_min_days"] = value
                elif key == "PASS_MIN_LEN":
                    config.settings["pass_min_len"] = value

            elif " " in stripped:
                parts = stripped.split(None, 1)
                if len(parts) == 2:
                    key, value = parts
                    config.settings[key] = value.strip()

                    # SSH config handling
                    if key in ["PermitRootLogin", "PasswordAuthentication", "Protocol"]:
                        config.ssh_config[key] = value

        return config


# Parser registry
PARSERS: dict[Platform, type[ConfigParser]] = {
    Platform.ARISTA_EOS: AristaEOSParser,
    Platform.HPE_ARUBA_CX: HPEArubaCXParser,
    Platform.JUNIPER_JUNOS: JuniperJunOSParser,
    Platform.JUNIPER_SRX: JuniperJunOSParser,  # SRX uses JunOS
    Platform.MELLANOX: MellanoxParser,
    Platform.PFSENSE: PfSenseParser,
    Platform.REDHAT: RedHatParser,
    Platform.LINUX: RedHatParser,  # Generic Linux uses same parser
}


def get_parser(platform: Platform) -> ConfigParser | None:
    """Get a parser for the specified platform."""
    parser_class = PARSERS.get(platform)
    if parser_class:
        return parser_class()
    return None


def detect_platform_from_content(content: str) -> Platform | None:
    """Attempt to detect platform from configuration content."""
    content_lower = content.lower()

    # Check for XML (pfSense)
    if content.strip().startswith("<?xml") or "<pfsense>" in content:
        return Platform.PFSENSE

    # Check for Arista
    if "arista" in content_lower or "eos" in content_lower:
        return Platform.ARISTA_EOS

    # Check for Juniper
    if "juniper" in content_lower or "junos" in content_lower:
        return Platform.JUNIPER_JUNOS

    # Check for Mellanox
    if "mellanox" in content_lower or "mlnx" in content_lower:
        return Platform.MELLANOX

    # Check for Aruba CX
    if "aruba" in content_lower or "arubaos-cx" in content_lower:
        return Platform.HPE_ARUBA_CX

    # Check for Linux config patterns
    if "selinux" in content_lower or "pass_max_days" in content_lower:
        return Platform.REDHAT

    return None
