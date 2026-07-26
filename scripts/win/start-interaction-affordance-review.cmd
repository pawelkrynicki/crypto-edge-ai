@echo off
setlocal EnableExtensions

set "SCRIPT_DIR=%~dp0"
for %%I in ("%SCRIPT_DIR%..\..") do set "REPO_ROOT=%%~fI"
set "REVIEW_VIEW=radar"
set "SHOW_MOBILE_GUIDE=0"

:parse_args
if "%~1"=="" goto args_done
if /i "%~1"=="--detail" (
  set "REVIEW_VIEW=detail"
) else if /i "%~1"=="--feedback" (
  set "REVIEW_VIEW=feedback"
) else if /i "%~1"=="--mobile-guide" (
  set "SHOW_MOBILE_GUIDE=1"
) else (
  echo ERROR: Nieznany parametr: %~1
  echo Uzycie: scripts\win\start-interaction-affordance-review.cmd [--detail] [--feedback] [--mobile-guide]
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
echo === Crypto Edge AI: UX.1 interaction affordance review ===
echo Runtime: INTERNAL_BETA
echo Owner operations: DISABLED
echo Provider calls: DISABLED
echo.
echo Kolejnosc review:
echo   1. Radar i karta tokena.
echo   2. Candidate Detail.
echo   3. Verification.
echo   4. Reports.
echo   5. Feedback.
echo   6. Owner Inbox.
echo   7. Methodology.
echo   8. Control Center.
echo   9. Mobile 390 px.
echo  10. Keyboard-only.
echo.
echo Nie wysylaj feedbacku i nie uruchamiaj operacji ownera podczas review.
echo Launcher nie uruchamia collectora, providerow, bootstrap --apply ani mutacji danych.

if "%SHOW_MOBILE_GUIDE%"=="1" (
  echo.
  echo Mobile guide:
  echo   Ustaw viewport 390 x 844.
  echo   Sprawdz hit area 44 px, kolejnosc primary/secondary i brak overflow.
  echo   Powtorz Radar, Candidate Detail, Feedback, Verification i Reports.
)

if /i "%REVIEW_VIEW%"=="detail" (
  call "%REPO_ROOT%\scripts\win\start-product-radar-review.cmd" --candidate-detail
  exit /b %ERRORLEVEL%
)

if /i "%REVIEW_VIEW%"=="feedback" (
  call "%REPO_ROOT%\scripts\win\start-product-radar-review.cmd" --feedback
  exit /b %ERRORLEVEL%
)

call "%REPO_ROOT%\scripts\win\start-product-radar-review.cmd"
exit /b %ERRORLEVEL%
