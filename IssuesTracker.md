# GridWatch NetEnterprise - Issues Tracker

> Active issues and technical debt tracking

**Version**: 0.2.15
**Last Updated**: 2026-02-13 20:30 UTC
**Stats**: 1 open | 0 deferred | 191 resolved (archived)
**Codex Review**: 2026-02-11 (Dual review: CODEX_REVIEW20260211-1133 + GEMINI_CLI_REVIEW20260211-1146)
**Docker Scout**: 2026-02-12 (3/4 Alpine images patched; Grafana 11.4.0 still vulnerable)
**CI/CD Status**: ✅ ALL WORKFLOWS PASSING
**Security Remediation**: SEC-012 Phase 1 Complete + Phase 1B 3/4 images patched (Grafana pending)
**Production Readiness**: 🟢 ALL LAUNCH BLOCKERS + ALL TIER 1 RESOLVED

---

## 🔥 NOW (Active / In Progress)

### SEC-012: Security Vulnerability Remediation (Phase 1B — 3/4 Images Patched)

**Status**: 🟡 In Progress — Grafana pending Alpine base update
**Priority**: 🔴 Critical - Security Issue
**Detected**: 2026-02-04 | **Phase 1 Complete**: 2026-02-04

**Phase 1B Image Status** (scanned 2026-02-12):

- ✅ `postgres:15-alpine` — libssl3-3.5.5-r0 (PATCHED)
- ✅ `redis:7-alpine` — libssl3-3.3.6-r0 (PATCHED)
- ✅ `nats:2.10-alpine` — libssl3-3.5.5-r0 (PATCHED)
- ⚠️ `grafana/grafana:11.4.0` — libssl3-3.3.2-r0 (needs 3.3.6-r0)

**Next Steps**: Monitor Grafana 11.5.x+ for Alpine base update. Deploy within 24h when available.
**Docs**: `docs/security/POST_REMEDIATION_REPORT.md`, `docs/security/PHASE_1B_ACTION_PLAN.md`

---

### SYSLOG-001: Syslog Events Not Received from Arista

**Status**: 🟡 Open — Arista configuration required (user action)
**Priority**: 🟠 High - Feature Not Working
**Detected**: 2026-02-02 | **Updated**: 2026-02-12

Arista 720XP needs `logging host 192.168.1.137` configured. Collector is healthy, pipeline verified via loopback. **Root cause (DB crash on startup) addressed**: `shared_python.DatabasePool` now has retry/backoff — syslog service migration pending. See full investigation in [archive](archive/sprint-history/IssuesTracker.archive.md).

---

## 📋 DEFERRED

(none)

---

## ⏭️ NEXT (Queued / Ready)

- [ ] Migrate NPM + STIG services to `shared_python` (follow IPAM pilot pattern)
- [ ] Add unit tests for `services/shared-python/` modules
- [ ] Update Docker build contexts for shared_python path dependency
- [ ] Seed E2E users in `shared.users` table
- [ ] Validate VictoriaMetrics write endpoint (preflight warning)
- [ ] Verify NATS stream endpoint JSON format for monitoring
- [ ] Phase 9 — Documentation site deployment (optional)

---

## ⛔ BLOCKED (Waiting / External Dependency)

- [ ] SEC-011 — zlib CVE-2026-22184 (Critical) - No upstream fix available, monitoring Alpine/Node releases

---

## 📁 Archive Reference

For historical resolved issues, see: **[archive/sprint-history/IssuesTracker.archive.md](archive/sprint-history/IssuesTracker.archive.md)**

| Archive Period            | Issues |
| ------------------------- | ------ |
| 2026-01-06 to 2026-02-12 | 191    |

---

## Issue Priority Legend

- 🔴 **Critical** — Blocking issues preventing core functionality
- 🟠 **High** — Important issues to resolve soon
- 🟡 **Medium** — Normal development priority
- 🟢 **Low** — Nice-to-have improvements

---

## 📋 Archiving Instructions

**When to Archive**: When resolved issues exceed 50 entries, at end of each major release (v0.x.0), or quarterly.

**How to Archive**: Append to `archive/sprint-history/IssuesTracker.archive.md`, update End Date and Total Issues, move resolved issues, keep only last 30 days in this file.

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
