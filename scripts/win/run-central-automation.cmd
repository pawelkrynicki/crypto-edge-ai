@echo off
setlocal

if not "%~1"=="" (
  echo ERROR: run-central-automation.cmd does not accept arguments.
  exit /b 64
)

for %%I in ("%~dp0..\..") do set "CRYPTO_EDGE_REPO_ROOT=%%~fI"
set "CRYPTO_EDGE_DATA_ENV=INTERNAL_BETA"
set "CRYPTO_EDGE_RUNTIME_MODE=INTERNAL_BETA"
set "CRYPTO_EDGE_AUTOMATION_ENABLED=1"
set "ALLOW_LIVE_PROVIDER_CALLS=1"
set "CRYPTO_EDGE_AUTOMATION_LOG_DIR=%CRYPTO_EDGE_REPO_ROOT%\tools\data-poc\.local\automation\logs"

if not exist "%CRYPTO_EDGE_AUTOMATION_LOG_DIR%" mkdir "%CRYPTO_EDGE_AUTOMATION_LOG_DIR%"
cd /d "%CRYPTO_EDGE_REPO_ROOT%"
call pnpm --dir tools\data-poc run automation:run >> "%CRYPTO_EDGE_AUTOMATION_LOG_DIR%\central-automation.log" 2>&1
set "CRYPTO_EDGE_AUTOMATION_EXIT=%ERRORLEVEL%"
exit /b %CRYPTO_EDGE_AUTOMATION_EXIT%
