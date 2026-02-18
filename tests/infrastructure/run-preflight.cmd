@echo off
REM GridWatch NetEnterprise - Cross-platform Preflight Runner (Windows CMD wrapper)
REM Runs preflight.ps1 for Windows environments

echo.
echo Running GridWatch NetEnterprise Pre-flight Checks...
echo.

REM Check if PowerShell is available
where powershell >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    powershell -ExecutionPolicy Bypass -File "%~dp0preflight.ps1" %*
    exit /b %ERRORLEVEL%
)

REM Fallback to pwsh (PowerShell Core)
where pwsh >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    pwsh -ExecutionPolicy Bypass -File "%~dp0preflight.ps1" %*
    exit /b %ERRORLEVEL%
)

echo ERROR: PowerShell not found. Please install PowerShell.
exit /b 1
