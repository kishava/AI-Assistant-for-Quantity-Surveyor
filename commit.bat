@echo off
set MSG=%~1
if "%MSG%"=="" (
  echo Usage: commit.bat "commit message"
  exit /b 1
)
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
