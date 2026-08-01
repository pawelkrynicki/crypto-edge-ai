@echo off
setlocal EnableExtensions EnableDelayedExpansion

set "SCRIPT_DIR=%~dp0"
for %%I in ("%SCRIPT_DIR%..\..") do set "REPO_ROOT=%%~fI"
set "UI_DIR=%REPO_ROOT%\tools\ui-mock"
set "REVIEW_URL="
set "MODE=PREVIEW"

if "%~1"=="" goto args_done
if /I "%~1"=="--run-live-local" (
  if not "%~2"=="" goto usage_error
  set "MODE=LIVE_LOCAL"
  goto args_done
)
goto usage_error

:args_done
set "CRYPTO_EDGE_DATA_ENV=FIXTURE_ONLY"
set "CRYPTO_EDGE_RUNTIME_MODE=OWNER_RC1_REVIEW"
set "CRYPTO_EDGE_AUTOMATION_ENABLED=0"
set "ALLOW_LIVE_PROVIDER_CALLS=0"
set "CRYPTO_EDGE_AI_WORKER_ENABLED=0"
set "CRYPTO_EDGE_AI_RESEARCH_PROVIDER=DISABLED"
set "CRYPTO_EDGE_AI_RESEARCH_MODEL="
set "OPENAI_API_KEY="

echo.
echo === Crypto Edge AI: RC.1 local release candidate soak ===
echo Mode: !MODE!
echo Temporary task: Crypto Edge AI RC1 Soak
echo Production task mutations: 0
echo OpenAI calls: 0
echo Honeypot.is automatic calls: 0
echo Browser tabs: exactly 1
echo.

if /I "!MODE!"=="PREVIEW" (
  set "REVIEW_URL=file:///%REPO_ROOT:\=/%/docs/local_release_candidate_soak.md"
  echo Live provider calls: 0
  echo Canonical store mutations: 0
  echo Task Scheduler mutations: 0
  echo Minimum live duration when explicitly enabled: 60 minutes
  echo Minimum wake-ups when explicitly enabled: 12
  goto open_review
)

set "CRYPTO_EDGE_DATA_ENV=INTERNAL_BETA"
set "CRYPTO_EDGE_RUNTIME_MODE=INTERNAL_BETA"
set "CRYPTO_EDGE_AUTOMATION_ENABLED=1"
set "ALLOW_LIVE_PROVIDER_CALLS=1"

pushd "%UI_DIR%"
call pnpm run build:internal-beta
if errorlevel 1 (
  popd
  exit /b 1
)
for /f "usebackq delims=" %%L in (`call pnpm run rc1:soak -- --run-live-local`) do (
  echo %%L
  for /f "tokens=1,* delims==" %%A in ("%%L") do if "%%A"=="REVIEW_URL" set "REVIEW_URL=%%B"
)
set "RUN_EXIT=!ERRORLEVEL!"
popd
if not "!RUN_EXIT!"=="0" exit /b !RUN_EXIT!
if not defined REVIEW_URL (
  echo ERROR: Runner RC.1 nie zwrocil URL owner review.
  exit /b 1
)

:open_review
if "%CRYPTO_EDGE_RC1_PLAN_ONLY%"=="1" (
  echo OPEN_URL=!REVIEW_URL!
) else (
  start "" "!REVIEW_URL!"
  echo Opened exactly one RC.1 owner review tab.
)
exit /b 0

:usage_error
echo ERROR: Uzycie: scripts\win\start-local-rc-soak-review.cmd [--run-live-local]
exit /b 64
