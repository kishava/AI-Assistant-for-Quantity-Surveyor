# Full distribution build: sync sources -> portable (win-unpacked) + NSIS installer together.
# Run from repo root: npm run dist   OR   powershell -File scripts\package-desktop.ps1
param(
    [switch]$SkipFrontendBuild,
    [switch]$SkipNpmInstall
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$AppDir = Join-Path $Root "desktop\app"
$ReleaseDir = Join-Path $Root "desktop\release\win-unpacked"
$SyncScript = Join-Path $PSScriptRoot "sync-desktop-app.ps1"

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "  QS Assistant - Portable + Installer" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

Write-Host "=== Phase 1: Frontend + sync desktop\app ===" -ForegroundColor Cyan
if (-not $SkipFrontendBuild) {
    Push-Location (Join-Path $Root "frontend")
    npm run build
    Pop-Location
} else {
    Write-Host "  (skipped frontend build)" -ForegroundColor Gray
}

& $SyncScript

Write-Host "`n=== Phase 2: Backend production dependencies ===" -ForegroundColor Cyan
$BackendDest = Join-Path $AppDir "backend"
if (-not $SkipNpmInstall) {
    Push-Location $BackendDest
    npm install --omit=dev
    Pop-Location
} else {
    Write-Host "  (skipped npm install)" -ForegroundColor Gray
}

Write-Host "`n=== Phase 3: Stage node.exe ===" -ForegroundColor Cyan
$DesktopBin = Join-Path $Root "desktop\bin"
if (Test-Path $DesktopBin) { Remove-Item $DesktopBin -Recurse -Force }
New-Item -ItemType Directory -Force -Path $DesktopBin | Out-Null
$LocalNode = (Get-Command node.exe -ErrorAction SilentlyContinue).Source
if ($LocalNode) {
    Copy-Item $LocalNode (Join-Path $DesktopBin "node.exe") -Force
    $NodeVer = & (Join-Path $DesktopBin "node.exe") --version
    Write-Host "  node.exe $NodeVer staged in desktop\bin" -ForegroundColor Green
} else {
    Write-Host "  WARNING: node.exe not in PATH - portable may fail to start backend" -ForegroundColor Red
}

Write-Host "`n=== Phase 4: electron-builder (portable + installer) ===" -ForegroundColor Cyan
if (Test-Path $ReleaseDir) {
    try {
        Remove-Item (Join-Path $ReleaseDir "*") -Recurse -Force -ErrorAction SilentlyContinue
        Remove-Item $ReleaseDir -Recurse -Force -ErrorAction SilentlyContinue
    } catch {
        Write-Host "  Warning: could not clear release folder - close QS Assistant if running" -ForegroundColor Yellow
    }
}
Push-Location (Join-Path $Root "desktop")
npx electron-builder --win
Pop-Location

Write-Host "`n=== Phase 5: Verify outputs ===" -ForegroundColor Cyan
$PortableExe = Join-Path $ReleaseDir "QS Assistant.exe"
$NodeExeDest = Join-Path $ReleaseDir "resources\bin\node.exe"
$SetupExe = Get-ChildItem (Join-Path $Root "desktop\release") -Filter "QS Assistant Setup*.exe" -ErrorAction SilentlyContinue | Select-Object -First 1

$ok = $true
if (Test-Path $PortableExe) {
    Write-Host "  Portable: $PortableExe" -ForegroundColor Green
} else {
    Write-Host "  ERROR: Portable exe missing" -ForegroundColor Red
    $ok = $false
}
if (Test-Path $NodeExeDest) {
    $NodeVer = & $NodeExeDest --version
    Write-Host "  Bundled node: $NodeVer" -ForegroundColor Green
} else {
    Write-Host "  WARNING: resources\bin\node.exe missing" -ForegroundColor Yellow
}
if ($SetupExe) {
    $sizeMb = [math]::Round($SetupExe.Length / 1MB, 1)
    Write-Host "  Installer: $($SetupExe.FullName) (${sizeMb} MB)" -ForegroundColor Green
    $DistInstaller = Join-Path $Root "dist\installer"
    New-Item -ItemType Directory -Force -Path $DistInstaller | Out-Null
    Copy-Item $SetupExe.FullName (Join-Path $DistInstaller "QS-Assistant-Setup.exe") -Force
    Write-Host "  Copied installer to dist\installer\QS-Assistant-Setup.exe" -ForegroundColor Green
} else {
    Write-Host "  WARNING: NSIS installer .exe not found in desktop\release\" -ForegroundColor Red
    $ok = $false
}

Write-Host "`n========================================" -ForegroundColor $(if ($ok) { "Green" } else { "Yellow" })
if ($ok) {
    Write-Host "  BUILD COMPLETE (portable + installer)" -ForegroundColor Green
    Write-Host "  Portable:  desktop\release\win-unpacked\QS Assistant.exe" -ForegroundColor Green
    Write-Host "  Installer: dist\installer\QS-Assistant-Setup.exe" -ForegroundColor Green
} else {
    Write-Host "  BUILD FINISHED WITH WARNINGS - check output above" -ForegroundColor Yellow
}
Write-Host "========================================`n" -ForegroundColor Cyan

if (-not $ok) { exit 1 }
