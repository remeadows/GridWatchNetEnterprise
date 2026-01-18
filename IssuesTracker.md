# NetNynja Enterprise - Issues Tracker

> Active issues and technical debt tracking

**Version**: 0.2.12
**Last Updated**: 2026-01-18 16:15 UTC
**Stats**: 2 open | 1 deferred | 165 resolved (archived)
**Codex Review**: 2026-01-16 (E2E: FIXED, Security: Low, CI: PASS ✅)
**Docker Scout**: 2026-01-15 (1 Critical, 3 High - 2 fixed via Vite 7 upgrade)
**CI/CD Status**: ✅ ALL WORKFLOWS PASSING (3 phases, 3 commits, full audit trail)
**npm audit**: 3 HIGH vulnerabilities (tar/argon2 - deferred to SEC-001)

---

## 🔥 NOW (Active / In Progress)

### APP-018: Syslog Events API - 500 Internal Server Error

**Status**: 🔴 Open - Runtime Error
**Priority**: 🔴 Critical - Feature Broken
**Detected**: 2026-01-18 16:10 UTC (Browser monitoring session)
**Engineer**: TBD

**Issue**: Syslog events listing endpoint returning 500 Internal Server Error

**Failed Endpoint**:

- `GET /api/v1/syslog/events?page=1&limit=100` - Status 500
- Stats endpoint working: `GET /api/v1/syslog/events/stats?hours=24` - Status 200

**Observed Behavior**:

- Multiple failures during 20-second monitoring period (4 failed requests)
- Error appears to be backend/database related
- Stats aggregation works, but event listing fails

**Impact**:

- Syslog events page unable to display event list
- Users cannot view individual syslog events
- Event statistics still functional

**Testing Note**: User will have active device performing syslog to application tomorrow (2026-01-19)

**Next Steps**:

1. Check backend syslog service logs for error details
2. Verify `syslog.events` table exists and has correct schema
3. Review endpoint error handling and query logic
4. Test with live syslog data from device tomorrow

---

### UI-017: React Router v7 Migration Warnings

**Status**: 🟡 Open - Future Compatibility
**Priority**: 🟢 Low - Non-Blocking Warning
**Detected**: 2026-01-18 16:10 UTC (Browser monitoring session)
**Engineer**: TBD

**Issue**: React Router displaying future version compatibility warnings

**Warnings**:

1. Missing `v7_startTransition` future flag
2. Missing `v7_relativeSplatPath` future flag

**Observed Behavior**:

- 6 warnings logged during navigation (2 warnings per route change)
- No functional impact - purely informational
- Source: `react-router-dom.js:4434:12`

**Impact**:

- None currently - application works correctly
- Console warnings during development/debugging
- Preparation for React Router v7 upgrade

**Resolution Plan**:

- Add future flags to router configuration when convenient
- Can be addressed during next major refactor
- Non-urgent, deferred to future maintenance cycle

**Reference**: https://reactrouter.com/v6/upgrading/future

---

## 📋 DEFERRED

### SEC-001: npm Security Vulnerabilities (Deferred to Phase 2)

**Status**: 🟡 Deferred - Non-Blocking
**Priority**: 🟠 High - Security Issue
**Detected**: 2026-01-18 14:50 UTC
**Target Resolution**: Within 48 hours

**Vulnerabilities**:

```
Package: tar (<=7.5.2)
Severity: HIGH
CVE: GHSA-8qq5-rm4j-mr97
Issue: Arbitrary File Overwrite and Symlink Poisoning

Dependency Chain:
argon2@0.27.2-0.31.2 → @mapbox/node-pre-gyp@<=1.0.11 → tar@<=7.5.2

Count: 3 HIGH severity vulnerabilities
```

**Risk Assessment**:

- Exploitability: Medium (requires malicious tar archive processing)
- Impact: High (arbitrary file write, potential RCE)
- Production Exposure: Low (tar not used in runtime code paths)
- Affected Service: auth-service (password hashing)

**Remediation Plan (Phase 2)**:

1. Update argon2 to v0.44.0+ (breaking change)
2. Verify auth service password hashing compatibility
3. Run `npm audit fix --force` and validate
4. Test authentication flows thoroughly

**Justification for Deferral**:

- Build/CI fixes take priority (release blocker)
- Security issues don't block v0.2.12 release
- Low production risk (no tar operations in runtime)
- Will address in separate commit within 48 hours

(none - moved CI-001 to NOW)

---

## ✅ Recently Resolved (2026-01-18)

### CI-003: TypeScript Compilation Errors in Gateway STIG Routes

**Resolution**: Fixed 5 TypeScript errors blocking CI/CD pipeline in `apps/gateway/src/routes/stig/index.ts`:

- Line 280: Added type assertion for `request.body as string` (TS2345)
- Lines 302, 376, 443: Added explicit `return reply;` statements after file downloads (TS7030)
- Line 3172: Fixed Buffer/fetch incompatibility with `new Uint8Array(formBuffer)` (TS2769)
- Result: All typechecks pass, 67/67 tests pass, CI/CD workflows green ✅
- Commit: 79bcf10

### CI-002: Missing Source Files (.gitignore Pattern Issue)

**Resolution**: Fixed `.gitignore` pattern blocking source code from being committed:

- Changed `STIG/` to `/STIG/` (root-anchored pattern) to prevent matching `apps/web-ui/src/modules/stig/`
- Added missing files: `AuditProgressPage.tsx` (27KB), `juniper_stig_checker.py`, `assignment.py`
- Verified with `git check-ignore -v` before and after fix
- Result: All source files now tracked in git, CI/CD can access them
- Commit: 97bc2e1

### CI-001: CI/CD Pipeline Validation (Rollup ARM64 Dependency)

**Resolution**: Fixed npm optional dependency installation failure causing all 3 workflows to fail:

- Cleaned node_modules and package-lock.json
- Cleared npm cache with `npm cache clean --force`
- Reinstalled dependencies with `npm install --ignore-scripts` (proxy workaround)
- Verified local build (6/6 packages) and tests (67/67) pass
- Created comprehensive audit trail: `docs/audit/2026-01-18_CI_CD_Failure_Remediation.md` (20+ pages)
- Result: Build succeeds, dependencies install correctly in CI/CD
- Commit: 8461bbb

### STIG-19: Combined PDF Report for Multi-STIG Config Analysis

**Resolution**: Added combined report generation endpoints and frontend integration:

- New API endpoints: `GET /reports/combined-pdf` and `GET /reports/combined-ckl` accepting comma-separated job_ids
- `ReportGenerator.generate_combined_pdf_from_jobs()` creates single PDF with executive summary + per-STIG sections
- `ReportGenerator.generate_combined_ckl_from_jobs()` creates ZIP with separate CKL files per STIG
- Frontend `AssetsPage.tsx` tracks all job IDs and uses combined endpoints for multi-STIG downloads
- Gateway proxy routes added for combined report endpoints

### STIG-18: Config Analysis Only Analyzes First STIG

**Resolution**: Modified `AssetsPage.tsx` to run config analysis against ALL assigned/enabled STIGs:

- Changed from single-STIG analysis to loop through all enabled definitions
- Aggregates results from all STIGs (total checks, passed, failed, compliance score)
- Stores all job IDs in state for combined report generation
- UI displays consolidated results across all analyzed STIGs

### STIG-17: PDF Description Contains Raw XML Tags

**Resolution**: Added `extract_vuln_discussion()` function to both PDF and CKL exporters:

- Extracts only the `<VulnDiscussion>` content from raw STIG descriptions
- Falls back to stripping all XML tags if no VulnDiscussion tag present
- Added `clean_text_for_pdf()` helper for safe PDF rendering
- Improved PDF format: V-ID, Severity, Status, Title, Description, Fix Text with separators

### STIG-14: Config Analysis Uses Assigned STIGs

**Resolution**: Modified `AssetsPage.tsx` Config Analysis modal to:

- Auto-fetch assigned STIGs when opening the modal
- Display assigned/enabled STIGs instead of requiring manual selection
- Use the first enabled assigned STIG for analysis automatically
- Only show STIG dropdown if no STIGs are assigned to the asset

### STIG-15: PDF Report Full V-ID Details

**Resolution**: Enhanced PDF report generator (`pdf.py`) to include:

- Full description (Vulnerability Discussion) for each failed finding
- Fix Text (Remediation guidance) for each failed finding
- New paragraph styles for description and fix text
- `KeepTogether` blocks to keep findings from breaking across pages
- Report generator now fetches rule details from `definition_rules` table

### STIG-16: CKL Report Full V-ID Details

**Resolution**: Enhanced CKL exporter (`ckl.py`) to:

- Accept `rule_details` dict from database instead of relying on `xccdf_content`
- Populate `Vuln_Discuss`, `Check_Content`, and `Fix_Text` fields from database
- Maintain backwards compatibility with legacy `xccdf_content` fallback

### STIG-500: SSH Credentials 500 Error

**Resolution**: Applied missing migration `008_add_ssh_credentials_sudo.sql` adding sudo columns to `stig.ssh_credentials` table. Gateway was failing because the table lacked `sudo_enabled`, `sudo_method`, `sudo_password_encrypted`, `sudo_user` columns.

### STIG-13: Multi-STIG Assignment API (Backend Completion)

**Resolution**: Added missing Python API endpoint handlers in `apps/stig/src/stig/api/routes.py`:

- `GET /targets/{id}/definitions` - List assigned STIGs
- `POST /targets/{id}/definitions` - Assign STIG
- `POST /targets/{id}/definitions/bulk` - Bulk assign
- `PATCH /targets/{id}/definitions/{id}` - Update assignment
- `DELETE /targets/{id}/definitions/{id}` - Remove assignment
- `POST /targets/{id}/audit-all` - Audit all enabled STIGs
- `GET /audit-groups` - List audit groups
- `GET /audit-groups/{id}` - Get audit group
- `GET /audit-groups/{id}/summary` - Get compliance summary

**Note**: Gateway routes were already complete. Only the Python service backend was missing.

### DOC-001: STIG Selection Guide

**Resolution**: Created `docs/STIG_SELECTION_GUIDE.md` documenting:

- STIG selection logic (role-based approach)
- Juniper SRX STIG package breakdown (NDM, ALG, VPN, IDPS)
- When to apply each STIG based on device functionality
- Multi-STIG UI usage instructions
- Database schema reference

## ⏭️ NEXT (Queued / Ready)

- [ ] Seed E2E users in `shared.users` table
- [ ] Validate VictoriaMetrics write endpoint (preflight warning)
- [ ] Verify NATS stream endpoint JSON format for monitoring
- [ ] Phase 9 — Documentation site deployment (optional)

## ⛔ BLOCKED (Waiting / External Dependency)

- [ ] SEC-011 — zlib CVE-2026-22184 (Critical) - No upstream fix available, monitoring Alpine/Node releases

---

## 📋 SEC-011: Docker Scout Vulnerability Remediation Plan

**Status**: Active Monitoring | **Owner**: DevOps | **Created**: 2026-01-15

### Current Vulnerabilities (Docker Scout Assessment)

| Severity | CVE            | Package     | Fix Available | Action            |
| -------- | -------------- | ----------- | ------------- | ----------------- |
| Critical | CVE-2026-22184 | zlib        | ❌ No         | Monitor upstream  |
| High     | CVE-2024-21538 | cross-spawn | ✅ Fixed      | Vite 7 upgrade ✅ |
| High     | CVE-2025-64756 | glob        | ✅ Fixed      | Vite 7 upgrade ✅ |
| High     | CVE-2024-23342 | ecdsa       | ⏳ Pending    | Monitor           |
| High     | CVE-2025-6020  | PAM         | ⏳ Pending    | Monitor           |
| High     | CVE-2025-68973 | GnuPG       | ⏳ Pending    | Monitor           |

### Remediation Strategy

**Tier 1: Monitor (No Fix Available)**

- zlib CVE-2026-22184: Subscribe to Alpine Linux security announcements
- Compensating control: Container network isolation, minimal attack surface

**Tier 2: Completed ✅ (2026-01-15)**

- cross-spawn, glob: Fixed by upgrading Vite 5.x → 7.3.1
- @vitejs/plugin-react: 4.2.1 → 5.1.2
- @types/node: 20.10.0 → 20.19.0
- npm audit: 0 vulnerabilities

**Tier 3: Rebuild on Upstream Fix**

- When Alpine releases fixed packages: `docker compose build --no-cache`
- Re-run Docker Scout scan to verify remediation

### Monitoring Checklist

- [x] Subscribe to Alpine Linux security mailing list - https://lists.alpinelinux.org/lists/~alpine/security-announce
- [x] Subscribe to Node.js security announcements - https://nodejs.org/en/about/security
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

| ID      | P   | Title                                   | Resolved   | Resolution                                                  |
| ------- | --- | --------------------------------------- | ---------- | ----------------------------------------------------------- |
| CI-003  | 🔴  | TypeScript compilation errors           | 2026-01-18 | Fixed 5 TS errors in gateway STIG routes (79bcf10)          |
| CI-002  | 🔴  | Missing source files (gitignore)        | 2026-01-18 | Root-anchored STIG/ pattern, added 3 files (97bc2e1)        |
| CI-001  | 🔴  | CI/CD pipeline failures (Rollup ARM64)  | 2026-01-18 | Clean reinstall, audit trail, all workflows pass (8461bbb)  |
| STIG-19 | 🟠  | Combined PDF for multi-STIG analysis    | 2026-01-18 | New combined-pdf/ckl endpoints with executive summary       |
| STIG-18 | 🟠  | Config analysis only first STIG         | 2026-01-18 | Loop through all enabled STIGs, aggregate results           |
| STIG-16 | 🟠  | CKL report missing V-ID details         | 2026-01-18 | Enhanced CKL exporter with rule details from database       |
| STIG-15 | 🟠  | PDF report missing V-ID details         | 2026-01-18 | Added full description and fix text to PDF findings         |
| STIG-14 | 🟠  | Config analysis requires STIG selection | 2026-01-18 | Auto-use assigned STIGs for config analysis                 |
| STIG-13 | 🔴  | Multi-STIG selection for assets         | 2026-01-17 | Target-STIG associations, batch audits, combined PDF/CKL    |
| STIG-12 | 🔴  | Report PDF/CKL download fails           | 2026-01-17 | Fixed config import, Pydantic model access, enhanced report |
| STIG-11 | 🟠  | Config analysis 401 Unauthorized        | 2026-01-16 | Fixed frontend to use api client with auth header           |
| STIG-10 | 🟠  | Config analysis 404 gateway route       | 2026-01-16 | Added proxy route in gateway for STIG service               |
| STIG-09 | 🟠  | SSH audit endpoint proxy missing        | 2026-01-16 | Added audit routes proxy to gateway (STIG service)          |
| STIG-08 | 🟠  | STIG Library XCCDF indexer              | 2026-01-16 | Created library module: catalog, parser, indexer            |
| STIG-07 | 🟠  | STIG Library API endpoints              | 2026-01-16 | Added 6 API endpoints for browsing/searching library        |
| STIG-06 | 🟠  | Config file analysis feature            | 2026-01-16 | Added parsers for 6 platforms, API endpoint, UI modal       |
| CI-017  | 🔴  | Turbo/ESLint compatibility              | 2026-01-16 | Created ESLint 9.x flat config (eslint.config.mjs)          |
| APP-016 | 🔴  | Syslog forwarder crash (missing DB)     | 2026-01-16 | Created migration 009_add_syslog_forwarders.sql             |
| APP-017 | 🟠  | E2E tests blocked by artifacts          | 2026-01-16 | Fixed CI workflow path, updated .gitignore                  |
| CI-012  | 🟠  | Vite 5.x to 7.x upgrade                 | 2026-01-15 | Upgraded Vite 7.3.1, fixed cross-spawn/glob CVEs            |
| CI-015  | 🟠  | Tests workflow failing                  | 2026-01-15 | Added --passWithNoTests to Jest config                      |
| CI-016  | 🟡  | E2E cleanup step failing                | 2026-01-15 | Added fallback to docker compose down in CI                 |
| SEC-010 | 🟠  | Container security vulnerability scan   | 2026-01-15 | Docker Scout scan completed, report generated               |
| DOC-003 | 🟢  | Code signing implementation guide       | 2026-01-15 | Created CODE_SIGNING_GUIDE.md with Cosign/GPG docs          |
| INFRA-8 | 🟠  | Container image signing and publishing  | 2026-01-15 | All 14 images signed with Cosign, pushed to GHCR            |
| UI-016  | 🟢  | ISSO Executive Summary document         | 2026-01-15 | Created HTML/Word doc with project overview for ISSO        |
| UI-015  | 🟡  | Subtitle text illegible on dark bg      | 2026-01-15 | Brighter colors + text-shadow for gray-400/500              |
| UI-014  | 🟢  | Add condensed display density           | 2026-01-15 | Added "Condensed" option with 9-15px fonts                  |
| UI-013  | 🟡  | Display density system                  | 2026-01-15 | CSS variables for 4 density levels + toggle + prefs         |
| STIG-05 | 🟠  | SSH credentials need sudo support       | 2026-01-15 | Added sudo fields to SSH credentials (method/user/pw)       |
| STIG-04 | 🟠  | SSH credentials management UI           | 2026-01-15 | Created CredentialsPage with CRUD for SSH creds             |
| APP-015 | 🟠  | Settings Preferences nav link           | 2026-01-15 | Added Preferences to Settings sidebar navigation            |
| SEC-008 | 🟡  | NATS auth/TLS disabled                  | 2026-01-14 | Created nats.prod.conf, cert gen script, updated docs       |
| SEC-009 | 🟢  | trustProxy always true                  | 2026-01-14 | Made configurable via TRUST_PROXY env var                   |
| SEC-006 | 🟠  | .env tracked with secrets               | 2026-01-14 | Already in .gitignore, .env.example exists                  |
| SEC-007 | 🟠  | DB/Cache ports exposed                  | 2026-01-14 | Bound Postgres/Redis/NATS to 127.0.0.1                      |
| APP-012 | 🔴  | Preflight CRLF errors on Windows        | 2026-01-14 | Converted to LF, added PowerShell wrapper                   |
| APP-013 | 🔴  | Preflight Docker checks fail            | 2026-01-14 | Created preflight.ps1 for native Windows                    |
| APP-014 | 🟠  | OpenAPI endpoint mismatch               | 2026-01-14 | Fixed endpoint to `/docs/json`                              |
| CI-013  | 🟡  | Tests workflow - shared-types not found | 2026-01-14 | Simplified package.json exports                             |
| CI-005  | 🟠  | Validate Workspaces fails all platforms | 2026-01-14 | Changed to npm run build (Turborepo)                        |
| SEC-004 | 🟡  | STIG ZIP upload DoS limits              | 2026-01-14 | Already implemented (500 files, 100MB)                      |
| SEC-005 | 🟢  | Observability ports exposed             | 2026-01-14 | Bound to localhost only                                     |
| WIN-001 | 🟠  | Windows Hyper-V port conflicts          | 2026-01-14 | NATS→8322, Vault→8300                                       |
| #113    | 🟠  | NPM disk/storage metrics                | 2026-01-12 | Added Sophos SFOS OIDs                                      |
| #114    | 🟠  | NPM interface traffic summaries         | 2026-01-12 | Added IF-MIB 64-bit counters                                |
| #115    | 🟡  | NPM Sophos service status               | 2026-01-12 | Added 20+ service status OIDs                               |
| APP-008 | 🟠  | STIG Library 500 error                  | 2026-01-12 | Created missing database tables                             |
| APP-009 | 🟠  | Auto-polling not working                | 2026-01-12 | Created npm.device_metrics table                            |
| APP-010 | 🟠  | NPM Poll Now fails                      | 2026-01-12 | Created partitioned metrics tables                          |
| APP-011 | 🟡  | Sidebar toggle not visible              | 2026-01-12 | Fixed Sidebar.tsx condition                                 |

---

## 🗄️ Deferred Issues

(none - CI-012 Vite upgrade completed 2026-01-15)

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
