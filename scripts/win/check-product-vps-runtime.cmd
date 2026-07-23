@echo off
setlocal EnableExtensions

set "SCRIPT_DIR=%~dp0"
for %%I in ("%SCRIPT_DIR%..\..") do set "REPO_ROOT=%%~fI"
set "UI_DIR=%REPO_ROOT%\tools\ui-mock"

set "ALLOW_LIVE_PROVIDER_CALLS="
set "CRYPTO_EDGE_AUTOMATION_ENABLED="
set "CRYPTO_EDGE_RUNTIME_MODE=INTERNAL_BETA"
set "CRYPTO_EDGE_FEEDBACK_SQLITE_PATH=%TEMP%\crypto-edge-vps-check-feedback-%RANDOM%-%RANDOM%.sqlite"

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
if exist "%CRYPTO_EDGE_FEEDBACK_SQLITE_PATH%" del /q "%CRYPTO_EDGE_FEEDBACK_SQLITE_PATH%"
if exist "%CRYPTO_EDGE_FEEDBACK_SQLITE_PATH%-wal" del /q "%CRYPTO_EDGE_FEEDBACK_SQLITE_PATH%-wal"
if exist "%CRYPTO_EDGE_FEEDBACK_SQLITE_PATH%-shm" del /q "%CRYPTO_EDGE_FEEDBACK_SQLITE_PATH%-shm"
exit /b 0
