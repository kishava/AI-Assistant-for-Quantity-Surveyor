# Full desktop build: prep → electron-builder → post-build node.exe injection
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$AppDir = Join-Path $Root "desktop\app"
$ReleaseDir = Join-Path $Root "desktop\release\win-unpacked"

# ── Phase 1: Build frontend ──
Write-Host "`n=== Phase 1: Building React frontend ===" -ForegroundColor Cyan
Push-Location (Join-Path $Root "frontend")
npm run build
Pop-Location

# ── Phase 2: Prepare desktop\app bundle ──
Write-Host "`n=== Phase 2: Preparing desktop app bundle ===" -ForegroundColor Cyan
if (Test-Path $AppDir) {
    Remove-Item $AppDir -Recurse -Force
}
New-Item -ItemType Directory -Force -Path $AppDir | Out-Null

Write-Host "  Copying backend..." -ForegroundColor Gray
$BackendDest = Join-Path $AppDir "backend"
Copy-Item -Recurse (Join-Path $Root "backend") $BackendDest
Remove-Item (Join-Path $BackendDest "node_modules") -Recurse -Force -ErrorAction SilentlyContinue
# Remove dev/local database files
Get-ChildItem -Path $BackendDest -Filter "qs_ai.db*" -ErrorAction SilentlyContinue | Remove-Item -Force

Write-Host "  Copying frontend-dist into backend..." -ForegroundColor Gray
$FrontendDest = Join-Path $BackendDest "frontend-dist"
Copy-Item -Recurse (Join-Path $Root "frontend\dist") $FrontendDest

Write-Host "  Copying launcher scripts..." -ForegroundColor Gray
$LauncherDest = Join-Path $AppDir "launcher"
New-Item -ItemType Directory -Force -Path $LauncherDest | Out-Null
Copy-Item (Join-Path $Root "launcher\*.ps1") $LauncherDest
Copy-Item (Join-Path $Root "QS-Assistant.bat") (Join-Path $AppDir "..") -ErrorAction SilentlyContinue

Write-Host "  Preparing portable node.exe..." -ForegroundColor Gray
$DesktopBin = Join-Path $Root "desktop\bin"
if (Test-Path $DesktopBin) {
    Remove-Item $DesktopBin -Recurse -Force
}
New-Item -ItemType Directory -Force -Path $DesktopBin | Out-Null
$LocalNode = (Get-Command node.exe -ErrorAction SilentlyContinue).Source
if ($LocalNode) {
    Copy-Item $LocalNode (Join-Path $DesktopBin "node.exe") -Force
    $NodeVer = & (Join-Path $DesktopBin "node.exe") --version
    Write-Host "  Staged node.exe $NodeVer in desktop\bin ($([math]::Round((Get-Item (Join-Path $DesktopBin "node.exe")).Length / 1MB, 1)) MB)" -ForegroundColor Green
} else {
    Write-Host "  WARNING: No node.exe found in PATH!" -ForegroundColor Red
}

Write-Host "  Installing production node_modules..." -ForegroundColor Gray
Push-Location $BackendDest
npm install --omit=dev
Pop-Location

Write-Host "  Phase 2 complete!" -ForegroundColor Green

# ── Phase 3: Run electron-builder ──
Write-Host "`n=== Phase 3: Running electron-builder ===" -ForegroundColor Cyan
if (Test-Path $ReleaseDir) {
    try {
        Remove-Item (Join-Path $ReleaseDir "*") -Recurse -Force -ErrorAction SilentlyContinue
        Remove-Item $ReleaseDir -Recurse -Force -ErrorAction SilentlyContinue
    } catch {
        Write-Host "  Warning: Could not delete release directory: $_. Proceeding anyway..." -ForegroundColor Yellow
    }
}
Push-Location (Join-Path $Root "desktop")
npx electron-builder --win
Pop-Location

# ── Phase 4: Verification ──
Write-Host "`n=== Phase 4: Verifying Bundled Output ===" -ForegroundColor Cyan
$NodeExeDest = Join-Path $ReleaseDir "resources\bin\node.exe"
if (Test-Path $NodeExeDest) {
    $NodeVer = & $NodeExeDest --version
    Write-Host "  Verified: node.exe $NodeVer correctly bundled in resources/bin" -ForegroundColor Green
} else {
    Write-Host "  ERROR: node.exe missing in built resources/bin!" -ForegroundColor Red
}

$SetupExe = Join-Path $Root "desktop\release\QS Assistant Setup 1.0.0.exe"
if (Test-Path $SetupExe) {
    Write-Host "  Verified: Setup installer generated at $SetupExe ($([math]::Round((Get-Item $SetupExe).Length / 1MB, 1)) MB)" -ForegroundColor Green
} else {
    Write-Host "  WARNING: Setup installer .exe not found in release directory!" -ForegroundColor Red
}

# ── Done ──
Write-Host "`n========================================" -ForegroundColor Green
Write-Host "  BUILD COMPLETE!" -ForegroundColor Green
Write-Host "  Output: $ReleaseDir" -ForegroundColor Green
Write-Host "  Run: QS Assistant.exe" -ForegroundColor Green
Write-Host "========================================`n" -ForegroundColor Green
