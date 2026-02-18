#!/bin/bash
#===============================================================================
# GridWatch NetEnterprise - Infrastructure Pre-flight Health Checks
# Run this BEFORE API/Frontend tests to validate all services are operational
#===============================================================================

set -uo pipefail

# Source .env if it exists (for custom port configurations)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
if [ -f "$PROJECT_ROOT/.env" ]; then
    # Export only specific variables to avoid conflicts
    set -a
    source "$PROJECT_ROOT/.env"
    set +a
fi

# Configuration
COMPOSE_PROJECT="${COMPOSE_PROJECT:-GridWatch}"
POSTGRES_HOST="${POSTGRES_HOST:-localhost}"
POSTGRES_PORT="${POSTGRES_PORT:-5433}"
POSTGRES_USER="${POSTGRES_USER:-GridWatch}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-GridWatch-dev-2025}"
POSTGRES_DB="${POSTGRES_DB:-GridWatch}"
REDIS_HOST="${REDIS_HOST:-localhost}"
REDIS_PORT="${REDIS_PORT:-6379}"
REDIS_PASSWORD="${REDIS_PASSWORD:-redis-dev-2025}"
NATS_HOST="${NATS_HOST:-localhost}"
NATS_PORT="${NATS_PORT:-4222}"
# Port 8322 used instead of 8222 for Windows Hyper-V compatibility
NATS_MONITOR_PORT="${NATS_MONITOR_PORT:-8322}"
# Port 8300 mapped externally to avoid Windows Hyper-V reserved range (8139-8238)
VAULT_ADDR="${VAULT_ADDR:-http://localhost:8300}"
VICTORIA_HOST="${VICTORIA_HOST:-localhost}"
VICTORIA_PORT="${VICTORIA_PORT:-8428}"
GATEWAY_URL="${GATEWAY_URL:-http://localhost:3001}"
GRAFANA_PORT="${GRAFANA_PORT:-3002}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Counters
PASSED=0
FAILED=0
WARNINGS=0
START_TIME=$(date +%s%N)

# Results array for final report
declare -a RESULTS=()

#-------------------------------------------------------------------------------
# Utility Functions
#-------------------------------------------------------------------------------

log_section() {
    echo -e "\n${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}  $1${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

log_test() {
    echo -n "  ├─ $1... "
}

log_pass() {
    local duration="${1:-}"
    echo -e "${GREEN}✓ PASS${NC}${duration:+ (${duration}ms)}"
    ((PASSED++))
}

log_fail() {
    local msg="${1:-}"
    echo -e "${RED}✗ FAIL${NC}${msg:+ - ${msg}}"
    ((FAILED++))
}

log_warn() {
    local msg="${1:-}"
    echo -e "${YELLOW}⚠ WARN${NC}${msg:+ - ${msg}}"
    ((WARNINGS++))
}

measure_time() {
    local start=$1
    local end=$(date +%s%N)
    echo $(( (end - start) / 1000000 ))
}

add_result() {
    local section="$1"
    local status="$2"
    local duration="$3"
    local failures="${4:-}"
    RESULTS+=("$section|$status|$duration|$failures")
}

wait_for_port() {
    local host=$1
    local port=$2
    local timeout=${3:-30}
    local start=$(date +%s)
    
    while ! nc -z "$host" "$port" 2>/dev/null; do
        if [ $(($(date +%s) - start)) -gt $timeout ]; then
            return 1
        fi
        sleep 1
    done
    return 0
}

#-------------------------------------------------------------------------------
# Section 1: Docker Container Health
#-------------------------------------------------------------------------------

check_docker_containers() {
    log_section "1. DOCKER CONTAINER HEALTH"
    local section_start=$(date +%s%N)
    local section_failures=""
    local section_passed=true
    
    # Check Docker daemon
    log_test "Docker daemon responsive"
    local test_start=$(date +%s%N)
    if docker info &>/dev/null; then
        log_pass "$(measure_time $test_start)"
    else
        log_fail "Docker daemon not running"
        section_passed=false
        section_failures+="Docker daemon; "
    fi
    
    # List expected infrastructure containers (core infrastructure only)
    # Application services (gateway, auth-service, ipam-*, npm-*, stig-*, web-ui)
    # may run locally or in Docker depending on profile
    local EXPECTED_CONTAINERS=(
        "postgres"
        "redis"
        "nats"
        "vault"
        "victoriametrics"
        "grafana"
        "loki"
        "promtail"
        "jaeger"
        "prometheus"
    )
    
    # Check each container
    log_test "Checking container states"
    echo ""
    
    local running_count=0
    local expected_count=${#EXPECTED_CONTAINERS[@]}
    
    for container in "${EXPECTED_CONTAINERS[@]}"; do
        # Try both naming conventions: with and without -1 suffix
        local full_name="${COMPOSE_PROJECT}-${container}"
        # Check if container exists without -1, if not try with -1
        if ! docker inspect "$full_name" &>/dev/null; then
            full_name="${COMPOSE_PROJECT}-${container}-1"
        fi
        local container_status
        local container_health
        container_status=$(docker inspect --format='{{.State.Status}}' "$full_name" 2>/dev/null) || container_status="not_found"
        container_health=$(docker inspect --format='{{if .State.Health}}{{.State.Health.Status}}{{else}}no_healthcheck{{end}}' "$full_name" 2>/dev/null) || container_health="unknown"
        
        printf "  │   ├─ %-20s " "$container"

        case "$container_status" in
            "running")
                # Count as running regardless of health status
                ((running_count++))
                if [[ "$container_health" == "healthy" || "$container_health" == "no_healthcheck" ]]; then
                    echo -e "${GREEN}●${NC} running ${container_health:+($container_health)}"
                elif [[ "$container_health" == "starting" ]]; then
                    echo -e "${YELLOW}●${NC} starting"
                else
                    echo -e "${YELLOW}●${NC} running ($container_health)"
                fi
                ;;
            "not_found")
                echo -e "${RED}○${NC} not found"
                section_failures+="$container missing; "
                section_passed=false
                ;;
            *)
                echo -e "${RED}○${NC} $container_status"
                section_failures+="$container $container_status; "
                section_passed=false
                ;;
        esac
    done
    
    echo "  │"
    log_test "Container summary: $running_count/$expected_count running"
    if [ "$running_count" -eq "$expected_count" ]; then
        log_pass
    else
        log_fail "$((expected_count - running_count)) containers not running"
        section_passed=false
    fi
    
    local section_duration=$(measure_time $section_start)
    if $section_passed; then
        add_result "Docker Containers" "✅" "${section_duration}ms" ""
    else
        add_result "Docker Containers" "❌" "${section_duration}ms" "${section_failures}"
    fi
}

#-------------------------------------------------------------------------------
# Section 2: PostgreSQL Database
#-------------------------------------------------------------------------------

check_postgresql() {
    log_section "2. POSTGRESQL DATABASE"
    local section_start=$(date +%s%N)
    local section_failures=""
    local section_passed=true

    # Helper function to run psql via docker
    run_psql() {
        docker exec ${COMPOSE_PROJECT}-postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc "$1" 2>/dev/null
    }

    # Connection test
    log_test "PostgreSQL connection"
    local test_start=$(date +%s%N)
    if docker exec ${COMPOSE_PROJECT}-postgres pg_isready -U "$POSTGRES_USER" &>/dev/null; then
        log_pass "$(measure_time $test_start)"
    else
        log_fail "Cannot connect"
        section_passed=false
        section_failures+="Connection failed; "
        add_result "PostgreSQL" "❌" "$(measure_time $section_start)ms" "$section_failures"
        return
    fi

    # Schema verification
    local EXPECTED_SCHEMAS=("ipam" "npm" "stig" "shared")

    log_test "Checking database schemas"
    echo ""

    for schema in "${EXPECTED_SCHEMAS[@]}"; do
        printf "  │   ├─ %-10s " "$schema.*"
        local exists=$(run_psql "SELECT 1 FROM information_schema.schemata WHERE schema_name = '$schema'")

        if [ "$exists" = "1" ]; then
            # Count tables in schema
            local table_count=$(run_psql "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = '$schema'")
            echo -e "${GREEN}✓${NC} exists ($table_count tables)"
        else
            echo -e "${RED}✗${NC} missing"
            section_failures+="$schema schema missing; "
            section_passed=false
        fi
    done

    echo "  │"

    # Check critical tables exist (updated to match actual table names)
    log_test "Critical tables verification"
    local critical_tables=(
        "shared.users"
        "shared.audit_log"
        "ipam.networks"
        "ipam.addresses"
        "npm.devices"
        "npm.interfaces"
        "stig.definitions"
        "stig.audit_jobs"
    )

    local tables_found=0
    for table in "${critical_tables[@]}"; do
        local schema_name="${table%%.*}"
        local table_name="${table##*.}"
        local exists=$(run_psql "SELECT 1 FROM information_schema.tables WHERE table_schema = '$schema_name' AND table_name = '$table_name'")
        [ "$exists" = "1" ] && ((tables_found++))
    done

    if [ "$tables_found" -eq "${#critical_tables[@]}" ]; then
        log_pass
    else
        log_fail "$tables_found/${#critical_tables[@]} found"
        section_failures+="Missing tables; "
        section_passed=false
    fi

    # Check PostgreSQL extensions
    log_test "Required extensions (pgcrypto, uuid-ossp)"
    local extensions_ok=true
    for ext in "pgcrypto" "uuid-ossp"; do
        local ext_exists=$(run_psql "SELECT 1 FROM pg_extension WHERE extname = '$ext'")
        [ "$ext_exists" != "1" ] && extensions_ok=false
    done

    if $extensions_ok; then
        log_pass
    else
        log_warn "Some extensions missing"
    fi

    local section_duration=$(measure_time $section_start)
    if $section_passed; then
        add_result "PostgreSQL" "✅" "${section_duration}ms" ""
    else
        add_result "PostgreSQL" "❌" "${section_duration}ms" "$section_failures"
    fi
}

#-------------------------------------------------------------------------------
# Section 3: Redis
#-------------------------------------------------------------------------------

check_redis() {
    log_section "3. REDIS SESSION STORE"
    local section_start=$(date +%s%N)
    local section_failures=""
    local section_passed=true
    
    # Helper function to run redis-cli via docker
    run_redis() {
        docker exec ${COMPOSE_PROJECT}-redis redis-cli -a "$REDIS_PASSWORD" $@ 2>/dev/null | grep -v "Warning:"
    }

    # Connection test
    log_test "Redis PING"
    local test_start=$(date +%s%N)
    local pong=$(run_redis PING)

    if [ "$pong" = "PONG" ]; then
        log_pass "$(measure_time $test_start)"
    else
        log_fail "No response"
        section_passed=false
        section_failures+="Connection failed; "
        add_result "Redis" "❌" "$(measure_time $section_start)ms" "$section_failures"
        return
    fi

    # Check memory usage
    log_test "Memory usage"
    local used_memory=$(run_redis INFO memory | grep "used_memory_human" | cut -d: -f2 | tr -d '\r')
    if [ -n "$used_memory" ]; then
        echo -e "${GREEN}✓${NC} $used_memory"
        ((PASSED++))
    else
        log_warn "Could not determine"
    fi

    # Test session operations
    log_test "Session write/read/delete cycle"
    test_start=$(date +%s%N)

    local test_key="GridWatch:test:$(date +%s)"
    local test_value='{"test":"e2e"}'

    # Write
    run_redis SET "$test_key" "$test_value" EX 60 &>/dev/null

    # Read
    local read_value=$(run_redis GET "$test_key")

    # Delete
    run_redis DEL "$test_key" &>/dev/null

    if [ "$read_value" = "$test_value" ]; then
        log_pass "$(measure_time $test_start)"
    else
        log_fail "Data mismatch"
        section_passed=false
        section_failures+="Session ops failed; "
    fi

    # Check for existing session keys (informational)
    log_test "Active sessions"
    local session_count=$(run_redis KEYS "GridWatch:session:*" | wc -l)
    echo -e "${GREEN}✓${NC} $session_count active"
    ((PASSED++))
    
    local section_duration=$(measure_time $section_start)
    if $section_passed; then
        add_result "Redis" "✅" "${section_duration}ms" ""
    else
        add_result "Redis" "❌" "${section_duration}ms" "$section_failures"
    fi
}

#-------------------------------------------------------------------------------
# Section 4: NATS JetStream
#-------------------------------------------------------------------------------

check_nats() {
    log_section "4. NATS JETSTREAM"
    local section_start=$(date +%s%N)
    local section_failures=""
    local section_passed=true
    
    # Connection test via monitoring endpoint
    log_test "NATS server connection"
    local test_start=$(date +%s%N)
    
    if curl -sf "http://${NATS_HOST}:${NATS_MONITOR_PORT}/healthz" &>/dev/null; then
        log_pass "$(measure_time $test_start)"
    else
        log_fail "Server not responding"
        section_passed=false
        section_failures+="Connection failed; "
        add_result "NATS" "❌" "$(measure_time $section_start)ms" "$section_failures"
        return
    fi
    
    # Check JetStream enabled
    log_test "JetStream enabled"
    local js_info=$(curl -sf "http://${NATS_HOST}:${NATS_MONITOR_PORT}/jsz" 2>/dev/null)
    
    if echo "$js_info" | grep -q '"streams"'; then
        log_pass
    else
        log_fail "JetStream not enabled"
        section_passed=false
        section_failures+="JetStream disabled; "
    fi
    
    # Check expected streams (matching actual service stream names)
    # Services create: IPAM, NPM_METRICS, STIG
    # Optional shared streams: SHARED_ALERTS, SHARED_AUDIT (created by setup script if needed)
    local EXPECTED_STREAMS=(
        "IPAM"
        "NPM_METRICS"
        "STIG"
    )
    
    log_test "JetStream streams"
    echo ""
    
    local streams_found=0
    for stream in "${EXPECTED_STREAMS[@]}"; do
        printf "  │   ├─ %-20s " "$stream"
        
        # Check if stream exists via API (allow space after colon in JSON)
        local stream_exists
        stream_exists=$(curl -sf "http://${NATS_HOST}:${NATS_MONITOR_PORT}/jsz?streams=true" 2>/dev/null | grep -c "\"name\":.*\"$stream\"" | tr -d '\n') || stream_exists="0"

        if [ "$stream_exists" -gt 0 ] 2>/dev/null; then
            echo -e "${GREEN}✓${NC} configured"
            ((streams_found++))
        else
            echo -e "${RED}✗${NC} missing"
            section_failures+="$stream missing; "
            section_passed=false
        fi
    done
    
    echo "  │"
    log_test "Stream summary: $streams_found/${#EXPECTED_STREAMS[@]}"
    if [ "$streams_found" -eq "${#EXPECTED_STREAMS[@]}" ]; then
        log_pass
    else
        log_fail
    fi
    
    # Check consumer count
    log_test "Active consumers"
    local consumer_count=$(curl -sf "http://${NATS_HOST}:${NATS_MONITOR_PORT}/jsz" 2>/dev/null | grep -o '"consumers":[0-9]*' | head -1 | cut -d: -f2)
    echo -e "${GREEN}✓${NC} ${consumer_count:-0} consumers"
    ((PASSED++))
    
    local section_duration=$(measure_time $section_start)
    if $section_passed; then
        add_result "NATS JetStream" "✅" "${section_duration}ms" ""
    else
        add_result "NATS JetStream" "❌" "${section_duration}ms" "$section_failures"
    fi
}

#-------------------------------------------------------------------------------
# Section 5: HashiCorp Vault
#-------------------------------------------------------------------------------

check_vault() {
    log_section "5. HASHICORP VAULT"
    local section_start=$(date +%s%N)
    local section_failures=""
    local section_passed=true
    
    # Health check
    log_test "Vault health"
    local test_start=$(date +%s%N)
    local health=$(curl -sf "${VAULT_ADDR}/v1/sys/health" 2>/dev/null)
    
    if [ -n "$health" ]; then
        log_pass "$(measure_time $test_start)"
    else
        log_fail "Not responding"
        section_passed=false
        section_failures+="Health check failed; "
        add_result "Vault" "❌" "$(measure_time $section_start)ms" "$section_failures"
        return
    fi
    
    # Check seal status
    log_test "Seal status"
    local sealed=$(echo "$health" | grep -o '"sealed":[^,]*' | cut -d: -f2)
    
    if [ "$sealed" = "false" ]; then
        log_pass
    else
        log_fail "Vault is sealed"
        section_passed=false
        section_failures+="Vault sealed; "
    fi
    
    # Check initialized
    log_test "Initialization status"
    local initialized=$(echo "$health" | grep -o '"initialized":[^,]*' | cut -d: -f2)
    
    if [ "$initialized" = "true" ]; then
        log_pass
    else
        log_fail "Vault not initialized"
        section_passed=false
        section_failures+="Not initialized; "
    fi
    
    # Check JWT signing keys (if token available)
    if [ -n "${VAULT_TOKEN:-}" ]; then
        log_test "JWT signing keys accessible"
        local jwt_key=$(curl -sf -H "X-Vault-Token: $VAULT_TOKEN" "${VAULT_ADDR}/v1/secret/data/GridWatch/jwt" 2>/dev/null)
        
        if echo "$jwt_key" | grep -q '"data"'; then
            log_pass
        else
            log_warn "Keys not accessible (check permissions)"
        fi
    else
        log_test "JWT signing keys"
        log_warn "VAULT_TOKEN not set, skipping"
    fi
    
    local section_duration=$(measure_time $section_start)
    if $section_passed; then
        add_result "Vault" "✅" "${section_duration}ms" ""
    else
        add_result "Vault" "❌" "${section_duration}ms" "$section_failures"
    fi
}

#-------------------------------------------------------------------------------
# Section 6: VictoriaMetrics
#-------------------------------------------------------------------------------

check_victoriametrics() {
    log_section "6. VICTORIAMETRICS TIME-SERIES DB"
    local section_start=$(date +%s%N)
    local section_failures=""
    local section_passed=true
    
    # Health check
    log_test "VictoriaMetrics health"
    local test_start=$(date +%s%N)
    
    if curl -sf "http://${VICTORIA_HOST}:${VICTORIA_PORT}/health" &>/dev/null; then
        log_pass "$(measure_time $test_start)"
    else
        log_fail "Not responding"
        section_passed=false
        section_failures+="Health check failed; "
        add_result "VictoriaMetrics" "❌" "$(measure_time $section_start)ms" "$section_failures"
        return
    fi
    
    # Test write endpoint
    log_test "Write endpoint (Prometheus format)"
    test_start=$(date +%s%N)
    
    local write_response=$(curl -sf -X POST "http://${VICTORIA_HOST}:${VICTORIA_PORT}/api/v1/write" \
        -d "GridWatch_e2e_test{test=\"preflight\"} $(date +%s)" 2>/dev/null; echo $?)
    
    if [ "$write_response" = "0" ]; then
        log_pass "$(measure_time $test_start)"
    else
        log_warn "Write may have failed"
    fi
    
    # Test query endpoint
    log_test "Query endpoint"
    test_start=$(date +%s%N)
    
    local query_response=$(curl -sf "http://${VICTORIA_HOST}:${VICTORIA_PORT}/api/v1/query?query=up" 2>/dev/null)
    
    if echo "$query_response" | grep -q '"status":"success"'; then
        log_pass "$(measure_time $test_start)"
    else
        log_fail "Query failed"
        section_passed=false
        section_failures+="Query endpoint failed; "
    fi
    
    # Check for GridWatch metrics
    log_test "GridWatch metrics present"
    local nn_metrics
    nn_metrics=$(curl -sf "http://${VICTORIA_HOST}:${VICTORIA_PORT}/api/v1/label/__name__/values" 2>/dev/null | grep -c "GridWatch" | tr -d '\n') || nn_metrics="0"

    if [ "$nn_metrics" -gt 0 ] 2>/dev/null; then
        echo -e "${GREEN}✓${NC} $nn_metrics metric names"
        ((PASSED++))
    else
        log_warn "No GridWatch_* metrics yet"
    fi
    
    local section_duration=$(measure_time $section_start)
    if $section_passed; then
        add_result "VictoriaMetrics" "✅" "${section_duration}ms" ""
    else
        add_result "VictoriaMetrics" "❌" "${section_duration}ms" "$section_failures"
    fi
}

#-------------------------------------------------------------------------------
# Section 7: Observability Stack
#-------------------------------------------------------------------------------

check_observability() {
    log_section "7. OBSERVABILITY STACK"
    local section_start=$(date +%s%N)
    local section_failures=""
    local section_passed=true
    
    # Grafana
    log_test "Grafana health"
    local test_start=$(date +%s%N)
    local grafana_health=$(curl -sf "http://localhost:${GRAFANA_PORT}/api/health" 2>/dev/null)

    if echo "$grafana_health" | grep -q '"database":.*"ok"'; then
        log_pass "$(measure_time $test_start)"
    else
        log_fail "Grafana not healthy"
        section_passed=false
        section_failures+="Grafana; "
    fi

    # Check Grafana dashboards provisioned
    log_test "Grafana dashboards provisioned"
    local dashboard_count
    dashboard_count=$(curl -sf "http://admin:grafana-dev-2025@localhost:${GRAFANA_PORT}/api/search?type=dash-db" 2>/dev/null | grep -c '"uid"' | tr -d '\n') || dashboard_count="0"

    if [ "$dashboard_count" -gt 0 ] 2>/dev/null; then
        echo -e "${GREEN}✓${NC} $dashboard_count dashboards"
        ((PASSED++))
    else
        log_warn "No dashboards found"
    fi
    
    # Loki
    log_test "Loki health"
    test_start=$(date +%s%N)
    
    if curl -sf "http://localhost:3100/ready" &>/dev/null; then
        log_pass "$(measure_time $test_start)"
    else
        log_fail "Loki not ready"
        section_passed=false
        section_failures+="Loki; "
    fi
    
    # Jaeger
    log_test "Jaeger health"
    test_start=$(date +%s%N)
    
    if curl -sf "http://localhost:16686/" &>/dev/null; then
        log_pass "$(measure_time $test_start)"
    else
        log_fail "Jaeger not responding"
        section_passed=false
        section_failures+="Jaeger; "
    fi
    
    # Check for traces from GridWatch services
    log_test "Traces from GridWatch services"
    local services=$(curl -sf "http://localhost:16686/api/services" 2>/dev/null | grep -c "GridWatch" 2>/dev/null | tr -d '\n' || echo "0")
    # Ensure we have a valid integer (default to 0 if empty or non-numeric)
    services=${services:-0}
    [[ ! "$services" =~ ^[0-9]+$ ]] && services=0

    if [ "$services" -gt 0 ]; then
        echo -e "${GREEN}✓${NC} $services services traced"
        ((PASSED++))
    else
        log_warn "No GridWatch traces yet"
    fi
    
    local section_duration=$(measure_time $section_start)
    if $section_passed; then
        add_result "Observability" "✅" "${section_duration}ms" ""
    else
        add_result "Observability" "❌" "${section_duration}ms" "$section_failures"
    fi
}

#-------------------------------------------------------------------------------
# Section 8: API Gateway Connectivity
#-------------------------------------------------------------------------------

check_gateway() {
    log_section "8. API GATEWAY CONNECTIVITY"
    local section_start=$(date +%s%N)
    local section_failures=""
    local section_passed=true
    
    # Gateway health (use /healthz or /livez endpoints)
    log_test "Gateway health endpoint"
    local test_start=$(date +%s%N)

    if curl -sf "${GATEWAY_URL}/healthz" &>/dev/null || curl -sf "${GATEWAY_URL}/livez" &>/dev/null; then
        log_pass "$(measure_time $test_start)"
    else
        log_fail "Gateway not responding"
        section_passed=false
        section_failures+="Gateway health; "
        add_result "API Gateway" "❌" "$(measure_time $section_start)ms" "$section_failures"
        return
    fi
    
    # Module routes accessible (check they return proper JSON, even if 401)
    local MODULES=("ipam:networks" "npm:devices" "stig:benchmarks")

    log_test "Module routes accessible"
    echo ""

    for module_route in "${MODULES[@]}"; do
        local module="${module_route%%:*}"
        local route="${module_route##*:}"
        printf "  │   ├─ /api/v1/%s/%s " "$module" "$route"
        test_start=$(date +%s%N)

        # Check if route returns valid JSON (even 401 is fine - means gateway is routing correctly)
        local response
        response=$(curl -s "${GATEWAY_URL}/api/v1/${module}/${route}" 2>/dev/null)
        if echo "$response" | grep -q '"success"'; then
            echo -e "${GREEN}✓${NC} $(measure_time $test_start)ms"
        else
            echo -e "${RED}✗${NC} not responding"
            section_failures+="$module routes; "
            section_passed=false
        fi
    done

    echo "  │"
    
    # OpenAPI spec
    log_test "OpenAPI documentation"
    test_start=$(date +%s%N)
    
    local openapi=$(curl -sf "${GATEWAY_URL}/docs/json" 2>/dev/null)
    
    if echo "$openapi" | grep -q '"openapi"'; then
        log_pass "$(measure_time $test_start)"
    else
        log_warn "OpenAPI spec not available"
    fi
    
    local section_duration=$(measure_time $section_start)
    if $section_passed; then
        add_result "API Gateway" "✅" "${section_duration}ms" ""
    else
        add_result "API Gateway" "❌" "${section_duration}ms" "$section_failures"
    fi
}

#-------------------------------------------------------------------------------
# Final Report
#-------------------------------------------------------------------------------

print_report() {
    local end_time=$(date +%s%N)
    local total_duration=$(( (end_time - START_TIME) / 1000000 ))
    
    echo -e "\n${BLUE}╔════════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║              GridWatch INFRASTRUCTURE PRE-FLIGHT REPORT             ║${NC}"
    echo -e "${BLUE}╠════════════════════════════════════════════════════════════════════╣${NC}"
    printf "${BLUE}║${NC} %-24s │ %-8s │ %-10s │ %-15s ${BLUE}║${NC}\n" "Section" "Status" "Duration" "Failures"
    echo -e "${BLUE}╠════════════════════════════════════════════════════════════════════╣${NC}"
    
    for result in "${RESULTS[@]}"; do
        IFS='|' read -r section status duration failures <<< "$result"
        printf "${BLUE}║${NC} %-24s │ %-8s │ %-10s │ %-15s ${BLUE}║${NC}\n" "$section" "$status" "$duration" "${failures:0:15}"
    done
    
    echo -e "${BLUE}╠════════════════════════════════════════════════════════════════════╣${NC}"
    echo -e "${BLUE}║${NC} ${GREEN}PASSED: $PASSED${NC}  ${RED}FAILED: $FAILED${NC}  ${YELLOW}WARNINGS: $WARNINGS${NC}  Total: ${total_duration}ms       ${BLUE}║${NC}"
    echo -e "${BLUE}╚════════════════════════════════════════════════════════════════════╝${NC}"
    
    if [ $FAILED -gt 0 ]; then
        echo -e "\n${RED}❌ Pre-flight checks FAILED. Fix issues before running E2E tests.${NC}"
        exit 1
    else
        echo -e "\n${GREEN}✓ All pre-flight checks passed. Ready for E2E testing.${NC}"
        exit 0
    fi
}

#-------------------------------------------------------------------------------
# Main
#-------------------------------------------------------------------------------

main() {
    echo -e "${BLUE}"
    echo "╔═══════════════════════════════════════════════════════════════════╗"
    echo "║       GridWatch NetEnterprise - INFRASTRUCTURE PRE-FLIGHT CHECK       ║"
    echo "║                        $(date '+%Y-%m-%d %H:%M:%S')                         ║"
    echo "╚═══════════════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
    
    check_docker_containers
    check_postgresql
    check_redis
    check_nats
    check_vault
    check_victoriametrics
    check_observability
    check_gateway
    
    print_report
}

# Run if executed directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi
