@echo off
setlocal enabledelayedexpansion

set MSG=%~1
set SKIP_DIST=0

if /i "%~2"=="skip-dist" set SKIP_DIST=1
if /i "%~3"=="skip-dist" set SKIP_DIST=1
if /i "%~2"=="nodist" set SKIP_DIST=1
if /i "%~3"=="nodist" set SKIP_DIST=1

if "%MSG%"=="" (
  for /f "delims=" %%i in ('node "%~dp0.cursor\hooks\generate-commit-msg.js"') do set MSG=%%i
)

if "%MSG%"=="" set MSG=chore: auto-commit task changes

REM 1) Sync sources into desktop\app (portable + installer bundle input)
echo Syncing desktop portable + installer sources...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\sync-desktop-app.ps1" -BuildFrontend -Quiet
if %ERRORLEVEL% neq 0 (
  echo Desktop sync failed.
  exit /b 1
)

REM 2) Always rebuild portable + installer so both stay current (use skip-dist to opt out)
if %SKIP_DIST%==0 (
  echo Building portable + installer + share package...
  call npm run dist
  if %ERRORLEVEL% neq 0 (
    echo dist build failed. Close QS Assistant / File Explorer on desktop\release and retry.
    echo Or commit without rebuild: commit.bat "your message" skip-dist
    exit /b 1
  )
) else (
  echo Skipped dist build ^(skip-dist^).
)

git add -A

git diff --cached --quiet
if %ERRORLEVEL%==0 (
  echo Nothing to commit.
  exit /b 0
)

git commit -m "%MSG%"
if %ERRORLEVEL% neq 0 (
  echo Commit failed.
  exit /b 1
)

echo Committed: %MSG%

git push origin HEAD
if %ERRORLEVEL% neq 0 (
  echo Push failed. Run: git push origin HEAD
  exit /b 1
)

echo Pushed to GitHub.
