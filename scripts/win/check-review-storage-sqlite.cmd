@echo off
setlocal

set "SCRIPT_DIR=%~dp0"
for %%I in ("%SCRIPT_DIR%..\..") do set "REPO_ROOT=%%~fI"

echo.
echo === Crypto Edge AI: review storage SQLite check ===
echo Repo root: %REPO_ROOT%

cd /d "%REPO_ROOT%\tools\ui-mock"
if errorlevel 1 exit /b 1

if not exist "node_modules\.bin\tsx.cmd" (
  echo ERROR: ui-mock node_modules missing. Run pnpm install in tools/ui-mock.
  exit /b 1
)

if not exist ".local" mkdir ".local"

set "CRYPTO_EDGE_REVIEW_STORAGE_PROVIDER=sqlite"
set "CRYPTO_EDGE_REVIEW_SQLITE_PATH=%REPO_ROOT%\tools\ui-mock\.local\review-session-smoke.sqlite"

echo.
echo === Run SQLite Review Storage smoke ===
call node_modules\.bin\tsx.cmd scripts\reviewStorageModeSmoke.ts sqlite
set "SMOKE_EXIT=%ERRORLEVEL%"
set "CRYPTO_EDGE_REVIEW_STORAGE_PROVIDER="
set "CRYPTO_EDGE_REVIEW_SQLITE_PATH="
if not "%SMOKE_EXIT%"=="0" exit /b %SMOKE_EXIT%

echo.
echo REVIEW STORAGE SQLITE CHECK OK
exit /b 0
