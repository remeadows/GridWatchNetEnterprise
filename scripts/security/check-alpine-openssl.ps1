#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Daily Alpine OpenSSL vulnerability monitoring

.DESCRIPTION
    Checks Alpine-based Docker images for OpenSSL security patches.
    Specifically monitors for CVE-2025-15467 remediation.

.PARAMETER EmailAlerts
    Send email alerts when patches are detected

.PARAMETER SlackWebhook
    Slack webhook URL for notifications

.EXAMPLE
    .\check-alpine-openssl.ps1
    Run basic check and display results

.EXAMPLE
    .\check-alpine-openssl.ps1 -EmailAlerts -To "security@example.com"
    Run check and send email if patches found

.NOTES
    Schedule this script to run daily at 8 AM
    Related: SEC-012, SEC-013, Phase 1B
#>

[CmdletBinding()]
param(
    [switch]$EmailAlerts,
    [string]$EmailTo = "security@example.com",
    [string]$SlackWebhook = ""
)

$ErrorActionPreference = "Stop"

# Configuration
$images = @(
    @{
        Name = "postgres:15-alpine"
        CurrentVersion = "3.5.4-r0"
        PatchedVersion = "3.5.5-r0"
        Service = "PostgreSQL"
        Priority = "High"
    },
    @{
        Name = "redis:7-alpine"
        CurrentVersion = "3.3.5-r0"
        PatchedVersion = "3.3.6-r0"
        Service = "Redis"
        Priority = "High"
    },
    @{
        Name = "nats:2.10-alpine"
        CurrentVersion = "3.5.4-r0"
        PatchedVersion = "3.5.5-r0"
        Service = "NATS"
        Priority = "Medium"
    },
    @{
        Name = "grafana/grafana:11.4.0"
        CurrentVersion = "3.3.2-r0"
        PatchedVersion = "3.3.6-r0"
        Service = "Grafana"
        Priority = "High"
    }
)

$patchedImages = @()
$stillVulnerable = @()

# Header
Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "Alpine OpenSSL Vulnerability Monitor" -ForegroundColor Cyan
Write-Host "Checking for CVE-2025-15467 patches" -ForegroundColor Cyan
Write-Host "Scan Time: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

foreach ($img in $images) {
    Write-Host "Checking $($img.Name)..." -ForegroundColor White
    
    # Pull latest version quietly
    Write-Host "  Pulling latest version..." -NoNewline
    docker pull $img.Name -q 2>&1 | Out-Null
    if ($LASTEXITCODE -eq 0) {
        Write-Host " OK" -ForegroundColor Green
    } else {
        Write-Host " FAILED" -ForegroundColor Red
        $stillVulnerable += $img
        continue
    }
    
    # Check OpenSSL version
    Write-Host "  Checking OpenSSL version..." -NoNewline
    $version = docker run --rm $img.Name sh -c "apk info openssl 2>/dev/null | grep 'openssl-'" 2>$null
    
    if ($version) {
        Write-Host " $version" -ForegroundColor Yellow
        
        # Parse version number
        if ($version -match 'openssl-(\d+\.\d+\.\d+-r\d+)') {
            $detectedVersion = $matches[1]
            
            # Compare versions
            if ($detectedVersion -ge $img.PatchedVersion) {
                Write-Host "  ✅ PATCHED! ($detectedVersion >= $($img.PatchedVersion))" -ForegroundColor Green
                $img | Add-Member -NotePropertyName "DetectedVersion" -NotePropertyValue $detectedVersion -Force
                $patchedImages += $img
            } else {
                Write-Host "  ⚠️  Still vulnerable ($detectedVersion < $($img.PatchedVersion))" -ForegroundColor Yellow
                $img | Add-Member -NotePropertyName "DetectedVersion" -NotePropertyValue $detectedVersion -Force
                $stillVulnerable += $img
            }
        } else {
            Write-Host "  ⚠️  Could not parse version" -ForegroundColor Red
            $stillVulnerable += $img
        }
    } else {
        Write-Host " ERROR - Could not detect OpenSSL" -ForegroundColor Red
        $stillVulnerable += $img
    }
    
    Write-Host ""
}

# Summary
Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "Summary" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

Write-Host "Total images checked: $($images.Count)" -ForegroundColor White
Write-Host "Patched: $($patchedImages.Count)" -ForegroundColor Green
Write-Host "Still vulnerable: $($stillVulnerable.Count)" -ForegroundColor Yellow

if ($patchedImages.Count -gt 0) {
    Write-Host "`n🎉 PATCHED IMAGES FOUND!" -ForegroundColor Green
    Write-Host "The following images have been patched:" -ForegroundColor Green
    foreach ($img in $patchedImages) {
        Write-Host "  - $($img.Service) ($($img.Name)): $($img.CurrentVersion) → $($img.DetectedVersion)" -ForegroundColor Green
    }
    
    Write-Host "`n⚡ ACTION REQUIRED:" -ForegroundColor Yellow
    Write-Host "1. Review docs/security/PHASE_1B_ACTION_PLAN.md" -ForegroundColor White
    Write-Host "2. Execute rapid deployment runbook" -ForegroundColor White
    Write-Host "3. Deploy to staging first" -ForegroundColor White
    Write-Host "4. Verify and deploy to production" -ForegroundColor White
    Write-Host "5. Close SEC-013 exception ticket" -ForegroundColor White
} else {
    Write-Host "`nNo patches detected. Next check: Tomorrow 8 AM" -ForegroundColor Yellow
}

if ($stillVulnerable.Count -gt 0) {
    Write-Host "`nStill vulnerable:" -ForegroundColor Yellow
    foreach ($img in $stillVulnerable) {
        Write-Host "  - $($img.Service) ($($img.Name)): $($img.CurrentVersion) → waiting for $($img.PatchedVersion)" -ForegroundColor Yellow
    }
}

# Send alerts if patches found
if ($patchedImages.Count -gt 0) {
    
    # Email alert
    if ($EmailAlerts) {
        Write-Host "`nSending email alert to $EmailTo..." -NoNewline
        
        $subject = "🔒 Security Patches Available - Alpine OpenSSL CVE-2025-15467"
        $body = @"
Alpine OpenSSL Security Patches Detected

The following Docker images have been updated with OpenSSL security patches for CVE-2025-15467:

$($patchedImages | ForEach-Object { "- $($_.Service) ($($_.Name)): $($_.CurrentVersion) → $($_.DetectedVersion)" } | Out-String)

Action Required:
1. Review the rapid deployment runbook in docs/security/PHASE_1B_ACTION_PLAN.md
2. Schedule maintenance window (estimated downtime: 5 minutes)
3. Deploy to staging environment first
4. Verify staging for 1-4 hours
5. Deploy to production
6. Close SEC-013 exception ticket

Still Vulnerable:
$($stillVulnerable | ForEach-Object { "- $($_.Service) ($($_.Name)): waiting for $($_.PatchedVersion)" } | Out-String)

Report generated: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')
Automated scan via check-alpine-openssl.ps1
"@
        
        try {
            # Note: Configure SMTP settings as needed
            Send-MailMessage `
                -To $EmailTo `
                -From "netnynja-security@example.com" `
                -Subject $subject `
                -Body $body `
                -SmtpServer "smtp.example.com" `
                -ErrorAction Stop
            
            Write-Host " Sent ✅" -ForegroundColor Green
        } catch {
            Write-Host " Failed: $_" -ForegroundColor Red
        }
    }
    
    # Slack notification
    if ($SlackWebhook) {
        Write-Host "Sending Slack notification..." -NoNewline
        
        $slackPayload = @{
            text = "🔒 Security Patches Available"
            blocks = @(
                @{
                    type = "header"
                    text = @{
                        type = "plain_text"
                        text = "Alpine OpenSSL Patches Detected"
                    }
                },
                @{
                    type = "section"
                    text = @{
                        type = "mrkdwn"
                        text = "*CVE-2025-15467 patches are now available!*`n`nPatched images:"
                    }
                },
                @{
                    type = "section"
                    text = @{
                        type = "mrkdwn"
                        text = $($patchedImages | ForEach-Object { "• *$($_.Service)*: ``$($_.Name)`` ($($_.CurrentVersion) → $($_.DetectedVersion))" } | Join-String -Separator "`n")
                    }
                },
                @{
                    type = "section"
                    text = @{
                        type = "mrkdwn"
                        text = "*Action Required:*`n1. Review rapid deployment runbook`n2. Deploy to staging`n3. Verify and deploy to production"
                    }
                }
            )
        } | ConvertTo-Json -Depth 10
        
        try {
            Invoke-RestMethod -Uri $SlackWebhook -Method Post -Body $slackPayload -ContentType "application/json" | Out-Null
            Write-Host " Sent ✅" -ForegroundColor Green
        } catch {
            Write-Host " Failed: $_" -ForegroundColor Red
        }
    }
}

# Log results
$logDir = "logs/security"
if (-not (Test-Path $logDir)) {
    New-Item -ItemType Directory -Path $logDir -Force | Out-Null
}

$logFile = "$logDir/alpine-openssl-check-$(Get-Date -Format 'yyyy-MM-dd').log"
$logEntry = @{
    Timestamp = Get-Date -Format 'o'
    ImagesChecked = $images.Count
    Patched = $patchedImages.Count
    Vulnerable = $stillVulnerable.Count
    PatchedImages = $patchedImages | Select-Object Service, Name, CurrentVersion, DetectedVersion
    VulnerableImages = $stillVulnerable | Select-Object Service, Name, CurrentVersion, PatchedVersion
} | ConvertTo-Json -Depth 5

Add-Content -Path $logFile -Value $logEntry

Write-Host "`nLog saved to: $logFile" -ForegroundColor Gray

# Exit code
if ($patchedImages.Count -gt 0) {
    exit 10  # Patches found
} elseif ($stillVulnerable.Count -gt 0) {
    exit 1   # Still vulnerable
} else {
    exit 0   # All patched
}
