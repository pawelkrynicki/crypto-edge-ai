@echo off
setlocal EnableExtensions EnableDelayedExpansion

set "SCRIPT_DIR=%~dp0"
for %%I in ("%SCRIPT_DIR%..\..") do set "REPO_ROOT=%%~fI"
set "UI_DIR=%REPO_ROOT%\tools\ui-mock"
set "SMOKE_EXIT=1"

echo.
echo === Crypto Edge AI: Product Radar owner runtime smoke ===
echo Repo root: %REPO_ROOT%

if not exist "%UI_DIR%\node_modules\.bin\tsx.cmd" (
  echo ERROR: Brak tools\ui-mock\node_modules\.bin\tsx.cmd.
  exit /b 1
)

if not exist "%REPO_ROOT%\scripts\win\start-product-radar-api.cmd" (
  echo ERROR: Brak scripts\win\start-product-radar-api.cmd.
  exit /b 1
)

echo.
echo === Zwalnianie portow 5173 i 5177 przed smoke ===
call "%REPO_ROOT%\scripts\win\kill-local-ports.cmd"
if errorlevel 1 exit /b %ERRORLEVEL%

echo.
echo === Uruchamianie Scanner API INTERNAL_BETA ===
start "" /b cmd /c call "%REPO_ROOT%\scripts\win\start-product-radar-api.cmd"

cd /d "%UI_DIR%"
if errorlevel 1 goto :Cleanup

call node --import tsx scripts\checkProductRadarReviewRuntime.ts
set "SMOKE_EXIT=!ERRORLEVEL!"

:Cleanup
echo.
echo === Zatrzymywanie procesow smoke na 5173 i 5177 ===
call "%REPO_ROOT%\scripts\win\kill-local-ports.cmd"
if errorlevel 1 if "!SMOKE_EXIT!"=="0" set "SMOKE_EXIT=1"

if not "!SMOKE_EXIT!"=="0" (
  echo ERROR: PRODUCT RADAR OWNER RUNTIME SMOKE FAILED
  exit /b !SMOKE_EXIT!
)

echo.
echo PRODUCT RADAR OWNER RUNTIME SMOKE OK
exit /b 0
