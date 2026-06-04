#Requires -Version 5.1
param(
    [switch]$InstallIfMissing,
    [switch]$PullModels,
    [switch]$QuickStart,
    [switch]$Quiet
)

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "deps-common.ps1")

$exitCode = Invoke-QsDependencyEnsure -LauncherDir $PSScriptRoot -InstallIfMissing:$InstallIfMissing -PullModels:$PullModels -QuickStart:$QuickStart -Quiet:$Quiet
exit $exitCode
