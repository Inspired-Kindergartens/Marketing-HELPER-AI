@echo off
cd /d "%~dp0.."
rem Ollama outlives the server and can keep the main log locked; a locked log
rem must not stop the server from starting.
set "SERVER_LOG=.persistent-server.log"
(type nul >> "%SERVER_LOG%") 2>nul || set "SERVER_LOG=.persistent-server-fallback.log"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "scripts\run-build-persistent.ps1" > "%SERVER_LOG%" 2>&1
