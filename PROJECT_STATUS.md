# NetNynja Enterprise - Project Status

**Last Updated**: 2025-01-05  
**Current Phase**: Phase 0 - Repository Setup  
**Overall Progress**: ▓░░░░░░░░░ 5%

---

## Executive Summary

NetNynja Enterprise consolidates three network management applications (IPAM, NPM, STIG Manager) into a unified platform with shared infrastructure, authentication, and observability. Target platforms: macOS, RHEL 9.x, Windows 11/Server.

---

## Phase Overview

| Phase | Name | Status | Target |
|-------|------|--------|--------|
| 0 | Repository Setup | 🟡 In Progress | Week 1-2 |
| 1 | Shared Infrastructure | ⬜ Not Started | Week 3-4 |
| 2 | Unified Authentication | ⬜ Not Started | Week 5-6 |
| 3 | API Gateway Consolidation | ⬜ Not Started | Week 7-9 |
| 4 | Frontend Unification | ⬜ Not Started | Week 10-12 |
| 5 | IPAM Migration | ⬜ Not Started | Week 13-15 |
| 6 | NPM Integration | ⬜ Not Started | Week 16-18 |
| 7 | STIG Manager Integration | ⬜ Not Started | Week 19-21 |
| 8 | Cross-Platform Testing | ⬜ Not Started | Week 22-24 |
| 9 | CI/CD & Release | ⬜ Not Started | Week 25-26 |

---

## Phase 0: Repository Setup

### Objectives
- [x] Define monorepo structure
- [x] Create CLAUDE.md for Claude Code
- [x] Create docker-compose.yml base
- [ ] Initialize GitHub repository
- [ ] Configure npm workspaces
- [ ] Configure Poetry for Python
- [ ] Set up Turborepo
- [ ] Create .env.example
- [ ] Add .gitignore and .dockerignore
- [ ] Create initial README.md

### Deliverables
- [ ] Empty monorepo with proper structure
- [ ] Development environment documentation
- [ ] Contributing guidelines

---

## Phase 1: Shared Infrastructure

### Objectives
- [ ] PostgreSQL with schema separation (ipam.*, npm.*, stig.*, shared.*)
- [ ] Redis configuration for sessions/cache
- [ ] NATS with JetStream streams configured
- [ ] HashiCorp Vault secrets structure
- [ ] Observability stack (Grafana, Prometheus, Loki, Jaeger)
- [ ] VictoriaMetrics time-series database
- [ ] Health check scripts

### Deliverables
- [ ] `infrastructure/` directory complete
- [ ] All services start with `docker compose --profile infra up`
- [ ] Grafana dashboards provisioned
- [ ] Database init scripts with schemas

### Security Checklist
- [ ] All default passwords changed
- [ ] Vault initialized and unsealed
- [ ] TLS configured for inter-service communication
- [ ] Network isolation verified

---

## Phase 2: Unified Authentication

### Objectives
- [ ] Create `packages/shared-auth/` library
- [ ] Implement JWT with RS256 (keys in Vault)
- [ ] Implement Argon2id password hashing
- [ ] Define RBAC roles: Admin, Operator, Viewer
- [ ] Create `services/auth-service/` microservice
- [ ] Session management in Redis
- [ ] Audit logging for auth events

### Technical Decisions
| Decision | Choice | Rationale |
|----------|--------|-----------|
| Token Type | JWT (RS256) | Stateless, Vault-managed keys |
| Password Hash | Argon2id | OWASP recommended, GPU-resistant |
| Session Store | Redis | Fast, TTL support, cluster-ready |
| Token Expiry | Access: 15m, Refresh: 7d | Balance security/UX |

### Deliverables
- [ ] `shared-auth` package published to workspace
- [ ] Auth service with `/login`, `/refresh`, `/logout`, `/verify`
- [ ] RBAC middleware for Fastify
- [ ] Python auth client library

---

## Phase 3: API Gateway Consolidation

### Objectives
- [ ] Create unified Fastify gateway in `apps/gateway/`
- [ ] Route structure: `/api/v1/ipam/*`, `/api/v1/npm/*`, `/api/v1/stig/*`
- [ ] OpenAPI/Swagger documentation
- [ ] Rate limiting per tenant/user
- [ ] Request validation with Zod
- [ ] OpenTelemetry instrumentation

### Deliverables
- [ ] Single gateway handling all API routes
- [ ] Auto-generated OpenAPI spec
- [ ] Rate limiting configuration
- [ ] Request/response logging to Loki

---

## Phase 4: Frontend Unification

### Objectives
- [ ] Create unified React app in `apps/web-ui/`
- [ ] Implement module-based routing (IPAM, NPM, STIG)
- [ ] Create `packages/shared-ui/` component library
- [ ] Unified navigation and theming
- [ ] Dashboard with cross-module widgets
- [ ] State management with Zustand stores per module

### Component Migration Plan
| Component | Source App | Priority |
|-----------|------------|----------|
| Auth/Login | NPM | P0 |
| Navigation | NPM | P0 |
| Dashboard | New | P1 |
| Data Tables | NPM | P1 |
| Charts | NPM (Recharts) | P1 |
| Topology | NPM (ReactFlow) | P2 |
| Forms | STIG | P2 |

### Deliverables
- [ ] Unified login experience
- [ ] Module switching without page reload
- [ ] Shared component library documented
- [ ] Dark/light theme support

---

## Phase 5: IPAM Migration

### Objectives
- [ ] Migrate IPAM backend to `apps/ipam/`
- [ ] Convert SQLite/SQLCipher → PostgreSQL
- [ ] Preserve IP scanning functionality
- [ ] Update frontend module in `apps/web-ui/src/modules/ipam/`
- [ ] Migrate to JWT authentication
- [ ] Add VictoriaMetrics for IP utilization metrics

### Data Migration
- [ ] Export script from SQLite
- [ ] Schema translation to PostgreSQL with INET/CIDR types
- [ ] Import validation tests
- [ ] Rollback procedure documented

### Deliverables
- [ ] IPAM fully operational in new architecture
- [ ] Zero data loss migration
- [ ] Performance benchmarks (scanning speed)

---

## Phase 6: NPM Integration

### Objectives
- [ ] Migrate NPM services to `apps/npm/`
- [ ] Integrate existing collectors
- [ ] Connect to shared VictoriaMetrics
- [ ] Update frontend module
- [ ] Integrate with unified alerting

### Deliverables
- [ ] All NPM collectors operational
- [ ] Metrics flowing to VictoriaMetrics
- [ ] Grafana dashboards migrated
- [ ] Alert rules configured

---

## Phase 7: STIG Manager Integration

### Objectives
- [ ] Migrate STIG services to `apps/stig/`
- [ ] Integrate collectors (SSH, Netmiko)
- [ ] Connect to shared audit logging
- [ ] Update frontend module
- [ ] Integrate report generation

### Deliverables
- [ ] STIG audits functional
- [ ] CKL/PDF report generation
- [ ] Compliance dashboards
- [ ] NATS streams for audit events

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
- Initial repository structure
- CLAUDE.md created
- docker-compose.yml base configuration
- PROJECT_STATUS.md initialized
