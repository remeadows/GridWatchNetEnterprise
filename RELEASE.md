# RELEASE.md - Release and Code Signing Workflow

> Instructions for creating signed releases of GridWatch NetEnterprise

**Last Updated**: 2026-01-15  
**Version**: 1.0

---

## When to Create a Release

Create a signed release when:

- ✅ Deploying to production environment
- ✅ Publishing a version milestone (v1.0.0, v2.0.0)
- ✅ Security patches or critical updates
- ✅ Delivering to external customers or stakeholders
- ✅ DoD/compliance-required deployments

**DO NOT** create releases for:

- ❌ Daily development commits
- ❌ Feature branch work
- ❌ Internal testing/staging
- ❌ Documentation-only updates

---

## Prerequisites

Ensure you have the following installed and configured:

### Required Tools

| Tool   | Version | Installation                  | Purpose                   |
| ------ | ------- | ----------------------------- | ------------------------- |
| Cosign | 2.0+    | `brew install cosign` (macOS) | Container image signing   |
| GPG    | 2.4+    | `brew install gnupg` (macOS)  | Commit & artifact signing |
| Docker | 24+     | `brew install docker` (macOS) | Build container images    |
| gh     | 2.40+   | `brew install gh` (macOS)     | GitHub CLI (optional)     |

### Configuration

**1. Cosign Keys**

```bash
# Keys should already exist in repository root
ls -la cosign.key cosign.pub

# If missing, generate new keys:
cosign generate-key-pair
# Press Enter twice for passwordless keys
```

**2. GPG Key**

```bash
# Check if GPG key is configured
git config --get user.signingkey

# If not configured, generate and configure:
# See docs/CODE_SIGNING_GUIDE.md section "Git Commit Signing"
```

**3. GitHub Container Registry Access**

```bash
# Set GitHub token for GHCR access
export GITHUB_TOKEN="<your-token>"  # From GitHub Settings > Tokens

# Login to GHCR
echo "$GITHUB_TOKEN" | docker login ghcr.io -u <your-username> --password-stdin
```

---

## Release Workflow

### Step 1: Pre-Release Validation

**Run all quality gates:**

```bash
# 1. Ensure all tests pass
npm run test
poetry run pytest

# 2. Lint and type check
npm run lint
npm run typecheck

# 3. Build containers locally
docker compose build

# 4. Smoke test
docker compose --profile ipam --profile npm --profile stig up -d
# Test critical functionality
docker compose down
```

**Verify clean repository state:**

```bash
# No uncommitted changes
git status

# On main branch
git branch --show-current  # Should show 'main'

# Up to date with remote
git pull origin main
```

### Step 2: Version Bump

**Update version in key files:**

```bash
# 1. package.json (root and all apps/packages)
# 2. pyproject.toml (all Python services)
# 3. PROJECT_STATUS.md (version header)
# 4. docs/GridWatch_Executive_Summary_ISSO.html (version references)

# Example: v0.2.4 → v0.2.5
```

**Commit version bump:**

```bash
git add package.json pyproject.toml PROJECT_STATUS.md docs/GridWatch_Executive_Summary_ISSO.html
git commit -m "chore: bump version to v0.2.5"
git push origin main
```

### Step 3: Build and Tag Containers

**Build all containers with version tag:**

```bash
VERSION="v0.2.5"
REGISTRY="ghcr.io/<your-username>"

# Build and tag all images
docker compose build

# Tag with version
IMAGES=(
  "gridwatch-net-enterprise-gateway"
  "gridwatch-net-enterprise-web-ui"
  "gridwatch-net-enterprise-ipam-service"
  "gridwatch-net-enterprise-ipam-scanner"
  "gridwatch-net-enterprise-npm-service"
  "gridwatch-net-enterprise-npm-collector"
  "gridwatch-net-enterprise-npm-alerts"
  "gridwatch-net-enterprise-stig-service"
  "gridwatch-net-enterprise-stig-collector"
  "gridwatch-net-enterprise-stig-reports"
  "gridwatch-net-enterprise-auth-service"
  "gridwatch-net-enterprise-syslog-service"
  "gridwatch-net-enterprise-syslog-collector"
  "gridwatch-net-enterprise-syslog-forwarder"
)

for IMAGE in "${IMAGES[@]}"; do
  docker tag ${IMAGE}:latest ${REGISTRY}/${IMAGE}:${VERSION}
  docker tag ${IMAGE}:latest ${REGISTRY}/${IMAGE}:latest
done
```

### Step 4: Push Containers to Registry

**Push all images:**

```bash
for IMAGE in "${IMAGES[@]}"; do
  echo "Pushing ${IMAGE}:${VERSION}..."
  docker push ${REGISTRY}/${IMAGE}:${VERSION}
  docker push ${REGISTRY}/${IMAGE}:latest
done
```

### Step 5: Sign Container Images

**Sign all pushed images with Cosign:**

```bash
# Sign version tags
for IMAGE in "${IMAGES[@]}"; do
  echo "Signing ${REGISTRY}/${IMAGE}:${VERSION}..."
  cosign sign --yes --key cosign.key ${REGISTRY}/${IMAGE}:${VERSION}
done

# Sign latest tags
for IMAGE in "${IMAGES[@]}"; do
  echo "Signing ${REGISTRY}/${IMAGE}:latest..."
  cosign sign --yes --key cosign.key ${REGISTRY}/${IMAGE}:latest
done

echo "✅ All images signed successfully!"
```

**Verify signatures:**

```bash
# Verify a few key images
cosign verify --key cosign.pub ${REGISTRY}/gridwatch-net-enterprise-gateway:${VERSION}
cosign verify --key cosign.pub ${REGISTRY}/gridwatch-net-enterprise-web-ui:${VERSION}
cosign verify --key cosign.pub ${REGISTRY}/gridwatch-net-enterprise-stig-service:${VERSION}
```

### Step 6: Create Git Tag

**Tag the release commit:**

```bash
VERSION="v0.2.5"

# Create signed tag
git tag -s ${VERSION} -m "Release ${VERSION}

GridWatch NetEnterprise ${VERSION}

Key Changes:
- [List major changes here]
- [Security updates]
- [New features]

All container images have been built, signed with Cosign, and published to:
ghcr.io/<your-username>/gridwatch-net-enterprise-*:${VERSION}

Verification:
cosign verify --key cosign.pub ghcr.io/<your-username>/gridwatch-net-enterprise-gateway:${VERSION}

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"

# Push tag to GitHub
git push origin ${VERSION}
```

### Step 7: Create GitHub Release

**Option A: Using GitHub CLI**

```bash
VERSION="v0.2.5"

# Create release archive
tar -czf gridwatch-net-enterprise-${VERSION}.tar.gz \
  --exclude='node_modules' \
  --exclude='.git' \
  --exclude='*.log' \
  --exclude='.env' \
  .

# Generate checksums
sha256sum gridwatch-net-enterprise-${VERSION}.tar.gz > gridwatch-net-enterprise-${VERSION}.sha256

# Sign checksum file
gpg --armor --detach-sign gridwatch-net-enterprise-${VERSION}.sha256

# Create GitHub release
gh release create ${VERSION} \
  --title "GridWatch NetEnterprise ${VERSION}" \
  --notes "See PROJECT_STATUS.md for full changelog" \
  gridwatch-net-enterprise-${VERSION}.tar.gz \
  gridwatch-net-enterprise-${VERSION}.sha256 \
  gridwatch-net-enterprise-${VERSION}.sha256.asc
```

**Option B: Manual via GitHub Web UI**

1. Go to https://github.com/<your-username>/GridWatchEnterprise/releases/new
2. Select tag: `v0.2.5`
3. Release title: `GridWatch NetEnterprise v0.2.5`
4. Description: Copy from PROJECT_STATUS.md changelog
5. Attach files: `.tar.gz`, `.sha256`, `.sha256.asc`
6. Click "Publish release"

### Step 8: Update Documentation

**Update PROJECT_STATUS.md:**

```markdown
## [0.2.5] - 2026-01-XX

**Release v0.2.5 - [Brief Description]**

CI/CD Status: PASS ✅

Key Changes:

- Feature 1
- Feature 2
- Security improvements

Container Images:
All images signed and published to ghcr.io/<your-username>/ with tag v0.2.5

Verification:
cosign verify --key cosign.pub ghcr.io/<your-username>/gridwatch-net-enterprise-gateway:v0.2.5
```

**Commit documentation updates:**

```bash
git add PROJECT_STATUS.md
git commit -m "docs: update PROJECT_STATUS for v0.2.5 release"
git push origin main
```

---

## Verification Checklist

After completing the release, verify:

- [ ] All 14 container images pushed to GHCR
- [ ] All 14 container images signed with Cosign
- [ ] Signatures verify successfully
- [ ] Git tag created and pushed
- [ ] Git tag is GPG-signed
- [ ] GitHub release published
- [ ] Release artifacts (tar.gz, checksums, signatures) attached
- [ ] PROJECT_STATUS.md updated
- [ ] CI/CD pipeline passed
- [ ] Documentation reflects new version

---

## Quick Reference Scripts

### Complete Release Script

Save as `scripts/release.sh`:

```bash
#!/bin/bash
set -e

if [ -z "$1" ]; then
  echo "Usage: ./scripts/release.sh v0.2.5"
  exit 1
fi

VERSION="$1"
REGISTRY="ghcr.io/remeadows"

echo "🚀 Creating release ${VERSION}"

# Validate prerequisites
if [ ! -f "cosign.key" ]; then
  echo "❌ cosign.key not found"
  exit 1
fi

if [ -z "$GITHUB_TOKEN" ]; then
  echo "❌ GITHUB_TOKEN not set"
  exit 1
fi

# Build containers
echo "📦 Building containers..."
docker compose build

# Tag images
echo "🏷️  Tagging images..."
IMAGES=(
  "gridwatch-net-enterprise-gateway"
  "gridwatch-net-enterprise-web-ui"
  "gridwatch-net-enterprise-ipam-service"
  "gridwatch-net-enterprise-ipam-scanner"
  "gridwatch-net-enterprise-npm-service"
  "gridwatch-net-enterprise-npm-collector"
  "gridwatch-net-enterprise-npm-alerts"
  "gridwatch-net-enterprise-stig-service"
  "gridwatch-net-enterprise-stig-collector"
  "gridwatch-net-enterprise-stig-reports"
  "gridwatch-net-enterprise-auth-service"
  "gridwatch-net-enterprise-syslog-service"
  "gridwatch-net-enterprise-syslog-collector"
  "gridwatch-net-enterprise-syslog-forwarder"
)

for IMAGE in "${IMAGES[@]}"; do
  docker tag ${IMAGE}:latest ${REGISTRY}/${IMAGE}:${VERSION}
done

# Push images
echo "⬆️  Pushing images to registry..."
for IMAGE in "${IMAGES[@]}"; do
  echo "  Pushing ${IMAGE}:${VERSION}..."
  docker push ${REGISTRY}/${IMAGE}:${VERSION}
done

# Sign images
echo "✍️  Signing images with Cosign..."
for IMAGE in "${IMAGES[@]}"; do
  echo "  Signing ${IMAGE}:${VERSION}..."
  cosign sign --yes --key cosign.key ${REGISTRY}/${IMAGE}:${VERSION}
done

# Verify signatures
echo "✅ Verifying signatures..."
cosign verify --key cosign.pub ${REGISTRY}/gridwatch-net-enterprise-gateway:${VERSION}

# Create git tag
echo "🏷️  Creating git tag..."
git tag -s ${VERSION} -m "Release ${VERSION}"
git push origin ${VERSION}

echo "✅ Release ${VERSION} complete!"
echo ""
echo "Next steps:"
echo "1. Create GitHub release at: https://github.com/remeadows/GridWatchEnterprise/releases/new"
echo "2. Update PROJECT_STATUS.md with release notes"
echo "3. Verify images: cosign verify --key cosign.pub ${REGISTRY}/gridwatch-net-enterprise-gateway:${VERSION}"
```

Make executable:

```bash
chmod +x scripts/release.sh
```

---

## Troubleshooting

### Cosign "password required" error

```bash
# If cosign.key has a password but you want passwordless:
rm cosign.key cosign.pub
cosign generate-key-pair
# Press Enter twice for empty password
```

### Docker push "denied" error

```bash
# Re-login to GHCR
echo "$GITHUB_TOKEN" | docker login ghcr.io -u <username> --password-stdin

# Verify token has packages:write permission
```

### GPG signing "inappropriate ioctl" error

```bash
export GPG_TTY=$(tty)
git tag -s v0.2.5 -m "Release v0.2.5"
```

---

## CI/CD Integration (Future)

**For automated releases**, create `.github/workflows/release.yml`:

```yaml
name: Release

on:
  push:
    tags:
      - "v*"

jobs:
  release:
    runs-on: ubuntu-latest
    permissions:
      contents: write
      packages: write
      id-token: write

    steps:
      - uses: actions/checkout@v4

      - name: Install Cosign
        uses: sigstore/cosign-installer@v3

      - name: Login to GHCR
        uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Build, Push, and Sign
        run: |
          ./scripts/release.sh ${{ github.ref_name }}
```

---

## Related Documentation

- [CODE_SIGNING_GUIDE.md](docs/CODE_SIGNING_GUIDE.md) - Comprehensive signing guide
- [CODE_SIGNING_LOCAL.md](docs/CODE_SIGNING_LOCAL.md) - Local signing troubleshooting
- [GITHUB_TOKEN_SETUP.md](docs/GITHUB_TOKEN_SETUP.md) - Token configuration
- [PROJECT_STATUS.md](PROJECT_STATUS.md) - Version history and changelogs

---

**Document Owner**: DevOps Team  
**Review Frequency**: Quarterly  
**Last Review**: 2026-01-15
