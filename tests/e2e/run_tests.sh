#!/bin/bash
#===============================================================================
# GridWatch NetEnterprise - E2E Test Runner
# 
# Usage:
#   ./run_tests.sh              # Run all tests
#   ./run_tests.sh --quick      # Quick smoke test (infrastructure + auth)
#   ./run_tests.sh --api        # API tests only
#   ./run_tests.sh --frontend   # Frontend tests only
#   ./run_tests.sh --module npm # Specific module tests
#===============================================================================

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VENV_DIR="${SCRIPT_DIR}/.venv"
REPORTS_DIR="${SCRIPT_DIR}/reports"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# Default settings
RUN_INFRASTRUCTURE=true
RUN_API=true
RUN_FRONTEND=true
PARALLEL=false
MODULE=""
QUICK_MODE=false
VERBOSE=false

#-------------------------------------------------------------------------------
# Functions
#-------------------------------------------------------------------------------

print_banner() {
    echo -e "${CYAN}"
    echo "╔═══════════════════════════════════════════════════════════════════╗"
    echo "║           GridWatch NetEnterprise - E2E TEST SUITE                    ║"
    echo "║                      $(date '+%Y-%m-%d %H:%M:%S')                          ║"
    echo "╚═══════════════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
}

usage() {
    echo "Usage: $0 [options]"
    echo ""
    echo "Options:"
    echo "  --quick         Quick smoke test (infrastructure + auth only)"
    echo "  --api           Run API tests only"
    echo "  --frontend      Run frontend tests only"
    echo "  --infrastructure Run infrastructure pre-flight only"
    echo "  --module <name> Run tests for specific module (ipam|npm|stig)"
    echo "  --parallel      Run tests in parallel (faster, less isolated)"
    echo "  --verbose, -v   Verbose output"
    echo "  --help, -h      Show this help"
    echo ""
    echo "Examples:"
    echo "  $0                    # Full test suite"
    echo "  $0 --quick            # Quick validation"
    echo "  $0 --module ipam      # IPAM module tests only"
    echo "  $0 --api --parallel   # API tests in parallel"
}

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[PASS]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[FAIL]${NC} $1"
}

check_dependencies() {
    log_info "Checking dependencies..."
    
    # Check Python
    if ! command -v python3 &> /dev/null; then
        log_error "Python 3 is required but not installed"
        exit 1
    fi
    
    # Check Docker
    if ! command -v docker &> /dev/null; then
        log_error "Docker is required but not installed"
        exit 1
    fi
    
    # Check if Docker is running
    if ! docker info &> /dev/null; then
        log_error "Docker daemon is not running"
        exit 1
    fi
    
    log_success "Dependencies OK"
}

setup_virtualenv() {
    log_info "Setting up Python virtual environment..."
    
    if [ ! -d "$VENV_DIR" ]; then
        python3 -m venv "$VENV_DIR"
    fi
    
    source "$VENV_DIR/bin/activate"
    
    # Upgrade pip
    pip install --quiet --upgrade pip
    
    # Install dependencies
    pip install --quiet -r "$SCRIPT_DIR/requirements.txt"
    
    # Install Playwright browsers
    playwright install chromium --with-deps &> /dev/null || true
    
    log_success "Virtual environment ready"
}

run_infrastructure_checks() {
    log_info "Running infrastructure pre-flight checks..."
    
    chmod +x "$SCRIPT_DIR/infrastructure/preflight.sh"
    
    if "$SCRIPT_DIR/infrastructure/preflight.sh"; then
        log_success "Infrastructure checks passed"
        return 0
    else
        log_error "Infrastructure checks failed"
        return 1
    fi
}

run_api_tests() {
    local pytest_args=()
    
    # Base arguments
    pytest_args+=(
        "-v"
        "--tb=short"
        "--html=${REPORTS_DIR}/api-report-${TIMESTAMP}.html"
        "--self-contained-html"
    )
    
    # Add marker filters
    if [ -n "$MODULE" ]; then
        pytest_args+=("-m" "$MODULE")
    fi
    
    # Quick mode - just infrastructure and auth
    if [ "$QUICK_MODE" = true ]; then
        pytest_args+=("-m" "infrastructure or auth")
    fi
    
    # Parallel execution
    if [ "$PARALLEL" = true ]; then
        pytest_args+=("-n" "auto")
    fi
    
    # Verbose mode
    if [ "$VERBOSE" = true ]; then
        pytest_args+=("--capture=no")
    fi
    
    log_info "Running API tests..."
    log_info "pytest ${pytest_args[*]}"
    
    cd "$SCRIPT_DIR"

    # Test files are in the root Testing directory (test_*.py)
    if pytest "${pytest_args[@]}" test_01_authentication.py test_02_gateway.py test_03_ipam.py test_04_npm.py test_05_stig.py test_06_integration.py; then
        log_success "API tests passed"
        return 0
    else
        log_error "API tests failed"
        return 1
    fi
}

run_frontend_tests() {
    local pytest_args=()
    
    pytest_args+=(
        "-v"
        "--tb=short"
        "--html=${REPORTS_DIR}/frontend-report-${TIMESTAMP}.html"
        "--self-contained-html"
    )
    
    if [ "$VERBOSE" = true ]; then
        pytest_args+=("--capture=no")
    fi
    
    log_info "Running frontend tests..."

    cd "$SCRIPT_DIR"

    # Frontend test file is test_frontend.py
    if pytest "${pytest_args[@]}" test_frontend.py; then
        log_success "Frontend tests passed"
        return 0
    else
        log_error "Frontend tests failed"
        return 1
    fi
}

generate_summary_report() {
    log_info "Generating summary report..."
    
    local summary_file="${REPORTS_DIR}/summary-${TIMESTAMP}.txt"
    
    cat > "$summary_file" << EOF
GridWatch NetEnterprise E2E Test Summary
=====================================
Date: $(date)
Timestamp: ${TIMESTAMP}

Test Configuration:
- Infrastructure: ${RUN_INFRASTRUCTURE}
- API Tests: ${RUN_API}
- Frontend Tests: ${RUN_FRONTEND}
- Module Filter: ${MODULE:-all}
- Quick Mode: ${QUICK_MODE}
- Parallel: ${PARALLEL}

Reports Generated:
$(ls -la "${REPORTS_DIR}"/*-${TIMESTAMP}.* 2>/dev/null || echo "  None")

EOF
    
    log_success "Summary report: $summary_file"
}

#-------------------------------------------------------------------------------
# Parse Arguments
#-------------------------------------------------------------------------------

while [[ $# -gt 0 ]]; do
    case $1 in
        --quick)
            QUICK_MODE=true
            shift
            ;;
        --api)
            RUN_INFRASTRUCTURE=true
            RUN_API=true
            RUN_FRONTEND=false
            shift
            ;;
        --frontend)
            RUN_INFRASTRUCTURE=false
            RUN_API=false
            RUN_FRONTEND=true
            shift
            ;;
        --infrastructure)
            RUN_INFRASTRUCTURE=true
            RUN_API=false
            RUN_FRONTEND=false
            shift
            ;;
        --module)
            MODULE="$2"
            shift 2
            ;;
        --parallel)
            PARALLEL=true
            shift
            ;;
        --verbose|-v)
            VERBOSE=true
            shift
            ;;
        --help|-h)
            usage
            exit 0
            ;;
        *)
            log_error "Unknown option: $1"
            usage
            exit 1
            ;;
    esac
done

#-------------------------------------------------------------------------------
# Main
#-------------------------------------------------------------------------------

main() {
    print_banner
    
    # Create reports directory
    mkdir -p "$REPORTS_DIR"
    
    # Track exit codes
    local exit_code=0
    
    # Check dependencies
    check_dependencies
    
    # Setup virtual environment
    setup_virtualenv
    
    # Run tests
    if [ "$RUN_INFRASTRUCTURE" = true ]; then
        run_infrastructure_checks || exit_code=1
        
        if [ $exit_code -ne 0 ]; then
            log_error "Infrastructure checks failed. Fix issues before continuing."
            
            if [ "$QUICK_MODE" = false ]; then
                log_warn "Use --quick to skip full test suite after infrastructure failure"
            fi
            
            exit $exit_code
        fi
    fi
    
    if [ "$RUN_API" = true ]; then
        run_api_tests || exit_code=1
    fi
    
    if [ "$RUN_FRONTEND" = true ]; then
        run_frontend_tests || exit_code=1
    fi
    
    # Generate summary
    generate_summary_report
    
    # Final status
    echo ""
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    
    if [ $exit_code -eq 0 ]; then
        echo -e "${GREEN}✓ ALL TESTS PASSED${NC}"
    else
        echo -e "${RED}✗ SOME TESTS FAILED${NC}"
        echo -e "  Check reports in: ${REPORTS_DIR}"
    fi
    
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    
    exit $exit_code
}

# Run main
main "$@"
