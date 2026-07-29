@echo off
setlocal EnableExtensions

set "SCRIPT_DIR=%~dp0"
for %%I in ("%SCRIPT_DIR%..\..") do set "REPO_ROOT=%%~fI"
set "REVIEW_ID=%RANDOM%-%RANDOM%"

set "ALLOW_LIVE_PROVIDER_CALLS="
set "CRYPTO_EDGE_ALLOW_LIVE_SOURCE_CHECK="
set "CRYPTO_EDGE_AUTOMATION_ENABLED="
set "CRYPTO_EDGE_AI_WORKER_ENABLED="
set "CRYPTO_EDGE_AI_RESEARCH_PROVIDER=DISABLED"
set "CRYPTO_EDGE_AI_RESEARCH_RENDER_PREVIEW=1"
set "CRYPTO_EDGE_AI_REVIEW_PROVIDER=DETERMINISTIC_MOCK"
set "CRYPTO_EDGE_RUNTIME_MODE=INTERNAL_BETA"
set "CRYPTO_EDGE_OWNER_OPERATIONS_MODE=DISABLED"
set "CRYPTO_EDGE_FEEDBACK_SUBMISSION_ENABLED=0"
set "CRYPTO_EDGE_AI_QUEUE_SQLITE_PATH=%TEMP%\crypto-edge-ai3-queue-review-%REVIEW_ID%.sqlite"
set "CRYPTO_EDGE_AI_RESEARCH_SQLITE_PATH=%TEMP%\crypto-edge-ai3-legacy-review-%REVIEW_ID%.sqlite"
set "CRYPTO_EDGE_FEEDBACK_SQLITE_PATH=%TEMP%\crypto-edge-ai3-feedback-review-%REVIEW_ID%.sqlite"
set "OPENAI_API_KEY="

echo.
echo === Crypto Edge AI: AI.3 shared queue owner review ===
echo Runtime: INTERNAL_BETA
echo Identity: latest real local token from the validated snapshot
echo Queue store: isolated temporary SQLite
echo Review provider: DETERMINISTIC_MOCK
echo OpenAI calls: 0
echo Data provider calls: 0
echo Collector calls: 0
echo Canonical AI store mutations: 0
echo Feedback mutations: 0
echo Follow-up mutations: 0
echo Established and lifecycle mutations: 0
echo Task Scheduler changes: 0
echo.
echo Review states: ABSENT, QUEUED, PROCESSING, READY, STALE, FAILED, SUSPENDED, COOLDOWN
echo Each state uses the same real token identity and changes only the rendered queue state.
echo.

call "%REPO_ROOT%\scripts\win\start-product-radar-review.cmd" --candidate-detail
if errorlevel 1 exit /b %ERRORLEVEL%

for %%S in (absent queued processing stale failed suspended cooldown) do (
  start "" "http://127.0.0.1:5173/?ai_review_state=%%S#candidate-detail"
)

echo READY is shown in the first Candidate Detail tab.
echo Close the review with: scripts\win\kill-local-ports.cmd
exit /b 0
