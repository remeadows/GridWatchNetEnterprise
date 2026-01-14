#!/bin/bash
# Generate TLS certificates for NATS production deployment
# Usage: ./infrastructure/scripts/generate-nats-certs.sh

set -e

CERT_DIR="./infrastructure/nats/certs"
VALIDITY_DAYS=365

echo "Generating NATS TLS certificates..."

# Create certificate directory
mkdir -p "$CERT_DIR"

# Generate CA private key
openssl genrsa -out "$CERT_DIR/ca.key" 4096

# Generate CA certificate
openssl req -new -x509 -days $VALIDITY_DAYS -key "$CERT_DIR/ca.key" \
    -out "$CERT_DIR/ca.crt" \
    -subj "/C=US/ST=State/L=City/O=NetNynja/OU=Infrastructure/CN=NetNynja NATS CA"

# Generate server private key
openssl genrsa -out "$CERT_DIR/server.key" 2048

# Generate server certificate signing request
openssl req -new -key "$CERT_DIR/server.key" \
    -out "$CERT_DIR/server.csr" \
    -subj "/C=US/ST=State/L=City/O=NetNynja/OU=Infrastructure/CN=netnynja-nats"

# Create SAN extension file for server certificate
cat > "$CERT_DIR/server.ext" << EOF
authorityKeyIdentifier=keyid,issuer
basicConstraints=CA:FALSE
keyUsage = digitalSignature, nonRepudiation, keyEncipherment, dataEncipherment
subjectAltName = @alt_names

[alt_names]
DNS.1 = localhost
DNS.2 = nats
DNS.3 = netnynja-nats
IP.1 = 127.0.0.1
EOF

# Generate server certificate signed by CA
openssl x509 -req -in "$CERT_DIR/server.csr" \
    -CA "$CERT_DIR/ca.crt" -CAkey "$CERT_DIR/ca.key" \
    -CAcreateserial -out "$CERT_DIR/server.crt" \
    -days $VALIDITY_DAYS -extfile "$CERT_DIR/server.ext"

# Clean up CSR and extension files
rm -f "$CERT_DIR/server.csr" "$CERT_DIR/server.ext"

# Set secure permissions
chmod 600 "$CERT_DIR"/*.key
chmod 644 "$CERT_DIR"/*.crt

echo ""
echo "NATS TLS certificates generated successfully!"
echo "Location: $CERT_DIR"
echo ""
echo "Files created:"
echo "  - ca.crt     : CA certificate (distribute to clients)"
echo "  - ca.key     : CA private key (keep secure)"
echo "  - server.crt : Server certificate"
echo "  - server.key : Server private key"
echo ""
echo "Next steps:"
echo "  1. Set NATS_PASSWORD in your .env file"
echo "  2. Use docker-compose.prod.yml for production deployment"
echo "  3. Mount certificates to /certs in the NATS container"
