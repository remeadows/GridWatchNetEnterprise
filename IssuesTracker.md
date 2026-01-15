# NetNynja Enterprise - Issues Tracker

> Active issues and technical debt tracking

**Version**: 0.2.5
**Last Updated**: 2026-01-15 15:15 EST
**Stats**: 0 open | 1 deferred | 142 resolved (archived)
**Codex Review**: 2026-01-14 11:30 (E2E: READY, Security: Low)
**Docker Scout**: 2026-01-15 (1 Critical, 8 High vulnerabilities identified)
**CI/CD Status**: PASS ✅ (2026-01-15)

---

## 🔥 NOW (Active / In Progress)

(none - all security issues resolved)

## ⏭️ NEXT (Queued / Ready)

- [ ] CI-012 — Upgrade Vite 5.x to 7.x (npm audit esbuild/vite moderate vulnerability) - Deferred
- [ ] Phase 9 — Documentation site deployment (optional)

## ⛔ BLOCKED (Waiting / External Dependency)

- [ ] SEC-011 — zlib CVE-2026-22184 (Critical) - No upstream fix available, monitoring Alpine/Node releases

---

## 📋 SEC-011: Docker Scout Vulnerability Remediation Plan

**Status**: Active Monitoring | **Owner**: DevOps | **Created**: 2026-01-15

### Current Vulnerabilities (Docker Scout Assessment)

| Severity | CVE            | Package     | Fix Available       | Action           |
| -------- | -------------- | ----------- | ------------------- | ---------------- |
| Critical | CVE-2026-22184 | zlib        | ❌ No               | Monitor upstream |
| High     | CVE-2024-21538 | cross-spawn | ✅ Yes (via Vite 7) | Scheduled        |
| High     | CVE-2025-64756 | glob        | ✅ Yes (via Vite 7) | Scheduled        |
| High     | CVE-2024-23342 | ecdsa       | ⏳ Pending          | Monitor          |
| High     | CVE-2025-6020  | PAM         | ⏳ Pending          | Monitor          |
| High     | CVE-2025-68973 | GnuPG       | ⏳ Pending          | Monitor          |

### Remediation Strategy

**Tier 1: Monitor (No Fix Available)**

- zlib CVE-2026-22184: Subscribe to Alpine Linux security announcements
- Compensating control: Container network isolation, minimal attack surface

**Tier 2: Scheduled Updates (CI-012)**

- cross-spawn, glob: Fixed by upgrading Vite 5.x → 7.x
- Requires React 18 compatibility testing
- Target: Next sprint after stability validation

**Tier 3: Rebuild on Upstream Fix**

- When Alpine releases fixed packages: `docker compose build --no-cache`
- Re-run Docker Scout scan to verify remediation

### Monitoring Checklist

- [ ] Subscribe to Alpine Linux security mailing list
- [ ] Subscribe to Node.js security announcements
- [ ] Set calendar reminder for weekly vulnerability review
- [ ] Document risk acceptance for CVE-2026-22184 in security register

---

## 📝 Open Issues (Codex Review 2026-01-14)

All issues from Codex Review 2026-01-14 have been resolved.

---

## 📋 Archiving Instructions

**When to Archive:**

- When resolved issues exceed **50 entries** in this file
- At the end of each **major release** (v0.x.0)
- **Quarterly** as part of housekeeping

**How to Archive:**

1. Create or append to `IssuesTracker.archive.md`
2. Update archive header with new **End Date** and **Total Issues Archived**
3. Move all resolved issues from the "Recently Resolved" section below to the archive
4. Keep only the last 30 days of resolved issues in this file for context
5. Update the **Stats** line at the top of this file

**Archive Format:**

```markdown
| ID   | P   | Title       | Resolved   | Resolution          |
| ---- | --- | ----------- | ---------- | ------------------- |
| #XXX | 🟠  | Short title | YYYY-MM-DD | One-line resolution |
```

---

## Issue Priority Legend

- 🔴 **Critical** — Blocking issues preventing core functionality
- 🟠 **High** — Important issues to resolve soon
- 🟡 **Medium** — Normal development priority
- 🟢 **Low** — Nice-to-have improvements

---

## 📜 Recently Resolved (Last 30 Days)

| ID      | P   | Title                                   | Resolved   | Resolution                                            |
| ------- | --- | --------------------------------------- | ---------- | ----------------------------------------------------- |
| CI-015  | 🟠  | Tests workflow failing                  | 2026-01-15 | Added --passWithNoTests to Jest config                |
| CI-016  | 🟡  | E2E cleanup step failing                | 2026-01-15 | Added fallback to docker compose down in CI           |
| SEC-010 | 🟠  | Container security vulnerability scan   | 2026-01-15 | Docker Scout scan completed, report generated         |
| DOC-003 | 🟢  | Code signing implementation guide       | 2026-01-15 | Created CODE_SIGNING_GUIDE.md with Cosign/GPG docs    |
| INFRA-8 | 🟠  | Container image signing and publishing  | 2026-01-15 | All 14 images signed with Cosign, pushed to GHCR      |
| UI-016  | 🟢  | ISSO Executive Summary document         | 2026-01-15 | Created HTML/Word doc with project overview for ISSO  |
| UI-015  | 🟡  | Subtitle text illegible on dark bg      | 2026-01-15 | Brighter colors + text-shadow for gray-400/500        |
| UI-014  | 🟢  | Add condensed display density           | 2026-01-15 | Added "Condensed" option with 9-15px fonts            |
| UI-013  | 🟡  | Display density system                  | 2026-01-15 | CSS variables for 4 density levels + toggle + prefs   |
| STIG-05 | 🟠  | SSH credentials need sudo support       | 2026-01-15 | Added sudo fields to SSH credentials (method/user/pw) |
| STIG-04 | 🟠  | SSH credentials management UI           | 2026-01-15 | Created CredentialsPage with CRUD for SSH creds       |
| APP-015 | 🟠  | Settings Preferences nav link           | 2026-01-15 | Added Preferences to Settings sidebar navigation      |
| SEC-008 | 🟡  | NATS auth/TLS disabled                  | 2026-01-14 | Created nats.prod.conf, cert gen script, updated docs |
| SEC-009 | 🟢  | trustProxy always true                  | 2026-01-14 | Made configurable via TRUST_PROXY env var             |
| SEC-006 | 🟠  | .env tracked with secrets               | 2026-01-14 | Already in .gitignore, .env.example exists            |
| SEC-007 | 🟠  | DB/Cache ports exposed                  | 2026-01-14 | Bound Postgres/Redis/NATS to 127.0.0.1                |
| APP-012 | 🔴  | Preflight CRLF errors on Windows        | 2026-01-14 | Converted to LF, added PowerShell wrapper             |
| APP-013 | 🔴  | Preflight Docker checks fail            | 2026-01-14 | Created preflight.ps1 for native Windows              |
| APP-014 | 🟠  | OpenAPI endpoint mismatch               | 2026-01-14 | Fixed endpoint to `/docs/json`                        |
| CI-013  | 🟡  | Tests workflow - shared-types not found | 2026-01-14 | Simplified package.json exports                       |
| CI-005  | 🟠  | Validate Workspaces fails all platforms | 2026-01-14 | Changed to npm run build (Turborepo)                  |
| SEC-004 | 🟡  | STIG ZIP upload DoS limits              | 2026-01-14 | Already implemented (500 files, 100MB)                |
| SEC-005 | 🟢  | Observability ports exposed             | 2026-01-14 | Bound to localhost only                               |
| WIN-001 | 🟠  | Windows Hyper-V port conflicts          | 2026-01-14 | NATS→8322, Vault→8300                                 |
| #113    | 🟠  | NPM disk/storage metrics                | 2026-01-12 | Added Sophos SFOS OIDs                                |
| #114    | 🟠  | NPM interface traffic summaries         | 2026-01-12 | Added IF-MIB 64-bit counters                          |
| #115    | 🟡  | NPM Sophos service status               | 2026-01-12 | Added 20+ service status OIDs                         |
| APP-008 | 🟠  | STIG Library 500 error                  | 2026-01-12 | Created missing database tables                       |
| APP-009 | 🟠  | Auto-polling not working                | 2026-01-12 | Created npm.device_metrics table                      |
| APP-010 | 🟠  | NPM Poll Now fails                      | 2026-01-12 | Created partitioned metrics tables                    |
| APP-011 | 🟡  | Sidebar toggle not visible              | 2026-01-12 | Fixed Sidebar.tsx condition                           |

---

## 🗄️ Deferred Issues

| ID     | P   | Title                   | Reason                                            | Target        |
| ------ | --- | ----------------------- | ------------------------------------------------- | ------------- |
| CI-012 | 🟡  | Upgrade Vite 5.x to 7.x | Major version bump, needs React 18 compat testing | Future sprint |

---

## 📁 Archive Reference

For historical resolved issues, see: **[IssuesTracker.archive.md](IssuesTracker.archive.md)**

| Archive Period           | Issues |
| ------------------------ | ------ |
| 2026-01-06 to 2026-01-14 | 123    |

---

## Issue Template

```markdown
| ID   | P   | Title                   | Status           | Owner     |
| ---- | --- | ----------------------- | ---------------- | --------- |
| #XXX | 🟠  | Short descriptive title | Open/In Progress | @username |

**Description**: One paragraph max
**Steps**: 1. 2. 3.
**Resolution**: (filled when closed)
```

---

## Notes

- Keep this file under 200 lines for token efficiency
- Use one-line resolutions in tables
- Archive regularly per instructions above
- Link to GitHub Issues for detailed discussions
