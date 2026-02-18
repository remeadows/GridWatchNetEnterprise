# GridWatch NetEnterprise - Vault Configuration

This directory contains HashiCorp Vault configuration for secure secrets management in GridWatch NetEnterprise.

## Directory Structure

```
vault/
├── README.md                    # This file
├── vault-config.hcl            # Production Vault configuration
├── docker-compose.vault.yml    # Production Vault docker-compose override
├── policies/                   # Vault policies
│   ├── admin.hcl              # Admin policy (full access)
│   ├── gateway.hcl            # API Gateway policy
│   └── service.hcl            # Backend services policy
└── scripts/
    ├── init-vault.sh          # Initialize Vault (run once)
    ├── unseal-vault.sh        # Unseal Vault after restart
    ├── setup-policies.sh      # Configure policies and tokens
    └── setup-secrets.sh       # Populate initial secrets
```

## Quick Start (Development)

For development, Vault runs in dev mode with an automatic root token:

```bash
# Start Vault in dev mode (default)
docker compose up -d vault

# Use the dev token
export VAULT_ADDR=http://localhost:8200
export VAULT_TOKEN=gridwatch-dev-token

# Verify access
vault status
```

## Production Setup

### 1. Start Vault in Production Mode

```bash
# Use the production override
docker compose -f docker-compose.yml \
  -f infrastructure/vault/docker-compose.vault.yml \
  up -d vault
```

### 2. Initialize Vault (First Time Only)

```bash
cd infrastructure/vault/scripts

# Initialize with 5 key shares, 3 required to unseal
./init-vault.sh --shares 5 --threshold 3 --output vault-keys.json

# IMPORTANT: Securely store the generated keys!
# - Distribute unseal keys to different team members
# - Store root token in a secure location
# - Delete vault-keys.json after distributing keys
```

### 3. Unseal Vault

After initialization or restart, Vault must be unsealed:

```bash
# Interactive mode (prompts for keys)
./unseal-vault.sh --interactive

# Or provide keys directly
./unseal-vault.sh --key "key1..." --key "key2..." --key "key3..."

# Or use keys file (for automation only)
./unseal-vault.sh --keys-file vault-keys.json
```

### 4. Configure Policies and Tokens

```bash
export VAULT_TOKEN=<root-token>

# Upload policies and create service tokens
./setup-policies.sh

# Save the generated tokens for use in .env or secrets manager
```

### 5. Populate Secrets

```bash
# Configure initial secrets
./setup-secrets.sh

# Or manually:
vault kv put secret/gridwatch/database \
  host=postgres \
  port=5432 \
  username=gridwatch \
  password=your-secure-password
```

## Auto-Unseal (Recommended for Production)

For production, configure auto-unseal to avoid manual unsealing after restarts.

### AWS KMS

```hcl
# In vault-config.hcl
seal "awskms" {
  region     = "us-east-1"
  kms_key_id = "alias/vault-unseal-key"
}
```

### Azure Key Vault

```hcl
seal "azurekeyvault" {
  tenant_id     = "your-tenant-id"
  client_id     = "your-client-id"
  client_secret = "your-client-secret"
  vault_name    = "gridwatch-vault"
  key_name      = "vault-unseal-key"
}
```

### GCP Cloud KMS

```hcl
seal "gcpckms" {
  project    = "your-project"
  region     = "global"
  key_ring   = "vault-keyring"
  crypto_key = "vault-unseal-key"
}
```

## Service Integration

Services retrieve secrets from Vault using tokens:

```bash
# Gateway retrieves JWT keys
vault kv get -field=private_key secret/gridwatch/jwt

# Service retrieves database credentials
vault kv get secret/gridwatch/database
```

### Environment Variables

Configure services with Vault:

```env
VAULT_ADDR=http://vault:8200
VAULT_TOKEN=<service-token>
```

## Policies

| Policy    | Description                          | Used By          |
| --------- | ------------------------------------ | ---------------- |
| `admin`   | Full administrative access           | Operators, CI/CD |
| `gateway` | Read JWT, DB, Redis, NATS secrets    | API Gateway      |
| `service` | Read JWT public key, DB, Redis, NATS | Backend services |

## Secrets Structure

```
secret/
└── gridwatch/
    ├── jwt/              # JWT signing keys
    │   ├── private_key
    │   ├── public_key
    │   └── algorithm
    ├── database/         # PostgreSQL credentials
    │   ├── host
    │   ├── port
    │   ├── username
    │   └── password
    ├── redis/            # Redis credentials
    ├── nats/             # NATS configuration
    ├── services/         # Service-specific secrets
    │   ├── ipam/
    │   ├── npm/
    │   └── stig/
    └── gateway/          # Gateway configuration
```

## Security Best Practices

1. **Never commit vault-keys.json** - Add to .gitignore
2. **Distribute unseal keys** - Give to different team members
3. **Rotate tokens regularly** - Use short TTLs with renewal
4. **Use auto-unseal in production** - Avoid manual unsealing
5. **Enable audit logging** - Track all Vault access
6. **Use TLS** - Configure proper certificates

## Troubleshooting

### Vault is sealed after restart

```bash
# Check status
vault status

# Unseal with keys
./scripts/unseal-vault.sh --interactive
```

### Token expired

```bash
# Create new token with admin policy
vault token create -policy=admin -ttl=24h
```

### Cannot connect to Vault

```bash
# Check container is running
docker ps | grep vault

# Check logs
docker logs gridwatch-vault

# Verify network
curl http://localhost:8200/v1/sys/health
```
