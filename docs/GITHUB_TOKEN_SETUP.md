# GitHub Fine-Grained Token Setup for Container Registry

> Step-by-step guide for creating a fine-grained personal access token for GHCR

**Last Updated**: 2026-01-15

---

## Create Fine-Grained Personal Access Token

### Step 1: Navigate to Token Settings

Go to: https://github.com/settings/tokens?type=beta

Or manually:

1. Click your profile picture (top right)
2. Settings
3. Developer settings (bottom left)
4. Personal access tokens → **Fine-grained tokens**
5. Click **"Generate new token"**

### Step 2: Configure Token

**Token name:**

```
GridWatch Container Registry
```

**Expiration:**

- Choose: **90 days** (or longer if preferred)
- Note: You'll need to regenerate when it expires

**Description (optional):**

```
Token for pushing and signing GridWatch NetEnterprise container images to GHCR
```

**Resource owner:**

- Select your username (e.g., `russmeadows`)

**Repository access:**

- Select: **"All repositories"**

  OR (more secure):

- Select: **"Only select repositories"**
- Choose: Your GridWatch NetEnterprise repository

### Step 3: Set Permissions

Scroll down to **"Permissions"** section.

**Repository permissions** (expand this section):

Find and configure these permissions:

| Permission   | Access Level       | Required           |
| ------------ | ------------------ | ------------------ |
| **Contents** | Read and write     | ✅ Yes             |
| **Metadata** | Read-only          | ✅ Yes (automatic) |
| **Packages** | **Read and write** | ✅ **CRITICAL**    |

**How to set:**

1. Click on **"Packages"** dropdown
2. Select **"Read and write"**
3. This allows pushing/pulling container images to GHCR

**Account permissions:**

- Leave as default (no changes needed)

### Step 4: Generate Token

1. Scroll to bottom
2. Click **"Generate token"**
3. **IMPORTANT:** Copy the token immediately!
   - It starts with `github_pat_`
   - You won't see it again
4. Save it somewhere secure (password manager)

### Step 5: Test the Token

```bash
# Test login to GHCR
echo "YOUR_TOKEN_HERE" | docker login ghcr.io -u YOUR_GITHUB_USERNAME --password-stdin

# Should see: "Login Succeeded"
```

---

## Complete Permission Requirements Summary

**Minimum required permissions for GHCR:**

✅ **Packages: Read and write**  
✅ **Contents: Read and write** (if you want to commit signed artifacts)  
✅ **Metadata: Read-only** (automatic)

**Optional but recommended:**

🔹 **Actions: Read and write** (if using GitHub Actions for signing)  
🔹 **Workflows: Read and write** (if automating with GitHub Actions)

---

## Using the Token

### With the Setup Script

```bash
cd "/Users/russmeadows/Dev/GridWatch/GridWatch NetEnterprise"
chmod +x setup-ghcr.sh
./setup-ghcr.sh

# When prompted:
# - Username: russmeadows
# - Token: github_pat_XXXXXXXXXXXXXXXXXXXXX (paste your token)
```

### Manual Docker Login

```bash
# Save token to file (temporary)
echo "github_pat_XXXXX" > token.txt

# Login to GHCR
cat token.txt | docker login ghcr.io -u russmeadows --password-stdin

# Delete token file
rm token.txt
```

### Store Token Securely

**Option 1: Environment Variable (Temporary)**

```bash
export GITHUB_TOKEN="github_pat_XXXXX"
echo "$GITHUB_TOKEN" | docker login ghcr.io -u russmeadows --password-stdin
```

**Option 2: Docker Credential Helper (Recommended)**

```bash
# macOS - credentials stored in Keychain
# After first login, Docker remembers credentials
docker login ghcr.io -u russmeadows
# Enter token when prompted
# Credentials saved to macOS Keychain automatically
```

---

## Troubleshooting

### Error: "insufficient_scopes"

**Problem:** Token doesn't have `write:packages` permission

**Solution:**

1. Go to https://github.com/settings/tokens
2. Click on your token name
3. Under "Repository permissions", set **Packages** to **Read and write**
4. Click **"Update token"**
5. Generate new token if update not available

### Error: "denied: installation not allowed to Write organization package"

**Problem:** Trying to push to an organization repository without permission

**Solution:**

1. Make sure you selected the correct repository in token settings
2. If pushing to organization, contact organization admin for permissions
3. Or push to your personal namespace: `ghcr.io/russmeadows/` instead

### Error: "authentication required"

**Problem:** Not logged in or token expired

**Solution:**

```bash
# Re-login with token
docker logout ghcr.io
echo "YOUR_NEW_TOKEN" | docker login ghcr.io -u russmeadows --password-stdin
```

### Token Expired

**Solution:**

1. Go to https://github.com/settings/tokens
2. Click **"Regenerate token"** next to your token
3. Copy new token
4. Re-login to Docker

---

## Security Best Practices

**DO:**
✅ Use fine-grained tokens with minimum required permissions  
✅ Set expiration dates (90 days recommended)  
✅ Store tokens in password manager or secrets vault  
✅ Rotate tokens regularly  
✅ Use different tokens for different purposes  
✅ Delete unused tokens

**DON'T:**
❌ Commit tokens to Git repositories  
❌ Share tokens via email/Slack  
❌ Use tokens with "All repositories" unless necessary  
❌ Set "No expiration" unless absolutely required  
❌ Reuse tokens across multiple machines/services

---

## Quick Reference

**Token Creation URL:**
https://github.com/settings/tokens?type=beta

**Required Permissions:**

- Packages: **Read and write**
- Contents: Read and write (optional)
- Metadata: Read-only (automatic)

**Token Format:**

- Classic tokens: `ghp_XXXXXXXXXXXXXXXXXXXXX`
- Fine-grained tokens: `github_pat_XXXXXXXXXXXXXXXXXXXXX`

**GHCR Registry:**

- URL: `ghcr.io`
- Image format: `ghcr.io/USERNAME/IMAGE:TAG`
- Example: `ghcr.io/russmeadows/gridwatch-net-enterprise-gateway:v0.2.4`

---

## Next Steps

After creating your token:

1. ✅ Run the setup script: `./setup-ghcr.sh`
2. ✅ Sign all images with Cosign
3. ✅ Commit `cosign.pub` to repository
4. ✅ Update documentation with registry URLs
5. ✅ Add token regeneration reminder to calendar (before expiration)

---

**Need Help?**

- GitHub Docs: https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry
- Token Settings: https://github.com/settings/tokens
