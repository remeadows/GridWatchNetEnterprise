#!/bin/bash
#
# NetNynja Enterprise - JWT RSA Key Generation Script
# Generates RS256 key pair for production JWT signing
#
# Usage:
#   ./generate-jwt-keys.sh [output_dir]
#
# Output:
#   - jwt-private.pem (RSA private key)
#   - jwt-public.pem (RSA public key)
#   - jwt-keys.env (Environment variables)
#

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Default output directory
OUTPUT_DIR="${1:-./keys}"

echo -e "${GREEN}NetNynja Enterprise - JWT RSA Key Generator${NC}"
echo "=============================================="
echo ""

# Create output directory
mkdir -p "$OUTPUT_DIR"

# Generate 4096-bit RSA key pair in PKCS#8 format (required by jose/JWT libraries)
echo -e "${YELLOW}Generating 4096-bit RSA key pair (PKCS#8 format)...${NC}"

# Generate private key in PKCS#8 format
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:4096 -out "$OUTPUT_DIR/jwt-private.pem" 2>/dev/null
if [ $? -ne 0 ]; then
    echo -e "${RED}Failed to generate private key${NC}"
    exit 1
fi

# Extract public key in SPKI format
openssl pkey -in "$OUTPUT_DIR/jwt-private.pem" -pubout -out "$OUTPUT_DIR/jwt-public.pem" 2>/dev/null
if [ $? -ne 0 ]; then
    echo -e "${RED}Failed to extract public key${NC}"
    exit 1
fi

# Set secure permissions
chmod 600 "$OUTPUT_DIR/jwt-private.pem"
chmod 644 "$OUTPUT_DIR/jwt-public.pem"

echo -e "${GREEN}Keys generated successfully!${NC}"
echo ""

# Read keys and format for environment variables
PRIVATE_KEY=$(cat "$OUTPUT_DIR/jwt-private.pem" | tr '\n' '\\' | sed 's/\\/\\n/g' | sed 's/\\n$//')
PUBLIC_KEY=$(cat "$OUTPUT_DIR/jwt-public.pem" | tr '\n' '\\' | sed 's/\\/\\n/g' | sed 's/\\n$//')

# Create environment file
cat > "$OUTPUT_DIR/jwt-keys.env" << EOF
# JWT RSA Keys - Generated $(date -u +"%Y-%m-%d %H:%M:%S UTC")
# IMPORTANT: Keep jwt-private.pem and this file secure!

# For environment variables (use in .env or docker-compose)
# Note: Keys are escaped for single-line format
JWT_PRIVATE_KEY="${PRIVATE_KEY}"
JWT_PUBLIC_KEY="${PUBLIC_KEY}"

# Algorithm configuration
JWT_ALGORITHM=RS256
EOF

chmod 600 "$OUTPUT_DIR/jwt-keys.env"

echo -e "${GREEN}Output files:${NC}"
echo "  - $OUTPUT_DIR/jwt-private.pem (private key - KEEP SECURE)"
echo "  - $OUTPUT_DIR/jwt-public.pem (public key - can be shared)"
echo "  - $OUTPUT_DIR/jwt-keys.env (environment variables)"
echo ""

# Vault instructions
echo -e "${YELLOW}To store in HashiCorp Vault:${NC}"
echo ""
echo "  # Store private key"
echo "  vault kv put secret/netnynja/jwt \\"
echo "    private_key=@$OUTPUT_DIR/jwt-private.pem \\"
echo "    public_key=@$OUTPUT_DIR/jwt-public.pem"
echo ""
echo "  # Or with CLI:"
echo "  vault kv put secret/netnynja/jwt \\"
echo "    private_key=\"\$(cat $OUTPUT_DIR/jwt-private.pem)\" \\"
echo "    public_key=\"\$(cat $OUTPUT_DIR/jwt-public.pem)\""
echo ""

# Docker Compose instructions
echo -e "${YELLOW}To use in Docker Compose:${NC}"
echo ""
echo "  # Option 1: Mount key files as secrets"
echo "  secrets:"
echo "    jwt_private_key:"
echo "      file: $OUTPUT_DIR/jwt-private.pem"
echo "    jwt_public_key:"
echo "      file: $OUTPUT_DIR/jwt-public.pem"
echo ""
echo "  # Option 2: Load from .env file"
echo "  # Copy the JWT_PRIVATE_KEY and JWT_PUBLIC_KEY from jwt-keys.env to your .env"
echo ""

# Security reminder
echo -e "${RED}SECURITY REMINDER:${NC}"
echo "  - NEVER commit jwt-private.pem to version control"
echo "  - NEVER share the private key"
echo "  - Rotate keys periodically (recommended: every 90 days)"
echo "  - Store securely in Vault for production"
echo ""

# Verify the keys work
echo -e "${YELLOW}Verifying keys...${NC}"
TEST_DATA="test-payload"
TEMP_SIG=$(mktemp)
echo -n "$TEST_DATA" | openssl dgst -sha256 -sign "$OUTPUT_DIR/jwt-private.pem" -out "$TEMP_SIG"
VERIFY_RESULT=$(echo -n "$TEST_DATA" | openssl dgst -sha256 -verify "$OUTPUT_DIR/jwt-public.pem" -signature "$TEMP_SIG" 2>&1)
rm -f "$TEMP_SIG"

if [ "$VERIFY_RESULT" = "Verified OK" ]; then
    echo -e "${GREEN}Key verification successful!${NC}"
else
    echo -e "${RED}Key verification failed: $VERIFY_RESULT${NC}"
    exit 1
fi

echo ""
echo -e "${GREEN}Done! Your JWT RSA keys are ready.${NC}"
