@echo off
setlocal EnableExtensions

set "SCRIPT_DIR=%~dp0"
for %%I in ("%SCRIPT_DIR%..\..") do set "REPO_ROOT=%%~fI"
set "UI_DIR=%REPO_ROOT%\tools\ui-mock"

set "ALLOW_LIVE_PROVIDER_CALLS="
set "CRYPTO_EDGE_AUTOMATION_ENABLED="
set "CRYPTO_EDGE_RUNTIME_MODE=INTERNAL_BETA"

echo.
echo === Crypto Edge AI: offline VPS runtime smoke ===
call "%SCRIPT_DIR%build-product-vps.cmd"
if errorlevel 1 exit /b %ERRORLEVEL%

cd /d "%UI_DIR%"
if errorlevel 1 exit /b 1

echo.
echo === Start same-origin runtime on a dedicated random high port ===
call node --import tsx scripts\checkProductVpsRuntime.ts
if errorlevel 1 exit /b %ERRORLEVEL%

echo.
echo PRODUCT VPS RUNTIME CHECK OK
exit /b 0
