@echo off
setlocal
for %%I in ("%~dp0..\..") do set "CRYPTO_EDGE_REPO_ROOT=%%~fI"
set "ALLOW_LIVE_PROVIDER_CALLS=0"
call pnpm.cmd --dir "%CRYPTO_EDGE_REPO_ROOT%\tools\data-poc" run universe:manage -- list %*
exit /b %ERRORLEVEL%
