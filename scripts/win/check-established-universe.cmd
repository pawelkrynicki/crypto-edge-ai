@echo off
setlocal
for %%I in ("%~dp0..\..") do set "CRYPTO_EDGE_REPO_ROOT=%%~fI"
set "ALLOW_LIVE_PROVIDER_CALLS=0"
set "CRYPTO_EDGE_ALLOW_LIVE_SOURCE_CHECK=0"

echo === Established universe offline validation ===
call pnpm.cmd --dir "%CRYPTO_EDGE_REPO_ROOT%\tools\data-poc" run build
if errorlevel 1 exit /b %ERRORLEVEL%
call pnpm.cmd --dir "%CRYPTO_EDGE_REPO_ROOT%\tools\data-poc" run universe:manage -- validate --json
if errorlevel 1 exit /b %ERRORLEVEL%
call pnpm.cmd --dir "%CRYPTO_EDGE_REPO_ROOT%\tools\data-poc" run universe:preview
if errorlevel 1 exit /b %ERRORLEVEL%
cd /d "%CRYPTO_EDGE_REPO_ROOT%\tools\data-poc"
node --test dist\tests\establishedAddressUniverse.test.js dist\tests\establishedUniverseManagement.test.js dist\tests\establishedUniverseCli.test.js dist\tests\establishedUniverseScripts.test.js dist\tests\internalBetaCollector.test.js
if errorlevel 1 exit /b %ERRORLEVEL%
cd /d "%CRYPTO_EDGE_REPO_ROOT%\tools\ui-mock"
node --import tsx --test tests\establishedUniverseStatus.test.ts
if errorlevel 1 exit /b %ERRORLEVEL%
echo ESTABLISHED UNIVERSE CHECK OK - OFFLINE, NO PROVIDER CALLS
exit /b 0
