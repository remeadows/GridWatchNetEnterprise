#!/usr/bin/env bash
# GridWatch NetEnterprise - RHEL 9.x Smoke Test Suite
# Phase 8: Cross-Platform Testing
#
# Usage: ./tests/smoke/rhel9-smoke-test.sh [--profile PROFILE] [--podman]
# Profiles: infra, ipam, npm, stig, all (default: infra)
# Options: --podman  Use podman instead of docker
#
# This script validates GridWatch NetEnterprise on Red Hat Enterprise Linux 9.x
# It can be run directly on RHEL or in a RHEL container for validation.

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
PROFILE="${1:-infra}"
USE_PODMAN=false
CONTAINER_CMD="docker"
COMPOSE_CMD="docker compose"
RESULTS_FILE="$PROJECT_ROOT/tests/smoke/results/rhel9-$(date +%Y%m%d-%H%M%S).json"

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --podman)
            USE_PODMAN=true
            CONTAINER_CMD="podman"
            COMPOSE_CMD="podman-compose"
            shift
            ;;
        --profile)
            PROFILE="$2"
            shift 2
            ;;
        *)
            shift
            ;;
    esac
done

# Test counters
TESTS_PASSED=0
TESTS_FAILED=0
TESTS_SKIPPED=0
declare -a TEST_RESULTS=()

mkdir -p "$(dirname "$RESULTS_FILE")"

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_pass() { echo -e "${GREEN}[PASS]${NC} $1"; ((TESTS_PASSED++)); TEST_RESULTS+=("{\"test\":\"$1\",\"status\":\"pass\"}"); }
log_fail() { echo -e "${RED}[FAIL]${NC} $1: $2"; ((TESTS_FAILED++)); TEST_RESULTS+=("{\"test\":\"$1\",\"status\":\"fail\",\"error\":\"$2\"}"); }
log_skip() { echo -e "${YELLOW}[SKIP]${NC} $1: $2"; ((TESTS_SKIPPED++)); TEST_RESULTS+=("{\"test\":\"$1\",\"status\":\"skip\",\"reason\":\"$2\"}"); }
log_section() { echo -e "\n${BLUE}========================================${NC}"; echo -e "${BLUE}$1${NC}"; echo -e "${BLUE}========================================${NC}"; }

wait_for_health() {
    local url=$1
    local max_attempts=${2:-30}
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

# ===========================================
# SECTION 1: RHEL 9.x Prerequisites
# ===========================================
test_prerequisites() {
    log_section "Section 1: RHEL 9.x Prerequisites"

    # Test 1.1: Operating System Detection
    if [ -f /etc/redhat-release ]; then
        local rhel_version
        rhel_version=$(cat /etc/redhat-release)
        if echo "$rhel_version" | grep -qE "Red Hat Enterprise Linux.*9\.|Rocky Linux 9|AlmaLinux 9|CentOS Stream 9"; then
            log_pass "1.1 RHEL 9.x compatible OS detected: $rhel_version"
        else
            log_fail "1.1 RHEL 9.x compatible OS" "Found: $rhel_version (expected RHEL 9.x, Rocky 9, Alma 9, or CentOS Stream 9)"
        fi
    elif [ -f /etc/os-release ]; then
        local os_id
        os_id=$(grep "^ID=" /etc/os-release | cut -d= -f2 | tr -d '"')
        local os_version
        os_version=$(grep "^VERSION_ID=" /etc/os-release | cut -d= -f2 | tr -d '"')
        if [[ "$os_id" =~ ^(rhel|rocky|almalinux|centos)$ ]] && [[ "$os_version" =~ ^9 ]]; then
            log_pass "1.1 RHEL 9.x compatible OS: $os_id $os_version"
        else
            log_skip "1.1 RHEL 9.x compatible OS" "Running on $os_id $os_version - may work but not officially supported"
        fi
    else
        log_skip "1.1 RHEL 9.x detection" "Not running on RHEL-based system"
    fi

    # Test 1.2: Container runtime (Docker or Podman)
    if $USE_PODMAN; then
        if command -v podman &> /dev/null; then
            local podman_version
            podman_version=$(podman --version | awk '{print $3}')
            log_pass "1.2 Podman installed (v$podman_version)"
        else
            log_fail "1.2 Podman installed" "Podman not found"
            return 1
        fi
    else
        if command -v docker &> /dev/null; then
            local docker_version
            docker_version=$(docker --version | awk '{print $3}' | tr -d ',')
            log_pass "1.2 Docker installed (v$docker_version)"
        else
            log_fail "1.2 Docker installed" "Docker not found - try --podman flag for Podman"
            return 1
        fi
    fi

    # Test 1.3: Compose tool
    if $USE_PODMAN; then
        if command -v podman-compose &> /dev/null; then
            local compose_version
            compose_version=$(podman-compose version 2>/dev/null | head -1 || echo "unknown")
            log_pass "1.3 podman-compose installed"
        else
            log_fail "1.3 podman-compose installed" "Install with: pip3 install podman-compose"
            return 1
        fi
    else
        if docker compose version &> /dev/null; then
            local compose_version
            compose_version=$(docker compose version --short)
            log_pass "1.3 Docker Compose installed (v$compose_version)"
        else
            log_fail "1.3 Docker Compose installed" "Docker Compose not found"
            return 1
        fi
    fi

    # Test 1.4: SELinux status
    if command -v getenforce &> /dev/null; then
        local selinux_status
        selinux_status=$(getenforce 2>/dev/null || echo "Unknown")
        log_info "SELinux status: $selinux_status"
        if [ "$selinux_status" = "Enforcing" ]; then
            log_pass "1.4 SELinux enforcing (using :Z mounts)"
        elif [ "$selinux_status" = "Permissive" ]; then
            log_pass "1.4 SELinux permissive"
        else
            log_skip "1.4 SELinux check" "SELinux disabled or not available"
        fi
    else
        log_skip "1.4 SELinux check" "SELinux not available on this system"
    fi

    # Test 1.5: Firewalld status
    if command -v firewall-cmd &> /dev/null; then
        if systemctl is-active --quiet firewalld 2>/dev/null; then
            log_pass "1.5 firewalld active"
            log_info "Ensure ports 3000-3006, 4222, 5433, 6379, 8200, 8428, 9090, 3100, 16686 are open"
        else
            log_skip "1.5 firewalld check" "firewalld not running"
        fi
    else
        log_skip "1.5 firewalld check" "firewalld not installed"
    fi

    # Test 1.6: cgroups v2 (required for modern containers)
    if [ -f /sys/fs/cgroup/cgroup.controllers ]; then
        log_pass "1.6 cgroups v2 enabled"
    else
        log_skip "1.6 cgroups v2" "Using cgroups v1 - containers should still work"
    fi

    # Test 1.7: Container storage driver
    local storage_driver
    if $USE_PODMAN; then
        storage_driver=$(podman info --format '{{.Store.GraphDriverName}}' 2>/dev/null || echo "unknown")
    else
        storage_driver=$(docker info --format '{{.Driver}}' 2>/dev/null || echo "unknown")
    fi
    log_info "Storage driver: $storage_driver"
    if [ "$storage_driver" = "overlay2" ] || [ "$storage_driver" = "overlay" ]; then
        log_pass "1.7 Storage driver optimal ($storage_driver)"
    else
        log_skip "1.7 Storage driver" "Using $storage_driver (overlay2 recommended)"
    fi

    # Test 1.8: .env file exists
    if [ -f "$PROJECT_ROOT/.env" ]; then
        log_pass "1.8 .env file exists"
    else
        log_fail "1.8 .env file exists" "Missing .env file"
        return 1
    fi

    # Test 1.9: curl installed
    if command -v curl &> /dev/null; then
        log_pass "1.9 curl installed"
    else
        log_fail "1.9 curl installed" "Install with: dnf install curl"
        return 1
    fi

    # Test 1.10: Available disk space
    local free_space_gb
    free_space_gb=$(df -BG "$PROJECT_ROOT" 2>/dev/null | tail -1 | awk '{print $4}' | tr -d 'G' || echo "0")
    if [ "$free_space_gb" -ge 5 ]; then
        log_pass "1.10 Sufficient disk space (${free_space_gb}GB free)"
    else
        log_fail "1.10 Sufficient disk space" "Only ${free_space_gb}GB free, need 5GB+"
    fi
}

# ===========================================
# SECTION 2: RHEL-Specific Infrastructure Tests
# ===========================================
test_infrastructure_rhel() {
    log_section "Section 2: Infrastructure Services (RHEL-specific)"

    cd "$PROJECT_ROOT"

    # Test 2.1: Compose config validation with SELinux mounts
    log_info "Validating compose configuration..."
    if $USE_PODMAN; then
        if podman-compose config > /dev/null 2>&1; then
            log_pass "2.1 Compose configuration valid (Podman)"
        else
            log_fail "2.1 Compose configuration" "Invalid compose file for Podman"
            return 1
        fi
    else
        if docker compose --profile infra config > /dev/null 2>&1; then
            log_pass "2.1 Compose configuration valid (Docker)"
        else
            log_fail "2.1 Compose configuration" "Invalid compose file"
            return 1
        fi
    fi

    # Test 2.2: Start infrastructure with appropriate flags
    log_info "Starting infrastructure services..."
    if $USE_PODMAN; then
        podman-compose --profile infra up -d 2>&1
    else
        docker compose --profile infra up -d 2>&1
    fi

    if [ $? -eq 0 ]; then
        log_pass "2.2 Infrastructure services started"
    else
        log_fail "2.2 Infrastructure services" "Failed to start"
        return 1
    fi

    log_info "Waiting for services to initialize (30s)..."
    sleep 30

    # Test 2.3-2.14: Same health checks as other platforms
    # PostgreSQL
    if $CONTAINER_CMD exec GridWatch-postgres pg_isready -U GridWatch > /dev/null 2>&1; then
        log_pass "2.3 PostgreSQL healthy"
    else
        log_fail "2.3 PostgreSQL healthy" "pg_isready failed"
    fi

    # Redis
    if $CONTAINER_CMD exec GridWatch-redis redis-cli -a redis-dev-2025 ping 2>/dev/null | grep -q PONG; then
        log_pass "2.4 Redis healthy"
    else
        log_fail "2.4 Redis healthy" "Redis ping failed"
    fi

    # NATS
    if curl -sf http://localhost:8222/healthz > /dev/null 2>&1; then
        log_pass "2.5 NATS healthy"
    else
        log_fail "2.5 NATS healthy" "Health check failed"
    fi

    # Vault
    if curl -sf http://localhost:8200/v1/sys/health > /dev/null 2>&1; then
        log_pass "2.6 Vault healthy"
    else
        log_fail "2.6 Vault healthy" "Health check failed"
    fi

    # Prometheus
    if curl -sf http://localhost:9090/-/healthy > /dev/null 2>&1; then
        log_pass "2.7 Prometheus healthy"
    else
        log_fail "2.7 Prometheus healthy" "Health check failed"
    fi

    # Grafana
    if wait_for_health "http://localhost:3002/api/health" 30; then
        log_pass "2.8 Grafana healthy (port 3002)"
    else
        log_fail "2.8 Grafana healthy" "Health check failed"
    fi

    # VictoriaMetrics
    if curl -sf http://localhost:8428/health > /dev/null 2>&1; then
        log_pass "2.9 VictoriaMetrics healthy"
    else
        log_fail "2.9 VictoriaMetrics healthy" "Health check failed"
    fi

    # Loki
    if curl -sf http://localhost:3100/ready > /dev/null 2>&1; then
        log_pass "2.10 Loki healthy"
    else
        log_fail "2.10 Loki healthy" "Health check failed"
    fi

    # Jaeger
    if curl -sf http://localhost:16686/ > /dev/null 2>&1; then
        log_pass "2.11 Jaeger UI accessible"
    else
        log_fail "2.11 Jaeger UI" "Not accessible"
    fi
}

# ===========================================
# SECTION 3: RHEL Network Tests
# ===========================================
test_network_rhel() {
    log_section "Section 3: Network Connectivity (RHEL)"

    # Test container DNS
    if $CONTAINER_CMD run --rm --network GridWatch-network alpine nslookup postgres > /dev/null 2>&1; then
        log_pass "3.1 Container DNS resolution (postgres)"
    else
        log_fail "3.1 Container DNS" "Cannot resolve 'postgres'"
    fi

    if $CONTAINER_CMD run --rm --network GridWatch-network alpine nslookup redis > /dev/null 2>&1; then
        log_pass "3.2 Container DNS resolution (redis)"
    else
        log_fail "3.2 Container DNS" "Cannot resolve 'redis'"
    fi

    # Test host port mappings
    if nc -z localhost 5433 2>/dev/null || timeout 2 bash -c "echo > /dev/tcp/localhost/5433" 2>/dev/null; then
        log_pass "3.3 PostgreSQL accessible on localhost:5433"
    else
        log_fail "3.3 PostgreSQL port" "Cannot connect"
    fi

    if nc -z localhost 6379 2>/dev/null || timeout 2 bash -c "echo > /dev/tcp/localhost/6379" 2>/dev/null; then
        log_pass "3.4 Redis accessible on localhost:6379"
    else
        log_fail "3.4 Redis port" "Cannot connect"
    fi

    if nc -z localhost 4222 2>/dev/null || timeout 2 bash -c "echo > /dev/tcp/localhost/4222" 2>/dev/null; then
        log_pass "3.5 NATS accessible on localhost:4222"
    else
        log_fail "3.5 NATS port" "Cannot connect"
    fi
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

    # Generate JSON results
    cat > "$RESULTS_FILE" << EOF
{
    "platform": "RHEL",
    "version": "9.x",
    "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
    "container_runtime": "$CONTAINER_CMD",
    "profile": "$PROFILE",
    "summary": {
        "passed": $TESTS_PASSED,
        "failed": $TESTS_FAILED,
        "skipped": $TESTS_SKIPPED,
        "total": $total,
        "pass_rate": $pass_rate
    }
}
EOF

    echo ""
    echo "Results saved to: $RESULTS_FILE"

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

    read -p "Tear down Docker/Podman services? [y/N] " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        log_info "Stopping services..."
        if $USE_PODMAN; then
            podman-compose --profile "$PROFILE" down -v 2>/dev/null || true
        else
            docker compose --profile "$PROFILE" down -v 2>/dev/null || true
        fi
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
    echo " GridWatch NetEnterprise - RHEL 9.x Smoke Test"
    echo " Container Runtime: $CONTAINER_CMD"
    echo " Profile: $PROFILE"
    echo " Time: $(date)"
    echo "=============================================="
    echo ""

    cd "$PROJECT_ROOT"

    test_prerequisites
    test_infrastructure_rhel
    test_network_rhel

    generate_results
    local exit_code=$?

    cleanup

    exit $exit_code
}

main "$@"
