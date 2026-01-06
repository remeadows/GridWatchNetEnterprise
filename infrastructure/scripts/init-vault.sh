#!/bin/bash
# NetNynja Enterprise - Vault Initialization
# Sets up Vault secrets structure for development

set -euo pipefail

VAULT_ADDR="${VAULT_ADDR:-http://localhost:8200}"
VAULT_TOKEN="${VAULT_TOKEN:-netnynja-dev-token}"

export VAULT_ADDR
export VAULT_TOKEN

echo "============================================"
echo "NetNynja Enterprise - Vault Setup"
echo "============================================"
echo ""

# Wait for Vault to be ready
echo "Waiting for Vault to be ready..."
until vault status &>/dev/null; do
    echo "Vault not ready, waiting..."
    sleep 2
done
echo "Vault is ready!"
echo ""

# Enable KV secrets engine v2
echo "Enabling KV secrets engine..."
vault secrets enable -path=secret -version=2 kv 2>/dev/null || echo "KV engine already enabled"

# Create secrets structure
echo "Creating secrets structure..."

# Database credentials
vault kv put secret/database \
    postgres_user="netnynja" \
    postgres_password="${POSTGRES_PASSWORD:-changeme}" \
    postgres_host="postgres" \
    postgres_port="5432" \
    postgres_db="netnynja"

# Redis credentials
vault kv put secret/redis \
    password="${REDIS_PASSWORD:-changeme}" \
    host="redis" \
    port="6379"

# JWT signing keys (development)
vault kv put secret/jwt \
    secret="${JWT_SECRET:-development-secret-change-in-production}" \
    access_token_expiry="15m" \
    refresh_token_expiry="7d"

# IPAM module secrets
vault kv put secret/ipam \
    scan_enabled="true" \
    nmap_path="/usr/bin/nmap"

# NPM module secrets
vault kv put secret/npm \
    snmp_community="public" \
    poll_interval="60"

# STIG module secrets  
vault kv put secret/stig \
    ssh_default_port="22" \
    max_concurrent_audits="10"

# SMTP configuration (placeholder)
vault kv put secret/smtp \
    host="smtp.example.com" \
    port="587" \
    user="" \
    password="" \
    from="netnynja@example.com"

echo ""
echo "Creating policies..."

# Create read-only policy for applications
vault policy write netnynja-app - <<EOF
# Read access to all secrets
path "secret/data/*" {
  capabilities = ["read"]
}

path "secret/metadata/*" {
  capabilities = ["list", "read"]
}
EOF

# Create admin policy
vault policy write netnynja-admin - <<EOF
# Full access to secrets
path "secret/*" {
  capabilities = ["create", "read", "update", "delete", "list"]
}
EOF

echo ""
echo "Creating AppRole for applications..."

# Enable AppRole auth
vault auth enable approle 2>/dev/null || echo "AppRole already enabled"

# Create AppRole for gateway
vault write auth/approle/role/gateway \
    token_policies="netnynja-app" \
    token_ttl="1h" \
    token_max_ttl="4h" \
    secret_id_ttl="0"

# Get role-id and secret-id for gateway (development)
GATEWAY_ROLE_ID=$(vault read -field=role_id auth/approle/role/gateway/role-id)
GATEWAY_SECRET_ID=$(vault write -f -field=secret_id auth/approle/role/gateway/secret-id)

echo ""
echo "============================================"
echo "Vault Setup Complete!"
echo "============================================"
echo ""
echo "Gateway AppRole Credentials (save securely):"
echo "  Role ID:   $GATEWAY_ROLE_ID"
echo "  Secret ID: $GATEWAY_SECRET_ID"
echo ""
echo "Access Vault UI: $VAULT_ADDR/ui"
echo "Token: $VAULT_TOKEN (development only)"
echo ""
