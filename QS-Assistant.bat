@echo off
cd /d "%~dp0"
title QS Assistant
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0launcher\start.ps1"
if errorlevel 1 pause
