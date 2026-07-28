@echo off
setlocal EnableExtensions

for %%I in ("%~dp0..\..") do set "CRYPTO_EDGE_REPO_ROOT=%%~fI"
cd /d "%CRYPTO_EDGE_REPO_ROOT%"
if errorlevel 1 exit /b 1

if "%~1"=="" (
  set "CRYPTO_EDGE_AUTOMATION_ENABLED=0"
  set "ALLOW_LIVE_PROVIDER_CALLS=0"
  set "CRYPTO_EDGE_AI_RESEARCH_PROVIDER=DISABLED"
  set "OPENAI_API_KEY="
  call pnpm --dir tools\data-poc run data-cycle
  exit /b %ERRORLEVEL%
)

if /I "%~1"=="--run-once-live" (
  if not "%~2"=="" (
    echo ERROR: unexpected argument.
    exit /b 64
  )
  set "CRYPTO_EDGE_DATA_ENV=INTERNAL_BETA"
  set "CRYPTO_EDGE_RUNTIME_MODE=INTERNAL_BETA"
  set "CRYPTO_EDGE_AUTOMATION_ENABLED=1"
  set "ALLOW_LIVE_PROVIDER_CALLS=1"
  set "CRYPTO_EDGE_AI_RESEARCH_PROVIDER=DISABLED"
  set "OPENAI_API_KEY="
  call pnpm --dir tools\data-poc run data-cycle -- --run-once-live
  exit /b %ERRORLEVEL%
)

if /I "%~1"=="--rollback" (
  if "%~2"=="" (
    echo ERROR: backup id is required.
    exit /b 64
  )
  if not "%~3"=="" (
    echo ERROR: unexpected argument.
    exit /b 64
  )
  set "CRYPTO_EDGE_AUTOMATION_ENABLED=0"
  set "ALLOW_LIVE_PROVIDER_CALLS=0"
  set "CRYPTO_EDGE_AI_RESEARCH_PROVIDER=DISABLED"
  set "OPENAI_API_KEY="
  call pnpm --dir tools\data-poc run data-cycle -- --rollback "%~2"
  exit /b %ERRORLEVEL%
)

echo ERROR: use no arguments, --run-once-live, or --rollback BACKUP_ID.
exit /b 64
