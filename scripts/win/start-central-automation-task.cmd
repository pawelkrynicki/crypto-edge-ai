@echo off
setlocal
set "TASK_NAME=Crypto Edge AI Central Automation"
echo Task name: %TASK_NAME%
if /I not "%~1"=="--run-task" (
  echo PREVIEW: pass --run-task to request one Task Scheduler launch.
  exit /b 0
)
if not "%~2"=="" exit /b 64
powershell.exe -NoProfile -Command "Start-ScheduledTask -TaskName '%TASK_NAME%'"
exit /b %ERRORLEVEL%
