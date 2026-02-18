#!/bin/bash
# ===========================================
# GridWatch NetEnterprise - Vault Secrets Setup
# ===========================================
# This script populates Vault with initial secrets for
# GridWatch services. Customize the values before running.
#
# Prerequisites:
#   - Vault must be initialized, unsealed, and policies configured
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

echo -e "${GREEN}GridWatch NetEnterprise - Vault Secrets Setup${NC}"
echo "============================================"
echo ""

# Check environment
if [ -z "${VAULT_TOKEN:-}" ]; then
  echo -e "${RED}ERROR: VAULT_TOKEN is not set${NC}"
  exit 1
fi

# Check Vault status
echo -e "${YELLOW}Checking Vault status...${NC}"
SEAL_STATUS=$(curl -s -H "X-Vault-Token: $VAULT_TOKEN" "$VAULT_ADDR/v1/sys/seal-status")
SEALED=$(echo "$SEAL_STATUS" | jq -r '.sealed')

if [ "$SEALED" = "true" ]; then
  echo -e "${RED}ERROR: Vault is sealed.${NC}"
  exit 1
fi

echo -e "${GREEN}Vault is accessible.${NC}"
echo ""

# Function to write secret
write_secret() {
  local path="$1"
  local data="$2"

  echo "  Writing secret: $path"
  curl -s -X POST -H "X-Vault-Token: $VAULT_TOKEN" \
    "$VAULT_ADDR/v1/secret/data/$path" \
    -d "{\"data\": $data}" > /dev/null
}

# ===========================================
# JWT Secrets
# ===========================================
echo -e "${YELLOW}Configuring JWT secrets...${NC}"

# Check if JWT keys exist
JWT_KEYS_DIR="$SCRIPT_DIR/../../keys"
if [ -f "$JWT_KEYS_DIR/jwt-private.pem" ] && [ -f "$JWT_KEYS_DIR/jwt-public.pem" ]; then
  echo "  Found JWT keys in $JWT_KEYS_DIR"

  JWT_PRIVATE=$(cat "$JWT_KEYS_DIR/jwt-private.pem" | jq -Rs '.')
  JWT_PUBLIC=$(cat "$JWT_KEYS_DIR/jwt-public.pem" | jq -Rs '.')

  write_secret "GridWatch/jwt" "{
    \"private_key\": $JWT_PRIVATE,
    \"public_key\": $JWT_PUBLIC,
    \"algorithm\": \"RS256\",
    \"issuer\": \"gridwatch-net-enterprise\",
    \"audience\": \"GridWatch-api\",
    \"access_expiry\": \"15m\",
    \"refresh_expiry\": \"7d\"
  }"
else
  echo -e "${YELLOW}  JWT keys not found. Generating placeholder...${NC}"
  echo "  Run ./infrastructure/scripts/generate-jwt-keys.sh first for production use."

  write_secret "GridWatch/jwt" '{
    "secret": "CHANGE-ME-IN-PRODUCTION-use-generate-jwt-keys-script",
    "algorithm": "HS256",
    "issuer": "gridwatch-net-enterprise",
    "audience": "GridWatch-api",
    "access_expiry": "15m",
    "refresh_expiry": "7d"
  }'
fi

# ===========================================
# Database Secrets
# ===========================================
echo -e "${YELLOW}Configuring database secrets...${NC}"

# Default values - CHANGE THESE FOR PRODUCTION
DB_HOST="${POSTGRES_HOST:-postgres}"
DB_PORT="${POSTGRES_PORT:-5432}"
DB_NAME="${POSTGRES_DB:-GridWatch}"
DB_USER="${POSTGRES_USER:-GridWatch}"
DB_PASSWORD="${POSTGRES_PASSWORD:-CHANGE-ME-IN-PRODUCTION}"

write_secret "GridWatch/database" "{
  \"host\": \"$DB_HOST\",
  \"port\": $DB_PORT,
  \"database\": \"$DB_NAME\",
  \"username\": \"$DB_USER\",
  \"password\": \"$DB_PASSWORD\",
  \"ssl\": false,
  \"connection_string\": \"postgresql://$DB_USER:$DB_PASSWORD@$DB_HOST:$DB_PORT/$DB_NAME\"
}"

# ===========================================
# Redis Secrets
# ===========================================
echo -e "${YELLOW}Configuring Redis secrets...${NC}"

REDIS_HOST="${REDIS_HOST:-redis}"
REDIS_PORT="${REDIS_PORT:-6379}"
REDIS_PASSWORD="${REDIS_PASSWORD:-CHANGE-ME-IN-PRODUCTION}"

write_secret "GridWatch/redis" "{
  \"host\": \"$REDIS_HOST\",
  \"port\": $REDIS_PORT,
  \"password\": \"$REDIS_PASSWORD\",
  \"connection_string\": \"redis://:$REDIS_PASSWORD@$REDIS_HOST:$REDIS_PORT\"
}"

# ===========================================
# NATS Secrets
# ===========================================
echo -e "${YELLOW}Configuring NATS secrets...${NC}"

NATS_HOST="${NATS_HOST:-nats}"
NATS_PORT="${NATS_PORT:-4222}"

write_secret "GridWatch/nats" "{
  \"host\": \"$NATS_HOST\",
  \"port\": $NATS_PORT,
  \"connection_string\": \"nats://$NATS_HOST:$NATS_PORT\"
}"

# ===========================================
# Service-specific Secrets
# ===========================================
echo -e "${YELLOW}Configuring service-specific secrets...${NC}"

# IPAM service secrets
write_secret "GridWatch/services/ipam" '{
  "scan_timeout": 30,
  "max_concurrent_scans": 10
}'

# NPM service secrets
write_secret "GridWatch/services/npm" '{
  "snmp_community": "public",
  "poll_interval": 60
}'

# STIG service secrets
write_secret "GridWatch/services/stig" '{
  "ssh_timeout": 30,
  "max_concurrent_audits": 5
}'

# ===========================================
# Gateway-specific Secrets
# ===========================================
echo -e "${YELLOW}Configuring gateway secrets...${NC}"

write_secret "GridWatch/gateway/config" '{
  "rate_limit_max": 100,
  "rate_limit_auth_max": 10,
  "rate_limit_window_ms": 60000,
  "cors_origin": "true",
  "cors_credentials": true,
  "cors_max_age": 86400
}'

echo ""
echo "============================================"
echo -e "${GREEN}Secrets setup complete!${NC}"
echo "============================================"
echo ""
echo "Secrets configured:"
echo "  - GridWatch/jwt"
echo "  - GridWatch/database"
echo "  - GridWatch/redis"
echo "  - GridWatch/nats"
echo "  - GridWatch/services/ipam"
echo "  - GridWatch/services/npm"
echo "  - GridWatch/services/stig"
echo "  - GridWatch/gateway/config"
echo ""
echo -e "${YELLOW}IMPORTANT: Update the default passwords for production use!${NC}"
echo ""
echo "To view a secret:"
echo "  vault kv get secret/GridWatch/database"
echo ""
echo "To update a secret:"
echo "  vault kv put secret/GridWatch/database password=new-secure-password"
