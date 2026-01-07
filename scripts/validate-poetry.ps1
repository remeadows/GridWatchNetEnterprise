# NetNynja Enterprise - Poetry Validation Script for Windows
#
# This script validates that Poetry is properly installed and configured
# on Windows systems.
#
# Usage: .\scripts\validate-poetry.ps1
#
# Requirements:
# - Windows 10/11 or Windows Server 2019+
# - PowerShell 5.1 or later (PowerShell 7+ recommended)
# - Python 3.11+ installed
#
# Exit codes:
#   0 - All validations passed
#   1 - Validation failed

$ErrorActionPreference = "Stop"

# ============================================
# Helper Functions
# ============================================

function Write-Header {
    param([string]$Text)
    Write-Host "`n========================================" -ForegroundColor Blue
    Write-Host $Text -ForegroundColor Blue
    Write-Host "========================================`n" -ForegroundColor Blue
}

function Write-Info {
    param([string]$Text)
    Write-Host "[INFO] $Text" -ForegroundColor Cyan
}

function Write-Pass {
    param([string]$Text)
    Write-Host "[PASS] $Text" -ForegroundColor Green
}

function Write-Warn {
    param([string]$Text)
    Write-Host "[WARN] $Text" -ForegroundColor Yellow
}

function Write-Fail {
    param([string]$Text)
    Write-Host "[FAIL] $Text" -ForegroundColor Red
    $script:Failures++
}

# Track failures
$script:Failures = 0

# ============================================
# Platform Detection
# ============================================

Write-Header "NetNynja Enterprise - Poetry Validator"

Write-Info "Detecting platform..."
$OSVersion = [System.Environment]::OSVersion
$PSVersionTable | Format-Table -AutoSize

if ($IsWindows -or $env:OS -eq "Windows_NT") {
    Write-Pass "Running on Windows: $($OSVersion.VersionString)"
} else {
    Write-Warn "This script is designed for Windows. Running on: $($OSVersion.Platform)"
}

# ============================================
# Python Version Check
# ============================================

Write-Info "Checking Python installation..."

$pythonCmd = $null
foreach ($cmd in @("python3", "python", "py")) {
    try {
        $version = & $cmd --version 2>&1
        if ($LASTEXITCODE -eq 0 -and $version -match "Python 3\.") {
            $pythonCmd = $cmd
            break
        }
    } catch {
        continue
    }
}

if (-not $pythonCmd) {
    Write-Fail "Python 3.x not found. Please install Python 3.11+"
    Write-Host "`nInstallation options:" -ForegroundColor Yellow
    Write-Host "  - Windows Store: winget install Python.Python.3.11"
    Write-Host "  - Official: https://www.python.org/downloads/"
    exit 1
}

$pythonVersion = (& $pythonCmd --version 2>&1) -replace "Python ", ""
$majorMinor = [version]($pythonVersion -replace "(\d+\.\d+).*", '$1')

if ($majorMinor -lt [version]"3.11") {
    Write-Fail "Python $pythonVersion is below required 3.11"
} else {
    Write-Pass "Python version: $pythonVersion (using $pythonCmd)"
}

# Check pip
try {
    $pipVersion = & $pythonCmd -m pip --version 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Pass "pip installed: $($pipVersion -split ' ' | Select-Object -First 2 | Join-String -Separator ' ')"
    } else {
        Write-Warn "pip not available"
    }
} catch {
    Write-Warn "Could not check pip: $_"
}

# ============================================
# Poetry Installation Check
# ============================================

Write-Info "Checking Poetry installation..."

$poetryCmd = $null
$poetryPaths = @(
    "$env:APPDATA\Python\Scripts\poetry.exe",
    "$env:LOCALAPPDATA\Programs\Python\Python311\Scripts\poetry.exe",
    "$env:LOCALAPPDATA\Programs\Python\Python312\Scripts\poetry.exe",
    "$env:USERPROFILE\.local\bin\poetry.exe",
    "poetry"
)

foreach ($path in $poetryPaths) {
    try {
        if (Test-Path $path -ErrorAction SilentlyContinue) {
            $poetryCmd = $path
            break
        }
        $version = & $path --version 2>&1
        if ($LASTEXITCODE -eq 0 -and $version -match "Poetry") {
            $poetryCmd = $path
            break
        }
    } catch {
        continue
    }
}

if (-not $poetryCmd) {
    try {
        $version = & poetry --version 2>&1
        if ($LASTEXITCODE -eq 0) {
            $poetryCmd = "poetry"
        }
    } catch {}
}

if (-not $poetryCmd) {
    Write-Fail "Poetry not found"
    Write-Host "`nInstallation instructions:" -ForegroundColor Yellow
    Write-Host "  Option 1 (Official installer - Recommended):"
    Write-Host "    (Invoke-WebRequest -Uri https://install.python-poetry.org -UseBasicParsing).Content | $pythonCmd -"
    Write-Host ""
    Write-Host "  Option 2 (pipx - if installed):"
    Write-Host "    pipx install poetry"
    Write-Host ""
    Write-Host "  Option 3 (pip):"
    Write-Host "    pip install poetry"
    Write-Host ""
    Write-Host "After installation, restart your terminal and ensure Poetry is in PATH."
    exit 1
}

$poetryVersion = (& $poetryCmd --version 2>&1) -replace "Poetry \(version ", "" -replace "\)", ""
Write-Pass "Poetry version: $poetryVersion"

# Check Poetry configuration
Write-Info "Checking Poetry configuration..."

try {
    $virtualenvsInProject = & $poetryCmd config virtualenvs.in-project 2>&1
    if ($virtualenvsInProject -eq "true") {
        Write-Pass "virtualenvs.in-project = true (project-local venv)"
    } else {
        Write-Warn "virtualenvs.in-project = $virtualenvsInProject (consider setting to true)"
        Write-Host "  To set: poetry config virtualenvs.in-project true" -ForegroundColor Gray
    }
} catch {
    Write-Warn "Could not read Poetry config: $_"
}

# ============================================
# pyproject.toml Validation
# ============================================

Write-Info "Validating pyproject.toml..."

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$rootDir = Split-Path -Parent $scriptDir
$pyprojectPath = Join-Path $rootDir "pyproject.toml"

if (-not (Test-Path $pyprojectPath)) {
    Write-Fail "pyproject.toml not found at $pyprojectPath"
} else {
    Write-Pass "Root pyproject.toml found"

    # Basic validation
    $content = Get-Content $pyprojectPath -Raw

    if ($content -match "\[tool\.poetry\]") {
        Write-Pass "Poetry configuration section present"
    } else {
        Write-Fail "No [tool.poetry] section found"
    }

    if ($content -match "python\s*=\s*\"[\^~]?3\.11") {
        Write-Pass "Python 3.11+ requirement specified"
    } else {
        Write-Warn "Python version constraint may not match 3.11+"
    }

    # Check for Windows-incompatible dependencies
    $winIncompatible = @(
        "uvloop"  # uvloop is Linux-only
    )

    foreach ($dep in $winIncompatible) {
        if ($content -match "$dep\s*=") {
            Write-Warn "Dependency '$dep' is not compatible with Windows - ensure it's optional or has fallback"
        }
    }
}

# Check app-specific pyproject.toml files
$appPyprojects = @(
    "apps\ipam\pyproject.toml",
    "apps\npm\pyproject.toml",
    "apps\stig\pyproject.toml"
)

foreach ($appPyproject in $appPyprojects) {
    $fullPath = Join-Path $rootDir $appPyproject
    if (Test-Path $fullPath) {
        Write-Pass "Found: $appPyproject"
    } else {
        Write-Warn "Missing: $appPyproject"
    }
}

# ============================================
# Poetry Lock Check
# ============================================

Write-Info "Checking poetry.lock..."

$poetryLockPath = Join-Path $rootDir "poetry.lock"

if (-not (Test-Path $poetryLockPath)) {
    Write-Warn "poetry.lock not found - run 'poetry lock' to generate"
} else {
    Write-Pass "poetry.lock exists"

    # Check if lock is current
    try {
        Push-Location $rootDir
        $checkOutput = & $poetryCmd check 2>&1
        if ($LASTEXITCODE -eq 0) {
            Write-Pass "poetry.lock is up to date"
        } else {
            Write-Warn "poetry.lock may be out of sync: $checkOutput"
        }
    } catch {
        Write-Warn "Could not verify poetry.lock: $_"
    } finally {
        Pop-Location
    }
}

# ============================================
# Test Poetry Install (Dry Run)
# ============================================

Write-Info "Testing Poetry install (dry run)..."

try {
    Push-Location $rootDir

    # Check if we can resolve dependencies
    $dryRunOutput = & $poetryCmd install --dry-run 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Pass "Dependencies can be resolved"
    } else {
        Write-Fail "Dependency resolution failed"
        Write-Host $dryRunOutput -ForegroundColor Red
    }
} catch {
    Write-Fail "Poetry install dry-run failed: $_"
} finally {
    Pop-Location
}

# ============================================
# Windows-Specific Checks
# ============================================

Write-Info "Performing Windows-specific checks..."

# Check for long path support
$longPathEnabled = $false
try {
    $regPath = "HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem"
    $longPathValue = Get-ItemProperty -Path $regPath -Name "LongPathsEnabled" -ErrorAction SilentlyContinue
    if ($longPathValue.LongPathsEnabled -eq 1) {
        Write-Pass "Long paths enabled (LongPathsEnabled = 1)"
        $longPathEnabled = $true
    } else {
        Write-Warn "Long paths not enabled - some packages may have issues"
        Write-Host "  To enable: Set-ItemProperty -Path 'HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem' -Name 'LongPathsEnabled' -Value 1" -ForegroundColor Gray
    }
} catch {
    Write-Warn "Could not check long path setting (requires admin access)"
}

# Check for Visual C++ Build Tools (needed for some packages)
$vcBuildTools = $false
$vcPaths = @(
    "${env:ProgramFiles(x86)}\Microsoft Visual Studio\2022\BuildTools",
    "${env:ProgramFiles(x86)}\Microsoft Visual Studio\2019\BuildTools",
    "${env:ProgramFiles}\Microsoft Visual Studio\2022\Community",
    "${env:ProgramFiles}\Microsoft Visual Studio\2019\Community"
)

foreach ($vcPath in $vcPaths) {
    if (Test-Path $vcPath) {
        Write-Pass "Visual C++ Build Tools found: $vcPath"
        $vcBuildTools = $true
        break
    }
}

if (-not $vcBuildTools) {
    Write-Warn "Visual C++ Build Tools not found - required for building some Python packages"
    Write-Host "  Download from: https://visualstudio.microsoft.com/visual-cpp-build-tools/" -ForegroundColor Gray
}

# Check execution policy
$executionPolicy = Get-ExecutionPolicy
if ($executionPolicy -in @("Restricted", "AllSigned")) {
    Write-Warn "PowerShell execution policy is '$executionPolicy' - scripts may not run"
    Write-Host "  To change: Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser" -ForegroundColor Gray
} else {
    Write-Pass "PowerShell execution policy: $executionPolicy"
}

# ============================================
# Summary
# ============================================

Write-Header "Validation Summary"

if ($script:Failures -eq 0) {
    Write-Host "All validations passed!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Poetry is properly configured for Windows development."
    Write-Host ""
    Write-Host "Next steps:" -ForegroundColor Cyan
    Write-Host "  1. cd to project root"
    Write-Host "  2. poetry install"
    Write-Host "  3. poetry shell (to activate virtual environment)"
    Write-Host ""
} else {
    Write-Host "$($script:Failures) validation(s) failed" -ForegroundColor Red
    Write-Host ""
    Write-Host "Please address the issues above before proceeding."
    Write-Host ""
}

Write-Host "Platform notes:" -ForegroundColor Cyan
Write-Host "  - Use 'poetry shell' or 'poetry run' to execute commands in venv"
Write-Host "  - Some packages (uvloop) are Linux-only; fallbacks should be configured"
Write-Host "  - For native extensions, ensure Visual C++ Build Tools are installed"
Write-Host ""

exit $script:Failures
