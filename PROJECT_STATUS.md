# NetNynja Enterprise - Project Status

**Version**: 0.2.3
**Last Updated**: 2026-01-14 14:30 EST
**Current Phase**: Phase 9 - CI/CD & Release (In Progress)
**Overall Progress**: ▓▓▓▓▓▓▓▓▓▓ 100%
**Issues**: 0 Open | 130 Resolved | 1 Deferred
**Security Posture**: Low (All Codex Review 2026-01-14 findings resolved)

---

## Executive Summary

NetNynja Enterprise consolidates three network management applications (IPAM, NPM, STIG Manager) into a unified platform with shared infrastructure, authentication, and observability. Target platforms: macOS, RHEL 9.x, Windows 11/Server.

---

## Phase Overview

| Phase | Name                      | Status         | Target     |
| ----- | ------------------------- | -------------- | ---------- |
| 0     | Repository Setup          | ✅ Complete    | Week 1-2   |
| 1     | Shared Infrastructure     | ✅ Complete    | Week 3-4   |
| 2     | Unified Authentication    | ✅ Complete    | Week 5-6   |
| 3     | API Gateway Consolidation | ✅ Complete    | Week 7-9   |
| 4     | Frontend Unification      | ✅ Complete    | Week 10-12 |
| 5     | IPAM Migration            | ✅ Complete    | Week 13-15 |
| 6     | NPM Integration           | ✅ Complete    | Week 16-18 |
| 7     | STIG Manager Integration  | ✅ Complete    | Week 19-21 |
| 8     | Cross-Platform Testing    | ✅ Complete    | Week 22-24 |
| 9     | CI/CD & Release           | 🔄 In Progress | Week 25-26 |

---

## Phase 0: Repository Setup

### Objectives

- [x] Define monorepo structure
- [x] Create CLAUDE.md for Claude Code
- [x] Create docker-compose.yml base
- [x] Initialize GitHub repository
- [x] Configure npm workspaces
- [x] Configure Poetry for Python
- [x] Set up Turborepo
- [x] Create .env.example
- [x] Add .gitignore and .dockerignore
- [x] Create initial README.md

### Deliverables

- [x] Empty monorepo with proper structure
- [x] Development environment documentation
- [ ] Contributing guidelines

---

## Phase 1: Shared Infrastructure

### Objectives

- [x] PostgreSQL with schema separation (ipam._, npm._, stig._, shared._)
- [x] Redis configuration for sessions/cache
- [x] NATS with JetStream streams configured
- [x] HashiCorp Vault secrets structure
- [x] Observability stack (Grafana, Prometheus, Loki, Jaeger)
- [x] VictoriaMetrics time-series database
- [x] Health check scripts

### Deliverables

- [x] `infrastructure/` directory complete
- [x] All services start with `docker compose --profile infra up`
- [x] Grafana dashboards provisioned
- [x] Database init scripts with schemas

### Security Checklist

- [ ] All default passwords changed
- [x] Vault initialized and unsealed (dev mode)
- [ ] TLS configured for inter-service communication
- [x] Network isolation verified

---

## Phase 2: Unified Authentication

### Objectives

- [x] Create `packages/shared-auth/` library
- [x] Implement JWT with RS256 (keys in Vault)
- [x] Implement Argon2id password hashing
- [x] Define RBAC roles: Admin, Operator, Viewer
- [x] Create `services/auth-service/` microservice
- [x] Session management in Redis
- [x] Audit logging for auth events

### Technical Decisions

| Decision      | Choice                   | Rationale                        |
| ------------- | ------------------------ | -------------------------------- |
| Token Type    | JWT (RS256)              | Stateless, Vault-managed keys    |
| Password Hash | Argon2id                 | OWASP recommended, GPU-resistant |
| Session Store | Redis                    | Fast, TTL support, cluster-ready |
| Token Expiry  | Access: 15m, Refresh: 7d | Balance security/UX              |

### Deliverables

- [x] `shared-auth` package published to workspace
- [x] Auth service with `/login`, `/refresh`, `/logout`, `/verify`
- [x] RBAC middleware for Fastify
- [ ] Python auth client library

---

## Phase 3: API Gateway Consolidation

### Objectives

- [x] Create unified Fastify gateway in `apps/gateway/`
- [x] Route structure: `/api/v1/ipam/*`, `/api/v1/npm/*`, `/api/v1/stig/*`
- [x] OpenAPI/Swagger documentation
- [x] Rate limiting per tenant/user
- [x] Request validation with Zod
- [x] OpenTelemetry instrumentation

### Technical Decisions

| Decision          | Choice                           | Rationale                                         |
| ----------------- | -------------------------------- | ------------------------------------------------- |
| Gateway Framework | Fastify 4.x                      | Performance, TypeScript support, plugin ecosystem |
| Documentation     | OpenAPI 3.1 via @fastify/swagger | Industry standard, auto-generated                 |
| Rate Limiting     | Redis-backed @fastify/rate-limit | Distributed, per-user/tenant limits               |
| Validation        | Zod schemas                      | Runtime type safety, TypeScript integration       |
| Tracing           | OpenTelemetry SDK                | Vendor-neutral, comprehensive instrumentation     |

### Deliverables

- [x] Single gateway handling all API routes
- [x] Auto-generated OpenAPI spec at /docs
- [x] Rate limiting configuration (100 req/min default)
- [x] Request/response logging to Loki

### API Routes Implemented

| Route                                 | Methods          | Description                            |
| ------------------------------------- | ---------------- | -------------------------------------- |
| `/healthz`, `/livez`, `/readyz`       | GET              | Health checks                          |
| `/api/v1/auth/*`                      | POST, GET        | Authentication (proxy to auth-service) |
| `/api/v1/ipam/networks`               | GET, POST        | Network management                     |
| `/api/v1/ipam/networks/:id`           | GET, PUT, DELETE | Network CRUD                           |
| `/api/v1/ipam/networks/:id/addresses` | GET              | IP addresses in network                |
| `/api/v1/npm/devices`                 | GET, POST        | Device monitoring                      |
| `/api/v1/npm/devices/:id`             | GET, DELETE      | Device CRUD                            |
| `/api/v1/npm/devices/:id/metrics`     | GET              | Device metrics                         |
| `/api/v1/npm/alerts`                  | GET              | Active alerts                          |
| `/api/v1/stig/benchmarks`             | GET              | STIG benchmarks                        |
| `/api/v1/stig/assets`                 | GET, POST        | Asset management                       |
| `/api/v1/stig/assets/:id/findings`    | GET              | Compliance findings                    |
| `/api/v1/stig/compliance/summary`     | GET              | Compliance summary                     |

---

## Phase 4: Frontend Unification

### Objectives

- [x] Create unified React app in `apps/web-ui/`
- [x] Implement module-based routing (IPAM, NPM, STIG)
- [x] Create `packages/shared-ui/` component library
- [x] Unified navigation and theming
- [x] Dashboard with cross-module widgets
- [x] State management with Zustand stores per module

### Technical Decisions

| Decision         | Choice            | Rationale                                       |
| ---------------- | ----------------- | ----------------------------------------------- |
| Framework        | React 18 + Vite 5 | Fast HMR, TypeScript support, modern tooling    |
| Styling          | Tailwind CSS 3.4  | Utility-first, dark mode support, small bundle  |
| State Management | Zustand           | Lightweight, TypeScript-native, no boilerplate  |
| Data Fetching    | TanStack Query 5  | Caching, background refetch, optimistic updates |
| Routing          | React Router 6    | Standard React routing, nested routes           |
| Charts           | Recharts 2.10     | React-native, composable, responsive            |
| Tables           | TanStack Table 8  | Headless, sorting, filtering, pagination        |

### Component Library (`@netnynja/shared-ui`)

| Category     | Components                            |
| ------------ | ------------------------------------- |
| Common       | Button, Card, Badge, Input            |
| Navigation   | TopNav, Sidebar                       |
| Data Display | DataTable, StatsCard, StatusIndicator |
| Forms        | Select, Checkbox                      |
| Charts       | LineChart, BarChart, PieChart         |
| Feedback     | Alert, Spinner                        |

### Module Pages Implemented

| Module    | Pages                                                                                     |
| --------- | ----------------------------------------------------------------------------------------- |
| Dashboard | Cross-module overview with stats and charts                                               |
| IPAM      | Networks list, Network detail with IP addresses, Scan management (edit/delete/export)     |
| NPM       | Devices list, Device detail with metrics, Alerts, SNMPv3 Credentials, Discovery, Groups   |
| STIG      | Benchmarks, Assets (editable), STIG Library (upload/manage), Checklist Import, Compliance |
| Syslog    | Events (real-time), Sources, Filters, Forwarders                                          |
| Settings  | User Management (create/edit/disable/reset password)                                      |

### Deliverables

- [x] Unified login experience
- [x] Module switching without page reload
- [x] Shared component library with TypeScript types
- [x] Dark/light theme support via Tailwind

---

## Phase 5: IPAM Migration

### Objectives

- [x] Migrate IPAM backend to `apps/ipam/`
- [x] Convert SQLite/SQLCipher → PostgreSQL
- [x] Preserve IP scanning functionality
- [x] Update frontend module in `apps/web-ui/src/modules/ipam/`
- [x] Migrate to JWT authentication
- [x] Add VictoriaMetrics for IP utilization metrics

### Technical Decisions

| Decision          | Choice               | Rationale                                      |
| ----------------- | -------------------- | ---------------------------------------------- |
| Backend Framework | FastAPI 0.109        | Async-native, OpenAPI generation, Python 3.11+ |
| Database ORM      | asyncpg (raw)        | Direct PostgreSQL with INET/CIDR type support  |
| Scanning          | AsyncIO + TCP probes | Non-blocking, concurrent host discovery        |
| Messaging         | NATS JetStream       | Async scan jobs with durability                |
| Metrics           | VictoriaMetrics push | Time-series utilization tracking               |

### Data Migration

- [x] Export script from SQLite (`scripts/migrate_sqlite_to_postgres.py`)
- [x] Schema translation to PostgreSQL with INET/CIDR types
- [x] Import validation via field mapping
- [x] Rollback procedure (script supports dry-run mode)

### IPAM Service Architecture

| Component       | Location                                        | Description              |
| --------------- | ----------------------------------------------- | ------------------------ |
| FastAPI App     | `apps/ipam/src/ipam/main.py`                    | Main service entry point |
| API Routes      | `apps/ipam/src/ipam/api/routes.py`              | REST endpoints           |
| Models          | `apps/ipam/src/ipam/models/`                    | Pydantic schemas         |
| DB Repository   | `apps/ipam/src/ipam/db/repository.py`           | PostgreSQL operations    |
| Scanner Service | `apps/ipam/src/ipam/services/scanner.py`        | Network discovery        |
| NATS Handler    | `apps/ipam/src/ipam/collectors/nats_handler.py` | Async job processing     |
| Metrics Service | `apps/ipam/src/ipam/services/metrics.py`        | VictoriaMetrics push     |

### API Endpoints Added

| Route                               | Methods            | Description               |
| ----------------------------------- | ------------------ | ------------------------- |
| `/api/v1/ipam/networks/:id/scan`    | POST               | Start network scan        |
| `/api/v1/ipam/scans/:scanId`        | GET, PATCH, DELETE | Get/update/delete scan    |
| `/api/v1/ipam/scans/:scanId/export` | GET                | Export scan to PDF/CSV    |
| `/api/v1/ipam/networks/:id/scans`   | GET                | List network scans        |
| `/api/v1/ipam/networks/:id/export`  | GET                | Export network to PDF/CSV |
| `/api/v1/ipam/addresses/add-to-npm` | POST               | Add IPAM addresses to NPM |
| `/api/v1/ipam/dashboard`            | GET                | Dashboard statistics      |
| `/api/v1/ipam/networks/:id/stats`   | GET                | Network utilization stats |

### Deliverables

- [x] IPAM fully operational in new architecture
- [x] SQLite to PostgreSQL migration script with CIDR/INET type handling
- [x] Async network scanning with concurrent host probing

---

## Phase 6: NPM Integration

### Objectives

- [x] Migrate NPM services to `apps/npm/`
- [x] Integrate existing collectors
- [x] Connect to shared VictoriaMetrics
- [x] Update frontend module
- [x] Integrate with unified alerting

### Technical Decisions

| Decision           | Choice            | Rationale                                      |
| ------------------ | ----------------- | ---------------------------------------------- |
| Backend Framework  | FastAPI 0.109     | Async-native, consistent with IPAM             |
| SNMP Library       | pysnmp            | Industry standard, async support               |
| SNMP Version       | SNMPv3 only       | FIPS compliance, no SNMPv1/v2c                 |
| Metrics Push       | VictoriaMetrics   | Prometheus-compatible, high performance        |
| Alert Evaluation   | NATS + PostgreSQL | Real-time with persistence                     |
| Credential Storage | AES-256-GCM       | FIPS-compliant encryption for SNMPv3 passwords |

### NPM Service Architecture

| Component       | Location                                      | Description                             |
| --------------- | --------------------------------------------- | --------------------------------------- |
| FastAPI App     | `apps/npm/src/npm/main.py`                    | Main service entry point                |
| API Routes      | `apps/npm/src/npm/api/routes.py`              | Device, interface, alert endpoints      |
| Models          | `apps/npm/src/npm/models/`                    | Pydantic schemas for all entities       |
| DB Repository   | `apps/npm/src/npm/db/repository.py`           | PostgreSQL operations for npm.\* schema |
| Device Service  | `apps/npm/src/npm/services/device.py`         | Business logic for device management    |
| Metrics Service | `apps/npm/src/npm/services/metrics.py`        | VictoriaMetrics integration             |
| SNMP Poller     | `apps/npm/src/npm/collectors/snmp_poller.py`  | Device polling and metric collection    |
| Alert Evaluator | `apps/npm/src/npm/services/alert_service.py`  | Rule evaluation and alert generation    |
| NATS Handler    | `apps/npm/src/npm/collectors/nats_handler.py` | Message streaming for metrics/alerts    |

### API Endpoints Added

| Route                                        | Methods          | Description                     |
| -------------------------------------------- | ---------------- | ------------------------------- |
| `/api/v1/npm/devices`                        | GET, POST        | Device list and creation        |
| `/api/v1/npm/devices/:id`                    | GET, PUT, DELETE | Device CRUD                     |
| `/api/v1/npm/devices/:id/interfaces`         | GET              | Device interfaces               |
| `/api/v1/npm/devices/:id/metrics`            | GET              | Device performance metrics      |
| `/api/v1/npm/interfaces/:id`                 | PUT              | Interface configuration         |
| `/api/v1/npm/interfaces/:id/metrics`         | GET              | Interface traffic metrics       |
| `/api/v1/npm/alerts`                         | GET              | Alert listing with filters      |
| `/api/v1/npm/alerts/:id/acknowledge`         | POST             | Acknowledge alert               |
| `/api/v1/npm/alerts/:id/resolve`             | POST             | Resolve alert                   |
| `/api/v1/npm/alert-rules`                    | GET, POST        | Alert rule management           |
| `/api/v1/npm/alert-rules/:id`                | GET, PUT, DELETE | Alert rule CRUD                 |
| `/api/v1/npm/dashboard`                      | GET              | Dashboard stats and top metrics |
| `/api/v1/npm/snmpv3-credentials`             | GET, POST        | SNMPv3 credential management    |
| `/api/v1/npm/snmpv3-credentials/:id`         | GET, PUT, DELETE | SNMPv3 credential CRUD          |
| `/api/v1/npm/snmpv3-credentials/:id/test`    | POST             | Test credential against device  |
| `/api/v1/npm/snmpv3-credentials/:id/devices` | GET              | Get devices using credential    |
| `/api/v1/npm/discovery/jobs`                 | GET, POST        | Discovery job management        |
| `/api/v1/npm/discovery/jobs/:id`             | GET              | Discovery job details           |
| `/api/v1/npm/discovery/jobs/:id/hosts`       | GET, PATCH       | Discovered hosts (site assign)  |
| `/api/v1/npm/discovery/jobs/:id/sites`       | GET              | Site list with counts           |
| `/api/v1/npm/reports/health`                 | GET              | Health report PDF/CSV           |
| `/api/v1/npm/reports/devices/:id`            | GET              | Device report PDF               |
| `/api/v1/npm/devices/:id/interfaces`         | GET              | Device interfaces               |
| `/api/v1/npm/devices/:id/volumes`            | GET              | Device volumes                  |
| `/api/v1/npm/interfaces/:id/metrics`         | GET              | Interface metrics history       |
| `/api/v1/npm/volumes/:id/metrics`            | GET              | Volume metrics history          |
| `/api/v1/npm/dashboard`                      | GET              | Optimized dashboard stats       |
| `/api/v1/npm/devices/status`                 | GET              | Lightweight bulk status         |
| `/api/v1/npm/devices/:id/poll`               | POST             | On-demand device polling        |
| `/api/v1/npm/poller/status`                  | GET              | Background poller status        |
| `/api/v1/npm/poller/start`                   | POST             | Start background poller (admin) |
| `/api/v1/npm/poller/stop`                    | POST             | Stop background poller (admin)  |

### SNMPv3 Credential Management

| Feature               | Description                                        |
| --------------------- | -------------------------------------------------- |
| Security Levels       | noAuthNoPriv, authNoPriv, authPriv                 |
| Auth Protocols (FIPS) | SHA, SHA-224, SHA-256, SHA-384, SHA-512 (no MD5)   |
| Privacy Protocols     | AES, AES-192, AES-256 (no DES/3DES)                |
| Password Encryption   | AES-256-GCM with scrypt key derivation             |
| Credential Testing    | Validate credentials against devices before saving |
| Device Association    | Multiple devices can share a single credential     |

### Deliverables

- [x] Complete NPM Python backend (`apps/npm/`) with FastAPI
- [x] SNMP polling framework with concurrent device polling
- [x] VictoriaMetrics integration for device and interface metrics
- [x] Alert evaluation service with rule-based alerting
- [x] NATS JetStream integration for metrics streaming
- [x] Grafana dashboard for NPM metrics (`npm-overview.json`)
- [x] Docker Compose services: npm-service, npm-collector, npm-alerts
- [x] Frontend module integration with routing
- [x] SNMPv3 credential management with FIPS-compliant protocols
- [x] AES-256-GCM encrypted password storage
- [x] Flexible device polling (ICMP only, SNMPv3 only, or both)
- [x] Network discovery with ICMP/SNMPv3 and fingerprinting
- [x] Site-based grouping of discovered hosts
- [x] Device metrics (CPU, memory, latency, availability)
- [x] Interface and volume monitoring with metrics history
- [x] Health/status PDF and CSV export
- [x] Scaled for 3000+ devices with optimized queries

---

## Phase 7: STIG Manager Integration

### Objectives

- [x] Migrate STIG services to `apps/stig/`
- [x] Integrate collectors (SSH, Netmiko)
- [x] Connect to shared audit logging
- [x] Update frontend module
- [x] Integrate report generation

### Technical Decisions

| Decision          | Choice            | Rationale                              |
| ----------------- | ----------------- | -------------------------------------- |
| Backend Framework | FastAPI 0.109     | Async-native, consistent with IPAM/NPM |
| SSH Library       | asyncssh          | Native async SSH client                |
| Network Devices   | Netmiko 4.3       | Multi-vendor CLI automation            |
| Report Formats    | CKL, PDF, JSON    | DoD standard + management reporting    |
| PDF Generation    | ReportLab         | Pure Python, no external dependencies  |
| XML Parsing       | lxml + defusedxml | Fast parsing with security protections |

### STIG Service Architecture

| Component          | Location                                        | Description                                 |
| ------------------ | ----------------------------------------------- | ------------------------------------------- |
| FastAPI App        | `apps/stig/src/stig/main.py`                    | Main service entry point (port 3005)        |
| API Routes         | `apps/stig/src/stig/api/routes.py`              | Target, definition, audit, report endpoints |
| Models             | `apps/stig/src/stig/models/`                    | Pydantic schemas for all entities           |
| DB Repository      | `apps/stig/src/stig/db/repository.py`           | PostgreSQL operations for stig.\* schema    |
| Audit Service      | `apps/stig/src/stig/services/audit.py`          | Audit orchestration and job management      |
| Compliance Service | `apps/stig/src/stig/services/compliance.py`     | Dashboard and analytics                     |
| Vault Service      | `apps/stig/src/stig/services/vault.py`          | Credential retrieval from HashiCorp Vault   |
| SSH Auditor        | `apps/stig/src/stig/collectors/ssh_auditor.py`  | SSH-based compliance checks                 |
| Netmiko Auditor    | `apps/stig/src/stig/collectors/ssh_auditor.py`  | Network device auditing                     |
| NATS Handler       | `apps/stig/src/stig/collectors/nats_handler.py` | Async job processing                        |
| CKL Exporter       | `apps/stig/src/stig/reports/ckl.py`             | DISA STIG Viewer format export              |
| PDF Exporter       | `apps/stig/src/stig/reports/pdf.py`             | Management report generation                |
| Report Generator   | `apps/stig/src/stig/reports/generator.py`       | Report orchestration service                |

### API Endpoints Added

| Route                             | Methods          | Description                    |
| --------------------------------- | ---------------- | ------------------------------ |
| `/api/v1/stig/targets`            | GET, POST        | Target list and creation       |
| `/api/v1/stig/targets/:id`        | GET, PUT, DELETE | Target CRUD                    |
| `/api/v1/stig/definitions`        | GET              | STIG definitions list          |
| `/api/v1/stig/definitions/:id`    | GET              | Definition details with rules  |
| `/api/v1/stig/audits`             | GET, POST        | Audit job list and creation    |
| `/api/v1/stig/audits/:id`         | GET              | Audit job details              |
| `/api/v1/stig/audits/:id/cancel`  | POST             | Cancel running audit           |
| `/api/v1/stig/audits/:id/results` | GET              | Audit findings with pagination |
| `/api/v1/stig/audits/:id/summary` | GET              | Compliance summary for audit   |
| `/api/v1/stig/reports/generate`   | POST             | Generate CKL/PDF report        |
| `/api/v1/stig/dashboard`          | GET              | Dashboard stats and trends     |
| `/api/v1/stig/compliance/summary` | GET              | Overall compliance metrics     |

### Supported Platforms

| Platform                   | Connection Type | Status    |
| -------------------------- | --------------- | --------- |
| Linux (RHEL, Ubuntu, etc.) | SSH             | Supported |
| macOS                      | SSH             | Supported |
| Windows                    | WinRM           | Planned   |
| Cisco IOS                  | Netmiko         | Supported |
| Cisco NX-OS                | Netmiko         | Supported |
| Arista EOS                 | Netmiko         | Supported |
| HP ProCurve                | Netmiko         | Supported |
| Juniper JunOS              | Netmiko         | Supported |
| Palo Alto                  | Netmiko         | Supported |
| Fortinet                   | Netmiko         | Supported |
| F5 BIG-IP                  | Netmiko         | Supported |
| VMware ESXi                | SSH             | Supported |
| VMware vCenter             | API             | Supported |
| pfSense                    | SSH             | Supported |
| HPE Aruba                  | Netmiko         | Supported |
| Mellanox                   | Netmiko         | Supported |
| FreeBSD                    | SSH             | Supported |

### Deliverables

- [x] Complete STIG Python backend (`apps/stig/`) with FastAPI
- [x] Pydantic models for targets, definitions, audits, results
- [x] asyncpg database layer with PostgreSQL stig.\* schema support
- [x] SSH auditing with asyncssh for Linux/Unix systems
- [x] Netmiko integration for network device auditing
- [x] Vault integration for secure credential storage
- [x] CKL export for DISA STIG Viewer compatibility
- [x] PDF report generation with compliance summaries
- [x] NATS JetStream integration for async audit processing
- [x] Grafana dashboard for STIG compliance overview
- [x] Docker Compose services: stig-service, stig-collector, stig-reports
- [x] Frontend module index with route configuration

---

## Phase 8: Cross-Platform Testing

### Test Matrix

| Platform       | Docker | Compose | Network | Vault | Status                   |
| -------------- | ------ | ------- | ------- | ----- | ------------------------ |
| macOS (ARM64)  | ✅     | ✅      | ✅      | ✅    | Complete (28/28 pass)    |
| macOS (x64)    | ⬜     | ⬜      | ⬜      | ⬜    | Deferred (needs Intel)   |
| RHEL 9.x       | ✅     | ✅      | ✅      | ✅    | Validated (12/12 pass)   |
| Windows 11     | ✅     | ✅      | ✅      | ✅    | Complete (10/10 healthy) |
| Windows Server | ⬜     | ⬜      | ⬜      | ⬜    | Script Ready             |

### macOS ARM64 Test Results (2026-01-07)

**Environment:**

- macOS 26.2 (Darwin 25.2.0)
- Docker 29.1.3 / Compose 2.40.3
- Architecture: aarch64

**Test Summary:** 28 tests passed, 0 failed, 100% pass rate

| Category       | Tests | Status |
| -------------- | ----- | ------ |
| Prerequisites  | 10    | ✅     |
| Infrastructure | 14    | ✅     |
| Network        | 10    | ✅     |
| Vault          | 4     | ✅     |
| API Gateway    | 10    | ✅     |
| Frontend       | 5     | ✅     |

### Windows 11 Test Results (2026-01-14)

**Environment:**

- Windows 11 Pro + Docker Desktop 29.1.3 + WSL2
- Node.js v24.12.0 | npm 11.6.2
- Architecture: x64

**Test Summary:** All 10 infrastructure containers healthy

| Service         | Port(s)    | Status     |
| --------------- | ---------- | ---------- |
| PostgreSQL      | 5433       | ✅ Healthy |
| Redis           | 6379       | ✅ Healthy |
| NATS            | 4222, 8322 | ✅ Healthy |
| Vault           | 8300       | ✅ Healthy |
| Prometheus      | 9090       | ✅ Healthy |
| Grafana         | 3002       | ✅ Healthy |
| VictoriaMetrics | 8428       | ✅ Healthy |
| Loki            | 3100       | ✅ Healthy |
| Jaeger          | 16686      | ✅ Healthy |
| Promtail        | -          | ✅ Running |

**Windows-Specific Fixes Applied:**

- NATS monitor port: 8222 → 8322 (avoid Hyper-V reserved range 8139-8238)
- Vault external port: 8200 → 8300 (avoid Hyper-V reserved range)
- Observability ports bound to 127.0.0.1 for security

### Platform-Specific Issues Log

| Issue  | Platform    | Status   | Notes                                                            |
| ------ | ----------- | -------- | ---------------------------------------------------------------- |
| P8-001 | macOS ARM64 | Resolved | Port conflict: Grafana 3000 vs Vite 3000 - moved Grafana to 3002 |
| P8-002 | macOS ARM64 | Resolved | Port conflict: Auth service 3002 vs Grafana - moved auth to 3006 |
| P8-003 | Windows 11  | Resolved | Hyper-V port conflict: NATS 8222 - moved to 8322                 |
| P8-004 | Windows 11  | Resolved | Hyper-V port conflict: Vault 8200 - moved to 8300                |

### Port Allocation (Standardized)

| Port  | Service                     |
| ----- | --------------------------- |
| 3000  | Web UI (Vite dev server)    |
| 3001  | API Gateway                 |
| 3002  | Grafana                     |
| 3003  | IPAM Service                |
| 3004  | NPM Service                 |
| 3005  | STIG Service                |
| 3006  | Auth Service                |
| 4222  | NATS Client                 |
| 5433  | PostgreSQL (host mapping)   |
| 6379  | Redis                       |
| 8300  | Vault (Windows-safe)        |
| 8322  | NATS Monitor (Windows-safe) |
| 8428  | VictoriaMetrics             |
| 9090  | Prometheus                  |
| 3100  | Loki                        |
| 16686 | Jaeger UI                   |

### RHEL 9.x Test Results (2026-01-07)

**Environment:**

- RHEL 9.x (UBI 9 Minimal container)
- Validated via Docker container on ARM64 host
- Tests: Container connectivity, HTTP endpoints, Dockerfile compatibility

**Test Summary:** 12 tests passed, 0 failed, 3 skipped (RHEL-native features)

| Category               | Tests | Status     |
| ---------------------- | ----- | ---------- |
| Container Connectivity | 6     | ✅         |
| HTTP Endpoints         | 4     | ✅         |
| Dockerfile Compat      | 2     | ✅         |
| RHEL-Native (SELinux)  | 3     | ⏭️ Skipped |

**RHEL Recommendations:**

- Use `:Z` suffix for bind mounts when SELinux is enforcing
- Consider Podman as Docker alternative (rootless by default)
- Open firewalld ports: 3000-3006, 4222, 5433, 6379, 8200, 8222, 8428, 9090, 3100, 16686

### Windows Test Scripts (Ready for Execution)

**Scripts Created:**

- `tests/smoke/windows-smoke-test.ps1` - PowerShell 5.1/7.x compatible
- Validates: Docker Desktop, WSL2, Linux containers mode, port connectivity
- Windows-specific: Long paths, Defender exclusions, Git line endings

### Deliverables

- [x] macOS ARM64 smoke tests pass (28/28)
- [ ] macOS x64 smoke tests (deferred - requires Intel Mac)
- [x] RHEL 9.x smoke tests (validated via container)
- [x] Windows 11 smoke tests pass (10/10 healthy)
- [ ] Windows Server smoke tests (script ready)
- [x] Platform-specific documentation (tests/smoke/)
- [x] Known issues documented
- [x] Cross-platform smoke test scripts created
- [x] Windows Hyper-V port compatibility fixes applied

---

## Phase 9: CI/CD & Release

### Objectives

- [x] GitHub Actions CI pipeline
- [x] Automated testing on all platforms
- [x] Container image building and scanning
- [x] Release tagging and changelog generation
- [x] Multi-platform Docker images (linux/amd64, linux/arm64)

### GitHub Actions Workflows

| Workflow            | File                      | Triggers                  | Description                                 |
| ------------------- | ------------------------- | ------------------------- | ------------------------------------------- |
| Tests               | `test.yml`                | Push to main/develop, PRs | TypeScript and Python tests with coverage   |
| Security Scan       | `security-scan.yml`       | Push, PRs                 | Trivy, CodeQL, npm audit, safety            |
| Build Images        | `build-images.yml`        | Push, releases            | Multi-platform Docker builds (amd64, arm64) |
| Release             | `release.yml`             | Version tags (v*.*.\*)    | Full release automation with changelog      |
| Validate Workspaces | `validate-workspaces.yml` | Push                      | Cross-platform npm workspace validation     |
| Validate Poetry     | `validate-poetry.yml`     | Push                      | Cross-platform Python validation            |

### Release Process

1. **Tag Creation**: Push a tag matching `v*.*.*` pattern
2. **Tests**: All tests run automatically before release
3. **Image Build**: Multi-platform images built for all 7 services
4. **Security Scan**: Trivy scans all images for vulnerabilities
5. **Release Creation**: GitHub release with auto-generated changelog
6. **Artifact Upload**: Docker Compose bundle with checksums

### Container Images

Published to GitHub Container Registry (`ghcr.io/remeadows/`):

| Image                   | Description            |
| ----------------------- | ---------------------- |
| `netnynja-gateway`      | Fastify API Gateway    |
| `netnynja-web-ui`       | React Frontend         |
| `netnynja-auth-service` | Authentication Service |
| `netnynja-ipam`         | IPAM Python Service    |
| `netnynja-npm`          | NPM Python Service     |
| `netnynja-stig`         | STIG Python Service    |
| `netnynja-syslog`       | Syslog Python Service  |

### Release Artifacts

- [x] Docker Compose bundle (development)
- [x] Helm charts (Kubernetes) - `charts/netnynja-enterprise/`
- [ ] Platform-specific installers (deferred)

### Helm Chart

Located in `charts/netnynja-enterprise/`:

| File                                | Description                      |
| ----------------------------------- | -------------------------------- |
| `Chart.yaml`                        | Chart metadata with dependencies |
| `values.yaml`                       | Default configuration values     |
| `templates/_helpers.tpl`            | Template helper functions        |
| `templates/gateway-deployment.yaml` | Gateway deployment and service   |
| `templates/web-ui-deployment.yaml`  | Web UI deployment and service    |
| `templates/secrets.yaml`            | Database and JWT secrets         |
| `templates/ingress.yaml`            | Optional ingress configuration   |
| `templates/serviceaccount.yaml`     | Service account                  |

### Deliverables

- [x] Automated releases on tag push
- [x] Container images in registry (on release)
- [x] Helm charts for Kubernetes deployment
- [ ] Documentation site deployed (optional)

---

## Risk Register

| Risk                              | Likelihood | Impact | Mitigation                            |
| --------------------------------- | ---------- | ------ | ------------------------------------- |
| IPAM data migration issues        | Medium     | High   | Extensive testing, rollback plan      |
| Cross-platform Docker differences | Medium     | Medium | Early testing, documented workarounds |
| Performance regression            | Low        | High   | Benchmark suite, load testing         |
| Authentication breaking changes   | Low        | High   | Feature flags, gradual rollout        |

---

## Security Review (Codex 2026-01-10)

### Summary

| Metric             | Value                      |
| ------------------ | -------------------------- |
| Security Posture   | Medium                     |
| CI Readiness       | At-Risk                    |
| Critical Issues    | 3 (SR-001, SR-002, SR-004) |
| High/Medium Issues | 7                          |
| Low Issues         | 2                          |

### Top 5 Actions for CI Green Path

1. **Remove default admin seed credentials** - Replace with bootstrap flow requiring explicit password
2. **Fix Prettier failures on Helm templates** - Exclude from Prettier or use prettier-plugin-helm
3. **Replace default encryption/JWT secrets** - Require non-default values at startup
4. **Restrict /metrics endpoint** - Add auth or IP allowlist
5. **Address npm audit highs** - Update react-router-dom and vite

### Priority Timeline

| Timeline | Actions                                                           |
| -------- | ----------------------------------------------------------------- |
| < 1 hour | Fix Helm formatting, remove seed password, lock down /metrics     |
| Same day | Rotate encryption keys, enforce JWT aud/iss, upgrade dependencies |
| Backlog  | NATS TLS/creds validation, reduce metrics cardinality             |

### Security Checklist (Updated)

- [ ] Default admin seed password removed (SR-001)
- [ ] JWT_SECRET required in STIG config (SR-002)
- [ ] JWT audience/issuer verification enabled (SR-003)
- [ ] SNMPv3 encryption key required, per-record salt (SR-004)
- [ ] NPM_CREDENTIAL_KEY required, per-instance salt (SR-005)
- [ ] /metrics endpoint protected (SR-006)
- [ ] Auth tokens moved to HttpOnly cookies (SR-007)
- [ ] CORS allowlist required in production (SR-008)
- [ ] NATS TLS/auth enforced for non-dev (SR-009)
- [ ] Prometheus labels escaped, cardinality reduced (SR-010)
- [ ] react-router-dom and vite upgraded (SR-011)
- [ ] Helm templates excluded from Prettier (SR-012)

---

## Dependencies

### External Dependencies

| Package    | Current | Target | Breaking Changes |
| ---------- | ------- | ------ | ---------------- |
| Node.js    | 20.x    | 20.x   | None             |
| Python     | 3.11+   | 3.11+  | None             |
| PostgreSQL | 15      | 15     | None             |
| Redis      | 7       | 7      | None             |
| NATS       | 2.10    | 2.10   | None             |

### Internal Dependencies

- IPAM depends on: shared-auth, shared-types
- NPM depends on: shared-auth, shared-types, shared-ui
- STIG depends on: shared-auth, shared-types, shared-ui

---

## Meeting Notes

### 2025-01-05 - Project Kickoff

- Defined monorepo structure
- Created CLAUDE.md for Claude Code integration
- Identified auth alignment (JWT + Argon2id)
- Created base docker-compose.yml

---

## Changelog

### [Unreleased]

#### Session 2026-01-14 (Late PM): Final Security Hardening

**SEC-008: NATS Auth/TLS for Production:**

- Created `infrastructure/nats/nats.prod.conf` with authentication and TLS enabled
- Updated `infrastructure/nats/nats.conf` with security note pointing to prod config
- Created `infrastructure/scripts/generate-nats-certs.sh` for TLS certificate generation
- Added NATS_USER, NATS_PASSWORD, NATS_TLS_ENABLED to `.env.example`

**SEC-009: Configurable trustProxy:**

- Added TRUST_PROXY configuration option to auth-service config schema
- Updated auth-service to use configurable trustProxy (default: true in dev, false in prod)
- Added TRUST_PROXY documentation to `.env.example`

**Release Ready:**

- All security findings from Codex Review 2026-01-14 resolved
- Security posture: Low (0 open issues)
- Ready for v0.2.3 release tag

#### Session 2026-01-14 (AM): E2E Blocker Fixes & Security Hardening

**E2E Testing Unblocked:**

- Fixed APP-012: Converted preflight.sh from CRLF to LF line endings
- Fixed APP-013: Created preflight.ps1 PowerShell script for native Windows support
- Fixed APP-014: Corrected OpenAPI endpoint from `/api/docs/openapi.json` to `/docs/json`
- Created run-preflight.cmd Windows wrapper script

**Security Hardening:**

- SEC-006: Verified .env is properly gitignored (was already compliant)
- SEC-007: Bound Postgres, Redis, NATS ports to 127.0.0.1 only in docker-compose.yml
- Security posture improved from Medium to Low (2 low-priority items remaining)

**Status:** All preflight checks pass (14/14). E2E testing ready.

#### Session 2026-01-14 (Late PM): MIB Downloads & Codex Review Integration

**Vendor MIB Library:**

- Created `infrastructure/mibs/` directory structure with 7 vendor subdirectories
- Downloaded 30 MIB files from official vendor sources:
  - Arista: 5 MIBs (Products, SMI, Entity Sensor, Interface, BGP)
  - HPE Aruba: 4 MIBs (Base, Switch, Wireless, System Extension)
  - Juniper: 5 MIBs (Base, SMI, Chassis, Interface, Alarm)
  - Mellanox: 3 MIBs (Base, Products, Textual Conventions)
  - pfSense: 4 MIBs (Begemot PF, Host Resources, UCD-SNMP)
  - Sophos: 2 MIBs (SFOS Firewall)
  - Standard: 8 MIBs (IF-MIB, ENTITY-MIB, SNMPv2-\*)

**NPM OID Mappings:**

- Created `apps/npm/src/npm/collectors/oid_mappings.py` (500+ OID definitions)
- Vendor auto-detection via sysObjectID prefix matching
- Standard OIDs: System, Interfaces (32/64-bit), Host Resources, Entity Sensors
- Vendor-specific OIDs: CPU, memory, disk, temperature, fan speed, BGP, VPN, firewall states
- Updated `snmp_poller.py` to import from centralized OID mappings

**Codex Review 2026-01-14 Integration:**

- Added 7 new issues from Codex review to IssuesTracker.md:
  - APP-012: Preflight CRLF errors on Windows (Critical)
  - APP-013: Preflight Docker checks fail (Critical)
  - APP-014: OpenAPI endpoint mismatch (High)
  - SEC-006: .env tracked with secrets (High)
  - SEC-007: DB/Cache ports exposed (High)
  - SEC-008: NATS auth/TLS disabled (Medium)
  - SEC-009: trustProxy always true (Low)
- E2E tests blocked until APP-012/APP-013 resolved

#### Session 2026-01-14 (PM): Documentation Restructure

**IssuesTracker Optimization:**

- Created `IssuesTracker.archive.md` with 123 resolved issues (2026-01-06 to 2026-01-14)
- Slimmed `IssuesTracker.md` from ~600 lines to 116 lines (~80% reduction)
- Added NOW/NEXT/BLOCKED header for instant agent situational awareness
- Added archiving instructions with clear triggers (50 issues, major release, quarterly)
- Kept "Recently Resolved (Last 30 Days)" section for context
- Added archive reference table linking to historical issues

**Token Efficiency Improvements:**

- Reduced agent context load significantly
- Compact table format for resolved issues (one-line resolutions)
- Clear separation between active tracking and historical archive

#### Session 2026-01-14: Windows Platform Testing & CI Fixes

**Windows 11 Platform Testing:**

- Successfully completed Windows 11 smoke tests with all 10 infrastructure containers healthy
- Applied Hyper-V port compatibility fixes:
  - NATS monitor port: 8222 → 8322 (avoid reserved range 8139-8238)
  - Vault external port: 8200 → 8300 (avoid reserved range)
- Updated docker-compose.yml, preflight.sh, windows-smoke-test.ps1, test_06_integration.py
- Fixed PowerShell variable parsing issue in smoke test script ($Error → $ErrorMsg)
- Bound observability services to 127.0.0.1 for security (SEC-005)

**CI/CD Fixes:**

- CI-013: Fixed shared-types module not found in test workflow
  - Simplified package.json exports (removed invalid subpath exports)
  - Reordered exports to put `types` first per Node.js best practices
  - Disabled DTS in auth-service (applications don't need type declarations)
- CI-005: Fixed validate-workspaces workflow using wrong build command
  - Changed from `npm run build --workspaces` to `npm run build` (Turborepo)

**Codex Review Findings (2026-01-12) - All Resolved:**

- SEC-004: ZIP safety limits already implemented (500 files, 100MB uncompressed)
- SEC-005: Observability ports bound to localhost only
- APP-002: Fixed CODEXCHECK.md preflight script path
- APP-005: Relaxed ruff/mypy configuration for gradual adoption

#### Session 2026-01-12: NPM Enhanced Device Metrics

**NPM Module Enhancements:**

- Added disk/storage metrics collection via SNMP (Sophos SFOS-FIREWALL-MIB)
  - Disk utilization percentage, total capacity, used space
  - Swap utilization percentage and total capacity
- Added interface traffic summaries (IF-MIB RFC 2863)
  - Total inbound/outbound octets aggregation
  - Total inbound/outbound error counts
  - 64-bit counter support (HC counters) for high-speed interfaces
- Added Sophos service status monitoring (20+ services)
  - Anti-Virus, IPS, Web Filter, VPN, etc.
  - Service status displayed on Device Detail page
- Database schema updates:
  - Migration script for existing databases (001_add_disk_service_metrics.sql)
  - New columns in npm.device_metrics table
  - JSONB services_status column with GIN index
- Frontend enhancements:
  - Disk Utilization card on Device Detail page
  - Swap Usage, Traffic In/Out, Interface Errors cards
  - Service Status card with color-coded indicators
- Fixed pysnmp 7.x async iteration issue (bulk_cmd → next_cmd)

**Bug Fixes:**

- APP-008: Fixed STIG Library page 500 error (missing database tables)
- APP-009: Fixed auto-polling not working (database tables missing)
- APP-010: Fixed NPM Poll Now fails (created npm.device_metrics table)
- APP-011: Fixed Sidebar collapse toggle button not visible

#### Session 2026-01-10: Codex Security Review

**Security Review Completed:**

- Codex security analysis identified 12 findings across Secrets, Auth, Crypto, Messaging, Observability, Dependencies, and CI categories
- Security posture: Medium | CI readiness: At-risk
- 3 Critical issues: Default admin seed credentials, hardcoded JWT secret, default encryption key
- 7 High/Medium issues: JWT verification, CORS defaults, /metrics exposure, localStorage tokens
- 2 Low issues: NATS TLS/auth, metrics label cardinality

**Issues Added to Tracker (SR-001 through SR-012):**

- SR-001: Default admin seed credentials in repo
- SR-002: Hardcoded default JWT secret in STIG config
- SR-003: JWT audience/issuer verification disabled in STIG
- SR-004: Default encryption key + static salt for SNMPv3 credentials
- SR-005: NPM crypto uses JWT_SECRET fallback with static salt
- SR-006: Unauthenticated /metrics endpoint
- SR-007: Auth tokens stored in localStorage (XSS vulnerable)
- SR-008: CORS defaults to origin:true with credentials
- SR-009: NATS connection lacks TLS/auth enforcement
- SR-010: Prometheus metrics label escaping and cardinality
- SR-011: npm audit: React Router XSS + esbuild advisory
- SR-012: Prettier fails on Helm templates (CI blocker)

#### Session 2026-01-10: Issue Fixes and Phase 9 CI/CD

**Bug Fixes:**

- Fixed #104: NPM Poll Now PostgreSQL parameter type error
  - Created missing database tables (npm.device_metrics, npm.device_groups, npm.volumes, etc.)
  - Added missing group_id column to npm.devices table
  - Removed explicit ::boolean casts from INSERT statements
  - Added ::varchar type hint to UPDATE CASE statement
- Fixed #105: Intuitive SNMPv3 enablement in Device Properties
  - Added "Settings" button to DeviceDetailPage with gear icon
  - Created comprehensive Device Settings modal with polling method toggles
  - SNMPv3 credential dropdown with link to create new credentials
  - Poll interval and SNMP port configuration

**Phase 9 - CI/CD & Release:**

- Created `build-images.yml` workflow for multi-platform Docker builds
- Created `release.yml` workflow for automated releases
- Built Helm chart in `charts/netnynja-enterprise/` with:
  - Gateway and Web UI deployments
  - Secrets management
  - Ingress configuration
  - Bitnami subcharts for PostgreSQL, Redis, NATS

#### Session 2026-01-09: Bug Fixes and Documentation

- Fixed structlog `add_logger_name` incompatibility with `PrintLoggerFactory` in IPAM and NPM logging configs
- Fixed Python 3.11 type hint issue in STIG repository (`from __future__ import annotations`)
- Fixed pdfmake import for Node.js server-side usage in IPAM and NPM report routes
- Downgraded `@fastify/multipart` from v9 to v8 for Fastify 4.x compatibility
- Created comprehensive Docker Compose structure documentation (`DOCKER_STRUCTURE.md`)
- All core services verified running: Gateway, Auth, Web UI, IPAM, NPM, STIG

#### Phase 8: Cross-Platform Testing (In Progress)

- macOS ARM64 smoke tests: 28/28 passed (100%)
- RHEL 9.x smoke tests: 12/12 passed via container validation
- Windows 11/Server: PowerShell test scripts created, awaiting execution
- macOS x64: Test scripts created, awaiting Intel Mac
- Resolved port conflicts: Grafana (3000→3002), Auth service (3002→3006)
- Standardized port allocation across all services (3000-3006)
- Created comprehensive smoke test scripts for all platforms
- Test result files in JSON format (tests/smoke/results/)

#### NPM Module: SNMPv3 Credentials Management (2026-01-07)

- Created SNMPv3 credentials management system for FIPS compliance
- Database schema: `npm.snmpv3_credentials` table with encrypted password storage
- API routes: CRUD operations, credential testing, device association lookup
- Frontend: SNMPv3 Credentials page with create/edit/delete/test functionality
- Security levels: noAuthNoPriv, authNoPriv, authPriv
- Auth protocols (FIPS): SHA, SHA-224, SHA-256, SHA-384, SHA-512 (no MD5)
- Privacy protocols (FIPS): AES, AES-192, AES-256 (no DES/3DES)
- AES-256-GCM encryption for password storage with scrypt key derivation
- Updated device model: Flexible polling methods (ICMP only, SNMPv3 only, or both)
- Updated device form: Polling method checkboxes, conditional SNMPv3 credential selector
- Added SNMPv3 Credentials navigation item to NPM module sidebar
- Removed SNMPv1/v2c support in favor of SNMPv3 for FIPS compliance

### [0.1.0] - 2026-01-06

#### Phase 0: Repository Setup

- Initialized GitHub repository (remeadows/NetNynjaEnterprise)
- Configured npm workspaces with Turborepo
- Configured Poetry for Python dependencies
- Created .env.example, .gitignore, .dockerignore
- Organized monorepo structure with infrastructure/, packages/, apps/

#### Phase 1: Shared Infrastructure

- PostgreSQL 15 with schema separation (shared, ipam, npm, stig)
- 15 database tables created with proper indexes and triggers
- Redis 7 for sessions/cache
- NATS 2.10 with JetStream enabled
- HashiCorp Vault in dev mode with secrets structure
- VictoriaMetrics for time-series metrics
- Full observability stack: Grafana 10.2, Prometheus 2.48, Loki 2.9, Jaeger 1.51
- All services verified healthy via docker compose --profile infra

#### Phase 2: Unified Authentication

- `@netnynja/shared-auth` package with JWT (RS256/HS256) and Argon2id
- `@netnynja/shared-types` package with Zod validation schemas
- Auth service (`services/auth-service/`) with Fastify
- Endpoints: `/login`, `/refresh`, `/logout`, `/verify`, `/me`, `/healthz`
- Redis-based session management with refresh token rotation
- Failed login tracking and account lockout protection
- Comprehensive audit logging to PostgreSQL
- RBAC middleware for Fastify (requireAuth, requireAdmin, requireOperator)

#### Phase 3: API Gateway Consolidation

- Unified Fastify gateway (`apps/gateway/`) with plugin architecture
- OpenAPI 3.1 documentation via @fastify/swagger at `/docs`
- Rate limiting with Redis backend (100 req/min default)
- IPAM routes: networks CRUD, IP address listing
- NPM routes: devices CRUD, metrics, alerts
- STIG routes: benchmarks, assets, findings, compliance summary
- OpenTelemetry instrumentation for distributed tracing
- Centralized error handling with consistent API response format
- Auth integration via proxy to auth-service

#### Phase 4: Frontend Unification

- Unified React app (`apps/web-ui/`) with Vite 5 build system
- `@netnynja/shared-ui` component library (20+ reusable components)
- Module-based routing: `/ipam/*`, `/npm/*`, `/stig/*`
- TopNav with module switching, Sidebar with per-module navigation
- Cross-module dashboard with stats cards and charts
- Zustand stores for auth, theme, and per-module state (IPAM, NPM, STIG)
- Dark/light theme toggle with Tailwind CSS
- Login page with form validation and error handling
- IPAM module: Networks list, Network detail with IP addresses
- NPM module: Devices list, Device detail with metrics, Alerts management
- STIG module: Benchmarks browser, Assets management, Compliance overview

#### Phase 5: IPAM Migration

- Complete IPAM Python backend (`apps/ipam/`) with FastAPI 0.109
- Pydantic models with CIDR/INET validation using netaddr
- asyncpg database layer with PostgreSQL INET/CIDR type support
- Network scanning service with async TCP probing
- NATS JetStream integration for async scan job processing
- VictoriaMetrics integration for utilization metrics
- SQLite to PostgreSQL migration script with field mapping
- Gateway routes extended: scan endpoints, dashboard, network stats
- Docker Compose services: ipam-service (FastAPI), ipam-scanner (worker)

#### Phase 6: NPM Integration

- Complete NPM Python backend (`apps/npm/`) with FastAPI 0.109
- Pydantic models for devices, interfaces, alerts, and metrics
- asyncpg database layer with PostgreSQL npm.\* schema support
- SNMP polling framework with concurrent device/interface collection
- VictoriaMetrics integration for performance metrics
- Alert evaluation service with configurable rules and thresholds
- NATS JetStream integration for metrics and alert streaming
- Encrypted SNMP community storage using Fernet
- Grafana dashboard for NPM network overview
- Docker Compose services: npm-service (FastAPI), npm-collector (SNMP), npm-alerts
- Frontend module index with route configuration

#### Phase 7: STIG Manager Integration

- Complete STIG Python backend (`apps/stig/`) with FastAPI 0.109
- Pydantic models for targets, definitions, audits, results, reports
- asyncpg database layer with PostgreSQL stig.\* schema support
- SSH auditing with asyncssh for Linux/Unix systems
- Netmiko integration for multi-vendor network device auditing
- HashiCorp Vault integration for secure credential storage
- CKL (Checklist) export for DISA STIG Viewer compatibility
- PDF report generation with ReportLab (compliance summaries, findings)
- JSON export for programmatic access
- Audit orchestration service with job queue management
- Compliance analytics service with dashboard aggregations
- NATS JetStream integration for async audit job processing
- Grafana dashboard for STIG compliance overview
- Docker Compose services: stig-service (FastAPI), stig-collector (SSH), stig-reports (PDF/CKL)
- Frontend module index with route configuration
- Support for 16+ platforms: Linux, macOS, Windows, Cisco, Juniper, Palo Alto, Fortinet, F5, VMware, pfSense, HPE Aruba, Mellanox, FreeBSD
- STIG Library management (upload .zip, parse XCCDF, delete)
- Checklist import (.ckl, .cklb, .xml from STIG Viewer)
- Editable assets with STIG selection

#### Syslog Module (New)

- Complete Syslog Python backend (`apps/syslog/`) with asyncio
- UDP/TCP listener on port 514
- RFC 3164/5424 message parsing
- Device type detection (Cisco, Juniper, Palo Alto, Linux, Windows)
- Event type classification (authentication, security_alert, link_state)
- 10GB circular buffer with configurable retention
- Forward to external SIEM via UDP/TCP/TLS
- Frontend module with Events, Sources, Filters pages

#### Settings Module (New)

- User Management UI for admins
- Create, edit, disable users
- Role assignment (Admin/Operator/Viewer)
- Password reset by admin
- Account unlock functionality
- Self-disable and last admin protection

#### IPAM Enhancements (2026-01-08)

- Scan management: delete scans, edit scan name/notes
- Scan export to PDF and CSV with pdfmake
- Network export to PDF and CSV
- Add IPAM discovered addresses to NPM monitoring
- Host fingerprinting with TTL-based OS detection
- Confidence scoring (low/medium/high) for fingerprinting

#### NPM Enhancements (2026-01-08)

- Network discovery with ICMP/SNMPv3
- Host fingerprinting with vendor/model detection from SNMP and MAC OUI
- Site-based grouping for discovered hosts
- Device metrics (CPU, memory, latency, availability)
- Interface and volume metrics with history
- Health/status PDF and CSV export
- Scaled for 3000+ devices with optimized queries

#### NPM Poll Now & Background Polling (2026-01-09)

- Poll Now button with Ping/SNMPv3 method selection (#102)
- On-demand device polling via POST /api/v1/npm/devices/:id/poll
- ICMP ping with latency parsing and status update
- Poll results modal showing success/failure and latency
- Background poller plugin for continuous monitoring (#103)
- Configurable polling interval (default 5 minutes)
- Max concurrent polls (50), batch size (100)
- Auto-Polling status indicator on Devices page
- Poller control endpoints (start/stop/status)
- Known issue: PostgreSQL parameter type error on metrics insert (#104)

#### Development Infrastructure Improvements

- Cross-platform npm workspace validation (`scripts/validate-workspaces.sh`)
- Cross-platform Poetry validation (`scripts/validate-poetry.sh`, `scripts/validate-poetry.ps1`)
- Pre-commit hooks with Husky (lint-staged, conventional commits, security checks)
- Python pre-commit framework integration (black, ruff, mypy, bandit)
- Comprehensive unit test suite for gateway (67+ tests with Jest)
- Test coverage for config, rate-limit, and health plugins
- Enhanced OpenAPI 3.1.0 documentation with comprehensive schemas
- Performance benchmark suite using autocannon
  - Health endpoint benchmarks (healthz, livez, readyz)
  - Auth endpoint benchmarks (login, profile, refresh)
  - IPAM endpoint benchmarks (networks, subnets, addresses, devices)
- GitHub Actions workflows for CI/CD:
  - validate-workspaces.yml (cross-platform npm workspace validation)
  - validate-poetry.yml (cross-platform Python validation)
  - test.yml (TypeScript and Python test runner)
  - security-scan.yml (Trivy, CodeQL, npm audit)
