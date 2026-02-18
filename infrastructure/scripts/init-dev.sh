#!/bin/bash
# GridWatch NetEnterprise - Development Environment Setup
# Initializes all services and creates necessary configurations

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

echo "============================================"
echo "GridWatch NetEnterprise - Environment Setup"
echo "============================================"
echo ""

# Check prerequisites
log_info "Checking prerequisites..."

# Docker
if ! command -v docker &>/dev/null; then
    log_error "Docker is not installed. Please install Docker first."
    exit 1
fi
log_success "Docker found: $(docker --version)"

# Docker Compose
if ! docker compose version &>/dev/null; then
    log_error "Docker Compose V2 is not available."
    exit 1
fi
log_success "Docker Compose found: $(docker compose version --short)"

# Node.js
if ! command -v node &>/dev/null; then
    log_warn "Node.js not found. Required for TypeScript development."
else
    NODE_VERSION=$(node --version)
    if [[ ! "$NODE_VERSION" =~ ^v2[0-9] ]]; then
        log_warn "Node.js $NODE_VERSION found. Recommended: v20+"
    else
        log_success "Node.js found: $NODE_VERSION"
    fi
fi

# Python
if ! command -v python3 &>/dev/null; then
    log_warn "Python 3 not found. Required for Python services."
else
    PYTHON_VERSION=$(python3 --version)
    log_success "Python found: $PYTHON_VERSION"
fi

# Poetry
if ! command -v poetry &>/dev/null; then
    log_warn "Poetry not found. Install with: curl -sSL https://install.python-poetry.org | python3 -"
else
    log_success "Poetry found: $(poetry --version)"
fi

echo ""

# Create .env from example if not exists
log_info "Setting up environment..."
if [ ! -f "$PROJECT_ROOT/.env" ]; then
    if [ -f "$PROJECT_ROOT/.env.example" ]; then
        cp "$PROJECT_ROOT/.env.example" "$PROJECT_ROOT/.env"
        log_warn ".env created from .env.example - PLEASE UPDATE PASSWORDS!"
        
        # Generate random passwords for development
        if command -v openssl &>/dev/null; then
            POSTGRES_PWD=$(openssl rand -base64 24 | tr -dc 'a-zA-Z0-9' | head -c 24)
            REDIS_PWD=$(openssl rand -base64 24 | tr -dc 'a-zA-Z0-9' | head -c 24)
            GRAFANA_PWD=$(openssl rand -base64 24 | tr -dc 'a-zA-Z0-9' | head -c 24)
            JWT_SECRET=$(openssl rand -base64 64)
            
            sed -i.bak "s/POSTGRES_PASSWORD=CHANGE_ME_STRONG_PASSWORD/POSTGRES_PASSWORD=$POSTGRES_PWD/" "$PROJECT_ROOT/.env"
            sed -i.bak "s/REDIS_PASSWORD=CHANGE_ME_STRONG_PASSWORD/REDIS_PASSWORD=$REDIS_PWD/" "$PROJECT_ROOT/.env"
            sed -i.bak "s/GRAFANA_PASSWORD=CHANGE_ME_STRONG_PASSWORD/GRAFANA_PASSWORD=$GRAFANA_PWD/" "$PROJECT_ROOT/.env"
            sed -i.bak "s|JWT_SECRET=CHANGE_ME_GENERATE_RANDOM_64_CHAR_STRING|JWT_SECRET=$JWT_SECRET|" "$PROJECT_ROOT/.env"
            rm -f "$PROJECT_ROOT/.env.bak"
            
            log_success "Generated random development passwords"
        fi
    else
        log_error ".env.example not found!"
        exit 1
    fi
else
    log_info ".env already exists"
fi

echo ""

# Create SSL directory with placeholder
log_info "Setting up SSL certificates..."
mkdir -p "$PROJECT_ROOT/infrastructure/nginx/ssl"
touch "$PROJECT_ROOT/infrastructure/nginx/ssl/.gitkeep"

# Generate self-signed certificate for development
if [ ! -f "$PROJECT_ROOT/infrastructure/nginx/ssl/server.crt" ]; then
    if command -v openssl &>/dev/null; then
        openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
            -keyout "$PROJECT_ROOT/infrastructure/nginx/ssl/server.key" \
            -out "$PROJECT_ROOT/infrastructure/nginx/ssl/server.crt" \
            -subj "/C=US/ST=Dev/L=Local/O=GridWatch/CN=localhost" \
            2>/dev/null
        log_success "Generated self-signed SSL certificate"
    else
        log_warn "OpenSSL not found. Cannot generate SSL certificates."
    fi
fi

echo ""

# Pull Docker images
log_info "Pulling Docker images (this may take a while)..."
cd "$PROJECT_ROOT"
docker compose pull --ignore-pull-failures 2>/dev/null || true
log_success "Docker images pulled"

echo ""

# Start infrastructure services
log_info "Starting infrastructure services..."
docker compose --profile infra up -d

# Wait for services to be healthy
log_info "Waiting for services to be healthy..."
sleep 10

# Initialize NATS streams
log_info "Initializing NATS JetStream streams..."
if [ -f "$PROJECT_ROOT/infrastructure/nats/init-streams.sh" ]; then
    # Check if nats CLI is available (might need to run in container)
    if command -v nats &>/dev/null; then
        bash "$PROJECT_ROOT/infrastructure/nats/init-streams.sh" || log_warn "NATS stream initialization had issues"
    else
        log_warn "NATS CLI not installed. Run init-streams.sh manually when available."
    fi
fi

echo ""

# Install Node.js dependencies
if command -v npm &>/dev/null && [ -f "$PROJECT_ROOT/package.json" ]; then
    log_info "Installing Node.js dependencies..."
    cd "$PROJECT_ROOT"
    npm install 2>/dev/null || log_warn "npm install had issues"
    log_success "Node.js dependencies installed"
fi

echo ""

# Install Python dependencies
if command -v poetry &>/dev/null && [ -f "$PROJECT_ROOT/pyproject.toml" ]; then
    log_info "Installing Python dependencies..."
    cd "$PROJECT_ROOT"
    poetry install 2>/dev/null || log_warn "poetry install had issues"
    log_success "Python dependencies installed"
fi

echo ""

# Run health check
log_info "Running health check..."
bash "$PROJECT_ROOT/infrastructure/scripts/health-check.sh" || true

echo ""
echo "============================================"
log_success "Development environment setup complete!"
echo "============================================"
echo ""
echo "Next steps:"
echo "  1. Review and update passwords in .env"
echo "  2. Start all services: docker compose up -d"
echo "  3. Access Grafana: http://localhost:3000"
echo "  4. Access NATS monitoring: http://localhost:8222"
echo "  5. Start gateway: npm run dev -w apps/gateway"
echo "  6. Start web UI: npm run dev -w apps/web-ui"
echo ""
