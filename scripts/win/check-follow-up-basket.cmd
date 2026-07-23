@echo off
setlocal EnableExtensions
for %%I in ("%~dp0..\..") do set "REPO_ROOT=%%~fI"
set "ALLOW_LIVE_PROVIDER_CALLS=0"
set "CRYPTO_EDGE_ALLOW_LIVE_SOURCE_CHECK=0"
set "CRYPTO_EDGE_AUTOMATION_ENABLED=0"
set "CRYPTO_EDGE_RUNTIME_MODE=INTERNAL_BETA"

echo === Follow-up Basket offline validation ===
call pnpm.cmd --dir "%REPO_ROOT%\tools\data-poc" run test:follow-up
if errorlevel 1 exit /b %ERRORLEVEL%
cd /d "%REPO_ROOT%\tools\ui-mock"
call node --import tsx --test tests\followUpBasket.test.ts
if errorlevel 1 exit /b %ERRORLEVEL%
echo FOLLOW-UP BASKET CHECK OK - READ-ONLY API, OFFLINE, ZERO PROVIDER CALLS
exit /b 0
