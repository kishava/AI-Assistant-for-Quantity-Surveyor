# Remove stale electron-builder output before a fresh dist build.
param(
    [string]$Root = (Split-Path -Parent $PSScriptRoot)
)

$ErrorActionPreference = "Continue"
$ReleaseRoot = Join-Path $Root "desktop\release"

if (-not (Test-Path $ReleaseRoot)) {
    New-Item -ItemType Directory -Force -Path $ReleaseRoot | Out-Null
    return
}

Write-Host "  Cleaning desktop\release..." -ForegroundColor Gray

# Timestamped / stale portable folders from failed locked builds
Get-ChildItem $ReleaseRoot -Directory -ErrorAction SilentlyContinue | Where-Object {
    $_.Name -match '^(build-|win-unpacked\.stale)'
} | ForEach-Object {
    Write-Host "    remove folder: $($_.Name)" -ForegroundColor DarkGray
    Remove-Item -LiteralPath $_.FullName -Recurse -Force -ErrorAction SilentlyContinue
}

# electron-builder debug/config artifacts
Get-ChildItem $ReleaseRoot -File -ErrorAction SilentlyContinue | Where-Object {
    $_.Extension -in '.yml', '.yaml', '.blockmap' -or
    $_.Name -like 'builder-*' -or
    $_.Name -like '__uninstaller*' -or
    $_.Name -like 'QS Assistant Setup*'
} | ForEach-Object {
    Write-Host "    remove file: $($_.Name)" -ForegroundColor DarkGray
    Remove-Item -LiteralPath $_.FullName -Force -ErrorAction SilentlyContinue
}

# Old installer naming (space in filename) - superseded by QS-Assistant-Setup.exe
$LegacyInstaller = Join-Path $ReleaseRoot "QS-Assistant-Setup-*.exe"
Get-ChildItem $LegacyInstaller -ErrorAction SilentlyContinue | ForEach-Object {
    if ($_.Name -ne 'QS-Assistant-Setup.exe') {
        Remove-Item -LiteralPath $_.FullName -Force -ErrorAction SilentlyContinue
    }
}

# Clear portable output folder (electron-builder recreates / overwrites)
$WinUnpacked = Join-Path $ReleaseRoot "win-unpacked"
if (Test-Path $WinUnpacked) {
    $cleared = $false
    for ($i = 0; $i -lt 3; $i++) {
        try {
            Remove-Item -LiteralPath $WinUnpacked -Recurse -Force -ErrorAction Stop
            $cleared = $true
            break
        } catch {
            if ($i -lt 2) { Start-Sleep -Seconds 2 }
        }
    }
    if (-not $cleared) {
        Write-Host "    win-unpacked locked - emptying via robocopy mirror..." -ForegroundColor Yellow
        $emptyDir = Join-Path $env:TEMP ("qs-empty-" + [guid]::NewGuid().ToString("N"))
        New-Item -ItemType Directory -Force -Path $emptyDir | Out-Null
        & robocopy.exe $emptyDir $WinUnpacked /MIR /NFL /NDL /NJH /NJS /nc /ns /np | Out-Null
        Remove-Item -LiteralPath $emptyDir -Force -ErrorAction SilentlyContinue
        try {
            Remove-Item -LiteralPath $WinUnpacked -Recurse -Force -ErrorAction Stop
            $cleared = $true
        } catch {
            $stamp = Get-Date -Format "yyyyMMddHHmmss"
            $staleName = "win-unpacked.stale.$stamp"
            try {
                Rename-Item -LiteralPath $WinUnpacked -NewName $staleName -ErrorAction Stop
                $cleared = $true
            } catch {
                Write-Host "    WARNING: win-unpacked still locked; electron-builder will overwrite in place" -ForegroundColor Yellow
                $cleared = $true
            }
        }
    }
}

# Dist installer copy (recreated after build)
$DistInstaller = Join-Path $Root "dist\installer"
if (Test-Path $DistInstaller) {
    Get-ChildItem $DistInstaller -Filter "*.exe" -ErrorAction SilentlyContinue |
        Remove-Item -Force -ErrorAction SilentlyContinue
}

Write-Host "  Release folder ready." -ForegroundColor Green
