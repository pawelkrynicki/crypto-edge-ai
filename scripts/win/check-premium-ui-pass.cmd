@echo off
setlocal EnableExtensions

set "SCRIPT_DIR=%~dp0"
for %%I in ("%SCRIPT_DIR%..\..") do set "REPO_ROOT=%%~fI"
set "UI_DIR=%REPO_ROOT%\tools\ui-mock"
set "ALLOW_LIVE_PROVIDER_CALLS="
set "CRYPTO_EDGE_ALLOW_LIVE_SOURCE_CHECK="
set "CRYPTO_EDGE_AUTOMATION_ENABLED="
set "CRYPTO_EDGE_OWNER_OPERATIONS_MODE=DISABLED"
set "CRYPTO_EDGE_RUNTIME_MODE=INTERNAL_BETA"
set "CRYPTO_EDGE_FEEDBACK_SQLITE_PATH=%TEMP%\crypto-edge-premium-ui-%RANDOM%-%RANDOM%.sqlite"
set "CRYPTO_EDGE_AI_RESEARCH_PROVIDER=DISABLED"
set "CRYPTO_EDGE_AI_RESEARCH_MODEL="
set "CRYPTO_EDGE_AI_RESEARCH_LIVE_CALL_BUDGET="
set "CRYPTO_EDGE_AI_RESEARCH_SQLITE_PATH=%TEMP%\crypto-edge-ai-premium-ui-%RANDOM%-%RANDOM%.sqlite"
set "OPENAI_API_KEY="

echo.
echo === Crypto Edge AI: Premium UI.1 + UI.2 offline gate ===

cd /d "%UI_DIR%"
if errorlevel 1 exit /b 1

if not exist "node_modules\.bin\tsx.cmd" (
  echo ERROR: Brak zaleznosci tools\ui-mock.
  exit /b 1
)

echo.
echo === AI.1 research brief contracts ===
call pnpm run test:ai1
if errorlevel 1 exit /b %ERRORLEVEL%

echo.
echo === AI.2 controlled OpenAI validation contracts ^(offline stubs only^) ===
call pnpm run test:ai2
if errorlevel 1 exit /b %ERRORLEVEL%

echo.
echo === UX.1 interaction affordance contracts ===
call pnpm run test:ux1
if errorlevel 1 exit /b %ERRORLEVEL%

echo.
echo === Premium UI contracts ===
call pnpm run test:premium-ui
if errorlevel 1 exit /b %ERRORLEVEL%

echo.
echo === Premium UI.2 contracts ===
call pnpm run test:premium-ui2
if errorlevel 1 exit /b %ERRORLEVEL%

echo.
echo === FLOW.1 visible token lifecycle contracts ===
call pnpm run test:flow1
if errorlevel 1 exit /b %ERRORLEVEL%

echo.
echo === Control Center, Reports and Feedback ===
call pnpm run test:control-center
if errorlevel 1 exit /b %ERRORLEVEL%
call pnpm run test:reports
if errorlevel 1 exit /b %ERRORLEVEL%
call pnpm run test:feedback
if errorlevel 1 exit /b %ERRORLEVEL%

echo.
echo === Product Radar and Candidate Detail contracts ===
call pnpm run test:product-radar
if errorlevel 1 exit /b %ERRORLEVEL%

echo.
echo === UI typecheck ===
call node_modules\.bin\tsc.cmd -b
if errorlevel 1 exit /b %ERRORLEVEL%

echo.
echo === Fixture-free INTERNAL_BETA build ===
call pnpm run build:internal-beta
if errorlevel 1 exit /b %ERRORLEVEL%

echo.
echo PREMIUM UI PASS CHECK OK
if exist "%CRYPTO_EDGE_FEEDBACK_SQLITE_PATH%" del /q "%CRYPTO_EDGE_FEEDBACK_SQLITE_PATH%"
if exist "%CRYPTO_EDGE_FEEDBACK_SQLITE_PATH%-wal" del /q "%CRYPTO_EDGE_FEEDBACK_SQLITE_PATH%-wal"
if exist "%CRYPTO_EDGE_FEEDBACK_SQLITE_PATH%-shm" del /q "%CRYPTO_EDGE_FEEDBACK_SQLITE_PATH%-shm"
if exist "%CRYPTO_EDGE_AI_RESEARCH_SQLITE_PATH%" del /q "%CRYPTO_EDGE_AI_RESEARCH_SQLITE_PATH%"
if exist "%CRYPTO_EDGE_AI_RESEARCH_SQLITE_PATH%-wal" del /q "%CRYPTO_EDGE_AI_RESEARCH_SQLITE_PATH%-wal"
if exist "%CRYPTO_EDGE_AI_RESEARCH_SQLITE_PATH%-shm" del /q "%CRYPTO_EDGE_AI_RESEARCH_SQLITE_PATH%-shm"
exit /b 0
