@echo off
setlocal EnableExtensions EnableDelayedExpansion

set "SCRIPT_DIR=%~dp0"
for %%I in ("%SCRIPT_DIR%..\..") do set "REPO_ROOT=%%~fI"
set "UI_DIR=%REPO_ROOT%\tools\ui-mock"
set "E2E_MODE=--preview"

if not "%~2"=="" goto usage_error
if "%~1"=="" goto args_done
if /i "%~1"=="--run-isolated" (
  set "E2E_MODE=--run-isolated"
  goto args_done
)
goto usage_error

:args_done
set "ALLOW_LIVE_PROVIDER_CALLS="
set "CRYPTO_EDGE_ALLOW_LIVE_SOURCE_CHECK="
set "CRYPTO_EDGE_AUTOMATION_ENABLED="
set "CRYPTO_EDGE_AI_WORKER_ENABLED="
set "CRYPTO_EDGE_AI_RESEARCH_PROVIDER=DISABLED"
set "CRYPTO_EDGE_AI_RESEARCH_MODEL="
set "CRYPTO_EDGE_AI_RESEARCH_LIVE_CALL_BUDGET="
set "CRYPTO_EDGE_OWNER_OPERATIONS_MODE=DISABLED"
set "CRYPTO_EDGE_RUNTIME_MODE=INTERNAL_BETA"
set "OPENAI_API_KEY="

echo.
echo === Crypto Edge AI: Full Product E2E.1 owner review ===
echo Mode: !E2E_MODE!
echo Provider: deterministic mock only
echo OpenAI calls: 0
echo Live data-provider calls: 0
echo Central live data cycle: disabled
echo Task Scheduler changes: 0
echo Canonical store mutations: 0
echo Browser tabs: exactly 1
echo.

if not exist "%UI_DIR%\scripts\runFullProductE2E.ts" (
  echo ERROR: Brak runnera E2E.1.
  exit /b 1
)

set "REVIEW_URL="
pushd "%UI_DIR%"
for /f "usebackq delims=" %%L in (`call node --import tsx scripts\runFullProductE2E.ts !E2E_MODE!`) do (
  echo %%L
  for /f "tokens=1,* delims==" %%A in ("%%L") do (
    if "%%A"=="REVIEW_URL" set "REVIEW_URL=%%B"
  )
)
set "RUN_EXIT=!ERRORLEVEL!"
popd

if not "!RUN_EXIT!"=="0" exit /b !RUN_EXIT!
if not defined REVIEW_URL (
  echo ERROR: Runner E2E.1 nie zwrocil bezpiecznego URL wyniku.
  exit /b 1
)

if "%CRYPTO_EDGE_PRODUCT_E2E_PLAN_ONLY%"=="1" (
  echo OPEN_URL=!REVIEW_URL!
) else (
  start "" "!REVIEW_URL!"
  echo Opened exactly one E2E.1 result tab.
)
exit /b 0

:usage_error
echo ERROR: Uzycie: scripts\win\start-full-product-e2e-review.cmd [--run-isolated]
exit /b 2
