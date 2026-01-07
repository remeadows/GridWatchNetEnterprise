#!/bin/bash
# ===========================================
# NetNynja Enterprise - Vault Policy Setup
# ===========================================
# This script configures Vault policies and authentication
# for NetNynja services.
#
# Prerequisites:
#   - Vault must be initialized and unsealed
#   - VAULT_ADDR and VAULT_TOKEN must be set

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
VAULT_ADDR="${VAULT_ADDR:-http://localhost:8200}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
POLICIES_DIR="$SCRIPT_DIR/../policies"

echo -e "${GREEN}NetNynja Enterprise - Vault Policy Setup${NC}"
echo "============================================"
echo ""

# Check environment
if [ -z "${VAULT_TOKEN:-}" ]; then
  echo -e "${RED}ERROR: VAULT_TOKEN is not set${NC}"
  echo "Export your root token or admin token first:"
  echo "  export VAULT_TOKEN=<your-token>"
  exit 1
fi

# Check if Vault is reachable and unsealed
echo -e "${YELLOW}Checking Vault status...${NC}"
SEAL_STATUS=$(curl -s -H "X-Vault-Token: $VAULT_TOKEN" "$VAULT_ADDR/v1/sys/seal-status")
SEALED=$(echo "$SEAL_STATUS" | jq -r '.sealed')

if [ "$SEALED" = "true" ]; then
  echo -e "${RED}ERROR: Vault is sealed. Run unseal-vault.sh first.${NC}"
  exit 1
fi

echo -e "${GREEN}Vault is unsealed and accessible.${NC}"
echo ""

# Enable secrets engine (if not already enabled)
echo -e "${YELLOW}Enabling KV secrets engine v2...${NC}"
MOUNTS=$(curl -s -H "X-Vault-Token: $VAULT_TOKEN" "$VAULT_ADDR/v1/sys/mounts" | jq -r 'keys[]')

if echo "$MOUNTS" | grep -q "^secret/$"; then
  echo "KV secrets engine already enabled at secret/"
else
  curl -s -X POST -H "X-Vault-Token: $VAULT_TOKEN" "$VAULT_ADDR/v1/sys/mounts/secret" \
    -d '{"type": "kv", "options": {"version": "2"}}' > /dev/null
  echo "KV secrets engine enabled at secret/"
fi
echo ""

# Upload policies
echo -e "${YELLOW}Uploading policies...${NC}"
for policy_file in "$POLICIES_DIR"/*.hcl; do
  if [ -f "$policy_file" ]; then
    policy_name=$(basename "$policy_file" .hcl)
    echo "  Uploading policy: $policy_name"

    # Convert HCL to JSON payload
    policy_content=$(cat "$policy_file" | jq -Rs '{"policy": .}')

    curl -s -X PUT -H "X-Vault-Token: $VAULT_TOKEN" \
      "$VAULT_ADDR/v1/sys/policies/acl/$policy_name" \
      -d "$policy_content" > /dev/null
  fi
done
echo -e "${GREEN}Policies uploaded successfully.${NC}"
echo ""

# Create service tokens
echo -e "${YELLOW}Creating service tokens...${NC}"

# Gateway token (long-lived with renewal)
echo "  Creating gateway token..."
GATEWAY_TOKEN=$(curl -s -X POST -H "X-Vault-Token: $VAULT_TOKEN" \
  "$VAULT_ADDR/v1/auth/token/create" \
  -d '{
    "policies": ["gateway"],
    "display_name": "netnynja-gateway",
    "ttl": "720h",
    "renewable": true,
    "metadata": {"service": "gateway"}
  }' | jq -r '.auth.client_token')

echo "  Gateway token: ${GATEWAY_TOKEN:0:20}..."

# Service token (for IPAM, NPM, STIG)
echo "  Creating service token..."
SERVICE_TOKEN=$(curl -s -X POST -H "X-Vault-Token: $VAULT_TOKEN" \
  "$VAULT_ADDR/v1/auth/token/create" \
  -d '{
    "policies": ["service"],
    "display_name": "netnynja-service",
    "ttl": "720h",
    "renewable": true,
    "metadata": {"service": "backend"}
  }' | jq -r '.auth.client_token')

echo "  Service token: ${SERVICE_TOKEN:0:20}..."

# Admin token
echo "  Creating admin token..."
ADMIN_TOKEN=$(curl -s -X POST -H "X-Vault-Token: $VAULT_TOKEN" \
  "$VAULT_ADDR/v1/auth/token/create" \
  -d '{
    "policies": ["admin"],
    "display_name": "netnynja-admin",
    "ttl": "24h",
    "renewable": true,
    "metadata": {"service": "admin"}
  }' | jq -r '.auth.client_token')

echo "  Admin token: ${ADMIN_TOKEN:0:20}..."

echo ""
echo "============================================"
echo -e "${GREEN}Policy setup complete!${NC}"
echo "============================================"
echo ""
echo "Service tokens created:"
echo ""
echo "GATEWAY_VAULT_TOKEN=$GATEWAY_TOKEN"
echo ""
echo "SERVICE_VAULT_TOKEN=$SERVICE_TOKEN"
echo ""
echo "ADMIN_VAULT_TOKEN=$ADMIN_TOKEN"
echo ""
echo -e "${YELLOW}Add these to your .env file or secrets management.${NC}"
echo ""
echo "Next step: Run ./setup-secrets.sh to configure application secrets."
