# GridWatch NPM Service

Network Performance Monitoring service for GridWatch NetEnterprise.

## Features

- **SNMPv3 Polling** - FIPS-compliant device monitoring with SHA-256+ and AES-256
- **Device Metrics** - CPU, memory, disk, swap utilization
- **Interface Metrics** - Traffic (in/out octets), errors, utilization with 64-bit counter support
- **Service Status** - Vendor-specific service monitoring (Sophos SFOS services)
- **Real-time Alerting** - Configurable threshold-based alerting
- **VictoriaMetrics** - Time-series storage for historical metrics
- **Multi-vendor Support** - Cisco, Juniper, Palo Alto, Fortinet, Arista, Sophos, and more

## Supported OIDs

### Device Metrics

| Metric | Sophos SFOS OID              | Description            |
| ------ | ---------------------------- | ---------------------- |
| CPU    | 1.3.6.1.4.1.2604.5.1.2.1.1.0 | sfosCPUPercentUsage    |
| Memory | 1.3.6.1.4.1.2604.5.1.2.2.3.0 | sfosMemoryPercentUsage |
| Disk   | 1.3.6.1.4.1.2604.5.1.2.4.2.0 | sfosDiskPercentUsage   |
| Swap   | 1.3.6.1.4.1.2604.5.1.2.5.4.0 | sfosSwapPercentUsage   |

### Interface Metrics (IF-MIB RFC 2863)

| Metric     | OID                     | Description            |
| ---------- | ----------------------- | ---------------------- |
| In Octets  | 1.3.6.1.2.1.31.1.1.1.6  | ifHCInOctets (64-bit)  |
| Out Octets | 1.3.6.1.2.1.31.1.1.1.10 | ifHCOutOctets (64-bit) |
| In Errors  | 1.3.6.1.2.1.2.2.1.14    | ifInErrors             |
| Out Errors | 1.3.6.1.2.1.2.2.1.20    | ifOutErrors            |

### Sophos Service Status

Monitors 20+ services including Anti-Virus, Anti-Spam, IPS, Web Filter, VPN, and more.

## Development

```bash
# Install dependencies
pip install -e ".[dev]"

# Run service
uvicorn npm.main:app --reload --port 3004
```

## Database Migration

For existing databases, run the migration script:

```bash
docker compose exec -T postgres psql -U gridwatch -d gridwatch \
  -f /dev/stdin < infrastructure/postgres/migrations/001_add_disk_service_metrics.sql
```

## API

Service runs on port 3004. See OpenAPI docs at `/docs`.
