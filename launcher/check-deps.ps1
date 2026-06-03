#Requires -Version 5.1
$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $PSScriptRoot
$OllamaUrl = "http://localhost:11434/api/tags"
$ChromaUrl = "http://localhost:8000/api/v2/heartbeat"
$issues = @()

Write-Host "`nQS Assistant - Dependency Check`n" -ForegroundColor Cyan

try {
    Invoke-RestMethod -Uri $OllamaUrl -TimeoutSec 5 | Out-Null
    Write-Host "[OK] Ollama is running" -ForegroundColor Green
} catch {
    $issues += "Ollama is not running. Install from https://ollama.ai and run: ollama pull phi3:mini"
    Write-Host "[FAIL] Ollama not reachable" -ForegroundColor Red
}

try {
    Invoke-RestMethod -Uri $ChromaUrl -TimeoutSec 5 | Out-Null
    Write-Host "[OK] ChromaDB is running" -ForegroundColor Green
} catch {
    Write-Host "ChromaDB is not running. Attempting to start it automatically..." -ForegroundColor Cyan
    try {
        $chromaProcess = Start-Process -FilePath "chroma" `
            -ArgumentList "run --path `"$Root\chroma_data`"" `
            -WorkingDirectory $Root `
            -WindowStyle Hidden `
            -PassThru

        $chromaPidFile = Join-Path $env:APPDATA "QS-AI\chroma.pid"
        New-Item -ItemType Directory -Force -Path (Split-Path $chromaPidFile) | Out-Null
        $chromaProcess.Id | Out-File -FilePath $chromaPidFile -Encoding ascii

        $started = $false
        for ($i = 0; $i -lt 10; $i++) {
            Start-Sleep -Seconds 1
            try {
                Invoke-RestMethod -Uri $ChromaUrl -TimeoutSec 1 | Out-Null
                $started = $true
                break
            } catch {}
        }

        if ($started) {
            Write-Host "[OK] ChromaDB started automatically (PID $($chromaProcess.Id))" -ForegroundColor Green
        } else {
            $issues += "ChromaDB failed to start automatically. Run: chroma run --path ./chroma_data"
            Write-Host "[FAIL] ChromaDB not reachable after auto-start attempt" -ForegroundColor Red
        }
    } catch {
        $issues += "ChromaDB is not running and could not be started automatically. Install it: pip install chromadb"
        Write-Host "[FAIL] ChromaDB not running and could not be started automatically" -ForegroundColor Red
    }
}

if ($issues.Count -gt 0) {
    Write-Host "`nFix these before starting QS Assistant:`n" -ForegroundColor Yellow
    $issues | ForEach-Object { Write-Host "  - $_" }
    exit 1
}

Write-Host "`nAll dependencies OK.`n" -ForegroundColor Green
exit 0
