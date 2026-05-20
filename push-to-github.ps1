# Push ADAGDS project to GitHub (saad1032/pdc-final-task-1)
# Run once: right-click -> Run with PowerShell, or: .\push-to-github.ps1

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

$repoUrl = "https://github.com/saad1032/pdc-final-task-1.git"

Write-Host "`n=== PDC Final Task 1 -> GitHub ===`n" -ForegroundColor Cyan

if (-not (git rev-parse HEAD 2>$null)) {
    Write-Host "No commits found. Committing..." -ForegroundColor Yellow
    git -c user.name="saad1032" -c user.email="saad1032@users.noreply.github.com" add .
    git -c user.name="saad1032" -c user.email="saad1032@users.noreply.github.com" commit -m "Initial commit: ADAGDS master coordinator on port 5000"
}

git branch -M main 2>$null

$remotes = git remote 2>$null
if ($remotes -notcontains "origin") {
    git remote add origin $repoUrl
} else {
    git remote set-url origin $repoUrl
}

Write-Host "Pushing to $repoUrl ..." -ForegroundColor Cyan
Write-Host "(Sign in to GitHub if a browser/login window opens)`n" -ForegroundColor Yellow

git push -u origin main

if ($LASTEXITCODE -eq 0) {
    Write-Host "`nSuccess! Repo: https://github.com/saad1032/pdc-final-task-1`n" -ForegroundColor Green
} else {
    Write-Host "`nPush failed. Create the repo first:" -ForegroundColor Red
    Write-Host "  1. Open https://github.com/new" -ForegroundColor White
    Write-Host "  2. Repository name: pdc-final-task-1" -ForegroundColor White
    Write-Host "  3. Leave empty (no README) -> Create repository" -ForegroundColor White
    Write-Host "  4. Run this script again`n" -ForegroundColor White
}
