# ===========================================
# NetNynja Admin - Vault Policy
# ===========================================
# Full administrative access for operators

# Full access to all NetNynja secrets
path "secret/data/netnynja/*" {
  capabilities = ["create", "read", "update", "delete", "list"]
}

path "secret/metadata/netnynja/*" {
  capabilities = ["list", "read", "delete"]
}

# Manage policies
path "sys/policies/acl/*" {
  capabilities = ["create", "read", "update", "delete", "list"]
}

# Manage auth methods
path "auth/*" {
  capabilities = ["create", "read", "update", "delete", "list", "sudo"]
}

# Manage secrets engines
path "sys/mounts/*" {
  capabilities = ["create", "read", "update", "delete", "list"]
}

# View system health
path "sys/health" {
  capabilities = ["read"]
}

# View seal status
path "sys/seal-status" {
  capabilities = ["read"]
}

# Seal Vault (emergency)
path "sys/seal" {
  capabilities = ["update", "sudo"]
}

# Generate root token (emergency recovery)
path "sys/generate-root/*" {
  capabilities = ["read", "update", "delete"]
}

# Manage tokens
path "auth/token/*" {
  capabilities = ["create", "read", "update", "delete", "list", "sudo"]
}
