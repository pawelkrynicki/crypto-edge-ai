@echo off
setlocal

set "SCRIPT_DIR=%~dp0"
for %%I in ("%SCRIPT_DIR%..\..") do set "REPO_ROOT=%%~fI"

echo.
echo === Crypto Edge AI: post-merge check ===
echo Repo root: %REPO_ROOT%

cd /d "%REPO_ROOT%"
if errorlevel 1 exit /b 1

echo.
echo === Sync main ===
git fetch origin
if errorlevel 1 exit /b %ERRORLEVEL%

git switch main
if errorlevel 1 exit /b %ERRORLEVEL%

git pull --ff-only origin main
if errorlevel 1 exit /b %ERRORLEVEL%

set "HEAD="
for /f "delims=" %%H in ('git rev-parse HEAD') do set "HEAD=%%H"
if not defined HEAD (
  echo ERROR: could not read HEAD.
  exit /b 1
)

echo.
echo HEAD: %HEAD%

echo.
echo === Working tree status ===
git status --short
if errorlevel 1 exit /b %ERRORLEVEL%

set "DIRTY="
for /f "delims=" %%S in ('git status --short') do set "DIRTY=1"
if defined DIRTY (
  echo ERROR: working tree is dirty.
  exit /b 1
)
echo working tree clean

echo.
echo === Run data-poc check ===
call "%REPO_ROOT%\scripts\win\check-data-poc.cmd"
if errorlevel 1 exit /b %ERRORLEVEL%

echo.
echo === Run ui-mock check ===
call "%REPO_ROOT%\scripts\win\check-ui-mock.cmd"
if errorlevel 1 exit /b %ERRORLEVEL%

echo.
echo POST-MERGE CHECK OK
echo HEAD: %HEAD%
echo working tree clean
exit /b 0
