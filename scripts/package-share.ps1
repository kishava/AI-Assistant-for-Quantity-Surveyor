# Package portable + installer into a folder you can zip and share with QS testers.
# Run after npm run dist:  npm run share
param(
    [string]$Root = (Split-Path -Parent $PSScriptRoot)
)

$ErrorActionPreference = "Stop"
$ReleaseRoot = Join-Path $Root "desktop\release"
$PortableSrc = Join-Path $ReleaseRoot "win-unpacked"
$InstallerSrc = Join-Path $ReleaseRoot "QS-Assistant-Setup.exe"
$BuildInfoPath = Join-Path $ReleaseRoot "build-info.json"
$ShareRoot = Join-Path $Root "dist\QS-Assistant-Share"
$PortableDest = Join-Path $ShareRoot "Portable"
$InstallerDest = Join-Path $ShareRoot "Installer"
$ReadmeTemplate = Join-Path $PSScriptRoot "share-README.md"

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "  QS Assistant - Share package" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

if (-not (Test-Path $PortableSrc)) {
    Write-Host "ERROR: Portable build missing. Run: npm run dist" -ForegroundColor Red
    exit 1
}
if (-not (Test-Path $InstallerSrc)) {
    Write-Host "ERROR: Installer missing. Run: npm run dist" -ForegroundColor Red
    exit 1
}

$version = "1.0.0"
$builtAt = (Get-Date).ToUniversalTime().ToString("yyyy-MM-dd HH:mm UTC")
if (Test-Path $BuildInfoPath) {
    $info = Get-Content $BuildInfoPath -Raw | ConvertFrom-Json
    if ($info.version) { $version = $info.version }
    if ($info.builtAt) { $builtAt = $info.builtAt }
}

Write-Host "  Version: $version" -ForegroundColor Green

if (Test-Path $ShareRoot) {
    Remove-Item $ShareRoot -Recurse -Force
}
New-Item -ItemType Directory -Force -Path $PortableDest | Out-Null
New-Item -ItemType Directory -Force -Path $InstallerDest | Out-Null

Write-Host "  Copying portable (this may take a minute)..." -ForegroundColor Gray
& robocopy.exe $PortableSrc $PortableDest /E /NFL /NDL /NJH /NJS /nc /ns /np | Out-Null
if ($LASTEXITCODE -ge 8) {
    Write-Host "ERROR: Failed to copy portable files" -ForegroundColor Red
    exit 1
}

Write-Host "  Copying installer..." -ForegroundColor Gray
Copy-Item $InstallerSrc (Join-Path $InstallerDest "QS-Assistant-Setup.exe") -Force

$readme = Get-Content $ReadmeTemplate -Raw
$readme = $readme -replace '\{\{VERSION\}\}', $version
$readme = $readme -replace '\{\{BUILT_AT\}\}', $builtAt
Set-Content -Path (Join-Path $ShareRoot "README.md") -Value $readme -Encoding UTF8

# Short pointer files in subfolders
Set-Content -Path (Join-Path $PortableDest "START-HERE.txt") -Encoding UTF8 -Value @"
QS Assistant v$version (Portable)

1. Double-click "QS Assistant.exe" in this folder.
2. Do not move the .exe without the rest of this folder.
3. Read README.md in the parent folder for full instructions.

Default currency for estimates: SAR (ask for AED in chat for UAE projects).
"@

Set-Content -Path (Join-Path $InstallerDest "START-HERE.txt") -Encoding UTF8 -Value @"
QS Assistant v$version (Installer)

1. Run QS-Assistant-Setup.exe
2. Follow the install wizard.
3. Read README.md in the parent folder for full instructions.

Default currency for estimates: SAR (ask for AED in chat for UAE projects).
"@

$portableSize = [math]::Round((Get-ChildItem $PortableDest -Recurse | Measure-Object -Property Length -Sum).Sum / 1MB, 0)
$installerSize = [math]::Round((Get-Item (Join-Path $InstallerDest "QS-Assistant-Setup.exe")).Length / 1MB, 0)

Write-Host "`n========================================" -ForegroundColor Green
Write-Host "  SHARE PACKAGE READY" -ForegroundColor Green
Write-Host "  Folder: dist\QS-Assistant-Share" -ForegroundColor Green
Write-Host "  Portable: ~${portableSize} MB" -ForegroundColor Green
Write-Host "  Installer: ~${installerSize} MB" -ForegroundColor Green
Write-Host "`n  Zip the whole QS-Assistant-Share folder to send to testers." -ForegroundColor Cyan
Write-Host "  (Right-click folder -> Compress to ZIP file)" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Green
