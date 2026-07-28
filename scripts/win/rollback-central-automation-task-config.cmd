@echo off
setlocal
set "TASK_NAME=Crypto Edge AI Central Automation"
for %%I in ("%~dp0..\..") do set "CRYPTO_EDGE_REPO_ROOT=%%~fI"
set "BACKUP_DIRECTORY=%CRYPTO_EDGE_REPO_ROOT%\tools\data-poc\.local\automation\task-config-backup"
echo Task name: %TASK_NAME%
echo Configuration backup: %BACKUP_DIRECTORY%
if /I not "%~1"=="--rollback-config" (
  echo PREVIEW: pass --rollback-config to restore the saved task configuration.
  exit /b 0
)
if not "%~2"=="" exit /b 64
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0rollback-central-automation-task-config.ps1" -TaskName "%TASK_NAME%" -BackupDirectory "%BACKUP_DIRECTORY%"
exit /b %ERRORLEVEL%
