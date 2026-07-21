@echo off
setlocal
for %%I in ("%~dp0..\..") do set "CRYPTO_EDGE_REPO_ROOT=%%~fI"
cd /d "%CRYPTO_EDGE_REPO_ROOT%"
set "CRYPTO_EDGE_AUTOMATION_ENABLED=0"
set "ALLOW_LIVE_PROVIDER_CALLS=0"
call pnpm --dir tools\data-poc run test:automation
exit /b %ERRORLEVEL%
