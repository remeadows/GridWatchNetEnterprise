# NetNynja Enterprise - Security Scanning

This directory contains security scanning configuration and scripts for container vulnerability scanning, dependency auditing, and infrastructure-as-code analysis.

## Overview

NetNynja Enterprise uses [Trivy](https://trivy.dev/) for comprehensive security scanning:

- **Container Image Scanning** - Detect vulnerabilities in Docker images
- **Dependency Scanning** - Audit npm and Python dependencies
- **Infrastructure as Code** - Check Dockerfiles, docker-compose, and configs
- **Secret Detection** - Find accidentally committed secrets
- **SBOM Generation** - Create Software Bill of Materials

## Quick Start

### Install Trivy (Optional)

```bash
# macOS
brew install trivy

# Linux
curl -sfL https://raw.githubusercontent.com/aquasecurity/trivy/main/contrib/install.sh | sh -s -- -b /usr/local/bin

# Or use Docker (no installation needed)
docker pull aquasec/trivy:latest
```

### Run Local Scan

```bash
# Scan all running NetNynja containers
./scan-containers.sh --all

# Scan a specific image
./scan-containers.sh --image netnynja/gateway:latest

# Scan with medium severity included
./scan-containers.sh --all --severity CRITICAL,HIGH,MEDIUM
```

## Scan Types

### Container Image Scan

Scans container images for known vulnerabilities in:

- OS packages (Alpine, Debian, RHEL, etc.)
- Language-specific packages (npm, pip, etc.)
- Application binaries

```bash
# Using Trivy directly
trivy image postgres:15-alpine

# Using our script
./scan-containers.sh --image postgres:15-alpine
```

### Dependency Scan

Scans project dependencies for vulnerabilities:

```bash
# Node.js dependencies
npm audit --audit-level=high

# Python dependencies
pip-audit
safety check -r requirements.txt

# Using Trivy for both
trivy fs --scanners vuln .
```

### Infrastructure as Code Scan

Checks configuration files for misconfigurations:

```bash
trivy config .
```

Supported file types:

- Dockerfiles
- docker-compose.yml
- Kubernetes manifests
- Terraform files
- CloudFormation templates

### Secret Detection

Scans for accidentally committed secrets:

```bash
trivy fs --scanners secret .
```

## CI/CD Integration

The `.github/workflows/security-scan.yml` workflow runs automatically:

- On push to `main` and `develop`
- On pull requests to `main`
- Daily at 2 AM UTC (scheduled)
- Manually via workflow dispatch

### Workflow Jobs

| Job               | Description                        |
| ----------------- | ---------------------------------- |
| `container-scan`  | Scans built container images       |
| `dependency-scan` | Runs npm audit and Python safety   |
| `iac-scan`        | Scans infrastructure configs       |
| `secret-scan`     | Detects committed secrets          |
| `codeql`          | GitHub CodeQL analysis             |
| `sbom`            | Generates SBOM in CycloneDX format |

## Configuration

### trivy.yaml

Main Trivy configuration file:

```yaml
severity:
  - CRITICAL
  - HIGH
exit-code: 1
ignore-unfixed: true
```

### .trivyignore

Ignore specific CVEs with explanations:

```
# Dev dependency only, not in production
CVE-2023-12345 exp:2024-06-01

# Not exploitable in our configuration
CVE-2023-67890
```

## Severity Levels

| Level    | Description                                      | Action                     |
| -------- | ------------------------------------------------ | -------------------------- |
| CRITICAL | Actively exploited, remote code execution        | Block deployment           |
| HIGH     | Significant security impact                      | Block deployment           |
| MEDIUM   | Moderate impact, may require specific conditions | Review, plan fix           |
| LOW      | Minor impact, difficult to exploit               | Track, fix when convenient |

## Handling Vulnerabilities

### 1. Assess the Vulnerability

```bash
# Get detailed vulnerability info
trivy image --format json postgres:15-alpine | jq '.Results[].Vulnerabilities[] | select(.VulnerabilityID == "CVE-XXXX-YYYY")'
```

### 2. Determine Applicability

- Is the vulnerable component used in our deployment?
- Is the attack vector applicable to our configuration?
- Are there mitigating controls in place?

### 3. Remediation Options

| Option                 | When to Use                                                 |
| ---------------------- | ----------------------------------------------------------- |
| **Upgrade**            | Patch available, compatible with our stack                  |
| **Workaround**         | No patch, but configuration change mitigates                |
| **Accept Risk**        | Low impact, mitigating controls, tracked in security review |
| **Ignore (temporary)** | Waiting for upstream fix, with expiration date              |

### 4. Document Decision

For accepted risks or ignores, add to `.trivyignore`:

```
CVE-2023-XXXXX exp:2024-03-01  # Accepted: mitigated by WAF, review SEC-042
```

## Reports

Reports are generated in `./security-reports/`:

```
security-reports/
├── postgres_15_alpine_20260106_120000.txt
├── redis_7_alpine_20260106_120000.txt
├── iac_scan_20260106_120000.txt
└── ...
```

### Report Formats

| Format      | Use Case                          |
| ----------- | --------------------------------- |
| `table`     | Human readable, terminal output   |
| `json`      | Machine processing, detailed data |
| `sarif`     | GitHub Security integration       |
| `cyclonedx` | SBOM for compliance               |

## Best Practices

1. **Run scans regularly** - Daily scheduled scans catch new CVEs
2. **Scan before deployment** - Block vulnerable images from production
3. **Keep images updated** - Use specific version tags, update regularly
4. **Minimize base images** - Use Alpine or distroless when possible
5. **Document exceptions** - Always explain why CVEs are ignored
6. **Set expiration dates** - Don't let ignores become permanent
7. **Review SBOM** - Know your supply chain

## Troubleshooting

### Scan is slow

```bash
# Use cached database
trivy image --skip-db-update postgres:15-alpine

# Scan specific layers only
trivy image --skip-files "**/test/**" postgres:15-alpine
```

### False positives

Add to `.trivyignore` with explanation:

```
CVE-XXXX-YYYY  # False positive: component not used in our deployment
```

### Missing vulnerabilities

```bash
# Update vulnerability database
trivy image --download-db-only

# Clear cache and rescan
rm -rf ~/.cache/trivy
trivy image postgres:15-alpine
```

## Resources

- [Trivy Documentation](https://aquasecurity.github.io/trivy/)
- [GitHub Security Advisories](https://github.com/advisories)
- [NVD - National Vulnerability Database](https://nvd.nist.gov/)
- [OWASP Container Security](https://cheatsheetseries.owasp.org/cheatsheets/Docker_Security_Cheat_Sheet.html)
