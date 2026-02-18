# GridWatch NetEnterprise - Phase 3: Data Migration
# Run AFTER the refactor/gridwatch-rebrand PR is merged to main.
#
# PREREQUISITES:
#   - Docker Desktop running
#   - Stack currently UP with the OLD netnynja DB/user
#   - .env file updated with POSTGRES_DB=gridwatch, POSTGRES_USER=gridwatch
#
# WHAT THIS DOES:
#   1. Dumps the live netnynja database from the running postgres container
#   2. Flushes Redis (invalidates cached sessions)
#   3. Stops the stack
#   4. Removes the old postgres data volume
#   5. Rebuilds all Docker images with the new gridwatch brand
#   6. Starts the stack (postgres re-inits with new gridwatch DB/user)
#   7. Restores the dump into the new gridwatch database

$ErrorActionPreference = "Stop"
$ProjectRoot = "C:\Users\rmeadows\Code Development\dev\NetNynja\NetNynjaEnterprise"
$Timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$BackupFile = "$ProjectRoot\gridwatch_db_backup_$Timestamp.sql"

Set-Location $ProjectRoot

Write-Host ""
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "  GridWatch Phase 3: Data Migration" -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host ""

# Step 1: Find postgres container
Write-Host "[1/7] Checking postgres container..." -ForegroundColor Yellow
$pgContainer = docker ps --filter "name=gridwatch-postgres" --format "{{.Names}}" 2>&1
if (-not $pgContainer) {
    $pgContainer = docker ps --filter "name=netnynja-postgres" --format "{{.Names}}" 2>&1
}
if (-not $pgContainer) {
    $pgContainer = docker ps --filter "name=postgres" --format "{{.Names}}" 2>&1 | Select-Object -First 1
}
if (-not $pgContainer) {
    Write-Host "ERROR: No postgres container found. Is the stack running?" -ForegroundColor Red
    Write-Host "Run: docker compose --profile ipam up -d" -ForegroundColor Yellow
    exit 1
}
Write-Host "  Found container: $pgContainer" -ForegroundColor Green

# Step 2: Dump the database
Write-Host "[2/7] Dumping database from '$pgContainer'..." -ForegroundColor Yellow
$dumpResult = docker exec $pgContainer pg_dump -U netnynja -d netnynja 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "  netnynja DB not found, trying gridwatch..." -ForegroundColor Yellow
    $dumpResult = docker exec $pgContainer pg_dump -U gridwatch -d gridwatch 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Host "ERROR: Could not dump database. Check credentials." -ForegroundColor Red
        exit 1
    }
}
[System.IO.File]::WriteAllText($BackupFile, ($dumpResult -join "`n"), (New-Object System.Text.UTF8Encoding($false)))
$backupSizeKB = [Math]::Round((Get-Item $BackupFile).Length / 1KB, 1)
Write-Host "  Backup saved: $BackupFile ($backupSizeKB KB)" -ForegroundColor Green

# Step 3: Flush Redis
Write-Host "[3/7] Flushing Redis session cache..." -ForegroundColor Yellow
$redisContainer = docker ps --filter "name=redis" --format "{{.Names}}" 2>&1 | Select-Object -First 1
if ($redisContainer) {
    docker exec $redisContainer redis-cli FLUSHALL | Out-Null
    Write-Host "  Redis flushed: $redisContainer" -ForegroundColor Green
} else {
    Write-Host "  WARNING: Redis container not found - skipping flush" -ForegroundColor Yellow
}

# Step 4: Stop the stack
Write-Host "[4/7] Stopping stack..." -ForegroundColor Yellow
docker compose down | Out-Null
Write-Host "  Stack stopped." -ForegroundColor Green

# Step 5: Remove old postgres volume
Write-Host "[5/7] Removing old postgres data volume..." -ForegroundColor Yellow
$volume = docker volume ls --format "{{.Name}}" 2>&1 | Where-Object { $_ -match "postgres" } | Select-Object -First 1
if ($volume) {
    Write-Host "  Found volume: $volume" -ForegroundColor Yellow
    $confirm = Read-Host "  Remove volume '$volume'? Data will be restored from backup. (yes/no)"
    if ($confirm -eq "yes") {
        docker volume rm $volume | Out-Null
        Write-Host "  Volume removed." -ForegroundColor Green
    } else {
        Write-Host "  Skipped volume removal." -ForegroundColor Yellow
    }
} else {
    Write-Host "  No named postgres volume found." -ForegroundColor Yellow
}

# Step 6: Rebuild images
Write-Host "[6/7] Rebuilding Docker images..." -ForegroundColor Yellow
docker compose build --no-cache 2>&1 | Where-Object { $_ -match "Successfully|error" }
Write-Host "  Images rebuilt." -ForegroundColor Green

# Step 7: Start stack and restore
Write-Host "[7/7] Starting stack and restoring database..." -ForegroundColor Yellow
docker compose --profile ipam --profile npm --profile stig --profile syslog up -d | Out-Null
Write-Host "  Waiting 15s for postgres to initialize..." -ForegroundColor Yellow
Start-Sleep -Seconds 15

Write-Host "  Restoring backup into gridwatch database..." -ForegroundColor Yellow
Get-Content $BackupFile | docker exec -i gridwatch-postgres psql -U gridwatch -d gridwatch | Out-Null
if ($LASTEXITCODE -eq 0) {
    Write-Host "  Database restored successfully." -ForegroundColor Green
} else {
    Write-Host "  WARNING: Restore had errors. Verify manually:" -ForegroundColor Yellow
    Write-Host "  docker exec -it gridwatch-postgres psql -U gridwatch -d gridwatch" -ForegroundColor Gray
}

Write-Host ""
Write-Host "==================================================" -ForegroundColor Green
Write-Host "  Phase 3 Complete!" -ForegroundColor Green
Write-Host "==================================================" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "  1. Verify stack health:  docker compose ps" -ForegroundColor White
Write-Host "  2. Check gateway:        curl http://localhost:3000/health" -ForegroundColor White
Write-Host "  3. Rotate JWT secret in Vault (invalidates all existing tokens)" -ForegroundColor White
Write-Host "  4. All users must re-login (sessions were flushed from Redis)" -ForegroundColor White
Write-Host "  5. Run Phase 6: scripts\phase6-repo-rename.ps1" -ForegroundColor White
Write-Host ""
$msg = "Backup file kept at: " + $BackupFile
Write-Host $msg -ForegroundColor Gray
