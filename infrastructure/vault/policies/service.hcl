# ===========================================
# GridWatch Service - Vault Policy
# ===========================================
# Generic policy for backend services (IPAM, NPM, STIG)

# Read JWT public key for verification
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

# Read NATS credentials
path "secret/data/GridWatch/nats" {
  capabilities = ["read"]
}

# Read service-specific secrets (replace SERVICE with actual service name)
# Usage: Create separate policies for ipam, npm, stig if needed
path "secret/data/GridWatch/services/*" {
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
