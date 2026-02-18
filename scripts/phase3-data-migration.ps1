# GridWatch NetEnterprise - Phase 3: Data Migration
# Run with the gridwatch stack UP.
#
# WHAT THIS DOES (fresh stack — no old netnynja data to migrate):
#   1. Takes a safety backup of the current gridwatch database
#   2. Flushes Redis (invalidates any cached sessions from old JWT secret)
#   3. Prints manual steps for JWT rotation in Vault

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
Write-Host "[1/3] Checking postgres container..." -ForegroundColor Yellow
$pgContainer = docker ps --filter "name=gridwatch-postgres" --format "{{.Names}}" 2>&1 | Select-Object -First 1
if (-not $pgContainer) {
    Write-Host "ERROR: No postgres container found. Is the stack running?" -ForegroundColor Red
    Write-Host "Run: docker compose --profile ipam up -d" -ForegroundColor Yellow
    exit 1
}
Write-Host "  Found container: $pgContainer" -ForegroundColor Green

# Step 2: Backup current gridwatch database
Write-Host "[2/3] Backing up gridwatch database..." -ForegroundColor Yellow
# Detect the actual Postgres user from the running container
$pgUser = docker exec $pgContainer sh -c 'echo $POSTGRES_USER' 2>&1
$pgDb   = docker exec $pgContainer sh -c 'echo $POSTGRES_DB' 2>&1
if (-not $pgUser) { $pgUser = "gridwatch" }
if (-not $pgDb)   { $pgDb   = "gridwatch" }
Write-Host "  Using user=$pgUser db=$pgDb" -ForegroundColor Gray
$dumpResult = docker exec $pgContainer pg_dump -U $pgUser -d $pgDb 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Could not dump database." -ForegroundColor Red
    Write-Host $dumpResult
    exit 1
}
[System.IO.File]::WriteAllText($BackupFile, ($dumpResult -join "`n"), (New-Object System.Text.UTF8Encoding($false)))
$backupSizeKB = [Math]::Round((Get-Item $BackupFile).Length / 1KB, 1)
Write-Host "  Backup saved: $BackupFile ($backupSizeKB KB)" -ForegroundColor Green

# Step 3: Flush Redis (invalidate any sessions signed with old JWT secret)
Write-Host "[3/3] Flushing Redis session cache..." -ForegroundColor Yellow
$redisContainer = docker ps --filter "name=gridwatch-redis" --format "{{.Names}}" 2>&1 | Select-Object -First 1
if ($redisContainer) {
    docker exec $redisContainer redis-cli FLUSHALL | Out-Null
    Write-Host "  Redis flushed: $redisContainer" -ForegroundColor Green
} else {
    Write-Host "  WARNING: Redis container not found - skipping flush" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "==================================================" -ForegroundColor Green
Write-Host "  Phase 3 Complete!" -ForegroundColor Green
Write-Host "==================================================" -ForegroundColor Green
Write-Host ""
Write-Host "Manual steps remaining:" -ForegroundColor Cyan
Write-Host "  1. Verify stack health:  docker compose ps" -ForegroundColor White
Write-Host "  2. Check gateway:        curl http://localhost:3001/healthz" -ForegroundColor White
Write-Host "  3. Rotate JWT secret in Vault (invalidates all existing tokens)" -ForegroundColor White
Write-Host "     vault kv put secret/gridwatch/jwt secret=`$(openssl rand -hex 32)" -ForegroundColor Gray
Write-Host "  4. All users must re-login (sessions were flushed from Redis)" -ForegroundColor White
Write-Host "  5. Run Phase 6: scripts\phase6-repo-rename.ps1" -ForegroundColor White
Write-Host ""
$msg = "Backup file kept at: " + $BackupFile
Write-Host $msg -ForegroundColor Gray
