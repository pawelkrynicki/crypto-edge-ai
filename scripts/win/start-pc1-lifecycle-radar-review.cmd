@echo off
setlocal EnableExtensions EnableDelayedExpansion

set "SCRIPT_DIR=%~dp0"
for %%I in ("%SCRIPT_DIR%..\..") do set "REPO_ROOT=%%~fI"
set "UI_DIR=%REPO_ROOT%\tools\ui-mock"
set "DATA_POC_DIR=%REPO_ROOT%\tools\data-poc"
set "REVIEW_ID=%RANDOM%-%RANDOM%-%RANDOM%"
set "REVIEW_ROOT=%TEMP%\crypto-edge-pc1-review-%REVIEW_ID%"
set "REVIEW_DATA_POC=%REVIEW_ROOT%\data-poc"
set "REVIEW_UI=%REVIEW_ROOT%\ui-mock"
set "SCANNER_API_PORT=5277"
set "UI_PORT=5273"

for %%P in (%UI_PORT% %SCANNER_API_PORT%) do (
  netstat -ano | findstr /R /C:":%%P .*LISTENING" >nul
  if not errorlevel 1 (
    echo ERROR: Port %%P jest już zajęty. Zamknij poprzedni isolated review runtime i uruchom launcher ponownie.
    exit /b 1
  )
)

if not exist "%UI_DIR%\node_modules\.bin\tsx.cmd" (
  echo ERROR: Brak tools\ui-mock\node_modules. Uruchom pnpm install w tools\ui-mock.
  exit /b 1
)
if not exist "%UI_DIR%\node_modules\.bin\vite.cmd" (
  echo ERROR: Brak lokalnego Vite w tools\ui-mock\node_modules.
  exit /b 1
)

set "CRYPTO_EDGE_RUNTIME_MODE=INTERNAL_BETA"
set "CRYPTO_EDGE_OWNER_OPERATIONS_MODE=ENABLED"
set "CRYPTO_EDGE_PC1_REVIEW_DEFAULT_ACTOR=CAMP_USER"
set "CRYPTO_EDGE_PC1_REVIEW_MODE=1"
set "CRYPTO_EDGE_PC1_REVIEW_ROOT=%REVIEW_DATA_POC%"
set "CRYPTO_EDGE_PC1_REVIEW_AUTO_PUBLICATION_DELAY_MS=60000"
set "CRYPTO_EDGE_AUTOMATION_ENABLED=1"
set "ALLOW_LIVE_PROVIDER_CALLS=0"
set "CRYPTO_EDGE_AI_RESEARCH_PROVIDER=DISABLED"
set "CRYPTO_EDGE_AI_RESEARCH_RENDER_PREVIEW=0"
set "CRYPTO_EDGE_FEEDBACK_SUBMISSION_ENABLED=0"
set "OPENAI_API_KEY="
set "CRYPTO_EDGE_AUTOMATION_DIRECTORY_PATH=%REVIEW_DATA_POC%\.local\automation"
set "CRYPTO_EDGE_FOLLOW_UP_STORE_PATH=%REVIEW_DATA_POC%\.local\follow-up\store.json"
set "CRYPTO_EDGE_ESTABLISHED_UNIVERSE_STORE_PATH=%REVIEW_DATA_POC%\.local\established-universe\store.json"
set "CRYPTO_EDGE_ESTABLISHED_UNIVERSE_CONFIG_PATH=%REVIEW_DATA_POC%\config\established_address_universe_v1.json"
set "CRYPTO_EDGE_NEW_INBOX_STORE_PATH=%REVIEW_DATA_POC%\.local\lifecycle\new-inbox.json"
set "CRYPTO_EDGE_LIFECYCLE_AUDIT_STORE_PATH=%REVIEW_DATA_POC%\.local\lifecycle\audit.json"
set "CRYPTO_EDGE_LIFECYCLE_OPERATION_JOURNAL_PATH=%REVIEW_DATA_POC%\.local\lifecycle\operation-journal.json"
set "CRYPTO_EDGE_LIFECYCLE_CYCLE_RECEIPT_PATH=%REVIEW_DATA_POC%\.local\lifecycle\cycle-receipts.json"
set "CRYPTO_EDGE_REVIEW_OUTPUT_DIR=%REVIEW_DATA_POC%\output"
set "CRYPTO_EDGE_REVIEW_SOURCE_DATA_POC_DIR=%DATA_POC_DIR%"
set "CRYPTO_EDGE_REVIEW_SOURCE_UI_DIR=%UI_DIR%"
set "CRYPTO_EDGE_REVIEW_DATA_POC_DIR=%REVIEW_DATA_POC%"
set "CRYPTO_EDGE_REVIEW_UI_DIR=%REVIEW_UI%"
set "CRYPTO_EDGE_USER_WORKSPACE_SQLITE_PATH=%REVIEW_UI%\user-workspace.sqlite"
set "CRYPTO_EDGE_FEEDBACK_SQLITE_PATH=%REVIEW_UI%\tester-feedback.sqlite"
set "CRYPTO_EDGE_AI_QUEUE_SQLITE_PATH=%REVIEW_UI%\ai-analysis-queue.sqlite"

echo.
echo === Crypto Edge AI: PC.1 Lifecycle / Private Radar review ===
echo Runtime: INTERNAL_BETA, isolated review workspace
echo Workspace: %REVIEW_ROOT%
echo Review auto-update publication: 60 seconds
echo Provider calls: 0
echo OpenAI calls: 0
echo Honeypot.is calls: 0
echo Canonical store mutations: 0
echo.

call pnpm --dir "%UI_DIR%" run build:internal-beta
if errorlevel 1 exit /b %ERRORLEVEL%

call "%UI_DIR%\node_modules\.bin\tsx.cmd" "%DATA_POC_DIR%\src\preparePc1LifecycleReview.ts"
if errorlevel 1 goto :bootstrap_failed

call "%UI_DIR%\node_modules\.bin\tsx.cmd" "%DATA_POC_DIR%\src\bootstrapPc1LifecycleReview.ts"
if errorlevel 1 goto :bootstrap_failed

echo Starting one isolated review runtime on ports %UI_PORT% / %SCANNER_API_PORT%.
start "Crypto Edge PC.1 Scanner API" cmd /k "cd /d ""%UI_DIR%"" && call node_modules\.bin\tsx.cmd server\scannerApiServer.ts"
start "Crypto Edge PC.1 UI" cmd /k "cd /d ""%UI_DIR%"" && call node_modules\.bin\vite.cmd --mode internal-beta --host 127.0.0.1 --port %UI_PORT%"
start "" "http://127.0.0.1:%UI_PORT%/?pc1_review=1#candidate-results"
exit /b 0

:bootstrap_failed
echo ERROR: PC.1 isolated review bootstrap failed.
exit /b 1
