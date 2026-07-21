@echo off
setlocal

set "TASK_NAME=Crypto Edge AI Central Automation"
for %%I in ("%~dp0..\..") do set "CRYPTO_EDGE_REPO_ROOT=%%~fI"
set "CANONICAL_WRAPPER=%CRYPTO_EDGE_REPO_ROOT%\scripts\win\run-central-automation.cmd"
set "TASK_USER=%USERDOMAIN%\%USERNAME%"

if "%~1"=="" (echo Mode: DRY-RUN) else (echo Mode: APPLY)
echo Task name: %TASK_NAME%
echo User: %TASK_USER%
echo Command: %CANONICAL_WRAPPER%
echo Working directory: %CRYPTO_EDGE_REPO_ROOT%
echo Cadence: every 5 minutes plus startup trigger
echo MultipleInstances: IgnoreNew
echo Secrets in command line: none

if "%~1"=="" exit /b 0
if /I not "%~1"=="--apply" (
  echo ERROR: only --apply is supported.
  exit /b 64
)
if not "%~2"=="" (
  echo ERROR: unexpected argument.
  exit /b 64
)

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0register-central-automation-task.ps1" -TaskName "%TASK_NAME%" -TaskUser "%TASK_USER%" -RepoRoot "%CRYPTO_EDGE_REPO_ROOT%" -RunnerPath "%CANONICAL_WRAPPER%"
exit /b %ERRORLEVEL%
