@echo off
setlocal EnableExtensions EnableDelayedExpansion

set "SCRIPT_DIR=%~dp0"
for %%I in ("%SCRIPT_DIR%..\..") do set "REPO_ROOT=%%~fI"
set "REVIEW_STATE=ready"
set "REVIEW_MODE=single"

:parse_args
if "%~1"=="" goto args_done
if /i "%~1"=="--state" (
  if /i not "!REVIEW_MODE!"=="single" goto conflicting_args
  if not "!REVIEW_STATE!"=="ready" goto conflicting_args
  if "%~2"=="" goto missing_state
  set "REVIEW_STATE=%~2"
  set "REVIEW_MODE=state"
  shift
  shift
  goto parse_args
)
if /i "%~1"=="--all-states" (
  if /i not "!REVIEW_MODE!"=="single" goto conflicting_args
  if not "!REVIEW_STATE!"=="ready" goto conflicting_args
  set "REVIEW_MODE=all"
  shift
  goto parse_args
)
echo ERROR: Nieznany parametr: %~1
goto usage_error

:args_done
set "STATE_VALID=0"
for %%S in (ready absent queued processing stale failed suspended cooldown) do (
  if /i "!REVIEW_STATE!"=="%%S" (
    set "STATE_VALID=1"
    set "REVIEW_STATE=%%S"
  )
)
if "!STATE_VALID!"=="0" (
  echo ERROR: Nieznany stan review: !REVIEW_STATE!
  goto usage_error
)

if "%CRYPTO_EDGE_AI3_REVIEW_PLAN_ONLY%"=="1" (
  call :review_tabs
  exit /b !ERRORLEVEL!
)

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

call "%REPO_ROOT%\scripts\win\start-product-radar-review.cmd" --candidate-detail --no-open
if errorlevel 1 exit /b %ERRORLEVEL%

call :review_tabs
if errorlevel 1 exit /b %ERRORLEVEL%

if /i "%REVIEW_MODE%"=="all" (
  echo Opened all AI.3 owner review states.
) else (
  echo Opened AI.3 owner review state: %REVIEW_STATE%.
)
echo Close the review with: scripts\win\kill-local-ports.cmd
exit /b 0

:review_tabs
if /i "%REVIEW_MODE%"=="all" (
  for %%S in (ready absent queued processing stale failed suspended cooldown) do call :review_tab %%S
  exit /b 0
)
call :review_tab "%REVIEW_STATE%"
exit /b !ERRORLEVEL!

:review_tab
if /i "%~1"=="ready" (
  set "REVIEW_URL=http://127.0.0.1:5173/#candidate-detail"
) else (
  set "REVIEW_URL=http://127.0.0.1:5173/?ai_review_state=%~1#candidate-detail"
)
if "%CRYPTO_EDGE_AI3_REVIEW_PLAN_ONLY%"=="1" (
  echo OPEN_URL=!REVIEW_URL!
) else (
  start "" "!REVIEW_URL!"
)
exit /b 0

:missing_state
echo ERROR: Parametr --state wymaga nazwy stanu.
goto usage_error

:conflicting_args
echo ERROR: Uzyj tylko jednego z parametrow --state albo --all-states.
goto usage_error

:usage_error
echo.
echo Uzycie:
echo   scripts\win\start-ai3-shared-queue-review.cmd
echo   scripts\win\start-ai3-shared-queue-review.cmd --state ^<ready^|absent^|queued^|processing^|stale^|failed^|suspended^|cooldown^>
echo   scripts\win\start-ai3-shared-queue-review.cmd --all-states
exit /b 2
