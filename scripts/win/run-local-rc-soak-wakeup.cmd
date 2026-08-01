@echo off
setlocal EnableExtensions

if /I not "%~1"=="--run-directory" goto usage_error
if "%~2"=="" goto usage_error
if not "%~3"=="" goto usage_error

for %%I in ("%~dp0..\..") do set "CRYPTO_EDGE_REPO_ROOT=%%~fI"
set "CRYPTO_EDGE_DATA_ENV=INTERNAL_BETA"
set "CRYPTO_EDGE_RUNTIME_MODE=INTERNAL_BETA"
set "CRYPTO_EDGE_AUTOMATION_ENABLED=1"
set "ALLOW_LIVE_PROVIDER_CALLS=1"
set "CRYPTO_EDGE_AI_WORKER_ENABLED=0"
set "CRYPTO_EDGE_AI_RESEARCH_PROVIDER=DISABLED"
set "CRYPTO_EDGE_AI_RESEARCH_MODEL="
set "OPENAI_API_KEY="

cd /d "%CRYPTO_EDGE_REPO_ROOT%"
call pnpm --dir tools\data-poc run rc1:wakeup -- --run-directory "%~2"
exit /b %ERRORLEVEL%

:usage_error
echo ERROR: Uzycie: scripts\win\run-local-rc-soak-wakeup.cmd --run-directory PATH
exit /b 64
