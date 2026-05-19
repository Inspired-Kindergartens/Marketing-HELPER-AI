@echo off
cd /d "%~dp0.."
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "scripts\run-build-persistent.ps1" > ".persistent-server.log" 2>&1
