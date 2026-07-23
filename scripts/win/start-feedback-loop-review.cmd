@echo off
setlocal EnableExtensions

set "SCRIPT_DIR=%~dp0"
for %%I in ("%SCRIPT_DIR%..\..") do set "REPO_ROOT=%%~fI"
set "UI_DIR=%REPO_ROOT%\tools\ui-mock"
set "CRYPTO_EDGE_RUNTIME_MODE=INTERNAL_BETA"
set "CRYPTO_EDGE_OWNER_OPERATIONS_MODE=REVIEW_SAFE"
set "CRYPTO_EDGE_AUTOMATION_ENABLED=0"
set "ALLOW_LIVE_PROVIDER_CALLS=0"
set "CRYPTO_EDGE_ALLOW_LIVE_SOURCE_CHECK=0"
set "CRYPTO_EDGE_PRODUCT_HOST=127.0.0.1"
set "CRYPTO_EDGE_PRODUCT_PORT=4181"
set "CRYPTO_EDGE_FEEDBACK_SQLITE_PATH=%UI_DIR%\.local\feedback-loop-review.sqlite"
set "CRYPTO_EDGE_FEEDBACK_SUBMISSION_ENABLED=1"
for /f %%I in ('git -C "%REPO_ROOT%" rev-parse HEAD') do set "CRYPTO_EDGE_BUILD_SHA=%%I"

echo.
echo === Crypto Edge AI: Persistent Feedback Loop owner review ===
echo Runtime: INTERNAL_BETA + REVIEW_SAFE
echo View: http://127.0.0.1:4181/#feedback
echo Storage: dedicated isolated feedback review store
echo Collector, providers, automation, snapshots and analyst reviews remain untouched.

if not exist "%UI_DIR%\node_modules\.bin\tsx.cmd" (
  echo ERROR: Brak tools\ui-mock\node_modules. Uruchom pnpm install w tools\ui-mock.
  exit /b 1
)

cd /d "%UI_DIR%"
if errorlevel 1 exit /b 1
call pnpm build:internal-beta
if errorlevel 1 exit /b %ERRORLEVEL%

start "Crypto Edge Feedback Review 4181" cmd /k call "%SCRIPT_DIR%start-product-vps.cmd"
timeout /t 2 /nobreak >nul
start "" "http://127.0.0.1:4181/#feedback"

echo.
echo Owner review started. One test submission is allowed only in the isolated review store.
echo Cleanup after closing the runtime: scripts\win\clear-feedback-loop-review.cmd
exit /b 0
