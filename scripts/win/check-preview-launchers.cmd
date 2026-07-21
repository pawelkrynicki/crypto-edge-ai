@echo off
setlocal

set "SCRIPT_DIR=%~dp0"
for %%I in ("%SCRIPT_DIR%..\..") do set "REPO_ROOT=%%~fI"

echo.
echo === Crypto Edge AI: preview launcher smoke check ===
echo Repo root: %REPO_ROOT%

cd /d "%REPO_ROOT%"
if errorlevel 1 exit /b 1

echo.
echo === Check preview launcher scripts ===
for %%F in (
  "scripts\win\build-ui-preview.cmd"
  "scripts\win\serve-ui-preview.cmd"
  "scripts\win\preview-trusted-preview.cmd"
  "scripts\win\preview-feedback-notes.cmd"
  "scripts\win\preview-webinar-teaser.cmd"
  "scripts\win\preview-control-center.cmd"
  "scripts\win\start-trusted-preview-session.cmd"
  "scripts\win\start-feedback-notes-session.cmd"
  "scripts\win\start-product-radar-api.cmd"
  "scripts\win\start-product-radar-review.cmd"
  "scripts\win\check-product-radar-review.cmd"
) do (
  if not exist "%REPO_ROOT%\%%~F" (
    echo ERROR: missing %%~F
    exit /b 1
  )
)

echo.
echo === Check UI mock package ===
if not exist "%REPO_ROOT%\tools\ui-mock\package.json" (
  echo ERROR: tools\ui-mock\package.json not found.
  exit /b 1
)

echo.
echo === Check Product Radar owner review launcher and real runtime ===
call "%REPO_ROOT%\scripts\win\start-product-radar-review.cmd" --check
if errorlevel 1 exit /b %ERRORLEVEL%

echo.
echo === Build explicit DEVELOPMENT_DEMO UI mock ===
call "%REPO_ROOT%\scripts\win\build-ui-preview.cmd"
if errorlevel 1 exit /b %ERRORLEVEL%

if not exist "%REPO_ROOT%\tools\ui-mock\dist\index.html" (
  echo ERROR: tools\ui-mock\dist\index.html not found after production build.
  exit /b 1
)

echo.
echo === Expected preview URLs ===
echo http://127.0.0.1:4173/#trusted-preview
echo http://127.0.0.1:4173/#feedback-notes
echo http://127.0.0.1:4173/#webinar-teaser
echo http://127.0.0.1:4173/#control-center

echo.
echo PREVIEW LAUNCHERS CHECK OK
exit /b 0
