# Security Hardening Sprint — 5-Day Plan

**Sprint**: SEC-HARDENING-01
**Start Date**: 2026-02-12 (Next Business Day)
**End Date**: 2026-02-18
**Owner**: Russ (PM oversight), Claude (orchestration/review/docs)
**Triggered By**: Codex Review 20260211-1133 + Gemini Review 20260211-1146
**Goal**: Resolve all Tier 0 launch blockers and high-priority Tier 1 security findings

---

## Sprint Metrics

| Metric                     | Target |
| -------------------------- | ------ |
| Tier 0 Blockers Resolved   | 5/5    |
| Tier 1 High Items Resolved | 6/6    |
| Tests Passing Post-Sprint  | 100%   |
| CI/CD Green Post-Sprint    | ✅     |
| Gemini Validation Pass     | ✅     |

---

## Agent Responsibility Matrix

| Agent      | Role                         | Scope                                                                         |
| ---------- | ---------------------------- | ----------------------------------------------------------------------------- |
| **Claude** | PM + Implementation Engineer | All code changes, tests, dependency updates, sprint coordination, doc updates |
| **Codex**  | Post-Implementation Reviewer | Read-only code review after Claude implements                                 |
| **Gemini** | Validation Reviewer          | Post-remediation security validation pass (Day 5)                             |
| **Russ**   | Decision Authority           | Approvals, architectural choices, risk acceptance                             |

---

## Day 1: SSH Auditor Hardening + Production Secret Elimination ✅ COMPLETE

### SEC-013: SSH Auditor — Remove Fallback Credentials & Enforce Host Key Verification ✅

**Priority**: 🔴 Critical — Launch Blocker (RESOLVED)
**Agent**: Claude
**File**: `apps/stig/src/stig/collectors/ssh_auditor.py`
**Evidence**: Codex Risk #1, Gemini Critical #1

**Requirements**:

1. Remove all fallback/default credential logic — if Vault credentials are unavailable, the audit MUST fail with a clear error
2. Remove `known_hosts=None` / host key verification bypass — enforce strict host key checking by default
3. Add a configuration option `STIG_SSH_STRICT_HOST_KEY` (default: `true`) that can only be disabled with explicit env var for lab/dev environments
4. Add structured log entries for: credential retrieval failures, host key mismatches, connection refusals
5. Update `.env.example` with new config variable
6. Add unit tests: credential-missing → fail, host-key-mismatch → fail, valid-credentials → proceed

**Acceptance Criteria**:

- No SSH connection is attempted without Vault-provided or explicitly-configured credentials
- Host key verification is enabled by default
- `poetry run pytest apps/stig -k ssh_auditor` passes

---

### SEC-014: Production Secret Elimination + docker-compose.prod.yml ✅

**Priority**: 🔴 Critical — Launch Blocker (RESOLVED)
**Agent**: Claude
**Files**: `docker-compose.yml`, new `docker-compose.prod.yml`
**Evidence**: Codex Risk #3, Gemini Critical #4

**Requirements**:

1. Create `docker-compose.prod.yml` with production overrides:
   - No default JWT_SECRET, CREDENTIAL_ENCRYPTION_KEY, or VAULT_TOKEN values
   - Vault runs in production mode (not dev)
   - All debug/dev ports removed
   - Read-only filesystem where possible
   - No `VAULT_DEV_ROOT_TOKEN_ID`
2. Add startup validation script (`scripts/validate-prod-env.sh`) that checks:
   - All required secrets are set and non-default
   - Vault is not in dev mode
   - JWT_SECRET length >= 32 characters
   - CREDENTIAL_ENCRYPTION_KEY is set
3. Document production deployment requirements in `docs/PRODUCTION_DEPLOYMENT.md`
4. Add `COMPOSE_PROFILES` documentation for dev vs prod

**Acceptance Criteria**:

- `docker compose -f docker-compose.yml -f docker-compose.prod.yml config` validates
- Startup validation rejects default/missing secrets
- Existing dev workflow unaffected

---

## Day 2: Syslog Hardening + XML Parsing Hardening ✅ COMPLETE

### SEC-015: Syslog Collector — Rate Limits, Size Caps, Source Filtering ✅

**Priority**: 🔴 Critical — Launch Blocker (RESOLVED)
**Agent**: Claude
**Files**: `apps/syslog/src/syslog/collector.py`, `docker-compose.yml`
**Evidence**: Codex Risk #2, Gemini Critical #2

**Requirements**:

1. Add configurable message size cap: `SYSLOG_MAX_MESSAGE_SIZE` (default: 8192 bytes) — drop and log oversize messages
2. Add rate limiting: `SYSLOG_MAX_MESSAGES_PER_SECOND` (default: 10000) with token bucket or sliding window
3. Add optional IP allowlist: `SYSLOG_ALLOWED_SOURCES` (comma-separated CIDRs, empty = accept all)
4. Add backpressure: if DB write queue exceeds threshold, begin dropping with metric counter
5. Add structured metrics: messages_received, messages_dropped_size, messages_dropped_rate, messages_dropped_source
6. Update `.env.example` with new variables

**Acceptance Criteria**:

- Oversize messages are dropped and logged
- Rate limiting activates under burst conditions
- IP filtering works when configured
- Unit tests cover all three guards

---

### SEC-016: Replace xml.etree.ElementTree with defusedxml ✅

**Priority**: 🔴 Critical — Launch Blocker (RESOLVED)
**Agent**: Claude
**Files**: `apps/stig/src/stig/library/parser.py`, `apps/stig/src/stig/collectors/config_analyzer.py`, `pyproject.toml`
**Evidence**: Codex Risk #5, Gemini Critical #3

**Requirements**:

1. Add `defusedxml` to Python dependencies in `pyproject.toml`
2. Replace all `import xml.etree.ElementTree` with `import defusedxml.ElementTree as ET`
3. Add explicit size limits for XML parsing: `STIG_MAX_XML_SIZE` (default: 50MB)
4. Add ZIP content size limits: `STIG_MAX_ZIP_ENTRY_SIZE` (default: 100MB), `STIG_MAX_ZIP_ENTRIES` (default: 500)
5. Reject entity-heavy documents (defusedxml handles this by default)
6. Add unit test with adversarial XML fixture (entity expansion, oversized document)

**Acceptance Criteria**:

- `defusedxml` is used everywhere XML is parsed
- Entity expansion attacks are blocked
- Oversized files are rejected with clear error
- `poetry run pytest apps/stig` passes

---

## Day 3: Upload Limits + SEC-001 Escalation + Credential Encryption ✅ COMPLETE

### SEC-017: STIG Config Upload Size Limits ✅

**Priority**: 🔴 Critical — Launch Blocker (RESOLVED)
**Agent**: Claude
**Files**: `apps/stig/src/stig/api/routes.py`, `apps/gateway/src/routes/stig/index.ts`
**Evidence**: Codex Risk #4, Gemini Critical #5

**Requirements**:

1. Gateway: Add `bodyLimit` to STIG config upload routes (default: 10MB)
2. Python backend: Add file size validation before reading into memory
3. Add MIME type validation for config uploads (text/plain, application/xml, application/zip)
4. Return 413 Payload Too Large with clear error message
5. Add config: `STIG_MAX_UPLOAD_SIZE_MB` (default: 10)

**Acceptance Criteria**:

- Uploads > limit return 413
- Invalid MIME types rejected
- Gateway and backend both enforce limits independently

---

### SEC-001: Escalate tar RCE Remediation (argon2 Dependency) ✅

**Priority**: 🟠 High — Escalated from Deferred (RESOLVED)
**Agent**: Claude
**Files**: `services/auth-service/package.json`, `package-lock.json`
**Evidence**: Gemini High Risk #2, IssuesTracker SEC-001

**Requirements**:

1. Update `argon2` to v0.44.0+ (or latest that resolves GHSA-8qq5-rm4j-mr97)
2. Verify auth service password hashing compatibility — run login/registration flow tests
3. Run `npm audit` and confirm 0 HIGH vulnerabilities
4. Update IssuesTracker.md to mark SEC-001 as resolved

**Acceptance Criteria**:

- `npm audit` shows 0 HIGH vulnerabilities in auth-service
- Authentication flows work (login, register, refresh, logout)
- CI passes

---

### SEC-018: SSH Credential Encryption — Per-Record Salt + Key Rotation Plan ✅

**Priority**: 🟠 High (RESOLVED)
**Agent**: Claude
**File**: `apps/gateway/src/routes/stig/ssh-credentials.ts`
**Evidence**: Codex Risk #6, Gemini High Risk #3

**Requirements**:

1. Generate cryptographically random salt per credential record (32 bytes minimum)
2. Store salt alongside encrypted credential in database (add `salt` column via migration)
3. Maintain backward compatibility: existing records with static salt continue to decrypt
4. Re-encrypt existing records on next access (lazy migration)
5. Document key rotation procedure in `docs/security/KEY_ROTATION.md`
6. Add migration: `014_add_credential_salt.sql`

**Acceptance Criteria**:

- New credentials use random per-record salt
- Existing credentials still decrypt
- Key rotation procedure documented
- Unit tests cover both old and new salt behavior

---

## Day 4: Input Sanitization + Syslog API + Container Hardening ✅ COMPLETE

### SEC-019: Comprehensive Input Sanitization Audit ✅

**Priority**: 🟠 High
**Agent**: Claude
**Scope**: All user-facing text input paths
**Evidence**: Gemini High Risk #4

**Requirements**:

1. Audit all API endpoints accepting free-text input (names, descriptions, notes, config content)
2. Implement output encoding for HTML contexts (XSS prevention)
3. Verify no shell injection vectors exist in subprocess calls (IPAM scanner, NPM discovery, STIG auditor)
4. Verify SQL parameterization across all raw queries (no string interpolation)
5. Produce sanitization audit matrix (endpoint × input × validation × encoding)

**Acceptance Criteria**:

- Audit matrix documented in `docs/security/INPUT_SANITIZATION_AUDIT.md`
- No unparameterized SQL queries
- No unescaped user input in shell commands
- XSS protection verified for all text fields rendered in UI

---

### SEC-020: Syslog API — Structured Logging + CORS Restriction ✅

**Priority**: 🟠 High
**Agent**: Claude
**File**: `apps/syslog/src/syslog/main.py`
**Evidence**: Codex Risk #8, Gemini Medium #2

**Requirements**:

1. Replace all `print()` statements with `structlog` (consistent with other services)
2. Restrict CORS from `*` to configurable origin: `SYSLOG_CORS_ORIGINS` (default: `http://localhost:3000`)
3. Add health check structured log on startup

**Acceptance Criteria**:

- No `print()` in syslog service code
- CORS restricted and configurable
- Structured JSON logging verified in `docker compose logs syslog-service`

---

### SEC-021: Container Capability Refinement ✅

**Priority**: 🟠 High
**Agent**: Claude
**File**: `docker-compose.yml`, `docker-compose.prod.yml`
**Evidence**: Codex Risk #9, Gemini High Risk #7

**Requirements**:

1. Audit all `cap_add` in docker-compose.yml
2. For each service, document minimum required capabilities
3. Add `cap_drop: [ALL]` to all services, then add back only what's needed
4. IPAM scanner: `NET_RAW` only
5. Syslog collector: `NET_BIND_SERVICE` only
6. NPM collector: `NET_RAW` only
7. All other services: no elevated capabilities

**Acceptance Criteria**:

- All services run with minimum required capabilities
- `docker compose up -d` succeeds with refined capabilities
- Documented in `docker-compose.prod.yml` comments

---

### SEC-022: Syslog Forwarding — TLS Enforcement ✅

**Priority**: 🟠 High
**Agent**: Claude
**Evidence**: Gemini High Risk #6

**Requirements**:

1. Verify syslog forwarder supports TLS transport
2. Add `SYSLOG_FORWARD_TLS_ENABLED` config (default: `true` for production)
3. Add TLS certificate configuration for forwarder
4. Document SIEM forwarding security requirements

**Acceptance Criteria**:

- TLS forwarding works with valid certificates
- Non-TLS forwarding requires explicit opt-out
- Configuration documented

---

### SEC-023: Raw Payload Redaction + Size Limits ✅

**Priority**: 🟠 High
**Agent**: Claude
**Evidence**: Gemini High Risk #5

**Requirements**:

1. Add configurable redaction patterns for syslog storage (passwords, keys, tokens)
2. Enforce maximum stored payload size: `SYSLOG_MAX_STORED_PAYLOAD` (default: 4096 bytes)
3. Truncate oversized payloads with `[TRUNCATED]` marker
4. Add redaction for config content before logging

**Acceptance Criteria**:

- Sensitive patterns redacted from stored events
- Oversized payloads truncated
- Configurable via environment variables

---

## Day 5: Validation Pass + Documentation + Route Fixes

### VALIDATE-001: Gemini Post-Remediation Security Validation

**Priority**: 🔴 Critical — Sprint Gate
**Agent**: Gemini
**Scope**: Full re-review of all Tier 0 and Tier 1 changes

**Requirements**:

1. Re-run threat model against patched codebase
2. Verify all 5 launch blockers are resolved
3. Verify no new security regressions introduced
4. Runtime validation: health checks, smoke tests, adversarial input tests
5. Produce validation report: `GEMINI/GEMINI_VALIDATION_20260218.md`

**Acceptance Criteria**:

- All launch blockers confirmed resolved
- No new CRITICAL or HIGH findings
- Validation report signed off

---

### APP-020: Fix Gateway STIG Route Mismatch ✅

**Priority**: 🟡 Medium (RESOLVED)
**Agent**: Claude
**File**: `apps/gateway/src/routes/stig/index.ts`
**Evidence**: Both reviewers flagged

**Resolution**: Added `GET /targets` and `GET /targets/:id` proxy routes to Python backend. Added `libraryProxyRoutes` plugin with `GET /library` (browse), `GET /library/summary` (stats), `GET /library/platforms/:platform`, `POST /library/rescan`. Canonical naming: `/assets` for frontend CRUD, `/targets` as proxy alias for API consumers. Existing DB-backed library routes unchanged. TypeScript clean.

---

### APP-021: Read-Only Syslog Event Count Endpoint

**Priority**: 🟡 Medium
**Agent**: Codex
**File**: `apps/syslog/src/syslog/main.py`
**Evidence**: Codex recommendation #6

**Requirements**:

1. Add `GET /api/v1/syslog/stats` endpoint returning: event_count, last_event_timestamp, sources_count
2. Auth-protected (viewer role minimum)
3. Lightweight query (COUNT with optional caching)

---

### DOC-002: Sprint Documentation Updates

**Priority**: 🟠 High
**Agent**: Claude
**Scope**: All project documentation

**Requirements**:

1. Update `IssuesTracker.md` — all new SEC-0XX issues tracked with resolution notes
2. Update `PROJECT_STATUS.md` — security posture, version bump if warranted
3. Update `CONTEXT.md` — if architectural changes (e.g., defusedxml, prod compose)
4. Update `README.md` — production deployment reference
5. Commit per COMMIT.md requirements

---

## Risk Register (Sprint-Specific)

| Risk                                                      | Likelihood | Impact | Mitigation                                   |
| --------------------------------------------------------- | ---------- | ------ | -------------------------------------------- |
| argon2 v0.44.0 breaks auth flow                           | Medium     | High   | Full auth test suite before merge            |
| defusedxml performance regression on large STIG libraries | Low        | Medium | Benchmark before/after with 189-STIG library |
| docker-compose.prod.yml diverges from dev compose         | Medium     | Medium | CI validates both compose files              |
| Syslog rate limiting drops legitimate traffic             | Low        | Medium | Tunable thresholds, monitoring dashboards    |
| SSH host key enforcement blocks lab devices               | Medium     | Low    | Explicit dev-mode override via env var       |

---

## Definition of Done (Sprint-Level)

- [ ] All 5 Tier 0 launch blockers resolved with tests
- [ ] All 6 Tier 1 high-priority items resolved with tests
- [ ] CI/CD green on all workflows
- [ ] Gemini validation pass: no CRITICAL/HIGH findings
- [ ] IssuesTracker.md updated with all resolutions
- [ ] PROJECT_STATUS.md reflects current state
- [ ] Production deployment guide exists
- [ ] No new warnings, secrets, or regressions
