# NetNynja Enterprise - Project Context

> Comprehensive context for AI-assisted and human development

**Version**: 0.2.2
**Last Updated**: 2026-01-12 12:00 EST
**Status**: Active Development - Phase 9 In Progress (2 Open, 116 Resolved)

## Project Vision

NetNynja Enterprise unifies three critical network management capabilities into a single platform, providing IT and security teams with comprehensive visibility and control over their network infrastructure.

### Core Applications

| Application      | Purpose                        | Key Features                                               |
| ---------------- | ------------------------------ | ---------------------------------------------------------- |
| **IPAM**         | IP Address Management          | Network discovery, DHCP/DNS integration, capacity planning |
| **NPM**          | Network Performance Monitoring | Real-time metrics, alerting, topology visualization        |
| **STIG Manager** | Security Compliance            | STIG auditing, CKL generation, compliance reporting        |

### Target Users

- **Network Engineers** - Day-to-day network management
- **Security Teams** - Compliance auditing and reporting
- **IT Managers** - Infrastructure visibility and capacity planning
- **Auditors** - Compliance verification and documentation

---

## Technical Context

### Architecture Decisions

| Decision       | Choice                  | Rationale                                     |
| -------------- | ----------------------- | --------------------------------------------- |
| Monorepo       | npm workspaces + Poetry | Shared code, atomic changes, simplified CI    |
| API Framework  | Fastify (Node.js)       | Performance, TypeScript, plugin ecosystem     |
| Frontend       | React + Vite            | Component reuse, fast development, TypeScript |
| Python Backend | AsyncIO                 | Network I/O bound workloads, performance      |
| Database       | PostgreSQL              | INET/CIDR types, JSON support, reliability    |
| Time-series    | VictoriaMetrics         | Performance, Prometheus compatibility         |
| Messaging      | NATS JetStream          | Lightweight, durable streams, performance     |
| Auth           | JWT + Argon2id          | Stateless scaling, OWASP-recommended hashing  |

### Integration Points

```
┌─────────────────────────────────────────────────────────────┐
│                    External Systems                          │
├─────────────────────────────────────────────────────────────┤
│  LDAP/AD  │  SNMP Devices  │  SSH Targets  │  STIG Sources │
└─────┬─────┴───────┬────────┴───────┬───────┴───────┬───────┘
      │             │                │               │
      ▼             ▼                ▼               ▼
┌─────────────────────────────────────────────────────────────┐
│                   NetNynja Enterprise                        │
│  ┌─────────┐   ┌─────────┐   ┌─────────┐   ┌─────────────┐ │
│  │  Auth   │   │  IPAM   │   │   NPM   │   │STIG Manager │ │
│  └─────────┘   └─────────┘   └─────────┘   └─────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

---

## Development Context

### Repository Layout

The monorepo is organized for separation of concerns while enabling code sharing:

- **apps/** - Deployable applications (gateway, web-ui, module backends)
- **packages/** - Shared TypeScript libraries (types, auth, UI components)
- **services/** - Shared Python microservices (centralized functionality)
- **infrastructure/** - Docker, database, observability configurations

### Coding Standards

**TypeScript**

- Strict mode enabled, no `any` types
- Zod for runtime validation at API boundaries
- Fastify plugin pattern for modular routes
- Prefer interfaces over type aliases for objects

**Python**

- Type hints on all functions
- Pydantic for data validation
- AsyncIO for all I/O operations
- Structured logging with structlog

**General**

- Conventional commits (feat:, fix:, docs:, chore:)
- All PRs require passing CI
- Security scans before merge
- Pre-commit hooks (Husky for TypeScript, pre-commit for Python)

**Testing & Quality**

- Jest for TypeScript unit tests (67+ tests for gateway)
- pytest for Python unit tests
- autocannon for performance benchmarking
- Test coverage enforced (50% minimum)

### Key Dependencies

**Shared across applications:**

- PostgreSQL 15 - Primary data store
- Redis 7 - Caching and sessions
- NATS 2.10 - Event messaging
- HashiCorp Vault - Secrets management

**Observability stack:**

- Prometheus - Metrics collection
- VictoriaMetrics - Long-term metrics storage
- Loki - Log aggregation
- Grafana - Visualization
- Jaeger - Distributed tracing

---

## Domain Context

### IPAM Domain

**Key Entities:**

- Networks (CIDR blocks with metadata, site designation)
- IP Addresses (individual IPs with status, fingerprinting)
- Scan Jobs (discovery operations with name/notes, exportable)

**Key Operations:**

- Network scanning (ICMP ping, TCP, NMAP with XML parsing)
- IP discovery and tracking with OS fingerprinting (TTL-based)
- Utilization reporting with PDF/CSV export
- DNS/DHCP correlation
- Add discovered hosts to NPM monitoring
- Scan management (create, edit, delete, export)

### NPM Domain

**Key Entities:**

- Devices (monitored network devices with CPU/memory/latency metrics)
- Interfaces (device ports/interfaces with traffic metrics)
- Volumes (storage monitoring with utilization)
- Metrics (time-series performance data, partitioned)
- Alerts (threshold violations)
- Device Groups (logical grouping of devices)
- Discovery Jobs (network scanning with ICMP/SNMPv3)
- SNMPv3 Credentials (FIPS-compliant, encrypted storage)

**Key Operations:**

- SNMPv3 polling with FIPS-compliant protocols (SHA-256+, AES-256)
- Device discovery with fingerprinting (vendor, model, OS detection)
- Interface and volume monitoring
- Alert evaluation with customizable rules
- Health/status PDF/CSV export
- Site-based grouping of discovered hosts
- Scale to 3000+ devices with optimized queries
- On-demand device polling (Poll Now) with method selection
- Continuous background polling (5-minute default interval)

### STIG Domain

**Key Entities:**

- Targets (auditable systems with platform/connection type)
- STIG Definitions (compliance rules from uploaded .zip files)
- Definition Rules (individual XCCDF rules parsed from STIGs)
- Audit Jobs (compliance checks with results)
- Results (pass/fail findings with severity)
- Import History (imported .ckl, .cklb, .xml checklists)

**Key Operations:**

- SSH/Netmiko connections for auditing
- Rule evaluation against targets
- CKL/CKLB/XML import from STIG Viewer
- STIG Library management (upload, parse, delete)
- CKL/PDF report generation
- Compliance scoring and dashboards
- Support for 16 platforms (Cisco, Juniper, Palo Alto, Fortinet, etc.)

### Syslog Domain

**Key Entities:**

- Events (parsed syslog messages with device/event type)
- Sources (configured syslog sources)
- Filters (event filtering rules)
- Forwarders (external SIEM forwarding)
- Buffer Settings (10GB circular buffer configuration)

**Key Operations:**

- UDP/TCP listener on port 514
- RFC 3164/5424 message parsing
- Device type detection (Cisco, Juniper, Palo Alto, Linux, Windows)
- Event type classification (authentication, security_alert, link_state)
- 10GB circular buffer with configurable retention
- Forward to external SIEM via UDP/TCP/TLS

---

## Security Context

### Authentication Flow

```
Client → Gateway → Auth Service → Vault (JWT keys)
                        ↓
                   PostgreSQL (users)
                        ↓
                   Redis (sessions)
```

### RBAC Model

| Role     | IPAM       | NPM        | STIG       | Admin |
| -------- | ---------- | ---------- | ---------- | ----- |
| Admin    | Full       | Full       | Full       | Full  |
| Operator | Read/Write | Read/Write | Read/Write | None  |
| Viewer   | Read       | Read       | Read       | None  |

### Sensitive Data Handling

- Credentials stored in Vault only
- Passwords hashed with Argon2id
- JWT signed with RS256 (production)
- All secrets via environment/Vault (never in code)

---

## Deployment Context

### Container Strategy

- Multi-stage builds for minimal images
- Non-root users in all containers
- Health checks on all services
- Pinned versions (no :latest)

### Platform Considerations

| Platform | Notes                                |
| -------- | ------------------------------------ |
| macOS    | Docker Desktop, host.docker.internal |
| RHEL 9   | Podman compatible, SELinux :Z mounts |
| Windows  | WSL2 backend, Linux containers       |

### Container Dependencies

The gateway container includes additional system packages for network scanning:

| Package      | Version | Purpose                             |
| ------------ | ------- | ----------------------------------- |
| nmap         | 7.97+   | Network discovery and NMAP scanning |
| nmap-scripts | -       | NMAP scripting engine support       |

These are installed in the gateway Dockerfile development stage:

```dockerfile
RUN apk add --no-cache nmap nmap-scripts && \
    npm install -g tsx pino-pretty
```

**Note**: NMAP fingerprinting (MAC addresses, vendor detection) requires the gateway container to be on the same network segment as scanned hosts. DNS reverse lookup must be configured for hostname resolution.

**Enabling Full Fingerprinting**: By default, the gateway runs on a Docker bridge network which cannot detect MAC addresses for hosts on the physical LAN. To enable MAC address detection:

1. Edit `docker-compose.yml` and uncomment `network_mode: host` in the gateway service
2. Comment out the `networks` and `ports` sections for the gateway
3. Rebuild and restart: `docker compose build gateway && docker compose up -d gateway`

With host network mode, the gateway has direct Layer 2 access to detect MAC addresses and vendor information for hosts on the same subnet.

### Scaling Patterns

- Stateless gateway (horizontal scaling)
- Python workers scale per module
- Redis for session affinity
- PostgreSQL read replicas (future)

---

## Historical Context

### Migration from Monolithic IPAM

The original IPAM application used:

- SQLite with SQLCipher → PostgreSQL
- Session auth with Argon2id → JWT (kept Argon2id for passwords)
- Jinja2 templates → React SPA

Key learnings:

- VictoriaMetrics needed for time-series (IPAM gap)
- Unified auth reduces complexity
- Message queue enables loose coupling

### NPM as Reference Architecture

NPM was the most successful build and serves as the template:

- Fastify gateway pattern
- React + Vite frontend
- Python async collectors
- Full observability stack

---

## Future Roadmap

### Near-term (3-6 months)

- Complete platform consolidation
- Cross-module dashboard
- Kubernetes deployment option

### Medium-term (6-12 months)

- API federation (GraphQL gateway)
- Multi-tenant support
- Cloud-native deployment options

### Long-term

- AI-powered anomaly detection
- Automated remediation
- Integration marketplace

---

## Glossary

| Term      | Definition                                            |
| --------- | ----------------------------------------------------- |
| CIDR      | Classless Inter-Domain Routing (IP notation)          |
| CKL       | Checklist (STIG compliance format)                    |
| DISA      | Defense Information Systems Agency                    |
| IPAM      | IP Address Management                                 |
| JetStream | NATS durable message streaming                        |
| NPM       | Network Performance Monitoring                        |
| STIG      | Security Technical Implementation Guide               |
| XCCDF     | eXtensible Configuration Checklist Description Format |
