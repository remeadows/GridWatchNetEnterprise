"""Configuration-based STIG compliance checker.

This service analyzes uploaded configuration files against STIG rules
to determine compliance without requiring a live connection to the device.
"""

import re
from dataclasses import dataclass
from typing import Any

from ..core.logging import get_logger
from ..collectors.config_analyzer import (
    ParsedConfig,
    ConfigFinding,
    get_parser,
    detect_platform_from_content,
)
from ..models import (
    Platform,
    STIGDefinition,
    STIGRule,
    STIGSeverity,
    AuditResultCreate,
    CheckStatus,
)
from ..library import get_library_indexer, XCCDFRule

logger = get_logger(__name__)


@dataclass
class ConfigCheckRule:
    """A rule for checking configuration compliance."""

    rule_id: str
    vuln_id: str
    title: str
    severity: STIGSeverity
    check_type: str  # "setting", "pattern", "service", "user", "ssh", "snmp", "ntp", etc.
    check_key: str | None = None
    expected_value: str | None = None
    pattern: str | None = None
    negate: bool = False  # True if the pattern should NOT be found
    description: str = ""


# Platform-specific STIG check rules
ARISTA_CHECKS: list[ConfigCheckRule] = [
    ConfigCheckRule(
        rule_id="ARST-L2-000010",
        vuln_id="V-215845",
        title="Arista MLS must enforce approved authorizations",
        severity=STIGSeverity.HIGH,
        check_type="aaa",
        check_key="enabled",
        expected_value="true",
    ),
    ConfigCheckRule(
        rule_id="ARST-L2-000020",
        vuln_id="V-215846",
        title="Arista MLS must authenticate SNMP messages using a FIPS-validated hash",
        severity=STIGSeverity.HIGH,
        check_type="snmp",
        check_key="version",
        expected_value="v3",
    ),
    ConfigCheckRule(
        rule_id="ARST-L2-000030",
        vuln_id="V-215847",
        title="Arista MLS must have STP enabled",
        severity=STIGSeverity.MEDIUM,
        check_type="pattern",
        pattern=r"spanning-tree mode",
    ),
    ConfigCheckRule(
        rule_id="ARST-L2-000040",
        vuln_id="V-215848",
        title="Arista MLS must have BPDU guard enabled",
        severity=STIGSeverity.MEDIUM,
        check_type="pattern",
        pattern=r"spanning-tree.*(bpduguard|portfast bpduguard)",
    ),
    ConfigCheckRule(
        rule_id="ARST-L2-000050",
        vuln_id="V-215849",
        title="Arista MLS must have Root Guard enabled",
        severity=STIGSeverity.MEDIUM,
        check_type="pattern",
        pattern=r"spanning-tree guard root",
    ),
    ConfigCheckRule(
        rule_id="ARST-L2-000060",
        vuln_id="V-215850",
        title="Arista MLS must not have CDP enabled on external interfaces",
        severity=STIGSeverity.LOW,
        check_type="pattern",
        pattern=r"no cdp enable|no lldp transmit",
    ),
    ConfigCheckRule(
        rule_id="ARST-ND-000010",
        vuln_id="V-215851",
        title="Arista must limit SSH sessions",
        severity=STIGSeverity.MEDIUM,
        check_type="ssh",
        check_key="enabled",
        expected_value="true",
    ),
    ConfigCheckRule(
        rule_id="ARST-ND-000020",
        vuln_id="V-215852",
        title="Arista must configure NTP",
        severity=STIGSeverity.MEDIUM,
        check_type="ntp",
        check_key="configured",
        expected_value="true",
    ),
    ConfigCheckRule(
        rule_id="ARST-ND-000030",
        vuln_id="V-215853",
        title="Arista must configure logging",
        severity=STIGSeverity.MEDIUM,
        check_type="syslog",
        check_key="configured",
        expected_value="true",
    ),
    ConfigCheckRule(
        rule_id="ARST-ND-000040",
        vuln_id="V-215854",
        title="Arista must display a login banner",
        severity=STIGSeverity.MEDIUM,
        check_type="banner",
        check_key="configured",
        expected_value="true",
    ),
]

HPE_ARUBA_CX_CHECKS: list[ConfigCheckRule] = [
    ConfigCheckRule(
        rule_id="ARBA-CX-000010",
        vuln_id="V-260001",
        title="Aruba CX must enforce AAA authentication",
        severity=STIGSeverity.HIGH,
        check_type="aaa",
        check_key="enabled",
        expected_value="true",
    ),
    ConfigCheckRule(
        rule_id="ARBA-CX-000020",
        vuln_id="V-260002",
        title="Aruba CX must use SNMPv3 with authentication",
        severity=STIGSeverity.HIGH,
        check_type="snmp",
        check_key="version",
        expected_value="v3",
    ),
    ConfigCheckRule(
        rule_id="ARBA-CX-000030",
        vuln_id="V-260003",
        title="Aruba CX must configure SSH for management",
        severity=STIGSeverity.MEDIUM,
        check_type="ssh",
        check_key="server_enabled",
        expected_value="true",
    ),
    ConfigCheckRule(
        rule_id="ARBA-CX-000040",
        vuln_id="V-260004",
        title="Aruba CX must configure NTP",
        severity=STIGSeverity.MEDIUM,
        check_type="ntp",
        check_key="configured",
        expected_value="true",
    ),
    ConfigCheckRule(
        rule_id="ARBA-CX-000050",
        vuln_id="V-260005",
        title="Aruba CX must configure remote logging",
        severity=STIGSeverity.MEDIUM,
        check_type="syslog",
        check_key="configured",
        expected_value="true",
    ),
    ConfigCheckRule(
        rule_id="ARBA-CX-000060",
        vuln_id="V-260006",
        title="Aruba CX must display a DoD-approved banner",
        severity=STIGSeverity.MEDIUM,
        check_type="banner",
        check_key="configured",
        expected_value="true",
    ),
    ConfigCheckRule(
        rule_id="ARBA-CX-000070",
        vuln_id="V-260007",
        title="Aruba CX must disable unnecessary services",
        severity=STIGSeverity.LOW,
        check_type="pattern",
        pattern=r"no telnet-server",
    ),
]

JUNIPER_CHECKS: list[ConfigCheckRule] = [
    ConfigCheckRule(
        rule_id="JUSX-AG-000010",
        vuln_id="V-251010",
        title="Juniper must authenticate NTP sources",
        severity=STIGSeverity.MEDIUM,
        check_type="ntp",
        check_key="configured",
        expected_value="true",
    ),
    ConfigCheckRule(
        rule_id="JUSX-AG-000020",
        vuln_id="V-251011",
        title="Juniper must use SSH version 2",
        severity=STIGSeverity.HIGH,
        check_type="ssh",
        check_key="protocol_version",
        expected_value="v2",
    ),
    ConfigCheckRule(
        rule_id="JUSX-AG-000030",
        vuln_id="V-251012",
        title="Juniper must disable root login",
        severity=STIGSeverity.HIGH,
        check_type="pattern",
        pattern=r"root-login\s+deny",
    ),
    ConfigCheckRule(
        rule_id="JUSX-AG-000040",
        vuln_id="V-251013",
        title="Juniper must configure system logging",
        severity=STIGSeverity.MEDIUM,
        check_type="syslog",
        check_key="configured",
        expected_value="true",
    ),
    ConfigCheckRule(
        rule_id="JUSX-AG-000050",
        vuln_id="V-251014",
        title="Juniper must protect against password brute force",
        severity=STIGSeverity.MEDIUM,
        check_type="pattern",
        pattern=r"login.*(retry|lockout)",
    ),
    ConfigCheckRule(
        rule_id="JUSX-AG-000060",
        vuln_id="V-251015",
        title="Juniper must implement replay-resistant authentication",
        severity=STIGSeverity.HIGH,
        check_type="pattern",
        pattern=r"authentication-order.*(radius|tacplus)",
    ),
]

PFSENSE_CHECKS: list[ConfigCheckRule] = [
    ConfigCheckRule(
        rule_id="PFSS-FW-000010",
        vuln_id="V-270001",
        title="pfSense must enforce access restrictions",
        severity=STIGSeverity.HIGH,
        check_type="pattern",
        pattern=r"<rule>.*<type>pass</type>.*</rule>",
    ),
    ConfigCheckRule(
        rule_id="PFSS-FW-000020",
        vuln_id="V-270002",
        title="pfSense must configure SSH securely",
        severity=STIGSeverity.HIGH,
        check_type="ssh",
        check_key="enabled",
        expected_value="true",
    ),
    ConfigCheckRule(
        rule_id="PFSS-FW-000030",
        vuln_id="V-270003",
        title="pfSense must configure NTP",
        severity=STIGSeverity.MEDIUM,
        check_type="ntp",
        check_key="configured",
        expected_value="true",
    ),
    ConfigCheckRule(
        rule_id="PFSS-FW-000040",
        vuln_id="V-270004",
        title="pfSense must configure remote syslog",
        severity=STIGSeverity.MEDIUM,
        check_type="syslog",
        check_key="configured",
        expected_value="true",
    ),
    ConfigCheckRule(
        rule_id="PFSS-FW-000050",
        vuln_id="V-270005",
        title="pfSense must use secure DNS servers",
        severity=STIGSeverity.MEDIUM,
        check_type="dns",
        check_key="configured",
        expected_value="true",
    ),
]

MELLANOX_CHECKS: list[ConfigCheckRule] = [
    ConfigCheckRule(
        rule_id="MLNX-SW-000010",
        vuln_id="V-280001",
        title="Mellanox must enable SSH server",
        severity=STIGSeverity.HIGH,
        check_type="ssh",
        check_key="server_enabled",
        expected_value="true",
    ),
    ConfigCheckRule(
        rule_id="MLNX-SW-000020",
        vuln_id="V-280002",
        title="Mellanox must configure AAA",
        severity=STIGSeverity.HIGH,
        check_type="aaa",
        check_key="enabled",
        expected_value="true",
    ),
    ConfigCheckRule(
        rule_id="MLNX-SW-000030",
        vuln_id="V-280003",
        title="Mellanox must configure NTP",
        severity=STIGSeverity.MEDIUM,
        check_type="ntp",
        check_key="configured",
        expected_value="true",
    ),
    ConfigCheckRule(
        rule_id="MLNX-SW-000040",
        vuln_id="V-280004",
        title="Mellanox must configure syslog",
        severity=STIGSeverity.MEDIUM,
        check_type="syslog",
        check_key="configured",
        expected_value="true",
    ),
]

REDHAT_CHECKS: list[ConfigCheckRule] = [
    ConfigCheckRule(
        rule_id="RHEL-09-211010",
        vuln_id="V-257777",
        title="RHEL 9 must enable FIPS mode",
        severity=STIGSeverity.HIGH,
        check_type="setting",
        check_key="fips_enabled",
        expected_value="1",
    ),
    ConfigCheckRule(
        rule_id="RHEL-09-211015",
        vuln_id="V-257778",
        title="RHEL 9 must implement DOD-approved TLS encryption",
        severity=STIGSeverity.HIGH,
        check_type="setting",
        check_key="crypto_policy",
        expected_value="FIPS",
    ),
    ConfigCheckRule(
        rule_id="RHEL-09-212010",
        vuln_id="V-257779",
        title="RHEL 9 must enforce SELinux",
        severity=STIGSeverity.HIGH,
        check_type="setting",
        check_key="SELINUX",
        expected_value="enforcing",
    ),
    ConfigCheckRule(
        rule_id="RHEL-09-411010",
        vuln_id="V-257780",
        title="RHEL 9 must set password maximum lifetime",
        severity=STIGSeverity.MEDIUM,
        check_type="setting",
        check_key="PASS_MAX_DAYS",
        expected_value="60",
        description="PASS_MAX_DAYS must be 60 or less",
    ),
    ConfigCheckRule(
        rule_id="RHEL-09-411015",
        vuln_id="V-257781",
        title="RHEL 9 must set password minimum lifetime",
        severity=STIGSeverity.MEDIUM,
        check_type="setting",
        check_key="PASS_MIN_DAYS",
        expected_value="1",
        description="PASS_MIN_DAYS must be 1 or greater",
    ),
    ConfigCheckRule(
        rule_id="RHEL-09-255010",
        vuln_id="V-257782",
        title="RHEL 9 must use SSHv2",
        severity=STIGSeverity.HIGH,
        check_type="ssh",
        check_key="Protocol",
        expected_value="2",
    ),
    ConfigCheckRule(
        rule_id="RHEL-09-255015",
        vuln_id="V-257783",
        title="RHEL 9 must disable SSH root login",
        severity=STIGSeverity.HIGH,
        check_type="ssh",
        check_key="PermitRootLogin",
        expected_value="no",
    ),
    ConfigCheckRule(
        rule_id="RHEL-09-255020",
        vuln_id="V-257784",
        title="RHEL 9 must disable SSH password authentication",
        severity=STIGSeverity.MEDIUM,
        check_type="ssh",
        check_key="PasswordAuthentication",
        expected_value="no",
    ),
]

# Map platforms to their check rules
PLATFORM_CHECKS: dict[Platform, list[ConfigCheckRule]] = {
    Platform.ARISTA_EOS: ARISTA_CHECKS,
    Platform.HPE_ARUBA_CX: HPE_ARUBA_CX_CHECKS,
    Platform.JUNIPER_JUNOS: JUNIPER_CHECKS,
    Platform.JUNIPER_SRX: JUNIPER_CHECKS,
    Platform.PFSENSE: PFSENSE_CHECKS,
    Platform.MELLANOX: MELLANOX_CHECKS,
    Platform.REDHAT: REDHAT_CHECKS,
    Platform.LINUX: REDHAT_CHECKS,
}


class ConfigComplianceChecker:
    """Service for checking configuration files against STIG rules."""

    def __init__(self) -> None:
        """Initialize the compliance checker."""
        self._xccdf_rules_cache: dict[str, list[XCCDFRule]] = {}

    async def analyze_config(
        self,
        content: str,
        platform: Platform,
        definition: STIGDefinition | None = None,
        job_id: str = "",
        benchmark_id: str | None = None,
    ) -> list[AuditResultCreate]:
        """Analyze a configuration file against STIG rules.

        Args:
            content: The configuration file content
            platform: The device platform
            definition: Optional STIG definition with custom rules
            job_id: The audit job ID
            benchmark_id: Optional STIG Library benchmark ID to use

        Returns:
            List of audit results from the analysis
        """
        results: list[AuditResultCreate] = []

        # Get parser for platform
        parser = get_parser(platform)
        if not parser:
            logger.warning("no_parser_for_platform", platform=platform.value)
            # Return a single error result
            return [
                AuditResultCreate(
                    job_id=job_id,
                    rule_id="CONFIG-PARSE-ERROR",
                    title=f"No parser available for platform: {platform.value}",
                    severity=STIGSeverity.HIGH,
                    status=CheckStatus.ERROR,
                    finding_details=f"Configuration analysis is not supported for {platform.value}",
                )
            ]

        # Parse the configuration
        try:
            config = parser.parse(content)
            logger.info(
                "config_parsed",
                platform=platform.value,
                hostname=config.hostname,
                interfaces=len(config.interfaces),
            )
        except Exception as e:
            logger.error("config_parse_failed", platform=platform.value, error=str(e))
            return [
                AuditResultCreate(
                    job_id=job_id,
                    rule_id="CONFIG-PARSE-ERROR",
                    title="Configuration parsing failed",
                    severity=STIGSeverity.HIGH,
                    status=CheckStatus.ERROR,
                    finding_details=f"Failed to parse configuration: {str(e)}",
                )
            ]

        # Get platform-specific built-in checks
        checks = PLATFORM_CHECKS.get(platform, [])

        # Run built-in checks first
        for check in checks:
            result = self._run_check(check, config, job_id)
            results.append(result)

        # If a benchmark_id is provided, load XCCDF rules from the Library
        xccdf_rules: list[XCCDFRule] = []
        if benchmark_id:
            xccdf_rules = self._get_xccdf_rules(benchmark_id)
        elif definition and definition.stig_id:
            # Try to use the definition's STIG ID as benchmark_id
            xccdf_rules = self._get_xccdf_rules(definition.stig_id)

        # Process XCCDF rules if available
        if xccdf_rules:
            xccdf_results = self._evaluate_xccdf_rules(xccdf_rules, config, job_id)
            results.extend(xccdf_results)

        logger.info(
            "config_analysis_complete",
            platform=platform.value,
            total_checks=len(results),
            passed=sum(1 for r in results if r.status == CheckStatus.PASS),
            failed=sum(1 for r in results if r.status == CheckStatus.FAIL),
            xccdf_rules_used=len(xccdf_rules),
        )

        return results

    def _get_xccdf_rules(self, benchmark_id: str) -> list[XCCDFRule]:
        """Get XCCDF rules from the library.

        Args:
            benchmark_id: The STIG benchmark ID

        Returns:
            List of XCCDF rules
        """
        # Check cache first
        if benchmark_id in self._xccdf_rules_cache:
            return self._xccdf_rules_cache[benchmark_id]

        indexer = get_library_indexer()
        if not indexer:
            logger.warning("stig_library_not_initialized")
            return []

        rules = indexer.get_rules(benchmark_id)
        if rules:
            self._xccdf_rules_cache[benchmark_id] = rules
            logger.info(
                "xccdf_rules_loaded",
                benchmark_id=benchmark_id,
                rules_count=len(rules),
            )

        return rules

    def _evaluate_xccdf_rules(
        self,
        rules: list[XCCDFRule],
        config: ParsedConfig,
        job_id: str,
    ) -> list[AuditResultCreate]:
        """Evaluate XCCDF rules against parsed configuration.

        This performs a best-effort check by analyzing the check_content
        field for commands and patterns that can be matched against the
        parsed configuration.

        Args:
            rules: List of XCCDF rules
            config: Parsed configuration
            job_id: The audit job ID

        Returns:
            List of audit results
        """
        results: list[AuditResultCreate] = []

        for rule in rules:
            result = self._evaluate_single_xccdf_rule(rule, config, job_id)
            results.append(result)

        return results

    def _evaluate_single_xccdf_rule(
        self,
        rule: XCCDFRule,
        config: ParsedConfig,
        job_id: str,
    ) -> AuditResultCreate:
        """Evaluate a single XCCDF rule against configuration.

        Uses heuristics to extract checkable patterns from the rule's
        check_content field.

        Args:
            rule: XCCDF rule
            config: Parsed configuration
            job_id: Audit job ID

        Returns:
            Audit result for this rule
        """
        severity_map = {
            "high": STIGSeverity.HIGH,
            "medium": STIGSeverity.MEDIUM,
            "low": STIGSeverity.LOW,
        }
        severity = severity_map.get(rule.severity.lower(), STIGSeverity.MEDIUM)

        # Extract patterns and commands from check_content
        check_content = rule.check_content.lower()

        status = CheckStatus.NOT_REVIEWED
        finding_details = ""

        # Try to match common check patterns
        try:
            # Look for specific setting patterns in check content
            patterns_to_check: list[tuple[str, str]] = []

            # SSH-related checks
            if "sshd" in check_content or "ssh" in rule.title.lower():
                ssh_patterns = self._extract_ssh_checks(rule.check_content)
                for key, expected in ssh_patterns:
                    actual = config.ssh_config.get(key)
                    if actual is not None:
                        if str(actual).lower() == expected.lower():
                            status = CheckStatus.PASS
                            finding_details = f"SSH setting '{key}' is '{actual}' (expected: {expected})"
                        else:
                            status = CheckStatus.FAIL
                            finding_details = f"SSH setting '{key}' is '{actual}' (expected: {expected})"
                        break

            # NTP checks
            elif "ntp" in check_content or "time" in rule.title.lower():
                if config.ntp_servers:
                    status = CheckStatus.PASS
                    finding_details = f"NTP configured: {', '.join(config.ntp_servers)}"
                else:
                    status = CheckStatus.FAIL
                    finding_details = "NTP not configured"

            # Syslog/logging checks
            elif "syslog" in check_content or "log" in rule.title.lower():
                if config.syslog_servers:
                    status = CheckStatus.PASS
                    finding_details = f"Syslog configured: {', '.join(config.syslog_servers)}"
                else:
                    status = CheckStatus.FAIL
                    finding_details = "Remote logging not configured"

            # SNMP checks
            elif "snmp" in check_content:
                if config.snmp_config:
                    if "v3" in check_content.lower():
                        if config.snmp_config.get("version") == "3" or "v3" in str(config.snmp_config).lower():
                            status = CheckStatus.PASS
                            finding_details = "SNMPv3 is configured"
                        else:
                            status = CheckStatus.FAIL
                            finding_details = "SNMPv3 is not configured"
                    else:
                        status = CheckStatus.PASS
                        finding_details = f"SNMP configured: {config.snmp_config}"
                else:
                    status = CheckStatus.NOT_REVIEWED
                    finding_details = "SNMP configuration not detected"

            # AAA/Authentication checks
            elif "aaa" in check_content or "authentication" in rule.title.lower():
                if config.aaa_config:
                    status = CheckStatus.PASS
                    finding_details = f"AAA configured: {config.aaa_config}"
                else:
                    status = CheckStatus.FAIL
                    finding_details = "AAA not configured"

            # Banner checks
            elif "banner" in check_content:
                if config.banner:
                    status = CheckStatus.PASS
                    finding_details = f"Banner configured ({len(config.banner)} chars)"
                else:
                    status = CheckStatus.FAIL
                    finding_details = "No login banner configured"

            # Generic pattern search in raw config
            else:
                # Extract quoted strings or regex patterns from check_content
                generic_patterns = self._extract_config_patterns(rule.check_content)
                for pattern in generic_patterns:
                    try:
                        if re.search(pattern, config.raw_content, re.IGNORECASE):
                            status = CheckStatus.PASS
                            finding_details = f"Pattern found: {pattern[:50]}"
                            break
                    except re.error:
                        continue

                if status == CheckStatus.NOT_REVIEWED:
                    finding_details = "Manual review required - unable to automatically check this rule"

        except Exception as e:
            status = CheckStatus.ERROR
            finding_details = f"Error evaluating rule: {str(e)}"

        return AuditResultCreate(
            job_id=job_id,
            rule_id=rule.vuln_id,
            title=rule.title,
            severity=severity,
            status=status,
            finding_details=finding_details,
        )

    def _extract_ssh_checks(self, check_content: str) -> list[tuple[str, str]]:
        """Extract SSH setting checks from XCCDF check content.

        Args:
            check_content: The check content text

        Returns:
            List of (setting_name, expected_value) tuples
        """
        patterns = []

        # Common SSH settings and their expected values
        ssh_settings = {
            "PermitRootLogin": r"PermitRootLogin\s+(no|yes)",
            "Protocol": r"Protocol\s+(\d)",
            "PasswordAuthentication": r"PasswordAuthentication\s+(no|yes)",
            "PermitEmptyPasswords": r"PermitEmptyPasswords\s+(no|yes)",
            "X11Forwarding": r"X11Forwarding\s+(no|yes)",
            "ClientAliveInterval": r"ClientAliveInterval\s+(\d+)",
            "ClientAliveCountMax": r"ClientAliveCountMax\s+(\d+)",
            "MaxAuthTries": r"MaxAuthTries\s+(\d+)",
            "Ciphers": r"Ciphers\s+([\w,@-]+)",
            "MACs": r"MACs\s+([\w,@-]+)",
        }

        for setting, pattern in ssh_settings.items():
            match = re.search(pattern, check_content, re.IGNORECASE)
            if match:
                patterns.append((setting, match.group(1)))

        return patterns

    def _extract_config_patterns(self, check_content: str) -> list[str]:
        """Extract configuration patterns from check content.

        Args:
            check_content: The check content text

        Returns:
            List of regex patterns to search for
        """
        patterns = []

        # Look for quoted strings that might be config commands
        quoted = re.findall(r'"([^"]+)"', check_content)
        for q in quoted:
            if len(q) > 5 and not q.startswith("http"):
                patterns.append(re.escape(q))

        # Look for command patterns like "show running-config | grep"
        commands = re.findall(r'grep\s+"([^"]+)"', check_content)
        patterns.extend(commands)

        return patterns[:5]  # Limit to avoid too many pattern matches

    def _run_check(
        self, check: ConfigCheckRule, config: ParsedConfig, job_id: str
    ) -> AuditResultCreate:
        """Run a single compliance check against the configuration.

        Args:
            check: The check rule to apply
            config: The parsed configuration
            job_id: The audit job ID

        Returns:
            Audit result for this check
        """
        status = CheckStatus.NOT_REVIEWED
        finding_details = ""

        try:
            if check.check_type == "setting":
                status, finding_details = self._check_setting(check, config)
            elif check.check_type == "pattern":
                status, finding_details = self._check_pattern(check, config)
            elif check.check_type == "ssh":
                status, finding_details = self._check_ssh(check, config)
            elif check.check_type == "ntp":
                status, finding_details = self._check_ntp(check, config)
            elif check.check_type == "syslog":
                status, finding_details = self._check_syslog(check, config)
            elif check.check_type == "snmp":
                status, finding_details = self._check_snmp(check, config)
            elif check.check_type == "aaa":
                status, finding_details = self._check_aaa(check, config)
            elif check.check_type == "banner":
                status, finding_details = self._check_banner(check, config)
            elif check.check_type == "dns":
                status, finding_details = self._check_dns(check, config)
            else:
                status = CheckStatus.NOT_REVIEWED
                finding_details = f"Unknown check type: {check.check_type}"

        except Exception as e:
            status = CheckStatus.ERROR
            finding_details = f"Error during check: {str(e)}"

        return AuditResultCreate(
            job_id=job_id,
            rule_id=check.rule_id,
            title=check.title,
            severity=check.severity,
            status=status,
            finding_details=finding_details,
        )

    def _check_setting(
        self, check: ConfigCheckRule, config: ParsedConfig
    ) -> tuple[CheckStatus, str]:
        """Check a configuration setting value."""
        if not check.check_key:
            return CheckStatus.ERROR, "No check key specified"

        actual_value = config.settings.get(check.check_key)

        if actual_value is None:
            return CheckStatus.FAIL, f"Setting '{check.check_key}' not found in configuration"

        if check.expected_value:
            # Handle numeric comparisons for settings like PASS_MAX_DAYS
            if check.check_key == "PASS_MAX_DAYS":
                try:
                    if int(actual_value) <= int(check.expected_value):
                        return CheckStatus.PASS, f"PASS_MAX_DAYS is {actual_value} (expected <= {check.expected_value})"
                    else:
                        return CheckStatus.FAIL, f"PASS_MAX_DAYS is {actual_value} (expected <= {check.expected_value})"
                except ValueError:
                    return CheckStatus.ERROR, f"Invalid numeric value: {actual_value}"

            elif check.check_key == "PASS_MIN_DAYS":
                try:
                    if int(actual_value) >= int(check.expected_value):
                        return CheckStatus.PASS, f"PASS_MIN_DAYS is {actual_value} (expected >= {check.expected_value})"
                    else:
                        return CheckStatus.FAIL, f"PASS_MIN_DAYS is {actual_value} (expected >= {check.expected_value})"
                except ValueError:
                    return CheckStatus.ERROR, f"Invalid numeric value: {actual_value}"

            # Standard string comparison
            if str(actual_value).lower() == str(check.expected_value).lower():
                return CheckStatus.PASS, f"Setting '{check.check_key}' is '{actual_value}' (expected: {check.expected_value})"
            else:
                return CheckStatus.FAIL, f"Setting '{check.check_key}' is '{actual_value}' (expected: {check.expected_value})"

        return CheckStatus.PASS, f"Setting '{check.check_key}' is present: {actual_value}"

    def _check_pattern(
        self, check: ConfigCheckRule, config: ParsedConfig
    ) -> tuple[CheckStatus, str]:
        """Check for a pattern in the raw configuration."""
        if not check.pattern:
            return CheckStatus.ERROR, "No pattern specified"

        try:
            pattern = re.compile(check.pattern, re.IGNORECASE | re.MULTILINE)
            match = pattern.search(config.raw_content)

            if check.negate:
                if match:
                    return CheckStatus.FAIL, f"Pattern '{check.pattern}' found (should NOT be present)"
                else:
                    return CheckStatus.PASS, f"Pattern '{check.pattern}' not found (as expected)"
            else:
                if match:
                    return CheckStatus.PASS, f"Pattern '{check.pattern}' found: {match.group()}"
                else:
                    return CheckStatus.FAIL, f"Pattern '{check.pattern}' not found in configuration"

        except re.error as e:
            return CheckStatus.ERROR, f"Invalid regex pattern: {str(e)}"

    def _check_ssh(
        self, check: ConfigCheckRule, config: ParsedConfig
    ) -> tuple[CheckStatus, str]:
        """Check SSH configuration."""
        if not check.check_key:
            return CheckStatus.ERROR, "No check key specified for SSH check"

        ssh_config = config.ssh_config

        if check.check_key == "enabled":
            if ssh_config.get("enabled") or ssh_config.get("server_enabled"):
                return CheckStatus.PASS, "SSH is enabled"
            else:
                return CheckStatus.FAIL, "SSH is not enabled"

        elif check.check_key == "server_enabled":
            if ssh_config.get("server_enabled"):
                return CheckStatus.PASS, "SSH server is enabled"
            else:
                return CheckStatus.FAIL, "SSH server is not enabled"

        else:
            actual_value = ssh_config.get(check.check_key)
            if actual_value is None:
                return CheckStatus.FAIL, f"SSH setting '{check.check_key}' not configured"

            if check.expected_value:
                if str(actual_value).lower() == str(check.expected_value).lower():
                    return CheckStatus.PASS, f"SSH {check.check_key} is '{actual_value}'"
                else:
                    return CheckStatus.FAIL, f"SSH {check.check_key} is '{actual_value}' (expected: {check.expected_value})"

            return CheckStatus.PASS, f"SSH {check.check_key} is configured: {actual_value}"

    def _check_ntp(
        self, check: ConfigCheckRule, config: ParsedConfig
    ) -> tuple[CheckStatus, str]:
        """Check NTP configuration."""
        if config.ntp_servers:
            return CheckStatus.PASS, f"NTP configured with servers: {', '.join(config.ntp_servers)}"
        else:
            return CheckStatus.FAIL, "No NTP servers configured"

    def _check_syslog(
        self, check: ConfigCheckRule, config: ParsedConfig
    ) -> tuple[CheckStatus, str]:
        """Check syslog configuration."""
        if config.syslog_servers:
            return CheckStatus.PASS, f"Syslog configured with servers: {', '.join(config.syslog_servers)}"
        else:
            return CheckStatus.FAIL, "No syslog servers configured"

    def _check_snmp(
        self, check: ConfigCheckRule, config: ParsedConfig
    ) -> tuple[CheckStatus, str]:
        """Check SNMP configuration."""
        snmp = config.snmp_config

        if not snmp:
            return CheckStatus.FAIL, "SNMP is not configured"

        if check.check_key == "version" and check.expected_value == "v3":
            # Check for SNMPv3 indicators
            if "v3" in str(snmp).lower() or snmp.get("version") == "3":
                return CheckStatus.PASS, "SNMPv3 is configured"
            else:
                communities = snmp.get("communities", [])
                if communities:
                    return CheckStatus.FAIL, f"Using SNMP community strings (v1/v2c): {communities}. SNMPv3 required."
                return CheckStatus.FAIL, "SNMPv3 not detected"

        return CheckStatus.PASS, f"SNMP is configured: {snmp}"

    def _check_aaa(
        self, check: ConfigCheckRule, config: ParsedConfig
    ) -> tuple[CheckStatus, str]:
        """Check AAA configuration."""
        aaa = config.aaa_config

        if aaa.get("enabled"):
            return CheckStatus.PASS, f"AAA is enabled: {aaa}"
        elif aaa:
            return CheckStatus.PASS, f"AAA configuration found: {aaa}"
        else:
            return CheckStatus.FAIL, "AAA is not configured"

    def _check_banner(
        self, check: ConfigCheckRule, config: ParsedConfig
    ) -> tuple[CheckStatus, str]:
        """Check login banner configuration."""
        if config.banner:
            return CheckStatus.PASS, f"Login banner configured: {config.banner[:100]}..."
        else:
            return CheckStatus.FAIL, "No login banner configured"

    def _check_dns(
        self, check: ConfigCheckRule, config: ParsedConfig
    ) -> tuple[CheckStatus, str]:
        """Check DNS configuration."""
        if config.dns_servers:
            return CheckStatus.PASS, f"DNS configured with servers: {', '.join(config.dns_servers)}"
        else:
            return CheckStatus.FAIL, "No DNS servers configured"


# Singleton instance
config_checker = ConfigComplianceChecker()
