"""Juniper SRX STIG compliance checker.

This module provides comprehensive STIG compliance checking for Juniper SRX
configurations, supporting:
- ALG (Application Layer Gateway) STIGs
- NDM (Network Device Management) STIGs
- VPN STIGs
- IDPS STIGs

The checker extracts security-relevant configuration sections and evaluates
them against STIG rules loaded from the database.
"""

import re
from dataclasses import dataclass, field
from typing import Any
from enum import Enum

from ..core.logging import get_logger
from ..models import (
    Platform,
    AuditResultCreate,
    CheckStatus,
    STIGSeverity,
)

logger = get_logger(__name__)


class JuniperSTIGCategory(Enum):
    """Categories of Juniper STIG checks."""

    ALG = "alg"  # Application Layer Gateway / Firewall
    NDM = "ndm"  # Network Device Management
    VPN = "vpn"  # VPN/IPsec
    IDPS = "idps"  # Intrusion Detection/Prevention


@dataclass
class JuniperSecurityConfig:
    """Parsed Juniper security configuration data."""

    # Basic info
    hostname: str | None = None
    version: str | None = None
    raw_content: str = ""

    # System section
    system: dict[str, Any] = field(default_factory=dict)
    login: dict[str, Any] = field(default_factory=dict)
    services: dict[str, Any] = field(default_factory=dict)
    syslog: dict[str, Any] = field(default_factory=dict)
    ntp: dict[str, Any] = field(default_factory=dict)
    authentication_order: list[str] = field(default_factory=list)
    tacplus_servers: list[str] = field(default_factory=list)
    radius_servers: list[str] = field(default_factory=list)

    # Security section
    security_log: dict[str, Any] = field(default_factory=dict)
    security_screen: dict[str, Any] = field(default_factory=dict)
    security_policies: dict[str, Any] = field(default_factory=dict)
    security_zones: dict[str, Any] = field(default_factory=dict)
    security_ike: dict[str, Any] = field(default_factory=dict)
    security_ipsec: dict[str, Any] = field(default_factory=dict)
    security_idp: dict[str, Any] = field(default_factory=dict)
    security_alg: dict[str, Any] = field(default_factory=dict)

    # SNMP
    snmp: dict[str, Any] = field(default_factory=dict)
    snmp_v3: dict[str, Any] = field(default_factory=dict)
    snmp_communities: list[str] = field(default_factory=list)

    # Interfaces
    interfaces: list[dict[str, Any]] = field(default_factory=list)

    # Firewall filters
    firewall_filters: dict[str, Any] = field(default_factory=dict)

    # Class of service / QoS
    class_of_service: dict[str, Any] = field(default_factory=dict)

    # Routing
    routing_options: dict[str, Any] = field(default_factory=dict)

    # Raw sections for pattern matching
    sections: dict[str, str] = field(default_factory=dict)


class JuniperConfigParser:
    """Enhanced parser for Juniper JunOS/SRX configurations."""

    def __init__(self) -> None:
        self.config = JuniperSecurityConfig()
        self._current_section: list[str] = []
        self._section_content: dict[str, list[str]] = {}

    def parse(self, content: str) -> JuniperSecurityConfig:
        """Parse Juniper configuration content.

        Args:
            content: Raw configuration text

        Returns:
            Parsed JuniperSecurityConfig
        """
        self.config = JuniperSecurityConfig(raw_content=content)
        lines = content.split("\n")

        section_stack: list[str] = []
        current_section_lines: dict[str, list[str]] = {}

        for line in lines:
            stripped = line.strip()

            # Skip empty lines and comments
            if not stripped or stripped.startswith("#") or stripped.startswith("##"):
                continue

            # Track section depth with braces
            if stripped.endswith("{"):
                section_name = stripped[:-1].strip()
                section_stack.append(section_name)
                section_path = " > ".join(section_stack)
                current_section_lines.setdefault(section_path, [])

            elif stripped == "}":
                if section_stack:
                    # Save section content
                    section_path = " > ".join(section_stack)
                    if section_path in current_section_lines:
                        self.config.sections[section_path] = "\n".join(
                            current_section_lines[section_path]
                        )
                    section_stack.pop()

            else:
                # Add line to current section
                if section_stack:
                    section_path = " > ".join(section_stack)
                    current_section_lines.setdefault(section_path, []).append(stripped)

                # Parse specific elements
                full_path = " > ".join(section_stack).lower()
                self._parse_line(stripped, full_path, section_stack)

        return self.config

    def _parse_line(self, line: str, path: str, stack: list[str]) -> None:
        """Parse a single configuration line.

        Args:
            line: The configuration line
            path: Current section path
            stack: Current section stack
        """
        # Clean line - remove trailing semicolons
        clean_line = line.rstrip(";").strip()

        # === System Section ===
        if "system" in path:
            self._parse_system(clean_line, path)

        # === Security Section ===
        if "security" in path:
            self._parse_security(clean_line, path, stack)

        # === SNMP Section ===
        if "snmp" in path or line.startswith("snmp"):
            self._parse_snmp(clean_line, path)

        # === Interfaces Section ===
        if "interfaces" in path:
            self._parse_interface(clean_line, path)

        # === Firewall Section ===
        if "firewall" in path:
            self._parse_firewall(clean_line, path)

        # === Routing Options ===
        if "routing-options" in path:
            self._parse_routing(clean_line, path)

    def _parse_system(self, line: str, path: str) -> None:
        """Parse system configuration section."""
        # Hostname
        if "host-name" in line:
            match = re.search(r'host-name\s+(\S+)', line)
            if match:
                self.config.hostname = match.group(1)

        # Version
        if line.startswith("version"):
            self.config.version = line.split()[-1]

        # Login settings
        if "login" in path:
            if "retry-options" in path:
                self._parse_key_value(line, self.config.login.setdefault("retry_options", {}))
            elif "message" in line:
                match = re.search(r'message\s+"([^"]+)"', line)
                if match:
                    self.config.login["banner"] = match.group(1)
            elif "class" in path:
                self._parse_key_value(line, self.config.login.setdefault("classes", {}))
            elif "user" in path:
                self._parse_key_value(line, self.config.login.setdefault("users", {}))

        # Services (SSH, NetConf, etc.)
        if "services" in path:
            if "ssh" in path:
                self._parse_key_value(line, self.config.services.setdefault("ssh", {}))
                # Specific SSH settings
                if "root-login" in line:
                    self.config.services["ssh"]["root_login"] = "deny" if "deny" in line else "allow"
                if "protocol-version" in line:
                    self.config.services["ssh"]["protocol_version"] = line.split()[-1]
                if "ciphers" in line:
                    self.config.services["ssh"]["ciphers"] = line.split()[-1]
                if "macs" in line:
                    self.config.services["ssh"]["macs"] = line.split()[-1]
                if "key-exchange" in line:
                    self.config.services["ssh"]["key_exchange"] = line.split()[-1]
            elif "netconf" in path:
                self.config.services["netconf"] = {"enabled": True}
            elif "web-management" in path:
                self.config.services["web_management"] = {"enabled": True}
            elif "telnet" in line:
                self.config.services["telnet"] = {"enabled": True}
            elif "ftp" in line:
                self.config.services["ftp"] = {"enabled": True}

        # Syslog
        if "syslog" in path:
            if "host" in line:
                match = re.search(r'host\s+(\S+)', line)
                if match:
                    self.config.syslog.setdefault("hosts", []).append(match.group(1))
            if "source-address" in line:
                self.config.syslog["source_address"] = line.split()[-1]
            if "file" in path:
                self.config.syslog.setdefault("files", []).append(line)

        # NTP
        if "ntp" in path:
            if "server" in line:
                match = re.search(r'server\s+(\S+)', line)
                if match:
                    self.config.ntp.setdefault("servers", []).append(match.group(1))
            if "authentication-key" in line:
                self.config.ntp["authentication"] = True

        # Authentication order
        if "authentication-order" in line:
            match = re.search(r'authentication-order\s+\[(.*?)\]', line)
            if match:
                self.config.authentication_order = match.group(1).split()

        # TACACS+
        if "tacplus-server" in path:
            if re.match(r'\d+\.\d+\.\d+\.\d+', line.split()[0] if line.split() else ""):
                self.config.tacplus_servers.append(line.split()[0])

        # RADIUS
        if "radius-server" in path:
            if re.match(r'\d+\.\d+\.\d+\.\d+', line.split()[0] if line.split() else ""):
                self.config.radius_servers.append(line.split()[0])

    def _parse_security(self, line: str, path: str, stack: list[str]) -> None:
        """Parse security configuration section."""
        # Security logging
        if "security > log" in path:
            self._parse_key_value(line, self.config.security_log)
            if "stream" in path:
                self.config.security_log.setdefault("streams", []).append(line)

        # Security screens (IDS)
        if "screen" in path:
            self._parse_key_value(line, self.config.security_screen)
            if "ids-option" in path:
                self.config.security_screen["ids_enabled"] = True

        # Security policies
        if "policies" in path:
            if "from-zone" in path:
                self._parse_key_value(line, self.config.security_policies)
            if "default-policy" in path:
                if "deny-all" in line:
                    self.config.security_policies["default_deny"] = True
                elif "permit-all" in line:
                    self.config.security_policies["default_permit"] = True
            if "then log" in line or "then permit" in line or "then deny" in line:
                self.config.security_policies.setdefault("actions", []).append(line)

        # Security zones
        if "zones" in path:
            if "security-zone" in path:
                zone_match = re.search(r'security-zone\s+(\S+)', path)
                if zone_match:
                    zone_name = zone_match.group(1)
                    zone_config = self.config.security_zones.setdefault(zone_name, {})
                    if "screen" in line:
                        zone_config["screen"] = line.split()[-1]
                    if "interfaces" in path:
                        zone_config.setdefault("interfaces", []).append(line.rstrip(";"))
                    if "host-inbound-traffic" in path:
                        zone_config.setdefault("host_inbound_traffic", []).append(line)

        # IKE (VPN)
        if "ike" in path:
            self._parse_key_value(line, self.config.security_ike)
            if "proposal" in path:
                self.config.security_ike.setdefault("proposals", []).append(line)
            if "policy" in path:
                self.config.security_ike.setdefault("policies", []).append(line)
            if "gateway" in path:
                self.config.security_ike.setdefault("gateways", []).append(line)

        # IPsec (VPN)
        if "ipsec" in path:
            self._parse_key_value(line, self.config.security_ipsec)
            if "proposal" in path:
                self.config.security_ipsec.setdefault("proposals", []).append(line)
            if "policy" in path:
                self.config.security_ipsec.setdefault("policies", []).append(line)
            if "vpn" in path:
                self.config.security_ipsec.setdefault("vpns", []).append(line)

        # IDP (Intrusion Detection/Prevention)
        if "idp" in path:
            self._parse_key_value(line, self.config.security_idp)
            if "active-policy" in line:
                self.config.security_idp["active_policy"] = line.split()[-1]
            if "security-package" in path:
                self.config.security_idp["security_package"] = True

        # ALG (Application Layer Gateway)
        if "alg" in path:
            self._parse_key_value(line, self.config.security_alg)

    def _parse_snmp(self, line: str, path: str) -> None:
        """Parse SNMP configuration section."""
        # Community strings (v1/v2c - bad)
        if "community" in line:
            match = re.search(r'community\s+"?([^"\s]+)"?', line)
            if match:
                self.config.snmp_communities.append(match.group(1))

        # SNMPv3
        if "v3" in path:
            self._parse_key_value(line, self.config.snmp_v3)
            if "usm" in path:
                self.config.snmp_v3["usm_configured"] = True
            if "authentication-sha" in line or "authentication-sha256" in line:
                self.config.snmp_v3["auth_sha"] = True
            if "authentication-md5" in line:
                self.config.snmp_v3["auth_md5"] = True
            if "privacy-aes" in line or "privacy-aes256" in line:
                self.config.snmp_v3["privacy_aes"] = True
            if "privacy-des" in line:
                self.config.snmp_v3["privacy_des"] = True

        # General SNMP settings
        self._parse_key_value(line, self.config.snmp)

    def _parse_interface(self, line: str, path: str) -> None:
        """Parse interface configuration."""
        iface_match = re.search(r'interfaces > (\S+)', path)
        if iface_match:
            iface_name = iface_match.group(1)
            # Find or create interface
            iface = next(
                (i for i in self.config.interfaces if i.get("name") == iface_name),
                None
            )
            if not iface:
                iface = {"name": iface_name, "config": []}
                self.config.interfaces.append(iface)
            iface["config"].append(line)

    def _parse_firewall(self, line: str, path: str) -> None:
        """Parse firewall filter configuration."""
        if "filter" in path:
            filter_match = re.search(r'filter\s+(\S+)', path)
            if filter_match:
                filter_name = filter_match.group(1)
                filter_config = self.config.firewall_filters.setdefault(filter_name, {"terms": []})
                if "term" in path:
                    filter_config["terms"].append(line)
                    if "log" in line or "syslog" in line:
                        filter_config["logging_enabled"] = True

    def _parse_routing(self, line: str, path: str) -> None:
        """Parse routing options configuration."""
        self._parse_key_value(line, self.config.routing_options)

    def _parse_key_value(self, line: str, target: dict) -> None:
        """Parse a key-value pair from a line."""
        parts = line.split(None, 1)
        if len(parts) == 2:
            key = parts[0].replace("-", "_")
            value = parts[1].rstrip(";").strip()
            target[key] = value
        elif len(parts) == 1:
            target[parts[0].replace("-", "_")] = True


class JuniperSTIGEvaluator:
    """Evaluates Juniper configurations against STIG rules."""

    def __init__(self, config: JuniperSecurityConfig):
        self.config = config
        self.raw_content = config.raw_content.lower()

    def evaluate_rule(
        self,
        vuln_id: str,
        rule_id: str,
        title: str,
        severity: str,
        check_text: str,
        fix_text: str,
        job_id: str,
    ) -> AuditResultCreate:
        """Evaluate a single STIG rule against the configuration.

        Args:
            vuln_id: Vulnerability ID (e.g., V-214518)
            rule_id: Rule ID (e.g., SV-214518r997541_rule)
            title: Rule title
            severity: Rule severity (high, medium, low)
            check_text: Check procedure text
            fix_text: Fix procedure text
            job_id: Audit job ID

        Returns:
            AuditResultCreate with check status
        """
        severity_map = {
            "high": STIGSeverity.HIGH,
            "medium": STIGSeverity.MEDIUM,
            "low": STIGSeverity.LOW,
        }
        stig_severity = severity_map.get(severity.lower(), STIGSeverity.MEDIUM)

        # Determine check category from title/vuln_id
        category = self._determine_category(vuln_id, title, check_text)

        # Run automated check based on category and content
        status, finding = self._run_check(category, vuln_id, title, check_text, fix_text)

        return AuditResultCreate(
            job_id=job_id,
            rule_id=vuln_id,
            title=title,
            severity=stig_severity,
            status=status,
            finding_details=finding,
        )

    def _determine_category(self, vuln_id: str, title: str, check_text: str) -> JuniperSTIGCategory:
        """Determine the STIG category for a rule."""
        title_lower = title.lower()
        check_lower = check_text.lower()

        # VPN checks
        if any(kw in title_lower or kw in check_lower for kw in
               ["vpn", "ike", "ipsec", "tunnel", "certificate"]):
            return JuniperSTIGCategory.VPN

        # IDP/IDS checks
        if any(kw in title_lower or kw in check_lower for kw in
               ["idp", "ids", "intrusion", "attack signature"]):
            return JuniperSTIGCategory.IDPS

        # NDM checks (device management)
        if any(kw in title_lower or kw in check_lower for kw in
               ["snmp", "ssh", "ntp", "syslog", "logging", "authentication",
                "password", "account", "session", "banner", "management"]):
            return JuniperSTIGCategory.NDM

        # Default to ALG (firewall/security policies)
        return JuniperSTIGCategory.ALG

    def _run_check(
        self,
        category: JuniperSTIGCategory,
        vuln_id: str,
        title: str,
        check_text: str,
        fix_text: str,
    ) -> tuple[CheckStatus, str]:
        """Run the appropriate check based on category and rule content."""
        check_lower = check_text.lower()
        title_lower = title.lower()

        # === SSH CHECKS ===
        if "ssh" in title_lower or "sshv2" in title_lower:
            return self._check_ssh(check_text, fix_text, title)

        # === SNMP CHECKS ===
        if "snmp" in title_lower:
            return self._check_snmp(check_text, fix_text, title)

        # === NTP CHECKS ===
        if "ntp" in title_lower or "time" in title_lower:
            return self._check_ntp(check_text, fix_text, title)

        # === SYSLOG/LOGGING CHECKS ===
        if "log" in title_lower or "syslog" in title_lower or "audit" in title_lower:
            return self._check_logging(check_text, fix_text, title)

        # === AUTHENTICATION CHECKS ===
        if "authentication" in title_lower or "tacacs" in title_lower or "radius" in title_lower:
            return self._check_authentication(check_text, fix_text, title)

        # === SECURITY SCREEN/IDS CHECKS ===
        if "screen" in title_lower or ("protect" in title_lower and "attack" in title_lower):
            return self._check_security_screen(check_text, fix_text, title)

        # === SECURITY POLICY CHECKS ===
        if "policy" in title_lower or "zone" in title_lower:
            return self._check_security_policy(check_text, fix_text, title)

        # === SESSION TIMEOUT CHECKS ===
        if "timeout" in title_lower or "idle" in title_lower or "session" in title_lower:
            return self._check_session_timeout(check_text, fix_text, title)

        # === VPN/IKE/IPSEC CHECKS ===
        if category == JuniperSTIGCategory.VPN:
            return self._check_vpn(check_text, fix_text, title)

        # === IDP CHECKS ===
        if category == JuniperSTIGCategory.IDPS:
            return self._check_idp(check_text, fix_text, title)

        # === BANNER CHECKS ===
        if "banner" in title_lower:
            return self._check_banner(check_text, fix_text, title)

        # === PASSWORD/ACCOUNT LOCKOUT CHECKS ===
        if "password" in title_lower or "lockout" in title_lower or "brute" in title_lower:
            return self._check_password_policy(check_text, fix_text, title)

        # === DEFAULT: Pattern matching from check text ===
        return self._check_by_pattern(check_text, fix_text, title)

    def _check_ssh(self, check_text: str, fix_text: str, title: str) -> tuple[CheckStatus, str]:
        """Check SSH configuration."""
        ssh = self.config.services.get("ssh", {})
        findings = []
        failed = False

        # SSH enabled
        if not ssh:
            # Check raw content for SSH
            if "services" in self.config.raw_content and "ssh" in self.config.raw_content:
                ssh = {"enabled": True}
            else:
                return CheckStatus.FAIL, "SSH service not configured"

        # Protocol version
        if "v2" in title.lower() or "version 2" in title.lower() or "sshv2" in title.lower():
            proto = ssh.get("protocol_version", "")
            if "v2" in str(proto).lower() or "2" in str(proto):
                findings.append(f"SSH Protocol Version: v2 ✓")
            else:
                findings.append(f"SSH Protocol Version: {proto or 'not explicitly set'}")
                # JunOS defaults to v2, so not necessarily a failure
                if re.search(r'protocol-version\s+v2', self.config.raw_content, re.IGNORECASE):
                    findings.append("protocol-version v2 found in config ✓")
                elif "protocol-version" not in self.config.raw_content:
                    findings.append("Note: JunOS defaults to SSHv2")

        # Root login
        if "root" in title.lower():
            root_login = ssh.get("root_login", "")
            if root_login == "deny":
                findings.append("SSH root-login: deny ✓")
            elif "root-login deny" in self.config.raw_content:
                findings.append("SSH root-login deny found in config ✓")
            else:
                findings.append("SSH root-login is not set to deny")
                failed = True

        # FIPS ciphers
        if "fips" in title.lower() or "cipher" in title.lower():
            ciphers = ssh.get("ciphers", "")
            macs = ssh.get("macs", "")
            if "aes256" in str(ciphers).lower() or "aes256" in self.config.raw_content.lower():
                findings.append(f"SSH ciphers include AES256 ✓")
            if "sha2" in str(macs).lower() or "sha2" in self.config.raw_content.lower():
                findings.append(f"SSH MACs include SHA2 ✓")

        if failed:
            return CheckStatus.FAIL, "\n".join(findings)
        return CheckStatus.PASS, "\n".join(findings) if findings else "SSH configuration appears compliant"

    def _check_snmp(self, check_text: str, fix_text: str, title: str) -> tuple[CheckStatus, str]:
        """Check SNMP configuration."""
        findings = []
        failed = False

        # Check for SNMPv3
        if "v3" in title.lower() or "snmpv3" in title.lower():
            if self.config.snmp_v3.get("usm_configured"):
                findings.append("SNMPv3 USM is configured ✓")

                # Check authentication
                if self.config.snmp_v3.get("auth_sha"):
                    findings.append("SNMPv3 uses SHA authentication ✓")
                elif self.config.snmp_v3.get("auth_md5"):
                    findings.append("SNMPv3 uses MD5 (should use SHA)")
                    failed = True

                # Check privacy
                if self.config.snmp_v3.get("privacy_aes"):
                    findings.append("SNMPv3 uses AES privacy ✓")
                elif self.config.snmp_v3.get("privacy_des"):
                    findings.append("SNMPv3 uses DES (should use AES)")
                    failed = True
            elif "snmp v3" in self.config.raw_content.lower():
                findings.append("SNMPv3 configuration found in config")
            else:
                findings.append("SNMPv3 not configured")
                failed = True

        # Check for community strings (v1/v2c - bad)
        if self.config.snmp_communities:
            findings.append(f"WARNING: SNMP community strings found (v1/v2c): {len(self.config.snmp_communities)} communities")
            if "v3" in title.lower():
                failed = True

        if failed:
            return CheckStatus.FAIL, "\n".join(findings)
        return CheckStatus.PASS, "\n".join(findings) if findings else "SNMP configuration not detected (may be disabled)"

    def _check_ntp(self, check_text: str, fix_text: str, title: str) -> tuple[CheckStatus, str]:
        """Check NTP configuration."""
        findings = []

        ntp_servers = self.config.ntp.get("servers", [])
        if ntp_servers:
            findings.append(f"NTP servers configured: {', '.join(ntp_servers)} ✓")
        elif "ntp" in self.config.raw_content.lower() and "server" in self.config.raw_content.lower():
            findings.append("NTP server configuration found in config ✓")
        else:
            return CheckStatus.FAIL, "No NTP servers configured"

        # Check NTP authentication if mentioned
        if "authenticat" in title.lower():
            if self.config.ntp.get("authentication"):
                findings.append("NTP authentication is configured ✓")
            elif "authentication-key" in self.config.raw_content:
                findings.append("NTP authentication-key found in config ✓")
            else:
                findings.append("NTP authentication not explicitly configured")

        return CheckStatus.PASS, "\n".join(findings)

    def _check_logging(self, check_text: str, fix_text: str, title: str) -> tuple[CheckStatus, str]:
        """Check logging/syslog configuration."""
        findings = []
        failed = False

        # Check syslog hosts
        syslog_hosts = self.config.syslog.get("hosts", [])
        if syslog_hosts:
            findings.append(f"Syslog servers configured: {', '.join(syslog_hosts)} ✓")
        elif "syslog" in self.config.raw_content.lower() and "host" in self.config.raw_content.lower():
            findings.append("Syslog host configuration found in config ✓")
        else:
            findings.append("No remote syslog servers configured")
            if "centralized" in title.lower() or "remote" in title.lower():
                failed = True

        # Check security logging
        if self.config.security_log:
            findings.append("Security logging is configured ✓")
            if self.config.security_log.get("streams"):
                findings.append(f"Security log streams configured: {len(self.config.security_log.get('streams', []))} ✓")
        elif "security log" in self.config.raw_content.lower():
            findings.append("Security log configuration found in config ✓")

        # Check if policies have logging
        if "policy" in title.lower() or "firewall" in title.lower():
            if self.config.security_policies.get("actions"):
                log_actions = [a for a in self.config.security_policies["actions"] if "log" in a.lower()]
                if log_actions:
                    findings.append(f"Policy logging actions found: {len(log_actions)} ✓")
            if "then log" in self.config.raw_content:
                findings.append("Policy 'then log' statements found in config ✓")

        if failed:
            return CheckStatus.FAIL, "\n".join(findings)
        return CheckStatus.PASS, "\n".join(findings) if findings else "Logging configuration review needed"

    def _check_authentication(self, check_text: str, fix_text: str, title: str) -> tuple[CheckStatus, str]:
        """Check authentication configuration."""
        findings = []

        # Check authentication order
        if self.config.authentication_order:
            findings.append(f"Authentication order: {' '.join(self.config.authentication_order)} ✓")
        elif "authentication-order" in self.config.raw_content:
            findings.append("Authentication order configured ✓")

        # Check TACACS+
        if self.config.tacplus_servers:
            findings.append(f"TACACS+ servers: {', '.join(self.config.tacplus_servers)} ✓")
        elif "tacplus" in self.config.raw_content.lower():
            findings.append("TACACS+ configuration found ✓")

        # Check RADIUS
        if self.config.radius_servers:
            findings.append(f"RADIUS servers: {', '.join(self.config.radius_servers)} ✓")
        elif "radius" in self.config.raw_content.lower():
            findings.append("RADIUS configuration found ✓")

        if not findings:
            return CheckStatus.FAIL, "No centralized authentication configured"

        return CheckStatus.PASS, "\n".join(findings)

    def _check_security_screen(self, check_text: str, fix_text: str, title: str) -> tuple[CheckStatus, str]:
        """Check security screen (IDS) configuration."""
        findings = []

        if self.config.security_screen.get("ids_enabled"):
            findings.append("Security screen IDS option configured ✓")

        # Check for specific screen protections
        raw = self.config.raw_content.lower()
        protections = {
            "syn-flood": "SYN flood protection",
            "ping-death": "Ping of death protection",
            "land": "LAND attack protection",
            "tear-drop": "Teardrop protection",
            "spoofing": "IP spoofing protection",
            "source-route": "Source route protection",
            "winnuke": "WinNuke protection",
        }

        for pattern, name in protections.items():
            if pattern in raw:
                findings.append(f"{name} ✓")

        # Check if screens are applied to zones
        for zone_name, zone_config in self.config.security_zones.items():
            if zone_config.get("screen"):
                findings.append(f"Screen applied to zone '{zone_name}': {zone_config['screen']} ✓")

        if not findings:
            if "screen" in raw and "ids-option" in raw:
                findings.append("Security screen configuration found in config")
            else:
                return CheckStatus.FAIL, "No security screens configured"

        return CheckStatus.PASS, "\n".join(findings)

    def _check_security_policy(self, check_text: str, fix_text: str, title: str) -> tuple[CheckStatus, str]:
        """Check security policy configuration."""
        findings = []

        # Check default policy
        if self.config.security_policies.get("default_deny"):
            findings.append("Default policy: deny-all ✓")
        elif "default-policy" in self.config.raw_content and "deny-all" in self.config.raw_content:
            findings.append("Default deny-all policy found ✓")
        elif "default-policy" in self.config.raw_content and "permit-all" in self.config.raw_content:
            findings.append("WARNING: Default permit-all policy found")
            return CheckStatus.FAIL, "\n".join(findings)

        # Check for zones
        if self.config.security_zones:
            findings.append(f"Security zones configured: {', '.join(self.config.security_zones.keys())} ✓")
        elif "security-zone" in self.config.raw_content:
            findings.append("Security zones found in config ✓")

        # Check for policies between zones
        if "from-zone" in self.config.raw_content and "to-zone" in self.config.raw_content:
            findings.append("Zone-to-zone policies configured ✓")

        if not findings:
            return CheckStatus.NOT_REVIEWED, "Security policy configuration needs manual review"

        return CheckStatus.PASS, "\n".join(findings)

    def _check_session_timeout(self, check_text: str, fix_text: str, title: str) -> tuple[CheckStatus, str]:
        """Check session timeout configuration."""
        findings = []

        # Check login class idle timeout
        if "idle-timeout" in self.config.raw_content:
            match = re.search(r'idle-timeout\s+(\d+)', self.config.raw_content)
            if match:
                timeout = int(match.group(1))
                findings.append(f"Idle timeout configured: {timeout} minutes")
                if timeout <= 10:
                    findings.append("Timeout is 10 minutes or less ✓")
                else:
                    findings.append("WARNING: Timeout exceeds 10 minutes")

        # Check CLI idle timeout
        if "cli idle-timeout" in self.config.raw_content.lower():
            findings.append("CLI idle-timeout configured ✓")

        if not findings:
            return CheckStatus.FAIL, "No session timeout configuration found"

        return CheckStatus.PASS, "\n".join(findings)

    def _check_vpn(self, check_text: str, fix_text: str, title: str) -> tuple[CheckStatus, str]:
        """Check VPN/IKE/IPsec configuration."""
        findings = []
        title_lower = title.lower()

        # Check for IKE configuration
        if self.config.security_ike:
            if "aes256" in title_lower or "encryption" in title_lower:
                if "aes256" in str(self.config.security_ike).lower() or "aes-256" in self.config.raw_content.lower():
                    findings.append("IKE AES-256 encryption found ✓")

            if "diffie-hellman" in title_lower or "group" in title_lower:
                if "group14" in self.config.raw_content.lower() or "group19" in self.config.raw_content.lower() or "group20" in self.config.raw_content.lower():
                    findings.append("Strong DH group configured ✓")

            findings.append("IKE configuration found ✓")
        elif "ike" in self.config.raw_content.lower():
            findings.append("IKE configuration found in config")

        # Check for IPsec configuration
        if self.config.security_ipsec:
            findings.append("IPsec configuration found ✓")
        elif "ipsec" in self.config.raw_content.lower():
            findings.append("IPsec configuration found in config")

        if not findings:
            return CheckStatus.NOT_APPLICABLE, "VPN not configured on this device"

        return CheckStatus.PASS, "\n".join(findings)

    def _check_idp(self, check_text: str, fix_text: str, title: str) -> tuple[CheckStatus, str]:
        """Check IDP (Intrusion Detection/Prevention) configuration."""
        findings = []

        if self.config.security_idp:
            if self.config.security_idp.get("active_policy"):
                findings.append(f"IDP active policy: {self.config.security_idp['active_policy']} ✓")
            if self.config.security_idp.get("security_package"):
                findings.append("IDP security package configured ✓")
            findings.append("IDP configuration found ✓")
        elif "idp" in self.config.raw_content.lower():
            findings.append("IDP configuration found in config")
        else:
            return CheckStatus.NOT_APPLICABLE, "IDP not configured on this device"

        return CheckStatus.PASS, "\n".join(findings)

    def _check_banner(self, check_text: str, fix_text: str, title: str) -> tuple[CheckStatus, str]:
        """Check login banner configuration."""
        banner = self.config.login.get("banner", "")

        if banner:
            return CheckStatus.PASS, f"Login banner configured: '{banner[:100]}...'"
        elif "message" in self.config.raw_content and "login" in self.config.raw_content:
            return CheckStatus.PASS, "Login message/banner found in config ✓"
        else:
            return CheckStatus.FAIL, "No login banner configured"

    def _check_password_policy(self, check_text: str, fix_text: str, title: str) -> tuple[CheckStatus, str]:
        """Check password and account lockout policy."""
        findings = []

        retry_options = self.config.login.get("retry_options", {})
        if retry_options:
            findings.append("Login retry options configured ✓")
            if "lockout_period" in str(retry_options).lower() or "lockout-period" in self.config.raw_content:
                findings.append("Account lockout period configured ✓")

        if "retry-options" in self.config.raw_content:
            findings.append("Retry options found in config ✓")

        if "backoff" in self.config.raw_content.lower():
            findings.append("Login backoff configured ✓")

        if not findings:
            return CheckStatus.FAIL, "No password/lockout policy found"

        return CheckStatus.PASS, "\n".join(findings)

    def _check_by_pattern(self, check_text: str, fix_text: str, title: str) -> tuple[CheckStatus, str]:
        """Fallback: Check by extracting patterns from check/fix text."""
        findings = []

        # Extract 'show' commands from check text
        show_cmds = re.findall(r'show\s+([\w\-\s]+?)(?:\n|$|;)', check_text.lower())

        # Extract config patterns to look for
        set_patterns = re.findall(r'set\s+([\w\-\s]+?)(?:\n|$|;)', fix_text.lower())

        # Check raw content for related patterns
        for pattern in set_patterns[:5]:
            pattern_words = pattern.split()[:3]  # First 3 words
            pattern_str = r'\s+'.join(re.escape(w) for w in pattern_words)
            if re.search(pattern_str, self.config.raw_content, re.IGNORECASE):
                findings.append(f"Pattern found: {' '.join(pattern_words)}... ✓")

        if findings:
            return CheckStatus.PASS, "\n".join(findings)

        return CheckStatus.NOT_REVIEWED, "Manual review required - automated check not available for this rule"


def analyze_juniper_config(
    content: str,
    rules: list[dict],
    job_id: str,
) -> list[AuditResultCreate]:
    """Analyze a Juniper configuration against STIG rules.

    Args:
        content: Raw configuration file content
        rules: List of rule dictionaries with keys:
               vuln_id, rule_id, title, severity, check_text, fix_text
        job_id: Audit job ID

    Returns:
        List of AuditResultCreate objects
    """
    # Parse configuration
    parser = JuniperConfigParser()
    config = parser.parse(content)

    logger.info(
        "juniper_config_parsed",
        hostname=config.hostname,
        version=config.version,
        zones=len(config.security_zones),
        interfaces=len(config.interfaces),
    )

    # Evaluate rules
    evaluator = JuniperSTIGEvaluator(config)
    results = []

    for rule in rules:
        result = evaluator.evaluate_rule(
            vuln_id=rule.get("vuln_id", rule.get("rule_id", "")),
            rule_id=rule.get("rule_id", ""),
            title=rule.get("title", ""),
            severity=rule.get("severity", "medium"),
            check_text=rule.get("check_text", ""),
            fix_text=rule.get("fix_text", ""),
            job_id=job_id,
        )
        results.append(result)

    # Log summary
    passed = sum(1 for r in results if r.status == CheckStatus.PASS)
    failed = sum(1 for r in results if r.status == CheckStatus.FAIL)
    na = sum(1 for r in results if r.status == CheckStatus.NOT_APPLICABLE)
    review = sum(1 for r in results if r.status == CheckStatus.NOT_REVIEWED)

    logger.info(
        "juniper_stig_analysis_complete",
        total_rules=len(results),
        passed=passed,
        failed=failed,
        not_applicable=na,
        needs_review=review,
    )

    return results
