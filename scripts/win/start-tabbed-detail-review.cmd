@echo off
setlocal EnableExtensions EnableDelayedExpansion

set "SCRIPT_DIR=%~dp0"
for %%I in ("%SCRIPT_DIR%..\..") do set "REPO_ROOT=%%~fI"
set "UI_DIR=%REPO_ROOT%\tools\ui-mock"

set "ALLOW_LIVE_PROVIDER_CALLS="
set "CRYPTO_EDGE_ALLOW_LIVE_SOURCE_CHECK="
set "CRYPTO_EDGE_AUTOMATION_ENABLED="
set "CRYPTO_EDGE_AI_WORKER_ENABLED="
set "CRYPTO_EDGE_AI_RESEARCH_PROVIDER=DISABLED"
set "CRYPTO_EDGE_AI_RESEARCH_MODEL="
set "CRYPTO_EDGE_AI_RESEARCH_LIVE_CALL_BUDGET="
set "CRYPTO_EDGE_RUNTIME_MODE=INTERNAL_BETA"
set "CRYPTO_EDGE_OWNER_OPERATIONS_MODE=DISABLED"
set "CRYPTO_EDGE_FEEDBACK_SUBMISSION_ENABLED=0"
set "OPENAI_API_KEY="

echo.
echo === Crypto Edge AI: tabbed token detail owner review ===
echo Runtime: INTERNAL_BETA
echo Snapshot: current validated real snapshot
echo Identity: supported chain + contract_address from that snapshot
echo Initial tab: summary
echo Browser tabs: exactly 1
echo OpenAI calls: 0
echo Data provider calls: 0
echo Collector calls: 0
echo AI worker calls: 0
echo Follow-up mutations: 0
echo Established and lifecycle mutations: 0
echo Feedback mutations: 0
echo Task Scheduler changes: 0

if not exist "%UI_DIR%\scripts\resolveTabbedDetailReviewUrl.ts" (
  echo ERROR: Brak resolvera URL owner review.
  exit /b 1
)

call "%REPO_ROOT%\scripts\win\start-product-radar-review.cmd" --candidate-detail --no-open
if errorlevel 1 exit /b %ERRORLEVEL%

set "REVIEW_URL="
pushd "%UI_DIR%"
for /f "usebackq delims=" %%U in (`call node --import tsx scripts\resolveTabbedDetailReviewUrl.ts`) do set "REVIEW_URL=%%U"
popd

if not defined REVIEW_URL (
  echo ERROR: Aktualny snapshot nie zawiera obslugiwanej tozsamosci tokena.
  call "%REPO_ROOT%\scripts\win\kill-local-ports.cmd"
  exit /b 1
)

echo Review URL: !REVIEW_URL!
start "" "!REVIEW_URL!"
echo Zamkniecie review: scripts\win\kill-local-ports.cmd
exit /b 0
