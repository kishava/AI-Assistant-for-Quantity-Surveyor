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
    $issues += "ChromaDB is not running. Run: chroma run --path ./chroma_data"
    Write-Host "[FAIL] ChromaDB not reachable" -ForegroundColor Red
}

if ($issues.Count -gt 0) {
    Write-Host "`nFix these before starting QS Assistant:`n" -ForegroundColor Yellow
    $issues | ForEach-Object { Write-Host "  - $_" }
    exit 1
}

Write-Host "`nAll dependencies OK.`n" -ForegroundColor Green
exit 0
