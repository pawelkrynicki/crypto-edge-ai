@echo off
setlocal
set "TASK_NAME=Crypto Edge AI Central Automation"
echo Task name: %TASK_NAME%
if /I not "%~1"=="--disable" (
  echo PREVIEW: pass --disable to disable this task without deleting it.
  exit /b 0
)
if not "%~2"=="" exit /b 64
powershell.exe -NoProfile -Command "Disable-ScheduledTask -TaskName '%TASK_NAME%' | Out-Null"
exit /b %ERRORLEVEL%
