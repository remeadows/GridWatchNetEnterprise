#!/bin/bash
# GridWatch NetEnterprise - Poetry Validation Script
#
# This script validates that Poetry is properly installed and configured
# on Linux/macOS systems.
#
# Usage: ./scripts/validate-poetry.sh
#
# Exit codes:
#   0 - All validations passed
#   1 - Validation failed

set -e

# Colors for output (disable on non-tty)
if [ -t 1 ]; then
    RED='\033[0;31m'
    GREEN='\033[0;32m'
    YELLOW='\033[1;33m'
    BLUE='\033[0;34m'
    NC='\033[0m'
else
    RED=''
    GREEN=''
    YELLOW=''
    BLUE=''
    NC=''
fi

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

# Track failures
FAILURES=0

# Helper functions
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
    FAILURES=$((FAILURES + 1))
}

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}GridWatch NetEnterprise - Poetry Validator${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Platform detection
detect_platform() {
    log_info "Detecting platform..."

    case "$(uname -s)" in
        Darwin*)
            PLATFORM="macOS"
            ;;
        Linux*)
            if [ -f /etc/redhat-release ]; then
                PLATFORM="RHEL/CentOS"
            elif [ -f /etc/os-release ]; then
                PLATFORM="Linux ($(grep '^ID=' /etc/os-release | cut -d= -f2 | tr -d '"'))"
            else
                PLATFORM="Linux"
            fi
            ;;
        *)
            PLATFORM="Unknown ($(uname -s))"
            ;;
    esac

    log_success "Platform: $PLATFORM"
    echo ""
}

# Check Python installation
check_python() {
    log_info "Checking Python installation..."

    PYTHON_CMD=""
    for cmd in python3 python; do
        if command -v $cmd &> /dev/null; then
            VERSION=$($cmd --version 2>&1 | grep -oE '[0-9]+\.[0-9]+\.[0-9]+')
            MAJOR=$(echo "$VERSION" | cut -d. -f1)
            MINOR=$(echo "$VERSION" | cut -d. -f2)
            if [ "$MAJOR" -eq 3 ] && [ "$MINOR" -ge 11 ]; then
                PYTHON_CMD=$cmd
                break
            fi
        fi
    done

    if [ -z "$PYTHON_CMD" ]; then
        log_error "Python 3.11+ not found"
        echo ""
        echo "Installation instructions:"
        echo "  macOS:   brew install python@3.11"
        echo "  RHEL 9:  dnf install python3.11"
        echo "  Ubuntu:  apt install python3.11"
        echo ""
        return 1
    fi

    PYTHON_VERSION=$($PYTHON_CMD --version 2>&1 | grep -oE '[0-9]+\.[0-9]+\.[0-9]+')
    log_success "Python version: $PYTHON_VERSION (using $PYTHON_CMD)"

    # Check pip
    if $PYTHON_CMD -m pip --version &> /dev/null; then
        PIP_VERSION=$($PYTHON_CMD -m pip --version | awk '{print $2}')
        log_success "pip version: $PIP_VERSION"
    else
        log_warn "pip not available"
    fi

    echo ""
}

# Check Poetry installation
check_poetry() {
    log_info "Checking Poetry installation..."

    if ! command -v poetry &> /dev/null; then
        log_error "Poetry not found"
        echo ""
        echo "Installation instructions:"
        echo "  Official (recommended):"
        echo "    curl -sSL https://install.python-poetry.org | python3 -"
        echo ""
        echo "  pipx:"
        echo "    pipx install poetry"
        echo ""
        echo "  pip:"
        echo "    pip install poetry"
        echo ""
        echo "After installation, ensure ~/.local/bin is in your PATH"
        return 1
    fi

    POETRY_VERSION=$(poetry --version 2>&1 | sed 's/Poetry (version //' | sed 's/)//')
    log_success "Poetry version: $POETRY_VERSION"

    # Check configuration
    VENV_IN_PROJECT=$(poetry config virtualenvs.in-project 2>/dev/null || echo "null")
    if [ "$VENV_IN_PROJECT" = "true" ]; then
        log_success "virtualenvs.in-project = true (project-local venv)"
    else
        log_warn "virtualenvs.in-project = $VENV_IN_PROJECT (consider setting to true)"
        echo "  To set: poetry config virtualenvs.in-project true"
    fi

    echo ""
}

# Validate pyproject.toml
validate_pyproject() {
    log_info "Validating pyproject.toml..."

    PYPROJECT="$ROOT_DIR/pyproject.toml"

    if [ ! -f "$PYPROJECT" ]; then
        log_error "pyproject.toml not found at $PYPROJECT"
        return 1
    fi

    log_success "Root pyproject.toml found"

    # Check for Poetry section
    if grep -q '\[tool\.poetry\]' "$PYPROJECT"; then
        log_success "Poetry configuration section present"
    else
        log_error "No [tool.poetry] section found"
    fi

    # Check Python version constraint
    if grep -qE 'python\s*=\s*"[\^~]?3\.11' "$PYPROJECT"; then
        log_success "Python 3.11+ requirement specified"
    else
        log_warn "Python version constraint may not match 3.11+"
    fi

    # Check for platform-specific dependencies
    if grep -q 'uvloop' "$PYPROJECT"; then
        log_warn "uvloop is Linux/macOS only - Windows users need a fallback"
    fi

    # Check app pyproject files
    for app in ipam npm stig; do
        APP_PYPROJECT="$ROOT_DIR/apps/$app/pyproject.toml"
        if [ -f "$APP_PYPROJECT" ]; then
            log_success "Found: apps/$app/pyproject.toml"
        else
            log_warn "Missing: apps/$app/pyproject.toml"
        fi
    done

    echo ""
}

# Check poetry.lock
check_lock_file() {
    log_info "Checking poetry.lock..."

    LOCK_FILE="$ROOT_DIR/poetry.lock"

    if [ ! -f "$LOCK_FILE" ]; then
        log_warn "poetry.lock not found - run 'poetry lock' to generate"
    else
        log_success "poetry.lock exists"

        # Check if lock is current
        cd "$ROOT_DIR"
        if poetry check &> /dev/null; then
            log_success "poetry.lock is up to date"
        else
            log_warn "poetry.lock may be out of sync - run 'poetry lock'"
        fi
    fi

    echo ""
}

# Test dependency installation (dry run)
test_install() {
    log_info "Testing Poetry install (dry run)..."

    cd "$ROOT_DIR"

    if poetry install --dry-run &> /dev/null; then
        log_success "Dependencies can be resolved"
    else
        log_error "Dependency resolution failed"
        echo "Run 'poetry install --dry-run' to see details"
    fi

    echo ""
}

# Platform-specific checks
platform_checks() {
    log_info "Performing platform-specific checks..."

    case "$(uname -s)" in
        Darwin*)
            # macOS checks
            if xcode-select -p &> /dev/null; then
                log_success "Xcode Command Line Tools installed"
            else
                log_warn "Xcode Command Line Tools not found - may be needed for native extensions"
                echo "  Install: xcode-select --install"
            fi
            ;;
        Linux*)
            # Linux checks
            if command -v gcc &> /dev/null; then
                GCC_VERSION=$(gcc --version | head -1)
                log_success "GCC available: $GCC_VERSION"
            else
                log_warn "GCC not found - may be needed for native extensions"
                echo "  RHEL: dnf install gcc"
                echo "  Ubuntu: apt install build-essential"
            fi

            # Check for libffi (needed for some packages)
            if ldconfig -p 2>/dev/null | grep -q libffi || [ -f /usr/lib/libffi.so ]; then
                log_success "libffi available"
            else
                log_warn "libffi not found - may be needed for some packages"
            fi
            ;;
    esac

    echo ""
}

# Summary
print_summary() {
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}Validation Summary${NC}"
    echo -e "${BLUE}========================================${NC}"
    echo ""

    if [ $FAILURES -eq 0 ]; then
        echo -e "${GREEN}All validations passed!${NC}"
        echo ""
        echo "Poetry is properly configured."
        echo ""
        echo "Next steps:"
        echo "  1. cd to project root"
        echo "  2. poetry install"
        echo "  3. poetry shell (to activate virtual environment)"
        echo ""
    else
        echo -e "${RED}$FAILURES validation(s) failed${NC}"
        echo ""
        echo "Please address the issues above before proceeding."
    fi

    echo "Platform notes:"
    echo "  - Use 'poetry shell' or 'poetry run' to execute commands"
    echo "  - Run 'poetry install --with dev' for development dependencies"
    echo "  - Run 'poetry install --with ipam,npm,stig' for optional groups"
    echo ""
}

# Main
main() {
    detect_platform
    check_python
    check_poetry
    validate_pyproject
    check_lock_file
    test_install
    platform_checks
    print_summary

    exit $FAILURES
}

main
