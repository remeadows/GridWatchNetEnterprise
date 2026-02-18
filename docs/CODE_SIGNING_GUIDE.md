# Code Signing Guide for GridWatch NetEnterprise

> Comprehensive guide to signing containers, commits, and releases

**Version**: 1.0  
**Last Updated**: 2026-01-15  
**Audience**: DevOps, Security Engineers, Release Managers

---

## Table of Contents

1. [Overview](#overview)
2. [Container Image Signing (Cosign)](#container-image-signing-cosign)
3. [Git Commit Signing (GPG)](#git-commit-signing-gpg)
4. [Release Artifact Signing](#release-artifact-signing)
5. [CI/CD Integration](#cicd-integration)
6. [Verification Procedures](#verification-procedures)
7. [DoD/Enterprise Requirements](#dodenterprise-requirements)

---

## Overview

Code signing provides:

- **Integrity**: Proof that code hasn't been tampered with
- **Authenticity**: Verification of code origin
- **Non-repudiation**: Accountability for who signed
- **Compliance**: Meets DoD and enterprise security requirements

### What Needs to Be Signed

| Component         | Tool            | Priority |
| ----------------- | --------------- | -------- |
| Container Images  | Cosign          | **HIGH** |
| Git Commits       | GPG             | **HIGH** |
| Release Artifacts | GPG             | MEDIUM   |
| npm Packages      | npm provenance  | MEDIUM   |
| Python Packages   | sigstore-python | LOW      |

---

## Container Image Signing (Cosign)

**Cosign** is the industry standard for signing container images, part of the Sigstore project.

### Installation

**macOS:**

```bash
brew install cosign
```

**Linux (RHEL/Debian):**

```bash
# Download latest release
COSIGN_VERSION=$(curl -s https://api.github.com/repos/sigstore/cosign/releases/latest | grep tag_name | cut -d '"' -f 4 | cut -c 2-)
curl -LO "https://github.com/sigstore/cosign/releases/download/v${COSIGN_VERSION}/cosign-linux-amd64"
sudo mv cosign-linux-amd64 /usr/local/bin/cosign
sudo chmod +x /usr/local/bin/cosign
```

**Windows:**

```powershell
# Using winget
winget install sigstore.cosign

# Or download from GitHub releases
# https://github.com/sigstore/cosign/releases
```

### Generate Signing Keys

**Option 1: Keyless Signing (Recommended for CI/CD)**

Cosign supports keyless signing using OIDC (OpenID Connect) - no key management required!

```bash
# Sign with keyless mode (uses your GitHub/Google/Microsoft identity)
cosign sign --yes <image>:<tag>

# Verification (anyone can verify)
cosign verify <image>:<tag> \
  --certificate-identity=user@example.com \
  --certificate-oidc-issuer=https://token.actions.githubusercontent.com
```

**Option 2: Key-based Signing (Recommended for Enterprise)**

Generate a key pair for signing:

```bash
# Generate key pair (you'll be prompted for a password)
cosign generate-key-pair

# This creates:
# - cosign.key (private key - KEEP SECRET!)
# - cosign.pub (public key - share this)

# Store private key securely
# Option A: HashiCorp Vault
vault kv put secret/cosign private_key=@cosign.key password=<your-password>

# Option B: GitHub Secrets
gh secret set COSIGN_PRIVATE_KEY < cosign.key
gh secret set COSIGN_PASSWORD
```

### Sign Container Images

**Sign Single Image:**

```bash
# Build image
docker build -t gridwatch-net-enterprise-gateway:v0.2.4 .

# Push to registry
docker push gridwatch-net-enterprise-gateway:v0.2.4

# Sign image (with key)
cosign sign --key cosign.key gridwatch-net-enterprise-gateway:v0.2.4

# Sign image (keyless)
cosign sign --yes gridwatch-net-enterprise-gateway:v0.2.4
```

**Sign All GridWatch Images:**

```bash
#!/bin/bash
# sign-all-images.sh

IMAGES=(
  "gridwatch-net-enterprise-gateway"
  "gridwatch-net-enterprise-web-ui"
  "gridwatch-net-enterprise-ipam-service"
  "gridwatch-net-enterprise-npm-service"
  "gridwatch-net-enterprise-stig-service"
  "gridwatch-net-enterprise-auth-service"
)

VERSION="v0.2.4"

for IMAGE in "${IMAGES[@]}"; do
  echo "Signing $IMAGE:$VERSION"
  cosign sign --key cosign.key $IMAGE:$VERSION
done

echo "All images signed!"
```

### Verify Signed Images

**Verify with Public Key:**

```bash
cosign verify --key cosign.pub gridwatch-net-enterprise-gateway:v0.2.4
```

**Verify Keyless Signature:**

```bash
cosign verify gridwatch-net-enterprise-gateway:v0.2.4 \
  --certificate-identity=russell.meadows@gmail.com \
  --certificate-oidc-issuer=https://token.actions.githubusercontent.com
```

### Add Signature Verification to Deployment

**docker-compose.yml with verification:**

```yaml
services:
  gateway:
    image: gridwatch-net-enterprise-gateway:v0.2.4
    # Verify signature before deployment
    deploy:
      pre_deploy:
        - cosign verify --key cosign.pub gridwatch-net-enterprise-gateway:v0.2.4
```

**Kubernetes with Policy Controller:**

```yaml
# Install Sigstore Policy Controller
kubectl apply -f https://github.com/sigstore/policy-controller/releases/latest/download/policy-controller.yaml

# Create ClusterImagePolicy
apiVersion: policy.sigstore.dev/v1beta1
kind: ClusterImagePolicy
metadata:
  name: gridwatch-image-policy
spec:
  images:
  - glob: "**gridwatch-net-enterprise-**"
  authorities:
  - key:
      data: |
        -----BEGIN PUBLIC KEY-----
        <your-cosign.pub-content>
        -----END PUBLIC KEY-----
```

---

## Git Commit Signing (GPG)

GPG (GNU Privacy Guard) signing proves that commits come from you.

### Generate GPG Key

**Step 1: Generate Key**

```bash
# Generate new GPG key
gpg --full-generate-key

# Select:
# - (1) RSA and RSA
# - 4096 bits
# - 0 = key does not expire (or set expiration)
# - Your name: Russ Meadows
# - Email: russell.meadows@gmail.com
# - Passphrase: (choose a strong one)
```

**Step 2: List and Export Keys**

```bash
# List GPG keys
gpg --list-secret-keys --keyid-format=long

# Output will look like:
# sec   rsa4096/ABC123DEF456 2026-01-15 [SC]
#       1234567890ABCDEF1234567890ABCDEF12345678
# uid           [ultimate] Russ Meadows <russell.meadows@gmail.com>

# The key ID is ABC123DEF456 (after rsa4096/)

# Export public key for GitHub
gpg --armor --export ABC123DEF456
```

**Step 3: Configure Git**

```bash
# Set GPG key for signing
git config --global user.signingkey ABC123DEF456

# Enable commit signing by default
git config --global commit.gpgsign true

# Enable tag signing by default
git config --global tag.gpgsign true

# Set GPG program (macOS may need this)
git config --global gpg.program gpg
```

**Step 4: Add to GitHub**

1. Go to https://github.com/settings/keys
2. Click "New GPG key"
3. Paste your public key (from `gpg --armor --export`)
4. Click "Add GPG key"

### Sign Commits

**Automatic Signing (after configuration):**

```bash
# Commits will be automatically signed
git commit -m "feat: add new feature"

# Verify signature
git log --show-signature
```

**Manual Signing:**

```bash
# Sign specific commit
git commit -S -m "feat: add new feature"

# Sign tag
git tag -s v0.2.4 -m "Release v0.2.4"
```

### Verify Signed Commits

**Local Verification:**

```bash
# Verify last commit
git verify-commit HEAD

# Show signature in log
git log --show-signature -1

# Verify tag
git verify-tag v0.2.4
```

**GitHub Shows Verified Badge:**

- Green "Verified" badge appears on signed commits
- Unverified commits show "Unverified" or no badge

---

## Release Artifact Signing

Sign release archives, binaries, and checksums.

### Sign Release Archives

**Create and Sign Release:**

```bash
#!/bin/bash
# create-signed-release.sh

VERSION="v0.2.4"
RELEASE_NAME="gridwatch-net-enterprise-${VERSION}"

# Create release archive
tar -czf ${RELEASE_NAME}.tar.gz \
  --exclude='node_modules' \
  --exclude='.git' \
  --exclude='*.log' \
  .

# Create checksum
sha256sum ${RELEASE_NAME}.tar.gz > ${RELEASE_NAME}.sha256

# Sign checksum file
gpg --armor --detach-sign ${RELEASE_NAME}.sha256

# This creates:
# - gridwatch-net-enterprise-v0.2.4.tar.gz (archive)
# - gridwatch-net-enterprise-v0.2.4.sha256 (checksum)
# - gridwatch-net-enterprise-v0.2.4.sha256.asc (signature)
```

### Verify Release Artifacts

**Verification Script:**

```bash
#!/bin/bash
# verify-release.sh

VERSION="v0.2.4"
RELEASE_NAME="gridwatch-net-enterprise-${VERSION}"

echo "Verifying ${RELEASE_NAME}..."

# Verify GPG signature
gpg --verify ${RELEASE_NAME}.sha256.asc ${RELEASE_NAME}.sha256
if [ $? -eq 0 ]; then
  echo "✓ GPG signature valid"
else
  echo "✗ GPG signature INVALID"
  exit 1
fi

# Verify checksum
sha256sum -c ${RELEASE_NAME}.sha256
if [ $? -eq 0 ]; then
  echo "✓ Checksum valid"
else
  echo "✗ Checksum INVALID"
  exit 1
fi

echo "✓ Release verified successfully!"
```

---

## CI/CD Integration

### GitHub Actions - Container Signing

**Workflow: `.github/workflows/build-and-sign.yml`**

```yaml
name: Build and Sign Containers

on:
  push:
    tags:
      - "v*"

env:
  REGISTRY: ghcr.io
  IMAGE_NAME: ${{ github.repository }}

jobs:
  build-and-sign:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
      id-token: write # Required for keyless signing

    steps:
      - uses: actions/checkout@v4

      - name: Install Cosign
        uses: sigstore/cosign-installer@v3

      - name: Login to GitHub Container Registry
        uses: docker/login-action@v3
        with:
          registry: ${{ env.REGISTRY }}
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Extract metadata
        id: meta
        uses: docker/metadata-action@v5
        with:
          images: ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}

      - name: Build and push image
        id: build
        uses: docker/build-push-action@v5
        with:
          context: .
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}

      - name: Sign image (keyless)
        env:
          DIGEST: ${{ steps.build.outputs.digest }}
          TAGS: ${{ steps.meta.outputs.tags }}
        run: |
          echo "Signing ${TAGS}@${DIGEST}"
          cosign sign --yes "${TAGS}@${DIGEST}"

      - name: Verify signature
        env:
          DIGEST: ${{ steps.build.outputs.digest }}
          TAGS: ${{ steps.meta.outputs.tags }}
        run: |
          cosign verify "${TAGS}@${DIGEST}" \
            --certificate-identity-regexp="https://github.com/${{ github.repository }}" \
            --certificate-oidc-issuer=https://token.actions.githubusercontent.com
```

### GitHub Actions - Signed Releases

**Workflow: `.github/workflows/release.yml`**

````yaml
name: Create Signed Release

on:
  push:
    tags:
      - "v*"

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Import GPG key
        uses: crazy-max/ghaction-import-gpg@v6
        with:
          gpg_private_key: ${{ secrets.GPG_PRIVATE_KEY }}
          passphrase: ${{ secrets.GPG_PASSPHRASE }}
          git_user_signingkey: true
          git_commit_gpgsign: true

      - name: Create release archive
        run: |
          VERSION=${GITHUB_REF#refs/tags/}
          tar -czf gridwatch-net-enterprise-${VERSION}.tar.gz \
            --exclude='node_modules' \
            --exclude='.git' \
            .

      - name: Generate checksums and signature
        run: |
          VERSION=${GITHUB_REF#refs/tags/}
          sha256sum gridwatch-net-enterprise-${VERSION}.tar.gz > gridwatch-net-enterprise-${VERSION}.sha256
          gpg --armor --detach-sign gridwatch-net-enterprise-${VERSION}.sha256

      - name: Create GitHub Release
        uses: softprops/action-gh-release@v1
        with:
          files: |
            gridwatch-net-enterprise-*.tar.gz
            gridwatch-net-enterprise-*.sha256
            gridwatch-net-enterprise-*.sha256.asc
          body: |
            ## Release ${{ github.ref_name }}

            ### Verification
            ```bash
            # Import public key
            gpg --keyserver keyserver.ubuntu.com --recv-keys <YOUR_KEY_ID>

            # Verify signature
            gpg --verify gridwatch-net-enterprise-${{ github.ref_name }}.sha256.asc

            # Verify checksum
            sha256sum -c gridwatch-net-enterprise-${{ github.ref_name }}.sha256
            ```
````

---

## Verification Procedures

### Daily Operations

**Pre-Deployment Checklist:**

```bash
# 1. Verify container signature
cosign verify --key cosign.pub gridwatch-net-enterprise-gateway:latest

# 2. Verify Git commits
git log --show-signature -5

# 3. Verify release artifacts (if deploying from release)
./verify-release.sh v0.2.4
```

### Security Audit

**Monthly Audit Script:**

```bash
#!/bin/bash
# audit-signatures.sh

echo "=== Container Signature Audit ==="
IMAGES=(
  "gridwatch-net-enterprise-gateway:latest"
  "gridwatch-net-enterprise-web-ui:latest"
  "gridwatch-net-enterprise-ipam-service:latest"
)

for IMAGE in "${IMAGES[@]}"; do
  echo "Checking $IMAGE..."
  if cosign verify --key cosign.pub $IMAGE > /dev/null 2>&1; then
    echo "  ✓ Valid signature"
  else
    echo "  ✗ INVALID or MISSING signature"
  fi
done

echo ""
echo "=== Git Commit Signature Audit ==="
git log --since="30 days ago" --format="%H %G? %aN %s" | while read hash sig author subject; do
  case $sig in
    G) echo "✓ $hash (Valid) - $author: $subject" ;;
    B) echo "⚠ $hash (Bad signature) - $author: $subject" ;;
    U) echo "⚠ $hash (Untrusted) - $author: $subject" ;;
    N) echo "✗ $hash (No signature) - $author: $subject" ;;
    *) echo "? $hash (Unknown: $sig) - $author: $subject" ;;
  esac
done
```

---

## DoD/Enterprise Requirements

### RMF (Risk Management Framework) Compliance

**Control: SI-7 - Software, Firmware, and Information Integrity**

Code signing satisfies:

- **SI-7(1)**: Integrity checks of software, firmware, and information
- **SI-7(6)**: Cryptographic protection of integrity
- **SI-7(15)**: Code authentication

**Implementation:**

```markdown
GridWatch NetEnterprise implements code signing controls:

1. Container Images: Signed with Cosign using RSA-4096 keys
2. Git Commits: Signed with GPG using RSA-4096 keys
3. Release Artifacts: Signed with GPG detached signatures
4. Verification: Automated verification in CI/CD pipeline
5. Key Management: Private keys stored in HashiCorp Vault
6. Public Key Distribution: Published in repository and documentation
```

### DISA STIG Compliance

**Relevant STIGs:**

- **V-222692**: Applications must cryptographically verify software components
- **V-222693**: Applications must validate certificates used for verification

**Configuration for STIG Compliance:**

```bash
# Enable FIPS mode for GPG (if required)
echo "fips-mode" >> ~/.gnupg/gpg.conf

# Use FIPS-approved algorithms only
echo "personal-digest-preferences SHA512 SHA384 SHA256" >> ~/.gnupg/gpg.conf
echo "cert-digest-algo SHA512" >> ~/.gnupg/gpg.conf
```

### Key Management Best Practices

**Private Key Protection:**

1. **Storage**: HashiCorp Vault or hardware security module (HSM)
2. **Access**: Restricted to authorized release managers only
3. **Rotation**: Rotate keys annually or after personnel changes
4. **Backup**: Encrypted backups stored in secure location
5. **Audit**: Log all key usage

**Public Key Distribution:**

1. **Repository**: Commit `cosign.pub` and GPG public key to repo
2. **Website**: Publish on official project website
3. **Keyserver**: Upload GPG key to public keyservers
4. **Documentation**: Include fingerprints in security documentation

---

## Quick Reference

### Essential Commands

**Cosign:**

```bash
# Generate keys
cosign generate-key-pair

# Sign image
cosign sign --key cosign.key <image>:<tag>

# Verify image
cosign verify --key cosign.pub <image>:<tag>

# Sign keyless
cosign sign --yes <image>:<tag>
```

**GPG:**

```bash
# Generate key
gpg --full-generate-key

# List keys
gpg --list-secret-keys --keyid-format=long

# Export public key
gpg --armor --export <key-id>

# Sign file
gpg --armor --detach-sign file.txt

# Verify signature
gpg --verify file.txt.asc file.txt
```

### Troubleshooting

**GPG "inappropriate ioctl for device" error:**

```bash
export GPG_TTY=$(tty)
echo 'export GPG_TTY=$(tty)' >> ~/.bashrc
```

**Cosign "no signatures found" error:**

```bash
# Check if image digest is correct
docker inspect <image>:<tag> | jq -r '.[0].RepoDigests'

# Use full digest
cosign verify --key cosign.pub <image>@sha256:<digest>
```

**Git commit signing fails:**

```bash
# Test GPG
echo "test" | gpg --clearsign

# Check Git configuration
git config --get user.signingkey
git config --get gpg.program

# Manual signing test
git commit -S -m "test"
```

---

## Next Steps

1. ✅ **Generate keys**: Create Cosign and GPG keys
2. ✅ **Configure Git**: Enable automatic commit signing
3. ✅ **Sign existing images**: Run `sign-all-images.sh`
4. ✅ **Add to CI/CD**: Implement GitHub Actions workflows
5. ✅ **Document keys**: Add public keys to repository
6. ✅ **Train team**: Ensure all developers can verify signatures
7. ✅ **Audit regularly**: Run monthly signature audits

---

## Additional Resources

- **Sigstore Documentation**: https://docs.sigstore.dev/
- **Cosign GitHub**: https://github.com/sigstore/cosign
- **GPG Guide**: https://gnupg.org/documentation/
- **GitHub GPG Signing**: https://docs.github.com/en/authentication/managing-commit-signature-verification
- **NIST Guidelines**: FIPS 186-4 (Digital Signature Standard)
- **DoD Cybersecurity**: https://public.cyber.mil/

---

**Document Version**: 1.0  
**Last Updated**: January 15, 2026  
**Maintained By**: DevOps Team  
**Next Review**: April 15, 2026
