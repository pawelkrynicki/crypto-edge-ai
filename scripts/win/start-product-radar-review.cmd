@echo off
setlocal EnableExtensions EnableDelayedExpansion

set "SCRIPT_DIR=%~dp0"
for %%I in ("%SCRIPT_DIR%..\..") do set "REPO_ROOT=%%~fI"
set "UI_DIR=%REPO_ROOT%\tools\ui-mock"
set "OUTPUT_DIR=%REPO_ROOT%\tools\data-poc\output"
set "RADAR_VIEW=candidate-results"
set "OWNER_OPERATIONS_REVIEW=0"
set "ESTABLISHED_PROMOTION_REVIEW=0"
set "RUN_CHECK=0"

:parse_args
if "%~1"=="" goto args_done
if /i "%~1"=="--control-center" set "RADAR_VIEW=control-center"
if /i "%~1"=="--reports" set "RADAR_VIEW=reports"
if /i "%~1"=="--candidate-detail" set "RADAR_VIEW=candidate-detail"
if /i "%~1"=="--owner-operations-review" set "OWNER_OPERATIONS_REVIEW=1"
if /i "%~1"=="--established-promotion-review" set "ESTABLISHED_PROMOTION_REVIEW=1"
if /i "%~1"=="--check" set "RUN_CHECK=1"
shift
goto parse_args

:args_done
if "%ESTABLISHED_PROMOTION_REVIEW%"=="1" set "RADAR_VIEW=candidate-detail"
if "%OWNER_OPERATIONS_REVIEW%"=="1" if /i not "%RADAR_VIEW%"=="control-center" (
  echo ERROR: --owner-operations-review wymaga --control-center.
  exit /b 1
)
if "%ESTABLISHED_PROMOTION_REVIEW%"=="1" if /i not "%RADAR_VIEW%"=="candidate-detail" (
  echo ERROR: --established-promotion-review wymaga --candidate-detail.
  exit /b 1
)
set "RADAR_URL=http://127.0.0.1:5173/#!RADAR_VIEW!"
set "HAS_SCANNER_OUTPUT=0"
set "CRYPTO_EDGE_RUNTIME_MODE=INTERNAL_BETA"
set "SCANNER_API_PORT=5177"
set "CRYPTO_EDGE_OWNER_OPERATIONS_MODE=DISABLED"
if "%OWNER_OPERATIONS_REVIEW%"=="1" set "CRYPTO_EDGE_OWNER_OPERATIONS_MODE=REVIEW_SAFE"
if "%ESTABLISHED_PROMOTION_REVIEW%"=="1" set "CRYPTO_EDGE_OWNER_OPERATIONS_MODE=REVIEW_SAFE"

echo.
echo === Crypto Edge AI: Product Radar owner review ===
echo Repo root: %REPO_ROOT%
echo Runtime: INTERNAL_BETA
echo Owner operations: %CRYPTO_EDGE_OWNER_OPERATIONS_MODE%

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

if "%RUN_CHECK%"=="1" (
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
echo Radar: !RADAR_URL!
echo Zatrzymanie: scripts\win\kill-local-ports.cmd
echo Zamknij dwa okna procesu dopiero po zakonczeniu oceny ownera.

start "" "!RADAR_URL!"
exit /b 0
