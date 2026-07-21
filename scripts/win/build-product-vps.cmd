@echo off
setlocal EnableExtensions

set "SCRIPT_DIR=%~dp0"
for %%I in ("%SCRIPT_DIR%..\..") do set "REPO_ROOT=%%~fI"
set "UI_DIR=%REPO_ROOT%\tools\ui-mock"

echo.
echo === Crypto Edge AI: build Windows VPS product ===
echo Runtime: INTERNAL_BETA

cd /d "%UI_DIR%"
if errorlevel 1 exit /b 1

if not exist "package.json" (
  echo ERROR: tools\ui-mock\package.json not found.
  exit /b 1
)

set "CRYPTO_EDGE_RUNTIME_MODE=INTERNAL_BETA"
set "ALLOW_LIVE_PROVIDER_CALLS="
set "CRYPTO_EDGE_AUTOMATION_ENABLED="

echo.
echo === Synchronize UI/runtime build dependencies from the locked package ===
call pnpm install --frozen-lockfile --prefer-offline
if errorlevel 1 exit /b %ERRORLEVEL%

echo.
echo === Build and assert fixture-free INTERNAL_BETA surface ===
call pnpm run build:internal-beta
if errorlevel 1 exit /b %ERRORLEVEL%

if not exist "dist\index.html" (
  echo ERROR: dist\index.html not found after build.
  exit /b 1
)

echo.
echo PRODUCT VPS BUILD OK
exit /b 0
