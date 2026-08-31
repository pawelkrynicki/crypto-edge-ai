@echo off
setlocal EnableExtensions

set "SCRIPT_DIR=%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%migrate-camp-private-state.ps1" %*
exit /b %ERRORLEVEL%
