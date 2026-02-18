# Migration Plan: GridWatch NetEnterprise -> GridWatch NetEnterprise

**Created**: 2026-02-18
**Author**: Claude Opus 4.6 (Analysis Agent)
**Owner**: WarSignalLabs
**Status**: DRAFT - Pending Approval
**Estimated LOE**: 40-56 hours (5-7 developer-days)

---

## 1. Pre-Migration Issues (Must Fix Before Rename)

These are active problems in the codebase that should be resolved before the brand migration. Renaming on top of broken foundations compounds risk.

### ISSUE 1: Version Entropy Across Code Surfaces

| Surface | Shows | Should Be |
|---------|-------|-----------|
| `apps/web-ui/src/pages/auth/LoginPage.tsx:77` | `0.2.1` | `0.2.15` |
| `apps/gateway/src/plugins/swagger.ts:73` | `0.1.0` | `0.2.15` |
| `package.json` | `0.2.15` | Correct |
| `pyproject.toml` | `0.2.15` | Correct |
| `PROJECT_STATUS.md` | `0.2.15` | Correct |

**Impact**: User-facing login page and auditor-visible OpenAPI spec show wrong versions. Fails DoD RMF CM-3.
**Fix**: Update LoginPage.tsx and swagger.ts version strings. Add a CI version-check step.
**LOE**: 30 minutes

### ISSUE 2: Uncommitted Work on Main (Sprints 2 & 3)

HANDOFF.md reports Sprint 2 (CLAUDE_ENTERPRISE_SKILL.md fixes, net-snmp.d.ts) and Sprint 3 (shared-python library, IPAM pilot) as "complete but NOT committed." The documented project state (v0.2.15 changelog) describes code that isn't in git history.

**Impact**: `main` branch doesn't match docs. New clones get stale code. CI/CD can't validate uncommitted work.
**Fix**: Commit both sprints with proper conventional commit messages. Run CI validation.
**LOE**: 1 hour

### ISSUE 3: shared-python Not Adopted by NPM/STIG/Syslog Services

Only IPAM was migrated to `services/shared-python/`. Three other Python services still duplicate:
- Config patterns (BaseSettings boilerplate)
- DB connection logic (no retry/backoff)
- Health router definitions
- App factory boilerplate

**Impact**: SYSLOG-001 root cause (DB crash on startup, no retry) still affects NPM/STIG. Code duplication across 4 services.
**Fix**: Migrate NPM and STIG services following IPAM pilot pattern. Syslog architecture differs (excluded per HANDOFF.md).
**LOE**: 4-6 hours

### ISSUE 4: Docker Build Context for shared-python Path Dependency

`pyproject.toml` declares `shared_python` as a path dependency from `services/shared-python/src`. Docker builds for individual Python services may not have this path in their build context since each Dockerfile builds from its own `apps/{service}/` context.

**Impact**: Docker image builds for Python services may fail when shared-python is actually imported.
**Fix**: Update Docker build contexts to include `services/shared-python/` or use a root-level build context.
**LOE**: 2 hours

### ISSUE 5: Logo Asset Mismatch in LoginPage

LoginPage.tsx:28 references `/assets/NetNNJA2.jpg` but the actual logo file is `GridWatchLogo.png`. The `dist/` folder also has `GridWatchLogo.png`. There's an inconsistency between what the login page loads and what exists.

**Impact**: Potential broken logo on login page depending on which asset is actually served.
**Fix**: Verify which asset is correct, rename to match, and update the reference during rebrand.
**LOE**: 15 minutes

### ISSUE 6: Governance Doc Bloat (CLAUDE_COWORK_SKILLS_CHECK Still in Root)

The 364-line `CLAUDE_COWORK_SKILLS_CHECK_20260213_1621.md` sits in the repo root alongside 10+ other governance docs. It's a point-in-time audit artifact, not a living governance doc. It references the old "GRIDWATCH" leak extensively and will confuse agents.

**Impact**: Extra token consumption in agent context windows. Stale references to already-fixed issues.
**Fix**: Archive to `archive/sprint-history/` and remove from root.
**LOE**: 15 minutes

### ISSUE 7: Hardcoded Dev Secrets in docker-compose.yml

Multiple hardcoded dev tokens with the `netnynja` brand:
- `VAULT_DEV_TOKEN: netnynja-dev-token` (line 104)
- `JWT_SECRET: netnynja-dev-jwt-secret-2025` (line 277)
- `CREDENTIAL_ENCRYPTION_KEY: netnynja-dev-encryption-key-32ch` (line 278)

While these are dev defaults (and the project has `docker-compose.prod.yml` without them), they still embed the old brand name in operational config and will need updating during rename.

**Impact**: Not a security issue (dev-only), but part of rename scope.
**Fix**: Update during Phase 2 (Infrastructure rename).

---

## 2. Complete Name Dependency Audit

### 2.1 Summary Counts

| Category | Files Affected | Occurrences | Rename Risk |
|----------|---------------|-------------|-------------|
| NPM Package Names (`@gridwatch/*`) | 6 packages + all consumers | ~60 imports | **CRITICAL** - breaks builds |
| Prometheus Metrics (`gridwatch_*`) | 1 file + all dashboards | 28 metric defs | **CRITICAL** - breaks monitoring |
| Docker Compose (`netnynja-*`) | 2 compose files | ~35 refs | HIGH |
| Helm Chart (`netnynja.*`) | 7 template files | ~80 refs | HIGH |
| CI/CD Workflows | 6 workflow files | ~30 refs | HIGH |
| Gateway Config | 3 files | ~12 refs | MEDIUM |
| Frontend Stores (localStorage) | 2 stores | 2 keys | MEDIUM |
| Frontend UI Brand | 2 pages + 1 layout | ~6 refs | LOW |
| Logo Assets | 2 files (png + jpg) | 2 files | LOW |
| Documentation (.md) | 30+ files | 200+ refs | LOW |
| Python Config | 2 files | ~4 refs | LOW |
| Database Name/User | compose + .env + CI | ~15 refs | **CRITICAL** - data migration |

### 2.2 Detailed Dependency Manifest

#### TIER 0: CRITICAL (Build-Breaking / Data-Affecting)

**A. NPM Scoped Packages (@netnynja -> @gridwatch)**

```
packages/shared-auth/package.json     name: @gridwatch/shared-auth
packages/shared-types/package.json    name: @gridwatch/shared-types
packages/shared-ui/package.json       name: @gridwatch/shared-ui
apps/gateway/package.json             name: @gridwatch/gateway
apps/web-ui/package.json              name: @gridwatch/web-ui
services/auth-service/package.json    name: @gridwatch/auth-service
root package.json                     name: gridwatch-net-enterprise
```

All TypeScript import statements using `@gridwatch/*`:
- `apps/web-ui/src/stores/*.ts` (7 files with @gridwatch/shared-types imports)
- `apps/web-ui/src/pages/auth/LoginPage.tsx` (@gridwatch/shared-ui)
- `apps/gateway/src/**/*.ts` (all route files importing shared packages)
- `services/auth-service/src/**/*.ts`
- `.github/workflows/validate-workspaces.yml` (lines 94-99)

**B. Prometheus Metrics Prefix (gridwatch_ -> gridwatch_)**

`apps/gateway/src/plugins/metrics.ts`: 28 metric definitions:
- `gridwatch_nodejs_*` (default metrics prefix, line 27)
- `gridwatch_http_requests_total` (line 35)
- `gridwatch_http_request_duration_seconds` (line 41)
- `gridwatch_http_request_size_bytes` (line 49)
- `gridwatch_http_response_size_bytes` (line 57)
- `gridwatch_active_connections` (line 65)
- `gridwatch_auth_attempts_total` (line 75)
- `gridwatch_active_sessions` (line 82)
- `gridwatch_rate_limit_exceeded_total` (line 93)
- `gridwatch_ipam_*` (12 IPAM metrics, lines 104-184)
- `gridwatch_db_*` (3 DB metrics, lines 190-208)
- `gridwatch_redis_*` (2 Redis metrics, lines 214-227)
- Default label: `app: "netnynja"` (line 19)
- Plugin name: `netnynja-metrics` (line 393)

All Grafana dashboards in `infrastructure/grafana/dashboards/` with PromQL queries referencing `gridwatch_*`.

**C. Database Name & User**

```
docker-compose.yml:35      POSTGRES_USER: ${POSTGRES_USER:-netnynja}
docker-compose.yml:37      POSTGRES_DB: ${POSTGRES_DB:-netnynja}
docker-compose.yml:46      pg_isready -U ${POSTGRES_USER:-netnynja}
docker-compose.yml:269     POSTGRES_URL with netnynja user/db
docker-compose.yml:277     JWT_SECRET: netnynja-dev-jwt-secret-2025
docker-compose.yml:278     CREDENTIAL_ENCRYPTION_KEY: netnynja-dev-encryption-key-32ch
.env.example                POSTGRES_DB=netnynja, POSTGRES_USER=netnynja
infrastructure/postgres/init.sql
.github/workflows/test.yml:42,84,93,119,193,203  test_netnynja DB
.github/workflows/release.yml:110,144  test_netnynja DB
```

#### TIER 1: HIGH (Docker & Infrastructure)

**D. Docker Container Names (14+ containers)**

```
docker-compose.yml:
  gridwatch-postgres, gridwatch-redis, gridwatch-nats, gridwatch-vault,
  gridwatch-victoriametrics, gridwatch-prometheus, gridwatch-loki,
  gridwatch-promtail, gridwatch-jaeger, gridwatch-grafana,
  gridwatch-gateway, gridwatch-auth-service, + all Python service containers
```

**E. Docker Network**

```
docker-compose.yml:  networks: netnynja-network (referenced ~15 times)
```

**F. Docker Compose Project Name**

```
docker-compose.yml:10  name: gridwatch-net-enterprise
```

**G. Vault Dev Token**

```
docker-compose.yml:104  VAULT_DEV_TOKEN_ID: ${VAULT_DEV_TOKEN:-netnynja-dev-token}
docker-compose.yml:273  VAULT_TOKEN: ${VAULT_DEV_TOKEN:-netnynja-dev-token}
```

#### TIER 2: MEDIUM (Configuration & Identity)

**H. JWT Issuer & Audience**

```
apps/gateway/src/config.ts:27  JWT_ISSUER: "gridwatch-net-enterprise"
apps/gateway/src/config.ts:28  JWT_AUDIENCE: "netnynja-api"
services/auth-service/src/config.ts  (same pattern)
```
WARNING: Changing JWT issuer/audience invalidates ALL active tokens.

**I. OTEL Service Name**

```
apps/gateway/src/config.ts:60  OTEL_SERVICE_NAME: "gridwatch-gateway"
docker-compose.yml OTEL env vars
```

**J. Zustand localStorage Keys**

```
apps/web-ui/src/stores/auth.ts:122    name: "netnynja-auth"
apps/web-ui/src/stores/theme.ts:63    name: "netnynja-theme"
```
NOTE: Changing these clears user saved state (auth + theme preferences).

**K. CORS Production URL**

```
apps/gateway/src/config.ts:30   https://app.netnynja.com
apps/gateway/src/config.ts:124  https://app.netnynja.com
```

#### TIER 3: LOW (Branding & Documentation)

**L. Frontend UI Branding**

```
apps/web-ui/src/pages/auth/LoginPage.tsx:29   alt="GridWatch Logo"
apps/web-ui/src/pages/auth/LoginPage.tsx:33   "GridWatch NetEnterprise"
apps/web-ui/public/assets/GridWatchLogo.png    (logo file)
apps/web-ui/public/assets/NetNNJA2.jpg        (alternate logo)
apps/web-ui/dist/assets/GridWatchLogo.png      (built asset)
```

**M. Swagger/OpenAPI Branding**

```
apps/gateway/src/plugins/swagger.ts:16   title: "GridWatch NetEnterprise API"
apps/gateway/src/plugins/swagger.ts:18   # GridWatch NetEnterprise API
apps/gateway/src/plugins/swagger.ts:74   name: "WarSignalLabs"
apps/gateway/src/plugins/swagger.ts:75   email: support@netnynja.local
apps/gateway/src/plugins/swagger.ts:76   url: https://netnynja.local/support
apps/gateway/src/plugins/swagger.ts:77-83  license, terms URLs
apps/gateway/src/plugins/swagger.ts:86   https://docs.netnynja.local
apps/gateway/src/plugins/swagger.ts:95   https://api.netnynja.local
```

**N. Helm Chart (Directory + Content)**

```
charts/gridwatch-net-enterprise/              (directory name)
charts/gridwatch-net-enterprise/Chart.yaml    name, description, URLs, maintainer
charts/gridwatch-net-enterprise/values.yaml   image repos, hostnames, DB names
charts/gridwatch-net-enterprise/README.md     all references
charts/gridwatch-net-enterprise/templates/    _helpers.tpl (15+ template functions)
                                         gateway-deployment.yaml
                                         web-ui-deployment.yaml
                                         ingress.yaml, secrets.yaml
                                         serviceaccount.yaml
```

**O. CI/CD Workflows**

```
.github/workflows/build-images.yml:33   IMAGE_PREFIX with netnynja
.github/workflows/release.yml:33,110,144,262,288,311,345,367,370,377,378
.github/workflows/security-scan.yml:65,75,93  netnynja/ image prefix
.github/workflows/test.yml:42,84,93,119,193,203  test_netnynja DB
.github/workflows/validate-workspaces.yml:94-99  @gridwatch/* packages
.github/workflows/docs.yml:5,64  netnynja references
```

**P. Python Package**

```
pyproject.toml:2   name = "gridwatch-net-enterprise"
pyproject.toml:4   description = "GridWatch NetEnterprise - Python Services"
```

**Q. GitHub Repository**

```
Repository URL: github.com/remeadows/GridWatchEnterprise
GHCR path: ghcr.io/remeadows/netnynja*
Local directory: C:\Users\rmeadows\Code Development\dev\GridWatch\GridWatchEnterprise
Cosign signatures: tied to current image names (must re-sign)
```

**R. Documentation (30+ files)**

All `.md` files in root + `docs/` + `archive/`:
```
AGENTS.md, CLAUDE.md, CONTEXT.md, PROJECT_STATUS.md, IssuesTracker.md,
GO.md, README.md, COMMIT.md, RELEASE.md, CLAUDE_ENTERPRISE_SKILL.md,
HANDOFF.md, CLAUDE_COWORK_SKILLS_CHECK_20260213_1621.md,
docs/*.md, docs/*.html, archive/**/*.md
```
Estimated 200+ occurrences of "GridWatch"/"netnynja" across 30+ files.

---

## 3. Migration Execution Plan

### Phase 0: Preparation (Day 1 - 4 hours)

- [ ] Commit all pending Sprint 2 & 3 work to main
- [ ] Fix pre-migration issues (version entropy, logo mismatch)
- [ ] Create feature branch: `refactor/gridwatch-rebrand`
- [ ] Dump PostgreSQL database: `pg_dump -U gridwatch netnynja > gridwatch_backup.sql`
- [ ] Export Grafana dashboards as JSON
- [ ] Document all JWT signing keys for rotation
- [ ] Archive `CLAUDE_COWORK_SKILLS_CHECK_20260213_1621.md` to sprint-history
- [ ] Design new WarSignalLabs / GridWatch logo asset

### Phase 1: Code Rename (Day 2-3 - 12-16 hours)

**MUST BE ATOMIC - single commit, builds break until complete**

- [ ] Rename all NPM package names (@gridwatch/* -> @gridwatch/*)
- [ ] Update all TypeScript import statements
- [ ] Update root package.json workspace config
- [ ] Rename Prometheus metric prefix (gridwatch_ -> gridwatch_)
- [ ] Update metrics plugin default label
- [ ] Update pyproject.toml package name
- [ ] Update gateway config.ts defaults (JWT issuer/audience, OTEL service name, CORS URL)
- [ ] Update auth-service config.ts
- [ ] Update Zustand store localStorage keys
- [ ] Update swagger.ts (title, contact, URLs, version)
- [ ] Update LoginPage.tsx (brand text, logo ref, version)
- [ ] Update MainLayout.tsx (brand text, logo ref)
- [ ] Replace logo assets (GridWatchLogo.png -> GridWatchLogo.png)
- [ ] Add WarSignalLabs brand/attribution where appropriate
- [ ] Rename Helm chart directory and update all templates
- [ ] Verify TypeScript compiles: `npm run build`
- [ ] Verify Python lints: `poetry run ruff check .`

### Phase 2: Infrastructure Rename (Day 3-4 - 8-10 hours)

- [ ] Update docker-compose.yml (project name, container names, network, env vars)
- [ ] Update docker-compose.prod.yml
- [ ] Update .env.example
- [ ] Update all GitHub Actions workflows (image names, DB names, package refs)
- [ ] Update Grafana dashboard JSON files (all PromQL queries)
- [ ] Update Prometheus scrape configs
- [ ] Update Vault init scripts
- [ ] Update dev secret defaults (JWT_SECRET, ENCRYPTION_KEY, VAULT_TOKEN)
- [ ] Verify: `docker compose config` validates

### Phase 3: Data & Security (Day 4 - 4 hours)

- [ ] Rename PostgreSQL database: `ALTER DATABASE netnynja RENAME TO gridwatch;`
- [ ] Rename PostgreSQL user: `ALTER USER netnynja RENAME TO gridwatch;`
- [ ] OR: Fresh database init with new name (dev environment)
- [ ] Rotate JWT signing keys
- [ ] Clear Redis cache: `redis-cli FLUSHALL`
- [ ] Rebuild all Docker images
- [ ] Re-sign all 14 container images with Cosign
- [ ] Verify cosign signatures

### Phase 4: Documentation (Day 5 - 4 hours)

- [ ] Global find/replace "GridWatch" -> "GridWatch" across all .md files
- [ ] Global find/replace "netnynja" -> "gridwatch" across all .md files
- [ ] Update ISSO Executive Summary HTML
- [ ] Update security reports and docs
- [ ] Update CLAUDE.md, CONTEXT.md, PROJECT_STATUS.md headers
- [ ] Update AGENTS.md, GO.md, CLAUDE_ENTERPRISE_SKILL.md
- [ ] Update README.md
- [ ] Add WarSignalLabs attribution to appropriate docs
- [ ] Bump version to 0.3.0 (new major brand = new minor version)

### Phase 5: Verification (Day 5-6 - 6 hours)

- [ ] Full `npm install` from clean state
- [ ] `npm run build` (all workspaces)
- [ ] `npm run lint` (all workspaces)
- [ ] `npm run test` (all workspaces)
- [ ] `docker compose up -d` (full stack)
- [ ] Smoke test: login, navigate all modules
- [ ] Verify Grafana dashboards load with new metric names
- [ ] Verify Prometheus scraping
- [ ] Run security scan: `npm audit`, `poetry run safety check`
- [ ] Verify Docker image signatures
- [ ] Cross-platform smoke: Windows, macOS (if available)

### Phase 6: Repository & External (Day 6 - 2 hours)

- [ ] Rename GitHub repository: GridWatchEnterprise -> GridWatchNetEnterprise
- [ ] Update all git remotes locally
- [ ] Update GHCR image paths
- [ ] Rename local directory
- [ ] Update any external documentation or links
- [ ] Update Claude Code memory files
- [ ] Final commit + tag: `v0.3.0-gridwatch`
- [ ] Create GitHub release

---

## 4. Risk Matrix

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Grafana dashboards break (PromQL) | **Certain** | High | Pre-export dashboards, bulk-update queries, or dual-emit metrics for 1 release |
| JWT token invalidation | **Certain** | Medium | Schedule during maintenance window, force re-auth |
| npm workspace resolution fails | Medium | **Critical** | Test incrementally, verify each package builds |
| Docker build context breaks | Medium | High | Test builds before pushing, update Dockerfile contexts |
| CI/CD pipeline failures | Medium | High | Run workflows in dry-run, fix iteratively |
| localStorage data loss | **Certain** | Low | Users re-login and re-select theme (minor UX inconvenience) |
| External link breakage | Low | Low | GitHub redirects old repo URLs automatically |
| Cosign signature chain breaks | **Certain** | Medium | Re-sign all images, update public key if needed |

---

## 5. LOE Estimate

| Phase | Hours | Days | Assignee |
|-------|-------|------|----------|
| Phase 0: Preparation | 4 | 0.5 | Human + Claude |
| Phase 1: Code Rename | 12-16 | 1.5-2 | Claude/Codex |
| Phase 2: Infrastructure | 8-10 | 1-1.25 | Claude/Codex |
| Phase 3: Data & Security | 4 | 0.5 | Human |
| Phase 4: Documentation | 4 | 0.5 | Claude |
| Phase 5: Verification | 6 | 0.75 | Claude + Human |
| Phase 6: Repository | 2 | 0.25 | Human |
| **Total** | **40-46** | **5-5.75** | |
| **Buffer (20%)** | **8-9** | **1-1.25** | |
| **Grand Total** | **48-55** | **6-7** | |

---

## 6. Definition of Done

- [ ] Zero occurrences of "netnynja" (case-insensitive) in any source file
- [ ] Zero occurrences of "@netnynja" in any package.json or import statement
- [ ] All Docker images build and run with new names
- [ ] All Grafana dashboards display metrics with `gridwatch_` prefix
- [ ] All CI/CD workflows pass
- [ ] All container images signed with Cosign
- [ ] GitHub repository renamed
- [ ] Local development environment boots with `docker compose up -d`
- [ ] WarSignalLabs brand visible in login page and UI header
- [ ] Version bumped to 0.3.0
- [ ] All governance docs updated

---

*Generated by Claude Opus 4.6 - 2026-02-18*
*No code was modified during this analysis.*
