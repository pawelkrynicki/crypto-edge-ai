@echo off
setlocal
for %%I in ("%~dp0..\..") do set "CRYPTO_EDGE_REPO_ROOT=%%~fI"
cd /d "%CRYPTO_EDGE_REPO_ROOT%"
set "CRYPTO_EDGE_AUTOMATION_ENABLED=0"
set "ALLOW_LIVE_PROVIDER_CALLS=0"
cd /d "%CRYPTO_EDGE_REPO_ROOT%\tools\ui-mock"
node --import tsx scripts\automationStatusApiSmoke.ts
exit /b %ERRORLEVEL%
