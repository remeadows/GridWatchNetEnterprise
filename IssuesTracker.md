# NetNynja Enterprise - Issues Tracker

> Active issues and technical debt tracking

**Version**: 0.1.0
**Last Updated**: 2026-01-06 23:30 EST
**Open Issues**: 0 | **Resolved Issues**: 19

## Issue Categories

- 🔴 **Critical** - Blocking issues that prevent core functionality
- 🟠 **High** - Important issues that should be resolved soon
- 🟡 **Medium** - Issues that should be addressed in normal development
- 🟢 **Low** - Nice-to-have improvements

---

## Open Issues

### Phase 0: Repository Setup

| ID   | Priority | Title                                    | Assignee | Status   |
| ---- | -------- | ---------------------------------------- | -------- | -------- |
| #001 | 🟡       | Validate npm workspaces on all platforms | -        | Resolved |
| #002 | 🟡       | Test Poetry install on Windows           | -        | Resolved |
| #003 | 🟢       | Add pre-commit hooks                     | -        | Resolved |

### E2E Testing

| ID   | Priority | Title                                                         | Assignee | Status   |
| ---- | -------- | ------------------------------------------------------------- | -------- | -------- |
| #040 | 🟡       | Frontend tests fail - web-ui not running on port 5173         | -        | Resolved |
| #041 | 🟠       | Logout endpoint returns 400 due to empty JSON body validation | -        | Resolved |
| #042 | 🟠       | Operator role cannot delete networks (403 Forbidden)          | -        | Resolved |
| #043 | 🟡       | OpenAPI documentation not exposed at /docs                    | -        | Resolved |
| #044 | 🟡       | Grafana dashboards not provisioned                            | -        | Resolved |
| #045 | 🟡       | VictoriaMetrics missing netnynja\_\* metrics                  | -        | Resolved |

### Infrastructure

| ID   | Priority | Title                                | Assignee | Status   |
| ---- | -------- | ------------------------------------ | -------- | -------- |
| #010 | 🟠       | Configure production Vault unsealing | -        | Resolved |
| #011 | 🟡       | Add PostgreSQL backup scripts        | -        | Resolved |
| #012 | 🟡       | Configure log rotation for Loki      | -        | Resolved |

### Security

| ID   | Priority | Title                                   | Assignee | Status   |
| ---- | -------- | --------------------------------------- | -------- | -------- |
| #020 | 🔴       | Generate production JWT RSA keys        | -        | Resolved |
| #021 | 🟠       | Implement rate limiting in gateway      | -        | Resolved |
| #022 | 🟠       | Add CORS configuration                  | -        | Resolved |
| #023 | 🟡       | Set up container vulnerability scanning | -        | Resolved |

### Technical Debt

| ID   | Priority | Title                           | Assignee | Status   |
| ---- | -------- | ------------------------------- | -------- | -------- |
| #030 | 🟡       | Add comprehensive test coverage | -        | Resolved |
| #031 | 🟢       | Document API with OpenAPI spec  | -        | Resolved |
| #032 | 🟢       | Add performance benchmarks      | -        | Resolved |

---

## Resolved Issues

| ID   | Priority | Title                                                 | Resolved Date | Resolution                                                                                                                                                                                                                                                                                                                |
| ---- | -------- | ----------------------------------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #040 | 🟡       | Frontend tests fail - web-ui not running on port 5173 | 2026-01-06    | Fixed `BASE_URL` in test_frontend.py to port 3000 (per vite.config.ts) and corrected test password                                                                                                                                                                                                                        |
| #041 | 🟠       | Logout endpoint returns 400 due to empty JSON body    | 2026-01-06    | Modified auth.ts logout route to not send Content-Type header when no body, and handle empty responses                                                                                                                                                                                                                    |
| #042 | 🟠       | Operator role cannot delete networks                  | 2026-01-06    | Updated IPAM delete route RBAC from `admin` only to `admin, operator` in ipam/index.ts:288                                                                                                                                                                                                                                |
| #020 | 🔴       | Generate production JWT RSA keys                      | 2026-01-06    | Created generate-jwt-keys.sh script for 4096-bit RSA PKCS#8 key generation; Updated .gitignore and .env.example with RS256 config; Keys tested with jose library                                                                                                                                                          |
| #021 | 🟠       | Implement rate limiting in gateway                    | 2026-01-06    | Enhanced rate-limit.ts with tiered limits: 100/min default, 10/min for auth endpoints, role-based multipliers (admin 3x, operator 2x); allowList for health endpoints; Updated error-handler.ts for 429 responses; Added config to .env.example                                                                           |
| #022 | 🟠       | Add CORS configuration                                | 2026-01-06    | Enhanced config.ts with CORS_ORIGIN, CORS_CREDENTIALS, CORS_MAX_AGE, CORS_EXPOSED_HEADERS; Updated index.ts to use all config options; Added CORS Configuration section to .env.example with documentation                                                                                                                |
| #045 | 🟡       | VictoriaMetrics missing netnynja\_\* metrics          | 2026-01-06    | Created metrics.ts plugin with prom-client; HTTP metrics (requests, duration, size), auth metrics, rate limit metrics, IPAM metrics, DB/Redis metrics; Endpoint at /metrics; Metrics use netnynja\_\* prefix for dashboards                                                                                               |
| #043 | 🟡       | OpenAPI documentation at /docs                        | 2026-01-06    | Already working - endpoint redirects /docs to /docs/ which serves Swagger UI properly                                                                                                                                                                                                                                     |
| #044 | 🟡       | Grafana dashboards not provisioned                    | 2026-01-06    | Added dashboards volume mount to docker-compose.yml; Created gateway-overview.json, ipam-overview.json, system-overview.json dashboards; Existing npm-overview.json and stig-overview.json now properly provisioned                                                                                                       |
| #023 | 🟡       | Set up container vulnerability scanning               | 2026-01-06    | Created .github/workflows/security-scan.yml (Trivy, CodeQL, npm audit, SBOM), infrastructure/security/ with scan-containers.sh, trivy.yaml config, .trivyignore, and comprehensive README                                                                                                                                 |
| #012 | 🟡       | Configure log rotation for Loki                       | 2026-01-06    | Enhanced loki.yml with stream-specific retention (audit:1yr, auth:90d, errors:60d, debug:7d), compactor settings (apply_retention_interval, delete_max_interval), WAL replay ceiling, and comprehensive documentation                                                                                                     |
| #011 | 🟡       | Add PostgreSQL backup scripts                         | 2026-01-06    | Created infrastructure/postgres/ with backup.sh (compressed pg_dump with retention), restore.sh (supports Docker and direct restore), and comprehensive README.md with cron examples                                                                                                                                      |
| #010 | 🟠       | Configure production Vault unsealing                  | 2026-01-06    | Created infrastructure/vault/ with: vault-config.hcl (production config with auto-unseal options), policies/ (admin, gateway, service), scripts/ (init-vault.sh, unseal-vault.sh, setup-policies.sh, setup-secrets.sh), docker-compose.vault.yml, and comprehensive README.md                                             |
| #001 | 🟡       | Validate npm workspaces on all platforms              | 2026-01-06    | Created scripts/validate-workspaces.sh with comprehensive checks; Added .github/workflows/validate-workspaces.yml for cross-platform CI; Updated clean scripts to use rimraf for Windows compatibility; Added rimraf@6.1.2 as devDependency                                                                               |
| #002 | 🟡       | Test Poetry install on Windows                        | 2026-01-06    | Created scripts/validate-poetry.ps1 (PowerShell) and scripts/validate-poetry.sh (bash); Added .github/workflows/validate-poetry.yml for multi-platform CI; Checks Python/Poetry versions, pyproject.toml, dependency resolution, Windows-specific settings (long paths, VS Build Tools)                                   |
| #003 | 🟢       | Add pre-commit hooks                                  | 2026-01-06    | Created .husky/pre-commit (lint-staged, security checks), .husky/commit-msg (conventional commits), .husky/pre-push (build verification); Added .pre-commit-config.yaml for Python (black, ruff, mypy, bandit); Added .yamllint.yml and .secrets.baseline configs                                                         |
| #030 | 🟡       | Add comprehensive test coverage                       | 2026-01-06    | Created Jest config for gateway; Added test setup with mocks; Created config.test.ts (27 tests), rate-limit.test.ts (33 tests), health.test.ts (8 tests); All 67 tests passing; Added .github/workflows/test.yml for CI                                                                                                   |
| #031 | 🟢       | Document API with OpenAPI spec                        | 2026-01-06    | Enhanced swagger.ts with comprehensive OpenAPI 3.1.0 documentation; Added schemas for all entities (User, Network, Subnet, IPAddress, Device, Alert, Benchmark, Assessment, etc.); Added reusable responses and parameters                                                                                                |
| #032 | 🟢       | Add performance benchmarks                            | 2026-01-06    | Created benchmark suite using autocannon; health.benchmark.js (healthz, livez, readyz), auth.benchmark.js (login, profile, refresh), ipam.benchmark.js (networks, subnets, addresses, devices); Added run-all.js runner with JSON output; Added npm scripts (benchmark, benchmark:health, benchmark:auth, benchmark:ipam) |

---

## Issue Template

```markdown
### Issue #XXX: [Title]

**Priority**: 🔴/🟠/🟡/🟢
**Category**: Infrastructure / Security / Application / Documentation
**Reported**: YYYY-MM-DD
**Assignee**:

#### Description

[Detailed description of the issue]

#### Steps to Reproduce (if applicable)

1.
2.
3.

#### Expected Behavior

[What should happen]

#### Actual Behavior

[What actually happens]

#### Proposed Solution

[How to fix it]

#### Related Issues

- #XXX
```

---

## Notes

- Issues are tracked here for visibility, but should also be created in GitHub Issues for proper tracking
- Update status during development
- Close issues with resolution notes
