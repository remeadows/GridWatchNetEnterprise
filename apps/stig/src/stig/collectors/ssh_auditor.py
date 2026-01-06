"""SSH-based STIG auditor for remote device compliance checking."""

import asyncio
from typing import Any

import asyncssh

from ..core.config import settings
from ..core.logging import get_logger
from ..models import (
    Target,
    STIGDefinition,
    STIGRule,
    AuditResultCreate,
    CheckStatus,
    STIGSeverity,
    ConnectionType,
)
from ..services.vault import VaultService

logger = get_logger(__name__)


class SSHAuditor:
    """SSH-based auditor for STIG compliance checking."""

    def __init__(self) -> None:
        """Initialize SSH auditor."""
        self.vault = VaultService()
        self._connections: dict[str, asyncssh.SSHClientConnection] = {}

    async def close(self) -> None:
        """Close all connections and cleanup."""
        for conn in self._connections.values():
            conn.close()
        self._connections.clear()
        await self.vault.close()

    async def connect(self, target: Target) -> asyncssh.SSHClientConnection | None:
        """Establish SSH connection to a target.

        Args:
            target: Target to connect to

        Returns:
            SSH connection or None if failed
        """
        if target.id in self._connections:
            return self._connections[target.id]

        # Get credentials from Vault
        credentials = None
        if target.credential_id:
            credentials = await self.vault.get_ssh_credentials(target.credential_id)

        if not credentials:
            logger.warning("no_credentials_found", target_id=target.id)
            # Try with default/no auth for development
            credentials = {"username": "root", "password": ""}

        try:
            port = target.port or settings.default_ssh_port

            conn_options: dict[str, Any] = {
                "host": target.ip_address,
                "port": port,
                "username": credentials.get("username", "root"),
                "known_hosts": None,  # Skip host key verification in dev
            }

            if "password" in credentials:
                conn_options["password"] = credentials["password"]
            elif "private_key" in credentials:
                conn_options["client_keys"] = [credentials["private_key"]]

            conn = await asyncio.wait_for(
                asyncssh.connect(**conn_options),
                timeout=settings.default_ssh_timeout,
            )

            self._connections[target.id] = conn
            logger.info("ssh_connected", target_id=target.id, host=target.ip_address)
            return conn

        except asyncio.TimeoutError:
            logger.error("ssh_timeout", target_id=target.id, host=target.ip_address)
            return None
        except asyncssh.Error as e:
            logger.error(
                "ssh_connection_failed",
                target_id=target.id,
                host=target.ip_address,
                error=str(e),
            )
            return None

    async def run_command(
        self,
        target: Target,
        command: str,
        timeout: int = 30,
    ) -> tuple[str, str, int]:
        """Run a command on a target via SSH.

        Args:
            target: Target to run command on
            command: Command to execute
            timeout: Command timeout in seconds

        Returns:
            Tuple of (stdout, stderr, exit_code)
        """
        conn = await self.connect(target)
        if not conn:
            return "", "Connection failed", -1

        try:
            result = await asyncio.wait_for(
                conn.run(command, check=False),
                timeout=timeout,
            )
            return result.stdout or "", result.stderr or "", result.exit_status or 0

        except asyncio.TimeoutError:
            logger.warning(
                "command_timeout",
                target_id=target.id,
                command=command[:50],
            )
            return "", "Command timeout", -1
        except asyncssh.Error as e:
            logger.error(
                "command_failed",
                target_id=target.id,
                command=command[:50],
                error=str(e),
            )
            return "", str(e), -1

    async def audit_rule(
        self,
        target: Target,
        rule: STIGRule,
        job_id: str,
    ) -> AuditResultCreate:
        """Audit a single STIG rule on a target.

        Args:
            target: Target to audit
            rule: STIG rule to check
            job_id: ID of the audit job

        Returns:
            Audit result for this rule
        """
        # Extract check command from rule (simplified)
        check_command = self._extract_check_command(rule, target)

        if not check_command:
            return AuditResultCreate(
                job_id=job_id,
                rule_id=rule.rule_id,
                title=rule.title,
                severity=rule.severity,
                status=CheckStatus.NOT_REVIEWED,
                comments="No automated check available for this rule",
            )

        stdout, stderr, exit_code = await self.run_command(target, check_command)

        # Evaluate result
        status, finding_details = self._evaluate_result(rule, stdout, stderr, exit_code)

        return AuditResultCreate(
            job_id=job_id,
            rule_id=rule.rule_id,
            title=rule.title,
            severity=rule.severity,
            status=status,
            finding_details=finding_details,
        )

    def _extract_check_command(self, rule: STIGRule, target: Target) -> str | None:
        """Extract executable check command from STIG rule.

        This is a simplified implementation. Real STIG checks would parse
        XCCDF/OVAL content or use platform-specific check scripts.
        """
        # Common Linux checks by rule pattern
        linux_checks = {
            "FIPS": "cat /proc/sys/crypto/fips_enabled",
            "SSH": "systemctl is-active sshd",
            "firewall": "systemctl is-active firewalld",
            "SELinux": "getenforce",
            "password": "grep -E '^PASS_MAX_DAYS|^PASS_MIN_DAYS' /etc/login.defs",
            "audit": "systemctl is-active auditd",
            "rsyslog": "systemctl is-active rsyslog",
            "ntp": "systemctl is-active chronyd || systemctl is-active ntpd",
        }

        # Try to match rule title to a known check
        title_lower = rule.title.lower()
        for keyword, command in linux_checks.items():
            if keyword.lower() in title_lower:
                return command

        return None

    def _evaluate_result(
        self,
        rule: STIGRule,
        stdout: str,
        stderr: str,
        exit_code: int,
    ) -> tuple[CheckStatus, str]:
        """Evaluate command result against rule criteria.

        Returns:
            Tuple of (check_status, finding_details)
        """
        if exit_code == -1:
            return CheckStatus.ERROR, f"Command execution failed: {stderr}"

        # Simple pass/fail logic based on exit code and output
        stdout_lower = stdout.lower().strip()

        # Common success indicators
        success_patterns = ["active", "running", "enabled", "enforcing", "1"]
        failure_patterns = ["inactive", "disabled", "permissive", "0", "not found"]

        for pattern in success_patterns:
            if pattern in stdout_lower:
                return CheckStatus.PASS, f"Check passed: {stdout.strip()}"

        for pattern in failure_patterns:
            if pattern in stdout_lower:
                return (
                    CheckStatus.FAIL,
                    f"Check failed: {stdout.strip()}",
                )

        # Default based on exit code
        if exit_code == 0:
            return CheckStatus.PASS, f"Command successful: {stdout.strip()}"
        else:
            return CheckStatus.FAIL, f"Command returned non-zero: {stdout.strip()} {stderr.strip()}"

    async def audit_target(
        self,
        target: Target,
        definition: STIGDefinition,
        job_id: str,
    ) -> list[AuditResultCreate]:
        """Run all STIG checks on a target.

        Args:
            target: Target to audit
            definition: STIG definition with rules
            job_id: ID of the audit job

        Returns:
            List of audit results
        """
        results = []

        # Get rules from definition
        rules = []
        if definition.xccdf_content and "rules" in definition.xccdf_content:
            for rule_data in definition.xccdf_content["rules"]:
                rules.append(
                    STIGRule(
                        id=rule_data.get("id", ""),
                        rule_id=rule_data.get("rule_id", ""),
                        vuln_id=rule_data.get("vuln_id", ""),
                        group_id=rule_data.get("group_id", ""),
                        title=rule_data.get("title", ""),
                        description=rule_data.get("description", ""),
                        severity=STIGSeverity(rule_data.get("severity", "medium")),
                        check_content=rule_data.get("check_content", ""),
                        fix_content=rule_data.get("fix_content", ""),
                        ccis=rule_data.get("ccis", []),
                    )
                )

        if not rules:
            logger.warning("no_rules_in_definition", definition_id=definition.id)
            return results

        # Audit each rule
        for rule in rules:
            try:
                result = await self.audit_rule(target, rule, job_id)
                results.append(result)
            except Exception as e:
                logger.error(
                    "rule_audit_failed",
                    rule_id=rule.rule_id,
                    error=str(e),
                )
                results.append(
                    AuditResultCreate(
                        job_id=job_id,
                        rule_id=rule.rule_id,
                        title=rule.title,
                        severity=rule.severity,
                        status=CheckStatus.ERROR,
                        finding_details=f"Error during check: {e}",
                    )
                )

        return results


class NetmikoAuditor:
    """Netmiko-based auditor for network device compliance checking."""

    def __init__(self) -> None:
        """Initialize Netmiko auditor."""
        self.vault = VaultService()

    async def close(self) -> None:
        """Cleanup resources."""
        await self.vault.close()

    async def connect(self, target: Target) -> Any:
        """Connect to a network device using Netmiko.

        Args:
            target: Target device to connect to

        Returns:
            Netmiko connection object or None
        """
        from netmiko import ConnectHandler

        credentials = None
        if target.credential_id:
            credentials = await self.vault.get_ssh_credentials(target.credential_id)

        if not credentials:
            logger.warning("no_credentials_found", target_id=target.id)
            return None

        # Map platform to Netmiko device type
        device_type_map = {
            "cisco_ios": "cisco_ios",
            "cisco_nxos": "cisco_nxos",
            "arista_eos": "arista_eos",
            "hp_procurve": "hp_procurve",
            "juniper_srx": "juniper_junos",
        }

        device_type = device_type_map.get(target.platform.value)
        if not device_type:
            logger.error("unsupported_platform", platform=target.platform.value)
            return None

        try:
            # Netmiko is synchronous, run in thread pool
            loop = asyncio.get_event_loop()
            connection = await loop.run_in_executor(
                None,
                lambda: ConnectHandler(
                    device_type=device_type,
                    host=target.ip_address,
                    port=target.port or 22,
                    username=credentials.get("username"),
                    password=credentials.get("password"),
                    timeout=settings.default_ssh_timeout,
                ),
            )
            logger.info("netmiko_connected", target_id=target.id)
            return connection

        except Exception as e:
            logger.error(
                "netmiko_connection_failed",
                target_id=target.id,
                error=str(e),
            )
            return None

    async def run_command(self, connection: Any, command: str) -> str:
        """Run a command on a network device.

        Args:
            connection: Netmiko connection
            command: Command to execute

        Returns:
            Command output
        """
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(
            None,
            lambda: connection.send_command(command),
        )
