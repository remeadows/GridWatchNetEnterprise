# GridWatch NetEnterprise — Phase 6: Repository Rename
# Run AFTER the PR is merged and Phase 3 (data migration) is complete.
#
# WHAT THIS DOES:
#   1. Renames the GitHub repository via gh CLI
#   2. Updates the local git remote URL
#   3. Renames the local directory
#   4. Tags v0.3.0-gridwatch
#   5. Updates MEMORY.md rebrand status

$ErrorActionPreference = "Stop"
$OldDir  = "C:\Users\rmeadows\Code Development\dev\NetNynja\NetNynjaEnterprise"
$NewDir  = "C:\Users\rmeadows\Code Development\dev\NetNynja\GridWatchNetEnterprise"
$NewRepo = "GridWatchNetEnterprise"
$NewRemote = "https://github.com/remeadows/$NewRepo.git"

Write-Host ""
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "  GridWatch Phase 6: Repository Rename" -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host ""

Set-Location $OldDir

# --- Step 1: Rename GitHub repo ---
Write-Host "[1/4] Renaming GitHub repository to '$NewRepo'..." -ForegroundColor Yellow
Write-Host "  NOTE: gh CLI must be authenticated (gh auth login)" -ForegroundColor Gray
gh repo rename $NewRepo --yes 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host "  GitHub repo renamed to: remeadows/$NewRepo" -ForegroundColor Green
} else {
    Write-Host "  ERROR renaming repo. Do it manually:" -ForegroundColor Red
    Write-Host "  GitHub.com → remeadows/NetNynjaEnterprise → Settings → Repository name → GridWatchNetEnterprise" -ForegroundColor Yellow
}

# --- Step 2: Update local remote URL ---
Write-Host "[2/4] Updating local git remote URL..." -ForegroundColor Yellow
git remote set-url origin $NewRemote 2>&1
git remote -v 2>&1
Write-Host "  Remote updated to: $NewRemote" -ForegroundColor Green

# --- Step 3: Tag v0.3.0-gridwatch on main ---
Write-Host "[3/4] Tagging v0.3.0-gridwatch..." -ForegroundColor Yellow
git fetch origin main 2>&1 | Out-Null
git tag -a v0.3.0-gridwatch -m "GridWatch NetEnterprise v0.3.0 - full brand rename from NetNynja" origin/main 2>&1
git push origin v0.3.0-gridwatch 2>&1
Write-Host "  Tag pushed: v0.3.0-gridwatch" -ForegroundColor Green

# --- Step 4: Rename local directory ---
Write-Host "[4/4] Renaming local directory..." -ForegroundColor Yellow
Set-Location ".."
if (Test-Path $OldDir) {
    Rename-Item -Path $OldDir -NewName "GridWatchNetEnterprise"
    Write-Host "  Directory renamed:" -ForegroundColor Green
    Write-Host "    $OldDir" -ForegroundColor Gray
    Write-Host "    → $NewDir" -ForegroundColor Green
} else {
    Write-Host "  Directory already renamed or not found." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "==================================================" -ForegroundColor Green
Write-Host "  Phase 6 Complete!" -ForegroundColor Green
Write-Host "==================================================" -ForegroundColor Green
Write-Host ""
Write-Host "Final checklist:" -ForegroundColor Cyan
Write-Host "  1. Open GitHub Desktop → remove old repo → add new from: $NewDir" -ForegroundColor White
Write-Host "  2. Update any CI/CD secrets that reference the old repo name" -ForegroundColor White
Write-Host "  3. Update Linear/Notion project links if bookmarked" -ForegroundColor White
Write-Host "  4. Update CLAUDE.md + MEMORY.md with new directory path" -ForegroundColor White
Write-Host "  5. Bump version to 0.3.0 across all package.json / pyproject.toml" -ForegroundColor White
Write-Host ""
