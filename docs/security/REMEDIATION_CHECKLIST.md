# GridWatch NetEnterprise - Vulnerability Remediation Checklist

**Report Date:** 2026-02-04  
**Priority:** CRITICAL - Immediate Action Required

---

## 🔴 Phase 1: Critical Patches (Complete within 24 hours)

### ✅ Task 1.1: OpenSSL Updates (All Alpine Images)

**Affected Services:** Auth, Gateway, PostgreSQL, Redis, NATS

- [ ] Pull latest Alpine base images

  ```bash
  docker pull alpine:3.23
  docker pull node:20-alpine
  docker pull postgres:16-alpine
  docker pull redis:7-alpine
  docker pull nats:2.10-alpine
  ```

- [ ] Rebuild custom GridWatch services

  ```bash
  cd /path/to/GridWatchEnterprise
  docker-compose build --no-cache auth-service gateway
  ```

- [ ] Test rebuilt images locally

  ```bash
  docker-compose up -d auth-service gateway
  # Run smoke tests
  curl http://localhost:3006/healthz  # auth-service
  curl http://localhost:3000/healthz  # gateway
  ```

- [ ] Verify OpenSSL version in containers

  ```bash
  docker exec gridwatch-auth-service apk info openssl
  # Should show: openssl-3.5.5-r0 or higher
  ```

- [ ] Deploy to staging

  ```bash
  docker-compose -f docker-compose.staging.yml up -d
  ```

- [ ] Run integration tests on staging

- [ ] Deploy to production

  ```bash
  docker-compose -f docker-compose.prod.yml up -d
  ```

- [ ] Verify production health
  ```bash
  docker ps --filter "status=running" --filter "health=healthy"
  ```

**Verification:**

```bash
trivy image --severity CRITICAL gridwatch-net-enterprise-auth-service:latest
# Should show: Total: 0 (CRITICAL: 0) for Alpine packages
```

---

### ✅ Task 1.2: Update Grafana

**Current:** 10.2.0 → **Target:** 11.4.0+

- [ ] Backup Grafana data

  ```bash
  docker exec gridwatch-grafana tar czf /tmp/grafana-backup.tar.gz /var/lib/grafana
  docker cp gridwatch-grafana:/tmp/grafana-backup.tar.gz ./backups/
  ```

- [ ] Update docker-compose.yml

  ```yaml
  grafana:
    image: grafana/grafana:11.4.0
    # ... rest of config
  ```

- [ ] Pull new image

  ```bash
  docker pull grafana/grafana:11.4.0
  ```

- [ ] Stop old container

  ```bash
  docker-compose stop grafana
  ```

- [ ] Start new container

  ```bash
  docker-compose up -d grafana
  ```

- [ ] Verify Grafana functionality
  - [ ] Login accessible
  - [ ] Dashboards load correctly
  - [ ] Data sources connected
  - [ ] Alerts functional

- [ ] Scan new image
  ```bash
  trivy image --severity CRITICAL grafana/grafana:11.4.0
  ```

---

### ✅ Task 1.3: Update HashiCorp Vault

**Current:** 1.15 → **Target:** 1.18+

⚠️ **WARNING:** Vault upgrades require careful planning. Coordinate with operations team.

- [ ] Review Vault upgrade guide: https://developer.hashicorp.com/vault/docs/upgrading

- [ ] Backup Vault data

  ```bash
  # Snapshot Vault storage backend
  vault operator raft snapshot save vault-backup-$(date +%Y%m%d).snap
  ```

- [ ] Update docker-compose.yml

  ```yaml
  vault:
    image: hashicorp/vault:1.18
    # ... rest of config
  ```

- [ ] In maintenance window:
  - [ ] Set Vault to standby mode
  - [ ] Pull new image: `docker pull hashicorp/vault:1.18`
  - [ ] Stop container: `docker-compose stop vault`
  - [ ] Start new container: `docker-compose up -d vault`

- [ ] Unseal Vault

  ```bash
  vault operator unseal <key1>
  vault operator unseal <key2>
  vault operator unseal <key3>
  ```

- [ ] Verify Vault status

  ```bash
  vault status
  vault secrets list
  vault auth list
  ```

- [ ] Test secret retrieval

  ```bash
  vault kv get secret/gridwatch/test
  ```

- [ ] Monitor application logs for Vault connection issues

**Rollback Plan:**
If issues occur, revert to backup:

```bash
docker-compose stop vault
# Restore old image tag in docker-compose.yml
docker-compose up -d vault
vault operator unseal (x3)
```

---

## 🟠 Phase 2: Node.js Dependencies (Complete within 3 days)

### ✅ Task 2.1: Update Gateway Dependencies

- [ ] Navigate to gateway directory

  ```bash
  cd services/gateway
  ```

- [ ] Update package.json

  ```json
  {
    "dependencies": {
      "cross-spawn": "^7.0.5",
      "glob": "^11.1.0",
      "tar": "^7.5.7"
    }
  }
  ```

- [ ] Install updates

  ```bash
  npm update cross-spawn glob tar
  npm audit fix
  npm audit
  ```

- [ ] Run tests

  ```bash
  npm test
  ```

- [ ] Build Docker image

  ```bash
  docker build -t gridwatch-net-enterprise-gateway:patched .
  ```

- [ ] Scan new image

  ```bash
  trivy image --severity HIGH,CRITICAL gridwatch-net-enterprise-gateway:patched
  ```

- [ ] Deploy to staging and test

- [ ] Deploy to production

---

### ✅ Task 2.2: Update Auth Service Dependencies

- [ ] Navigate to auth-service directory

  ```bash
  cd services/auth-service
  ```

- [ ] Update package.json (same as gateway)

- [ ] Install updates

  ```bash
  npm update cross-spawn glob tar
  npm audit fix
  ```

- [ ] Run tests

  ```bash
  npm test
  ```

- [ ] Rebuild and test locally

- [ ] Deploy to staging

- [ ] Deploy to production

---

### ✅ Task 2.3: Evaluate Fastify v4 → v5 Upgrade

**CVE:** CVE-2026-25223 (Content-Type header validation bypass)

⚠️ **Breaking Changes:** Fastify v5 introduces breaking changes

- [ ] Review Fastify v5 migration guide
  - https://fastify.dev/docs/latest/Guides/Migration-Guide-V5/

- [ ] Create feature branch for testing

  ```bash
  git checkout -b upgrade/fastify-v5
  ```

- [ ] Update dependencies

  ```bash
  npm install fastify@^5.7.2
  ```

- [ ] Update code for breaking changes:
  - [ ] Check plugin registration syntax
  - [ ] Review schema validation changes
  - [ ] Update type definitions

- [ ] Run full test suite

  ```bash
  npm test
  npm run test:integration
  ```

- [ ] Performance testing
  - [ ] Load test with similar traffic patterns
  - [ ] Compare response times vs v4

- [ ] If tests pass: merge and deploy
- [ ] If issues found: document and schedule for later sprint

**Alternative (if upgrade blocked):**

- Implement request validation middleware to sanitize Content-Type headers
- Add to backlog for Q2 2026

---

## 🟡 Phase 3: IPAM Service Hardening (Complete within 1 week)

### ✅ Task 3.1: Update Debian Base Image

- [ ] Update Dockerfile

  ```dockerfile
  FROM python:3.13-slim-bookworm

  RUN apt-get update && \
      apt-get upgrade -y && \
      apt-get install -y --no-install-recommends \
        gcc \
        libpq-dev \
      && rm -rf /var/lib/apt/lists/*
  ```

- [ ] Rebuild image

  ```bash
  docker build -t gridwatch-net-enterprise-ipam-service:patched .
  ```

- [ ] Scan updated image

  ```bash
  trivy image --severity HIGH,CRITICAL gridwatch-net-enterprise-ipam-service:patched
  ```

- [ ] Compare vulnerability count (should drop significantly)

- [ ] Test functionality
  - [ ] IPAM scan operations
  - [ ] Database connectivity
  - [ ] API endpoints

- [ ] Deploy to staging

- [ ] Monitor for 24 hours

- [ ] Deploy to production

---

### ✅ Task 3.2: SQLite Vulnerability Mitigation

**CVE-2025-7458:** Integer overflow (no fix available yet)

**Mitigation Steps:**

- [ ] Document SQLite usage in IPAM service
  - [ ] Identify all SQLite database files
  - [ ] Document data criticality

- [ ] Implement defensive measures:
  - [ ] Add input validation for size parameters
  - [ ] Implement query timeouts
  - [ ] Add database size limits

- [ ] Monitor SQLite security advisories
  - [ ] Subscribe to: https://www.sqlite.org/prosupport.html
  - [ ] Check weekly for patches

- [ ] Consider alternatives (if critical data):
  - [ ] PostgreSQL for persistent storage
  - [ ] Redis for caching
  - [ ] Document decision in ADR (Architecture Decision Record)

---

## 🔵 Phase 4: Continuous Security (Ongoing)

### ✅ Task 4.1: Implement Automated Scanning

- [ ] Add Trivy to CI/CD pipeline

**GitHub Actions Example:**

```yaml
# .github/workflows/docker-security-scan.yml
name: Docker Security Scan

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Build image
        run: docker build -t ${{ github.repository }}:${{ github.sha }} .

      - name: Run Trivy vulnerability scanner
        uses: aquasecurity/trivy-action@master
        with:
          image-ref: ${{ github.repository }}:${{ github.sha }}
          format: "sarif"
          severity: "CRITICAL,HIGH"
          exit-code: "1" # Fail build on HIGH/CRITICAL

      - name: Upload Trivy results to GitHub Security
        uses: github/codeql-action/upload-sarif@v2
        with:
          sarif_file: "trivy-results.sarif"
```

- [ ] Test pipeline with intentionally vulnerable image

- [ ] Configure Slack/email notifications for scan failures

- [ ] Document process in CONTRIBUTING.md

---

### ✅ Task 4.2: Scheduled Scanning

- [ ] Set up weekly vulnerability scans

**Cron Job / Scheduled Task:**

```bash
#!/bin/bash
# /etc/cron.weekly/docker-vulnerability-scan.sh

REPORT_DATE=$(date +%Y%m%d)
REPORT_DIR="/var/reports/security"

# Scan all running containers
for container in $(docker ps --format "{{.Names}}"); do
  image=$(docker inspect --format='{{.Config.Image}}' $container)
  trivy image --severity HIGH,CRITICAL --format json $image > "$REPORT_DIR/${container}_${REPORT_DATE}.json"
done

# Send summary email
python3 /scripts/generate-security-report.py --dir $REPORT_DIR --date $REPORT_DATE
```

- [ ] Create report directory: `/var/reports/security`

- [ ] Add script to repository: `scripts/docker-vulnerability-scan.sh`

- [ ] Set executable: `chmod +x scripts/docker-vulnerability-scan.sh`

- [ ] Add to cron: `0 2 * * 0 /path/to/docker-vulnerability-scan.sh`

- [ ] Test execution manually

---

### ✅ Task 4.3: Security Monitoring Dashboard

- [ ] Create Grafana dashboard for security metrics

**Metrics to Track:**

- Total vulnerabilities by severity
- Vulnerabilities by service
- Time to remediation
- Compliance status

- [ ] Export dashboard JSON to repository

- [ ] Document access in team wiki

---

### ✅ Task 4.4: Update Documentation

- [ ] Update README.md with security scanning section

- [ ] Create SECURITY.md
  - Vulnerability reporting process
  - Security update policy
  - Supported versions

- [ ] Add to IssuesTracker.md:

  ```markdown
  ## Security Vulnerabilities

  - [ ] Weekly security scan (automated)
  - [ ] Review and triage findings
  - [ ] Apply patches per remediation plan
  ```

- [ ] Update PROJECT_STATUS.md with security posture

---

## Verification Checklist

After completing all phases, verify:

### ✅ Final Verification

- [ ] All CRITICAL vulnerabilities resolved

  ```bash
  for img in $(docker images --format "{{.Repository}}:{{.Tag}}" | grep gridwatch); do
    echo "=== $img ==="
    trivy image --severity CRITICAL --quiet $img | grep "Total:"
  done
  ```

  **Expected:** `Total: 0 (CRITICAL: 0)` for all images

- [ ] HIGH vulnerabilities < 10 per image

  ```bash
  for img in $(docker images --format "{{.Repository}}:{{.Tag}}" | grep gridwatch); do
    echo "=== $img ==="
    trivy image --severity HIGH --quiet $img | grep "Total:"
  done
  ```

- [ ] All services healthy in production

  ```bash
  docker ps --filter "health=healthy" --format "table {{.Names}}\t{{.Status}}"
  ```

- [ ] Integration tests passing

  ```bash
  npm run test:integration
  # or
  pytest tests/integration/
  ```

- [ ] Performance benchmarks within acceptable range
  - [ ] Gateway response time < 200ms (p95)
  - [ ] Auth service response time < 100ms (p95)
  - [ ] IPAM service scan completion < 5min

- [ ] Monitoring alerts configured
  - [ ] Critical vulnerability detection
  - [ ] Failed health checks
  - [ ] Abnormal resource usage

- [ ] Documentation updated
  - [x] VULNERABILITY_SCAN_REPORT.md
  - [x] REMEDIATION_CHECKLIST.md
  - [ ] PROJECT_STATUS.md
  - [ ] SECURITY.md

---

## Rollback Procedures

If any phase causes issues:

### Rollback Template

1. **Identify failing service**

   ```bash
   docker-compose logs <service> --tail 100
   ```

2. **Revert to previous image**

   ```bash
   docker tag <service>:previous <service>:latest
   docker-compose up -d <service>
   ```

3. **Verify service health**

   ```bash
   docker ps --filter name=<service>
   curl http://localhost:<port>/healthz
   ```

4. **Document issue**
   - Add to IssuesTracker.md
   - Create GitHub issue
   - Note in remediation log

5. **Schedule retry**
   - Investigate root cause
   - Plan mitigation
   - Attempt again with fix

---

## Sign-off

### Phase 1 (Critical)

- [ ] Completed by: ********\_******** Date: **\_\_\_**
- [ ] Verified by: ********\_******** Date: **\_\_\_**

### Phase 2 (High)

- [ ] Completed by: ********\_******** Date: **\_\_\_**
- [ ] Verified by: ********\_******** Date: **\_\_\_**

### Phase 3 (IPAM)

- [ ] Completed by: ********\_******** Date: **\_\_\_**
- [ ] Verified by: ********\_******** Date: **\_\_\_**

### Phase 4 (Continuous)

- [ ] Implemented by: ********\_******** Date: **\_\_\_**
- [ ] Verified by: ********\_******** Date: **\_\_\_**

---

## Additional Resources

- **Full Scan Report:** `docs/security/VULNERABILITY_SCAN_REPORT.md`
- **Trivy Documentation:** https://aquasecurity.github.io/trivy/
- **Docker Security Best Practices:** https://docs.docker.com/develop/security-best-practices/
- **OWASP Docker Security:** https://cheatsheetseries.owasp.org/cheatsheets/Docker_Security_Cheat_Sheet.html

---

**Document Version:** 1.0  
**Last Updated:** 2026-02-04  
**Next Review:** After Phase 1 completion
