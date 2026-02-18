#!/bin/bash
# GridWatch NetEnterprise - npm Workspaces Validation Script
#
# This script validates that npm workspaces are properly configured
# and functional across different platforms.
#
# Usage: ./scripts/validate-workspaces.sh
#
# Exit codes:
#   0 - All validations passed
#   1 - Validation failed

set -e

# Colors for output (disable on Windows or non-tty)
if [ -t 1 ] && [ "$(uname)" != "MINGW64_NT" ] 2>/dev/null; then
    RED='\033[0;31m'
    GREEN='\033[0;32m'
    YELLOW='\033[1;33m'
    BLUE='\033[0;34m'
    NC='\033[0m' # No Color
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

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}GridWatch NetEnterprise - Workspace Validator${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

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

# Detect platform
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
        MINGW*|MSYS*|CYGWIN*)
            PLATFORM="Windows (Git Bash)"
            ;;
        *)
            PLATFORM="Unknown ($(uname -s))"
            ;;
    esac

    log_success "Platform: $PLATFORM"
    echo ""
}

# Check Node.js and npm versions
check_prerequisites() {
    log_info "Checking prerequisites..."

    # Node.js version
    if ! command -v node &> /dev/null; then
        log_error "Node.js is not installed"
        return 1
    fi

    NODE_VERSION=$(node -v | sed 's/v//')
    NODE_MAJOR=$(echo "$NODE_VERSION" | cut -d. -f1)

    if [ "$NODE_MAJOR" -lt 20 ]; then
        log_error "Node.js version $NODE_VERSION is below required v20.0.0"
    else
        log_success "Node.js version: v$NODE_VERSION"
    fi

    # npm version
    if ! command -v npm &> /dev/null; then
        log_error "npm is not installed"
        return 1
    fi

    NPM_VERSION=$(npm -v)
    NPM_MAJOR=$(echo "$NPM_VERSION" | cut -d. -f1)

    if [ "$NPM_MAJOR" -lt 10 ]; then
        log_error "npm version $NPM_VERSION is below required v10.0.0"
    else
        log_success "npm version: v$NPM_VERSION"
    fi

    echo ""
}

# Validate root package.json
validate_root_package() {
    log_info "Validating root package.json..."

    if [ ! -f "$ROOT_DIR/package.json" ]; then
        log_error "Root package.json not found"
        return 1
    fi

    # Check workspaces field exists
    if ! grep -q '"workspaces"' "$ROOT_DIR/package.json"; then
        log_error "No 'workspaces' field in root package.json"
        return 1
    fi

    log_success "Root package.json exists with workspaces configuration"

    # Check packageManager field
    if grep -q '"packageManager"' "$ROOT_DIR/package.json"; then
        PACKAGE_MANAGER=$(grep '"packageManager"' "$ROOT_DIR/package.json" | sed 's/.*: *"\([^"]*\)".*/\1/')
        log_success "packageManager pinned: $PACKAGE_MANAGER"
    else
        log_warn "No packageManager field - consider pinning for consistency"
    fi

    # Check engines field
    if grep -q '"engines"' "$ROOT_DIR/package.json"; then
        log_success "engines field defined (enforces Node/npm versions)"
    else
        log_warn "No engines field - consider adding version constraints"
    fi

    echo ""
}

# Validate each workspace
validate_workspaces() {
    log_info "Validating workspace packages..."

    # Expected workspaces
    WORKSPACES=(
        "packages/shared-types"
        "packages/shared-auth"
        "services/auth-service"
        "apps/gateway"
        "apps/web-ui"
    )

    for ws in "${WORKSPACES[@]}"; do
        WS_PATH="$ROOT_DIR/$ws"
        WS_PKG="$WS_PATH/package.json"

        if [ ! -d "$WS_PATH" ]; then
            log_error "Workspace directory not found: $ws"
            continue
        fi

        if [ ! -f "$WS_PKG" ]; then
            log_error "package.json not found in $ws"
            continue
        fi

        # Validate package name
        PKG_NAME=$(grep '"name"' "$WS_PKG" | head -1 | sed 's/.*: *"\([^"]*\)".*/\1/')
        if [[ "$PKG_NAME" != @GridWatch/* ]]; then
            log_warn "$ws: Package name '$PKG_NAME' doesn't follow @GridWatch/* convention"
        else
            log_success "$ws: $PKG_NAME"
        fi

        # Check for required scripts
        if ! grep -q '"build"' "$WS_PKG"; then
            log_warn "$ws: No 'build' script defined"
        fi
    done

    echo ""
}

# Check for optional workspace packages
check_optional_packages() {
    log_info "Checking for optional workspace packages..."

    # shared-ui is referenced but may not exist yet
    if grep -q '"@GridWatch/shared-ui"' "$ROOT_DIR/apps/web-ui/package.json"; then
        if [ ! -d "$ROOT_DIR/packages/shared-ui" ]; then
            log_warn "packages/shared-ui is referenced in web-ui but doesn't exist"
        else
            log_success "packages/shared-ui exists"
        fi
    fi

    echo ""
}

# Validate inter-workspace dependencies
validate_dependencies() {
    log_info "Validating inter-workspace dependencies..."

    # Check that workspace packages use "*" version
    for pkg_file in "$ROOT_DIR"/packages/*/package.json "$ROOT_DIR"/apps/*/package.json "$ROOT_DIR"/services/*/package.json; do
        [ -f "$pkg_file" ] || continue

        PKG_NAME=$(basename "$(dirname "$pkg_file")")

        # Look for @GridWatch/* dependencies
        INTERNAL_DEPS=$(grep -o '"@GridWatch/[^"]*"' "$pkg_file" 2>/dev/null | sort -u || true)

        for dep in $INTERNAL_DEPS; do
            # Check if it uses "*" version
            if grep -q "$dep: *\"\*\"" "$pkg_file" 2>/dev/null || grep -q "$dep\": *\"\*\"" "$pkg_file" 2>/dev/null; then
                log_success "$PKG_NAME depends on $dep with workspace resolution"
            else
                VERSION=$(grep -A1 "$dep" "$pkg_file" | grep -v "$dep" | head -1 | tr -d ' ",')
                if [ -n "$VERSION" ]; then
                    log_warn "$PKG_NAME: $dep uses version '$VERSION' instead of '*'"
                fi
            fi
        done
    done

    echo ""
}

# Test npm workspace commands
test_npm_commands() {
    log_info "Testing npm workspace commands..."

    cd "$ROOT_DIR"

    # Test workspace list
    log_info "Listing workspaces..."
    if npm query ':scope' --json > /dev/null 2>&1; then
        WORKSPACE_COUNT=$(npm query ':scope' 2>/dev/null | grep -c '"name"' || echo "0")
        log_success "Found $WORKSPACE_COUNT workspace packages"
    else
        # Fallback for older npm versions
        if npm ls --workspaces --depth=0 > /dev/null 2>&1; then
            log_success "npm ls --workspaces succeeded"
        else
            log_error "npm workspace listing failed"
        fi
    fi

    # Test running a command in a specific workspace
    log_info "Testing workspace-specific command..."
    if npm run --workspace=packages/shared-types --if-present typecheck > /dev/null 2>&1; then
        log_success "Workspace-specific commands work"
    else
        log_warn "Workspace-specific command failed (may need build first)"
    fi

    echo ""
}

# Check for common cross-platform issues
check_cross_platform() {
    log_info "Checking for cross-platform compatibility..."

    # Check for shebang in scripts
    SCRIPTS_DIR="$ROOT_DIR/scripts"
    if [ -d "$SCRIPTS_DIR" ]; then
        for script in "$SCRIPTS_DIR"/*.sh; do
            [ -f "$script" ] || continue
            if head -1 "$script" | grep -q '^#!/bin/bash'; then
                log_success "$(basename "$script"): Has bash shebang"
            elif head -1 "$script" | grep -q '^#!/usr/bin/env'; then
                log_success "$(basename "$script"): Has portable shebang"
            else
                log_warn "$(basename "$script"): No standard shebang"
            fi
        done
    fi

    # Check for Windows-incompatible commands in package.json scripts
    log_info "Checking scripts for Windows compatibility..."

    for pkg_file in "$ROOT_DIR"/package.json "$ROOT_DIR"/packages/*/package.json "$ROOT_DIR"/apps/*/package.json "$ROOT_DIR"/services/*/package.json; do
        [ -f "$pkg_file" ] || continue

        PKG_NAME=$(basename "$(dirname "$pkg_file")")
        [ "$PKG_NAME" = "GridWatch NetEnterprise" ] && PKG_NAME="root"

        # Check for rm -rf (use rimraf instead for Windows)
        if grep -q '"rm -rf' "$pkg_file" 2>/dev/null; then
            log_warn "$PKG_NAME: 'rm -rf' may not work on Windows - consider using 'rimraf'"
        fi

        # Check for forward slashes in paths (generally OK, but note it)
        # Most tools handle this correctly on Windows
    done

    echo ""
}

# Check Turbo.json configuration
check_turbo() {
    log_info "Checking Turborepo configuration..."

    TURBO_FILE="$ROOT_DIR/turbo.json"

    if [ ! -f "$TURBO_FILE" ]; then
        log_warn "turbo.json not found - Turborepo not configured"
        return
    fi

    log_success "turbo.json exists"

    # Check for essential pipeline tasks
    for task in "build" "dev" "test" "lint" "typecheck"; do
        if grep -q "\"$task\"" "$TURBO_FILE"; then
            log_success "Pipeline task '$task' defined"
        else
            log_warn "Pipeline task '$task' not defined"
        fi
    done

    echo ""
}

# Validate lock file
check_lockfile() {
    log_info "Checking package lock file..."

    if [ -f "$ROOT_DIR/package-lock.json" ]; then
        log_success "package-lock.json exists"

        # Check lock file version
        LOCK_VERSION=$(grep '"lockfileVersion"' "$ROOT_DIR/package-lock.json" | head -1 | grep -o '[0-9]*')
        if [ "$LOCK_VERSION" -ge 3 ]; then
            log_success "Lock file version $LOCK_VERSION (npm 7+ compatible)"
        else
            log_warn "Lock file version $LOCK_VERSION - consider regenerating with npm 7+"
        fi
    else
        log_error "package-lock.json not found - run 'npm install' to generate"
    fi

    # Warn if yarn.lock exists (mixed package managers)
    if [ -f "$ROOT_DIR/yarn.lock" ]; then
        log_warn "yarn.lock found - remove if using npm workspaces"
    fi

    # Warn if pnpm-lock.yaml exists (mixed package managers)
    if [ -f "$ROOT_DIR/pnpm-lock.yaml" ]; then
        log_warn "pnpm-lock.yaml found - remove if using npm workspaces"
    fi

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
        echo "npm workspaces are properly configured for cross-platform use."
    else
        echo -e "${RED}$FAILURES validation(s) failed${NC}"
        echo ""
        echo "Please address the issues above before deploying."
    fi

    echo ""
    echo -e "${BLUE}Platform-specific notes:${NC}"
    echo "  - macOS: Works out of the box with Docker Desktop"
    echo "  - RHEL 9: Compatible with Podman (use podman-compose)"
    echo "  - Windows: Use Git Bash or WSL2 for shell scripts"
    echo ""
}

# Run all checks
main() {
    detect_platform
    check_prerequisites
    validate_root_package
    validate_workspaces
    check_optional_packages
    validate_dependencies
    test_npm_commands
    check_cross_platform
    check_turbo
    check_lockfile
    print_summary

    exit $FAILURES
}

main
