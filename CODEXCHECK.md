# CODEX Review Instructions

You are Codex acting as a **READ-ONLY E2E + SECURITY REVIEWER** for the NetNynja Enterprise monorepo.

---

## ABSOLUTE RULES (NON-NEGOTIABLE)

### Guard Rails - DO NOT VIOLATE

1. **DO NOT modify, delete, rename, or reformat any existing repo files.**
2. **DO NOT install new dependencies that change lockfiles** (no `npm install`, no `poetry add`).
3. **DO NOT create branches, PRs, commits, or push.**
4. **DO NOT run any "fix" modes** (`eslint --fix`, `prettier -w`, `ruff --fix`, etc.).
5. **DO NOT modify work performed by Claude** - Claude Code maintains this codebase; your role is advisory only.

### Permitted Actions

- You MAY run read-only/observational commands:
  - `npm ci` (installs from lockfile without modifying it)
  - `npm run ...` (existing scripts only)
  - `pytest`, `docker compose ...`, `curl`, `rg`, `grep`, `cat`, `docker logs`, `docker inspect`
- You MUST produce ONE new markdown report file.
- **Advisement only**: recommend changes, but **NEVER implement them**.

---

## OUTPUT REQUIREMENTS

### Report Location & Naming

All review outputs **MUST** be stored in the `CODEX/` folder with timestamps:

```
CODEX/CODEX_REVIEW_YYYYMMDD_HHMMSS.md
```

**Example**: `CODEX/CODEX_REVIEW_20260110_143022.md`

Use local machine time for the timestamp. Format: `YYYYMMDD_HHMMSS`

### Do NOT write reports to the repo root - use the CODEX folder.

---

## PRIMARY GOALS

1. Run E2E (or determine why E2E is blocked) and capture actionable blockers.
2. Perform a security review focused on CI/CD pass readiness and high-risk misconfigurations.
3. Provide a prioritized "Green Path" to get CI + E2E green.

---

## AUTHORITATIVE TECH CONTEXT

- **Monorepo**: npm workspaces + Poetry
- **API**: Fastify (Node.js) + TypeScript
- **Frontend**: React + Vite + TypeScript
- **Python services**: asyncio
- **DB**: PostgreSQL 15+
- **Cache**: Redis 7+
- **Time-series**: VictoriaMetrics
- **Messaging**: NATS JetStream
- **Auth**: JWT + Argon2id
- **Observability**: Grafana, Prometheus, Loki, Jaeger

---

## EXECUTION PLAN (FOLLOW IN ORDER)

### 0) Repo Orientation (read-only)

Identify:

- Workspace layout: `apps/*`, `packages/*`, `services/*`, `Testing/*`
- CI provider/config: `.github/workflows/*`
- E2E harness entrypoint(s): `Testing/README.md`, `Testing/run_tests.sh`, `Testing/infrastructure/preflight.sh`
- Compose profiles/services: `docker-compose.yml` (+ overrides)
- Env expectations: `.env.example`, `README.md`, `CONTEXT.md`

Capture key ports/endpoints:
| Service | Port |
|---------|------|
| Gateway API | 3001 |
| Web UI | 5173 |
| Auth Service | 3006 |
| PostgreSQL | 5433 |
| Redis | 6379 |
| NATS | 4222 (client), 8222 (monitor) |
| Grafana | 3002 |
| VictoriaMetrics | 8428 |
| Jaeger | 16686 |

### 1) E2E Setup + Preflight (OBSERVE ONLY)

#### A) Validate compose and profiles

Run these commands and verify they succeed:

```bash
docker compose config
docker compose --profile infra config
docker compose --profile ipam --profile npm --profile stig config
docker compose --profile infra --profile ipam --profile npm --profile stig config
```

#### B) Bring up services

Start infrastructure:

```bash
docker compose --profile infra up -d
```

Start application profiles:

```bash
docker compose --profile ipam --profile npm --profile stig up -d
```

Collect status:

```bash
docker compose ps
docker compose logs --tail=200 <unhealthy/restarting services only>
```

#### C) Run preflight checks

```bash
bash infrastructure/preflight.sh
```

**If preflight fails**, identify the FIRST hard blocker(s):

- Port mismatches
- Unhealthy services
- Missing containers
- Unreachable health endpoints

**Expected JetStream Streams** (services create these on startup):

- `IPAM` - subjects: `ipam.scan.*`, `ipam.discovery.*`
- `NPM_METRICS` - subjects: `npm.metrics.*`
- `STIG` - subjects: `stig.audits.*`, `stig.reports.*`, `stig.results.*`

Verify streams exist:

```bash
curl -s http://localhost:8222/jsz?streams=true | grep -E '"name":\s*"(IPAM|NPM_METRICS|STIG)"'
```

### 2) Full E2E Execution (ONLY if preflight passes)

#### A) Prerequisites

Ensure Python testing dependencies are installed:

```bash
pip3 install pytest pytest-asyncio pytest-html pytest-cov httpx redis psycopg psycopg-binary nats-py
```

#### B) Test User Setup

The E2E tests require specific test users in the database. Create them if missing:

```sql
-- Run in PostgreSQL (port 5433)
-- Password is 'E2EAdminPass123' hashed with Argon2id
INSERT INTO shared.users (id, username, email, password_hash, role, is_active)
VALUES
  (gen_random_uuid(), 'e2e_admin', 'e2e_admin@netnynja.local',
   '$argon2id$v=19$m=65536,t=3,p=4$salt$hash', 'admin', true),
  (gen_random_uuid(), 'e2e_operator', 'e2e_operator@netnynja.local',
   '$argon2id$v=19$m=65536,t=3,p=4$salt$hash', 'operator', true),
  (gen_random_uuid(), 'e2e_viewer', 'e2e_viewer@netnynja.local',
   '$argon2id$v=19$m=65536,t=3,p=4$salt$hash', 'viewer', true)
ON CONFLICT (username) DO NOTHING;
```

Test credentials (configured in `Testing/conftest.py`):
| User | Password | Role |
|------|----------|------|
| e2e_admin | E2EAdminPass123 | admin |
| e2e_operator | E2EOperatorPass123 | operator |
| e2e_viewer | E2EViewerPass123 | viewer |

#### C) Rate Limit Configuration

For E2E tests, ensure rate limits are relaxed in `docker-compose.yml` gateway service:

```yaml
environment:
  RATE_LIMIT_MAX: 1000
  RATE_LIMIT_AUTH_MAX: 500
  RATE_LIMIT_WINDOW_MS: 60000
```

Restart gateway after changes: `docker compose restart gateway`

#### D) Run E2E Tests

**Quick test (gateway + auth only):**

```bash
cd Testing
python3 -m pytest test_01_authentication.py test_02_gateway.py -v --tb=short
```

**Full E2E suite:**

```bash
cd Testing
python3 -m pytest -v --tb=short --html=reports/api-test-report.html
```

**Run specific test modules:**

```bash
python3 -m pytest test_03_ipam.py -v         # IPAM module
python3 -m pytest test_04_npm.py -v          # NPM module
python3 -m pytest test_05_stig.py -v         # STIG module
python3 -m pytest test_06_integration.py -v  # Cross-module integration
```

**Skip slow tests:**

```bash
python3 -m pytest -v -m "not slow"
```

Capture:

- Total passed/failed/errors
- Duration
- Report artifacts in `Testing/reports/`

#### E) API Field Naming Convention

The API uses **camelCase** field names. Test data should use:

- `name` (not `hostname`)
- `ipAddress` (not `ip_address`)
- `deviceType` (not `device_type`)
- `snmpVersion` (not `snmp_version`)
- `pollInterval` (not `poll_interval`)

### 3) Security Review (CI/CD focused, evidence-based)

Run what exists; do NOT install new tools.

#### A) Node / Workspaces

```bash
npm ci                        # Install from lockfile
npm run -s lint               # Lint check
npm run -s typecheck          # TypeScript check
npm run -s test               # Unit tests
npm run -s build              # Build all packages
npm audit --audit-level=high  # Security audit
```

#### B) Python (Poetry / pytest)

If poetry exists:

```bash
poetry install
poetry run pytest
poetry run ruff check .
poetry run mypy .
```

If poetry is missing, note "not available locally" and skip.

#### C) Config & Secure-by-Default Checks (review files, no edits)

Check for:

- **JWT**: required secrets, aud/iss validation, algorithm enforcement
- **Argon2id**: parameter sanity
- **CORS**: defaults, credential handling
- **Metrics**: `/metrics` exposure, IP allowlist
- **Secrets**: `.env` files, hardcoded keys (mask in report!)
- **Database**: injection patterns, least privilege
- **NATS**: TLS/auth configuration
- **Docker**: root user, capabilities, open ports

---

## REPORT TEMPLATE

Create file: `CODEX/CODEX_REVIEW_YYYYMMDD_HHMMSS.md`

```markdown
# CODEX Combined Review (E2E + Security)

**Generated**: YYYY-MM-DD HH:MM:SS
**Reviewer**: Codex (read-only)

## 1) Executive Summary

- **E2E status**: PASS / FAIL / BLOCKED
- **Security posture**: Low / Medium / High
- **CI readiness**: Pass-likely / At-risk / Failing
- **Top 10 actions** to get CI + E2E green (ordered by priority)

## 2) Environment & Commands Executed

- Detected versions: node/npm/python/docker/compose/poetry
- Compose profiles used
- Commands executed with success/fail outcome

## 3) E2E Results

- Preflight results: passed/failed/warnings
- Full E2E results (if run): passed/failed/errors + duration
- Service health snapshot: unhealthy/restarting containers
- Artifacts: paths to HTML/JUnit reports

## 4) Security Findings (Prioritized)

For each finding:

- **ID**: SEC-###
- **Severity**: Critical/High/Medium/Low
- **Category**: Secrets / Auth / Crypto / Dependencies / Injection / Docker / Messaging
- **Evidence**: file path + line numbers (mask secrets!)
- **Impact**: CI/CD implications
- **Recommendation**: exact steps (DO NOT implement)
- **Verification**: commands to verify fix

## 5) Application Issues (E2E Blockers/Failures)

For each:

- **ID**: APP-###
- **Severity**: Blocker/High/Medium/Low
- **Area**: Compose / Auth / Gateway / IPAM / NPM / STIG / Observability
- **Evidence**: log snippets, file/line pointers
- **Root cause**: Confirmed vs Suspected
- **Recommendation**: (no implementation)
- **Verification**: commands to verify fix

## 6) Green Path Checklist

### < 30 minutes

- [ ] Item 1
- [ ] Item 2

### Same day

- [ ] Item 3

### Backlog

- [ ] Item 4

Include "rerun commands" to prove green.

## 7) Notes / Assumptions / Gaps

- Tools unavailable locally
- Missing env vars
- Items needing confirmation
```

---

## DELIVERABLE

1. Write exactly ONE file: `CODEX/CODEX_REVIEW_YYYYMMDD_HHMMSS.md`
2. Print the exact filename at the end of your response.
3. **DO NOT modify any other files.**

---

## REMINDER

**Claude Code maintains this codebase.** Your role is to:

- Observe
- Analyze
- Report findings
- Recommend fixes

**NEVER implement changes yourself.**

Now execute the combined review following the plan.
