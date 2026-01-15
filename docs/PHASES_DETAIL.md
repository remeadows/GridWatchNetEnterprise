# NetNynja Enterprise - Phase Implementation Details

> Detailed implementation documentation for all project phases (0-9)
>
> Extracted from PROJECT_STATUS.md for token efficiency

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

### SNMPv3 Credential Management

| Feature               | Description                                        |
| --------------------- | -------------------------------------------------- |
| Security Levels       | noAuthNoPriv, authNoPriv, authPriv                 |
| Auth Protocols (FIPS) | SHA, SHA-224, SHA-256, SHA-384, SHA-512 (no MD5)   |
| Privacy Protocols     | AES, AES-192, AES-256 (no DES/3DES)                |
| Password Encryption   | AES-256-GCM with scrypt key derivation             |
| Credential Testing    | Validate credentials against devices before saving |
| Device Association    | Multiple devices can share a single credential     |

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
| NATS Handler       | `apps/stig/src/stig/collectors/nats_handler.py` | Async job processing                        |
| CKL Exporter       | `apps/stig/src/stig/reports/ckl.py`             | DISA STIG Viewer format export              |
| PDF Exporter       | `apps/stig/src/stig/reports/pdf.py`             | Management report generation                |

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

### Platform-Specific Issues Log

| Issue  | Platform    | Status   | Notes                                                            |
| ------ | ----------- | -------- | ---------------------------------------------------------------- |
| P8-001 | macOS ARM64 | Resolved | Port conflict: Grafana 3000 vs Vite 3000 - moved Grafana to 3002 |
| P8-002 | macOS ARM64 | Resolved | Port conflict: Auth service 3002 vs Grafana - moved auth to 3006 |
| P8-003 | Windows 11  | Resolved | Hyper-V port conflict: NATS 8222 - moved to 8322                 |
| P8-004 | Windows 11  | Resolved | Hyper-V port conflict: Vault 8200 - moved to 8300                |

---

## Phase 9: CI/CD & Release

### GitHub Actions Workflows

| Workflow            | File                      | Triggers                  | Description                                 |
| ------------------- | ------------------------- | ------------------------- | ------------------------------------------- |
| Tests               | `test.yml`                | Push to main/develop, PRs | TypeScript and Python tests with coverage   |
| Security Scan       | `security-scan.yml`       | Push, PRs                 | Trivy, CodeQL, npm audit, safety            |
| Build Images        | `build-images.yml`        | Push, releases            | Multi-platform Docker builds (amd64, arm64) |
| Release             | `release.yml`             | Version tags (v*.*.\*)    | Full release automation with changelog      |
| Validate Workspaces | `validate-workspaces.yml` | Push                      | Cross-platform npm workspace validation     |
| Validate Poetry     | `validate-poetry.yml`     | Push                      | Cross-platform Python validation            |

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
