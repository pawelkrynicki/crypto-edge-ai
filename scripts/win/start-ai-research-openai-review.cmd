@echo off
setlocal EnableExtensions

set "SCRIPT_DIR=%~dp0"
for %%I in ("%SCRIPT_DIR%..\..") do set "REPO_ROOT=%%~fI"

if /i "%~1"=="--live-one" (
  echo ERROR: --live-one zostal wycofany przez AI.3.
  echo Browser i publiczny POST nie wykonuja wywolan OpenAI.
  echo Provider call moze wykonac wylacznie osobny centralny worker po niezaleznej akceptacji operacyjnej.
  exit /b 1
)
if not "%~1"=="" (
  echo ERROR: Nieznany parametr: %~1
  echo Uzycie: scripts\win\start-ai-research-openai-review.cmd
  exit /b 1
)

set "REVIEW_STORE=%REPO_ROOT%\tools\ui-mock\.local\ai-research-openai-review.sqlite"
set "ALLOW_LIVE_PROVIDER_CALLS="
set "CRYPTO_EDGE_ALLOW_LIVE_SOURCE_CHECK="
set "CRYPTO_EDGE_AUTOMATION_ENABLED="
set "CRYPTO_EDGE_AI_WORKER_ENABLED="
set "CRYPTO_EDGE_OWNER_OPERATIONS_MODE=DISABLED"
set "CRYPTO_EDGE_RUNTIME_MODE=INTERNAL_BETA"
set "CRYPTO_EDGE_AI_RESEARCH_PROVIDER=DISABLED"
set "CRYPTO_EDGE_AI_RESEARCH_RENDER_PREVIEW="
set "CRYPTO_EDGE_AI_RESEARCH_LIVE_CALL_BUDGET="
set "CRYPTO_EDGE_AI_RESEARCH_SQLITE_PATH=%REVIEW_STORE%"
set "CRYPTO_EDGE_AI_QUEUE_SQLITE_PATH=%TEMP%\crypto-edge-ai2-compat-queue-%RANDOM%-%RANDOM%.sqlite"
set "CRYPTO_EDGE_FEEDBACK_SUBMISSION_ENABLED=0"
set "CRYPTO_EDGE_FEEDBACK_SQLITE_PATH=%TEMP%\crypto-edge-ai-openai-review-feedback.sqlite"
set "OPENAI_API_KEY="

echo.
echo === Crypto Edge AI: AI.2C compatibility review under AI.3 ===
echo Runtime: INTERNAL_BETA
echo Provider: DISABLED
echo OpenAI calls: 0
echo Data provider calls: 0
echo AI queue: isolated temporary SQLite
echo.
echo Launcher uruchamia Candidate Detail bez requestu do OpenAI.
echo Tryb --live-one zostal wycofany. Zgloszenia trafiaja wylacznie do centralnej kolejki AI.3.
echo.
call "%REPO_ROOT%\scripts\win\start-product-radar-review.cmd" --candidate-detail
exit /b %ERRORLEVEL%
