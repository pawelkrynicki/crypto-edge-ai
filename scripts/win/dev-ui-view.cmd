@echo off
setlocal

set "SCRIPT_DIR=%~dp0"
for %%I in ("%SCRIPT_DIR%..\..") do set "REPO_ROOT=%%~fI"

set "PREVIEW_HASH=%~1"

if "%PREVIEW_HASH%"=="" goto usage

if /I "%PREVIEW_HASH%"=="trusted-preview" goto route_ok
if /I "%PREVIEW_HASH%"=="feedback-notes" goto route_ok
if /I "%PREVIEW_HASH%"=="webinar-teaser" goto route_ok
if /I "%PREVIEW_HASH%"=="control-center" goto route_ok

echo ERROR: Unknown preview route "%PREVIEW_HASH%".
goto usage

:route_ok
set "PREVIEW_URL=http://localhost:5173/#%PREVIEW_HASH%"

cd /d "%REPO_ROOT%" || exit /b 1

call "%SCRIPT_DIR%dev-ui.cmd"
if errorlevel 1 exit /b %errorlevel%

echo.
echo Opening %PREVIEW_URL%
start "" "%PREVIEW_URL%"
exit /b 0

:usage
echo Usage: scripts\win\dev-ui-view.cmd ^<trusted-preview^|feedback-notes^|webinar-teaser^|control-center^>
exit /b 1
