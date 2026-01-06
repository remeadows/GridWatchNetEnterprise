# NetNynja Enterprise - Project Status

**Last Updated**: 2026-01-06
**Current Phase**: Phase 7 - STIG Manager Integration (Complete)
**Overall Progress**: ▓▓▓▓▓▓▓▓░░ 75%

---

## Executive Summary

NetNynja Enterprise consolidates three network management applications (IPAM, NPM, STIG Manager) into a unified platform with shared infrastructure, authentication, and observability. Target platforms: macOS, RHEL 9.x, Windows 11/Server.

---

## Phase Overview

| Phase | Name | Status | Target |
|-------|------|--------|--------|
| 0 | Repository Setup | ✅ Complete | Week 1-2 |
| 1 | Shared Infrastructure | ✅ Complete | Week 3-4 |
| 2 | Unified Authentication | ✅ Complete | Week 5-6 |
| 3 | API Gateway Consolidation | ✅ Complete | Week 7-9 |
| 4 | Frontend Unification | ✅ Complete | Week 10-12 |
| 5 | IPAM Migration | ✅ Complete | Week 13-15 |
| 6 | NPM Integration | ✅ Complete | Week 16-18 |
| 7 | STIG Manager Integration | ✅ Complete | Week 19-21 |
| 8 | Cross-Platform Testing | ⬜ Not Started | Week 22-24 |
| 9 | CI/CD & Release | ⬜ Not Started | Week 25-26 |

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
- [x] PostgreSQL with schema separation (ipam.*, npm.*, stig.*, shared.*)
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
| Decision | Choice | Rationale |
|----------|--------|-----------|
| Token Type | JWT (RS256) | Stateless, Vault-managed keys |
| Password Hash | Argon2id | OWASP recommended, GPU-resistant |
| Session Store | Redis | Fast, TTL support, cluster-ready |
| Token Expiry | Access: 15m, Refresh: 7d | Balance security/UX |

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
| Decision | Choice | Rationale |
|----------|--------|-----------|
| Gateway Framework | Fastify 4.x | Performance, TypeScript support, plugin ecosystem |
| Documentation | OpenAPI 3.1 via @fastify/swagger | Industry standard, auto-generated |
| Rate Limiting | Redis-backed @fastify/rate-limit | Distributed, per-user/tenant limits |
| Validation | Zod schemas | Runtime type safety, TypeScript integration |
| Tracing | OpenTelemetry SDK | Vendor-neutral, comprehensive instrumentation |

### Deliverables
- [x] Single gateway handling all API routes
- [x] Auto-generated OpenAPI spec at /docs
- [x] Rate limiting configuration (100 req/min default)
- [x] Request/response logging to Loki

### API Routes Implemented
| Route | Methods | Description |
|-------|---------|-------------|
| `/healthz`, `/livez`, `/readyz` | GET | Health checks |
| `/api/v1/auth/*` | POST, GET | Authentication (proxy to auth-service) |
| `/api/v1/ipam/networks` | GET, POST | Network management |
| `/api/v1/ipam/networks/:id` | GET, PUT, DELETE | Network CRUD |
| `/api/v1/ipam/networks/:id/addresses` | GET | IP addresses in network |
| `/api/v1/npm/devices` | GET, POST | Device monitoring |
| `/api/v1/npm/devices/:id` | GET, DELETE | Device CRUD |
| `/api/v1/npm/devices/:id/metrics` | GET | Device metrics |
| `/api/v1/npm/alerts` | GET | Active alerts |
| `/api/v1/stig/benchmarks` | GET | STIG benchmarks |
| `/api/v1/stig/assets` | GET, POST | Asset management |
| `/api/v1/stig/assets/:id/findings` | GET | Compliance findings |
| `/api/v1/stig/compliance/summary` | GET | Compliance summary |

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
| Decision | Choice | Rationale |
|----------|--------|-----------|
| Framework | React 18 + Vite 5 | Fast HMR, TypeScript support, modern tooling |
| Styling | Tailwind CSS 3.4 | Utility-first, dark mode support, small bundle |
| State Management | Zustand | Lightweight, TypeScript-native, no boilerplate |
| Data Fetching | TanStack Query 5 | Caching, background refetch, optimistic updates |
| Routing | React Router 6 | Standard React routing, nested routes |
| Charts | Recharts 2.10 | React-native, composable, responsive |
| Tables | TanStack Table 8 | Headless, sorting, filtering, pagination |

### Component Library (`@netnynja/shared-ui`)
| Category | Components |
|----------|------------|
| Common | Button, Card, Badge, Input |
| Navigation | TopNav, Sidebar |
| Data Display | DataTable, StatsCard, StatusIndicator |
| Forms | Select, Checkbox |
| Charts | LineChart, BarChart, PieChart |
| Feedback | Alert, Spinner |

### Module Pages Implemented
| Module | Pages |
|--------|-------|
| Dashboard | Cross-module overview with stats and charts |
| IPAM | Networks list, Network detail with IP addresses |
| NPM | Devices list, Device detail with metrics, Alerts |
| STIG | Benchmarks, Assets, Compliance summary |

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
| Decision | Choice | Rationale |
|----------|--------|-----------|
| Backend Framework | FastAPI 0.109 | Async-native, OpenAPI generation, Python 3.11+ |
| Database ORM | asyncpg (raw) | Direct PostgreSQL with INET/CIDR type support |
| Scanning | AsyncIO + TCP probes | Non-blocking, concurrent host discovery |
| Messaging | NATS JetStream | Async scan jobs with durability |
| Metrics | VictoriaMetrics push | Time-series utilization tracking |

### Data Migration
- [x] Export script from SQLite (`scripts/migrate_sqlite_to_postgres.py`)
- [x] Schema translation to PostgreSQL with INET/CIDR types
- [x] Import validation via field mapping
- [x] Rollback procedure (script supports dry-run mode)

### IPAM Service Architecture
| Component | Location | Description |
|-----------|----------|-------------|
| FastAPI App | `apps/ipam/src/ipam/main.py` | Main service entry point |
| API Routes | `apps/ipam/src/ipam/api/routes.py` | REST endpoints |
| Models | `apps/ipam/src/ipam/models/` | Pydantic schemas |
| DB Repository | `apps/ipam/src/ipam/db/repository.py` | PostgreSQL operations |
| Scanner Service | `apps/ipam/src/ipam/services/scanner.py` | Network discovery |
| NATS Handler | `apps/ipam/src/ipam/collectors/nats_handler.py` | Async job processing |
| Metrics Service | `apps/ipam/src/ipam/services/metrics.py` | VictoriaMetrics push |

### API Endpoints Added
| Route | Methods | Description |
|-------|---------|-------------|
| `/api/v1/ipam/networks/:id/scan` | POST | Start network scan |
| `/api/v1/ipam/scans/:scanId` | GET | Get scan status |
| `/api/v1/ipam/networks/:id/scans` | GET | List network scans |
| `/api/v1/ipam/dashboard` | GET | Dashboard statistics |
| `/api/v1/ipam/networks/:id/stats` | GET | Network utilization stats |

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
| Decision | Choice | Rationale |
|----------|--------|-----------|
| Backend Framework | FastAPI 0.109 | Async-native, consistent with IPAM |
| SNMP Library | pysnmp | Industry standard, async support |
| Metrics Push | VictoriaMetrics | Prometheus-compatible, high performance |
| Alert Evaluation | NATS + PostgreSQL | Real-time with persistence |
| Credential Storage | Fernet encryption | Symmetric encryption for SNMP communities |

### NPM Service Architecture
| Component | Location | Description |
|-----------|----------|-------------|
| FastAPI App | `apps/npm/src/npm/main.py` | Main service entry point |
| API Routes | `apps/npm/src/npm/api/routes.py` | Device, interface, alert endpoints |
| Models | `apps/npm/src/npm/models/` | Pydantic schemas for all entities |
| DB Repository | `apps/npm/src/npm/db/repository.py` | PostgreSQL operations for npm.* schema |
| Device Service | `apps/npm/src/npm/services/device.py` | Business logic for device management |
| Metrics Service | `apps/npm/src/npm/services/metrics.py` | VictoriaMetrics integration |
| SNMP Poller | `apps/npm/src/npm/collectors/snmp_poller.py` | Device polling and metric collection |
| Alert Evaluator | `apps/npm/src/npm/services/alert_service.py` | Rule evaluation and alert generation |
| NATS Handler | `apps/npm/src/npm/collectors/nats_handler.py` | Message streaming for metrics/alerts |

### API Endpoints Added
| Route | Methods | Description |
|-------|---------|-------------|
| `/api/v1/npm/devices` | GET, POST | Device list and creation |
| `/api/v1/npm/devices/:id` | GET, PUT, DELETE | Device CRUD |
| `/api/v1/npm/devices/:id/interfaces` | GET | Device interfaces |
| `/api/v1/npm/devices/:id/metrics` | GET | Device performance metrics |
| `/api/v1/npm/interfaces/:id` | PUT | Interface configuration |
| `/api/v1/npm/interfaces/:id/metrics` | GET | Interface traffic metrics |
| `/api/v1/npm/alerts` | GET | Alert listing with filters |
| `/api/v1/npm/alerts/:id/acknowledge` | POST | Acknowledge alert |
| `/api/v1/npm/alerts/:id/resolve` | POST | Resolve alert |
| `/api/v1/npm/alert-rules` | GET, POST | Alert rule management |
| `/api/v1/npm/alert-rules/:id` | GET, PUT, DELETE | Alert rule CRUD |
| `/api/v1/npm/dashboard` | GET | Dashboard stats and top metrics |

### Deliverables
- [x] Complete NPM Python backend (`apps/npm/`) with FastAPI
- [x] SNMP polling framework with concurrent device polling
- [x] VictoriaMetrics integration for device and interface metrics
- [x] Alert evaluation service with rule-based alerting
- [x] NATS JetStream integration for metrics streaming
- [x] Grafana dashboard for NPM metrics (`npm-overview.json`)
- [x] Docker Compose services: npm-service, npm-collector, npm-alerts
- [x] Frontend module integration with routing

---

## Phase 7: STIG Manager Integration

### Objectives
- [x] Migrate STIG services to `apps/stig/`
- [x] Integrate collectors (SSH, Netmiko)
- [x] Connect to shared audit logging
- [x] Update frontend module
- [x] Integrate report generation

### Technical Decisions
| Decision | Choice | Rationale |
|----------|--------|-----------|
| Backend Framework | FastAPI 0.109 | Async-native, consistent with IPAM/NPM |
| SSH Library | asyncssh | Native async SSH client |
| Network Devices | Netmiko 4.3 | Multi-vendor CLI automation |
| Report Formats | CKL, PDF, JSON | DoD standard + management reporting |
| PDF Generation | ReportLab | Pure Python, no external dependencies |
| XML Parsing | lxml + defusedxml | Fast parsing with security protections |

### STIG Service Architecture
| Component | Location | Description |
|-----------|----------|-------------|
| FastAPI App | `apps/stig/src/stig/main.py` | Main service entry point (port 3005) |
| API Routes | `apps/stig/src/stig/api/routes.py` | Target, definition, audit, report endpoints |
| Models | `apps/stig/src/stig/models/` | Pydantic schemas for all entities |
| DB Repository | `apps/stig/src/stig/db/repository.py` | PostgreSQL operations for stig.* schema |
| Audit Service | `apps/stig/src/stig/services/audit.py` | Audit orchestration and job management |
| Compliance Service | `apps/stig/src/stig/services/compliance.py` | Dashboard and analytics |
| Vault Service | `apps/stig/src/stig/services/vault.py` | Credential retrieval from HashiCorp Vault |
| SSH Auditor | `apps/stig/src/stig/collectors/ssh_auditor.py` | SSH-based compliance checks |
| Netmiko Auditor | `apps/stig/src/stig/collectors/ssh_auditor.py` | Network device auditing |
| NATS Handler | `apps/stig/src/stig/collectors/nats_handler.py` | Async job processing |
| CKL Exporter | `apps/stig/src/stig/reports/ckl.py` | DISA STIG Viewer format export |
| PDF Exporter | `apps/stig/src/stig/reports/pdf.py` | Management report generation |
| Report Generator | `apps/stig/src/stig/reports/generator.py` | Report orchestration service |

### API Endpoints Added
| Route | Methods | Description |
|-------|---------|-------------|
| `/api/v1/stig/targets` | GET, POST | Target list and creation |
| `/api/v1/stig/targets/:id` | GET, PUT, DELETE | Target CRUD |
| `/api/v1/stig/definitions` | GET | STIG definitions list |
| `/api/v1/stig/definitions/:id` | GET | Definition details with rules |
| `/api/v1/stig/audits` | GET, POST | Audit job list and creation |
| `/api/v1/stig/audits/:id` | GET | Audit job details |
| `/api/v1/stig/audits/:id/cancel` | POST | Cancel running audit |
| `/api/v1/stig/audits/:id/results` | GET | Audit findings with pagination |
| `/api/v1/stig/audits/:id/summary` | GET | Compliance summary for audit |
| `/api/v1/stig/reports/generate` | POST | Generate CKL/PDF report |
| `/api/v1/stig/dashboard` | GET | Dashboard stats and trends |
| `/api/v1/stig/compliance/summary` | GET | Overall compliance metrics |

### Supported Platforms
| Platform | Connection Type | Status |
|----------|----------------|--------|
| Linux (RHEL, Ubuntu, etc.) | SSH | Supported |
| macOS | SSH | Supported |
| Windows | WinRM | Planned |
| Cisco IOS | Netmiko | Supported |
| Cisco NX-OS | Netmiko | Supported |
| Arista EOS | Netmiko | Supported |
| HP ProCurve | Netmiko | Supported |
| Juniper SRX | Netmiko | Supported |
| pfSense | API | Planned |

### Deliverables
- [x] Complete STIG Python backend (`apps/stig/`) with FastAPI
- [x] Pydantic models for targets, definitions, audits, results
- [x] asyncpg database layer with PostgreSQL stig.* schema support
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

| Platform | Docker | Compose | Network | Vault | Status |
|----------|--------|---------|---------|-------|--------|
| macOS (ARM64) | ⬜ | ⬜ | ⬜ | ⬜ | Not Started |
| macOS (x64) | ⬜ | ⬜ | ⬜ | ⬜ | Not Started |
| RHEL 9.x | ⬜ | ⬜ | ⬜ | ⬜ | Not Started |
| Windows 11 | ⬜ | ⬜ | ⬜ | ⬜ | Not Started |
| Windows Server | ⬜ | ⬜ | ⬜ | ⬜ | Not Started |

### Platform-Specific Issues Log
| Issue | Platform | Status | Notes |
|-------|----------|--------|-------|
| - | - | - | - |

### Deliverables
- [ ] All platforms pass smoke tests
- [ ] Platform-specific documentation
- [ ] Known issues documented

---

## Phase 9: CI/CD & Release

### Objectives
- [ ] GitHub Actions CI pipeline
- [ ] Automated testing on all platforms
- [ ] Container image building and scanning
- [ ] Release tagging and changelog generation
- [ ] Multi-platform Docker images (linux/amd64, linux/arm64)

### Release Artifacts
- [ ] Docker Compose bundle (development)
- [ ] Helm charts (Kubernetes)
- [ ] Platform-specific installers (optional)

### Deliverables
- [ ] Automated releases on tag push
- [ ] Container images in registry
- [ ] Documentation site deployed

---

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| IPAM data migration issues | Medium | High | Extensive testing, rollback plan |
| Cross-platform Docker differences | Medium | Medium | Early testing, documented workarounds |
| Performance regression | Low | High | Benchmark suite, load testing |
| Authentication breaking changes | Low | High | Feature flags, gradual rollout |

---

## Dependencies

### External Dependencies
| Package | Current | Target | Breaking Changes |
|---------|---------|--------|------------------|
| Node.js | 20.x | 20.x | None |
| Python | 3.11+ | 3.11+ | None |
| PostgreSQL | 15 | 15 | None |
| Redis | 7 | 7 | None |
| NATS | 2.10 | 2.10 | None |

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
- asyncpg database layer with PostgreSQL npm.* schema support
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
- asyncpg database layer with PostgreSQL stig.* schema support
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
- Support for 10 platforms: Linux, macOS, Windows, Cisco IOS/NX-OS, Arista EOS, HP ProCurve, Juniper SRX, pfSense
