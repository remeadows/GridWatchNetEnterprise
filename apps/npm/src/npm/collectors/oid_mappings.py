"""Vendor-specific SNMP OID mappings for NPM device monitoring.

This module defines SNMP OIDs for various network equipment vendors.
OIDs are organized by vendor and metric category.

Supported vendors:
- Arista Networks (switches)
- HPE Aruba (wireless controllers, switches)
- Juniper Networks (routers, switches)
- Mellanox/NVIDIA (high-performance switches)
- pfSense (firewalls)
- Sophos (XG/SFOS firewalls)

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
    "1.3.6.1.4.1.30065": VendorType.ARISTA,    # Arista Networks
    "1.3.6.1.4.1.14823": VendorType.ARUBA,     # HPE Aruba
    "1.3.6.1.4.1.2636": VendorType.JUNIPER,    # Juniper Networks
    "1.3.6.1.4.1.33049": VendorType.MELLANOX,  # Mellanox/NVIDIA
    "1.3.6.1.4.1.12325": VendorType.PFSENSE,   # FreeBSD/pfSense
    "1.3.6.1.4.1.8072": VendorType.PFSENSE,    # Net-SNMP (often pfSense)
    "1.3.6.1.4.1.2604": VendorType.SOPHOS,     # Sophos
    "1.3.6.1.4.1.21067": VendorType.SOPHOS,    # Sophos (alternate)
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
        VendorType.JUNIPER: JUNIPER_OIDS,
        VendorType.MELLANOX: MELLANOX_OIDS,
        VendorType.PFSENSE: PFSENSE_OIDS,
        VendorType.SOPHOS: SOPHOS_OIDS,
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
