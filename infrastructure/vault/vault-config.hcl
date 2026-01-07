# ===========================================
# NetNynja Enterprise - Vault Configuration
# ===========================================
# Production configuration for HashiCorp Vault
#
# For dev mode, use VAULT_DEV_ROOT_TOKEN_ID env var
# For production, use this config file with proper storage backend

# API listener configuration
listener "tcp" {
  address       = "0.0.0.0:8200"
  tls_disable   = true  # Set to false in production with proper TLS certs

  # For production with TLS:
  # tls_cert_file = "/vault/certs/vault.crt"
  # tls_key_file  = "/vault/certs/vault.key"
}

# Storage backend - File storage for single-node deployments
storage "file" {
  path = "/vault/data"
}

# For production HA deployments, use Consul or Raft:
# storage "raft" {
#   path    = "/vault/data"
#   node_id = "vault_1"
# }
#
# storage "consul" {
#   address = "consul:8500"
#   path    = "vault/"
# }

# Disable memory locking (required for containers without IPC_LOCK)
disable_mlock = false

# Cluster settings
cluster_addr  = "https://127.0.0.1:8201"
api_addr      = "http://127.0.0.1:8200"

# UI configuration
ui = true

# Telemetry for Prometheus metrics
telemetry {
  prometheus_retention_time = "30s"
  disable_hostname          = true
}

# Logging
log_level = "info"

# ===========================================
# Auto-Unseal Configuration (Production)
# ===========================================
# Uncomment ONE of the following auto-unseal methods for production:

# AWS KMS Auto-Unseal
# seal "awskms" {
#   region     = "us-east-1"
#   kms_key_id = "alias/vault-unseal-key"
#   # Uses IAM role or environment variables for auth
# }

# Azure Key Vault Auto-Unseal
# seal "azurekeyvault" {
#   tenant_id      = "your-tenant-id"
#   client_id      = "your-client-id"
#   client_secret  = "your-client-secret"
#   vault_name     = "netnynja-vault"
#   key_name       = "vault-unseal-key"
# }

# GCP Cloud KMS Auto-Unseal
# seal "gcpckms" {
#   project     = "your-project"
#   region      = "global"
#   key_ring    = "vault-keyring"
#   crypto_key  = "vault-unseal-key"
# }

# Transit Auto-Unseal (using another Vault)
# seal "transit" {
#   address         = "https://vault-primary:8200"
#   token           = "transit-token"
#   disable_renewal = false
#   key_name        = "autounseal"
#   mount_path      = "transit/"
# }
