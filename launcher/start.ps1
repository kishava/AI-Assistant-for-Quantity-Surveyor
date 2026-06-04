#Requires -Version 5.1
$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $PSScriptRoot
$AppDir = Join-Path $Root "backend"
if (-not (Test-Path $AppDir)) {
    $AppDir = Join-Path $Root "app"
}

$BundledNode = Join-Path $Root "node\node.exe"
$NodeExe = if (Test-Path $BundledNode) { $BundledNode } elseif ($env:QS_AI_NODE) { $env:QS_AI_NODE } else { "node" }

$Port = if ($env:PORT) { $env:PORT } else { "3001" }
$HealthUrl = "http://127.0.0.1:$Port/api/health"
$AppUrl = "http://127.0.0.1:$Port"

Write-Host "Checking dependencies (install if missing)..." -ForegroundColor Cyan
& (Join-Path $PSScriptRoot "check-deps.ps1") -InstallIfMissing -PullModels
if ($LASTEXITCODE -ne 0) {
    Write-Host "`nWarning: Some dependencies are missing. Document AI features may be limited.`n" -ForegroundColor Yellow
}

$env:NODE_ENV = "production"
$env:USE_APPDATA = "true"
$env:PORT = $Port
$env:HOST = "127.0.0.1"
$env:QS_AI_NODE = $NodeExe

$appDataDir = Join-Path $env:APPDATA "QS-AI"
New-Item -ItemType Directory -Force -Path $appDataDir | Out-Null
$envDest = Join-Path $appDataDir ".env"
$envSrc = Join-Path $AppDir ".env"
$envExample = Join-Path $AppDir ".env.example"
if (-not (Test-Path $envDest)) {
    if (Test-Path $envSrc) {
        Copy-Item $envSrc $envDest
    } elseif (Test-Path $envExample) {
        Copy-Item $envExample $envDest
    }
}

$entry = if (Test-Path (Join-Path $AppDir "start-prod.js")) { "start-prod.js" } else { "server.js" }

Write-Host "Starting QS Assistant backend..." -ForegroundColor Cyan

$backendProcess = Start-Process -FilePath $NodeExe `
    -ArgumentList $entry `
    -WorkingDirectory $AppDir `
    -WindowStyle Hidden `
    -PassThru

$pidFile = Join-Path $env:APPDATA "QS-AI\backend.pid"
New-Item -ItemType Directory -Force -Path (Split-Path $pidFile) | Out-Null
$backendProcess.Id | Out-File -FilePath $pidFile -Encoding ascii

Write-Host "Waiting for server at $HealthUrl ..."
$ready = $false
for ($i = 0; $i -lt 60; $i++) {
    try {
        $health = Invoke-RestMethod -Uri $HealthUrl -TimeoutSec 2
        if ($health.status) { $ready = $true; break }
    } catch {
        Start-Sleep -Seconds 1
    }
}

if (-not $ready) {
    Write-Host "Server failed to start. Check %APPDATA%\QS-AI or run backend manually." -ForegroundColor Red
    exit 1
}

Write-Host "Opening $AppUrl" -ForegroundColor Green
Start-Process $AppUrl

Write-Host "`nQS Assistant is running (PID $($backendProcess.Id)). Close this window or run launcher\stop.ps1 to stop.`n"
