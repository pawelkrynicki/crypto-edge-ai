@echo off
setlocal EnableExtensions
for %%I in ("%~dp0..\..") do set "REPO_ROOT=%%~fI"
set "ALLOW_LIVE_PROVIDER_CALLS=0"
set "CRYPTO_EDGE_ALLOW_LIVE_SOURCE_CHECK=0"

echo === Follow-up bootstrap preview - DRY RUN, ZERO PROVIDER CALLS ===
call pnpm.cmd --dir "%REPO_ROOT%\tools\data-poc" run follow-up:bootstrap
exit /b %ERRORLEVEL%
