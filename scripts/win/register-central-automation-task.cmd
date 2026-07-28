@echo off
setlocal EnableExtensions

set "SCRIPT_DIR=%~dp0"
set "TASK_NAME=Crypto Edge AI Central Automation"
set "INTERVAL_MINUTES=5"
set "MODE=PREVIEW"
for %%I in ("%SCRIPT_DIR%..\..") do set "CRYPTO_EDGE_REPO_ROOT=%%~fI"
set "CANONICAL_WRAPPER=%CRYPTO_EDGE_REPO_ROOT%\scripts\win\run-central-automation.cmd"
set "TASK_USER=%USERDOMAIN%\%USERNAME%"
set "BACKUP_DIRECTORY=%CRYPTO_EDGE_REPO_ROOT%\tools\data-poc\.local\automation\task-config-backup"

if /I "%~1"=="--install" (
  set "MODE=INSTALL"
  shift
)
if /I "%~1"=="--interval-minutes" (
  if "%~2"=="" (
    echo ERROR: --interval-minutes requires a value from 1 to 1440.
    exit /b 64
  )
  set "INTERVAL_MINUTES=%~2"
  shift
  shift
)
if not "%~1"=="" (
  echo ERROR: use --install and optional --interval-minutes N.
  exit /b 64
)

for /f "delims=0123456789" %%A in ("%INTERVAL_MINUTES%") do (
  echo ERROR: interval must be an integer from 1 to 1440.
  exit /b 64
)
if %INTERVAL_MINUTES% LSS 1 exit /b 64
if %INTERVAL_MINUTES% GTR 1440 exit /b 64

echo Mode: %MODE%
echo Task name: %TASK_NAME%
echo User: %TASK_USER%
echo Command: %CANONICAL_WRAPPER%
echo Working directory: %CRYPTO_EDGE_REPO_ROOT%
echo Cadence: every %INTERVAL_MINUTES% minutes plus startup trigger
echo MultipleInstances: IgnoreNew
echo Configuration backup: %BACKUP_DIRECTORY%
echo Secrets in command line: none

if /I "%MODE%"=="PREVIEW" exit /b 0

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%register-central-automation-task.ps1" -TaskName "%TASK_NAME%" -TaskUser "%TASK_USER%" -RepoRoot "%CRYPTO_EDGE_REPO_ROOT%" -RunnerPath "%CANONICAL_WRAPPER%" -IntervalMinutes %INTERVAL_MINUTES% -BackupDirectory "%BACKUP_DIRECTORY%"
exit /b %ERRORLEVEL%
