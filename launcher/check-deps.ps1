#Requires -Version 5.1
param(
    [switch]$InstallIfMissing,
    [switch]$PullModels,
    [switch]$QuickStart,
    [switch]$Quiet,
    [switch]$ReportOnly,
    [switch]$Json
)

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "deps-common.ps1")

if ($ReportOnly) {
    $report = Get-QsDependencyReport
    $statusPath = Get-DepsStatusPath
    if (Test-Path $statusPath) {
        try {
            $saved = Get-Content $statusPath -Raw | ConvertFrom-Json
            $report | Add-Member -NotePropertyName lastInstallSuccess -NotePropertyValue ([bool]$saved.success) -Force
            $report | Add-Member -NotePropertyName lastInstallIssues -NotePropertyValue (@($saved.issues)) -Force
        } catch {}
    }
    if ($Json) {
        $report | ConvertTo-Json -Compress -Depth 5
        exit 0
    }
    $report.issues | ForEach-Object { Write-Host $_ }
    exit $(if ($report.ok) { 0 } else { 1 })
}

$exitCode = Invoke-QsDependencyEnsure -LauncherDir $PSScriptRoot -InstallIfMissing:$InstallIfMissing -PullModels:$PullModels -QuickStart:$QuickStart -Quiet:$Quiet
exit $exitCode
