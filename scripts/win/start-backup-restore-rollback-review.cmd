@echo off
setlocal EnableExtensions EnableDelayedExpansion

set "SCRIPT_DIR=%~dp0"
for %%I in ("%SCRIPT_DIR%..\..") do set "REPO_ROOT=%%~fI"
set "UI_DIR=%REPO_ROOT%\tools\ui-mock"
set "REVIEW_MODE=--preview"

if not "%~2"=="" goto usage_error
if "%~1"=="" goto args_done
if /i "%~1"=="--run-isolated" (
  set "REVIEW_MODE=--run-isolated"
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
set "CRYPTO_EDGE_OWNER_OPERATIONS_MODE=DISABLED"
set "CRYPTO_EDGE_RUNTIME_MODE=OWNER_RECOVERY_REVIEW"
set "OPENAI_API_KEY="
set "CRYPTO_EDGE_RECOVERY_SCHEDULER_HOST_STATUS=NOT_OBSERVED"

if "%CRYPTO_EDGE_RECOVERY_REVIEW_PLAN_ONLY%"=="1" goto scheduler_status_done
for /f "usebackq delims=" %%S in (`powershell.exe -NoProfile -Command "$task=Get-ScheduledTask -TaskName 'Crypto Edge AI Central Automation' -ErrorAction SilentlyContinue; if($null -eq $task){'NOT_INSTALLED'}else{[string]$task.State}"`) do set "CRYPTO_EDGE_RECOVERY_SCHEDULER_HOST_STATUS=%%S"
:scheduler_status_done

echo.
echo === Crypto Edge AI: STAB.2 backup, restore and rollback owner review ===
echo Mode: !REVIEW_MODE!
echo Stores: isolated under %%TEMP%% only
echo Workers started: 0
echo OpenAI calls: 0
echo Live data-provider calls: 0
echo Central live data cycle: disabled
echo Canonical store mutations: 0
echo Task Scheduler mutations: 0
echo Browser tabs: exactly 1
echo.

if not exist "%UI_DIR%\scripts\runBackupRestoreRollback.ts" (
  echo ERROR: Brak runnera STAB.2.
  exit /b 1
)

set "REVIEW_URL="
pushd "%UI_DIR%"
for /f "usebackq delims=" %%L in (`call node --import tsx scripts\runBackupRestoreRollback.ts !REVIEW_MODE!`) do (
  echo %%L
  for /f "tokens=1,* delims==" %%A in ("%%L") do (
    if "%%A"=="REVIEW_URL" set "REVIEW_URL=%%B"
  )
)
set "RUN_EXIT=!ERRORLEVEL!"
popd

if not "!RUN_EXIT!"=="0" exit /b !RUN_EXIT!
if not defined REVIEW_URL (
  echo ERROR: Runner STAB.2 nie zwrocil bezpiecznego URL wyniku.
  exit /b 1
)

if "%CRYPTO_EDGE_RECOVERY_REVIEW_PLAN_ONLY%"=="1" (
  echo OPEN_URL=!REVIEW_URL!
) else (
  start "" "!REVIEW_URL!"
  echo Opened exactly one STAB.2 owner review tab.
)
exit /b 0

:usage_error
echo ERROR: Uzycie: scripts\win\start-backup-restore-rollback-review.cmd [--run-isolated]
exit /b 2
