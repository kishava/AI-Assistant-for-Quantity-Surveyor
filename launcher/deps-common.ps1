#Requires -Version 5.1
# Shared dependency ensure logic for QS Assistant (portable + installer)

function Get-ProjectRoot {
    param([string]$LauncherDir)
    return Split-Path -Parent $LauncherDir
}

function Get-OllamaExe {
    $ollamaPath = Join-Path $env:LOCALAPPDATA "Programs\Ollama\ollama.exe"
    if (Test-Path $ollamaPath) { return $ollamaPath }
    if (Get-Command ollama -ErrorAction SilentlyContinue) { return "ollama" }
    return $null
}

function Test-OllamaRunning {
    try {
        Invoke-RestMethod -Uri "http://localhost:11434/api/tags" -TimeoutSec 5 | Out-Null
        return $true
    } catch { return $false }
}

function Ensure-OllamaInstalled {
    param([string]$TempDir)
    $exe = Get-OllamaExe
    if ($exe) { return $true }

    Write-Host "  -> Installing Ollama..." -ForegroundColor Cyan
    $ollamaDest = Join-Path $TempDir "OllamaSetup.exe"
    try {
        Invoke-WebRequest -Uri "https://ollama.com/download/OllamaSetup.exe" -OutFile $ollamaDest -UseBasicParsing
        Start-Process -FilePath $ollamaDest -ArgumentList "/silent" -Wait
        return $true
    } catch {
        Write-Host "  -> Ollama install failed: $_" -ForegroundColor Red
        return $false
    }
}

function Ensure-OllamaRunning {
    if (Test-OllamaRunning) { return $true }
    $exe = Get-OllamaExe
    if (-not $exe) { return $false }

    Write-Host "  -> Starting Ollama..." -ForegroundColor Cyan
    Start-Process -FilePath $exe -ArgumentList "serve" -WindowStyle Hidden -ErrorAction SilentlyContinue | Out-Null
    for ($i = 0; $i -lt 20; $i++) {
        Start-Sleep -Seconds 1
        if (Test-OllamaRunning) { return $true }
    }
    return $false
}

function Ensure-OllamaModels {
    param([string[]]$Models = @("phi3:mini", "nomic-embed-text", "moondream"))
    $exe = Get-OllamaExe
    if (-not $exe -or -not (Test-OllamaRunning)) { return $false }

    foreach ($model in $Models) {
        try {
            $tags = Invoke-RestMethod -Uri "http://localhost:11434/api/tags" -TimeoutSec 10
            $has = $tags.models | Where-Object { $_.name -eq $model -or $_.name -like "$model*" }
            if ($has) {
                Write-Host "  -> Model OK: $model" -ForegroundColor Green
                continue
            }
        } catch {}

        Write-Host "  -> Pulling model: $model (may take several minutes)..." -ForegroundColor Yellow
        & $exe pull $model
        if ($LASTEXITCODE -ne 0) {
            Write-Host "  -> Warning: failed to pull $model" -ForegroundColor Yellow
        }
    }
    return $true
}

function Get-PythonExe {
    if (Get-Command python -ErrorAction SilentlyContinue) { return "python" }
    $userLocalPath = Join-Path $env:USERPROFILE "AppData\Local\Programs\Python"
    if (Test-Path $userLocalPath) {
        $pyDirs = Get-ChildItem -Path $userLocalPath -Directory | Sort-Object LastWriteTime -Descending
        if ($pyDirs.Count -gt 0) {
            $pyExe = Join-Path $pyDirs[0].FullName "python.exe"
            if (Test-Path $pyExe) { return $pyExe }
        }
    }
    return $null
}

function Ensure-PythonInstalled {
    param([string]$TempDir)
    if (Get-PythonExe) { return $true }

    Write-Host "  -> Installing Python 3.11..." -ForegroundColor Cyan
    $pythonDest = Join-Path $TempDir "python-installer.exe"
    try {
        Invoke-WebRequest -Uri "https://www.python.org/ftp/python/3.11.9/python-3.11.9-amd64.exe" -OutFile $pythonDest -UseBasicParsing
        Start-Process -FilePath $pythonDest -ArgumentList "/quiet InstallAllUsers=0 PrependPath=1" -Wait
        $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")
        return [bool](Get-PythonExe)
    } catch {
        Write-Host "  -> Python install failed: $_" -ForegroundColor Red
        return $false
    }
}

function Test-ChromaRunning {
    try {
        Invoke-RestMethod -Uri "http://localhost:8000/api/v2/heartbeat" -TimeoutSec 5 | Out-Null
        return $true
    } catch { return $false }
}

function Ensure-ChromaInstalled {
    if (Get-Command chroma -ErrorAction SilentlyContinue) { return $true }
    $pythonCmd = Get-PythonExe
    if (-not $pythonCmd) { return $false }

    Write-Host "  -> Installing ChromaDB via pip..." -ForegroundColor Cyan
    try {
        Start-Process -FilePath $pythonCmd -ArgumentList "-m pip install --upgrade pip" -Wait -WindowStyle Hidden -ErrorAction SilentlyContinue
        Start-Process -FilePath $pythonCmd -ArgumentList "-m pip install chromadb" -Wait
        return $true
    } catch {
        Write-Host "  -> ChromaDB pip install failed: $_" -ForegroundColor Red
        return $false
    }
}

function Ensure-ChromaRunning {
    param([string]$DataPath)
    if (Test-ChromaRunning) { return $true }

    if (-not (Test-Path $DataPath)) {
        New-Item -ItemType Directory -Force -Path $DataPath | Out-Null
    }

    $pythonCmd = Get-PythonExe
    $started = $false

    if (Get-Command chroma -ErrorAction SilentlyContinue) {
        Write-Host "  -> Starting ChromaDB (chroma CLI)..." -ForegroundColor Cyan
        $proc = Start-Process -FilePath "chroma" -ArgumentList "run --path `"$DataPath`"" -WindowStyle Hidden -PassThru
        $started = $true
    } elseif ($pythonCmd) {
        Write-Host "  -> Starting ChromaDB (python -m chromadb)..." -ForegroundColor Cyan
        $proc = Start-Process -FilePath $pythonCmd -ArgumentList "-m chromadb.cli.cli run --path `"$DataPath`"" -WindowStyle Hidden -PassThru
        $started = $true
    }

    if ($started -and $proc) {
        $pidFile = Join-Path $env:APPDATA "QS-AI\chroma.pid"
        New-Item -ItemType Directory -Force -Path (Split-Path $pidFile) | Out-Null
        $proc.Id | Out-File -FilePath $pidFile -Encoding ascii
    }

    for ($i = 0; $i -lt 20; $i++) {
        Start-Sleep -Seconds 1
        if (Test-ChromaRunning) { return $true }
    }
    return $false
}

function Invoke-QsDependencyEnsure {
    param(
        [string]$LauncherDir,
        [switch]$InstallIfMissing,
        [switch]$PullModels,
        [switch]$Quiet
    )

    $Root = Get-ProjectRoot -LauncherDir $LauncherDir
    $TempDir = Join-Path $env:TEMP "QS-AI-Installer"
    if (-not (Test-Path $TempDir)) { New-Item -ItemType Directory -Path $TempDir | Out-Null }

    $chromaData = if ($env:QS_AI_DATA_DIR) {
        Join-Path $env:QS_AI_DATA_DIR "chroma_data"
    } else {
        Join-Path (Join-Path $env:APPDATA "QS-AI") "chroma_data"
    }

    $issues = @()

    if (-not $Quiet) {
        Write-Host "`nQS Assistant - Dependency Check`n" -ForegroundColor Cyan
    }

    # Ollama
    if ($InstallIfMissing) {
        if (-not (Ensure-OllamaInstalled -TempDir $TempDir)) { $issues += "Ollama could not be installed" }
        if (-not (Ensure-OllamaRunning)) { $issues += "Ollama is not running" }
        if ($PullModels) { Ensure-OllamaModels | Out-Null }
    } else {
        if (-not (Test-OllamaRunning)) {
            $issues += "Ollama is not running. Install from https://ollama.ai"
        } elseif (-not $Quiet) {
            Write-Host "[OK] Ollama is running" -ForegroundColor Green
        }
    }

    # Chroma
    if ($InstallIfMissing) {
        if (-not (Ensure-PythonInstalled -TempDir $TempDir)) { $issues += "Python could not be installed" }
        Ensure-ChromaInstalled | Out-Null
        if (-not (Ensure-ChromaRunning -DataPath $chromaData)) { $issues += "ChromaDB could not be started" }
    } else {
        if (-not (Test-ChromaRunning)) {
            if (-not (Ensure-ChromaRunning -DataPath $chromaData)) {
                $issues += "ChromaDB is not running. Run: chroma run --path ./chroma_data"
            }
        } elseif (-not $Quiet) {
            Write-Host "[OK] ChromaDB is running" -ForegroundColor Green
        }
    }

    if ($issues.Count -gt 0) {
        if (-not $Quiet) {
            Write-Host "`nDependency issues:`n" -ForegroundColor Yellow
            $issues | ForEach-Object { Write-Host "  - $_" }
        }
        return 1
    }

    if (-not $Quiet) { Write-Host "`nAll dependencies OK.`n" -ForegroundColor Green }
    return 0
}
