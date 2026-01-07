#!/bin/bash
# ===========================================
# NetNynja Enterprise - Vault Unseal Script
# ===========================================
# This script unseals Vault using Shamir key shares.
#
# Usage: ./unseal-vault.sh [OPTIONS]
#   --key KEY       Provide unseal key directly (can be used multiple times)
#   --keys-file F   Read keys from JSON file (vault-keys.json format)
#   --interactive   Prompt for keys interactively (default if no keys provided)

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Configuration
VAULT_ADDR="${VAULT_ADDR:-http://localhost:8200}"
UNSEAL_KEYS=()
KEYS_FILE=""
INTERACTIVE=false

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --key)
      UNSEAL_KEYS+=("$2")
      shift 2
      ;;
    --keys-file)
      KEYS_FILE="$2"
      shift 2
      ;;
    --interactive)
      INTERACTIVE=true
      shift
      ;;
    -h|--help)
      echo "Usage: $0 [OPTIONS]"
      echo "  --key KEY       Provide unseal key (can be used multiple times)"
      echo "  --keys-file F   Read keys from JSON file"
      echo "  --interactive   Prompt for keys interactively"
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

echo -e "${GREEN}NetNynja Enterprise - Vault Unseal${NC}"
echo "============================================"
echo ""
echo "Vault Address: $VAULT_ADDR"
echo ""

# Check if Vault is reachable
echo -e "${YELLOW}Checking Vault connectivity...${NC}"
if ! curl -s "$VAULT_ADDR/v1/sys/health" > /dev/null 2>&1; then
  echo -e "${RED}ERROR: Cannot reach Vault at $VAULT_ADDR${NC}"
  exit 1
fi

# Get current seal status
get_seal_status() {
  curl -s "$VAULT_ADDR/v1/sys/seal-status"
}

SEAL_STATUS=$(get_seal_status)
SEALED=$(echo "$SEAL_STATUS" | jq -r '.sealed')
THRESHOLD=$(echo "$SEAL_STATUS" | jq -r '.t')
PROGRESS=$(echo "$SEAL_STATUS" | jq -r '.progress')

if [ "$SEALED" = "false" ]; then
  echo -e "${GREEN}Vault is already unsealed!${NC}"
  exit 0
fi

echo -e "${CYAN}Vault is sealed.${NC}"
echo "Threshold: $THRESHOLD keys required"
echo "Progress: $PROGRESS keys provided"
echo ""

# Load keys from file if specified
if [ -n "$KEYS_FILE" ]; then
  if [ ! -f "$KEYS_FILE" ]; then
    echo -e "${RED}ERROR: Keys file not found: $KEYS_FILE${NC}"
    exit 1
  fi
  echo -e "${YELLOW}Loading keys from $KEYS_FILE...${NC}"
  while IFS= read -r key; do
    UNSEAL_KEYS+=("$key")
  done < <(jq -r '.keys_base64[]' "$KEYS_FILE")
fi

# If no keys provided and not interactive, default to interactive
if [ ${#UNSEAL_KEYS[@]} -eq 0 ]; then
  INTERACTIVE=true
fi

# Interactive mode
if [ "$INTERACTIVE" = true ] && [ ${#UNSEAL_KEYS[@]} -eq 0 ]; then
  echo -e "${YELLOW}Interactive mode: Enter unseal keys one at a time.${NC}"
  echo "Press Ctrl+C to cancel."
  echo ""
fi

# Unseal function
unseal_with_key() {
  local key="$1"
  local response
  response=$(curl -s -X PUT "$VAULT_ADDR/v1/sys/unseal" \
    -H "Content-Type: application/json" \
    -d "{\"key\": \"$key\"}")

  if echo "$response" | jq -e '.errors' > /dev/null 2>&1; then
    echo -e "${RED}ERROR: Invalid key${NC}"
    return 1
  fi

  local sealed
  sealed=$(echo "$response" | jq -r '.sealed')
  local progress
  progress=$(echo "$response" | jq -r '.progress')

  if [ "$sealed" = "false" ]; then
    echo -e "${GREEN}Vault unsealed successfully!${NC}"
    return 0
  else
    echo -e "${CYAN}Progress: $progress/$THRESHOLD keys${NC}"
    return 2
  fi
}

# Process provided keys
for key in "${UNSEAL_KEYS[@]}"; do
  echo -e "${YELLOW}Submitting unseal key...${NC}"
  result=$(unseal_with_key "$key") || true
  echo "$result"

  # Check if unsealed
  SEAL_STATUS=$(get_seal_status)
  SEALED=$(echo "$SEAL_STATUS" | jq -r '.sealed')
  if [ "$SEALED" = "false" ]; then
    break
  fi
done

# Interactive input if still sealed
if [ "$INTERACTIVE" = true ]; then
  while true; do
    SEAL_STATUS=$(get_seal_status)
    SEALED=$(echo "$SEAL_STATUS" | jq -r '.sealed')

    if [ "$SEALED" = "false" ]; then
      break
    fi

    PROGRESS=$(echo "$SEAL_STATUS" | jq -r '.progress')
    THRESHOLD=$(echo "$SEAL_STATUS" | jq -r '.t')

    echo ""
    echo -e "${CYAN}Progress: $PROGRESS/$THRESHOLD keys${NC}"
    read -rsp "Enter unseal key: " key
    echo ""

    if [ -z "$key" ]; then
      echo -e "${YELLOW}Empty key, skipping...${NC}"
      continue
    fi

    unseal_with_key "$key" || true
  done
fi

# Final status
echo ""
echo "============================================"
SEAL_STATUS=$(get_seal_status)
SEALED=$(echo "$SEAL_STATUS" | jq -r '.sealed')

if [ "$SEALED" = "false" ]; then
  echo -e "${GREEN}Vault is now UNSEALED and ready for use!${NC}"
  echo ""
  echo "Next steps:"
  echo "  1. Log in with: vault login <root-token>"
  echo "  2. Set up policies: ./setup-policies.sh"
  echo "  3. Configure secrets: ./setup-secrets.sh"
else
  PROGRESS=$(echo "$SEAL_STATUS" | jq -r '.progress')
  THRESHOLD=$(echo "$SEAL_STATUS" | jq -r '.t')
  echo -e "${YELLOW}Vault is still SEALED.${NC}"
  echo "Progress: $PROGRESS/$THRESHOLD keys provided"
  echo "Run this script again with more keys."
fi
