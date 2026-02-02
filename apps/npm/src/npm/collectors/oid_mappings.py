"""Vendor-specific SNMP OID mappings for NPM device monitoring.

This module defines SNMP OIDs for various network equipment vendors.
OIDs are organized by vendor and metric category.

Supported vendors:
- Arista Networks (switches)
- HPE Aruba (wireless controllers)
- HPE Aruba CX (wired switches - 6xxx, 8xxx series)
- Juniper Networks (routers, switches)
- Mellanox/NVIDIA (high-performance switches)
- pfSense (FreeBSD-based firewalls)
- Sophos (XG/SFOS firewalls)
- Linux/Red Hat Enterprise Linux (servers)
- Windows (servers)

Standard MIBs supported:
- SNMPv2-MIB (RFC 3418) - System Information
- IF-MIB (RFC 2863) - Interface Statistics
- HOST-RESOURCES-MIB (RFC 2790) - CPU, Memory, Disk
- ENTITY-MIB (RFC 4133) - Physical Entity Info
- ENTITY-SENSOR-MIB (RFC 3433) - Sensors
- UCD-SNMP-MIB - Linux/BSD system stats
- TCP-MIB - TCP statistics

MIB files are stored in: infrastructure/mibs/
"""

from dataclasses import dataclass
from enum import Enum
from typing import Any


class VendorType(str, Enum):
    """Supported network equipment vendors."""
    GENERIC = "generic"
    ARISTA = "arista"
    ARUBA = "aruba"
    HPE_ARUBA_CX = "hpe_aruba_cx"
    JUNIPER = "juniper"
    MELLANOX = "mellanox"
    PFSENSE = "pfsense"
    SOPHOS = "sophos"
    REDHAT = "redhat"
    LINUX = "linux"
    WINDOWS = "windows"


@dataclass
class OIDDefinition:
    """Definition for a single SNMP OID."""
    oid: str
    name: str
    description: str
    data_type: str  # integer, string, counter32, counter64, gauge32, timeticks
    unit: str | None = None  # bytes, percent, seconds, etc.
    scale: float = 1.0  # multiplier for unit conversion


# =============================================================================
# Standard RFC MIBs (all vendors)
# =============================================================================

STANDARD_OIDS = {
    # SNMPv2-MIB (RFC 3418) - System Information
    "system": {
        "sysDescr": OIDDefinition("1.3.6.1.2.1.1.1.0", "sysDescr", "System description", "string"),
        "sysObjectID": OIDDefinition("1.3.6.1.2.1.1.2.0", "sysObjectID", "System object ID", "oid"),
        "sysUpTime": OIDDefinition("1.3.6.1.2.1.1.3.0", "sysUpTime", "System uptime", "timeticks", "centiseconds"),
        "sysContact": OIDDefinition("1.3.6.1.2.1.1.4.0", "sysContact", "System contact", "string"),
        "sysName": OIDDefinition("1.3.6.1.2.1.1.5.0", "sysName", "System name", "string"),
        "sysLocation": OIDDefinition("1.3.6.1.2.1.1.6.0", "sysLocation", "System location", "string"),
    },
    # IF-MIB (RFC 2863) - Interface Statistics
    "interfaces": {
        "ifNumber": OIDDefinition("1.3.6.1.2.1.2.1.0", "ifNumber", "Number of interfaces", "integer"),
        "ifDescr": OIDDefinition("1.3.6.1.2.1.2.2.1.2", "ifDescr", "Interface description", "string"),
        "ifType": OIDDefinition("1.3.6.1.2.1.2.2.1.3", "ifType", "Interface type", "integer"),
        "ifMtu": OIDDefinition("1.3.6.1.2.1.2.2.1.4", "ifMtu", "Interface MTU", "integer", "bytes"),
        "ifSpeed": OIDDefinition("1.3.6.1.2.1.2.2.1.5", "ifSpeed", "Interface speed", "gauge32", "bps"),
        "ifPhysAddress": OIDDefinition("1.3.6.1.2.1.2.2.1.6", "ifPhysAddress", "MAC address", "string"),
        "ifAdminStatus": OIDDefinition("1.3.6.1.2.1.2.2.1.7", "ifAdminStatus", "Admin status", "integer"),
        "ifOperStatus": OIDDefinition("1.3.6.1.2.1.2.2.1.8", "ifOperStatus", "Oper status", "integer"),
        "ifInOctets": OIDDefinition("1.3.6.1.2.1.2.2.1.10", "ifInOctets", "Inbound octets", "counter32", "bytes"),
        "ifInUcastPkts": OIDDefinition("1.3.6.1.2.1.2.2.1.11", "ifInUcastPkts", "Inbound unicast packets", "counter32"),
        "ifInDiscards": OIDDefinition("1.3.6.1.2.1.2.2.1.13", "ifInDiscards", "Inbound discards", "counter32"),
        "ifInErrors": OIDDefinition("1.3.6.1.2.1.2.2.1.14", "ifInErrors", "Inbound errors", "counter32"),
        "ifOutOctets": OIDDefinition("1.3.6.1.2.1.2.2.1.16", "ifOutOctets", "Outbound octets", "counter32", "bytes"),
        "ifOutUcastPkts": OIDDefinition("1.3.6.1.2.1.2.2.1.17", "ifOutUcastPkts", "Outbound unicast packets", "counter32"),
        "ifOutDiscards": OIDDefinition("1.3.6.1.2.1.2.2.1.19", "ifOutDiscards", "Outbound discards", "counter32"),
        "ifOutErrors": OIDDefinition("1.3.6.1.2.1.2.2.1.20", "ifOutErrors", "Outbound errors", "counter32"),
    },
    # IF-MIB ifXTable - 64-bit counters (high-speed interfaces)
    "interfaces_hc": {
        "ifName": OIDDefinition("1.3.6.1.2.1.31.1.1.1.1", "ifName", "Interface name", "string"),
        "ifHCInOctets": OIDDefinition("1.3.6.1.2.1.31.1.1.1.6", "ifHCInOctets", "Inbound octets (64-bit)", "counter64", "bytes"),
        "ifHCInUcastPkts": OIDDefinition("1.3.6.1.2.1.31.1.1.1.7", "ifHCInUcastPkts", "Inbound unicast (64-bit)", "counter64"),
        "ifHCOutOctets": OIDDefinition("1.3.6.1.2.1.31.1.1.1.10", "ifHCOutOctets", "Outbound octets (64-bit)", "counter64", "bytes"),
        "ifHCOutUcastPkts": OIDDefinition("1.3.6.1.2.1.31.1.1.1.11", "ifHCOutUcastPkts", "Outbound unicast (64-bit)", "counter64"),
        "ifHighSpeed": OIDDefinition("1.3.6.1.2.1.31.1.1.1.15", "ifHighSpeed", "Interface speed (Mbps)", "gauge32", "mbps"),
        "ifAlias": OIDDefinition("1.3.6.1.2.1.31.1.1.1.18", "ifAlias", "Interface alias", "string"),
    },
    # HOST-RESOURCES-MIB (RFC 2790)
    "host_resources": {
        "hrSystemUptime": OIDDefinition("1.3.6.1.2.1.25.1.1.0", "hrSystemUptime", "Host uptime", "timeticks", "centiseconds"),
        "hrSystemNumUsers": OIDDefinition("1.3.6.1.2.1.25.1.5.0", "hrSystemNumUsers", "Number of users", "gauge32"),
        "hrSystemProcesses": OIDDefinition("1.3.6.1.2.1.25.1.6.0", "hrSystemProcesses", "Number of processes", "gauge32"),
        "hrMemorySize": OIDDefinition("1.3.6.1.2.1.25.2.2.0", "hrMemorySize", "Total memory (KB)", "integer", "kilobytes"),
        "hrStorageDescr": OIDDefinition("1.3.6.1.2.1.25.2.3.1.3", "hrStorageDescr", "Storage description", "string"),
        "hrStorageAllocationUnits": OIDDefinition("1.3.6.1.2.1.25.2.3.1.4", "hrStorageAllocationUnits", "Allocation unit size", "integer", "bytes"),
        "hrStorageSize": OIDDefinition("1.3.6.1.2.1.25.2.3.1.5", "hrStorageSize", "Storage size (units)", "integer"),
        "hrStorageUsed": OIDDefinition("1.3.6.1.2.1.25.2.3.1.6", "hrStorageUsed", "Storage used (units)", "integer"),
        "hrProcessorLoad": OIDDefinition("1.3.6.1.2.1.25.3.3.1.2", "hrProcessorLoad", "Processor load (%)", "integer", "percent"),
    },
    # ENTITY-MIB (RFC 4133)
    "entity": {
        "entPhysicalDescr": OIDDefinition("1.3.6.1.2.1.47.1.1.1.1.2", "entPhysicalDescr", "Physical description", "string"),
        "entPhysicalVendorType": OIDDefinition("1.3.6.1.2.1.47.1.1.1.1.3", "entPhysicalVendorType", "Vendor type", "oid"),
        "entPhysicalName": OIDDefinition("1.3.6.1.2.1.47.1.1.1.1.7", "entPhysicalName", "Physical name", "string"),
        "entPhysicalSerialNum": OIDDefinition("1.3.6.1.2.1.47.1.1.1.1.11", "entPhysicalSerialNum", "Serial number", "string"),
        "entPhysicalModelName": OIDDefinition("1.3.6.1.2.1.47.1.1.1.1.13", "entPhysicalModelName", "Model name", "string"),
    },
    # ENTITY-SENSOR-MIB (RFC 3433)
    "entity_sensors": {
        "entPhySensorType": OIDDefinition("1.3.6.1.2.1.99.1.1.1.1", "entPhySensorType", "Sensor type", "integer"),
        "entPhySensorScale": OIDDefinition("1.3.6.1.2.1.99.1.1.1.2", "entPhySensorScale", "Sensor scale", "integer"),
        "entPhySensorPrecision": OIDDefinition("1.3.6.1.2.1.99.1.1.1.3", "entPhySensorPrecision", "Sensor precision", "integer"),
        "entPhySensorValue": OIDDefinition("1.3.6.1.2.1.99.1.1.1.4", "entPhySensorValue", "Sensor value", "integer"),
        "entPhySensorOperStatus": OIDDefinition("1.3.6.1.2.1.99.1.1.1.5", "entPhySensorOperStatus", "Sensor status", "integer"),
    },
}


# =============================================================================
# Arista Networks (Enterprise OID: 1.3.6.1.4.1.30065)
# =============================================================================

ARISTA_OIDS = {
    "system": {
        "aristaSwConfig": OIDDefinition("1.3.6.1.4.1.30065.3.1.1", "aristaSwConfig", "Software config", "string"),
    },
    "environment": {
        # ARISTA-ENTITY-SENSOR-MIB
        "aristaEntSensorThresholdLowWarning": OIDDefinition("1.3.6.1.4.1.30065.3.12.1.1.1.1", "aristaEntSensorThresholdLowWarning", "Low warning threshold", "integer"),
        "aristaEntSensorThresholdLowCritical": OIDDefinition("1.3.6.1.4.1.30065.3.12.1.1.1.2", "aristaEntSensorThresholdLowCritical", "Low critical threshold", "integer"),
        "aristaEntSensorThresholdHighWarning": OIDDefinition("1.3.6.1.4.1.30065.3.12.1.1.1.3", "aristaEntSensorThresholdHighWarning", "High warning threshold", "integer"),
        "aristaEntSensorThresholdHighCritical": OIDDefinition("1.3.6.1.4.1.30065.3.12.1.1.1.4", "aristaEntSensorThresholdHighCritical", "High critical threshold", "integer"),
    },
    "interfaces": {
        # ARISTA-IF-MIB
        "aristaIfCounterLastUpdated": OIDDefinition("1.3.6.1.4.1.30065.3.15.1.1.1", "aristaIfCounterLastUpdated", "Counter last updated", "timeticks"),
    },
    "bgp": {
        # ARISTA-BGP4V2-MIB
        "aristaBgp4V2PeerState": OIDDefinition("1.3.6.1.4.1.30065.4.1.1.2.1.13", "aristaBgp4V2PeerState", "BGP peer state", "integer"),
        "aristaBgp4V2PeerAdminStatus": OIDDefinition("1.3.6.1.4.1.30065.4.1.1.2.1.2", "aristaBgp4V2PeerAdminStatus", "BGP peer admin status", "integer"),
    },
}


# =============================================================================
# HPE Aruba Networks (Enterprise OID: 1.3.6.1.4.1.14823)
# =============================================================================

ARUBA_OIDS = {
    "system": {
        # WLSX-SYSTEMEXT-MIB
        "wlsxSysExtSwitchIp": OIDDefinition("1.3.6.1.4.1.14823.2.2.1.1.1.1.0", "wlsxSysExtSwitchIp", "Switch IP address", "ipaddress"),
        "wlsxSysExtSwitchRole": OIDDefinition("1.3.6.1.4.1.14823.2.2.1.1.1.2.0", "wlsxSysExtSwitchRole", "Switch role", "integer"),
    },
    "cpu_memory": {
        "wlsxSysExtCpuUsedPercent": OIDDefinition("1.3.6.1.4.1.14823.2.2.1.1.1.9.0", "wlsxSysExtCpuUsedPercent", "CPU utilization", "integer", "percent"),
        "wlsxSysExtMemoryUsedPercent": OIDDefinition("1.3.6.1.4.1.14823.2.2.1.1.1.11.0", "wlsxSysExtMemoryUsedPercent", "Memory utilization", "integer", "percent"),
        "wlsxSysExtStorageUsedPercent": OIDDefinition("1.3.6.1.4.1.14823.2.2.1.1.1.13.0", "wlsxSysExtStorageUsedPercent", "Storage utilization", "integer", "percent"),
    },
    "wireless": {
        # WLSX-WLAN-MIB
        "wlsxWlanTotalNumAccessPoints": OIDDefinition("1.3.6.1.4.1.14823.2.2.1.5.1.1.0", "wlsxWlanTotalNumAccessPoints", "Total APs", "integer"),
        "wlsxWlanTotalNumStationsAssociated": OIDDefinition("1.3.6.1.4.1.14823.2.2.1.5.1.2.0", "wlsxWlanTotalNumStationsAssociated", "Associated stations", "integer"),
    },
    "switch": {
        # WLSX-SWITCH-MIB
        "wlsxSwitchTotalNumPorts": OIDDefinition("1.3.6.1.4.1.14823.2.2.1.2.1.1.0", "wlsxSwitchTotalNumPorts", "Total ports", "integer"),
        "wlsxSwitchTotalNumActivePorts": OIDDefinition("1.3.6.1.4.1.14823.2.2.1.2.1.2.0", "wlsxSwitchTotalNumActivePorts", "Active ports", "integer"),
    },
}


# =============================================================================
# Juniper Networks (Enterprise OID: 1.3.6.1.4.1.2636)
# =============================================================================

JUNIPER_OIDS = {
    "system": {
        # JUNIPER-MIB
        "jnxBoxDescr": OIDDefinition("1.3.6.1.4.1.2636.3.1.2.0", "jnxBoxDescr", "Box description", "string"),
        "jnxBoxSerialNo": OIDDefinition("1.3.6.1.4.1.2636.3.1.3.0", "jnxBoxSerialNo", "Serial number", "string"),
        "jnxBoxRevision": OIDDefinition("1.3.6.1.4.1.2636.3.1.4.0", "jnxBoxRevision", "Revision", "string"),
    },
    "chassis": {
        # JUNIPER-MIB jnxContentsTable
        "jnxContentsDescr": OIDDefinition("1.3.6.1.4.1.2636.3.1.8.1.6", "jnxContentsDescr", "Contents description", "string"),
        "jnxContentsSerialNo": OIDDefinition("1.3.6.1.4.1.2636.3.1.8.1.7", "jnxContentsSerialNo", "Contents serial", "string"),
        "jnxContentsRevision": OIDDefinition("1.3.6.1.4.1.2636.3.1.8.1.8", "jnxContentsRevision", "Contents revision", "string"),
    },
    "environment": {
        # JUNIPER-MIB jnxOperatingTable
        "jnxOperatingDescr": OIDDefinition("1.3.6.1.4.1.2636.3.1.13.1.5", "jnxOperatingDescr", "Operating description", "string"),
        "jnxOperatingState": OIDDefinition("1.3.6.1.4.1.2636.3.1.13.1.6", "jnxOperatingState", "Operating state", "integer"),
        "jnxOperatingTemp": OIDDefinition("1.3.6.1.4.1.2636.3.1.13.1.7", "jnxOperatingTemp", "Temperature", "integer", "celsius"),
        "jnxOperatingCPU": OIDDefinition("1.3.6.1.4.1.2636.3.1.13.1.8", "jnxOperatingCPU", "CPU utilization", "integer", "percent"),
        "jnxOperatingISR": OIDDefinition("1.3.6.1.4.1.2636.3.1.13.1.9", "jnxOperatingISR", "ISR utilization", "integer", "percent"),
        "jnxOperatingBuffer": OIDDefinition("1.3.6.1.4.1.2636.3.1.13.1.11", "jnxOperatingBuffer", "Buffer utilization", "integer", "percent"),
        "jnxOperatingHeap": OIDDefinition("1.3.6.1.4.1.2636.3.1.13.1.12", "jnxOperatingHeap", "Heap utilization", "integer", "percent"),
        "jnxOperatingMemory": OIDDefinition("1.3.6.1.4.1.2636.3.1.13.1.15", "jnxOperatingMemory", "Memory used", "integer", "bytes"),
    },
    "alarms": {
        # JUNIPER-ALARM-MIB
        "jnxYellowAlarmCount": OIDDefinition("1.3.6.1.4.1.2636.3.4.2.1.0", "jnxYellowAlarmCount", "Yellow alarms", "integer"),
        "jnxRedAlarmCount": OIDDefinition("1.3.6.1.4.1.2636.3.4.2.2.0", "jnxRedAlarmCount", "Red alarms", "integer"),
    },
}


# =============================================================================
# Mellanox/NVIDIA (Enterprise OID: 1.3.6.1.4.1.33049)
# =============================================================================

MELLANOX_OIDS = {
    "system": {
        # MELLANOX-MIB
        "mellanoxSwitchInfo": OIDDefinition("1.3.6.1.4.1.33049.2.1.1", "mellanoxSwitchInfo", "Switch info", "string"),
    },
    "environment": {
        "mlnxEnvTemperature": OIDDefinition("1.3.6.1.4.1.33049.2.1.2.1", "mlnxEnvTemperature", "Temperature", "integer", "celsius"),
        "mlnxEnvFanSpeed": OIDDefinition("1.3.6.1.4.1.33049.2.1.2.2", "mlnxEnvFanSpeed", "Fan speed", "integer", "rpm"),
        "mlnxEnvPowerSupplyStatus": OIDDefinition("1.3.6.1.4.1.33049.2.1.2.3", "mlnxEnvPowerSupplyStatus", "PSU status", "integer"),
    },
    "ports": {
        "mlnxPortInOctets": OIDDefinition("1.3.6.1.4.1.33049.2.2.1.1.1", "mlnxPortInOctets", "Port in octets", "counter64", "bytes"),
        "mlnxPortOutOctets": OIDDefinition("1.3.6.1.4.1.33049.2.2.1.1.2", "mlnxPortOutOctets", "Port out octets", "counter64", "bytes"),
        "mlnxPortInErrors": OIDDefinition("1.3.6.1.4.1.33049.2.2.1.1.3", "mlnxPortInErrors", "Port in errors", "counter64"),
        "mlnxPortOutErrors": OIDDefinition("1.3.6.1.4.1.33049.2.2.1.1.4", "mlnxPortOutErrors", "Port out errors", "counter64"),
    },
}


# =============================================================================
# pfSense (FreeBSD/BEGEMOT) (Enterprise OID: 1.3.6.1.4.1.12325)
# =============================================================================

PFSENSE_OIDS = {
    "pf_info": {
        # BEGEMOT-PF-MIB
        "pfRunning": OIDDefinition("1.3.6.1.4.1.12325.1.200.1.1.1.0", "pfRunning", "PF running", "integer"),
        "pfRuntime": OIDDefinition("1.3.6.1.4.1.12325.1.200.1.1.2.0", "pfRuntime", "PF runtime", "timeticks"),
        "pfDebug": OIDDefinition("1.3.6.1.4.1.12325.1.200.1.1.3.0", "pfDebug", "PF debug level", "integer"),
        "pfHostid": OIDDefinition("1.3.6.1.4.1.12325.1.200.1.1.4.0", "pfHostid", "PF host ID", "string"),
    },
    "pf_counters": {
        "pfCntMatch": OIDDefinition("1.3.6.1.4.1.12325.1.200.1.2.1.0", "pfCntMatch", "Rule match count", "counter64"),
        "pfCntBadOffset": OIDDefinition("1.3.6.1.4.1.12325.1.200.1.2.2.0", "pfCntBadOffset", "Bad offset count", "counter64"),
        "pfCntFragment": OIDDefinition("1.3.6.1.4.1.12325.1.200.1.2.3.0", "pfCntFragment", "Fragment count", "counter64"),
        "pfCntShort": OIDDefinition("1.3.6.1.4.1.12325.1.200.1.2.4.0", "pfCntShort", "Short packet count", "counter64"),
        "pfCntNormalize": OIDDefinition("1.3.6.1.4.1.12325.1.200.1.2.5.0", "pfCntNormalize", "Normalize count", "counter64"),
        "pfCntMemory": OIDDefinition("1.3.6.1.4.1.12325.1.200.1.2.6.0", "pfCntMemory", "Memory failures", "counter64"),
    },
    "pf_state": {
        "pfStateCount": OIDDefinition("1.3.6.1.4.1.12325.1.200.1.3.1.0", "pfStateCount", "Current states", "gauge32"),
        "pfStateSearches": OIDDefinition("1.3.6.1.4.1.12325.1.200.1.3.2.0", "pfStateSearches", "State searches", "counter64"),
        "pfStateInserts": OIDDefinition("1.3.6.1.4.1.12325.1.200.1.3.3.0", "pfStateInserts", "State inserts", "counter64"),
        "pfStateRemovals": OIDDefinition("1.3.6.1.4.1.12325.1.200.1.3.4.0", "pfStateRemovals", "State removals", "counter64"),
    },
    "ucd": {
        # UCD-SNMP-MIB (common on pfSense)
        "memTotalReal": OIDDefinition("1.3.6.1.4.1.2021.4.5.0", "memTotalReal", "Total real memory", "integer", "kilobytes"),
        "memAvailReal": OIDDefinition("1.3.6.1.4.1.2021.4.6.0", "memAvailReal", "Available real memory", "integer", "kilobytes"),
        "memTotalFree": OIDDefinition("1.3.6.1.4.1.2021.4.11.0", "memTotalFree", "Total free memory", "integer", "kilobytes"),
        "memShared": OIDDefinition("1.3.6.1.4.1.2021.4.13.0", "memShared", "Shared memory", "integer", "kilobytes"),
        "memBuffer": OIDDefinition("1.3.6.1.4.1.2021.4.14.0", "memBuffer", "Buffer memory", "integer", "kilobytes"),
        "memCached": OIDDefinition("1.3.6.1.4.1.2021.4.15.0", "memCached", "Cached memory", "integer", "kilobytes"),
        "ssCpuRawUser": OIDDefinition("1.3.6.1.4.1.2021.11.50.0", "ssCpuRawUser", "CPU user time", "counter32"),
        "ssCpuRawNice": OIDDefinition("1.3.6.1.4.1.2021.11.51.0", "ssCpuRawNice", "CPU nice time", "counter32"),
        "ssCpuRawSystem": OIDDefinition("1.3.6.1.4.1.2021.11.52.0", "ssCpuRawSystem", "CPU system time", "counter32"),
        "ssCpuRawIdle": OIDDefinition("1.3.6.1.4.1.2021.11.53.0", "ssCpuRawIdle", "CPU idle time", "counter32"),
        "ssCpuRawWait": OIDDefinition("1.3.6.1.4.1.2021.11.54.0", "ssCpuRawWait", "CPU wait time", "counter32"),
    },
}


# =============================================================================
# HPE Aruba CX Switches (Enterprise OID: 1.3.6.1.4.1.47196)
# Different from Aruba Wireless (14823) - these are wired switches
# Documentation: https://arubanetworking.hpe.com/techdocs/AOS-CX/
# =============================================================================

HPE_ARUBA_CX_OIDS = {
    "system": {
        # ArubaOS-CX System MIB
        "arubaWiredSystemSerialNumber": OIDDefinition("1.3.6.1.4.1.47196.4.1.1.1.1.0", "arubaWiredSystemSerialNumber", "System serial number", "string"),
        "arubaWiredSystemProductName": OIDDefinition("1.3.6.1.4.1.47196.4.1.1.1.2.0", "arubaWiredSystemProductName", "Product name", "string"),
    },
    "cpu_memory": {
        # Note: CPU/memory utilization not available via standard OIDs on some CX models
        # Use HOST-RESOURCES-MIB when available (6300, 6400, 8xxx series)
        # hrProcessorLoad: 1.3.6.1.2.1.25.3.3.1.2
        # hrStorageUsed: 1.3.6.1.2.1.25.2.3.1.6
    },
    "poe": {
        # ARUBAWIRED-POE-MIB
        "arubaWiredPoePethPsePortPowerDrawn": OIDDefinition("1.3.6.1.4.1.47196.4.1.1.3.8.1.1.1.5", "arubaWiredPoePethPsePortPowerDrawn", "PoE power drawn (mW)", "integer", "milliwatts"),
        "arubaWiredPoePethPsePortPowerClass": OIDDefinition("1.3.6.1.4.1.47196.4.1.1.3.8.1.1.1.6", "arubaWiredPoePethPsePortPowerClass", "PoE power class", "integer"),
    },
    "vsx": {
        # ARUBAWIRED-VSX-MIB (Virtual Switching Extension)
        "arubaWiredVsxDeviceRole": OIDDefinition("1.3.6.1.4.1.47196.4.1.1.3.14.1.1.0", "arubaWiredVsxDeviceRole", "VSX device role", "integer"),
        "arubaWiredVsxIslOperState": OIDDefinition("1.3.6.1.4.1.47196.4.1.1.3.14.1.2.0", "arubaWiredVsxIslOperState", "VSX ISL oper state", "integer"),
        "arubaWiredVsxKeepAliveOperState": OIDDefinition("1.3.6.1.4.1.47196.4.1.1.3.14.1.3.0", "arubaWiredVsxKeepAliveOperState", "VSX keepalive state", "integer"),
    },
    "environment": {
        # ARUBAWIRED-CHASSIS-MIB
        "arubaWiredTempSensorTemperature": OIDDefinition("1.3.6.1.4.1.47196.4.1.1.3.11.3.1.1.6", "arubaWiredTempSensorTemperature", "Temperature sensor (mC)", "integer", "millicelsius", 0.001),
        "arubaWiredFanTrayFanSpeed": OIDDefinition("1.3.6.1.4.1.47196.4.1.1.3.11.2.1.1.5", "arubaWiredFanTrayFanSpeed", "Fan speed (RPM)", "integer", "rpm"),
        "arubaWiredPSUState": OIDDefinition("1.3.6.1.4.1.47196.4.1.1.3.11.4.1.1.4", "arubaWiredPSUState", "PSU state", "integer"),
    },
}


# =============================================================================
# Linux/Red Hat Enterprise Linux (UCD-SNMP-MIB / NET-SNMP)
# Enterprise OID: 1.3.6.1.4.1.2021 (UCD) / 1.3.6.1.4.1.8072 (Net-SNMP)
# =============================================================================

LINUX_OIDS = {
    "cpu": {
        # UCD-SNMP-MIB::systemStats
        "ssCpuUser": OIDDefinition("1.3.6.1.4.1.2021.11.9.0", "ssCpuUser", "CPU user %", "integer", "percent"),
        "ssCpuSystem": OIDDefinition("1.3.6.1.4.1.2021.11.10.0", "ssCpuSystem", "CPU system %", "integer", "percent"),
        "ssCpuIdle": OIDDefinition("1.3.6.1.4.1.2021.11.11.0", "ssCpuIdle", "CPU idle %", "integer", "percent"),
        # Raw counters (better for rate calculation)
        "ssCpuRawUser": OIDDefinition("1.3.6.1.4.1.2021.11.50.0", "ssCpuRawUser", "CPU user ticks", "counter32"),
        "ssCpuRawNice": OIDDefinition("1.3.6.1.4.1.2021.11.51.0", "ssCpuRawNice", "CPU nice ticks", "counter32"),
        "ssCpuRawSystem": OIDDefinition("1.3.6.1.4.1.2021.11.52.0", "ssCpuRawSystem", "CPU system ticks", "counter32"),
        "ssCpuRawIdle": OIDDefinition("1.3.6.1.4.1.2021.11.53.0", "ssCpuRawIdle", "CPU idle ticks", "counter32"),
        "ssCpuRawWait": OIDDefinition("1.3.6.1.4.1.2021.11.54.0", "ssCpuRawWait", "CPU I/O wait ticks", "counter32"),
        "ssCpuRawKernel": OIDDefinition("1.3.6.1.4.1.2021.11.55.0", "ssCpuRawKernel", "CPU kernel ticks", "counter32"),
        "ssCpuRawInterrupt": OIDDefinition("1.3.6.1.4.1.2021.11.56.0", "ssCpuRawInterrupt", "CPU interrupt ticks", "counter32"),
        "ssCpuRawSoftIRQ": OIDDefinition("1.3.6.1.4.1.2021.11.61.0", "ssCpuRawSoftIRQ", "CPU soft IRQ ticks", "counter32"),
        "ssCpuRawSteal": OIDDefinition("1.3.6.1.4.1.2021.11.64.0", "ssCpuRawSteal", "CPU steal ticks", "counter32"),
        "ssCpuRawGuest": OIDDefinition("1.3.6.1.4.1.2021.11.65.0", "ssCpuRawGuest", "CPU guest ticks", "counter32"),
        "ssCpuRawGuestNice": OIDDefinition("1.3.6.1.4.1.2021.11.66.0", "ssCpuRawGuestNice", "CPU guest nice ticks", "counter32"),
    },
    "memory": {
        # UCD-SNMP-MIB::memory
        "memTotalSwap": OIDDefinition("1.3.6.1.4.1.2021.4.3.0", "memTotalSwap", "Total swap", "integer", "kilobytes"),
        "memAvailSwap": OIDDefinition("1.3.6.1.4.1.2021.4.4.0", "memAvailSwap", "Available swap", "integer", "kilobytes"),
        "memTotalReal": OIDDefinition("1.3.6.1.4.1.2021.4.5.0", "memTotalReal", "Total real memory", "integer", "kilobytes"),
        "memAvailReal": OIDDefinition("1.3.6.1.4.1.2021.4.6.0", "memAvailReal", "Available real memory", "integer", "kilobytes"),
        "memTotalFree": OIDDefinition("1.3.6.1.4.1.2021.4.11.0", "memTotalFree", "Total free memory", "integer", "kilobytes"),
        "memMinimumSwap": OIDDefinition("1.3.6.1.4.1.2021.4.12.0", "memMinimumSwap", "Minimum swap", "integer", "kilobytes"),
        "memShared": OIDDefinition("1.3.6.1.4.1.2021.4.13.0", "memShared", "Shared memory", "integer", "kilobytes"),
        "memBuffer": OIDDefinition("1.3.6.1.4.1.2021.4.14.0", "memBuffer", "Buffer memory", "integer", "kilobytes"),
        "memCached": OIDDefinition("1.3.6.1.4.1.2021.4.15.0", "memCached", "Cached memory", "integer", "kilobytes"),
    },
    "load": {
        # UCD-SNMP-MIB::laTable
        "laLoad1": OIDDefinition("1.3.6.1.4.1.2021.10.1.3.1", "laLoad1", "1-minute load average", "string"),
        "laLoad5": OIDDefinition("1.3.6.1.4.1.2021.10.1.3.2", "laLoad5", "5-minute load average", "string"),
        "laLoad15": OIDDefinition("1.3.6.1.4.1.2021.10.1.3.3", "laLoad15", "15-minute load average", "string"),
        # Integer versions (scaled by 100)
        "laLoadInt1": OIDDefinition("1.3.6.1.4.1.2021.10.1.5.1", "laLoadInt1", "1-min load (x100)", "integer"),
        "laLoadInt5": OIDDefinition("1.3.6.1.4.1.2021.10.1.5.2", "laLoadInt5", "5-min load (x100)", "integer"),
        "laLoadInt15": OIDDefinition("1.3.6.1.4.1.2021.10.1.5.3", "laLoadInt15", "15-min load (x100)", "integer"),
    },
    "disk_io": {
        # UCD-DISKIO-MIB::diskIOTable
        "diskIODevice": OIDDefinition("1.3.6.1.4.1.2021.13.15.1.1.2", "diskIODevice", "Disk device name", "string"),
        "diskIONRead": OIDDefinition("1.3.6.1.4.1.2021.13.15.1.1.3", "diskIONRead", "Bytes read", "counter32", "bytes"),
        "diskIONWritten": OIDDefinition("1.3.6.1.4.1.2021.13.15.1.1.4", "diskIONWritten", "Bytes written", "counter32", "bytes"),
        "diskIOReads": OIDDefinition("1.3.6.1.4.1.2021.13.15.1.1.5", "diskIOReads", "Read operations", "counter32"),
        "diskIOWrites": OIDDefinition("1.3.6.1.4.1.2021.13.15.1.1.6", "diskIOWrites", "Write operations", "counter32"),
        # 64-bit counters
        "diskIONReadX": OIDDefinition("1.3.6.1.4.1.2021.13.15.1.1.12", "diskIONReadX", "Bytes read (64-bit)", "counter64", "bytes"),
        "diskIONWrittenX": OIDDefinition("1.3.6.1.4.1.2021.13.15.1.1.13", "diskIONWrittenX", "Bytes written (64-bit)", "counter64", "bytes"),
    },
    "disk_space": {
        # UCD-SNMP-MIB::dskTable
        "dskPath": OIDDefinition("1.3.6.1.4.1.2021.9.1.2", "dskPath", "Disk path", "string"),
        "dskDevice": OIDDefinition("1.3.6.1.4.1.2021.9.1.3", "dskDevice", "Disk device", "string"),
        "dskTotal": OIDDefinition("1.3.6.1.4.1.2021.9.1.6", "dskTotal", "Total disk (KB)", "integer", "kilobytes"),
        "dskAvail": OIDDefinition("1.3.6.1.4.1.2021.9.1.7", "dskAvail", "Available disk (KB)", "integer", "kilobytes"),
        "dskUsed": OIDDefinition("1.3.6.1.4.1.2021.9.1.8", "dskUsed", "Used disk (KB)", "integer", "kilobytes"),
        "dskPercent": OIDDefinition("1.3.6.1.4.1.2021.9.1.9", "dskPercent", "Disk usage %", "integer", "percent"),
        "dskPercentNode": OIDDefinition("1.3.6.1.4.1.2021.9.1.10", "dskPercentNode", "Inode usage %", "integer", "percent"),
    },
    "system_io": {
        # UCD-SNMP-MIB::systemStats I/O
        "ssIORawSent": OIDDefinition("1.3.6.1.4.1.2021.11.57.0", "ssIORawSent", "I/O blocks sent", "counter32"),
        "ssIORawReceived": OIDDefinition("1.3.6.1.4.1.2021.11.58.0", "ssIORawReceived", "I/O blocks received", "counter32"),
        "ssRawInterrupts": OIDDefinition("1.3.6.1.4.1.2021.11.59.0", "ssRawInterrupts", "Interrupts", "counter32"),
        "ssRawContexts": OIDDefinition("1.3.6.1.4.1.2021.11.60.0", "ssRawContexts", "Context switches", "counter32"),
        "ssRawSwapIn": OIDDefinition("1.3.6.1.4.1.2021.11.62.0", "ssRawSwapIn", "Swap pages in", "counter32"),
        "ssRawSwapOut": OIDDefinition("1.3.6.1.4.1.2021.11.63.0", "ssRawSwapOut", "Swap pages out", "counter32"),
    },
    "tcp": {
        # TCP-MIB (standard but important for Linux servers)
        "tcpCurrEstab": OIDDefinition("1.3.6.1.2.1.6.9.0", "tcpCurrEstab", "Current TCP connections", "gauge32"),
        "tcpActiveOpens": OIDDefinition("1.3.6.1.2.1.6.5.0", "tcpActiveOpens", "TCP active opens", "counter32"),
        "tcpPassiveOpens": OIDDefinition("1.3.6.1.2.1.6.6.0", "tcpPassiveOpens", "TCP passive opens", "counter32"),
        "tcpAttemptFails": OIDDefinition("1.3.6.1.2.1.6.7.0", "tcpAttemptFails", "TCP failed attempts", "counter32"),
        "tcpEstabResets": OIDDefinition("1.3.6.1.2.1.6.8.0", "tcpEstabResets", "TCP established resets", "counter32"),
    },
}

# Red Hat is an alias for Linux OIDs
REDHAT_OIDS = LINUX_OIDS


# =============================================================================
# Windows (HOST-RESOURCES-MIB / Microsoft Enterprise MIB)
# Enterprise OID: 1.3.6.1.4.1.311 (Microsoft)
# =============================================================================

WINDOWS_OIDS = {
    "system": {
        # Microsoft LanMgr Services MIB
        "svSvcName": OIDDefinition("1.3.6.1.4.1.77.1.2.3.1.1", "svSvcName", "Service name", "string"),
        "svSvcInstalledState": OIDDefinition("1.3.6.1.4.1.77.1.2.3.1.2", "svSvcInstalledState", "Service installed state", "integer"),
        "svSvcOperatingState": OIDDefinition("1.3.6.1.4.1.77.1.2.3.1.3", "svSvcOperatingState", "Service operating state", "integer"),
    },
    "cpu": {
        # HOST-RESOURCES-MIB (standard, well-supported on Windows)
        "hrProcessorLoad": OIDDefinition("1.3.6.1.2.1.25.3.3.1.2", "hrProcessorLoad", "Processor load %", "integer", "percent"),
    },
    "memory": {
        # HOST-RESOURCES-MIB hrStorageTable
        # On Windows: Index 1 = Physical Memory, Index 2 = Virtual Memory
        "hrMemorySize": OIDDefinition("1.3.6.1.2.1.25.2.2.0", "hrMemorySize", "Total memory (KB)", "integer", "kilobytes"),
        "hrStorageDescr": OIDDefinition("1.3.6.1.2.1.25.2.3.1.3", "hrStorageDescr", "Storage description", "string"),
        "hrStorageAllocationUnits": OIDDefinition("1.3.6.1.2.1.25.2.3.1.4", "hrStorageAllocationUnits", "Allocation unit size", "integer", "bytes"),
        "hrStorageSize": OIDDefinition("1.3.6.1.2.1.25.2.3.1.5", "hrStorageSize", "Storage size (units)", "integer"),
        "hrStorageUsed": OIDDefinition("1.3.6.1.2.1.25.2.3.1.6", "hrStorageUsed", "Storage used (units)", "integer"),
        # Storage types for identification
        "hrStorageType": OIDDefinition("1.3.6.1.2.1.25.2.3.1.2", "hrStorageType", "Storage type", "oid"),
    },
    "disk": {
        # hrStorageTable entries for disk (hrStorageFixedDisk = .1.3.6.1.2.1.25.2.1.4)
        # C: drive typically at index 3 or higher on Windows
        # Must walk hrStorageDescr to find drive letters
        "hrStorageFixedDisk": OIDDefinition("1.3.6.1.2.1.25.2.1.4", "hrStorageFixedDisk", "Fixed disk type OID", "oid"),
    },
    "processes": {
        # HOST-RESOURCES-MIB
        "hrSystemProcesses": OIDDefinition("1.3.6.1.2.1.25.1.6.0", "hrSystemProcesses", "Number of processes", "gauge32"),
        "hrSystemMaxProcesses": OIDDefinition("1.3.6.1.2.1.25.1.7.0", "hrSystemMaxProcesses", "Max processes", "integer"),
        "hrSystemNumUsers": OIDDefinition("1.3.6.1.2.1.25.1.5.0", "hrSystemNumUsers", "Number of users", "gauge32"),
    },
    "software": {
        # HOST-RESOURCES-MIB hrSWRunTable
        "hrSWRunName": OIDDefinition("1.3.6.1.2.1.25.4.2.1.2", "hrSWRunName", "Running software name", "string"),
        "hrSWRunPath": OIDDefinition("1.3.6.1.2.1.25.4.2.1.4", "hrSWRunPath", "Running software path", "string"),
        "hrSWRunStatus": OIDDefinition("1.3.6.1.2.1.25.4.2.1.7", "hrSWRunStatus", "Running software status", "integer"),
        # hrSWRunPerfCPU and hrSWRunPerfMem for per-process metrics
        "hrSWRunPerfCPU": OIDDefinition("1.3.6.1.2.1.25.5.1.1.1", "hrSWRunPerfCPU", "Process CPU (centi-seconds)", "integer", "centiseconds"),
        "hrSWRunPerfMem": OIDDefinition("1.3.6.1.2.1.25.5.1.1.2", "hrSWRunPerfMem", "Process memory (KB)", "integer", "kilobytes"),
    },
    "network": {
        # IF-MIB (standard, same as Linux)
        "ifNumber": OIDDefinition("1.3.6.1.2.1.2.1.0", "ifNumber", "Number of interfaces", "integer"),
        "ifDescr": OIDDefinition("1.3.6.1.2.1.2.2.1.2", "ifDescr", "Interface description", "string"),
        "ifOperStatus": OIDDefinition("1.3.6.1.2.1.2.2.1.8", "ifOperStatus", "Oper status", "integer"),
        "ifHCInOctets": OIDDefinition("1.3.6.1.2.1.31.1.1.1.6", "ifHCInOctets", "Inbound octets (64-bit)", "counter64", "bytes"),
        "ifHCOutOctets": OIDDefinition("1.3.6.1.2.1.31.1.1.1.10", "ifHCOutOctets", "Outbound octets (64-bit)", "counter64", "bytes"),
    },
    "tcp": {
        # TCP-MIB
        "tcpCurrEstab": OIDDefinition("1.3.6.1.2.1.6.9.0", "tcpCurrEstab", "Current TCP connections", "gauge32"),
    },
}


# =============================================================================
# Sophos XG/SFOS (Enterprise OID: 1.3.6.1.4.1.2604 / 1.3.6.1.4.1.21067)
# =============================================================================

SOPHOS_OIDS = {
    "system": {
        # SFOS-FIREWALL-MIB
        "sfosDeviceName": OIDDefinition("1.3.6.1.4.1.2604.5.1.1.1.0", "sfosDeviceName", "Device name", "string"),
        "sfosDeviceType": OIDDefinition("1.3.6.1.4.1.2604.5.1.1.2.0", "sfosDeviceType", "Device type", "string"),
        "sfosDeviceFWVersion": OIDDefinition("1.3.6.1.4.1.2604.5.1.1.3.0", "sfosDeviceFWVersion", "Firmware version", "string"),
        "sfosApplianceKey": OIDDefinition("1.3.6.1.4.1.2604.5.1.1.4.0", "sfosApplianceKey", "Appliance key", "string"),
        "sfosWebcatVersion": OIDDefinition("1.3.6.1.4.1.2604.5.1.1.5.0", "sfosWebcatVersion", "Webcat version", "string"),
        "sfosIPSVersion": OIDDefinition("1.3.6.1.4.1.2604.5.1.1.6.0", "sfosIPSVersion", "IPS version", "string"),
    },
    "cpu_memory": {
        "sfosCpuPercentUsage": OIDDefinition("1.3.6.1.4.1.2604.5.1.2.1.0", "sfosCpuPercentUsage", "CPU utilization", "integer", "percent"),
        "sfosMemoryPercentUsage": OIDDefinition("1.3.6.1.4.1.2604.5.1.2.2.0", "sfosMemoryPercentUsage", "Memory utilization", "integer", "percent"),
        "sfosSwapPercentUsage": OIDDefinition("1.3.6.1.4.1.2604.5.1.2.3.0", "sfosSwapPercentUsage", "Swap utilization", "integer", "percent"),
    },
    "disk": {
        "sfosDiskCapacity": OIDDefinition("1.3.6.1.4.1.2604.5.1.2.4.0", "sfosDiskCapacity", "Disk capacity", "integer", "megabytes"),
        "sfosDiskPercentUsage": OIDDefinition("1.3.6.1.4.1.2604.5.1.2.5.0", "sfosDiskPercentUsage", "Disk utilization", "integer", "percent"),
    },
    "connections": {
        "sfosLiveUsersCount": OIDDefinition("1.3.6.1.4.1.2604.5.1.3.1.0", "sfosLiveUsersCount", "Live users", "integer"),
        "sfosHttpHits": OIDDefinition("1.3.6.1.4.1.2604.5.1.3.2.0", "sfosHttpHits", "HTTP hits", "counter64"),
        "sfosFtpHits": OIDDefinition("1.3.6.1.4.1.2604.5.1.3.3.0", "sfosFtpHits", "FTP hits", "counter64"),
        "sfosPOP3Hits": OIDDefinition("1.3.6.1.4.1.2604.5.1.3.4.0", "sfosPOP3Hits", "POP3 hits", "counter64"),
        "sfosImapHits": OIDDefinition("1.3.6.1.4.1.2604.5.1.3.5.0", "sfosImapHits", "IMAP hits", "counter64"),
        "sfosSmtpHits": OIDDefinition("1.3.6.1.4.1.2604.5.1.3.6.0", "sfosSmtpHits", "SMTP hits", "counter64"),
    },
    "services": {
        "sfosServiceAntivirus": OIDDefinition("1.3.6.1.4.1.2604.5.1.4.1.0", "sfosServiceAntivirus", "Antivirus status", "integer"),
        "sfosServiceAntispam": OIDDefinition("1.3.6.1.4.1.2604.5.1.4.2.0", "sfosServiceAntispam", "Antispam status", "integer"),
        "sfosServiceIPS": OIDDefinition("1.3.6.1.4.1.2604.5.1.4.3.0", "sfosServiceIPS", "IPS status", "integer"),
        "sfosServiceWebFilter": OIDDefinition("1.3.6.1.4.1.2604.5.1.4.4.0", "sfosServiceWebFilter", "Web filter status", "integer"),
        "sfosServiceAppFilter": OIDDefinition("1.3.6.1.4.1.2604.5.1.4.5.0", "sfosServiceAppFilter", "App filter status", "integer"),
    },
    "vpn": {
        "sfosIPSecConnections": OIDDefinition("1.3.6.1.4.1.2604.5.1.5.1.0", "sfosIPSecConnections", "IPSec connections", "integer"),
        "sfosSSLVPNConnections": OIDDefinition("1.3.6.1.4.1.2604.5.1.5.2.0", "sfosSSLVPNConnections", "SSL VPN connections", "integer"),
    },
    "ha": {
        "sfosHAStatus": OIDDefinition("1.3.6.1.4.1.2604.5.1.6.1.0", "sfosHAStatus", "HA status", "integer"),
        "sfosHAPeerStatus": OIDDefinition("1.3.6.1.4.1.2604.5.1.6.2.0", "sfosHAPeerStatus", "HA peer status", "integer"),
    },
}


# =============================================================================
# Vendor Detection by sysObjectID
# =============================================================================

VENDOR_OID_PREFIXES = {
    "1.3.6.1.4.1.30065": VendorType.ARISTA,       # Arista Networks
    "1.3.6.1.4.1.14823": VendorType.ARUBA,        # HPE Aruba Wireless
    "1.3.6.1.4.1.47196": VendorType.HPE_ARUBA_CX, # HPE Aruba CX Switches
    "1.3.6.1.4.1.2636": VendorType.JUNIPER,       # Juniper Networks
    "1.3.6.1.4.1.33049": VendorType.MELLANOX,     # Mellanox/NVIDIA
    "1.3.6.1.4.1.12325": VendorType.PFSENSE,      # FreeBSD/pfSense
    "1.3.6.1.4.1.8072": VendorType.LINUX,         # Net-SNMP (Linux)
    "1.3.6.1.4.1.2021": VendorType.LINUX,         # UCD-SNMP (Linux)
    "1.3.6.1.4.1.2604": VendorType.SOPHOS,        # Sophos
    "1.3.6.1.4.1.21067": VendorType.SOPHOS,       # Sophos (alternate)
    "1.3.6.1.4.1.311": VendorType.WINDOWS,        # Microsoft Windows
    "1.3.6.1.4.1.77": VendorType.WINDOWS,         # LanMgr (Windows)
}


def detect_vendor_from_sys_object_id(sys_object_id: str) -> VendorType:
    """Detect vendor type from sysObjectID OID.

    Args:
        sys_object_id: The sysObjectID value from the device

    Returns:
        VendorType enum indicating the detected vendor
    """
    for prefix, vendor in VENDOR_OID_PREFIXES.items():
        if sys_object_id.startswith(prefix):
            return vendor
    return VendorType.GENERIC


def get_vendor_oids(vendor: VendorType) -> dict[str, dict[str, OIDDefinition]]:
    """Get vendor-specific OID mappings.

    Args:
        vendor: The vendor type

    Returns:
        Dictionary of OID categories and definitions
    """
    vendor_maps = {
        VendorType.ARISTA: ARISTA_OIDS,
        VendorType.ARUBA: ARUBA_OIDS,
        VendorType.HPE_ARUBA_CX: HPE_ARUBA_CX_OIDS,
        VendorType.JUNIPER: JUNIPER_OIDS,
        VendorType.MELLANOX: MELLANOX_OIDS,
        VendorType.PFSENSE: PFSENSE_OIDS,
        VendorType.SOPHOS: SOPHOS_OIDS,
        VendorType.LINUX: LINUX_OIDS,
        VendorType.REDHAT: REDHAT_OIDS,
        VendorType.WINDOWS: WINDOWS_OIDS,
    }
    return vendor_maps.get(vendor, {})


def get_all_oids_for_vendor(vendor: VendorType) -> dict[str, dict[str, OIDDefinition]]:
    """Get all OIDs (standard + vendor-specific) for a vendor.

    Args:
        vendor: The vendor type

    Returns:
        Combined dictionary of standard and vendor OIDs
    """
    # Start with standard OIDs
    all_oids = dict(STANDARD_OIDS)

    # Add vendor-specific OIDs
    vendor_oids = get_vendor_oids(vendor)
    for category, oids in vendor_oids.items():
        if category in all_oids:
            all_oids[category].update(oids)
        else:
            all_oids[category] = oids

    return all_oids
