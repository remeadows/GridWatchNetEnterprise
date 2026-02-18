# Code Signing for Local Docker Images

> Quick guide for signing locally-built container images

## The Problem

Your GridWatch NetEnterprise images are built locally and not pushed to a registry yet. Cosign requires images to be in a registry (Docker Hub, GitHub Container Registry, etc.) to sign them properly.

## Solutions

### Option 1: Sign Local Images with Digest (Recommended for Development)

**Step 1: Get the image digest**

```bash
# Get digest for your local image
docker images --digests gridwatch-net-enterprise-gateway
```

**Step 2: Sign using the digest**

```bash
# Sign with local digest
cosign sign --key cosign.key gridwatch-net-enterprise-gateway@sha256:<digest>
```

**Example:**

```bash
# List images with digests
docker images --digests gridwatch-net-enterprise-gateway

# Output shows:
# REPOSITORY                        TAG     DIGEST                                                                    IMAGE ID
# gridwatch-net-enterprise-gateway      latest  sha256:918697d6e32741125bf17c80f9099551ec8b4d186e16a0c9e751b7a516cbdf69  abc123

# Sign using the digest
cosign sign --key cosign.key \
  gridwatch-net-enterprise-gateway@sha256:918697d6e32741125bf17c80f9099551ec8b4d186e16a0c9e751b7a516cbdf69
```

### Option 2: Use GitHub Container Registry (GHCR) - Best for Production

**Step 1: Create GitHub Personal Access Token**

1. Go to https://github.com/settings/tokens
2. Click "Generate new token (classic)"
3. Name: "GridWatch Container Registry"
4. Select scopes:
   - ✅ `write:packages`
   - ✅ `read:packages`
   - ✅ `delete:packages`
5. Click "Generate token"
6. **Copy the token** (you won't see it again!)

**Step 2: Login to GHCR**

```bash
# Login to GitHub Container Registry
echo "YOUR_GITHUB_TOKEN" | docker login ghcr.io -u YOUR_GITHUB_USERNAME --password-stdin

# Example:
echo "ghp_xxxxxxxxxxxx" | docker login ghcr.io -u russmeadows --password-stdin
```

**Step 3: Tag and Push Images**

```bash
# Tag image for GHCR
docker tag gridwatch-net-enterprise-gateway:latest \
  ghcr.io/YOUR_GITHUB_USERNAME/gridwatch-net-enterprise-gateway:latest

# Push to GHCR
docker push ghcr.io/YOUR_GITHUB_USERNAME/gridwatch-net-enterprise-gateway:latest
```

**Step 4: Sign the Registry Image**

```bash
# Now sign the image in the registry
cosign sign --key cosign.key \
  ghcr.io/YOUR_GITHUB_USERNAME/gridwatch-net-enterprise-gateway:latest
```

**Complete Script for All Images:**

```bash
#!/bin/bash
# push-and-sign-images.sh

GITHUB_USER="YOUR_GITHUB_USERNAME"  # Change this
VERSION="v0.2.4"

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

echo "🚀 Pushing and signing GridWatch NetEnterprise images..."
echo ""

for IMAGE in "${IMAGES[@]}"; do
  echo "📦 Processing $IMAGE..."

  # Tag for GHCR
  docker tag ${IMAGE}:latest ghcr.io/${GITHUB_USER}/${IMAGE}:latest
  docker tag ${IMAGE}:latest ghcr.io/${GITHUB_USER}/${IMAGE}:${VERSION}

  # Push to GHCR
  echo "  ⬆️  Pushing to registry..."
  docker push ghcr.io/${GITHUB_USER}/${IMAGE}:latest
  docker push ghcr.io/${GITHUB_USER}/${IMAGE}:${VERSION}

  # Sign images
  echo "  ✍️  Signing..."
  cosign sign --key cosign.key ghcr.io/${GITHUB_USER}/${IMAGE}:latest
  cosign sign --key cosign.key ghcr.io/${GITHUB_USER}/${IMAGE}:${VERSION}

  echo "  ✅ Done!"
  echo ""
done

echo "🎉 All images pushed and signed!"
```

### Option 3: Use Docker Hub (Alternative)

**Step 1: Create Docker Hub Account**

- Sign up at https://hub.docker.com/

**Step 2: Create Repository**

- Go to https://hub.docker.com/repositories
- Click "Create Repository"
- Name: `gridwatch-net-enterprise-gateway`
- Make it Public or Private
- Repeat for each image

**Step 3: Login and Push**

```bash
# Login to Docker Hub
docker login

# Tag image
docker tag gridwatch-net-enterprise-gateway:latest \
  YOUR_DOCKERHUB_USERNAME/gridwatch-net-enterprise-gateway:latest

# Push to Docker Hub
docker push YOUR_DOCKERHUB_USERNAME/gridwatch-net-enterprise-gateway:latest

# Sign
cosign sign --key cosign.key \
  YOUR_DOCKERHUB_USERNAME/gridwatch-net-enterprise-gateway:latest
```

### Option 4: Local Registry for Testing

**Step 1: Start Local Registry**

```bash
# Start a local Docker registry
docker run -d -p 5000:5000 --name registry registry:2

# Or add to your docker-compose.yml:
services:
  registry:
    image: registry:2
    ports:
      - "5000:5000"
    volumes:
      - registry-data:/var/lib/registry

volumes:
  registry-data:
```

**Step 2: Tag and Push to Local Registry**

```bash
# Tag for local registry
docker tag gridwatch-net-enterprise-gateway:latest \
  localhost:5000/gridwatch-net-enterprise-gateway:latest

# Push to local registry
docker push localhost:5000/gridwatch-net-enterprise-gateway:latest

# Sign (requires cosign experimental features)
COSIGN_EXPERIMENTAL=1 cosign sign --key cosign.key \
  localhost:5000/gridwatch-net-enterprise-gateway:latest
```

## Recommended Approach for GridWatch NetEnterprise

**For Development/Testing:**

```bash
# Use Option 4 (Local Registry) for quick testing
docker-compose up -d registry
docker tag gridwatch-net-enterprise-gateway:latest localhost:5000/gridwatch-net-enterprise-gateway:latest
docker push localhost:5000/gridwatch-net-enterprise-gateway:latest
COSIGN_EXPERIMENTAL=1 cosign sign --key cosign.key localhost:5000/gridwatch-net-enterprise-gateway:latest
```

**For Production/Distribution:**

```bash
# Use Option 2 (GHCR) for official releases
# This integrates best with GitHub Actions and is free for public repos

# 1. Login to GHCR
echo "YOUR_TOKEN" | docker login ghcr.io -u russmeadows --password-stdin

# 2. Tag and push
docker tag gridwatch-net-enterprise-gateway:latest ghcr.io/russmeadows/gridwatch-net-enterprise-gateway:v0.2.4
docker push ghcr.io/russmeadows/gridwatch-net-enterprise-gateway:v0.2.4

# 3. Sign
cosign sign --key cosign.key ghcr.io/russmeadows/gridwatch-net-enterprise-gateway:v0.2.4
```

## Quick Fix Script

Create this script to set up GHCR and sign all images:

```bash
#!/bin/bash
# setup-ghcr.sh

set -e  # Exit on error

echo "🔧 GridWatch NetEnterprise - GHCR Setup and Signing"
echo ""

# Configuration
read -p "Enter your GitHub username: " GITHUB_USER
read -sp "Enter your GitHub Personal Access Token: " GITHUB_TOKEN
echo ""

VERSION="v0.2.4"

# Login to GHCR
echo "🔐 Logging into GitHub Container Registry..."
echo "$GITHUB_TOKEN" | docker login ghcr.io -u "$GITHUB_USER" --password-stdin

if [ $? -ne 0 ]; then
  echo "❌ Login failed. Check your token and username."
  exit 1
fi

echo "✅ Login successful!"
echo ""

# Check if cosign keys exist
if [ ! -f "cosign.key" ]; then
  echo "❌ cosign.key not found. Run 'cosign generate-key-pair' first."
  exit 1
fi

# Process images
IMAGES=(
  "gridwatch-net-enterprise-gateway"
  "gridwatch-net-enterprise-web-ui"
  "gridwatch-net-enterprise-ipam-service"
  "gridwatch-net-enterprise-npm-service"
  "gridwatch-net-enterprise-stig-service"
  "gridwatch-net-enterprise-auth-service"
)

for IMAGE in "${IMAGES[@]}"; do
  echo "📦 Processing $IMAGE..."

  # Check if local image exists
  if ! docker images --format "{{.Repository}}:{{.Tag}}" | grep -q "^${IMAGE}:latest$"; then
    echo "  ⚠️  Image not found locally, skipping..."
    continue
  fi

  # Tag for GHCR
  GHCR_IMAGE="ghcr.io/${GITHUB_USER}/${IMAGE}"
  docker tag ${IMAGE}:latest ${GHCR_IMAGE}:latest
  docker tag ${IMAGE}:latest ${GHCR_IMAGE}:${VERSION}

  # Push to GHCR
  echo "  ⬆️  Pushing to GHCR..."
  docker push ${GHCR_IMAGE}:latest
  docker push ${GHCR_IMAGE}:${VERSION}

  # Sign images
  echo "  ✍️  Signing with Cosign..."
  cosign sign --key cosign.key ${GHCR_IMAGE}:${VERSION}

  # Verify signature
  echo "  ✓ Verifying signature..."
  cosign verify --key cosign.pub ${GHCR_IMAGE}:${VERSION}

  echo "  ✅ ${IMAGE} complete!"
  echo ""
done

echo "🎉 All images pushed and signed to GHCR!"
echo ""
echo "📝 Update your docker-compose.yml to use:"
echo "   image: ghcr.io/${GITHUB_USER}/gridwatch-net-enterprise-gateway:${VERSION}"
```

**Run it:**

```bash
chmod +x setup-ghcr.sh
./setup-ghcr.sh
```

## Troubleshooting

**Error: "authentication required"**

- You need to push the image to a registry first
- Use GHCR, Docker Hub, or a local registry

**Error: "tag will be removed in future"**

- This is just a warning
- For production, use digests: `image@sha256:abc...`

**Error: "accessing entity"**

- Image doesn't exist in the registry
- Make sure you pushed it first with `docker push`

## Summary

**Current Status:** ❌ Images are local only, cannot be signed

**Solution:** ✅ Use GitHub Container Registry (GHCR)

**Steps:**

1. Create GitHub Personal Access Token
2. Login: `docker login ghcr.io`
3. Push images: `docker push ghcr.io/username/image:tag`
4. Sign images: `cosign sign --key cosign.key ghcr.io/username/image:tag`

**Alternative:** Use local registry for development testing

---

**Need Help?** The setup-ghcr.sh script automates the entire process!
