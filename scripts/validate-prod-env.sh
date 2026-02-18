#!/usr/bin/env bash
# GridWatch NetEnterprise - Production Environment Validator
# Run this BEFORE starting production containers.
#
# Usage:
#   ./scripts/validate-prod-env.sh [--env-file .env]
#
# Exit codes:
#   0 = All checks passed
#   1 = Critical validation failure (DO NOT DEPLOY)

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

ERRORS=0
WARNINGS=0
ENV_FILE="${1:-.env}"

echo "============================================"
echo " GridWatch NetEnterprise — Production Validator"
echo "============================================"
echo ""

# Load .env if it exists
if [[ -f "$ENV_FILE" ]]; then
    echo "Loading environment from: $ENV_FILE"
    set -a
    # shellcheck source=/dev/null
    source "$ENV_FILE"
    set +a
else
    echo -e "${YELLOW}WARNING: No .env file found at $ENV_FILE${NC}"
    echo "Relying on exported environment variables."
    WARNINGS=$((WARNINGS + 1))
fi

echo ""
echo "--- Checking Required Secrets ---"

# JWT_SECRET: must be set and >= 32 characters
check_secret() {
    local name="$1"
    local min_length="${2:-1}"
    local value="${!name:-}"

    if [[ -z "$value" ]]; then
        echo -e "${RED}FAIL: $name is not set${NC}"
        ERRORS=$((ERRORS + 1))
        return
    fi

    if [[ ${#value} -lt $min_length ]]; then
        echo -e "${RED}FAIL: $name is too short (${#value} chars, minimum $min_length)${NC}"
        ERRORS=$((ERRORS + 1))
        return
    fi

    echo -e "${GREEN}PASS: $name is set (${#value} chars)${NC}"
}

# Check known dangerous defaults
check_not_default() {
    local name="$1"
    shift
    local value="${!name:-}"

    for default_val in "$@"; do
        if [[ "$value" == "$default_val" ]]; then
            echo -e "${RED}FAIL: $name is using a development default value — CHANGE IMMEDIATELY${NC}"
            ERRORS=$((ERRORS + 1))
            return
        fi
    done
}

# Required secrets with minimum lengths
check_secret "POSTGRES_PASSWORD" 12
check_secret "REDIS_PASSWORD" 8
check_secret "JWT_SECRET" 32
check_secret "CREDENTIAL_ENCRYPTION_KEY" 32
check_secret "VAULT_TOKEN" 8
check_secret "GRAFANA_PASSWORD" 8

echo ""
echo "--- Checking for Development Defaults ---"

check_not_default "JWT_SECRET" "GridWatch-dev-jwt-secret-2025" "dev-jwt-secret-change-in-production" "changeme"
check_not_default "CREDENTIAL_ENCRYPTION_KEY" "GridWatch-dev-encryption-key-32ch" "changeme"
check_not_default "VAULT_TOKEN" "GridWatch-dev-token" "dev-only-token" "root"
check_not_default "POSTGRES_PASSWORD" "changeme_in_production" "changeme" "postgres" "password"
check_not_default "GRAFANA_PASSWORD" "admin" "changeme" "password"

echo ""
echo "--- Checking Vault Configuration ---"

# Vault should NOT be in dev mode for production
VAULT_DEV_TOKEN="${VAULT_DEV_TOKEN:-}"
VAULT_DEV_ROOT_TOKEN_ID="${VAULT_DEV_ROOT_TOKEN_ID:-}"

if [[ -n "$VAULT_DEV_TOKEN" ]]; then
    echo -e "${RED}FAIL: VAULT_DEV_TOKEN is set — Vault dev mode is NOT safe for production${NC}"
    ERRORS=$((ERRORS + 1))
else
    echo -e "${GREEN}PASS: VAULT_DEV_TOKEN is not set${NC}"
fi

if [[ -n "$VAULT_DEV_ROOT_TOKEN_ID" ]]; then
    echo -e "${RED}FAIL: VAULT_DEV_ROOT_TOKEN_ID is set — remove for production${NC}"
    ERRORS=$((ERRORS + 1))
else
    echo -e "${GREEN}PASS: VAULT_DEV_ROOT_TOKEN_ID is not set${NC}"
fi

echo ""
echo "--- Checking Environment Mode ---"

NODE_ENV="${NODE_ENV:-}"
ENVIRONMENT="${ENVIRONMENT:-}"

if [[ "$NODE_ENV" == "development" ]]; then
    echo -e "${RED}FAIL: NODE_ENV is set to 'development' — must be 'production'${NC}"
    ERRORS=$((ERRORS + 1))
elif [[ "$NODE_ENV" == "production" ]]; then
    echo -e "${GREEN}PASS: NODE_ENV = production${NC}"
else
    echo -e "${YELLOW}WARN: NODE_ENV is '${NODE_ENV:-unset}' — expected 'production'${NC}"
    WARNINGS=$((WARNINGS + 1))
fi

echo ""
echo "--- Checking SSH Security ---"

STIG_SSH_STRICT_HOST_KEY="${STIG_SSH_STRICT_HOST_KEY:-true}"
if [[ "$STIG_SSH_STRICT_HOST_KEY" != "true" ]]; then
    echo -e "${YELLOW}WARN: STIG_SSH_STRICT_HOST_KEY is '$STIG_SSH_STRICT_HOST_KEY' — host key verification disabled${NC}"
    WARNINGS=$((WARNINGS + 1))
else
    echo -e "${GREEN}PASS: SSH host key verification enabled${NC}"
fi

echo ""
echo "--- Checking CORS ---"

CORS_ORIGIN="${CORS_ORIGIN:-}"
if [[ "$CORS_ORIGIN" == "true" ]] || [[ "$CORS_ORIGIN" == "*" ]]; then
    echo -e "${YELLOW}WARN: CORS_ORIGIN is '$CORS_ORIGIN' — should be restricted in production${NC}"
    WARNINGS=$((WARNINGS + 1))
else
    echo -e "${GREEN}PASS: CORS_ORIGIN = ${CORS_ORIGIN:-'(not set)'}${NC}"
fi

echo ""
echo "============================================"
echo " RESULTS"
echo "============================================"
echo ""

if [[ $ERRORS -gt 0 ]]; then
    echo -e "${RED}FAILED: $ERRORS critical error(s), $WARNINGS warning(s)${NC}"
    echo -e "${RED}DO NOT DEPLOY — fix all errors before starting production containers.${NC}"
    exit 1
else
    if [[ $WARNINGS -gt 0 ]]; then
        echo -e "${YELLOW}PASSED with $WARNINGS warning(s) — review before deploying.${NC}"
    else
        echo -e "${GREEN}ALL CHECKS PASSED — safe to deploy.${NC}"
    fi
    exit 0
fi
