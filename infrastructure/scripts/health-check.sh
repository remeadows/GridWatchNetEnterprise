#!/bin/bash
# GridWatch NetEnterprise - Infrastructure Health Check
# Verifies all infrastructure services are healthy

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
TIMEOUT=5
RETRIES=3

echo "============================================"
echo "GridWatch NetEnterprise - Health Check"
echo "============================================"
echo ""

# Track overall status
OVERALL_STATUS=0

check_service() {
    local name=$1
    local check_cmd=$2
    local status=0
    
    printf "%-20s" "$name"
    
    for i in $(seq 1 $RETRIES); do
        if eval "$check_cmd" &>/dev/null; then
            echo -e "${GREEN}✓ Healthy${NC}"
            return 0
        fi
        sleep 1
    done
    
    echo -e "${RED}✗ Unhealthy${NC}"
    OVERALL_STATUS=1
    return 1
}

check_port() {
    local host=$1
    local port=$2
    timeout $TIMEOUT bash -c "cat < /dev/null > /dev/tcp/$host/$port" 2>/dev/null
}

echo "Infrastructure Services:"
echo "------------------------"

# PostgreSQL
check_service "PostgreSQL" "docker exec GridWatch-postgres pg_isready -U GridWatch" || true

# Redis
check_service "Redis" "docker exec GridWatch-redis redis-cli -a \${REDIS_PASSWORD:-redis} ping" || true

# NATS
check_service "NATS" "curl -sf http://localhost:8222/healthz" || true

# Vault
check_service "Vault" "curl -sf http://localhost:8200/v1/sys/health" || true

echo ""
echo "Observability Stack:"
echo "--------------------"

# VictoriaMetrics
check_service "VictoriaMetrics" "curl -sf http://localhost:8428/health" || true

# Prometheus
check_service "Prometheus" "curl -sf http://localhost:9090/-/healthy" || true

# Loki
check_service "Loki" "curl -sf http://localhost:3100/ready" || true

# Grafana
check_service "Grafana" "curl -sf http://localhost:3000/api/health" || true

# Jaeger
check_service "Jaeger" "curl -sf http://localhost:16686/" || true

echo ""
echo "Application Services:"
echo "---------------------"

# API Gateway
check_service "Gateway" "curl -sf http://localhost:3001/health" || true

# Web UI
check_service "Web UI" "curl -sf http://localhost:5173/" || true

echo ""
echo "============================================"

if [ $OVERALL_STATUS -eq 0 ]; then
    echo -e "${GREEN}All services healthy!${NC}"
else
    echo -e "${YELLOW}Some services are unhealthy. Check logs with:${NC}"
    echo "  docker compose logs [service-name]"
fi

echo "============================================"

exit $OVERALL_STATUS
