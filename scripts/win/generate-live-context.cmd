@echo off
setlocal

set "SCRIPT_DIR=%~dp0"
for %%I in ("%SCRIPT_DIR%..\..") do set "REPO_ROOT=%%~fI"

echo.
echo === Crypto Edge AI: generate live context ===
echo Repo root: %REPO_ROOT%

cd /d "%REPO_ROOT%\tools\data-poc"
if errorlevel 1 exit /b 1

echo.
echo === Generate approved source live context ===
set "CRYPTO_EDGE_DATA_ENV=PUBLIC_BETA"
call pnpm run sources:approved:live
set "LIVE_EXIT=%ERRORLEVEL%"
set "CRYPTO_EDGE_DATA_ENV="
if not "%LIVE_EXIT%"=="0" exit /b %LIVE_EXIT%

echo.
echo LIVE CONTEXT GENERATED
echo Now refresh http://127.0.0.1:5173
exit /b 0
