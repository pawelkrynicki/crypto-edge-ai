@echo off
setlocal EnableExtensions

set "SCRIPT_DIR=%~dp0"
for %%I in ("%SCRIPT_DIR%..\..") do set "REPO_ROOT=%%~fI"
set "REVIEW_VIEW=radar"
set "SHOW_MOBILE_GUIDE=0"

:parse_args
if "%~1"=="" goto args_done
if /i "%~1"=="--radar" set "REVIEW_VIEW=radar"
if /i "%~1"=="--detail" set "REVIEW_VIEW=detail"
if /i "%~1"=="--ui2" set "REVIEW_VIEW=ui2"
if /i "%~1"=="--mobile-guide" set "SHOW_MOBILE_GUIDE=1"
if /i not "%~1"=="--radar" if /i not "%~1"=="--detail" if /i not "%~1"=="--ui2" if /i not "%~1"=="--mobile-guide" (
  echo ERROR: Nieznany parametr: %~1
  echo Uzycie: scripts\win\start-premium-ui-review.cmd [--radar] [--detail] [--ui2] [--mobile-guide]
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
echo === Crypto Edge AI: Premium UI owner review ===
echo Runtime: INTERNAL_BETA
echo Owner operations: DISABLED
echo Dane: biezace lokalne snapshoty i store'y, bez fallbacku demonstracyjnego

if "%SHOW_MOBILE_GUIDE%"=="1" (
  echo.
  echo Zalecane viewporty kontroli wizualnej:
  echo   Desktop: 1440 x 900 oraz 1280 x 800
  echo   Tablet:  1024 x 768 oraz 768 x 1024
  echo   Mobile:  390 x 844
)

if /i "%REVIEW_VIEW%"=="detail" (
  call "%REPO_ROOT%\scripts\win\start-product-radar-review.cmd" --candidate-detail
  exit /b %ERRORLEVEL%
)

if /i "%REVIEW_VIEW%"=="ui2" (
  echo.
  echo Kolejnosc owner review UI.2:
  echo   1. Control Center
  echo   2. Reports
  echo   3. Feedback
  echo   4. Owner Feedback Inbox
  echo   5. Verification
  echo   6. Methodology
  echo.
  echo Nie wysylaj feedbacku i nie uruchamiaj operacji ownera podczas przegladu wizualnego.
  call "%REPO_ROOT%\scripts\win\start-product-radar-review.cmd" --control-center --owner-operations-review
  exit /b %ERRORLEVEL%
)

call "%REPO_ROOT%\scripts\win\start-product-radar-review.cmd"
exit /b %ERRORLEVEL%
