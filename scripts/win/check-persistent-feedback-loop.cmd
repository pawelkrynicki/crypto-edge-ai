@echo off
setlocal EnableExtensions

set "SCRIPT_DIR=%~dp0"
for %%I in ("%SCRIPT_DIR%..\..") do set "REPO_ROOT=%%~fI"
set "UI_DIR=%REPO_ROOT%\tools\ui-mock"
set "CRYPTO_EDGE_RUNTIME_MODE=INTERNAL_BETA"
set "CRYPTO_EDGE_OWNER_OPERATIONS_MODE=REVIEW_SAFE"
set "CRYPTO_EDGE_AUTOMATION_ENABLED=0"
set "ALLOW_LIVE_PROVIDER_CALLS=0"
set "CRYPTO_EDGE_ALLOW_LIVE_SOURCE_CHECK=0"
set "CRYPTO_EDGE_FEEDBACK_SQLITE_PATH=%TEMP%\crypto-edge-feedback-check-%RANDOM%-%RANDOM%.sqlite"

echo.
echo === Crypto Edge AI: Persistent Feedback Loop offline check ===
echo Temporary feedback storage only. Provider calls and collector are disabled.

cd /d "%UI_DIR%"
if errorlevel 1 exit /b 1

call node node_modules\typescript\bin\tsc -b
if errorlevel 1 goto failed

call node --import tsx --test tests\persistentFeedback.test.ts tests\persistentFeedbackUi.test.tsx
if errorlevel 1 goto failed

call node --import tsx --test tests\controlCenter.test.ts tests\productRadar.test.ts
if errorlevel 1 goto failed

call pnpm build:internal-beta
if errorlevel 1 goto failed

call :cleanup
echo.
echo PERSISTENT FEEDBACK LOOP CHECK OK - DURABLE, OWNER-BOUND, OFFLINE, ZERO PROVIDER CALLS
exit /b 0

:failed
set "CHECK_EXIT=%ERRORLEVEL%"
call :cleanup
exit /b %CHECK_EXIT%

:cleanup
if exist "%CRYPTO_EDGE_FEEDBACK_SQLITE_PATH%" del /q "%CRYPTO_EDGE_FEEDBACK_SQLITE_PATH%"
if exist "%CRYPTO_EDGE_FEEDBACK_SQLITE_PATH%-wal" del /q "%CRYPTO_EDGE_FEEDBACK_SQLITE_PATH%-wal"
if exist "%CRYPTO_EDGE_FEEDBACK_SQLITE_PATH%-shm" del /q "%CRYPTO_EDGE_FEEDBACK_SQLITE_PATH%-shm"
exit /b 0
