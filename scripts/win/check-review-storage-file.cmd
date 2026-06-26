@echo off
setlocal

set "SCRIPT_DIR=%~dp0"
for %%I in ("%SCRIPT_DIR%..\..") do set "REPO_ROOT=%%~fI"

echo.
echo === Crypto Edge AI: review storage file check ===
echo Repo root: %REPO_ROOT%

cd /d "%REPO_ROOT%\tools\ui-mock"
if errorlevel 1 exit /b 1

if not exist "node_modules\.bin\tsx.cmd" (
  echo ERROR: ui-mock node_modules missing. Run pnpm install in tools/ui-mock.
  exit /b 1
)

set "CRYPTO_EDGE_REVIEW_STORAGE_PROVIDER="
set "CRYPTO_EDGE_REVIEW_SQLITE_PATH="

echo.
echo === Run file-backed Review Storage smoke ===
call node_modules\.bin\tsx.cmd scripts\reviewStorageModeSmoke.ts file
if errorlevel 1 exit /b %ERRORLEVEL%

echo.
echo REVIEW STORAGE FILE CHECK OK
exit /b 0
