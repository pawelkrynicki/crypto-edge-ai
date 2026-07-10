@echo off
setlocal

set "SCRIPT_DIR=%~dp0"
for %%I in ("%SCRIPT_DIR%..\..") do set "REPO_ROOT=%%~fI"

echo.
echo === Crypto Edge AI: strict live source check ===
echo Repo root: %REPO_ROOT%

cd /d "%REPO_ROOT%\tools\data-poc"
if errorlevel 1 exit /b 1

set "CRYPTO_EDGE_DATA_ENV=PUBLIC_BETA"
set "STRICT_LIVE_SOURCES=1"
call pnpm run sources:approved:live
set "LIVE_EXIT=%ERRORLEVEL%"
set "STRICT_LIVE_SOURCES="
set "CRYPTO_EDGE_DATA_ENV="
exit /b %LIVE_EXIT%
