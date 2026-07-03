@echo off
setlocal

set "SCRIPT_DIR=%~dp0"
for %%I in ("%SCRIPT_DIR%..\..") do set "REPO_ROOT=%%~fI"

set "PREVIEW_VIEW=%~1"
if "%PREVIEW_VIEW%"=="" set "PREVIEW_VIEW=overview"

if /I "%PREVIEW_VIEW%"=="overview" goto route_ok
if /I "%PREVIEW_VIEW%"=="trusted-preview" goto route_ok
if /I "%PREVIEW_VIEW%"=="feedback-notes" goto route_ok
if /I "%PREVIEW_VIEW%"=="webinar-teaser" goto route_ok
if /I "%PREVIEW_VIEW%"=="control-center" goto route_ok

echo ERROR: unknown preview view "%PREVIEW_VIEW%".
goto usage

:route_ok
set "PREVIEW_HOST=127.0.0.1"
set "PREVIEW_PORT=4173"
set "PREVIEW_URL=http://%PREVIEW_HOST%:%PREVIEW_PORT%/#%PREVIEW_VIEW%"

echo.
echo === Crypto Edge AI: local production UI mock preview ===
echo Repo root: %REPO_ROOT%

cd /d "%REPO_ROOT%" || exit /b 1
cd /d "%REPO_ROOT%\tools\ui-mock"
if errorlevel 1 exit /b 1

if not exist "dist\index.html" (
  echo ERROR: dist\index.html not found. Run scripts\win\build-ui-preview.cmd first.
  exit /b 1
)

if not exist "node_modules\.bin\vite.cmd" (
  echo ERROR: ui-mock node_modules missing. Run pnpm install in tools/ui-mock.
  exit /b 1
)

echo.
echo URL: %PREVIEW_URL%
echo Host: %PREVIEW_HOST%
echo Port: %PREVIEW_PORT%
echo.
echo === Serving production build from dist ===
call node_modules\.bin\vite.cmd preview --host %PREVIEW_HOST% --port %PREVIEW_PORT%
exit /b %ERRORLEVEL%

:usage
echo Usage: scripts\win\serve-ui-preview.cmd [trusted-preview^|feedback-notes^|webinar-teaser^|control-center^|overview]
exit /b 1
