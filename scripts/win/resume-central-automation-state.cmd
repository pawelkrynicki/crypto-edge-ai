@echo off
setlocal

for %%I in ("%~dp0..\..") do set "CRYPTO_EDGE_REPO_ROOT=%%~fI"
cd /d "%CRYPTO_EDGE_REPO_ROOT%"

if "%~1"=="" (
  echo Mode: PREVIEW
  echo No application state will be changed. Task Scheduler will not be changed.
  call pnpm --dir tools\data-poc run automation:resume
  exit /b %ERRORLEVEL%
)

if /I not "%~1"=="--confirm-owner-resume" (
  echo ERROR: expected --confirm-owner-resume or no argument for preview.
  exit /b 64
)
if not "%~2"=="" exit /b 64

echo Mode: OWNER_CONFIRMED
echo Task Scheduler will not be enabled or changed.
call pnpm --dir tools\data-poc run automation:resume -- --confirm-owner-resume
exit /b %ERRORLEVEL%
