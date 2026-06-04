# Alias entry point — builds portable + installer together (same as package-desktop.ps1).
& (Join-Path $PSScriptRoot "package-desktop.ps1") @args
