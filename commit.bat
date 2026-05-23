@echo off
setlocal enabledelayedexpansion

set MSG=%~1

if "%MSG%"=="" (
  for /f "delims=" %%i in ('node "%~dp0.cursor\hooks\generate-commit-msg.js"') do set MSG=%%i
)

if "%MSG%"=="" set MSG=chore: auto-commit task changes

git add -A

git diff --cached --quiet
if %ERRORLEVEL%==0 (
  echo Nothing to commit.
  exit /b 0
)

git commit -m "%MSG%"
if %ERRORLEVEL%==0 (
  echo Committed: %MSG%
) else (
  echo Commit failed.
  exit /b 1
)
