@echo off
setlocal EnableExtensions EnableDelayedExpansion

set "SCRIPT_DIR=%~dp0"
for %%I in ("%SCRIPT_DIR%..\..") do set "REPO_ROOT=%%~fI"
set "UI_DIR=%REPO_ROOT%\tools\ui-mock"
set "MODE=PREVIEW"

if "%~1"=="" goto args_done
if /I "%~1"=="--run-local" (
  if not "%~2"=="" goto usage_error
  set "MODE=RUN_LOCAL"
  goto args_done
)
goto usage_error

:args_done
set "CRYPTO_EDGE_DATA_ENV=INTERNAL_BETA"
set "CRYPTO_EDGE_RUNTIME_MODE=INTERNAL_BETA"
set "CRYPTO_EDGE_PRODUCT_HOST=127.0.0.1"
set "CRYPTO_EDGE_PRODUCT_PORT=4182"
set "CRYPTO_EDGE_AUTOMATION_ENABLED=0"
set "ALLOW_LIVE_PROVIDER_CALLS=0"
set "CRYPTO_EDGE_ALLOW_LIVE_SOURCE_CHECK=0"
set "CRYPTO_EDGE_AI_WORKER_ENABLED=0"
set "CRYPTO_EDGE_AI_RESEARCH_PROVIDER=DISABLED"
set "CRYPTO_EDGE_AI_RESEARCH_MODEL="
set "CRYPTO_EDGE_AI_RESEARCH_LIVE_CALL_BUDGET=0"
set "CRYPTO_EDGE_OWNER_OPERATIONS_MODE=REVIEW_SAFE"
set "CRYPTO_EDGE_FEEDBACK_SUBMISSION_ENABLED=1"
set "OPENAI_API_KEY="

echo.
echo === Crypto Edge AI: OA.1 Local Owner Acceptance ===
echo Mode: %MODE%
echo Runtime: INTERNAL_BETA with current published data
echo Central collector: not started
echo OpenAI calls: 0
echo Data provider calls: 0
echo Task Scheduler changes: 0
echo Established Universe changes: 0
echo Recovery actions: 0
echo Browser tabs: exactly 1

if not exist "%UI_DIR%\node_modules\.bin\tsx.cmd" (
  echo ERROR: Brak tools\ui-mock\node_modules. Uruchom pnpm install w tools\ui-mock.
  exit /b 1
)

pushd "%UI_DIR%"
if /I "%MODE%"=="PREVIEW" (
  call pnpm run oa1:session -- --preview
  set "RUN_EXIT=%ERRORLEVEL%"
  popd
  exit /b !RUN_EXIT!
)

call pnpm run build:internal-beta
if errorlevel 1 (
  set "RUN_EXIT=%ERRORLEVEL%"
  popd
  exit /b !RUN_EXIT!
)

call pnpm run oa1:session -- --run-local
set "RUN_EXIT=%ERRORLEVEL%"
popd
exit /b %RUN_EXIT%

:usage_error
echo ERROR: Uzycie: scripts\win\start-owner-acceptance-review.cmd [--run-local]
exit /b 64
