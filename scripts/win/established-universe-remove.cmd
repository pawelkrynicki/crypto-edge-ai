@echo off
setlocal
for %%I in ("%~dp0..\..") do set "CRYPTO_EDGE_REPO_ROOT=%%~fI"
set "ALLOW_LIVE_PROVIDER_CALLS=0"
echo Established universe REMOVE plan. Without --apply this is a dry-run.
call pnpm.cmd --dir "%CRYPTO_EDGE_REPO_ROOT%\tools\data-poc" run universe:manage -- remove %*
exit /b %ERRORLEVEL%
