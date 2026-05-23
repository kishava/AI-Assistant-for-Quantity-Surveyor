#Requires -Version 5.1
$pidFile = Join-Path $env:APPDATA "QS-AI\backend.pid"

if (Test-Path $pidFile) {
    $pid = Get-Content $pidFile | Select-Object -First 1
    if ($pid) {
        try {
            Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue
            Write-Host "Stopped QS Assistant backend (PID $pid)"
        } catch {
            Write-Host "Process $pid not running"
        }
    }
    Remove-Item $pidFile -Force -ErrorAction SilentlyContinue
} else {
    Write-Host "No PID file found at $pidFile"
}
