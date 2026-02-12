# NetNynja Enterprise - Issues Archive

> Historical resolved issues archive

---

## Archive Coverage

| Field                     | Value      |
| ------------------------- | ---------- |
| **Start Date**            | 2026-01-06 |
| **End Date**              | 2026-01-14 |
| **Total Issues Archived** | 123        |
| **Archive Created**       | 2026-01-14 |

---

## Resolved Issues

| ID      | P   | Title                                    | Resolved   | Resolution                                                     |
| ------- | --- | ---------------------------------------- | ---------- | -------------------------------------------------------------- |
| #001    | 🟡  | Validate npm workspaces on all platforms | 2026-01-06 | Created validate-workspaces.sh with cross-platform CI workflow |
| #002    | 🟡  | Test Poetry install on Windows           | 2026-01-06 | Created validate-poetry.ps1 and validate-poetry.sh with CI     |
| #003    | 🟢  | Add pre-commit hooks                     | 2026-01-06 | Created Husky hooks and .pre-commit-config.yaml                |
| #010    | 🟠  | Configure production Vault unsealing     | 2026-01-06 | Created infrastructure/vault/ with policies and scripts        |
| #011    | 🟡  | Add PostgreSQL backup scripts            | 2026-01-06 | Created backup.sh and restore.sh with README                   |
| #012    | 🟡  | Configure log rotation for Loki          | 2026-01-06 | Enhanced loki.yml with stream-specific retention               |
| #020    | 🔴  | Generate production JWT RSA keys         | 2026-01-06 | Created generate-jwt-keys.sh for 4096-bit RSA keys             |
| #021    | 🟠  | Implement rate limiting in gateway       | 2026-01-06 | Enhanced rate-limit.ts with tiered limits                      |
| #022    | 🟠  | Add CORS configuration                   | 2026-01-06 | Added CORS config options to gateway                           |
| #023    | 🟡  | Set up container vulnerability scanning  | 2026-01-06 | Created security-scan.yml workflow with Trivy, CodeQL          |
| #030    | 🟡  | Add comprehensive test coverage          | 2026-01-06 | Created Jest tests (67 tests passing)                          |
| #031    | 🟢  | Document API with OpenAPI spec           | 2026-01-06 | Enhanced swagger.ts with OpenAPI 3.1.0                         |
| #032    | 🟢  | Add performance benchmarks               | 2026-01-06 | Created autocannon benchmark suite                             |
| #040    | 🟡  | Frontend tests fail - web-ui port        | 2026-01-06 | Fixed BASE_URL to port 3000                                    |
| #041    | 🟠  | Logout endpoint returns 400              | 2026-01-06 | Fixed auth.ts logout route                                     |
| #042    | 🟠  | Operator role cannot delete networks     | 2026-01-06 | Updated RBAC to allow operator                                 |
| #043    | 🟡  | OpenAPI documentation at /docs           | 2026-01-06 | Already working                                                |
| #044    | 🟡  | Grafana dashboards not provisioned       | 2026-01-06 | Added dashboards volume mount                                  |
| #045    | 🟡  | VictoriaMetrics missing metrics          | 2026-01-06 | Created metrics.ts plugin                                      |
| #050    | 🟡  | Port conflict: Grafana vs Vite           | 2026-01-07 | Changed Grafana to port 3002                                   |
| #051    | 🟡  | Port conflict: Auth vs Grafana           | 2026-01-07 | Changed auth service to port 3006                              |
| #052    | 🟢  | Windows: Docker not in PATH              | 2026-01-08 | Documented workaround                                          |
| #053    | 🟡  | Windows: Docker credential helper        | 2026-01-08 | Documented fix for config.json                                 |
| #054    | 🟢  | Windows: .env requires passwords         | 2026-01-08 | Documented setup steps                                         |
| #060    | 🟡  | Cancel button not visible in modal       | 2026-01-07 | Fixed Button outline variant colors                            |
| #061    | 🟠  | Network Active status hardcoded          | 2026-01-07 | Added isActive field                                           |
| #062    | 🟠  | Missing network scan feature             | 2026-01-07 | Feature already existed                                        |
| #063    | 🟡  | Missing site designation field           | 2026-01-07 | Added site column                                              |
| #064    | 🟠  | No user management UI                    | 2026-01-07 | Created complete user management                               |
| #070    | 🟠  | Add SNMPv3 credentials management        | 2026-01-07 | Created FIPS-compliant SNMPv3 system                           |
| #071    | 🔴  | SNMPv3 Security Level not displayed      | 2026-01-08 | Created missing database table                                 |
| #072    | 🔴  | SNMPv3 Auth Protocol not displayed       | 2026-01-08 | Fixed via #071                                                 |
| #073    | 🔴  | SNMPv3 Privacy Protocol not displayed    | 2026-01-08 | Fixed via #071                                                 |
| #074    | 🔴  | SNMPv3 Request failed 500                | 2026-01-08 | Created table with full schema                                 |
| #075    | 🔴  | SNMPv3 Cannot create credential          | 2026-01-08 | Fixed via #074                                                 |
| #076    | 🟠  | Need network discovery                   | 2026-01-08 | Created complete NPM discovery feature                         |
| #077    | 🟠  | Add IPAM devices to NPM                  | 2026-01-08 | Created IPAM-to-NPM integration                                |
| #078    | 🟡  | Export NPM Status/Health to PDF          | 2026-01-08 | Created PDF/CSV export with pdfmake                            |
| #079    | 🟠  | SNMPv3 devices show metrics              | 2026-01-08 | Created complete device metrics system                         |
| #080    | 🟡  | Need ability to group devices            | 2026-01-08 | Added device groups table                                      |
| #081    | 🟠  | Monitor 3000 devices                     | 2026-01-08 | Scaled NPM with optimized queries                              |
| #082    | 🟠  | Disable users (not self/admin)           | 2026-01-08 | Added validation in users.ts                                   |
| #083    | 🟠  | Admin reset passwords                    | 2026-01-08 | Already implemented                                            |
| #084    | 🟠  | Add and scan networks                    | 2026-01-08 | Enhanced IPAM scanning                                         |
| #085    | 🟡  | Group discovered hosts by site           | 2026-01-08 | Created site grouping for NPM                                  |
| #086    | 🟠  | Rescan networks                          | 2026-01-08 | Implemented via #084                                           |
| #087    | 🟡  | Fingerprint discovered hosts             | 2026-01-08 | Added OS/vendor detection                                      |
| #088    | 🟠  | Discovery via PING and NMAP              | 2026-01-08 | Implemented via #084                                           |
| #089    | 🟡  | Delete scans                             | 2026-01-08 | Created scan deletion feature                                  |
| #090    | 🟡  | Modify scan attributes                   | 2026-01-08 | Added name/notes fields                                        |
| #091    | 🟡  | Export scan reports                      | 2026-01-08 | Created PDF/CSV export                                         |
| #092    | 🔴  | STIG Platform/Connection not visible     | 2026-01-08 | Fixed Select component colors                                  |
| #093    | 🟠  | STIG library for .zip files              | 2026-01-08 | Created STIG Library feature                                   |
| #094    | 🟠  | Missing platforms                        | 2026-01-08 | Added 6 new platforms (16 total)                               |
| #095    | 🟠  | Assets must be editable                  | 2026-01-08 | Added Edit Asset modal                                         |
| #096    | 🟠  | Import .ckl, .cklb, .xml                 | 2026-01-08 | Created checklist import                                       |
| #097    | 🟠  | Add Syslog module                        | 2026-01-08 | Created complete Syslog module                                 |
| #098    | 🟠  | Syslog UDP 514 listener                  | 2026-01-08 | Created Python listener service                                |
| #099    | 🟠  | Syslog 10GB buffer                       | 2026-01-08 | Implemented circular buffer                                    |
| #100    | 🟠  | Syslog forwarder                         | 2026-01-08 | Created forwarder.py                                           |
| #101    | 🔴  | IPAM scans stuck pending (Windows)       | 2026-01-08 | Fixed async execution with setImmediate                        |
| #102    | 🟠  | NPM Poll Now button                      | 2026-01-09 | Created complete Poll Now functionality                        |
| #103    | 🔴  | NPM background polling                   | 2026-01-09 | Created BackgroundPoller plugin                                |
| #104    | 🔴  | NPM Poll Now PostgreSQL error            | 2026-01-10 | Created missing tables, fixed casts                            |
| #105    | 🟠  | Intuitive SNMPv3 enablement              | 2026-01-10 | Created Device Settings modal                                  |
| #106    | 🟠  | IPAM multi-select scan types             | 2026-01-10 | Changed to checkboxes                                          |
| #107    | 🟠  | IPAM fingerprinting not working          | 2026-01-10 | Enhanced nmap XML parsing                                      |
| #108    | 🟡  | IPAM pagination controls                 | 2026-01-10 | Added page size selector                                       |
| #109    | 🟡  | Delete scans from Networks Page          | 2026-01-10 | Added scan management                                          |
| #110    | 🔴  | View Scans API fails                     | 2026-01-10 | Fixed SQL query                                                |
| #111    | 🔴  | NMAP not installed                       | 2026-01-10 | Updated gateway Dockerfile                                     |
| #112    | 🟡  | MAC addresses not detected               | 2026-01-10 | Added network_mode: host option                                |
| #113    | 🟠  | NPM disk/storage metrics                 | 2026-01-12 | Added Sophos SFOS OIDs                                         |
| #114    | 🟠  | NPM interface traffic summaries          | 2026-01-12 | Added IF-MIB 64-bit counters                                   |
| #115    | 🟡  | NPM Sophos service status                | 2026-01-12 | Added 20+ service status OIDs                                  |
| APP-001 | 🔴  | Gateway not responding /healthz          | 2026-01-10 | Fixed Docker health check                                      |
| APP-002 | 🔴  | Auth service unhealthy                   | 2026-01-10 | Fixed via APP-001                                              |
| APP-003 | 🟡  | Grafana preflight port mismatch          | 2026-01-10 | Fixed preflight.sh port                                        |
| APP-004 | 🟠  | NPM collector crash (structlog)          | 2026-01-10 | Fixed structlog config                                         |
| APP-005 | 🟠  | STIG crash (staticmethod)                | 2026-01-10 | Fixed JetStream subscription                                   |
| APP-006 | 🟡  | IPAM scanner restart loop                | 2026-01-10 | Fixed module import                                            |
| APP-007 | 🟢  | Preflight trace count warning            | 2026-01-10 | Fixed integer parsing                                          |
| APP-008 | 🟠  | STIG Library 500 error                   | 2026-01-12 | Created missing tables                                         |
| APP-009 | 🟠  | Auto-polling not working                 | 2026-01-12 | Fixed via APP-010                                              |
| APP-010 | 🟠  | NPM Poll Now fails                       | 2026-01-12 | Created npm.device_metrics table                               |
| APP-011 | 🟡  | Sidebar toggle not visible               | 2026-01-12 | Fixed Sidebar.tsx condition                                    |
| SR-001  | 🔴  | Default admin seed credentials           | 2026-01-10 | Made JWT_SECRET required                                       |
| SR-002  | 🔴  | Hardcoded JWT secret in STIG             | 2026-01-10 | Removed default value                                          |
| SR-003  | 🟡  | JWT verification disabled                | 2026-01-10 | Enabled aud/iss validation                                     |
| SR-004  | 🔴  | Default encryption key (SNMPv3)          | 2026-01-10 | Fixed via SR-005                                               |
| SR-005  | 🟡  | NPM crypto static salt                   | 2026-01-10 | Rewrote with per-encryption salts                              |
| SR-006  | 🟡  | Unauthenticated /metrics                 | 2026-01-10 | Added IP allowlist                                             |
| SR-007  | 🟡  | Auth tokens in localStorage              | 2026-01-10 | Implemented HttpOnly cookies                                   |
| SR-008  | 🟡  | CORS defaults origin:true                | 2026-01-10 | Changed to explicit allowlist                                  |
| SR-009  | 🟢  | NATS lacks TLS/auth                      | 2026-01-10 | Added TLS and auth support                                     |
| SR-010  | 🟢  | Prometheus label escaping                | 2026-01-10 | Added escape_label_value()                                     |
| SR-011  | 🟢  | npm audit vulnerabilities                | 2026-01-10 | Fixed React Router XSS                                         |
| SR-012  | 🟡  | Prettier fails on Helm                   | 2026-01-10 | Excluded charts/ from Prettier                                 |
| SEC-004 | 🟡  | STIG ZIP upload DoS                      | 2026-01-14 | Already implemented (500 files, 100MB)                         |
| SEC-005 | 🟢  | Observability ports exposed              | 2026-01-14 | Bound to localhost only                                        |
| CI-001  | 🔴  | Build Gateway fails                      | 2026-01-11 | Rewrote Dockerfile                                             |
| CI-002  | 🔴  | Build Web UI fails                       | 2026-01-11 | Fixed shared-types                                             |
| CI-003  | 🔴  | Build Auth Service fails                 | 2026-01-11 | Fixed shared-types                                             |
| CI-004  | 🔴  | Build Syslog fails                       | 2026-01-11 | Created main.py                                                |
| CI-005  | 🟠  | Validate Workspaces fails                | 2026-01-14 | Changed to npm run build                                       |
| CI-006  | 🟠  | Container Scan Docker errors             | 2026-01-11 | Fixed Dockerfile builds                                        |
| CI-007  | 🟢  | CodeQL SARIF upload                      | 2026-01-11 | Repository made public                                         |
| CI-008  | 🔴  | test.yml hashFiles() error               | 2026-01-11 | Fixed with check step                                          |
| CI-009  | 🟠  | CodeQL v3 deprecation                    | 2026-01-11 | Upgraded to v4                                                 |
| CI-010  | 🔴  | Permission errors                        | 2026-01-11 | Added actions: read                                            |
| CI-011  | 🟡  | Gateway DTS generation                   | 2026-01-11 | Changed to --no-dts                                            |
| CI-013  | 🟡  | shared-types module not found            | 2026-01-14 | Simplified package exports                                     |
| WIN-001 | 🟠  | Windows Hyper-V port conflicts           | 2026-01-14 | Changed NATS/Vault ports                                       |

---

## Archive Notes

- This archive contains all resolved issues from project inception through the archive end date
- For issue details including full resolution descriptions, see git history or PROJECT_STATUS.md changelog
- New issues should be tracked in IssuesTracker.md
- Archive when IssuesTracker.md exceeds 200 resolved issues or quarterly, whichever comes first
