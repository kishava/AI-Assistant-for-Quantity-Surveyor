# Sync root source → desktop\app (portable + installer bundle input).
# Fast: no electron-builder, no npm install. Run before commit or as part of full dist build.
param(
    [switch]$Quiet,
    [switch]$BuildFrontend
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$AppDir = Join-Path $Root "desktop\app"
$BackendSrc = Join-Path $Root "backend"
$FrontendDist = Join-Path $Root "frontend\dist"
$LauncherSrc = Join-Path $Root "launcher"

function Log($msg, $color = "Gray") {
    if (-not $Quiet) { Write-Host $msg -ForegroundColor $color }
}

if ($BuildFrontend) {
    Log "Building frontend..." "Cyan"
    Push-Location (Join-Path $Root "frontend")
    npm run build
    Pop-Location
}

if (-not (Test-Path $FrontendDist)) {
    Log "  WARNING: frontend\dist missing — run: cd frontend; npm run build" "Yellow"
}

Log "Syncing desktop\app from source..." "Cyan"

if (Test-Path $AppDir) {
    Remove-Item $AppDir -Recurse -Force
}
New-Item -ItemType Directory -Force -Path $AppDir | Out-Null

$BackendDest = Join-Path $AppDir "backend"
Log "  backend → desktop\app\backend"
Copy-Item -Recurse $BackendSrc $BackendDest
@("node_modules", "uploads") | ForEach-Object {
    $p = Join-Path $BackendDest $_
    if (Test-Path $p) { Remove-Item $p -Recurse -Force }
}
Get-ChildItem -Path $BackendDest -Filter "qs_ai.db*" -ErrorAction SilentlyContinue | Remove-Item -Force
Get-ChildItem -Path $BackendDest -Filter ".env" -ErrorAction SilentlyContinue | Remove-Item -Force

if (Test-Path $FrontendDist) {
    Log "  frontend\dist → desktop\app\backend\frontend-dist"
    Copy-Item -Recurse $FrontendDist (Join-Path $BackendDest "frontend-dist") -Force
}

Log "  launcher → desktop\app\launcher"
$LauncherDest = Join-Path $AppDir "launcher"
New-Item -ItemType Directory -Force -Path $LauncherDest | Out-Null
Copy-Item (Join-Path $LauncherSrc "*.ps1") $LauncherDest -Force

$BatSrc = Join-Path $Root "QS-Assistant.bat"
if (Test-Path $BatSrc) {
    Copy-Item $BatSrc (Join-Path $Root "desktop\QS-Assistant.bat") -Force
    Log "  QS-Assistant.bat → desktop\"
}

# Verify critical files present
$required = @(
    "backend\routes\chat.js",
    "backend\services\contextRetrieval.js",
    "backend\services\ocrQuality.js",
    "backend\services\qsPrompts.js"
)
$missing = @()
foreach ($rel in $required) {
    if (-not (Test-Path (Join-Path $AppDir $rel))) { $missing += $rel }
}
if ($missing.Count -gt 0) {
    throw "Sync incomplete — missing: $($missing -join ', ')"
}

Log "  desktop\app sync OK" "Green"
