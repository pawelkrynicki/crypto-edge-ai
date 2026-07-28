@echo off
setlocal EnableExtensions

set "SCRIPT_DIR=%~dp0"
for %%I in ("%SCRIPT_DIR%..\..") do set "REPO_ROOT=%%~fI"
set "REVIEW_DETAIL=0"

:parse_args
if "%~1"=="" goto args_done
if /i "%~1"=="--detail" (
  set "REVIEW_DETAIL=1"
) else (
  echo ERROR: Nieznany parametr: %~1
  echo Uzycie: scripts\win\start-token-flow-review.cmd [--detail]
  exit /b 1
)
shift
goto parse_args

:args_done
set "ALLOW_LIVE_PROVIDER_CALLS="
set "CRYPTO_EDGE_ALLOW_LIVE_SOURCE_CHECK="
set "CRYPTO_EDGE_AUTOMATION_ENABLED="
set "CRYPTO_EDGE_OWNER_OPERATIONS_MODE=DISABLED"
set "CRYPTO_EDGE_RUNTIME_MODE=INTERNAL_BETA"

echo.
echo === Crypto Edge AI: FLOW.1 owner review ===
echo Runtime: INTERNAL_BETA
echo Dane: aktualne lokalne snapshoty, Follow-up Store i Established Universe
echo.
echo Checklista:
echo   1. Radar: rozwin "Jak token przechodzi przez Radar".
echo   2. Nowe: sprawdz aktywne sledzenie albo oczekiwanie na centralny cykl.
echo   3. Dalsza obserwacja: sprawdz checkpointy 1 / 3 / 7 / 14 / 30 dni.
echo   4. Kandydat: sprawdz "Nie dodano automatycznie" i decyzje wlasciciela.
echo   5. Glowny Radar: sprawdz ukonczony przeplyw i wersje universe.
echo   6. Control Center: sprawdz store, due checkpoint i status decyzji wlasciciela.
echo.
echo Liczba rekordow Maturing i Candidate zalezy od aktualnego rzeczywistego store.
echo Launcher nie uruchamia collectora, providerow ani bootstrap --apply.
echo Launcher nie modyfikuje Follow-up Store ani Established Universe.
echo Tryb ENABLED nie jest aktywowany.

if "%REVIEW_DETAIL%"=="1" (
  echo.
  echo Otwieranie pierwszego dostepnego Candidate Detail z aktualnych danych.
  call "%REPO_ROOT%\scripts\win\start-product-radar-review.cmd" --candidate-detail
  exit /b %ERRORLEVEL%
)

call "%REPO_ROOT%\scripts\win\start-product-radar-review.cmd"
exit /b %ERRORLEVEL%
