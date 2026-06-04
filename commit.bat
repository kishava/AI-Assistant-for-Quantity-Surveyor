@echo off
setlocal enabledelayedexpansion

set MSG=%~1

if "%MSG%"=="" (
  for /f "delims=" %%i in ('node "%~dp0.cursor\hooks\generate-commit-msg.js"') do set MSG=%%i
)

if "%MSG%"=="" set MSG=chore: auto-commit task changes

REM Keep portable + installer source bundle aligned with backend/frontend/launcher
echo Syncing desktop portable + installer sources...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\sync-desktop-app.ps1" -BuildFrontend -Quiet
if %ERRORLEVEL% neq 0 (
  echo Desktop sync failed.
  exit /b 1
)

if /i "%~2"=="dist" goto do_dist
if /i "%~3"=="dist" goto do_dist
goto after_dist

:do_dist
echo Building portable + installer (electron-builder)...
call npm run dist
if %ERRORLEVEL% neq 0 (
  echo dist build failed.
  exit /b 1
)

:after_dist
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
