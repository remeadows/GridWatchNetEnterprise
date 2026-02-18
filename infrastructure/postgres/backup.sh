#!/bin/bash
# ===========================================
# GridWatch NetEnterprise - PostgreSQL Backup Script
# ===========================================
# Creates compressed backups of the PostgreSQL database.
#
# Usage:
#   ./backup.sh [OPTIONS]
#
# Options:
#   --output DIR    Backup output directory (default: ./backups)
#   --keep N        Number of backups to retain (default: 7)
#   --compress      Use gzip compression (default: true)
#   --schemas       Comma-separated list of schemas (default: all)
#
# Environment variables:
#   POSTGRES_HOST, POSTGRES_PORT, POSTGRES_DB, POSTGRES_USER, POSTGRES_PASSWORD
#   Or: POSTGRES_URL (connection string)

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Default configuration
OUTPUT_DIR="${BACKUP_OUTPUT_DIR:-./backups}"
KEEP_BACKUPS="${BACKUP_KEEP:-7}"
COMPRESS=true
SCHEMAS=""
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# Database connection defaults
POSTGRES_HOST="${POSTGRES_HOST:-localhost}"
POSTGRES_PORT="${POSTGRES_PORT:-5432}"
POSTGRES_DB="${POSTGRES_DB:-GridWatch}"
POSTGRES_USER="${POSTGRES_USER:-GridWatch}"

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --output)
      OUTPUT_DIR="$2"
      shift 2
      ;;
    --keep)
      KEEP_BACKUPS="$2"
      shift 2
      ;;
    --no-compress)
      COMPRESS=false
      shift
      ;;
    --schemas)
      SCHEMAS="$2"
      shift 2
      ;;
    -h|--help)
      echo "Usage: $0 [OPTIONS]"
      echo "  --output DIR    Backup directory (default: ./backups)"
      echo "  --keep N        Backups to retain (default: 7)"
      echo "  --no-compress   Disable gzip compression"
      echo "  --schemas LIST  Comma-separated schemas to backup"
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

echo -e "${GREEN}GridWatch NetEnterprise - PostgreSQL Backup${NC}"
echo "============================================"
echo ""
echo "Database: $POSTGRES_DB@$POSTGRES_HOST:$POSTGRES_PORT"
echo "Output: $OUTPUT_DIR"
echo "Timestamp: $TIMESTAMP"
echo ""

# Create output directory
mkdir -p "$OUTPUT_DIR"

# Build backup filename
BACKUP_FILE="$OUTPUT_DIR/GridWatch_${POSTGRES_DB}_${TIMESTAMP}"

# Build pg_dump options
PG_DUMP_OPTS=(
  "--host=$POSTGRES_HOST"
  "--port=$POSTGRES_PORT"
  "--username=$POSTGRES_USER"
  "--dbname=$POSTGRES_DB"
  "--format=custom"
  "--verbose"
  "--file=${BACKUP_FILE}.dump"
)

# Add schema filters if specified
if [ -n "$SCHEMAS" ]; then
  IFS=',' read -ra SCHEMA_ARRAY <<< "$SCHEMAS"
  for schema in "${SCHEMA_ARRAY[@]}"; do
    PG_DUMP_OPTS+=("--schema=$schema")
  done
  echo "Schemas: $SCHEMAS"
fi

echo ""
echo -e "${YELLOW}Starting backup...${NC}"

# Set password for pg_dump
export PGPASSWORD="${POSTGRES_PASSWORD:-}"

# Check if running in Docker context
if command -v docker &> /dev/null && docker ps --format '{{.Names}}' | grep -q "GridWatch-postgres"; then
  echo "Using Docker container for backup..."

  # Run pg_dump inside the container
  docker exec -e PGPASSWORD="$PGPASSWORD" GridWatch-postgres \
    pg_dump \
    --username="$POSTGRES_USER" \
    --dbname="$POSTGRES_DB" \
    --format=custom \
    --verbose \
    > "${BACKUP_FILE}.dump" 2>&1
else
  # Run pg_dump directly
  pg_dump "${PG_DUMP_OPTS[@]}" 2>&1
fi

# Check if backup was successful
if [ ! -f "${BACKUP_FILE}.dump" ] || [ ! -s "${BACKUP_FILE}.dump" ]; then
  echo -e "${RED}ERROR: Backup failed - output file is empty or missing${NC}"
  exit 1
fi

BACKUP_SIZE=$(du -h "${BACKUP_FILE}.dump" | cut -f1)
echo -e "${GREEN}Backup created: ${BACKUP_FILE}.dump ($BACKUP_SIZE)${NC}"

# Compress if enabled
if [ "$COMPRESS" = true ]; then
  echo -e "${YELLOW}Compressing backup...${NC}"
  gzip "${BACKUP_FILE}.dump"
  BACKUP_FILE="${BACKUP_FILE}.dump.gz"
  COMPRESSED_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
  echo -e "${GREEN}Compressed: $BACKUP_FILE ($COMPRESSED_SIZE)${NC}"
else
  BACKUP_FILE="${BACKUP_FILE}.dump"
fi

# Create a latest symlink
ln -sf "$(basename "$BACKUP_FILE")" "$OUTPUT_DIR/latest"

# Cleanup old backups
echo ""
echo -e "${YELLOW}Cleaning up old backups (keeping $KEEP_BACKUPS)...${NC}"
cd "$OUTPUT_DIR"
ls -t GridWatch_*.dump* 2>/dev/null | tail -n +$((KEEP_BACKUPS + 1)) | xargs -r rm -f
REMAINING=$(ls -1 GridWatch_*.dump* 2>/dev/null | wc -l)
echo "Remaining backups: $REMAINING"

# Generate backup manifest
echo ""
echo -e "${YELLOW}Generating backup manifest...${NC}"
cat > "$OUTPUT_DIR/manifest.json" << EOF
{
  "latest_backup": "$(basename "$BACKUP_FILE")",
  "timestamp": "$TIMESTAMP",
  "database": "$POSTGRES_DB",
  "host": "$POSTGRES_HOST",
  "schemas": "${SCHEMAS:-all}",
  "compressed": $COMPRESS,
  "retention": $KEEP_BACKUPS,
  "backups": [
$(ls -1t GridWatch_*.dump* 2>/dev/null | head -$KEEP_BACKUPS | while read f; do
  size=$(du -h "$f" | cut -f1)
  echo "    {\"file\": \"$f\", \"size\": \"$size\"},"
done | sed '$ s/,$//')
  ]
}
EOF

echo ""
echo "============================================"
echo -e "${GREEN}Backup complete!${NC}"
echo "============================================"
echo ""
echo "Backup file: $BACKUP_FILE"
echo "Manifest: $OUTPUT_DIR/manifest.json"
echo ""
echo "To restore:"
echo "  ./restore.sh --input $BACKUP_FILE"
