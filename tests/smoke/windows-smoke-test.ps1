# GridWatch NetEnterprise - Windows 11/Server Smoke Test Suite
# Phase 8: Cross-Platform Testing
#
# Usage: .\tests\smoke\windows-smoke-test.ps1 [-Profile <profile>]
# Profiles: infra, ipam, npm, stig, all (default: infra)
#
# Prerequisites:
#   - Windows 11 or Windows Server 2022+
#   - Docker Desktop with WSL2 backend
#   - PowerShell 7.x (recommended) or Windows PowerShell 5.1

[CmdletBinding()]
param(
    [Parameter()]
    [ValidateSet('infra', 'ipam', 'npm', 'stig', 'all')]
    [string]$Profile = 'infra'
)

$ErrorActionPreference = 'Stop'

# Configuration
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent (Split-Path -Parent $ScriptDir)
$ResultsDir = Join-Path $ProjectRoot "tests\smoke\results"
$ResultsFile = Join-Path $ResultsDir "windows-$(Get-Date -Format 'yyyyMMdd-HHmmss').json"

# Test counters
$script:TestsPassed = 0
$script:TestsFailed = 0
$script:TestsSkipped = 0
$script:TestResults = @()

# Ensure results directory exists
if (-not (Test-Path $ResultsDir)) {
    New-Item -ItemType Directory -Path $ResultsDir -Force | Out-Null
}

# Logging functions
function Write-TestInfo { param($Message) Write-Host "[INFO] $Message" -ForegroundColor Cyan }
function Write-TestPass {
    param($TestName)
    Write-Host "[PASS] $TestName" -ForegroundColor Green
    $script:TestsPassed++
    $script:TestResults += @{ test = $TestName; status = "pass" }
}
function Write-TestFail {
    param($TestName, $ErrorMsg)
    Write-Host "[FAIL] ${TestName}: ${ErrorMsg}" -ForegroundColor Red
    $script:TestsFailed++
    $script:TestResults += @{ test = $TestName; status = "fail"; error = $ErrorMsg }
}
function Write-TestSkip {
    param($TestName, $Reason)
    Write-Host "[SKIP] ${TestName}: ${Reason}" -ForegroundColor Yellow
    $script:TestsSkipped++
    $script:TestResults += @{ test = $TestName; status = "skip"; reason = $Reason }
}
function Write-TestSection {
    param($Section)
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host $Section -ForegroundColor Cyan
    Write-Host "========================================" -ForegroundColor Cyan
}

function Test-TcpPort {
    param($Host, $Port, $Timeout = 5)
    try {
        $tcp = New-Object System.Net.Sockets.TcpClient
        $connect = $tcp.BeginConnect($Host, $Port, $null, $null)
        $wait = $connect.AsyncWaitHandle.WaitOne($Timeout * 1000, $false)
        if ($wait) {
            $tcp.EndConnect($connect)
            $tcp.Close()
            return $true
        }
        $tcp.Close()
        return $false
    }
    catch {
        return $false
    }
}

function Test-HttpEndpoint {
    param($Url, $Timeout = 10)
    try {
        $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec $Timeout -ErrorAction Stop
        return $response.StatusCode -eq 200
    }
    catch {
        return $false
    }
}

# ===========================================
# SECTION 1: Windows Prerequisites
# ===========================================
function Test-Prerequisites {
    Write-TestSection "Section 1: Windows Prerequisites"

    # Test 1.1: Windows Version
    $osInfo = Get-CimInstance Win32_OperatingSystem
    $osCaption = $osInfo.Caption
    $osBuild = [System.Environment]::OSVersion.Version.Build

    if ($osCaption -match "Windows 11" -or $osCaption -match "Windows Server 2022" -or $osBuild -ge 22000) {
        Write-TestPass "1.1 Windows version compatible ($osCaption)"
    }
    elseif ($osCaption -match "Windows 10" -and $osBuild -ge 19041) {
        Write-TestPass "1.1 Windows version compatible ($osCaption Build $osBuild)"
    }
    else {
        Write-TestFail "1.1 Windows version" "Requires Windows 10 20H1+, Windows 11, or Windows Server 2022+"
        return $false
    }

    # Test 1.2: Docker Desktop installed
    $dockerPath = Get-Command docker -ErrorAction SilentlyContinue
    if ($dockerPath) {
        $dockerVersion = (docker --version) -replace 'Docker version ', '' -replace ',.*', ''
        Write-TestPass "1.2 Docker installed (v$dockerVersion)"
    }
    else {
        Write-TestFail "1.2 Docker installed" "Docker not found in PATH"
        return $false
    }

    # Test 1.3: Docker Compose installed
    try {
        $composeVersion = docker compose version --short 2>&1
        if ($LASTEXITCODE -eq 0) {
            Write-TestPass "1.3 Docker Compose installed (v$composeVersion)"
        }
        else {
            Write-TestFail "1.3 Docker Compose" "Docker Compose not available"
            return $false
        }
    }
    catch {
        Write-TestFail "1.3 Docker Compose" "Error checking Docker Compose"
        return $false
    }

    # Test 1.4: Docker daemon running
    try {
        $dockerInfo = docker info 2>&1
        if ($LASTEXITCODE -eq 0) {
            Write-TestPass "1.4 Docker daemon running"
        }
        else {
            Write-TestFail "1.4 Docker daemon" "Docker daemon not running"
            return $false
        }
    }
    catch {
        Write-TestFail "1.4 Docker daemon" "Cannot connect to Docker"
        return $false
    }

    # Test 1.5: WSL2 backend
    $wslStatus = wsl --status 2>&1
    if ($wslStatus -match "WSL 2" -or $wslStatus -match "Default Version: 2") {
        Write-TestPass "1.5 WSL2 backend available"
    }
    else {
        Write-TestSkip "1.5 WSL2 backend" "Could not verify WSL2 status"
    }

    # Test 1.6: Linux containers mode
    $dockerVersion = docker version --format '{{.Server.Os}}' 2>&1
    if ($dockerVersion -eq "linux") {
        Write-TestPass "1.6 Docker using Linux containers"
    }
    else {
        Write-TestFail "1.6 Docker container mode" "Expected Linux containers, got: $dockerVersion"
    }

    # Test 1.7: .env file exists
    $envFile = Join-Path $ProjectRoot ".env"
    if (Test-Path $envFile) {
        Write-TestPass "1.7 .env file exists"
    }
    else {
        Write-TestFail "1.7 .env file" "Missing .env file at $envFile"
        return $false
    }

    # Test 1.8: Git line endings configured
    $gitAutoCrlf = git config --global core.autocrlf 2>$null
    if ($gitAutoCrlf -eq "input" -or $gitAutoCrlf -eq "false") {
        Write-TestPass "1.8 Git line endings (autocrlf=$gitAutoCrlf)"
    }
    else {
        Write-TestSkip "1.8 Git line endings" "Recommend: git config --global core.autocrlf input"
    }

    # Test 1.9: Disk space
    $drive = (Get-Item $ProjectRoot).PSDrive
    $freeSpaceGB = [math]::Round((Get-PSDrive $drive.Name).Free / 1GB, 1)
    if ($freeSpaceGB -ge 5) {
        Write-TestPass "1.9 Sufficient disk space (${freeSpaceGB}GB free)"
    }
    else {
        Write-TestFail "1.9 Disk space" "Only ${freeSpaceGB}GB free, need 5GB+"
    }

    # Test 1.10: PowerShell version
    $psVersion = $PSVersionTable.PSVersion.ToString()
    if ($PSVersionTable.PSVersion.Major -ge 7) {
        Write-TestPass "1.10 PowerShell version ($psVersion)"
    }
    elseif ($PSVersionTable.PSVersion.Major -eq 5 -and $PSVersionTable.PSVersion.Minor -ge 1) {
        Write-TestPass "1.10 PowerShell version ($psVersion)"
    }
    else {
        Write-TestSkip "1.10 PowerShell version" "PowerShell 7+ recommended for best compatibility"
    }

    return $true
}

# ===========================================
# SECTION 2: Infrastructure Services
# ===========================================
function Test-Infrastructure {
    Write-TestSection "Section 2: Infrastructure Services"

    Set-Location $ProjectRoot

    # Test 2.1: Compose config validation
    Write-TestInfo "Validating compose configuration..."
    $configCheck = docker compose --profile $Profile config 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-TestPass "2.1 Docker Compose configuration valid"
    }
    else {
        Write-TestFail "2.1 Compose configuration" "Invalid compose file"
        return $false
    }

    # Test 2.2: Start infrastructure
    Write-TestInfo "Starting infrastructure services..."
    $startResult = docker compose --profile $Profile up -d 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-TestPass "2.2 Infrastructure services started"
    }
    else {
        Write-TestFail "2.2 Infrastructure services" "Failed to start: $startResult"
        return $false
    }

    Write-TestInfo "Waiting for services to initialize (45 seconds)..."
    Start-Sleep -Seconds 45

    # Test 2.3: PostgreSQL
    if (Test-TcpPort -Host "localhost" -Port 5433) {
        Write-TestPass "2.3 PostgreSQL accessible (localhost:5433)"
    }
    else {
        Write-TestFail "2.3 PostgreSQL" "Cannot connect to port 5433"
    }

    # Test 2.4: Redis
    if (Test-TcpPort -Host "localhost" -Port 6379) {
        Write-TestPass "2.4 Redis accessible (localhost:6379)"
    }
    else {
        Write-TestFail "2.4 Redis" "Cannot connect to port 6379"
    }

    # Test 2.5: NATS (port 8322 - changed from 8222 for Windows Hyper-V compatibility)
    if (Test-HttpEndpoint -Url "http://localhost:8322/healthz") {
        Write-TestPass "2.5 NATS healthy"
    }
    else {
        Write-TestFail "2.5 NATS" "Health check failed"
    }

    # Test 2.6: Vault (port 8300 - changed from 8200 for Windows Hyper-V compatibility)
    if (Test-HttpEndpoint -Url "http://localhost:8300/v1/sys/health") {
        Write-TestPass "2.6 Vault healthy"
    }
    else {
        Write-TestFail "2.6 Vault" "Health check failed"
    }

    # Test 2.7: Prometheus
    if (Test-HttpEndpoint -Url "http://localhost:9090/-/healthy") {
        Write-TestPass "2.7 Prometheus healthy"
    }
    else {
        Write-TestFail "2.7 Prometheus" "Health check failed"
    }

    # Test 2.8: Grafana (port 3002)
    if (Test-HttpEndpoint -Url "http://localhost:3002/api/health") {
        Write-TestPass "2.8 Grafana healthy (port 3002)"
    }
    else {
        Write-TestFail "2.8 Grafana" "Health check failed"
    }

    # Test 2.9: VictoriaMetrics
    if (Test-HttpEndpoint -Url "http://localhost:8428/health") {
        Write-TestPass "2.9 VictoriaMetrics healthy"
    }
    else {
        Write-TestFail "2.9 VictoriaMetrics" "Health check failed"
    }

    # Test 2.10: Loki
    if (Test-HttpEndpoint -Url "http://localhost:3100/ready") {
        Write-TestPass "2.10 Loki healthy"
    }
    else {
        Write-TestFail "2.10 Loki" "Health check failed"
    }

    # Test 2.11: Jaeger
    if (Test-HttpEndpoint -Url "http://localhost:16686/") {
        Write-TestPass "2.11 Jaeger UI accessible"
    }
    else {
        Write-TestFail "2.11 Jaeger" "UI not accessible"
    }
}

# ===========================================
# SECTION 3: Windows-Specific Tests
# ===========================================
function Test-WindowsSpecific {
    Write-TestSection "Section 3: Windows-Specific Tests"

    # Test 3.1: File path length support
    $longPathEnabled = (Get-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem" -Name "LongPathsEnabled" -ErrorAction SilentlyContinue).LongPathsEnabled
    if ($longPathEnabled -eq 1) {
        Write-TestPass "3.1 Long path support enabled"
    }
    else {
        Write-TestSkip "3.1 Long path support" "Not enabled - may cause issues with deep paths"
    }

    # Test 3.2: Windows Defender exclusions
    $dockerProgramFiles = "C:\Program Files\Docker"
    $exclusions = Get-MpPreference | Select-Object -ExpandProperty ExclusionPath -ErrorAction SilentlyContinue
    if ($exclusions -contains $dockerProgramFiles -or $exclusions -contains $ProjectRoot) {
        Write-TestPass "3.2 Windows Defender exclusions configured"
    }
    else {
        Write-TestSkip "3.2 Windows Defender" "Consider adding Docker and project paths to exclusions for better performance"
    }

    # Test 3.3: Docker Desktop resources
    Write-TestInfo "Docker Desktop resource allocation should be verified in Docker Desktop settings"
    Write-TestSkip "3.3 Docker Desktop resources" "Manual verification recommended (4GB+ RAM, 2+ CPUs)"

    # Test 3.4: Line ending handling in Git
    $gitConfig = git config --list 2>$null
    if ($gitConfig -match "core.autocrlf") {
        Write-TestPass "3.4 Git autocrlf configured"
    }
    else {
        Write-TestSkip "3.4 Git autocrlf" "Not explicitly configured"
    }
}

# ===========================================
# Generate Results
# ===========================================
function Save-Results {
    Write-TestSection "Test Results Summary"

    $total = $script:TestsPassed + $script:TestsFailed + $script:TestsSkipped
    $passRate = if ($total -gt 0) { [math]::Round(($script:TestsPassed / $total) * 100) } else { 0 }

    Write-Host ""
    Write-Host "Passed:  $script:TestsPassed" -ForegroundColor Green
    Write-Host "Failed:  $script:TestsFailed" -ForegroundColor Red
    Write-Host "Skipped: $script:TestsSkipped" -ForegroundColor Yellow
    Write-Host "Total:   $total" -ForegroundColor Cyan
    Write-Host "Pass Rate: $passRate%" -ForegroundColor Cyan

    $results = @{
        platform = "Windows"
        version = $([System.Environment]::OSVersion.VersionString)
        timestamp = (Get-Date -Format "yyyy-MM-ddTHH:mm:ssZ")
        profile = $Profile
        docker_version = (docker --version) -replace 'Docker version ', '' -replace ',.*', ''
        summary = @{
            passed = $script:TestsPassed
            failed = $script:TestsFailed
            skipped = $script:TestsSkipped
            total = $total
            pass_rate = $passRate
        }
        tests = $script:TestResults
    }

    $results | ConvertTo-Json -Depth 5 | Set-Content -Path $ResultsFile -Encoding UTF8
    Write-Host ""
    Write-Host "Results saved to: $ResultsFile"

    return $script:TestsFailed -eq 0
}

# ===========================================
# Cleanup
# ===========================================
function Invoke-Cleanup {
    Write-TestSection "Cleanup"

    $response = Read-Host "Tear down Docker services? [y/N]"
    if ($response -eq 'y' -or $response -eq 'Y') {
        Write-TestInfo "Stopping services..."
        docker compose --profile $Profile down -v 2>$null
        Write-TestInfo "Cleanup complete"
    }
    else {
        Write-TestInfo "Leaving services running"
    }
}

# ===========================================
# Main Execution
# ===========================================
function Main {
    Write-Host ""
    Write-Host "==============================================" -ForegroundColor Cyan
    Write-Host " GridWatch NetEnterprise - Windows Smoke Test" -ForegroundColor Cyan
    Write-Host " Profile: $Profile" -ForegroundColor Cyan
    Write-Host " Time: $(Get-Date)" -ForegroundColor Cyan
    Write-Host "==============================================" -ForegroundColor Cyan
    Write-Host ""

    $prereqsPassed = Test-Prerequisites
    if (-not $prereqsPassed) {
        Write-Host ""
        Write-Host "Prerequisites check failed. Cannot continue." -ForegroundColor Red
        exit 1
    }

    Test-Infrastructure
    Test-WindowsSpecific

    $success = Save-Results
    Invoke-Cleanup

    if (-not $success) {
        exit 1
    }
}

Main
