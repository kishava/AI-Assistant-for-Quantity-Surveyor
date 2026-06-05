# Full distribution build: sync sources -> portable (win-unpacked) + NSIS installer together.
# Run from repo root: npm run dist   OR   powershell -File scripts\package-desktop.ps1
param(
    [switch]$SkipFrontendBuild,
    [switch]$SkipNpmInstall,
    [switch]$SkipVersionBump
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$AppDir = Join-Path $Root "desktop\app"
$ReleaseRoot = Join-Path $Root "desktop\release"
$ReleaseDir = Join-Path $ReleaseRoot "win-unpacked"
$SyncScript = Join-Path $PSScriptRoot "sync-desktop-app.ps1"
$CleanScript = Join-Path $PSScriptRoot "clean-release.ps1"
$BumpScript = Join-Path $PSScriptRoot "bump-build-version.js"

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "  QS Assistant - Portable + Installer" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

# -- Phase 0: Version bump (patch) for this build --
if (-not $SkipVersionBump) {
    Write-Host "=== Phase 0: Version bump ===" -ForegroundColor Cyan
    $BuildVersion = & node $BumpScript bump
    if ($LASTEXITCODE -ne 0 -or -not $BuildVersion) {
        Write-Host "  ERROR: Version bump failed" -ForegroundColor Red
        exit 1
    }
    Write-Host "  Building version $BuildVersion" -ForegroundColor Green
} else {
    $BuildVersion = & node $BumpScript current
    Write-Host "=== Phase 0: Version (no bump) $BuildVersion ===" -ForegroundColor Gray
}

Write-Host "`n=== Phase 1: Frontend + sync desktop\app ===" -ForegroundColor Cyan
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

Write-Host "`n=== Phase 4: Clean release + electron-builder ===" -ForegroundColor Cyan
Write-Host "  Stopping QS Assistant if running..." -ForegroundColor Gray
Get-Process -Name "QS Assistant" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2

& $CleanScript -Root $Root

Push-Location (Join-Path $Root "desktop")
npx electron-builder --win
$BuilderExit = $LASTEXITCODE
Pop-Location

if ($BuilderExit -ne 0) {
    Write-Host "  ERROR: electron-builder failed (exit $BuilderExit)" -ForegroundColor Red
    exit 1
}

Write-Host "`n=== Phase 5: Verify + publish artifacts ===" -ForegroundColor Cyan
$PortableExe = Join-Path $ReleaseDir "QS Assistant.exe"
$NodeExeDest = Join-Path $ReleaseDir "resources\bin\node.exe"
$SetupExe = Join-Path $ReleaseRoot "QS-Assistant-Setup.exe"

$PackBackend = Join-Path $ReleaseDir "resources\app\backend\server.js"
$PackStartProd = Join-Path $ReleaseDir "resources\app\backend\start-prod.js"
$PackFrontend = Join-Path $ReleaseDir "resources\app\backend\frontend-dist\index.html"

$ok = $true
if (Test-Path $PortableExe) {
    Write-Host "  Portable ($BuildVersion): $PortableExe" -ForegroundColor Green
} else {
    Write-Host "  ERROR: Portable exe missing" -ForegroundColor Red
    $ok = $false
}
if (-not (Test-Path $PackBackend)) {
    Write-Host "  ERROR: Packaged backend missing server.js" -ForegroundColor Red
    $ok = $false
}
if (-not (Test-Path $PackStartProd)) {
    Write-Host "  ERROR: Packaged backend missing start-prod.js" -ForegroundColor Red
    $ok = $false
}
if (-not (Test-Path $PackFrontend)) {
    Write-Host "  ERROR: Packaged frontend-dist missing" -ForegroundColor Red
    $ok = $false
}
if (Test-Path $NodeExeDest) {
    $NodeVer = & $NodeExeDest --version
    Write-Host "  Bundled node: $NodeVer" -ForegroundColor Green
} else {
    Write-Host "  WARNING: resources\bin\node.exe missing" -ForegroundColor Yellow
}

# Normalize installer to fixed name (overwrite each build)
$BuiltSetup = Get-ChildItem $ReleaseRoot -Filter "QS-Assistant-Setup*.exe" -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1

if ($BuiltSetup) {
  if ($BuiltSetup.FullName -ne $SetupExe) {
    if (Test-Path $SetupExe) { Remove-Item $SetupExe -Force }
    Move-Item -LiteralPath $BuiltSetup.FullName -Destination $SetupExe -Force
  }
  $sizeMb = [math]::Round((Get-Item $SetupExe).Length / 1MB, 1)
  Write-Host "  Installer ($BuildVersion): $SetupExe ($sizeMb MB)" -ForegroundColor Green

  $DistInstaller = Join-Path $Root "dist\installer"
  New-Item -ItemType Directory -Force -Path $DistInstaller | Out-Null
  Copy-Item $SetupExe (Join-Path $DistInstaller "QS-Assistant-Setup.exe") -Force
  Write-Host "  Copied to dist\installer\QS-Assistant-Setup.exe" -ForegroundColor Green
} else {
  Write-Host "  ERROR: Installer exe not found in desktop\release\" -ForegroundColor Red
  $ok = $false
}

# Final sweep: remove any leftover junk electron-builder dropped
Get-ChildItem $ReleaseRoot -File -ErrorAction SilentlyContinue | Where-Object {
    $_.Extension -in '.yml', '.yaml', '.blockmap' -or $_.Name -like 'builder-*'
} | Remove-Item -Force -ErrorAction SilentlyContinue
Get-ChildItem $ReleaseRoot -Directory -ErrorAction SilentlyContinue | Where-Object {
    $_.Name -match '^(build-|win-unpacked\.stale)'
} | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue

Write-Host "`n========================================" -ForegroundColor $(if ($ok) { "Green" } else { "Yellow" })
if ($ok) {
    Write-Host "  BUILD v$BuildVersion COMPLETE" -ForegroundColor Green
    Write-Host "  Portable:  desktop\release\win-unpacked\QS Assistant.exe" -ForegroundColor Green
    Write-Host "  Installer: desktop\release\QS-Assistant-Setup.exe" -ForegroundColor Green
    Write-Host "  Mirror:    dist\installer\QS-Assistant-Setup.exe" -ForegroundColor Green
} else {
    Write-Host "  BUILD FINISHED WITH ERRORS" -ForegroundColor Yellow
}
Write-Host "========================================`n" -ForegroundColor Cyan

if ($ok) {
    $BuildInfoPath = Join-Path $ReleaseRoot "build-info.json"
    $buildInfo = @{
        version     = $BuildVersion
        builtAt     = (Get-Date).ToUniversalTime().ToString("o")
        portable    = "desktop/release/win-unpacked/QS Assistant.exe"
        installer   = "desktop/release/QS-Assistant-Setup.exe"
    } | ConvertTo-Json -Depth 3
    Set-Content -Path $BuildInfoPath -Value $buildInfo -Encoding UTF8

    Write-Host "`n=== Phase 6: Share package for testers ===" -ForegroundColor Cyan
    $ShareScript = Join-Path $PSScriptRoot "package-share.ps1"
    if (Test-Path $ShareScript) {
        & $ShareScript -Root $Root
    }
}

if (-not $ok) { exit 1 }
