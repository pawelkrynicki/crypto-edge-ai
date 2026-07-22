@echo off
setlocal EnableExtensions

set "SCRIPT_DIR=%~dp0"
for %%I in ("%SCRIPT_DIR%..\..") do set "REPO_ROOT=%%~fI"
set "UI_DIR=%REPO_ROOT%\tools\ui-mock"

set "ALLOW_LIVE_PROVIDER_CALLS=0"
set "CRYPTO_EDGE_ALLOW_LIVE_SOURCE_CHECK=0"
set "CRYPTO_EDGE_AUTOMATION_ENABLED=0"
set "CRYPTO_EDGE_OWNER_OPERATIONS_MODE=DISABLED"
set "CRYPTO_EDGE_RUNTIME_MODE=INTERNAL_BETA"

echo.
echo === Crypto Edge AI: owner No-CMD refresh offline check ===
echo Live provider calls: disabled

cd /d "%UI_DIR%"
if errorlevel 1 exit /b 1

call node node_modules\typescript\bin\tsc -b
if errorlevel 1 exit /b %ERRORLEVEL%

call node --import tsx --test tests\ownerOperations.test.ts tests\controlCenter.test.ts
if errorlevel 1 exit /b %ERRORLEVEL%

echo.
echo OWNER NO-CMD REFRESH CHECK OK - DRY-RUN-FIRST, OFFLINE, ZERO LIVE PROVIDER CALLS
exit /b 0
