@echo off
setlocal EnableExtensions EnableDelayedExpansion

set "SCRIPT_DIR=%~dp0"
for %%I in ("%SCRIPT_DIR%..\..") do set "REPO_ROOT=%%~fI"
set "LIVE_ONE=0"

:parse_args
if "%~1"=="" goto args_done
if /i "%~1"=="--live-one" (
  set "LIVE_ONE=1"
) else (
  echo ERROR: Nieznany parametr: %~1
  echo Uzycie: scripts\win\start-ai-research-openai-review.cmd [--live-one]
  exit /b 1
)
shift
goto parse_args

:args_done
set "REVIEW_STORE=%REPO_ROOT%\tools\ui-mock\.local\ai-research-openai-review.sqlite"
set "ALLOW_LIVE_PROVIDER_CALLS="
set "CRYPTO_EDGE_ALLOW_LIVE_SOURCE_CHECK="
set "CRYPTO_EDGE_AUTOMATION_ENABLED="
set "CRYPTO_EDGE_OWNER_OPERATIONS_MODE=DISABLED"
set "CRYPTO_EDGE_RUNTIME_MODE=INTERNAL_BETA"
set "CRYPTO_EDGE_AI_RESEARCH_PROVIDER=DISABLED"
set "CRYPTO_EDGE_AI_RESEARCH_RENDER_PREVIEW="
set "CRYPTO_EDGE_AI_RESEARCH_LIVE_CALL_BUDGET="
set "CRYPTO_EDGE_AI_RESEARCH_SQLITE_PATH=%REVIEW_STORE%"
set "CRYPTO_EDGE_FEEDBACK_SUBMISSION_ENABLED=0"
set "CRYPTO_EDGE_FEEDBACK_SQLITE_PATH=%TEMP%\crypto-edge-ai-openai-review-feedback.sqlite"

if "%LIVE_ONE%"=="1" goto configure_live_one

set "OPENAI_API_KEY="
echo.
echo === Crypto Edge AI: AI.2 OpenAI owner review ===
echo Tryb: INTERNAL_BETA
echo Provider: DISABLED
echo OpenAI calls: 0
echo Collector calls: 0
echo AI review store: %REVIEW_STORE%
echo.
echo Launcher uruchamia Candidate Detail bez requestu do OpenAI.
echo Do przyszlego trybu --live-one wymagane sa zmienne OPENAI_API_KEY
echo oraz CRYPTO_EDGE_AI_RESEARCH_MODEL. Klucz nie jest odczytywany ani drukowany.
echo.
call "%REPO_ROOT%\scripts\win\start-product-radar-review.cmd" --candidate-detail
exit /b %ERRORLEVEL%

:configure_live_one
if not defined OPENAI_API_KEY (
  echo ERROR: Brak OPENAI_API_KEY. Nie wykonano requestu.
  exit /b 1
)
if not defined CRYPTO_EDGE_AI_RESEARCH_MODEL (
  echo ERROR: Brak CRYPTO_EDGE_AI_RESEARCH_MODEL. Nie wykonano requestu.
  exit /b 1
)
set "REQUESTED_TIMEOUT=%CRYPTO_EDGE_AI_RESEARCH_TIMEOUT_MS%"
set "CRYPTO_EDGE_AI_RESEARCH_TIMEOUT_MS=30000"
for /f "delims=" %%I in ('powershell.exe -NoProfile -Command "$parsed = 0; if ([int]::TryParse($env:REQUESTED_TIMEOUT, [ref]$parsed) -and $parsed -ge 1000 -and $parsed -le 120000) { $parsed } else { 30000 }"') do set "CRYPTO_EDGE_AI_RESEARCH_TIMEOUT_MS=%%I"
set "REQUESTED_TIMEOUT="
set "CRYPTO_EDGE_AI_RESEARCH_MAX_CONCURRENCY=1"
set "CRYPTO_EDGE_AI_RESEARCH_PROVIDER=OPENAI"
set "CRYPTO_EDGE_AI_RESEARCH_LIVE_CALL_BUDGET=1"

echo.
echo === Crypto Edge AI: AI.2 OpenAI owner review ===
echo Tryb: INTERNAL_BETA
echo Provider: OPENAI
echo Model: !CRYPTO_EDGE_AI_RESEARCH_MODEL!
echo Limit live call: 1
echo Timeout: !CRYPTO_EDGE_AI_RESEARCH_TIMEOUT_MS! ms
echo Max concurrency: !CRYPTO_EDGE_AI_RESEARCH_MAX_CONCURRENCY!
echo AI review store: %REVIEW_STORE%
echo.
echo UWAGA: jawne klikniecie "Wygeneruj analize AI" moze wygenerowac koszt API.
echo Sam start launchera nie wykonuje requestu. Retry SDK jest wylaczony.
echo Collector calls: 0. Owner operations: DISABLED.
echo.
call "%REPO_ROOT%\scripts\win\start-product-radar-review.cmd" --candidate-detail
exit /b %ERRORLEVEL%
