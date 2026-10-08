@echo off
setlocal EnableExtensions

rem PREVIEW compatibility sidecar: reads MT4/AXI logs and emits lifecycle JSON
rem into the existing CryptoEdge COMMON outbox. It never places orders.
set "SCRIPT_DIR=%~dp0"
for %%I in ("%SCRIPT_DIR%..\..") do set "REPO_ROOT=%%~fI"
set "UI_DIR=%REPO_ROOT%\tools\ui-mock"

if not defined CRYPTO_EDGE_MT4_BRIDGE_ROOT (
  echo ERROR: CRYPTO_EDGE_MT4_BRIDGE_ROOT must be configured.
  exit /b 1
)
if not defined CRYPTO_EDGE_MT4_TERMINAL_ROOT (
  echo ERROR: CRYPTO_EDGE_MT4_TERMINAL_ROOT must be configured.
  exit /b 1
)
if not defined CRYPTO_EDGE_MT4_LIFECYCLE_RECONCILER_POLL_MS set "CRYPTO_EDGE_MT4_LIFECYCLE_RECONCILER_POLL_MS=1000"
if not defined CRYPTO_EDGE_MT4_LIFECYCLE_RECONCILER_LOOKBACK_DAYS set "CRYPTO_EDGE_MT4_LIFECYCLE_RECONCILER_LOOKBACK_DAYS=7"

cd /d "%UI_DIR%"
if errorlevel 1 exit /b 1

echo Crypto Edge MT4 lifecycle log reconciler: PREVIEW compatibility process; read-only MT4 logs, writes lifecycle outbox only.
call node_modules\.bin\tsx.cmd server\axiMt4LifecycleLogReconciler.ts %*
exit /b %ERRORLEVEL%
