# Codex Security Review

## A) Executive Summary

- Security posture: Medium
- CI readiness: At-risk
- Top 5 actions to get CI green fastest:
  1. Remove or lock down default admin seed credentials and require an explicit bootstrap flow.
  2. Fix Prettier failures in Helm templates (YAML front-matter) so `npm run format:check` passes.
  3. Replace default encryption/JWT secrets and require non-default values at startup.
  4. Restrict `/metrics` and tighten CORS defaults to avoid accidental public exposure.
  5. Address npm audit highs (React Router open redirect/XSS) and dev-server esbuild advisory.

## B) Monorepo & CI Observations

- Workspace layout: npm workspaces at `apps/*`, `packages/*`, `services/*` plus Poetry at repo root and per-app `apps/*/pyproject.toml`.
- CI provider: GitHub Actions.
  - Node versions: 20.x (tests/lint), matrix 20.x + 22.x (workspace validation).
  - Python versions: 3.11 (tests), matrix 3.11 + 3.12 (Poetry validation).
- CI steps (selected):
  - Node: `npm ci`, `npm run build --workspaces`, `npm run typecheck --workspaces`, `npm run test --workspaces`, lint/format check.
  - Python: Poetry install + pytest/ruff/mypy (best-effort).
  - Security scan: Trivy image/IaC, npm audit, safety/pip-audit.

### Commands executed + results (local)

- `npm ci` → success; 5 vulnerabilities reported by npm audit summary.
- `npm run -s build` → failed: Turbo API client TLS/keychain error.
- `npm run -s typecheck` → failed: Turbo API client TLS/keychain error.
- `npm run -s lint` → failed: Turbo API client TLS/keychain error.
- `npm run -s test` → failed: Turbo API client TLS/keychain error.
- `npm run -s format:check` → failed: Prettier parse errors in Helm templates + many formatting warnings.
- `npm audit --audit-level=high` → high/moderate advisories in React Router + esbuild.
- Poetry, pip-audit, trivy, osv-scanner → not available locally (not run).

## C) Findings (Prioritized, Actionable)

### SR-001

- Severity: High
- Category: Secrets
- Evidence:
  - `seed-admin.sql:1` (masked excerpt)
  ```sql
  -- Seed default admin user
  -- Username: Admin
  -- Password: admin***
  ```
- Impact: A default admin password in repo enables trivial account takeover if the seed script is used or copied into deployments; this is a common compliance blocker and can fail security scans.
- Recommendation: Remove the static password from seed scripts; replace with a one-time bootstrap flow that requires a randomly generated password or an explicit admin reset token delivered out-of-band.
- Suggested patch outline:
  - Replace the seed script with a bootstrap command that prints a single-use setup token.
  - Require `ADMIN_BOOTSTRAP_PASSWORD` or a one-time token at startup; fail fast if missing.

### SR-002

- Severity: High
- Category: Auth
- Evidence:
  - `apps/stig/src/stig/core/config.py:41`
  ```python
  # JWT
  jwt_secret: str = Field(default="dev-secret-change-in-production", alias="JWT_SECRET")
  jwt_algorithm: str = Field(default="HS256", alias="JWT_ALGORITHM")
  ```
- Impact: A hardcoded default JWT secret is a production footgun; if env vars are omitted, attackers can forge tokens and gain access to STIG endpoints.
- Recommendation: Make `JWT_SECRET` required in production (or always required). Fail fast on startup if unset; document rotation expectations.
- Suggested patch outline:
  - In settings validation, raise an error when `JWT_SECRET` is unset (or when running in non-development mode).

### SR-003

- Severity: Medium
- Category: Auth
- Evidence:
  - `apps/stig/src/stig/core/auth.py:41`
  ```python
  payload = jwt.decode(
      token,
      settings.jwt_secret,
      algorithms=[settings.jwt_algorithm],
      options={"verify_aud": False},
  )
  ```
- Impact: Disabling audience verification and not enforcing issuer allows tokens minted for other services to be accepted, increasing the blast radius of JWT leakage or mis-issuance.
- Recommendation: Enforce `aud` and `iss` and align with the same values used in other services (`netnynja-api`, `netnynja-enterprise`).
- Suggested patch outline:
  - Add `audience=...`, `issuer=...` to `jwt.decode` and remove `verify_aud: False`.

### SR-004

- Severity: High
- Category: Crypto
- Evidence:
  - `apps/gateway/src/config.ts:73`

  ```ts
  CREDENTIAL_ENCRYPTION_KEY: z.string()
    .min(32)
    .default("netnynja-***-redacted");
  ```

  - `apps/gateway/src/routes/npm/snmpv3-credentials.ts:17`

  ```ts
  const key = crypto.scryptSync(config.CREDENTIAL_ENCRYPTION_KEY, "salt", 32);
  ```

- Impact: A default encryption key plus a static salt makes SNMPv3 credential encryption predictable; compromise of one environment enables offline brute-force or reuse in others.
- Recommendation: Remove defaults, require a high-entropy key via secrets manager, and use per-record random salt/IV derivation (store salt alongside ciphertext).
- Suggested patch outline:
  - Replace static salt with `crypto.randomBytes(16)` per credential and persist it.
  - Fail startup if `CREDENTIAL_ENCRYPTION_KEY` is unset or still defaulted.

### SR-005

- Severity: Medium
- Category: Crypto
- Evidence:
  - `apps/npm/src/npm/services/crypto.py:25`

  ```python
  self._key = key or settings.jwt_secret or "netnynja-***-redacted"
  ```

  - `apps/npm/src/npm/services/crypto.py:31`

  ```python
  salt=b"netnynja-npm-salt"  # Static salt
  ```

- Impact: Reusing `JWT_SECRET` for encryption and providing a fallback key with static salt weakens confidentiality of stored credentials and enables offline attack reuse.
- Recommendation: Use a dedicated encryption key (required) and a per-instance random salt; store salt alongside ciphertext.
- Suggested patch outline:
  - Introduce `NPM_CREDENTIAL_KEY` required at startup.
  - Generate and store salt per deployment or per record; remove fallback string.

### SR-006

- Severity: Medium
- Category: Auth
- Evidence:
  - `apps/gateway/src/plugins/metrics.ts:331`
  ```ts
  fastify.get("/metrics", async (_request, reply) => {
  ```
- Impact: The `/metrics` endpoint is unauthenticated and can expose internal service statistics, which is useful for reconnaissance and could leak infrastructure metadata.
- Recommendation: Require auth for `/metrics` or restrict by network ACL/IP allowlist; optionally serve metrics on a separate internal-only port.
- Suggested patch outline:
  - Add `preHandler: [fastify.requireAuth]` or an IP allowlist guard to `/metrics`.

### SR-007

- Severity: Medium
- Category: Auth
- Evidence:
  - `apps/web-ui/src/stores/auth.ts:18`

  ```ts
  export const useAuthStore = create<AuthState>()(
    persist(
  ```

  - `apps/web-ui/src/stores/auth.ts:114`

  ```ts
  name: 'netnynja-auth',
  partialize: (state) => ({ tokens: state.tokens, ... })
  ```

- Impact: `zustand` persistence defaults to `localStorage`, meaning access and refresh tokens are stored in the browser and exposed to XSS.
- Recommendation: Prefer HttpOnly cookies for refresh tokens and keep access tokens in memory only; if local storage is unavoidable, add CSP + stricter XSS mitigations.
- Suggested patch outline:
  - Switch to server-set HttpOnly cookies for refresh tokens; store access token in memory.

### SR-008

- Severity: Medium
- Category: Auth
- Evidence:
  - `apps/gateway/src/config.ts:31`
  ```ts
  CORS_ORIGIN: z.string().transform(...).default("true"),
  CORS_CREDENTIALS: z.coerce.boolean().default(true),
  ```
- Impact: Defaulting to `origin: true` with credentials allows any origin in absence of explicit configuration, which can enable credentialed cross-origin requests.
- Recommendation: Require explicit allowlist in production and fail startup if `CORS_ORIGIN` is not set.
- Suggested patch outline:
  - Enforce `CORS_ORIGIN` for non-development environments; document expected values.

### SR-009

- Severity: Low
- Category: Messaging
- Evidence:
  - `apps/ipam/src/ipam/core/config.py:37`

  ```python
  nats_url: str = Field(default="nats://localhost:4222", alias="NATS_URL")
  ```

  - `apps/ipam/src/ipam/collectors/nats_handler.py:43`

  ```python
  self.nc = await nats.connect(settings.nats_url)
  ```

- Impact: No explicit TLS/auth configuration is enforced; if `NATS_URL` is left at defaults or misconfigured, JetStream traffic may be unauthenticated and in cleartext. Needs confirmation based on deployment.
- Recommendation: Require TLS and credentials in production; document and validate `NATS_URL` (e.g., `tls://` and creds/token options).
- Suggested patch outline:
  - Validate `NATS_URL` scheme and require credentials for non-dev.

### SR-010

- Severity: Low
- Category: Observability
- Evidence:
  - `apps/npm/src/npm/services/metrics.py:38`

  ```python
  f'npm_device_cpu_utilization{device_id=...,device_name="{device_name}"} ...'
  ```

  - `apps/ipam/src/ipam/services/metrics.py:38`

  ```python
  f'ipam_network_total_addresses{network_id=...,network_name="{network_name}"} ...'
  ```

- Impact: Unescaped label values can break Prometheus exposition format and high-cardinality labels (`device_name`, `interface_name`, `network_name`) can cause metrics DoS or PII leakage.
- Recommendation: Escape label values and reduce cardinality (e.g., use IDs only or hash names).
- Suggested patch outline:
  - Implement a safe label-escaping helper and remove human-readable names from labels.

### SR-011

- Severity: Medium
- Category: Dependencies
- Evidence:
  - `npm audit --audit-level=high` (tool output)
    - React Router open redirect/XSS advisory affecting `react-router-dom`.
    - `esbuild` dev server request proxy advisory (via `vite`).
- Impact: High-severity dependency issues can trigger security gates and expose web UI routes to open-redirect/XSS risks.
- Recommendation: Bump `react-router-dom` to a patched version and upgrade `vite` to resolve the bundled `esbuild` advisory; verify no breaking changes.
- Suggested patch outline:
  - Update `apps/web-ui/package.json` to patched `react-router-dom` and compatible Vite/esbuild versions.

### SR-012

- Severity: Medium
- Category: CI
- Evidence:
  - `npm run -s format:check` (tool output)
    - Prettier parse errors in `charts/netnynja-enterprise/templates/*.yaml` due to Helm template front-matter.
- Impact: Format checks fail locally and are likely to fail in any pre-commit or CI steps that enforce Prettier, delaying merges.
- Recommendation: Exclude Helm templates from Prettier or configure a Helm-aware formatter.
- Suggested patch outline:
  - Add `charts/**/templates/*.yaml` to Prettier ignore or use `prettier-plugin-helm`.

## D) CI/CD “Green Path” Plan

**< 1 hour**

- Fix Helm template formatting failures or exclude from Prettier; rerun `npm run -s format:check`.
- Remove default admin seed password and require explicit bootstrap credential.
- Lock down `/metrics` endpoint and ensure CORS allowlist in production.

**Same day**

- Rotate/require encryption keys (gateway + NPM) and remove static salts.
- Enforce JWT `aud`/`iss` in STIG auth and remove default JWT secret.
- Upgrade `react-router-dom`/`vite` to clear npm audit highs.

**Backlog**

- Add NATS TLS/creds validation in config; document required settings.
- Reduce VictoriaMetrics label cardinality and escape label values.

**Local verification commands**

- `npm run -s format:check`
- `npm run -s lint`
- `npm run -s typecheck`
- `npm run -s test`
- `npm audit --audit-level=high`
- (Python) `poetry install && poetry run pytest services/`

## E) Tooling Recommendations (Optional)

- Add `prettier-plugin-helm` (or a Prettier ignore rule) for `charts/**/templates/*.yaml`.
- Add `pip-audit` and `osv-scanner` to CI images for reproducible dependency scans.

## F) Appendix

- Key files reviewed:
  - `package.json`, `pyproject.toml`, `.github/workflows/*.yml`
  - `apps/gateway/src/config.ts`, `apps/gateway/src/plugins/metrics.ts`, `apps/gateway/src/routes/npm/snmpv3-credentials.ts`
  - `services/auth-service/src/index.ts`, `packages/shared-auth/src/index.ts`
  - `apps/stig/src/stig/core/config.py`, `apps/stig/src/stig/core/auth.py`
  - `apps/npm/src/npm/services/crypto.py`, `apps/npm/src/npm/services/metrics.py`
  - `apps/ipam/src/ipam/services/metrics.py`, `apps/ipam/src/ipam/core/config.py`
  - `apps/web-ui/src/stores/auth.ts`
  - `seed-admin.sql`
- Dependency risk summary:
  - Node: High/moderate advisories in React Router and esbuild (via Vite) from `npm audit`.
  - Python: Not scanned locally (Poetry/pip-audit unavailable).
- Notable config footguns:
  - Default JWT secret in STIG config and disabled audience verification.
  - Default encryption key and static salt for SNMPv3 credential encryption.
  - Open `/metrics` endpoint and permissive CORS default with credentials.
