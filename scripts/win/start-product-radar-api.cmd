@echo off
setlocal EnableExtensions

set "SCRIPT_DIR=%~dp0"
for %%I in ("%SCRIPT_DIR%..\..") do set "REPO_ROOT=%%~fI"
set "UI_DIR=%REPO_ROOT%\tools\ui-mock"

set "CRYPTO_EDGE_RUNTIME_MODE=INTERNAL_BETA"
set "SCANNER_API_PORT=5177"

cd /d "%UI_DIR%"
if errorlevel 1 exit /b 1

echo Scanner API runtime: %CRYPTO_EDGE_RUNTIME_MODE%
echo Scanner API port: %SCANNER_API_PORT%
call node_modules\.bin\tsx.cmd server\scannerApiServer.ts
exit /b %ERRORLEVEL%
