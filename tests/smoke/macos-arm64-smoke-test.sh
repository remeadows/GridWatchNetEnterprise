#!/usr/bin/env bash
# GridWatch NetEnterprise - macOS ARM64 Smoke Test Suite
# Phase 8: Cross-Platform Testing
#
# Usage: ./tests/smoke/macos-arm64-smoke-test.sh [--profile PROFILE]
# Profiles: infra, ipam, npm, stig, all (default: infra)

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
PROFILE="${1:-infra}"
TIMEOUT_SECONDS=120
RESULTS_FILE="$PROJECT_ROOT/tests/smoke/results/macos-arm64-$(date +%Y%m%d-%H%M%S).json"

# Test counters
TESTS_PASSED=0
TESTS_FAILED=0
TESTS_SKIPPED=0
declare -a TEST_RESULTS=()

# Ensure results directory exists
mkdir -p "$(dirname "$RESULTS_FILE")"

# Logging functions
log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_pass() { echo -e "${GREEN}[PASS]${NC} $1"; ((TESTS_PASSED++)); TEST_RESULTS+=("{\"test\":\"$1\",\"status\":\"pass\"}"); }
log_fail() { echo -e "${RED}[FAIL]${NC} $1: $2"; ((TESTS_FAILED++)); TEST_RESULTS+=("{\"test\":\"$1\",\"status\":\"fail\",\"error\":\"$2\"}"); }
log_skip() { echo -e "${YELLOW}[SKIP]${NC} $1: $2"; ((TESTS_SKIPPED++)); TEST_RESULTS+=("{\"test\":\"$1\",\"status\":\"skip\",\"reason\":\"$2\"}"); }
log_section() { echo -e "\n${BLUE}========================================${NC}"; echo -e "${BLUE}$1${NC}"; echo -e "${BLUE}========================================${NC}"; }

# Helper to wait for service health
wait_for_health() {
    local url=$1
    local name=$2
    local max_attempts=${3:-30}
    local attempt=1

    while [ $attempt -le $max_attempts ]; do
        if curl -sf "$url" > /dev/null 2>&1; then
            return 0
        fi
        sleep 2
        ((attempt++))
    done
    return 1
}

# Helper to check HTTP status
check_http_status() {
    local url=$1
    local expected=${2:-200}
    local actual
    actual=$(curl -s -o /dev/null -w "%{http_code}" "$url" 2>/dev/null || echo "000")
    [ "$actual" = "$expected" ]
}

# ===========================================
# SECTION 1: Environment Prerequisites
# ===========================================
test_prerequisites() {
    log_section "Section 1: Environment Prerequisites"

    # Test 1.1: macOS ARM64 Architecture
    if [ "$(uname -m)" = "arm64" ] && [ "$(uname -s)" = "Darwin" ]; then
        log_pass "1.1 macOS ARM64 architecture detected"
    else
        log_fail "1.1 macOS ARM64 architecture" "Expected arm64/Darwin, got $(uname -m)/$(uname -s)"
    fi

    # Test 1.2: Docker installed
    if command -v docker &> /dev/null; then
        local docker_version
        docker_version=$(docker --version | awk '{print $3}' | tr -d ',')
        log_pass "1.2 Docker installed (v$docker_version)"
    else
        log_fail "1.2 Docker installed" "Docker not found in PATH"
        return 1
    fi

    # Test 1.3: Docker Compose installed
    if docker compose version &> /dev/null; then
        local compose_version
        compose_version=$(docker compose version --short)
        log_pass "1.3 Docker Compose installed (v$compose_version)"
    else
        log_fail "1.3 Docker Compose installed" "Docker Compose not found"
        return 1
    fi

    # Test 1.4: Docker daemon running
    if docker info &> /dev/null; then
        log_pass "1.4 Docker daemon running"
    else
        log_fail "1.4 Docker daemon running" "Cannot connect to Docker daemon"
        return 1
    fi

    # Test 1.5: Docker architecture (should be aarch64 for ARM64)
    local docker_arch
    docker_arch=$(docker info --format '{{.Architecture}}')
    if [ "$docker_arch" = "aarch64" ]; then
        log_pass "1.5 Docker architecture is ARM64 ($docker_arch)"
    else
        log_fail "1.5 Docker architecture" "Expected aarch64, got $docker_arch"
    fi

    # Test 1.6: .env file exists
    if [ -f "$PROJECT_ROOT/.env" ]; then
        log_pass "1.6 .env file exists"
    else
        log_fail "1.6 .env file exists" "Missing .env file"
        return 1
    fi

    # Test 1.7: Node.js installed (for gateway builds)
    if command -v node &> /dev/null; then
        local node_version
        node_version=$(node --version)
        log_pass "1.7 Node.js installed ($node_version)"
    else
        log_skip "1.7 Node.js installed" "Optional - not required for Docker-only testing"
    fi

    # Test 1.8: Python installed (for backend builds)
    if command -v python3 &> /dev/null; then
        local python_version
        python_version=$(python3 --version | awk '{print $2}')
        log_pass "1.8 Python installed (v$python_version)"
    else
        log_skip "1.8 Python installed" "Optional - not required for Docker-only testing"
    fi

    # Test 1.9: curl available
    if command -v curl &> /dev/null; then
        log_pass "1.9 curl installed"
    else
        log_fail "1.9 curl installed" "curl is required for health checks"
        return 1
    fi

    # Test 1.10: Sufficient disk space (>5GB free)
    local free_space_gb
    free_space_gb=$(df -g "$PROJECT_ROOT" | tail -1 | awk '{print $4}')
    if [ "$free_space_gb" -ge 5 ]; then
        log_pass "1.10 Sufficient disk space (${free_space_gb}GB free)"
    else
        log_fail "1.10 Sufficient disk space" "Only ${free_space_gb}GB free, need 5GB+"
    fi
}

# ===========================================
# SECTION 2: Infrastructure Services
# ===========================================
test_infrastructure() {
    log_section "Section 2: Infrastructure Services"

    cd "$PROJECT_ROOT"

    # Clean up any existing containers
    log_info "Cleaning up existing containers..."
    docker compose --profile infra down -v 2>/dev/null || true

    # Test 2.1: Docker Compose config validation
    if docker compose --profile infra config > /dev/null 2>&1; then
        log_pass "2.1 Docker Compose configuration valid"
    else
        log_fail "2.1 Docker Compose configuration" "Invalid compose file"
        return 1
    fi

    # Test 2.2: Start infrastructure services
    log_info "Starting infrastructure services (this may take a few minutes)..."
    if docker compose --profile infra up -d 2>&1; then
        log_pass "2.2 Infrastructure services started"
    else
        log_fail "2.2 Infrastructure services started" "Failed to start services"
        return 1
    fi

    # Wait for services to be healthy
    log_info "Waiting for services to become healthy..."
    sleep 15

    # Test 2.3: PostgreSQL health
    if docker exec GridWatch-postgres pg_isready -U GridWatch > /dev/null 2>&1; then
        log_pass "2.3 PostgreSQL healthy"
    else
        log_fail "2.3 PostgreSQL healthy" "pg_isready failed"
    fi

    # Test 2.4: PostgreSQL schemas created
    local schema_count
    schema_count=$(docker exec GridWatch-postgres psql -U GridWatch -d GridWatch -t -c "SELECT COUNT(*) FROM information_schema.schemata WHERE schema_name IN ('shared', 'ipam', 'npm', 'stig');" 2>/dev/null | tr -d ' ')
    if [ "$schema_count" = "4" ]; then
        log_pass "2.4 PostgreSQL schemas created (shared, ipam, npm, stig)"
    else
        log_fail "2.4 PostgreSQL schemas created" "Expected 4 schemas, found $schema_count"
    fi

    # Test 2.5: Redis health
    if docker exec GridWatch-redis redis-cli -a redis-dev-2025 ping 2>/dev/null | grep -q PONG; then
        log_pass "2.5 Redis healthy"
    else
        log_fail "2.5 Redis healthy" "Redis ping failed"
    fi

    # Test 2.6: NATS health
    if curl -sf http://localhost:8222/healthz > /dev/null 2>&1; then
        log_pass "2.6 NATS healthy"
    else
        log_fail "2.6 NATS healthy" "NATS health endpoint failed"
    fi

    # Test 2.7: NATS JetStream enabled
    local jetstream_status
    jetstream_status=$(curl -sf http://localhost:8222/jsz 2>/dev/null | grep -o '"disabled":false' || echo "")
    if [ -n "$jetstream_status" ]; then
        log_pass "2.7 NATS JetStream enabled"
    else
        log_fail "2.7 NATS JetStream enabled" "JetStream not enabled"
    fi

    # Test 2.8: Vault health
    if curl -sf http://localhost:8200/v1/sys/health > /dev/null 2>&1; then
        log_pass "2.8 Vault healthy"
    else
        log_fail "2.8 Vault healthy" "Vault health endpoint failed"
    fi

    # Test 2.9: Vault unsealed (dev mode)
    local vault_sealed
    vault_sealed=$(curl -sf http://localhost:8200/v1/sys/health 2>/dev/null | grep -o '"sealed":false' || echo "")
    if [ -n "$vault_sealed" ]; then
        log_pass "2.9 Vault unsealed"
    else
        log_fail "2.9 Vault unsealed" "Vault is sealed"
    fi

    # Test 2.10: Prometheus health
    if curl -sf http://localhost:9090/-/healthy > /dev/null 2>&1; then
        log_pass "2.10 Prometheus healthy"
    else
        log_fail "2.10 Prometheus healthy" "Prometheus health endpoint failed"
    fi

    # Test 2.11: Loki health
    if curl -sf http://localhost:3100/ready > /dev/null 2>&1; then
        log_pass "2.11 Loki healthy"
    else
        log_fail "2.11 Loki healthy" "Loki ready endpoint failed"
    fi

    # Test 2.12: VictoriaMetrics health
    if curl -sf http://localhost:8428/health > /dev/null 2>&1; then
        log_pass "2.12 VictoriaMetrics healthy"
    else
        log_fail "2.12 VictoriaMetrics healthy" "VictoriaMetrics health endpoint failed"
    fi

    # Test 2.13: Jaeger health
    if curl -sf http://localhost:16686/ > /dev/null 2>&1; then
        log_pass "2.13 Jaeger UI accessible"
    else
        log_fail "2.13 Jaeger UI accessible" "Jaeger UI failed"
    fi

    # Test 2.14: Grafana health
    if wait_for_health "http://localhost:3000/api/health" "Grafana" 30; then
        log_pass "2.14 Grafana healthy"
    else
        log_fail "2.14 Grafana healthy" "Grafana health endpoint failed"
    fi

    # Test 2.15: Grafana login works
    if curl -sf -u admin:grafana-dev-2025 http://localhost:3000/api/org > /dev/null 2>&1; then
        log_pass "2.15 Grafana authentication works"
    else
        log_fail "2.15 Grafana authentication" "Login failed"
    fi

    # Test 2.16: Docker network created
    if docker network inspect GridWatch-network > /dev/null 2>&1; then
        log_pass "2.16 Docker network 'GridWatch-network' created"
    else
        log_fail "2.16 Docker network" "Network not found"
    fi

    # Test 2.17: Check container logs for errors
    local error_count
    error_count=$(docker compose --profile infra logs 2>&1 | grep -ci "error\|fatal\|panic" || echo "0")
    if [ "$error_count" -lt 5 ]; then
        log_pass "2.17 Container logs clean (< 5 errors)"
    else
        log_fail "2.17 Container logs" "Found $error_count error/fatal/panic messages"
    fi
}

# ===========================================
# SECTION 3: Network Connectivity
# ===========================================
test_network_connectivity() {
    log_section "Section 3: Network Connectivity"

    # Test 3.1: Inter-container DNS resolution (postgres)
    if docker run --rm --network GridWatch-network alpine nslookup postgres > /dev/null 2>&1; then
        log_pass "3.1 DNS resolution for 'postgres'"
    else
        log_fail "3.1 DNS resolution" "Cannot resolve 'postgres'"
    fi

    # Test 3.2: Inter-container DNS resolution (redis)
    if docker run --rm --network GridWatch-network alpine nslookup redis > /dev/null 2>&1; then
        log_pass "3.2 DNS resolution for 'redis'"
    else
        log_fail "3.2 DNS resolution" "Cannot resolve 'redis'"
    fi

    # Test 3.3: Inter-container DNS resolution (nats)
    if docker run --rm --network GridWatch-network alpine nslookup nats > /dev/null 2>&1; then
        log_pass "3.3 DNS resolution for 'nats'"
    else
        log_fail "3.3 DNS resolution" "Cannot resolve 'nats'"
    fi

    # Test 3.4: Host can reach postgres on mapped port
    if nc -z localhost 5433 2>/dev/null; then
        log_pass "3.4 PostgreSQL accessible on localhost:5433"
    else
        log_fail "3.4 PostgreSQL port mapping" "Cannot connect to localhost:5433"
    fi

    # Test 3.5: Host can reach redis on mapped port
    if nc -z localhost 6379 2>/dev/null; then
        log_pass "3.5 Redis accessible on localhost:6379"
    else
        log_fail "3.5 Redis port mapping" "Cannot connect to localhost:6379"
    fi

    # Test 3.6: Host can reach NATS on mapped port
    if nc -z localhost 4222 2>/dev/null; then
        log_pass "3.6 NATS accessible on localhost:4222"
    else
        log_fail "3.6 NATS port mapping" "Cannot connect to localhost:4222"
    fi

    # Test 3.7: Host can reach Vault on mapped port
    if nc -z localhost 8200 2>/dev/null; then
        log_pass "3.7 Vault accessible on localhost:8200"
    else
        log_fail "3.7 Vault port mapping" "Cannot connect to localhost:8200"
    fi

    # Test 3.8: Container-to-container TCP (postgres from temp container)
    if docker run --rm --network GridWatch-network alpine sh -c "nc -z postgres 5432" 2>/dev/null; then
        log_pass "3.8 Container-to-container: postgres:5432"
    else
        log_fail "3.8 Container-to-container" "Cannot reach postgres:5432"
    fi

    # Test 3.9: Container-to-container TCP (redis from temp container)
    if docker run --rm --network GridWatch-network alpine sh -c "nc -z redis 6379" 2>/dev/null; then
        log_pass "3.9 Container-to-container: redis:6379"
    else
        log_fail "3.9 Container-to-container" "Cannot reach redis:6379"
    fi

    # Test 3.10: host.docker.internal resolution (macOS specific)
    if docker run --rm alpine ping -c 1 host.docker.internal > /dev/null 2>&1; then
        log_pass "3.10 host.docker.internal resolves (macOS Docker Desktop)"
    else
        log_skip "3.10 host.docker.internal" "May not be available in all configurations"
    fi
}

# ===========================================
# SECTION 4: Application Services (IPAM Profile)
# ===========================================
test_application_services() {
    log_section "Section 4: Application Services"

    if [ "$PROFILE" = "infra" ]; then
        log_skip "4.x Application services" "Using 'infra' profile only"
        return 0
    fi

    cd "$PROJECT_ROOT"

    # Start application services
    log_info "Starting application services with profile: $PROFILE..."
    docker compose --profile "$PROFILE" up -d --build 2>&1

    log_info "Waiting for application services to start (60s)..."
    sleep 60

    # Test 4.1: Gateway container running
    if docker ps --format '{{.Names}}' | grep -q "GridWatch-gateway"; then
        log_pass "4.1 Gateway container running"
    else
        log_fail "4.1 Gateway container" "Container not running"
    fi

    # Test 4.2: Gateway health endpoint
    if wait_for_health "http://localhost:3001/healthz" "Gateway" 30; then
        log_pass "4.2 Gateway health endpoint (/healthz)"
    else
        log_fail "4.2 Gateway health" "Health endpoint not responding"
    fi

    # Test 4.3: Gateway liveness endpoint
    if check_http_status "http://localhost:3001/livez" 200; then
        log_pass "4.3 Gateway liveness endpoint (/livez)"
    else
        log_fail "4.3 Gateway liveness" "Liveness endpoint failed"
    fi

    # Test 4.4: Gateway readiness endpoint
    if check_http_status "http://localhost:3001/readyz" 200; then
        log_pass "4.4 Gateway readiness endpoint (/readyz)"
    else
        log_fail "4.4 Gateway readiness" "Readiness endpoint failed"
    fi

    # Test 4.5: Gateway OpenAPI docs
    if check_http_status "http://localhost:3001/docs/" 200; then
        log_pass "4.5 Gateway OpenAPI docs (/docs/)"
    else
        log_fail "4.5 Gateway OpenAPI" "Docs endpoint failed"
    fi

    # Test 4.6: Web UI container running
    if docker ps --format '{{.Names}}' | grep -q "GridWatch-web-ui"; then
        log_pass "4.6 Web UI container running"
    else
        log_fail "4.6 Web UI container" "Container not running"
    fi

    # Test 4.7: Web UI accessible
    if wait_for_health "http://localhost:5173" "Web UI" 30; then
        log_pass "4.7 Web UI accessible (port 5173)"
    else
        log_fail "4.7 Web UI" "Not accessible on port 5173"
    fi

    # Module-specific tests based on profile
    case "$PROFILE" in
        ipam|all)
            # Test 4.8: IPAM service health
            if wait_for_health "http://localhost:3003/healthz" "IPAM" 30; then
                log_pass "4.8 IPAM service healthy"
            else
                log_fail "4.8 IPAM service" "Health check failed"
            fi

            # Test 4.9: IPAM API via gateway
            if check_http_status "http://localhost:3001/api/v1/ipam/networks" 401; then
                log_pass "4.9 IPAM API reachable (returns 401 - auth required)"
            else
                log_fail "4.9 IPAM API" "Unexpected response"
            fi
            ;;
    esac

    case "$PROFILE" in
        npm|all)
            # Test 4.10: NPM service health
            if wait_for_health "http://localhost:3004/healthz" "NPM" 30; then
                log_pass "4.10 NPM service healthy"
            else
                log_fail "4.10 NPM service" "Health check failed"
            fi

            # Test 4.11: NPM API via gateway
            if check_http_status "http://localhost:3001/api/v1/npm/devices" 401; then
                log_pass "4.11 NPM API reachable (returns 401 - auth required)"
            else
                log_fail "4.11 NPM API" "Unexpected response"
            fi
            ;;
    esac

    case "$PROFILE" in
        stig|all)
            # Test 4.12: STIG service health
            if wait_for_health "http://localhost:3005/healthz" "STIG" 30; then
                log_pass "4.12 STIG service healthy"
            else
                log_fail "4.12 STIG service" "Health check failed"
            fi

            # Test 4.13: STIG API via gateway
            if check_http_status "http://localhost:3001/api/v1/stig/targets" 401; then
                log_pass "4.13 STIG API reachable (returns 401 - auth required)"
            else
                log_fail "4.13 STIG API" "Unexpected response"
            fi
            ;;
    esac
}

# ===========================================
# SECTION 5: Authentication Flow
# ===========================================
test_authentication() {
    log_section "Section 5: Authentication Flow"

    if [ "$PROFILE" = "infra" ]; then
        log_skip "5.x Authentication tests" "Using 'infra' profile only"
        return 0
    fi

    # Test 5.1: Login endpoint exists
    local login_response
    login_response=$(curl -s -w "%{http_code}" -o /dev/null -X POST \
        -H "Content-Type: application/json" \
        -d '{"username":"admin","password":"wrong"}' \
        http://localhost:3001/api/v1/auth/login 2>/dev/null)

    if [ "$login_response" = "401" ] || [ "$login_response" = "400" ]; then
        log_pass "5.1 Login endpoint responds (got $login_response for bad creds)"
    else
        log_fail "5.1 Login endpoint" "Unexpected response: $login_response"
    fi

    # Test 5.2: Login with valid credentials (if test user exists)
    local token_response
    token_response=$(curl -s -X POST \
        -H "Content-Type: application/json" \
        -d '{"username":"admin","password":"admin123"}' \
        http://localhost:3001/api/v1/auth/login 2>/dev/null)

    if echo "$token_response" | grep -q "accessToken"; then
        log_pass "5.2 Login successful with test credentials"
        # Extract token for further tests
        ACCESS_TOKEN=$(echo "$token_response" | grep -o '"accessToken":"[^"]*"' | cut -d'"' -f4)
    else
        log_skip "5.2 Login with test credentials" "Test user may not exist"
        ACCESS_TOKEN=""
    fi

    # Test 5.3: Protected endpoint with token
    if [ -n "$ACCESS_TOKEN" ]; then
        local auth_response
        auth_response=$(curl -s -w "%{http_code}" -o /dev/null \
            -H "Authorization: Bearer $ACCESS_TOKEN" \
            http://localhost:3001/api/v1/auth/me 2>/dev/null)

        if [ "$auth_response" = "200" ]; then
            log_pass "5.3 Protected endpoint accessible with token"
        else
            log_fail "5.3 Protected endpoint" "Got $auth_response, expected 200"
        fi
    else
        log_skip "5.3 Protected endpoint test" "No valid token available"
    fi

    # Test 5.4: Token refresh endpoint
    if [ -n "$ACCESS_TOKEN" ]; then
        local refresh_response
        refresh_response=$(curl -s -w "%{http_code}" -o /dev/null -X POST \
            -H "Content-Type: application/json" \
            -H "Authorization: Bearer $ACCESS_TOKEN" \
            http://localhost:3001/api/v1/auth/refresh 2>/dev/null)

        if [ "$refresh_response" = "200" ] || [ "$refresh_response" = "400" ]; then
            log_pass "5.4 Refresh endpoint responds"
        else
            log_fail "5.4 Refresh endpoint" "Unexpected response: $refresh_response"
        fi
    else
        log_skip "5.4 Refresh endpoint test" "No valid token available"
    fi
}

# ===========================================
# SECTION 6: Performance Baseline
# ===========================================
test_performance_baseline() {
    log_section "Section 6: Performance Baseline"

    # Test 6.1: PostgreSQL connection latency
    local pg_start pg_end pg_latency
    pg_start=$(date +%s%N)
    docker exec GridWatch-postgres psql -U GridWatch -d GridWatch -c "SELECT 1" > /dev/null 2>&1
    pg_end=$(date +%s%N)
    pg_latency=$(( (pg_end - pg_start) / 1000000 ))

    if [ "$pg_latency" -lt 100 ]; then
        log_pass "6.1 PostgreSQL latency: ${pg_latency}ms"
    else
        log_fail "6.1 PostgreSQL latency" "${pg_latency}ms > 100ms threshold"
    fi

    # Test 6.2: Redis latency
    local redis_start redis_end redis_latency
    redis_start=$(date +%s%N)
    docker exec GridWatch-redis redis-cli -a redis-dev-2025 ping > /dev/null 2>&1
    redis_end=$(date +%s%N)
    redis_latency=$(( (redis_end - redis_start) / 1000000 ))

    if [ "$redis_latency" -lt 50 ]; then
        log_pass "6.2 Redis latency: ${redis_latency}ms"
    else
        log_fail "6.2 Redis latency" "${redis_latency}ms > 50ms threshold"
    fi

    # Test 6.3: HTTP endpoint latency (health check)
    local http_start http_end http_latency
    http_start=$(date +%s%N)
    curl -sf http://localhost:9090/-/healthy > /dev/null 2>&1
    http_end=$(date +%s%N)
    http_latency=$(( (http_end - http_start) / 1000000 ))

    if [ "$http_latency" -lt 200 ]; then
        log_pass "6.3 HTTP health check latency: ${http_latency}ms"
    else
        log_fail "6.3 HTTP latency" "${http_latency}ms > 200ms threshold"
    fi

    # Test 6.4: Docker container memory usage
    local total_memory
    total_memory=$(docker stats --no-stream --format "{{.MemUsage}}" 2>/dev/null | \
        awk -F'/' '{sum+=$1} END {print sum}' | tr -d 'MiB GiB' || echo "0")
    log_info "Total container memory usage: approximately ${total_memory}"
    log_pass "6.4 Memory usage recorded"
}

# ===========================================
# Generate Results
# ===========================================
generate_results() {
    log_section "Test Results Summary"

    local total=$((TESTS_PASSED + TESTS_FAILED + TESTS_SKIPPED))
    local pass_rate=0
    if [ "$total" -gt 0 ]; then
        pass_rate=$((TESTS_PASSED * 100 / total))
    fi

    echo ""
    echo -e "${GREEN}Passed:${NC}  $TESTS_PASSED"
    echo -e "${RED}Failed:${NC}  $TESTS_FAILED"
    echo -e "${YELLOW}Skipped:${NC} $TESTS_SKIPPED"
    echo -e "${BLUE}Total:${NC}   $total"
    echo -e "${BLUE}Pass Rate:${NC} ${pass_rate}%"
    echo ""

    # Generate JSON results
    cat > "$RESULTS_FILE" << EOF
{
    "platform": "macOS",
    "architecture": "arm64",
    "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
    "profile": "$PROFILE",
    "docker_version": "$(docker --version | awk '{print $3}' | tr -d ',')",
    "compose_version": "$(docker compose version --short)",
    "summary": {
        "passed": $TESTS_PASSED,
        "failed": $TESTS_FAILED,
        "skipped": $TESTS_SKIPPED,
        "total": $total,
        "pass_rate": $pass_rate
    },
    "tests": [
        $(IFS=,; echo "${TEST_RESULTS[*]}")
    ]
}
EOF

    echo "Results saved to: $RESULTS_FILE"

    # Return exit code based on failures
    if [ "$TESTS_FAILED" -gt 0 ]; then
        return 1
    fi
    return 0
}

# ===========================================
# Cleanup
# ===========================================
cleanup() {
    log_section "Cleanup"

    read -p "Tear down Docker services? [y/N] " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        log_info "Stopping services..."
        docker compose --profile "$PROFILE" down -v 2>/dev/null || true
        log_info "Cleanup complete"
    else
        log_info "Leaving services running"
    fi
}

# ===========================================
# Main Execution
# ===========================================
main() {
    echo ""
    echo "=============================================="
    echo " GridWatch NetEnterprise - macOS ARM64 Smoke Test"
    echo " Profile: $PROFILE"
    echo " Time: $(date)"
    echo "=============================================="
    echo ""

    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            --profile)
                PROFILE="$2"
                shift 2
                ;;
            *)
                shift
                ;;
        esac
    done

    cd "$PROJECT_ROOT"

    # Run test sections
    test_prerequisites
    test_infrastructure
    test_network_connectivity
    test_application_services
    test_authentication
    test_performance_baseline

    # Generate results
    generate_results
    local exit_code=$?

    # Offer cleanup
    cleanup

    exit $exit_code
}

# Run main
main "$@"
