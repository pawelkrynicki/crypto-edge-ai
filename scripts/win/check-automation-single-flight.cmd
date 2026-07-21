@echo off
setlocal EnableExtensions

set "SCRIPT_DIR=%~dp0"
for %%I in ("%SCRIPT_DIR%..\..") do set "REPO_ROOT=%%~fI"
set "DATA_DIR=%REPO_ROOT%\tools\data-poc"

set "ALLOW_LIVE_PROVIDER_CALLS="
set "CRYPTO_EDGE_AUTOMATION_ENABLED="

echo.
echo === Crypto Edge AI: offline automation single-flight check ===
echo Live provider calls: disabled

cd /d "%DATA_DIR%"
if errorlevel 1 exit /b 1

call pnpm run test:automation
if errorlevel 1 exit /b %ERRORLEVEL%

echo.
echo AUTOMATION SINGLE-FLIGHT CHECK OK
exit /b 0
