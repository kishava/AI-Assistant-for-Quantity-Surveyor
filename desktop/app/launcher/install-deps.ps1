#Requires -Version 5.1
param(
    [switch]$Silent
)

$ErrorActionPreference = "Continue"

Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "       QS Assistant - Dependency Installer        " -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host ""

. (Join-Path $PSScriptRoot "deps-common.ps1")

$exitCode = Invoke-QsDependencyEnsure -LauncherDir $PSScriptRoot -InstallIfMissing -PullModels -Quiet:$Silent

if ($exitCode -ne 0) {
    Write-Host "`nSome dependencies could not be installed. The app may have limited features.`n" -ForegroundColor Yellow
}

if (-not $Silent) {
    Write-Host ""
    Write-Host "==================================================" -ForegroundColor Green
    Write-Host "   Dependency Verification and Installation Done! " -ForegroundColor Green
    Write-Host "==================================================" -ForegroundColor Green
    Write-Host "Press any key to continue..."
    $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
}

exit $exitCode
