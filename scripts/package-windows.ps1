# QS Assistant - Windows packaging script
# Run from project root: powershell -File scripts\package-windows.ps1

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$OutDir = Join-Path $Root "dist\QS-Assistant"

Write-Host "Building frontend..." -ForegroundColor Cyan
Push-Location (Join-Path $Root "frontend")
npm run build
Pop-Location

Write-Host "Preparing package folder..." -ForegroundColor Cyan
if (Test-Path $OutDir) { Remove-Item $OutDir -Recurse -Force }
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

$BackendDest = Join-Path $OutDir "app"
Copy-Item -Recurse (Join-Path $Root "backend") $BackendDest
Remove-Item (Join-Path $BackendDest "node_modules") -Recurse -Force -ErrorAction SilentlyContinue

Push-Location $BackendDest
npm install --omit=dev
Pop-Location

$DistDest = Join-Path $BackendDest "frontend-dist"
Copy-Item -Recurse (Join-Path $Root "frontend\dist") $DistDest

Copy-Item -Recurse (Join-Path $Root "launcher") (Join-Path $OutDir "launcher")
# Optional: place portable Node next to QS-Assistant.bat as node\node.exe
Copy-Item (Join-Path $Root "QS-Assistant.bat") $OutDir
Copy-Item (Join-Path $Root "backend\.env.example") (Join-Path $OutDir "app\.env.example")

Write-Host "`nPackage ready at: $OutDir" -ForegroundColor Green
Write-Host "Copy portable Node 20 into dist\QS-Assistant\node\ and run QS-Assistant.bat"
Write-Host "Or compile installer/QS-Assistant.iss with Inno Setup"
