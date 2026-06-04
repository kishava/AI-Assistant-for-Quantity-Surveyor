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
    Write-Host "No backend PID file found at $pidFile"
}

$chromaPidFile = Join-Path $env:APPDATA "QS-AI\chroma.pid"
if (Test-Path $chromaPidFile) {
    $cpid = Get-Content $chromaPidFile | Select-Object -First 1
    if ($cpid) {
        try {
            Stop-Process -Id $cpid -Force -ErrorAction SilentlyContinue
            Write-Host "Stopped ChromaDB (PID $cpid)"
        } catch {
            Write-Host "Process $cpid not running"
        }
    }
    Remove-Item $chromaPidFile -Force -ErrorAction SilentlyContinue
}
