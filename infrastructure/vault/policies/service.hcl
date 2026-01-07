# ===========================================
# NetNynja Service - Vault Policy
# ===========================================
# Generic policy for backend services (IPAM, NPM, STIG)

# Read JWT public key for verification
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

# Read NATS credentials
path "secret/data/netnynja/nats" {
  capabilities = ["read"]
}

# Read service-specific secrets (replace SERVICE with actual service name)
# Usage: Create separate policies for ipam, npm, stig if needed
path "secret/data/netnynja/services/*" {
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
