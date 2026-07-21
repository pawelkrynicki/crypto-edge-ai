@echo off
setlocal EnableExtensions EnableDelayedExpansion

set "SCRIPT_DIR=%~dp0"
for %%I in ("%SCRIPT_DIR%..\..") do set "REPO_ROOT=%%~fI"
set "UI_DIR=%REPO_ROOT%\tools\ui-mock"
set "OUTPUT_DIR=%REPO_ROOT%\tools\data-poc\output"
set "RADAR_URL=http://127.0.0.1:5173/#candidate-results"
set "HAS_SCANNER_OUTPUT=0"
set "CRYPTO_EDGE_RUNTIME_MODE=INTERNAL_BETA"
set "SCANNER_API_PORT=5177"

echo.
echo === Crypto Edge AI: Product Radar owner review ===
echo Repo root: %REPO_ROOT%
echo Runtime: INTERNAL_BETA

if not exist "%UI_DIR%\node_modules\.bin\tsx.cmd" (
  echo ERROR: Brak tools\ui-mock\node_modules. Uruchom pnpm install w tools\ui-mock.
  exit /b 1
)

if not exist "%UI_DIR%\node_modules\.bin\vite.cmd" (
  echo ERROR: Brak lokalnego Vite w tools\ui-mock\node_modules.
  exit /b 1
)

if not exist "%REPO_ROOT%\scripts\win\start-product-radar-api.cmd" (
  echo ERROR: Brak scripts\win\start-product-radar-api.cmd.
  exit /b 1
)

if exist "%OUTPUT_DIR%" (
  for /r "%OUTPUT_DIR%" %%F in (full_output.json) do set "HAS_SCANNER_OUTPUT=1"
)

if "!HAS_SCANNER_OUTPUT!"=="0" (
  echo WARNING: Nie znaleziono tools\data-poc\output\...\full_output.json.
  echo Radar uruchomi sie bez fixture i pokaze uczciwy stan Data Unavailable.
) else (
  echo Scanner output: znaleziony. API zweryfikuje schemat, provenance i swiezosc.
)

if /i "%~1"=="--check" (
  echo.
  call "%REPO_ROOT%\scripts\win\check-product-radar-review.cmd"
  exit /b !ERRORLEVEL!
)

echo.
echo === Zwalnianie kanonicznych portow 5173 i 5177 ===
call "%REPO_ROOT%\scripts\win\kill-local-ports.cmd"
if errorlevel 1 exit /b %ERRORLEVEL%

echo.
echo === Uruchamianie Scanner API na 5177 ===
start "Crypto Edge Product Radar API 5177" cmd /k call "%REPO_ROOT%\scripts\win\start-product-radar-api.cmd"

echo === Uruchamianie INTERNAL_BETA UI na 5173 ===
start "Crypto Edge Product Radar UI 5173" cmd /k "cd /d ""%UI_DIR%"" && call node_modules\.bin\vite.cmd --mode internal-beta --host 127.0.0.1 --port 5173"

echo.
echo Radar: %RADAR_URL%
echo Zatrzymanie: scripts\win\kill-local-ports.cmd
echo Zamknij dwa okna procesu dopiero po zakonczeniu oceny ownera.

start "" "%RADAR_URL%"
exit /b 0
