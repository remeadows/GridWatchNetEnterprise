#===============================================================================
# GridWatch NetEnterprise - Infrastructure Pre-flight Health Checks (Windows)
# PowerShell wrapper for Windows environments
# Run this BEFORE API/Frontend tests to validate all services are operational
#===============================================================================

param(
    [switch]$Verbose
)

$ErrorActionPreference = "Continue"

# Load .env if it exists
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent (Split-Path -Parent $ScriptDir)
$EnvFile = Join-Path $ProjectRoot ".env"

if (Test-Path $EnvFile) {
    Get-Content $EnvFile | ForEach-Object {
        if ($_ -match '^([^#][^=]+)=(.*)$') {
            $name = $matches[1].Trim()
            $value = $matches[2].Trim()
            Set-Item -Path "env:$name" -Value $value
        }
    }
}

# Configuration with defaults
$Config = @{
    COMPOSE_PROJECT = if ($env:COMPOSE_PROJECT) { $env:COMPOSE_PROJECT } else { "GridWatch" }
    POSTGRES_HOST = if ($env:POSTGRES_HOST) { $env:POSTGRES_HOST } else { "localhost" }
    POSTGRES_PORT = if ($env:POSTGRES_PORT) { $env:POSTGRES_PORT } else { "5433" }
    REDIS_HOST = if ($env:REDIS_HOST) { $env:REDIS_HOST } else { "localhost" }
    REDIS_PORT = if ($env:REDIS_PORT) { $env:REDIS_PORT } else { "6379" }
    NATS_HOST = if ($env:NATS_HOST) { $env:NATS_HOST } else { "localhost" }
    NATS_MONITOR_PORT = if ($env:NATS_MONITOR_PORT) { $env:NATS_MONITOR_PORT } else { "8322" }
    VAULT_ADDR = if ($env:VAULT_ADDR) { $env:VAULT_ADDR } else { "http://localhost:8300" }
    VICTORIA_HOST = if ($env:VICTORIA_HOST) { $env:VICTORIA_HOST } else { "localhost" }
    VICTORIA_PORT = if ($env:VICTORIA_PORT) { $env:VICTORIA_PORT } else { "8428" }
    GATEWAY_URL = if ($env:GATEWAY_URL) { $env:GATEWAY_URL } else { "http://localhost:3001" }
    GRAFANA_PORT = if ($env:GRAFANA_PORT) { $env:GRAFANA_PORT } else { "3002" }
}

# Counters
$Script:Passed = 0
$Script:Failed = 0
$Script:Warnings = 0
$Script:Results = @()

function Write-Section {
    param([string]$Title)
    Write-Host ""
    Write-Host ("=" * 60) -ForegroundColor Blue
    Write-Host "  $Title" -ForegroundColor Blue
    Write-Host ("=" * 60) -ForegroundColor Blue
}

function Write-Test {
    param([string]$Name)
    Write-Host "  |- $Name... " -NoNewline
}

function Write-Pass {
    param([string]$Duration = "")
    $msg = "PASS"
    if ($Duration) { $msg += " (${Duration}ms)" }
    Write-Host $msg -ForegroundColor Green
    $Script:Passed++
}

function Write-Fail {
    param([string]$Message = "")
    $msg = "FAIL"
    if ($Message) { $msg += " - $Message" }
    Write-Host $msg -ForegroundColor Red
    $Script:Failed++
}

function Write-Warn {
    param([string]$Message = "")
    $msg = "WARN"
    if ($Message) { $msg += " - $Message" }
    Write-Host $msg -ForegroundColor Yellow
    $Script:Warnings++
}

function Test-DockerContainer {
    param([string]$Name)
    try {
        $status = docker inspect --format='{{.State.Status}}' $Name 2>$null
        return $status -eq "running"
    } catch {
        return $false
    }
}

function Invoke-WebCheck {
    param([string]$Url, [int]$TimeoutSec = 10)
    try {
        $response = Invoke-WebRequest -Uri $Url -TimeoutSec $TimeoutSec -UseBasicParsing -ErrorAction Stop
        return @{ Success = $true; Content = $response.Content; StatusCode = $response.StatusCode }
    } catch {
        return @{ Success = $false; Error = $_.Exception.Message }
    }
}

#-------------------------------------------------------------------------------
# Section 1: Docker Container Health
#-------------------------------------------------------------------------------

function Test-DockerContainers {
    Write-Section "1. DOCKER CONTAINER HEALTH"
    $sectionPassed = $true
    $failures = @()

    # Check Docker daemon
    Write-Test "Docker daemon responsive"
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    try {
        $null = docker info 2>$null
        if ($LASTEXITCODE -eq 0) {
            Write-Pass $sw.ElapsedMilliseconds
        } else {
            Write-Fail "Docker daemon not running"
            $sectionPassed = $false
            $failures += "Docker daemon"
        }
    } catch {
        Write-Fail "Docker not found"
        $sectionPassed = $false
        $failures += "Docker not found"
        return
    }

    # Expected containers
    $containers = @(
        "postgres", "redis", "nats", "vault", "victoriametrics",
        "grafana", "loki", "promtail", "jaeger", "prometheus"
    )

    Write-Test "Container states"
    Write-Host ""

    $runningCount = 0
    foreach ($container in $containers) {
        $fullName = "$($Config.COMPOSE_PROJECT)-$container"
        if (-not (Test-DockerContainer $fullName)) {
            $fullName = "$($Config.COMPOSE_PROJECT)-$container-1"
        }

        $status = docker inspect --format='{{.State.Status}}' $fullName 2>$null
        $health = docker inspect --format='{{if .State.Health}}{{.State.Health.Status}}{{else}}no_healthcheck{{end}}' $fullName 2>$null

        Write-Host "  |   |- $($container.PadRight(20)) " -NoNewline

        if ($status -eq "running") {
            $runningCount++
            Write-Host "running ($health)" -ForegroundColor Green
        } elseif ($status) {
            Write-Host $status -ForegroundColor Red
            $sectionPassed = $false
            $failures += $container
        } else {
            Write-Host "not found" -ForegroundColor Red
            $sectionPassed = $false
            $failures += $container
        }
    }

    Write-Host "  |"
    Write-Test "Container summary: $runningCount/$($containers.Count) running"
    if ($runningCount -eq $containers.Count) {
        Write-Pass
    } else {
        Write-Fail "$($containers.Count - $runningCount) containers not running"
        $sectionPassed = $false
    }

    $Script:Results += [PSCustomObject]@{
        Section = "Docker Containers"
        Status = if ($sectionPassed) { "PASS" } else { "FAIL" }
        Failures = ($failures -join "; ")
    }
}

#-------------------------------------------------------------------------------
# Section 2: PostgreSQL
#-------------------------------------------------------------------------------

function Test-PostgreSQL {
    Write-Section "2. POSTGRESQL DATABASE"
    $sectionPassed = $true
    $failures = @()

    Write-Test "PostgreSQL connection"
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    try {
        $result = docker exec "$($Config.COMPOSE_PROJECT)-postgres" pg_isready -U GridWatch 2>$null
        if ($LASTEXITCODE -eq 0) {
            Write-Pass $sw.ElapsedMilliseconds
        } else {
            Write-Fail "Cannot connect"
            $sectionPassed = $false
            $failures += "Connection"
        }
    } catch {
        Write-Fail "Docker exec failed"
        $sectionPassed = $false
        $failures += "Docker exec"
    }

    $Script:Results += [PSCustomObject]@{
        Section = "PostgreSQL"
        Status = if ($sectionPassed) { "PASS" } else { "FAIL" }
        Failures = ($failures -join "; ")
    }
}

#-------------------------------------------------------------------------------
# Section 3: Redis
#-------------------------------------------------------------------------------

function Test-Redis {
    Write-Section "3. REDIS SESSION STORE"
    $sectionPassed = $true
    $failures = @()

    Write-Test "Redis PING"
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    try {
        $redisPassword = if ($env:REDIS_PASSWORD) { $env:REDIS_PASSWORD } else { "dev-redis-password" }
        $pong = docker exec "$($Config.COMPOSE_PROJECT)-redis" redis-cli -a $redisPassword PING 2>$null
        if ($pong -match "PONG") {
            Write-Pass $sw.ElapsedMilliseconds
        } else {
            Write-Fail "No response"
            $sectionPassed = $false
            $failures += "PING failed"
        }
    } catch {
        Write-Fail "Docker exec failed"
        $sectionPassed = $false
        $failures += "Docker exec"
    }

    $Script:Results += [PSCustomObject]@{
        Section = "Redis"
        Status = if ($sectionPassed) { "PASS" } else { "FAIL" }
        Failures = ($failures -join "; ")
    }
}

#-------------------------------------------------------------------------------
# Section 4: NATS
#-------------------------------------------------------------------------------

function Test-NATS {
    Write-Section "4. NATS JETSTREAM"
    $sectionPassed = $true
    $failures = @()

    Write-Test "NATS server connection"
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    $result = Invoke-WebCheck "http://$($Config.NATS_HOST):$($Config.NATS_MONITOR_PORT)/healthz"
    if ($result.Success) {
        Write-Pass $sw.ElapsedMilliseconds
    } else {
        Write-Fail "Server not responding"
        $sectionPassed = $false
        $failures += "Connection"
    }

    Write-Test "JetStream enabled"
    $result = Invoke-WebCheck "http://$($Config.NATS_HOST):$($Config.NATS_MONITOR_PORT)/jsz"
    if ($result.Success -and $result.Content -match '"streams"') {
        Write-Pass
    } else {
        Write-Fail "JetStream not enabled"
        $sectionPassed = $false
        $failures += "JetStream"
    }

    $Script:Results += [PSCustomObject]@{
        Section = "NATS JetStream"
        Status = if ($sectionPassed) { "PASS" } else { "FAIL" }
        Failures = ($failures -join "; ")
    }
}

#-------------------------------------------------------------------------------
# Section 5: Vault
#-------------------------------------------------------------------------------

function Test-Vault {
    Write-Section "5. HASHICORP VAULT"
    $sectionPassed = $true
    $failures = @()

    Write-Test "Vault health"
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    $result = Invoke-WebCheck "$($Config.VAULT_ADDR)/v1/sys/health"
    if ($result.Success) {
        Write-Pass $sw.ElapsedMilliseconds

        Write-Test "Seal status"
        if ($result.Content -match '"sealed":\s*false') {
            Write-Pass
        } else {
            Write-Fail "Vault is sealed"
            $sectionPassed = $false
            $failures += "Sealed"
        }
    } else {
        Write-Fail "Not responding"
        $sectionPassed = $false
        $failures += "Health"
    }

    $Script:Results += [PSCustomObject]@{
        Section = "Vault"
        Status = if ($sectionPassed) { "PASS" } else { "FAIL" }
        Failures = ($failures -join "; ")
    }
}

#-------------------------------------------------------------------------------
# Section 6: VictoriaMetrics
#-------------------------------------------------------------------------------

function Test-VictoriaMetrics {
    Write-Section "6. VICTORIAMETRICS TIME-SERIES DB"
    $sectionPassed = $true
    $failures = @()

    Write-Test "VictoriaMetrics health"
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    $result = Invoke-WebCheck "http://$($Config.VICTORIA_HOST):$($Config.VICTORIA_PORT)/health"
    if ($result.Success) {
        Write-Pass $sw.ElapsedMilliseconds
    } else {
        Write-Fail "Not responding"
        $sectionPassed = $false
        $failures += "Health"
    }

    $Script:Results += [PSCustomObject]@{
        Section = "VictoriaMetrics"
        Status = if ($sectionPassed) { "PASS" } else { "FAIL" }
        Failures = ($failures -join "; ")
    }
}

#-------------------------------------------------------------------------------
# Section 7: Observability
#-------------------------------------------------------------------------------

function Test-Observability {
    Write-Section "7. OBSERVABILITY STACK"
    $sectionPassed = $true
    $failures = @()

    Write-Test "Grafana health"
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    $result = Invoke-WebCheck "http://localhost:$($Config.GRAFANA_PORT)/api/health"
    if ($result.Success -and $result.Content -match '"database":\s*"ok"') {
        Write-Pass $sw.ElapsedMilliseconds
    } else {
        Write-Fail "Grafana not healthy"
        $sectionPassed = $false
        $failures += "Grafana"
    }

    Write-Test "Loki health"
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    $result = Invoke-WebCheck "http://localhost:3100/ready"
    if ($result.Success) {
        Write-Pass $sw.ElapsedMilliseconds
    } else {
        Write-Fail "Loki not ready"
        $sectionPassed = $false
        $failures += "Loki"
    }

    Write-Test "Jaeger health"
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    $result = Invoke-WebCheck "http://localhost:16686/"
    if ($result.Success) {
        Write-Pass $sw.ElapsedMilliseconds
    } else {
        Write-Fail "Jaeger not responding"
        $sectionPassed = $false
        $failures += "Jaeger"
    }

    $Script:Results += [PSCustomObject]@{
        Section = "Observability"
        Status = if ($sectionPassed) { "PASS" } else { "FAIL" }
        Failures = ($failures -join "; ")
    }
}

#-------------------------------------------------------------------------------
# Section 8: API Gateway
#-------------------------------------------------------------------------------

function Test-Gateway {
    Write-Section "8. API GATEWAY CONNECTIVITY"
    $sectionPassed = $true
    $failures = @()

    Write-Test "Gateway health endpoint"
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    $result = Invoke-WebCheck "$($Config.GATEWAY_URL)/healthz"
    if (-not $result.Success) {
        $result = Invoke-WebCheck "$($Config.GATEWAY_URL)/livez"
    }
    if ($result.Success) {
        Write-Pass $sw.ElapsedMilliseconds
    } else {
        Write-Fail "Gateway not responding"
        $sectionPassed = $false
        $failures += "Gateway health"
    }

    Write-Test "OpenAPI documentation"
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    $result = Invoke-WebCheck "$($Config.GATEWAY_URL)/docs/json"
    if ($result.Success -and $result.Content -match '"openapi"') {
        Write-Pass $sw.ElapsedMilliseconds
    } else {
        Write-Warn "OpenAPI spec not available"
    }

    $Script:Results += [PSCustomObject]@{
        Section = "API Gateway"
        Status = if ($sectionPassed) { "PASS" } else { "FAIL" }
        Failures = ($failures -join "; ")
    }
}

#-------------------------------------------------------------------------------
# Final Report
#-------------------------------------------------------------------------------

function Write-Report {
    Write-Host ""
    Write-Host ("=" * 70) -ForegroundColor Blue
    Write-Host "         GridWatch INFRASTRUCTURE PRE-FLIGHT REPORT" -ForegroundColor Blue
    Write-Host ("=" * 70) -ForegroundColor Blue
    Write-Host ""

    foreach ($result in $Script:Results) {
        $statusColor = if ($result.Status -eq "PASS") { "Green" } else { "Red" }
        $statusSymbol = if ($result.Status -eq "PASS") { "[OK]" } else { "[X]" }
        Write-Host "  $statusSymbol $($result.Section.PadRight(25))" -ForegroundColor $statusColor -NoNewline
        if ($result.Failures) {
            Write-Host " - $($result.Failures)" -ForegroundColor Red
        } else {
            Write-Host ""
        }
    }

    Write-Host ""
    Write-Host ("=" * 70) -ForegroundColor Blue
    Write-Host "  PASSED: $($Script:Passed)  FAILED: $($Script:Failed)  WARNINGS: $($Script:Warnings)" -ForegroundColor $(if ($Script:Failed -eq 0) { "Green" } else { "Red" })
    Write-Host ("=" * 70) -ForegroundColor Blue

    if ($Script:Failed -gt 0) {
        Write-Host ""
        Write-Host "Pre-flight checks FAILED. Fix issues before running E2E tests." -ForegroundColor Red
        exit 1
    } else {
        Write-Host ""
        Write-Host "All pre-flight checks passed. Ready for E2E testing." -ForegroundColor Green
        exit 0
    }
}

#-------------------------------------------------------------------------------
# Main
#-------------------------------------------------------------------------------

Write-Host ""
Write-Host ("=" * 70) -ForegroundColor Blue
Write-Host "      GridWatch NetEnterprise - INFRASTRUCTURE PRE-FLIGHT CHECK" -ForegroundColor Blue
Write-Host "                     $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" -ForegroundColor Blue
Write-Host ("=" * 70) -ForegroundColor Blue

Test-DockerContainers
Test-PostgreSQL
Test-Redis
Test-NATS
Test-Vault
Test-VictoriaMetrics
Test-Observability
Test-Gateway

Write-Report
