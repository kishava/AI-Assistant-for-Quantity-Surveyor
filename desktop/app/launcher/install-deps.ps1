#Requires -Version 5.1
$ErrorActionPreference = "Continue"

Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "       QS Assistant - Dependency Installer        " -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host ""

$tempDir = Join-Path $env:TEMP "QS-AI-Installer"
if (-not (Test-Path $tempDir)) {
    New-Item -ItemType Directory -Path $tempDir | Out-Null
}

# --- Step 1: Check and Install Ollama ---
Write-Host "[1/3] Checking Ollama..." -ForegroundColor Yellow
$ollamaPath = Join-Path $env:LOCALAPPDATA "Programs\Ollama\ollama.exe"
$ollamaInstalled = $false

if (Get-Command ollama -ErrorAction SilentlyContinue) {
    $ollamaInstalled = $true
} elseif (Test-Path $ollamaPath) {
    $ollamaInstalled = $true
}

if ($ollamaInstalled) {
    Write-Host "  -> Ollama is already installed." -ForegroundColor Green
} else {
    Write-Host "  -> Ollama NOT found. Downloading installer..." -ForegroundColor Cyan
    $ollamaUrl = "https://ollama.com/download/OllamaSetup.exe"
    $ollamaDest = Join-Path $tempDir "OllamaSetup.exe"
    
    try {
        Invoke-WebRequest -Uri $ollamaUrl -OutFile $ollamaDest -UseBasicParsing
        Write-Host "  -> Download complete. Installing Ollama silently..." -ForegroundColor Cyan
        Start-Process -FilePath $ollamaDest -ArgumentList "/silent" -Wait
        Write-Host "  -> Ollama installed successfully!" -ForegroundColor Green
    } catch {
        Write-Host "  -> Failed to download/install Ollama: $_" -ForegroundColor Red
        Write-Host "  -> Please download manually from https://ollama.com" -ForegroundColor Yellow
    }
}

# --- Step 2: Ensure Ollama is running and download models ---
Write-Host "Checking if Ollama service is active..." -ForegroundColor Yellow
$ollamaRunning = $false
for ($i = 0; $i -lt 5; $i++) {
    try {
        $res = Invoke-RestMethod -Uri "http://localhost:11434/api/tags" -TimeoutSec 2
        $ollamaRunning = $true
        break
    } catch {
        # Try to start it
        if ($i -eq 0) {
            Write-Host "  -> Starting Ollama service..." -ForegroundColor Cyan
            if (Test-Path $ollamaPath) {
                Start-Process -FilePath $ollamaPath -ArgumentList "serve" -WindowStyle Hidden
            } else {
                Start-Process -FilePath "ollama" -ArgumentList "serve" -WindowStyle Hidden -ErrorAction SilentlyContinue
            }
        }
        Start-Sleep -Seconds 2
    }
}

if ($ollamaRunning) {
    Write-Host "  -> Ollama service is running." -ForegroundColor Green
    
    Write-Host "Pulling model: phi3:mini (this may take a few minutes)..." -ForegroundColor Yellow
    if (Test-Path $ollamaPath) {
        & $ollamaPath pull phi3:mini
    } else {
        ollama pull phi3:mini
    }
    
    Write-Host "Pulling model: nomic-embed-text..." -ForegroundColor Yellow
    if (Test-Path $ollamaPath) {
        & $ollamaPath pull nomic-embed-text
    } else {
        ollama pull nomic-embed-text
    }

    Write-Host "Pulling model: moondream (vision model for OCR, may take a few minutes)..." -ForegroundColor Yellow
    if (Test-Path $ollamaPath) {
        & $ollamaPath pull moondream
    } else {
        ollama pull moondream
    }
    Write-Host "  -> Models pulled successfully." -ForegroundColor Green
} else {
    Write-Host "  -> Could not verify Ollama running. Skipping model pre-pull." -ForegroundColor Red
}

# --- Step 3: Check and Install Python + ChromaDB ---
Write-Host ""
Write-Host "[2/3] Checking Python & ChromaDB..." -ForegroundColor Yellow

$pythonInstalled = $false
if (Get-Command python -ErrorAction SilentlyContinue) {
    $pythonInstalled = $true
}

if (-not $pythonInstalled) {
    Write-Host "  -> Python is NOT installed. Downloading Python 3.11 installer..." -ForegroundColor Cyan
    $pythonUrl = "https://www.python.org/ftp/python/3.11.9/python-3.11.9-amd64.exe"
    $pythonDest = Join-Path $tempDir "python-installer.exe"
    
    try {
        Invoke-WebRequest -Uri $pythonUrl -OutFile $pythonDest -UseBasicParsing
        Write-Host "  -> Download complete. Installing Python silently..." -ForegroundColor Cyan
        Start-Process -FilePath $pythonDest -ArgumentList "/quiet InstallAllUsers=0 PrependPath=1" -Wait
        Write-Host "  -> Python installed successfully!" -ForegroundColor Green
        $pythonInstalled = $true
        # Refresh env path for this session
        $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")
    } catch {
        Write-Host "  -> Failed to install Python: $_" -ForegroundColor Red
    }
} else {
    Write-Host "  -> Python is already installed." -ForegroundColor Green
}

$chromaInstalled = $false
if (Get-Command chroma -ErrorAction SilentlyContinue) {
    $chromaInstalled = $true
}

if ($chromaInstalled) {
    Write-Host "  -> ChromaDB CLI is already installed." -ForegroundColor Green
} else {
    Write-Host "  -> ChromaDB NOT found. Installing via pip..." -ForegroundColor Cyan
    try {
        # Refresh Path to detect Python if it was just installed
        $pythonCmd = "python"
        if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
            $userLocalPath = Join-Path $env:USERPROFILE "AppData\Local\Programs\Python"
            if (Test-Path $userLocalPath) {
                $pyDirs = Get-ChildItem -Path $userLocalPath -Directory | Sort-Object LastWriteTime -Descending
                if ($pyDirs.Count -gt 0) {
                    $pythonCmd = Join-Path $pyDirs[0].FullName "python.exe"
                }
            }
        }
        
        Write-Host "  -> Running pip installation via: $pythonCmd" -ForegroundColor Cyan
        Start-Process -FilePath $pythonCmd -ArgumentList "-m pip install --upgrade pip" -Wait -WindowStyle Hidden -ErrorAction SilentlyContinue
        Start-Process -FilePath $pythonCmd -ArgumentList "-m pip install chromadb" -Wait
        Write-Host "  -> ChromaDB installed successfully via Python pip!" -ForegroundColor Green
    } catch {
        Write-Host "  -> Failed to install ChromaDB: $_" -ForegroundColor Red
        Write-Host "  -> Try running: pip install chromadb" -ForegroundColor Yellow
    }
}

Write-Host ""
Write-Host "[3/3] Checking Node.js (Application Runtime)..." -ForegroundColor Yellow
if (Get-Command node -ErrorAction SilentlyContinue) {
    Write-Host "  -> Node.js is installed locally." -ForegroundColor Green
} else {
    Write-Host "  -> Node.js is not in PATH, but portable/installer copy will be used." -ForegroundColor Yellow
}

# --- Cleanup ---
Remove-Item -Recurse -Force $tempDir -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "==================================================" -ForegroundColor Green
Write-Host "   Dependency Verification and Installation Done! " -ForegroundColor Green
Write-Host "==================================================" -ForegroundColor Green
Write-Host "Press any key to finish setup and launch QS Assistant..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
