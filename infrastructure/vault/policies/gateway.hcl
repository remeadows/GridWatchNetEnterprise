# ===========================================
# GridWatch Gateway - Vault Policy
# ===========================================
# Allows the API Gateway to read secrets it needs

# Read JWT signing keys
path "secret/data/GridWatch/jwt" {
  capabilities = ["read"]
}

# Read database credentials
path "secret/data/GridWatch/database" {
  capabilities = ["read"]
}

# Read Redis credentials
path "secret/data/GridWatch/redis" {
  capabilities = ["read"]
}

# Read NATS credentials (if authentication enabled)
path "secret/data/GridWatch/nats" {
  capabilities = ["read"]
}

# Read gateway-specific configuration
path "secret/data/GridWatch/gateway/*" {
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
