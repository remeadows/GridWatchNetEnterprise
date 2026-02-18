# MIB Files for GridWatch NetEnterprise NPM

This directory contains vendor-specific and standard SNMP MIB files for network device monitoring.

## Directory Structure

```
mibs/
├── standard/       # RFC standard MIBs (IF-MIB, ENTITY-MIB, SNMPv2-*)
├── arista/         # Arista Networks switches
├── aruba/          # HPE Aruba wireless/switches
├── juniper/        # Juniper Networks routers/switches
├── mellanox/       # Mellanox/NVIDIA networking
├── pfsense/        # pfSense/FreeBSD firewalls
└── sophos/         # Sophos XG/SFOS firewalls
```

## Vendor MIB Sources

| Vendor        | Source                                                                                                                                   | Files                                                                                           |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| **Arista**    | [arista.com/en/support/product-documentation/arista-snmp-mibs](https://www.arista.com/en/support/product-documentation/arista-snmp-mibs) | ARISTA-PRODUCTS-MIB, ARISTA-SMI-MIB, ARISTA-ENTITY-SENSOR-MIB, ARISTA-IF-MIB, ARISTA-BGP4V2-MIB |
| **HPE Aruba** | [arubanetworking.hpe.com](https://arubanetworking.hpe.com/techdocs/AOS-S/16.10/MCG/KB/content/kb/dow-lat-mib-fil.htm)                    | ARUBA-MIB, WLSX-SWITCH-MIB, WLSX-WLAN-MIB, WLSX-SYSTEMEXT-MIB                                   |
| **Juniper**   | [apps.juniper.net/mib-explorer](https://apps.juniper.net/mib-explorer/)                                                                  | JUNIPER-MIB, JUNIPER-SMI, JUNIPER-CHASSIS-DEFINES-MIB, JUNIPER-IF-MIB, JUNIPER-ALARM-MIB        |
| **Mellanox**  | [enterprise-support.nvidia.com](https://enterprise-support.nvidia.com/s/)                                                                | MELLANOX-MIB, MELLANOX-PRODUCTS-MIB, MELLANOX-TC                                                |
| **pfSense**   | Device `/usr/share/snmp/mibs/`                                                                                                           | BEGEMOT-PF-MIB, BEGEMOT-MIB, UCD-SNMP-MIB, HOST-RESOURCES-MIB                                   |
| **Sophos**    | Firewall UI > SNMP > Download MIB                                                                                                        | SFOS-FIREWALL-MIB                                                                               |

## Standard MIBs (RFC)

| MIB                | RFC      | Purpose                                |
| ------------------ | -------- | -------------------------------------- |
| IF-MIB             | RFC 2863 | Interface statistics (64-bit counters) |
| ENTITY-MIB         | RFC 4133 | Physical entity information            |
| ENTITY-SENSOR-MIB  | RFC 3433 | Environmental sensors                  |
| SNMPv2-MIB         | RFC 3418 | System information                     |
| HOST-RESOURCES-MIB | RFC 2790 | Host resources (CPU, memory, disk)     |
| UCD-SNMP-MIB       | N/A      | Extended system metrics                |

## Usage with NPM Poller

The NPM collector uses these MIBs for vendor-specific OID resolution. See `services/npm-collector/src/oid_mappings.py` for the OID-to-metric mappings.

## Updating MIBs

1. Download updated MIBs from vendor sources
2. Place in appropriate vendor directory
3. Update OID mappings if new metrics are available
4. Test with `snmpwalk` against target devices

## Last Updated

2026-01-14
