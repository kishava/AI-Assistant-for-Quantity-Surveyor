#Requires -Version 5.1
param(
    [switch]$Silent,
    [switch]$ShowWindow,
    [switch]$StreamProgress
)

$ErrorActionPreference = "Continue"

$useProgress = $StreamProgress -or $ShowWindow
$quiet = $Silent -and -not $ShowWindow -and -not $StreamProgress

if ($ShowWindow -and -not $StreamProgress) {
    Write-Host "==================================================" -ForegroundColor Cyan
    Write-Host "  QS Assistant - Installing dependencies" -ForegroundColor Cyan
    Write-Host "  Internet required. This may take 10-30 minutes." -ForegroundColor Cyan
    Write-Host "==================================================" -ForegroundColor Cyan
    Write-Host ""
}

. (Join-Path $PSScriptRoot "deps-common.ps1")

$exitCode = Invoke-QsDependencyEnsure -LauncherDir $PSScriptRoot -InstallIfMissing -PullModels -Quiet:$quiet -EmitProgress:$useProgress

if ($exitCode -ne 0) {
    if (-not $quiet) {
        Write-Host "`nSome dependencies could not be installed. QS Assistant will offer to retry on next launch.`n" -ForegroundColor Yellow
    }
}

if ($ShowWindow -and -not $StreamProgress) {
    Write-Host ""
    if ($exitCode -eq 0) {
        Write-Host "Dependency setup completed successfully." -ForegroundColor Green
    } else {
        Write-Host "Setup completed with warnings. Open QS Assistant to retry if needed." -ForegroundColor Yellow
    }
    Write-Host "Press any key to continue..."
    $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
}

exit $exitCode
