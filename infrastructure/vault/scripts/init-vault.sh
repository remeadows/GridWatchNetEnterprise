#!/bin/bash
# ===========================================
# NetNynja Enterprise - Vault Initialization Script
# ===========================================
# This script initializes Vault with Shamir key shares and
# stores the unseal keys and root token securely.
#
# IMPORTANT: Run this ONLY ONCE on a new Vault installation.
# Store the generated keys securely - they cannot be recovered!
#
# Usage: ./init-vault.sh [OPTIONS]
#   --shares N      Number of key shares to generate (default: 5)
#   --threshold N   Number of shares needed to unseal (default: 3)
#   --output FILE   Output file for keys (default: ./vault-keys.json)

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Default configuration
VAULT_ADDR="${VAULT_ADDR:-http://localhost:8200}"
KEY_SHARES=5
KEY_THRESHOLD=3
OUTPUT_FILE="./vault-keys.json"

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --shares)
      KEY_SHARES="$2"
      shift 2
      ;;
    --threshold)
      KEY_THRESHOLD="$2"
      shift 2
      ;;
    --output)
      OUTPUT_FILE="$2"
      shift 2
      ;;
    -h|--help)
      echo "Usage: $0 [OPTIONS]"
      echo "  --shares N      Number of key shares (default: 5)"
      echo "  --threshold N   Shares needed to unseal (default: 3)"
      echo "  --output FILE   Output file for keys"
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

echo -e "${GREEN}NetNynja Enterprise - Vault Initialization${NC}"
echo "============================================"
echo ""
echo "Vault Address: $VAULT_ADDR"
echo "Key Shares: $KEY_SHARES"
echo "Key Threshold: $KEY_THRESHOLD"
echo "Output File: $OUTPUT_FILE"
echo ""

# Check if Vault is reachable
echo -e "${YELLOW}Checking Vault connectivity...${NC}"
if ! curl -s "$VAULT_ADDR/v1/sys/health" > /dev/null 2>&1; then
  echo -e "${RED}ERROR: Cannot reach Vault at $VAULT_ADDR${NC}"
  echo "Make sure Vault is running and VAULT_ADDR is set correctly."
  exit 1
fi

# Check if Vault is already initialized
INIT_STATUS=$(curl -s "$VAULT_ADDR/v1/sys/init" | jq -r '.initialized')
if [ "$INIT_STATUS" = "true" ]; then
  echo -e "${YELLOW}Vault is already initialized.${NC}"
  echo "If you need to reinitialize, you must first destroy all data."
  exit 0
fi

echo -e "${YELLOW}Initializing Vault...${NC}"
echo ""

# Initialize Vault
INIT_RESPONSE=$(curl -s -X PUT "$VAULT_ADDR/v1/sys/init" \
  -H "Content-Type: application/json" \
  -d "{
    \"secret_shares\": $KEY_SHARES,
    \"secret_threshold\": $KEY_THRESHOLD
  }")

# Check for errors
if echo "$INIT_RESPONSE" | jq -e '.errors' > /dev/null 2>&1; then
  echo -e "${RED}ERROR: Vault initialization failed${NC}"
  echo "$INIT_RESPONSE" | jq '.errors'
  exit 1
fi

# Save the keys
echo "$INIT_RESPONSE" > "$OUTPUT_FILE"
chmod 600 "$OUTPUT_FILE"

# Extract and display information
ROOT_TOKEN=$(echo "$INIT_RESPONSE" | jq -r '.root_token')
UNSEAL_KEYS=$(echo "$INIT_RESPONSE" | jq -r '.keys_base64[]')

echo -e "${GREEN}Vault initialized successfully!${NC}"
echo ""
echo "============================================"
echo -e "${RED}CRITICAL: SAVE THESE KEYS SECURELY!${NC}"
echo "============================================"
echo ""
echo "Root Token: $ROOT_TOKEN"
echo ""
echo "Unseal Keys (base64):"
i=1
for key in $UNSEAL_KEYS; do
  echo "  Key $i: $key"
  ((i++))
done
echo ""
echo -e "${YELLOW}Keys saved to: $OUTPUT_FILE${NC}"
echo ""
echo "============================================"
echo -e "${RED}SECURITY WARNINGS:${NC}"
echo "============================================"
echo "1. Store each unseal key with a different person/location"
echo "2. Store the root token separately from unseal keys"
echo "3. Delete $OUTPUT_FILE after distributing keys"
echo "4. Consider using auto-unseal in production"
echo ""

# Check seal status
SEAL_STATUS=$(curl -s "$VAULT_ADDR/v1/sys/seal-status" | jq -r '.sealed')
echo -e "${YELLOW}Current seal status: $SEAL_STATUS${NC}"
echo ""

if [ "$SEAL_STATUS" = "true" ]; then
  echo "To unseal Vault, run: ./unseal-vault.sh"
  echo "You will need $KEY_THRESHOLD of $KEY_SHARES keys to unseal."
fi

echo ""
echo -e "${GREEN}Initialization complete!${NC}"
