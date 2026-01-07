# ===========================================
# NetNynja Gateway - Vault Policy
# ===========================================
# Allows the API Gateway to read secrets it needs

# Read JWT signing keys
path "secret/data/netnynja/jwt" {
  capabilities = ["read"]
}

# Read database credentials
path "secret/data/netnynja/database" {
  capabilities = ["read"]
}

# Read Redis credentials
path "secret/data/netnynja/redis" {
  capabilities = ["read"]
}

# Read NATS credentials (if authentication enabled)
path "secret/data/netnynja/nats" {
  capabilities = ["read"]
}

# Read gateway-specific configuration
path "secret/data/netnynja/gateway/*" {
  capabilities = ["read"]
}

# Allow token renewal
path "auth/token/renew-self" {
  capabilities = ["update"]
}

# Allow looking up own token
path "auth/token/lookup-self" {
  capabilities = ["read"]
}
