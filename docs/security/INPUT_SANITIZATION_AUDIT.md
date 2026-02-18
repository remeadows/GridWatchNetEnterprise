# Input Sanitization Audit — GridWatch NetEnterprise v0.2.13

**Audit Date**: 2026-02-11
**Sprint**: SEC-HARDENING-01 (Day 4, SEC-019)
**Auditor**: Claude (PM + Implementation Engineer)
**Scope**: All user-facing input paths across gateway (TypeScript) and backend microservices (Python)

---

## Executive Summary

Comprehensive audit of all API endpoints, database queries, subprocess calls, and user input handling across the GridWatch NetEnterprise codebase. **No critical input sanitization vulnerabilities found.** All SQL queries use parameterized statements, all subprocess calls use exec-style argument arrays, and all gateway routes enforce Zod schema validation.

**Result**: ✅ PASS — No unmitigated input injection vectors detected.

---

## 1. SQL Injection Assessment

### Methodology

Grep-audited all database interaction files for raw SQL construction, string interpolation in queries, and use of parameterized placeholders.

### Findings

| Service              | File                                      | Method                                       | Status           |
| -------------------- | ----------------------------------------- | -------------------------------------------- | ---------------- |
| Gateway (TypeScript) | `apps/gateway/src/routes/syslog/index.ts` | `pool.query()` with `$1, $2...` placeholders | ✅ Parameterized |
| Gateway (TypeScript) | `apps/gateway/src/routes/ipam/index.ts`   | `pool.query()` with `$1, $2...` placeholders | ✅ Parameterized |
| Gateway (TypeScript) | `apps/gateway/src/routes/npm/index.ts`    | `pool.query()` with `$1, $2...` placeholders | ✅ Parameterized |
| Gateway (TypeScript) | `apps/gateway/src/routes/stig/index.ts`   | `pool.query()` with `$1, $2...` placeholders | ✅ Parameterized |
| Gateway (TypeScript) | `apps/gateway/src/routes/users.ts`        | `pool.query()` with `$1, $2...` placeholders | ✅ Parameterized |
| IPAM (Python)        | `apps/ipam/src/ipam/db/repository.py`     | `asyncpg` with `$1...` placeholders          | ✅ Parameterized |
| NPM (Python)         | `apps/npm/src/npm/db/repository.py`       | `asyncpg` with `$1...` placeholders          | ✅ Parameterized |
| STIG (Python)        | `apps/stig/src/stig/db/repository.py`     | `asyncpg` with `$1...` placeholders          | ✅ Parameterized |
| Syslog (Python)      | `apps/syslog/src/syslog/collector.py`     | `asyncpg.executemany()` with typed casts     | ✅ Parameterized |

### Dynamic WHERE Clause Construction

Several repositories build dynamic WHERE clauses for search/filter. Pattern used:

```python
# IPAM repository example
where_clauses.append(f"(name ILIKE ${param_idx} OR ...)")
params.append(f"%{search}%")
```

**Assessment**: Safe — parameter index placeholders are integer-concatenated (not user-controlled), and actual values are passed as bound parameters. No string interpolation of user values into SQL.

---

## 2. Command Injection Assessment

### Methodology

Searched all Python files for `subprocess`, `os.system`, `os.popen`, `shell=True`, and `asyncio.create_subprocess_shell`.

### Findings

| Service       | File                                           | Function        | Method                                 | Status  |
| ------------- | ---------------------------------------------- | --------------- | -------------------------------------- | ------- |
| IPAM Scanner  | `apps/ipam/src/ipam/services/scanner.py`       | `_ping_host()`  | `asyncio.create_subprocess_exec(*cmd)` | ✅ Safe |
| IPAM Scanner  | `apps/ipam/src/ipam/services/scanner.py`       | `_nmap_scan()`  | `asyncio.create_subprocess_exec(*cmd)` | ✅ Safe |
| NPM Discovery | `apps/npm/src/npm/collectors/discovery.py`     | `_ping_check()` | `asyncio.create_subprocess_exec(*cmd)` | ✅ Safe |
| NPM SNMPv3    | `apps/npm/src/npm/collectors/snmpv3_poller.py` | `_icmp_ping()`  | `asyncio.create_subprocess_exec(*cmd)` | ✅ Safe |

**Key Defense**: All subprocess calls use `create_subprocess_exec()` with argument arrays, not `create_subprocess_shell()`. This prevents shell metacharacter injection because arguments are passed directly to `execvp()` without shell interpretation.

**Example** (IPAM scanner):

```python
cmd = ["ping", "-c", str(count), "-W", str(timeout), ip]
proc = await asyncio.create_subprocess_exec(*cmd, ...)
```

The `ip` parameter is validated by Zod at the gateway (via `z.string().ip()`) and by Pydantic in the Python service before reaching the subprocess call.

### shell=True Usage

**Zero instances found.** ✅

---

## 3. Input Validation Assessment (API Boundary)

### Gateway (TypeScript / Fastify)

All gateway routes use **Zod schema validation** at request entry points. Schemas enforce type, length, format, and enum constraints.

| Route File                         | Schema(s)                       | Validation Points              |
| ---------------------------------- | ------------------------------- | ------------------------------ |
| `routes/auth.ts`                   | Login schema (email + password) | `schema.parse(request.body)`   |
| `routes/users.ts`                  | User create/update schema       | `.parse()` on body             |
| `routes/ipam/index.ts`             | Subnet/address schemas          | `.parse()` on body + query     |
| `routes/ipam/reports.ts`           | Report params schema            | `.parse()` on query            |
| `routes/npm/index.ts`              | Device schemas                  | `.parse()` on body             |
| `routes/npm/discovery.ts`          | Discovery params schema         | `.parse()` on body             |
| `routes/npm/device-groups.ts`      | Group schema                    | `.parse()` on body             |
| `routes/npm/reports.ts`            | Report params schema            | `.parse()` on query            |
| `routes/npm/snmpv3-credentials.ts` | Credential schema               | `.parse()` on body             |
| `routes/stig/index.ts`             | Target/checklist schemas        | `.parse()` on body + multipart |
| `routes/stig/ssh-credentials.ts`   | SSH credential schema           | `.parse()` on body             |
| `routes/syslog/index.ts`           | Source/filter/forwarder schemas | `.parse()` on body + query     |

**Key constraints applied**:

- `z.string().min(1).max(255)` — prevents empty and oversized text
- `z.string().ip()` — validates IP address format
- `z.number().int().min(N).max(M)` — validates numeric ranges
- `z.enum([...])` — restricts to allowed values
- `z.string().max(100)` — caps free-text fields

### Python Services (FastAPI / Pydantic)

Python services use implicit Pydantic validation on FastAPI endpoint models. Additional validation added by SEC-017 (file upload size/extension checks).

---

## 4. XSS Prevention Assessment

### Architecture Defense

GridWatch NetEnterprise uses a **JSON API architecture** — the gateway returns JSON responses, not HTML. The React frontend renders data using JSX, which **auto-escapes all interpolated values by default** (React's built-in XSS protection).

### Specific Considerations

| Context                         | Risk                                                           | Mitigation                              | Status      |
| ------------------------------- | -------------------------------------------------------------- | --------------------------------------- | ----------- |
| API responses (JSON)            | N/A — JSON is not rendered as HTML                             | Content-Type: application/json          | ✅ Safe     |
| React JSX rendering             | Low — React escapes `{}` interpolations                        | React's built-in DOM escaping           | ✅ Safe     |
| `dangerouslySetInnerHTML` usage | High if present                                                | **Not used** in codebase                | ✅ Verified |
| Syslog raw_message display      | Medium — network device output could contain HTML-like strings | Rendered via React JSX (auto-escaped)   | ✅ Safe     |
| PDF report generation           | Low — server-side generation                                   | pdfmake uses structured input, not HTML | ✅ Safe     |

### Helmet Headers

The gateway uses `@fastify/helmet` which sets:

- `Content-Security-Policy`
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `X-XSS-Protection: 0` (disabled in favor of CSP, per modern best practice)

---

## 5. Path Traversal Assessment

### File Upload Paths

| Endpoint              | File                     | Defense                                    | Status  |
| --------------------- | ------------------------ | ------------------------------------------ | ------- |
| STIG config upload    | `routes/stig/index.ts`   | Extension whitelist + size limit (SEC-017) | ✅ Safe |
| STIG checklist import | `routes/stig/index.ts`   | Size limit (SEC-017), processed in-memory  | ✅ Safe |
| STIG library ZIP      | `stig/library/parser.py` | defusedxml + ZIP entry limits (SEC-016)    | ✅ Safe |

No file uploads are written to disk with user-controlled filenames. All uploads are processed in-memory or via streaming proxies.

---

## 6. CORS Assessment

| Service           | Configuration                                                | Status        |
| ----------------- | ------------------------------------------------------------ | ------------- |
| Gateway (Fastify) | `@fastify/cors` — configured in plugin registration          | ✅ Configured |
| Auth Service      | Fastify CORS plugin                                          | ✅ Configured |
| Syslog Service    | **Was `allow_origins=["*"]`** → **Now restricted** (SEC-020) | ✅ Fixed      |

---

## 7. Rate Limiting

| Service          | Implementation                               | Status    |
| ---------------- | -------------------------------------------- | --------- |
| Gateway          | `@fastify/rate-limit` — per-route limits     | ✅ Active |
| Auth Service     | Fastify rate limit plugin                    | ✅ Active |
| Syslog Collector | Custom sliding-window rate limiter (SEC-015) | ✅ Active |

---

## 8. Capability Matrix

| Service          | Container Caps                     | Status      |
| ---------------- | ---------------------------------- | ----------- |
| All app services | `cap_drop: [ALL]` (SEC-021)        | ✅ Hardened |
| Vault            | `IPC_LOCK` only                    | ✅ Minimum  |
| IPAM Scanner     | `NET_RAW` only (NET_ADMIN removed) | ✅ Minimum  |
| NPM Collector    | `NET_RAW` only                     | ✅ Minimum  |
| Syslog Collector | `NET_BIND_SERVICE` only            | ✅ Minimum  |

---

## Conclusion

The GridWatch NetEnterprise codebase demonstrates consistent security practices across all input handling paths. The combination of Zod (TypeScript) and Pydantic (Python) schema validation at API boundaries, parameterized SQL queries via asyncpg/pg, and exec-style subprocess calls provides defense-in-depth against the OWASP Top 10 injection categories.

**Remaining recommendations** (non-blocking, for future hardening):

1. Add Content-Security-Policy nonce support for any future server-rendered HTML
2. Consider adding input length limits to Python repository search parameters (currently unbounded `ILIKE` patterns)
3. Add audit logging for failed validation attempts (Zod parse errors)
