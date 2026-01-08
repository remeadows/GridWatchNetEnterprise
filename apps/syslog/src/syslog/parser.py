"""Syslog message parser supporting RFC 3164 and RFC 5424 formats."""

import re
from dataclasses import dataclass
from datetime import datetime
from typing import Any

# RFC 5424 severity levels
SEVERITY_NAMES = [
    "emergency",
    "alert",
    "critical",
    "error",
    "warning",
    "notice",
    "informational",
    "debug",
]

# RFC 5424 facility names
FACILITY_NAMES = [
    "kern",
    "user",
    "mail",
    "daemon",
    "auth",
    "syslog",
    "lpr",
    "news",
    "uucp",
    "cron",
    "authpriv",
    "ftp",
    "ntp",
    "audit",
    "alert",
    "clock",
    "local0",
    "local1",
    "local2",
    "local3",
    "local4",
    "local5",
    "local6",
    "local7",
]

# Device type detection patterns
DEVICE_TYPE_PATTERNS = [
    (r"(?i)cisco", "cisco"),
    (r"(?i)juniper|junos", "juniper"),
    (r"(?i)paloalto|pan-os", "paloalto"),
    (r"(?i)fortinet|fortigate", "fortinet"),
    (r"(?i)f5|bigip", "f5"),
    (r"(?i)arista", "arista"),
    (r"(?i)hp|procurve|aruba", "hp"),
    (r"(?i)mellanox", "mellanox"),
    (r"(?i)vmware|esxi|vcenter", "vmware"),
    (r"(?i)linux|ubuntu|centos|rhel|debian", "linux"),
    (r"(?i)windows|microsoft", "windows"),
    (r"(?i)pfsense", "pfsense"),
]

# Event type detection patterns
EVENT_TYPE_PATTERNS = [
    (r"(?i)login|logon|auth|ssh|session.*open", "authentication"),
    (r"(?i)logout|logoff|session.*close", "logout"),
    (r"(?i)fail|denied|reject|block", "security_alert"),
    (r"(?i)interface.*(up|down)|link.*(up|down)", "link_state"),
    (r"(?i)error|err|fail|critical", "error"),
    (r"(?i)warn|warning", "warning"),
    (r"(?i)config|configuration|change", "configuration"),
    (r"(?i)bgp|ospf|eigrp|routing", "routing"),
    (r"(?i)cpu|memory|disk|utilization", "performance"),
    (r"(?i)backup|restore|snapshot", "backup"),
    (r"(?i)firewall|acl|rule|policy", "firewall"),
    (r"(?i)certificate|ssl|tls", "certificate"),
]


@dataclass
class ParsedSyslogMessage:
    """Parsed syslog message with all fields."""

    facility: int
    severity: int
    version: int
    timestamp: datetime | None
    hostname: str | None
    app_name: str | None
    proc_id: str | None
    msg_id: str | None
    structured_data: dict[str, Any] | None
    message: str
    device_type: str | None
    event_type: str | None
    raw_message: str


def parse_priority(pri_str: str) -> tuple[int, int]:
    """Parse PRI field to facility and severity."""
    try:
        pri = int(pri_str)
        facility = pri >> 3  # Top 5 bits
        severity = pri & 0x07  # Bottom 3 bits
        return facility, severity
    except ValueError:
        return 1, 6  # Default: user facility, informational severity


def detect_device_type(message: str, hostname: str | None = None) -> str | None:
    """Detect device type from message content."""
    text = f"{hostname or ''} {message}"
    for pattern, device_type in DEVICE_TYPE_PATTERNS:
        if re.search(pattern, text):
            return device_type
    return None


def detect_event_type(message: str) -> str | None:
    """Detect event type from message content."""
    for pattern, event_type in EVENT_TYPE_PATTERNS:
        if re.search(pattern, message):
            return event_type
    return None


def parse_rfc3164(raw_message: str) -> ParsedSyslogMessage:
    """
    Parse RFC 3164 (BSD) syslog message.

    Format: <PRI>TIMESTAMP HOSTNAME TAG: MESSAGE
    Example: <34>Oct 11 22:14:15 mymachine su: 'su root' failed for lonvick
    """
    # Match: <PRI>TIMESTAMP HOSTNAME TAG: MESSAGE
    # Or: <PRI>TIMESTAMP HOSTNAME MESSAGE
    pattern = r"^<(\d{1,3})>([A-Za-z]{3}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2})\s+(\S+)\s+(.*)$"
    match = re.match(pattern, raw_message)

    if match:
        pri_str, timestamp_str, hostname, rest = match.groups()
        facility, severity = parse_priority(pri_str)

        # Parse timestamp (RFC 3164 format: Mmm dd hh:mm:ss)
        try:
            # Add current year since RFC 3164 doesn't include it
            current_year = datetime.now().year
            timestamp = datetime.strptime(f"{current_year} {timestamp_str}", "%Y %b %d %H:%M:%S")
        except ValueError:
            timestamp = None

        # Try to extract app_name and proc_id from rest
        # Format: TAG[PID]: MESSAGE or TAG: MESSAGE
        tag_match = re.match(r"^(\S+?)(?:\[(\d+)\])?:\s*(.*)$", rest)
        if tag_match:
            app_name, proc_id, message = tag_match.groups()
        else:
            app_name = None
            proc_id = None
            message = rest

        device_type = detect_device_type(message, hostname)
        event_type = detect_event_type(message)

        return ParsedSyslogMessage(
            facility=facility,
            severity=severity,
            version=0,  # RFC 3164
            timestamp=timestamp,
            hostname=hostname,
            app_name=app_name,
            proc_id=proc_id,
            msg_id=None,
            structured_data=None,
            message=message,
            device_type=device_type,
            event_type=event_type,
            raw_message=raw_message,
        )

    # Fallback: just extract PRI if present
    pri_match = re.match(r"^<(\d{1,3})>(.*)$", raw_message)
    if pri_match:
        pri_str, message = pri_match.groups()
        facility, severity = parse_priority(pri_str)
    else:
        facility, severity = 1, 6  # Default: user, informational
        message = raw_message

    return ParsedSyslogMessage(
        facility=facility,
        severity=severity,
        version=0,
        timestamp=None,
        hostname=None,
        app_name=None,
        proc_id=None,
        msg_id=None,
        structured_data=None,
        message=message,
        device_type=detect_device_type(message),
        event_type=detect_event_type(message),
        raw_message=raw_message,
    )


def parse_rfc5424(raw_message: str) -> ParsedSyslogMessage:
    """
    Parse RFC 5424 syslog message.

    Format: <PRI>VERSION TIMESTAMP HOSTNAME APP-NAME PROCID MSGID STRUCTURED-DATA MSG
    Example: <34>1 2003-10-11T22:14:15.003Z mymachine.example.com su - ID47 - 'su root' failed
    """
    # RFC 5424 pattern
    pattern = (
        r"^<(\d{1,3})>(\d+)\s+"  # PRI and VERSION
        r"(\S+)\s+"  # TIMESTAMP
        r"(\S+)\s+"  # HOSTNAME
        r"(\S+)\s+"  # APP-NAME
        r"(\S+)\s+"  # PROCID
        r"(\S+)\s+"  # MSGID
        r"(-|\[.*?\](?:\s*\[.*?\])*)\s*"  # STRUCTURED-DATA
        r"(.*)$"  # MSG
    )
    match = re.match(pattern, raw_message)

    if match:
        (
            pri_str,
            version,
            timestamp_str,
            hostname,
            app_name,
            proc_id,
            msg_id,
            sd_str,
            message,
        ) = match.groups()

        facility, severity = parse_priority(pri_str)

        # Parse timestamp (ISO 8601)
        try:
            # Handle various ISO 8601 formats
            if timestamp_str != "-":
                # Remove 'Z' and handle microseconds
                ts = timestamp_str.replace("Z", "+00:00")
                timestamp = datetime.fromisoformat(ts)
            else:
                timestamp = None
        except ValueError:
            timestamp = None

        # Handle NILVALUE ("-") for optional fields
        hostname = None if hostname == "-" else hostname
        app_name = None if app_name == "-" else app_name
        proc_id = None if proc_id == "-" else proc_id
        msg_id = None if msg_id == "-" else msg_id

        # Parse structured data
        structured_data = None
        if sd_str and sd_str != "-":
            structured_data = parse_structured_data(sd_str)

        device_type = detect_device_type(message, hostname)
        event_type = detect_event_type(message)

        return ParsedSyslogMessage(
            facility=facility,
            severity=severity,
            version=int(version),
            timestamp=timestamp,
            hostname=hostname,
            app_name=app_name,
            proc_id=proc_id,
            msg_id=msg_id,
            structured_data=structured_data,
            message=message,
            device_type=device_type,
            event_type=event_type,
            raw_message=raw_message,
        )

    # If RFC 5424 parsing fails, try RFC 3164
    return parse_rfc3164(raw_message)


def parse_structured_data(sd_str: str) -> dict[str, Any]:
    """Parse RFC 5424 structured data."""
    result: dict[str, Any] = {}

    # Match SD-ELEMENT: [SD-ID PARAM...]
    sd_pattern = r'\[(\S+?)(?:\s+(.*?))?\]'
    for match in re.finditer(sd_pattern, sd_str):
        sd_id = match.group(1)
        params_str = match.group(2) or ""

        # Parse parameters: name="value"
        params: dict[str, str] = {}
        param_pattern = r'(\S+?)="([^"]*)"'
        for param_match in re.finditer(param_pattern, params_str):
            params[param_match.group(1)] = param_match.group(2)

        result[sd_id] = params

    return result


def parse_syslog_message(raw_message: str) -> ParsedSyslogMessage:
    """
    Parse a syslog message, auto-detecting format.

    Supports both RFC 3164 (BSD) and RFC 5424 formats.
    """
    # Check for RFC 5424 (starts with <PRI>VERSION where VERSION is a digit)
    if re.match(r"^<\d{1,3}>\d\s", raw_message):
        return parse_rfc5424(raw_message)
    else:
        return parse_rfc3164(raw_message)
