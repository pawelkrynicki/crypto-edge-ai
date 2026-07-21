@echo off
setlocal

set "TASK_NAME=Crypto Edge AI Central Automation"
echo Task name: %TASK_NAME%
echo Scope: this task only

if "%~1"=="" (
  echo Mode: DRY-RUN
  echo Planned action: unregister %TASK_NAME%
  exit /b 0
)
if /I not "%~1"=="--apply" (
  echo ERROR: only --apply is supported.
  exit /b 64
)
if not "%~2"=="" (
  echo ERROR: unexpected argument.
  exit /b 64
)

powershell.exe -NoProfile -Command "Unregister-ScheduledTask -TaskName '%TASK_NAME%' -Confirm:$false"
exit /b %ERRORLEVEL%
