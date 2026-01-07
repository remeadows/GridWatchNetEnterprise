# NetNynja Enterprise - PostgreSQL Backup & Restore

This directory contains backup and restore scripts for the PostgreSQL database.

## Quick Start

### Create a Backup

```bash
# Simple backup with defaults
./backup.sh

# Backup to specific directory, keep 14 backups
./backup.sh --output /mnt/backups --keep 14

# Backup specific schemas only
./backup.sh --schemas ipam,shared
```

### Restore from Backup

```bash
# Restore from backup file
./restore.sh --input ./backups/netnynja_netnynja_20260106_120000.dump.gz

# Restore with clean (drops existing objects first)
./restore.sh --input ./backups/latest --clean

# Dry run to see what would happen
./restore.sh --input ./backups/latest --dry-run
```

## Backup Script Options

| Option           | Description                       | Default             |
| ---------------- | --------------------------------- | ------------------- |
| `--output DIR`   | Backup output directory           | `./backups`         |
| `--keep N`       | Number of backups to retain       | `7`                 |
| `--no-compress`  | Disable gzip compression          | compression enabled |
| `--schemas LIST` | Comma-separated schemas to backup | all schemas         |

## Restore Script Options

| Option           | Description                          | Default     |
| ---------------- | ------------------------------------ | ----------- |
| `--input FILE`   | Backup file to restore (required)    | -           |
| `--clean`        | Drop existing objects before restore | false       |
| `--schemas LIST` | Comma-separated schemas to restore   | all schemas |
| `--dry-run`      | Show what would be done              | false       |

## Environment Variables

Both scripts use these environment variables:

| Variable            | Description              | Default     |
| ------------------- | ------------------------ | ----------- |
| `POSTGRES_HOST`     | Database host            | `localhost` |
| `POSTGRES_PORT`     | Database port            | `5432`      |
| `POSTGRES_DB`       | Database name            | `netnynja`  |
| `POSTGRES_USER`     | Database user            | `netnynja`  |
| `POSTGRES_PASSWORD` | Database password        | -           |
| `BACKUP_OUTPUT_DIR` | Default backup directory | `./backups` |
| `BACKUP_KEEP`       | Default retention count  | `7`         |

## Backup Output

The backup script creates:

1. **Backup file**: `netnynja_{db}_{timestamp}.dump.gz`
   - PostgreSQL custom format (pg_dump -Fc)
   - Gzip compressed (unless `--no-compress`)

2. **Symlink**: `latest` -> most recent backup

3. **Manifest**: `manifest.json` with backup metadata
   ```json
   {
     "latest_backup": "netnynja_netnynja_20260106_120000.dump.gz",
     "timestamp": "20260106_120000",
     "database": "netnynja",
     "host": "localhost",
     "schemas": "all",
     "compressed": true,
     "retention": 7,
     "backups": [...]
   }
   ```

## Docker Support

Both scripts automatically detect if PostgreSQL is running in Docker:

- If `netnynja-postgres` container is running, uses `docker exec`
- Otherwise, uses local `pg_dump`/`pg_restore` commands

## Automated Backups

### Cron Job (Linux/macOS)

```bash
# Add to crontab: crontab -e
# Daily backup at 2 AM
0 2 * * * cd /path/to/netnynja-enterprise && POSTGRES_PASSWORD=your-password ./infrastructure/postgres/backup.sh --output /mnt/backups >> /var/log/netnynja-backup.log 2>&1
```

### Docker Healthcheck

Add to `docker-compose.yml` for backup verification:

```yaml
services:
  backup:
    image: postgres:15-alpine
    volumes:
      - ./infrastructure/postgres:/scripts
      - ./backups:/backups
    environment:
      - POSTGRES_HOST=postgres
      - POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
    command: >
      sh -c "while true; do
        /scripts/backup.sh --output /backups;
        sleep 86400;
      done"
```

## Recovery Scenarios

### Full Database Recovery

```bash
# Stop application services
docker compose stop gateway web-ui

# Restore with clean
./restore.sh --input ./backups/latest --clean

# Restart services
docker compose start gateway web-ui
```

### Schema-Specific Recovery

```bash
# Restore only IPAM schema
./restore.sh --input ./backups/latest --schemas ipam --clean
```

### Point-in-Time Recovery

For point-in-time recovery, enable PostgreSQL WAL archiving:

```ini
# In postgresql.conf
wal_level = replica
archive_mode = on
archive_command = 'cp %p /mnt/wal_archive/%f'
```

Then restore to a specific time:

```bash
# Restore base backup
./restore.sh --input ./backups/netnynja_20260105.dump.gz

# Apply WAL logs up to target time
pg_restore --target-time='2026-01-06 10:00:00' ...
```

## Troubleshooting

### Permission Denied

```bash
# Ensure scripts are executable
chmod +x backup.sh restore.sh
```

### Connection Refused

```bash
# Check PostgreSQL is running
docker ps | grep postgres

# Verify connection
PGPASSWORD=your-password psql -h localhost -p 5432 -U netnynja -d netnynja -c '\conninfo'
```

### Backup Too Large

```bash
# Backup specific schemas
./backup.sh --schemas shared,ipam

# Or use external compression
./backup.sh --no-compress && gzip -9 backups/*.dump
```

### Restore Errors

```bash
# Use dry-run first
./restore.sh --input backup.dump.gz --dry-run

# Check backup contents
pg_restore --list backup.dump.gz | head -50
```
