#Requires -Version 5.1
param(
    [switch]$InstallIfMissing,
    [switch]$PullModels,
    [switch]$Quiet
)

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "deps-common.ps1")

$exitCode = Invoke-QsDependencyEnsure -LauncherDir $PSScriptRoot -InstallIfMissing:$InstallIfMissing -PullModels:$PullModels -Quiet:$Quiet
exit $exitCode
