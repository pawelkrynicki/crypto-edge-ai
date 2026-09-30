@echo off
setlocal EnableExtensions

rem Starts the separate MT4 COMMON-file to local AXI Signal Gateway bridge.
rem It does not start the product runtime, place Kraken orders, or expose a token.
set "SCRIPT_DIR=%~dp0"
for %%I in ("%SCRIPT_DIR%..\..") do set "REPO_ROOT=%%~fI"
set "UI_DIR=%REPO_ROOT%\tools\ui-mock"

if not defined CRYPTO_EDGE_AXI_SIGNAL_ENDPOINT set "CRYPTO_EDGE_AXI_SIGNAL_ENDPOINT=http://127.0.0.1:4180/api/v1/trading/signals/axi"
if not defined CRYPTO_EDGE_MT4_BRIDGE_POLL_MS set "CRYPTO_EDGE_MT4_BRIDGE_POLL_MS=1000"
if not defined CRYPTO_EDGE_AXI_SIGNAL_TOKEN (
  echo ERROR: CRYPTO_EDGE_AXI_SIGNAL_TOKEN must be configured in this process environment.
  exit /b 1
)

cd /d "%UI_DIR%"
if errorlevel 1 exit /b 1

echo Crypto Edge MT4 bridge: separate process; local AXI gateway configured.
call node_modules\.bin\tsx.cmd server\axiMt4SignalBridge.ts %*
exit /b %ERRORLEVEL%
