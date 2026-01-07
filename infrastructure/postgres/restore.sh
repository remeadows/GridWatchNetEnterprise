#!/bin/bash
# ===========================================
# NetNynja Enterprise - PostgreSQL Restore Script
# ===========================================
# Restores a PostgreSQL database from a backup created by backup.sh.
#
# Usage:
#   ./restore.sh --input BACKUP_FILE [OPTIONS]
#
# Options:
#   --input FILE    Backup file to restore (required)
#   --clean         Drop existing database objects before restore
#   --schemas       Comma-separated list of schemas to restore (default: all)
#   --dry-run       Show what would be done without executing
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
INPUT_FILE=""
CLEAN_RESTORE=false
SCHEMAS=""
DRY_RUN=false

# Database connection defaults
POSTGRES_HOST="${POSTGRES_HOST:-localhost}"
POSTGRES_PORT="${POSTGRES_PORT:-5432}"
POSTGRES_DB="${POSTGRES_DB:-netnynja}"
POSTGRES_USER="${POSTGRES_USER:-netnynja}"

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --input)
      INPUT_FILE="$2"
      shift 2
      ;;
    --clean)
      CLEAN_RESTORE=true
      shift
      ;;
    --schemas)
      SCHEMAS="$2"
      shift 2
      ;;
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    -h|--help)
      echo "Usage: $0 --input BACKUP_FILE [OPTIONS]"
      echo "  --input FILE    Backup file to restore (required)"
      echo "  --clean         Drop existing objects before restore"
      echo "  --schemas LIST  Comma-separated schemas to restore"
      echo "  --dry-run       Show what would be done"
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

echo -e "${GREEN}NetNynja Enterprise - PostgreSQL Restore${NC}"
echo "============================================"
echo ""

# Validate input file
if [ -z "$INPUT_FILE" ]; then
  echo -e "${RED}ERROR: --input is required${NC}"
  echo "Usage: $0 --input BACKUP_FILE"
  exit 1
fi

if [ ! -f "$INPUT_FILE" ]; then
  echo -e "${RED}ERROR: Backup file not found: $INPUT_FILE${NC}"
  exit 1
fi

echo "Input file: $INPUT_FILE"
echo "Database: $POSTGRES_DB@$POSTGRES_HOST:$POSTGRES_PORT"
echo "Clean restore: $CLEAN_RESTORE"
echo ""

# Determine if file is compressed
RESTORE_FILE="$INPUT_FILE"
TEMP_FILE=""

if [[ "$INPUT_FILE" == *.gz ]]; then
  echo -e "${YELLOW}Decompressing backup...${NC}"
  TEMP_FILE=$(mktemp)
  gunzip -c "$INPUT_FILE" > "$TEMP_FILE"
  RESTORE_FILE="$TEMP_FILE"
  echo "Decompressed to: $TEMP_FILE"
fi

# Get backup info
echo ""
echo -e "${YELLOW}Backup information:${NC}"
export PGPASSWORD="${POSTGRES_PASSWORD:-}"

if command -v docker &> /dev/null && docker ps --format '{{.Names}}' | grep -q "netnynja-postgres"; then
  # Copy file to container for inspection
  docker cp "$RESTORE_FILE" netnynja-postgres:/tmp/restore.dump
  docker exec netnynja-postgres pg_restore --list /tmp/restore.dump 2>/dev/null | head -20 || true
else
  pg_restore --list "$RESTORE_FILE" 2>/dev/null | head -20 || true
fi

echo ""

# Confirm restore (unless dry-run)
if [ "$DRY_RUN" = true ]; then
  echo -e "${YELLOW}DRY RUN - No changes will be made${NC}"
  echo ""
  echo "Would execute:"
  echo "  pg_restore --host=$POSTGRES_HOST --port=$POSTGRES_PORT"
  echo "            --username=$POSTGRES_USER --dbname=$POSTGRES_DB"
  [ "$CLEAN_RESTORE" = true ] && echo "            --clean"
  [ -n "$SCHEMAS" ] && echo "            --schema=$SCHEMAS"
  echo "            $RESTORE_FILE"

  # Cleanup temp file
  [ -n "$TEMP_FILE" ] && rm -f "$TEMP_FILE"
  exit 0
fi

echo -e "${RED}WARNING: This will restore the database from backup.${NC}"
if [ "$CLEAN_RESTORE" = true ]; then
  echo -e "${RED}         Existing data will be DROPPED before restore!${NC}"
fi
echo ""
read -p "Are you sure you want to continue? (yes/no): " CONFIRM

if [ "$CONFIRM" != "yes" ]; then
  echo "Restore cancelled."
  [ -n "$TEMP_FILE" ] && rm -f "$TEMP_FILE"
  exit 0
fi

echo ""
echo -e "${YELLOW}Starting restore...${NC}"

# Build pg_restore options
PG_RESTORE_OPTS=(
  "--host=$POSTGRES_HOST"
  "--port=$POSTGRES_PORT"
  "--username=$POSTGRES_USER"
  "--dbname=$POSTGRES_DB"
  "--verbose"
  "--no-owner"
  "--no-privileges"
)

if [ "$CLEAN_RESTORE" = true ]; then
  PG_RESTORE_OPTS+=("--clean" "--if-exists")
fi

# Add schema filters if specified
if [ -n "$SCHEMAS" ]; then
  IFS=',' read -ra SCHEMA_ARRAY <<< "$SCHEMAS"
  for schema in "${SCHEMA_ARRAY[@]}"; do
    PG_RESTORE_OPTS+=("--schema=$schema")
  done
  echo "Schemas: $SCHEMAS"
fi

# Perform restore
if command -v docker &> /dev/null && docker ps --format '{{.Names}}' | grep -q "netnynja-postgres"; then
  echo "Using Docker container for restore..."

  # Copy file to container
  docker cp "$RESTORE_FILE" netnynja-postgres:/tmp/restore.dump

  # Build options for docker exec
  DOCKER_OPTS=""
  [ "$CLEAN_RESTORE" = true ] && DOCKER_OPTS="$DOCKER_OPTS --clean --if-exists"
  [ -n "$SCHEMAS" ] && {
    for schema in "${SCHEMA_ARRAY[@]}"; do
      DOCKER_OPTS="$DOCKER_OPTS --schema=$schema"
    done
  }

  # Run pg_restore inside the container
  docker exec -e PGPASSWORD="$PGPASSWORD" netnynja-postgres \
    pg_restore \
    --username="$POSTGRES_USER" \
    --dbname="$POSTGRES_DB" \
    --verbose \
    --no-owner \
    --no-privileges \
    $DOCKER_OPTS \
    /tmp/restore.dump 2>&1 || true

  # Cleanup temp file in container
  docker exec netnynja-postgres rm -f /tmp/restore.dump
else
  # Run pg_restore directly
  pg_restore "${PG_RESTORE_OPTS[@]}" "$RESTORE_FILE" 2>&1 || true
fi

# Cleanup temp file
[ -n "$TEMP_FILE" ] && rm -f "$TEMP_FILE"

echo ""
echo "============================================"
echo -e "${GREEN}Restore complete!${NC}"
echo "============================================"
echo ""
echo "To verify the restore:"
echo "  psql -h $POSTGRES_HOST -p $POSTGRES_PORT -U $POSTGRES_USER -d $POSTGRES_DB -c '\\dt *.*'"
echo ""
echo "Or if using Docker:"
echo "  docker exec -it netnynja-postgres psql -U $POSTGRES_USER -d $POSTGRES_DB -c '\\dt *.*'"
