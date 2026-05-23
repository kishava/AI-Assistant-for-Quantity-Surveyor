@echo off
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "launcher\start.ps1"
pause
