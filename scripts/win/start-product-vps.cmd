@echo off
setlocal EnableExtensions

set "SCRIPT_DIR=%~dp0"
for %%I in ("%SCRIPT_DIR%..\..") do set "REPO_ROOT=%%~fI"
set "UI_DIR=%REPO_ROOT%\tools\ui-mock"

set "CRYPTO_EDGE_RUNTIME_MODE=INTERNAL_BETA"
if not defined CRYPTO_EDGE_PRODUCT_HOST set "CRYPTO_EDGE_PRODUCT_HOST=127.0.0.1"
if not defined CRYPTO_EDGE_PRODUCT_PORT set "CRYPTO_EDGE_PRODUCT_PORT=4180"

rem CAMP private state must outlive a versioned release directory.  The
rem external VPS launcher sets CRYPTO_EDGE_VPS_STATE_ROOT once; these explicit
rem per-store variables remain overrideable for recovery and test operations.
if defined CRYPTO_EDGE_VPS_STATE_ROOT (
  if not defined CRYPTO_EDGE_USER_WORKSPACE_SQLITE_PATH set "CRYPTO_EDGE_USER_WORKSPACE_SQLITE_PATH=%CRYPTO_EDGE_VPS_STATE_ROOT%\user-workspace.sqlite"
  if not defined CRYPTO_EDGE_RESEARCH_EVIDENCE_SQLITE_PATH set "CRYPTO_EDGE_RESEARCH_EVIDENCE_SQLITE_PATH=%CRYPTO_EDGE_VPS_STATE_ROOT%\research-evidence.sqlite"
  if not defined CRYPTO_EDGE_FEEDBACK_SQLITE_PATH set "CRYPTO_EDGE_FEEDBACK_SQLITE_PATH=%CRYPTO_EDGE_VPS_STATE_ROOT%\tester-feedback.sqlite"
  if not defined CRYPTO_EDGE_CAMP_IDENTITY_REGISTRY_PATH set "CRYPTO_EDGE_CAMP_IDENTITY_REGISTRY_PATH=%CRYPTO_EDGE_VPS_STATE_ROOT%\camp-user-identities.json"
)

cd /d "%UI_DIR%"
if errorlevel 1 exit /b 1

if not exist "dist\index.html" (
  echo ERROR: INTERNAL_BETA dist missing. Run scripts\win\build-product-vps.cmd first.
  exit /b 1
)

echo Crypto Edge AI product runtime: %CRYPTO_EDGE_RUNTIME_MODE%
echo Listen address: %CRYPTO_EDGE_PRODUCT_HOST%:%CRYPTO_EDGE_PRODUCT_PORT%
if defined CRYPTO_EDGE_VPS_STATE_ROOT echo CAMP private state root: %CRYPTO_EDGE_VPS_STATE_ROOT%
echo Collector and scheduler are not started by this script.
call node_modules\.bin\tsx.cmd server\productVpsServer.ts
exit /b %ERRORLEVEL%
