#!/usr/bin/env pwsh
<#
.SYNOPSIS
    GridWatch NetEnterprise - Phase 1 Security Remediation Script

.DESCRIPTION
    Automates the Phase 1 critical vulnerability remediation for SEC-012.
    Updates Alpine-based images and infrastructure components.

.PARAMETER SkipBackup
    Skip backup creation (not recommended)

.PARAMETER SkipVerification
    Skip post-deployment verification (not recommended)

.EXAMPLE
    .\phase1-remediation.ps1
    Run full Phase 1 remediation with all safety checks

.EXAMPLE
    .\phase1-remediation.ps1 -SkipBackup
    Run without creating backups (faster, but risky)

.NOTES
    Related: docs/security/SEC-012_URGENT_VULNERABILITIES.md
    Version: 1.0
    Date: 2026-02-04
#>

[CmdletBinding()]
param(
    [switch]$SkipBackup,
    [switch]$SkipVerification
)

$ErrorActionPreference = "Stop"

# Colors for output
function Write-Step {
    param([string]$Message)
    Write-Host "`n[STEP] $Message" -ForegroundColor Cyan
}

function Write-Success {
    param([string]$Message)
    Write-Host "[OK] $Message" -ForegroundColor Green
}

function Write-Failure {
    param([string]$Message)
    Write-Host "[ERROR] $Message" -ForegroundColor Red
}

function Write-Warning {
    param([string]$Message)
    Write-Host "[WARN] $Message" -ForegroundColor Yellow
}

# Pre-flight checks
Write-Step "Pre-flight checks"

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Failure "Docker is not installed or not in PATH"
    exit 1
}

if (-not (Get-Command docker-compose -ErrorAction SilentlyContinue)) {
    Write-Failure "docker-compose is not installed or not in PATH"
    exit 1
}

$dockerRunning = docker ps 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Failure "Docker daemon is not running"
    exit 1
}

Write-Success "Docker is available and running"

# Confirm before proceeding
Write-Host "`n========================================" -ForegroundColor Yellow
Write-Host "PHASE 1 SECURITY REMEDIATION" -ForegroundColor Yellow
Write-Host "========================================" -ForegroundColor Yellow
Write-Host "`nThis script will:" -ForegroundColor Yellow
Write-Host "1. Pull latest secure base images"
Write-Host "2. Rebuild custom GridWatch services"
Write-Host "3. Stop and restart containers"
Write-Host "4. Verify deployments"
Write-Host "`nEstimated downtime: 2-5 minutes" -ForegroundColor Red

$confirm = Read-Host "`nDo you want to proceed? (yes/no)"
if ($confirm -ne "yes") {
    Write-Host "Aborted by user"
    exit 0
}

# Step 1: Create backups
if (-not $SkipBackup) {
    Write-Step "Creating backups"
    
    $backupDir = "backups/$(Get-Date -Format 'yyyy-MM-dd_HH-mm-ss')"
    New-Item -ItemType Directory -Path $backupDir -Force | Out-Null
    
    # Backup Grafana data
    Write-Host "Backing up Grafana data..."
    docker exec GridWatch-grafana tar czf /tmp/grafana-backup.tar.gz /var/lib/grafana 2>$null
    if ($LASTEXITCODE -eq 0) {
        docker cp GridWatch-grafana:/tmp/grafana-backup.tar.gz "$backupDir/grafana-data.tar.gz"
        Write-Success "Grafana backup created: $backupDir/grafana-data.tar.gz"
    } else {
        Write-Warning "Grafana backup failed (container may not be running)"
    }
    
    # Backup Vault snapshot (if unsealed)
    Write-Host "Checking Vault status..."
    $vaultSealed = docker exec GridWatch-vault vault status -format=json 2>$null | ConvertFrom-Json
    if ($vaultSealed.sealed -eq $false) {
        Write-Host "Creating Vault snapshot..."
        docker exec GridWatch-vault vault operator raft snapshot save /tmp/vault-backup.snap 2>$null
        if ($LASTEXITCODE -eq 0) {
            docker cp GridWatch-vault:/tmp/vault-backup.snap "$backupDir/vault-snapshot.snap"
            Write-Success "Vault snapshot created: $backupDir/vault-snapshot.snap"
        } else {
            Write-Warning "Vault snapshot failed"
        }
    } else {
        Write-Warning "Vault is sealed, skipping snapshot"
    }
} else {
    Write-Warning "Skipping backups (not recommended)"
}

# Step 2: Pull updated base images
Write-Step "Pulling updated base images"

$images = @(
    "alpine:3.23",
    "node:20-alpine",
    "postgres:16-alpine",
    "redis:7-alpine",
    "nats:2.10-alpine",
    "hashicorp/vault:1.18",
    "grafana/grafana:11.4.0"
)

foreach ($image in $images) {
    Write-Host "Pulling $image..."
    docker pull $image
    if ($LASTEXITCODE -eq 0) {
        Write-Success "Pulled $image"
    } else {
        Write-Failure "Failed to pull $image"
        exit 1
    }
}

# Step 3: Update docker-compose.yml with new image tags
Write-Step "Updating docker-compose.yml"

$composeFile = "docker-compose.yml"
if (Test-Path $composeFile) {
    $composeContent = Get-Content $composeFile -Raw
    
    # Update Vault version
    $composeContent = $composeContent -replace 'hashicorp/vault:1\.15', 'hashicorp/vault:1.18'
    
    # Update Grafana version
    $composeContent = $composeContent -replace 'grafana/grafana:10\.2\.0', 'grafana/grafana:11.4.0'
    
    # Save updated compose file
    Set-Content -Path $composeFile -Value $composeContent -NoNewline
    Write-Success "Updated docker-compose.yml"
} else {
    Write-Failure "docker-compose.yml not found"
    exit 1
}

# Step 4: Rebuild custom GridWatch services
Write-Step "Rebuilding GridWatch services (this may take 5-10 minutes)"

Write-Host "Building auth-service..."
docker-compose build --no-cache auth-service
if ($LASTEXITCODE -ne 0) {
    Write-Failure "Failed to build auth-service"
    exit 1
}

Write-Host "Building gateway..."
docker-compose build --no-cache gateway
if ($LASTEXITCODE -ne 0) {
    Write-Failure "Failed to build gateway"
    exit 1
}

Write-Success "Services rebuilt successfully"

# Step 5: Stop and restart containers
Write-Step "Restarting containers"

Write-Host "Stopping containers..."
docker-compose stop auth-service gateway vault grafana postgres redis nats

Write-Host "Starting updated containers..."
docker-compose up -d

# Wait for services to start
Write-Host "Waiting for services to initialize (30 seconds)..."
Start-Sleep -Seconds 30

# Step 6: Verify deployments
if (-not $SkipVerification) {
    Write-Step "Verifying deployments"
    
    $services = @("auth-service", "gateway", "vault", "grafana", "postgres", "redis", "nats")
    $allHealthy = $true
    
    foreach ($service in $services) {
        $containerName = "GridWatch-$service"
        $status = docker ps --filter "name=$containerName" --format "{{.Status}}"
        
        if ($status -like "*Up*") {
            # Check health status if available
            $health = docker inspect --format='{{.State.Health.Status}}' $containerName 2>$null
            if ($health -eq "healthy" -or $health -eq "") {
                Write-Success "$service is running"
            } else {
                Write-Warning "$service is running but health check status: $health"
                $allHealthy = $false
            }
        } else {
            Write-Failure "$service is not running"
            $allHealthy = $false
        }
    }
    
    # Test auth service endpoint
    Write-Host "`nTesting auth service..."
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:3006/healthz" -UseBasicParsing -TimeoutSec 5
        if ($response.StatusCode -eq 200) {
            Write-Success "Auth service health check passed"
        }
    } catch {
        Write-Warning "Auth service health check failed: $_"
        $allHealthy = $false
    }
    
    # Test gateway endpoint
    Write-Host "Testing gateway..."
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:3000/healthz" -UseBasicParsing -TimeoutSec 5
        if ($response.StatusCode -eq 200) {
            Write-Success "Gateway health check passed"
        }
    } catch {
        Write-Warning "Gateway health check failed: $_"
        $allHealthy = $false
    }
    
    if ($allHealthy) {
        Write-Host "`n========================================" -ForegroundColor Green
        Write-Host "PHASE 1 REMEDIATION COMPLETE" -ForegroundColor Green
        Write-Host "========================================" -ForegroundColor Green
    } else {
        Write-Host "`n========================================" -ForegroundColor Yellow
        Write-Host "PHASE 1 COMPLETED WITH WARNINGS" -ForegroundColor Yellow
        Write-Host "========================================" -ForegroundColor Yellow
        Write-Warning "Some services may need manual attention"
    }
} else {
    Write-Warning "Skipping verification (not recommended)"
}

# Step 7: Post-deployment instructions
Write-Step "Next steps"

Write-Host @"

1. Run vulnerability scan to verify fixes:
   trivy image --severity CRITICAL gridwatch-net-enterprise-auth-service:latest
   trivy image --severity CRITICAL gridwatch-net-enterprise-gateway:latest

2. If Vault was unsealed before, unseal it now:
   docker exec GridWatch-vault vault operator unseal <key1>
   docker exec GridWatch-vault vault operator unseal <key2>
   docker exec GridWatch-vault vault operator unseal <key3>

3. Monitor application logs for issues:
   docker-compose logs -f auth-service gateway

4. Verify authentication workflows are working

5. Proceed to Phase 2 (Node.js dependencies) within 3 days

For detailed instructions, see:
- docs/security/REMEDIATION_CHECKLIST.md
- docs/security/VULNERABILITY_SCAN_REPORT.md

"@

Write-Host "`nPhase 1 remediation script completed." -ForegroundColor Cyan
