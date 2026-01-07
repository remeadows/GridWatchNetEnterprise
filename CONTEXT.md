# NetNynja Enterprise - Project Context

> Comprehensive context for AI-assisted and human development

**Version**: 0.1.0
**Last Updated**: 2026-01-06 23:45 EST
**Status**: Active Development - Phase 7 Complete (Dev Infrastructure Enhanced)

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

- Networks (CIDR blocks with metadata)
- IP Addresses (individual IPs with status)
- Scan Jobs (discovery operations)

**Key Operations:**

- Network scanning (ping, TCP, NMAP)
- IP discovery and tracking
- Utilization reporting
- DNS/DHCP correlation

### NPM Domain

**Key Entities:**

- Devices (monitored network devices)
- Interfaces (device ports/interfaces)
- Metrics (time-series performance data)
- Alerts (threshold violations)

**Key Operations:**

- SNMP polling
- Interface monitoring
- Alert evaluation
- Topology discovery

### STIG Domain

**Key Entities:**

- Targets (auditable systems)
- STIG Definitions (compliance rules)
- Audit Jobs (compliance checks)
- Results (pass/fail findings)

**Key Operations:**

- SSH/Netmiko connections
- Rule evaluation
- CKL/PDF report generation
- Compliance scoring

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
