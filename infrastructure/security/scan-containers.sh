#!/bin/bash
# ===========================================
# NetNynja Enterprise - Container Security Scanner
# ===========================================
# Local container vulnerability scanning using Trivy.
#
# Usage:
#   ./scan-containers.sh [OPTIONS]
#
# Options:
#   --all           Scan all running containers
#   --image IMAGE   Scan a specific image
#   --severity SEV  Minimum severity (CRITICAL,HIGH,MEDIUM,LOW)
#   --output DIR    Output directory for reports
#   --format FMT    Output format (table, json, sarif)
#   --fix           Show fix versions for vulnerabilities
#
# Prerequisites:
#   - Docker must be running
#   - Trivy must be installed (or will use Docker)

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Default configuration
SCAN_ALL=false
SPECIFIC_IMAGE=""
SEVERITY="CRITICAL,HIGH"
OUTPUT_DIR="./security-reports"
FORMAT="table"
SHOW_FIX=false
TRIVY_CMD=""

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --all)
      SCAN_ALL=true
      shift
      ;;
    --image)
      SPECIFIC_IMAGE="$2"
      shift 2
      ;;
    --severity)
      SEVERITY="$2"
      shift 2
      ;;
    --output)
      OUTPUT_DIR="$2"
      shift 2
      ;;
    --format)
      FORMAT="$2"
      shift 2
      ;;
    --fix)
      SHOW_FIX=true
      shift
      ;;
    -h|--help)
      echo "Usage: $0 [OPTIONS]"
      echo "  --all           Scan all running NetNynja containers"
      echo "  --image IMAGE   Scan a specific image"
      echo "  --severity SEV  Severity levels (default: CRITICAL,HIGH)"
      echo "  --output DIR    Output directory (default: ./security-reports)"
      echo "  --format FMT    Output format: table, json, sarif"
      echo "  --fix           Show available fix versions"
      exit 0
      ;;
    *)
      echo -e "${RED}Unknown option: $1${NC}"
      exit 1
      ;;
  esac
done

echo -e "${GREEN}NetNynja Enterprise - Container Security Scanner${NC}"
echo "=================================================="
echo ""

# Create output directory
mkdir -p "$OUTPUT_DIR"

# Determine Trivy command
if command -v trivy &> /dev/null; then
  TRIVY_CMD="trivy"
  echo -e "${GREEN}Using local Trivy installation${NC}"
elif command -v docker &> /dev/null; then
  TRIVY_CMD="docker run --rm -v /var/run/docker.sock:/var/run/docker.sock -v $HOME/.cache/trivy:/root/.cache/trivy aquasec/trivy:latest"
  echo -e "${YELLOW}Using Trivy via Docker${NC}"
else
  echo -e "${RED}ERROR: Neither Trivy nor Docker is available${NC}"
  exit 1
fi

# Function to scan an image
scan_image() {
  local image="$1"
  local name=$(echo "$image" | sed 's/[^a-zA-Z0-9]/_/g')
  local timestamp=$(date +%Y%m%d_%H%M%S)

  echo ""
  echo -e "${BLUE}Scanning: $image${NC}"
  echo "----------------------------------------"

  # Build scan command
  local scan_opts="--severity $SEVERITY"
  [ "$FORMAT" != "table" ] && scan_opts="$scan_opts --format $FORMAT"
  [ "$SHOW_FIX" = true ] && scan_opts="$scan_opts --ignore-unfixed"

  # Run scan
  if [ "$FORMAT" = "table" ]; then
    $TRIVY_CMD image $scan_opts "$image" 2>&1 | tee "$OUTPUT_DIR/${name}_${timestamp}.txt"
  else
    $TRIVY_CMD image $scan_opts "$image" > "$OUTPUT_DIR/${name}_${timestamp}.${FORMAT}" 2>&1
    echo "Report saved to: $OUTPUT_DIR/${name}_${timestamp}.${FORMAT}"
  fi

  # Get vulnerability count
  local crit_count=$($TRIVY_CMD image --format json --severity CRITICAL "$image" 2>/dev/null | grep -c '"VulnerabilityID"' || echo "0")
  local high_count=$($TRIVY_CMD image --format json --severity HIGH "$image" 2>/dev/null | grep -c '"VulnerabilityID"' || echo "0")

  echo ""
  echo -e "Critical: ${RED}$crit_count${NC} | High: ${YELLOW}$high_count${NC}"
  echo ""

  return 0
}

# Function to scan filesystem
scan_filesystem() {
  local path="${1:-.}"

  echo ""
  echo -e "${BLUE}Scanning filesystem: $path${NC}"
  echo "----------------------------------------"

  $TRIVY_CMD fs --severity "$SEVERITY" "$path"
}

# Function to scan config files
scan_config() {
  local path="${1:-.}"

  echo ""
  echo -e "${BLUE}Scanning configuration: $path${NC}"
  echo "----------------------------------------"

  $TRIVY_CMD config --severity "$SEVERITY" "$path"
}

# Main scanning logic
if [ -n "$SPECIFIC_IMAGE" ]; then
  # Scan specific image
  scan_image "$SPECIFIC_IMAGE"
elif [ "$SCAN_ALL" = true ]; then
  # Scan all NetNynja containers
  echo "Discovering NetNynja containers..."

  CONTAINERS=$(docker ps --format '{{.Image}}' | grep -E '(netnynja|postgres|redis|vault|grafana|loki|nats|victoriametrics|jaeger|prometheus)' | sort -u)

  if [ -z "$CONTAINERS" ]; then
    echo -e "${YELLOW}No NetNynja containers found running${NC}"
    exit 0
  fi

  echo "Found containers:"
  echo "$CONTAINERS" | sed 's/^/  - /'
  echo ""

  FAILED=0
  for image in $CONTAINERS; do
    scan_image "$image" || FAILED=$((FAILED + 1))
  done

  echo ""
  echo "=================================================="
  echo -e "${GREEN}Scan complete!${NC}"
  echo "Reports saved to: $OUTPUT_DIR"

  if [ $FAILED -gt 0 ]; then
    echo -e "${YELLOW}$FAILED image(s) had vulnerabilities above threshold${NC}"
  fi
else
  # Default: scan infrastructure images used in docker-compose
  echo "Scanning standard NetNynja images..."
  echo ""

  IMAGES=(
    "postgres:15-alpine"
    "redis:7-alpine"
    "hashicorp/vault:1.15"
    "grafana/grafana:10.2.0"
    "grafana/loki:2.9.0"
    "grafana/promtail:2.9.0"
    "prom/prometheus:v2.48.0"
    "victoriametrics/victoria-metrics:v1.96.0"
    "jaegertracing/all-in-one:1.51"
    "nats:2.10-alpine"
  )

  FAILED=0
  for image in "${IMAGES[@]}"; do
    # Pull image if not present
    docker pull "$image" -q &>/dev/null || true
    scan_image "$image" || FAILED=$((FAILED + 1))
  done

  echo ""
  echo "=================================================="

  # Also scan local config files
  echo ""
  echo -e "${BLUE}Scanning Infrastructure as Code...${NC}"
  echo "----------------------------------------"
  $TRIVY_CMD config --severity "$SEVERITY" . 2>&1 | tee "$OUTPUT_DIR/iac_scan_$(date +%Y%m%d_%H%M%S).txt" || true

  echo ""
  echo "=================================================="
  echo -e "${GREEN}Scan complete!${NC}"
  echo "Reports saved to: $OUTPUT_DIR"
fi

# Generate summary
echo ""
echo "Summary:"
echo "  - Severity threshold: $SEVERITY"
echo "  - Output format: $FORMAT"
echo "  - Reports directory: $OUTPUT_DIR"
echo ""
echo "To scan a specific image:"
echo "  $0 --image your-image:tag"
echo ""
echo "To scan with lower severity threshold:"
echo "  $0 --severity CRITICAL,HIGH,MEDIUM"
