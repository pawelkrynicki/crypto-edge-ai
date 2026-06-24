@echo off
setlocal

set "SCRIPT_DIR=%~dp0"
for %%I in ("%SCRIPT_DIR%..\..") do set "REPO_ROOT=%%~fI"

echo.
echo === Crypto Edge AI: data-poc check ===
echo Repo root: %REPO_ROOT%

cd /d "%REPO_ROOT%\tools\data-poc"
if errorlevel 1 exit /b 1

echo.
echo === Validate data source registry ===
call pnpm run sources:validate
if errorlevel 1 exit /b %ERRORLEVEL%

echo.
echo === Generate approved source fixture context ===
call pnpm run sources:approved:fixture
if errorlevel 1 exit /b %ERRORLEVEL%

echo.
echo === Generate approved source live context ===
set "CRYPTO_EDGE_DATA_ENV=PUBLIC_BETA"
call pnpm run sources:approved:live
set "LIVE_EXIT=%ERRORLEVEL%"
set "CRYPTO_EDGE_DATA_ENV="
if not "%LIVE_EXIT%"=="0" exit /b %LIVE_EXIT%

echo.
echo === Run data-poc tests ===
call pnpm run test
if errorlevel 1 exit /b %ERRORLEVEL%

echo.
echo === Run data-poc typecheck ===
call pnpm run typecheck
if errorlevel 1 exit /b %ERRORLEVEL%

echo.
echo === Check for stale approved source output ===
if exist "output\approved_sources_20260624123456" (
  echo ERROR: stale approved_sources_20260624123456 exists
  exit /b 1
)

echo.
echo DATA-POC CHECK OK
exit /b 0
