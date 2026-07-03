@echo off
setlocal

set "SCRIPT_DIR=%~dp0"
for %%I in ("%SCRIPT_DIR%..\..") do set "REPO_ROOT=%%~fI"
set "PREVIEW_URL=http://127.0.0.1:4173/#feedback-notes"

echo.
echo === Crypto Edge AI: feedback notes session ===
echo Repo root: %REPO_ROOT%

cd /d "%REPO_ROOT%"
if errorlevel 1 exit /b 1

echo.
echo === Checking preview launchers ===
call "%REPO_ROOT%\scripts\win\check-preview-launchers.cmd"
if errorlevel 1 exit /b %ERRORLEVEL%

echo.
echo URL: %PREVIEW_URL%
echo.
echo === Starting feedback notes session ===
call "%REPO_ROOT%\scripts\win\serve-ui-preview.cmd" feedback-notes
exit /b %ERRORLEVEL%
