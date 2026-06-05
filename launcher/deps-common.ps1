#Requires -Version 5.1
# Shared dependency ensure logic for QS Assistant (portable + installer)

function Get-ProjectRoot {
    param([string]$LauncherDir)
    return Split-Path -Parent $LauncherDir
}

function Get-DepsStatusPath {
    if ($env:QS_AI_DATA_DIR) {
        return Join-Path $env:QS_AI_DATA_DIR "deps-status.json"
    }
    return Join-Path (Join-Path $env:APPDATA "QS-AI") "deps-status.json"
}

function Write-QsProgress {
    param([string]$Message)
    if ($script:QsEmitProgress) {
        Write-Host "[QS_PROGRESS]$Message"
    }
    if (-not $script:QsQuiet) {
        Write-Host $Message
    }
}

function Write-DepsStatusFile {
    param(
        [bool]$Success,
        [string[]]$Issues = @(),
        [int]$Attempts = 1
    )
    $path = Get-DepsStatusPath
    $dir = Split-Path $path -Parent
    if (-not (Test-Path $dir)) {
        New-Item -ItemType Directory -Force -Path $dir | Out-Null
    }
    $existing = $null
    if (Test-Path $path) {
        try { $existing = Get-Content $path -Raw | ConvertFrom-Json } catch {}
    }
    if ($existing -and $existing.attempts) {
        $Attempts = [int]$existing.attempts + 1
    }
    @{
        success     = $Success
        completedAt = (Get-Date).ToUniversalTime().ToString("o")
        attempts    = $Attempts
        issues      = @($Issues)
    } | ConvertTo-Json -Depth 4 | Set-Content -Path $path -Encoding UTF8
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

function Test-OllamaModelsPresent {
    param([string[]]$Models = @("phi3:mini", "nomic-embed-text", "moondream"))
    if (-not (Test-OllamaRunning)) { return $false }
    try {
        $tags = Invoke-RestMethod -Uri "http://localhost:11434/api/tags" -TimeoutSec 10
        foreach ($model in $Models) {
            $has = $tags.models | Where-Object { $_.name -eq $model -or $_.name -like "$model*" }
            if (-not $has) { return $false }
        }
        return $true
    } catch { return $false }
}

function Ensure-OllamaInstalled {
    param([string]$TempDir)
    $exe = Get-OllamaExe
    if ($exe) { return $true }

    Write-QsProgress "Downloading Ollama (local AI)..."
    $ollamaDest = Join-Path $TempDir "OllamaSetup.exe"
    try {
        Invoke-WebRequest -Uri "https://ollama.com/download/OllamaSetup.exe" -OutFile $ollamaDest -UseBasicParsing
        Write-QsProgress "Installing Ollama (silent setup)..."
        Start-Process -FilePath $ollamaDest -ArgumentList "/silent" -Wait
        return [bool](Get-OllamaExe)
    } catch {
        Write-QsProgress "Ollama install failed: $_"
        return $false
    }
}

function Ensure-OllamaRunning {
    if (Test-OllamaRunning) { return $true }
    $exe = Get-OllamaExe
    if (-not $exe) { return $false }

    Write-QsProgress "Starting Ollama service..."
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
                Write-QsProgress "Model ready: $model"
                continue
            }
        } catch {}

        Write-QsProgress "Downloading AI model: $model (may take several minutes)..."
        & $exe pull $model
        if ($LASTEXITCODE -ne 0) {
            Write-QsProgress "Warning: failed to pull $model"
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

function Test-ChromaInstalled {
    if (Get-Command chroma -ErrorAction SilentlyContinue) { return $true }
    $pythonCmd = Get-PythonExe
    if (-not $pythonCmd) { return $false }
    try {
        & $pythonCmd -c "import chromadb" 2>$null
        return $LASTEXITCODE -eq 0
    } catch { return $false }
}

function Ensure-PythonInstalled {
    param([string]$TempDir)
    if (Get-PythonExe) { return $true }

    Write-QsProgress "Downloading Python 3.11..."
    $pythonDest = Join-Path $TempDir "python-installer.exe"
    try {
        Invoke-WebRequest -Uri "https://www.python.org/ftp/python/3.11.9/python-3.11.9-amd64.exe" -OutFile $pythonDest -UseBasicParsing
        Write-QsProgress "Installing Python..."
        Start-Process -FilePath $pythonDest -ArgumentList "/quiet InstallAllUsers=0 PrependPath=1" -Wait
        $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")
        return [bool](Get-PythonExe)
    } catch {
        Write-QsProgress "Python install failed: $_"
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
    if (Test-ChromaInstalled) { return $true }
    $pythonCmd = Get-PythonExe
    if (-not $pythonCmd) { return $false }

    Write-QsProgress "Installing ChromaDB (document search)..."
    try {
        Start-Process -FilePath $pythonCmd -ArgumentList "-m pip install --upgrade pip" -Wait -WindowStyle Hidden -ErrorAction SilentlyContinue
        Start-Process -FilePath $pythonCmd -ArgumentList "-m pip install chromadb" -Wait
        return (Test-ChromaInstalled)
    } catch {
        Write-QsProgress "ChromaDB install failed: $_"
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
        Write-QsProgress "Starting ChromaDB..."
        $proc = Start-Process -FilePath "chroma" -ArgumentList "run --path `"$DataPath`"" -WindowStyle Hidden -PassThru
        $started = $true
    } elseif ($pythonCmd) {
        Write-QsProgress "Starting ChromaDB (Python)..."
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

function Get-QsDependencyReport {
    $issues = @()
    $needsInstall = $false

    $ollamaInstalled = [bool](Get-OllamaExe)
    $ollamaRunning = Test-OllamaRunning
    $pythonInstalled = [bool](Get-PythonExe)
    $chromaInstalled = Test-ChromaInstalled
    $chromaRunning = Test-ChromaRunning
    $modelsOk = Test-OllamaModelsPresent

    if (-not $ollamaInstalled) {
        $needsInstall = $true
        $issues += "Ollama is not installed (required for chat)"
    } elseif (-not $ollamaRunning) {
        $issues += "Ollama is installed but not running"
    }

    if (-not $pythonInstalled) {
        $needsInstall = $true
        $issues += "Python is not installed (required for document search)"
    } elseif (-not $chromaInstalled) {
        $needsInstall = $true
        $issues += "ChromaDB is not installed (pip install chromadb)"
    } elseif (-not $chromaRunning) {
        $issues += "ChromaDB is not running (document search may be limited)"
    }

    if ($ollamaRunning -and -not $modelsOk) {
        $needsInstall = $true
        $issues += "AI models not fully downloaded (phi3:mini, nomic-embed-text, moondream)"
    }

    $ok = $ollamaRunning -and $modelsOk -and (-not $needsInstall)

    return @{
        ok            = $ok
        needsInstall  = $needsInstall
        issues        = $issues
        ollamaInstalled = $ollamaInstalled
        ollamaRunning   = $ollamaRunning
        pythonInstalled = $pythonInstalled
        chromaInstalled = $chromaInstalled
        chromaRunning   = $chromaRunning
        modelsOk        = $modelsOk
    }
}

function Invoke-QsDependencyEnsure {
    param(
        [string]$LauncherDir,
        [switch]$InstallIfMissing,
        [switch]$PullModels,
        [switch]$QuickStart,
        [switch]$Quiet,
        [switch]$EmitProgress
    )

    $script:QsQuiet = $Quiet -and -not $EmitProgress
    $script:QsEmitProgress = $EmitProgress

    $Root = Get-ProjectRoot -LauncherDir $LauncherDir
    $TempDir = Join-Path $env:TEMP "QS-AI-Installer"
    if (-not (Test-Path $TempDir)) { New-Item -ItemType Directory -Path $TempDir | Out-Null }

    $chromaData = if ($env:QS_AI_DATA_DIR) {
        Join-Path $env:QS_AI_DATA_DIR "chroma_data"
    } else {
        Join-Path (Join-Path $env:APPDATA "QS-AI") "chroma_data"
    }

    $issues = @()

    if (-not $Quiet -and -not $EmitProgress) {
        Write-Host "`nQS Assistant - Dependency Check`n" -ForegroundColor Cyan
    }

    if ($InstallIfMissing) {
        Write-QsProgress "Step 1/4: Ollama (local AI)"
        if (-not (Ensure-OllamaInstalled -TempDir $TempDir)) { $issues += "Ollama could not be installed" }
        if (-not (Ensure-OllamaRunning)) { $issues += "Ollama is not running" }

        Write-QsProgress "Step 2/4: AI models"
        if ($PullModels) {
            Ensure-OllamaModels | Out-Null
            if (-not (Test-OllamaModelsPresent)) { $issues += "One or more AI models failed to download" }
        }

        Write-QsProgress "Step 3/4: Python"
        if (-not (Ensure-PythonInstalled -TempDir $TempDir)) { $issues += "Python could not be installed" }

        Write-QsProgress "Step 4/4: ChromaDB (document search)"
        if (-not (Ensure-ChromaInstalled)) { $issues += "ChromaDB could not be installed" }
        if (-not (Ensure-ChromaRunning -DataPath $chromaData)) { $issues += "ChromaDB could not be started" }

        $success = ($issues.Count -eq 0)
        Write-DepsStatusFile -Success $success -Issues $issues
        if ($success) {
            Write-QsProgress "All dependencies installed successfully."
        } else {
            Write-QsProgress "Setup finished with issues — you can retry from QS Assistant."
        }
        return $(if ($success) { 0 } else { 1 })
    }

    if ($QuickStart) {
        if (-not (Ensure-OllamaRunning)) {
            $issues += "Ollama is not running — start Ollama from the system tray, then restart QS Assistant"
        }
        if (-not (Ensure-ChromaRunning -DataPath $chromaData)) {
            $issues += "ChromaDB is not running — document search may be limited"
        }
        if ($issues.Count -gt 0 -and -not $Quiet) {
            Write-Host "`nDependency warnings:`n" -ForegroundColor Yellow
            $issues | ForEach-Object { Write-Host "  - $_" }
        }
        return 0
    }

    # Report-only check (no install, no start)
    $report = Get-QsDependencyReport
    if (-not $report.ollamaRunning) {
        $issues += "Ollama is not running. Install from https://ollama.com"
    } elseif (-not $Quiet) {
        Write-Host "[OK] Ollama is running" -ForegroundColor Green
    }

    if (-not $report.chromaRunning) {
        if (-not (Ensure-ChromaRunning -DataPath $chromaData)) {
            $issues += "ChromaDB is not running. Run: chroma run --path ./chroma_data"
        }
    } elseif (-not $Quiet) {
        Write-Host "[OK] ChromaDB is running" -ForegroundColor Green
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
