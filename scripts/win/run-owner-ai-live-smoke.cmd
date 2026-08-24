@echo off
setlocal EnableExtensions

set "SCRIPT_DIR=%~dp0"
for %%I in ("%SCRIPT_DIR%..\..") do set "REPO_ROOT=%%~fI"
set "UI_DIR=%REPO_ROOT%\tools\ui-mock"

if not "%~1"=="" (
  echo ERROR: Ta sciezka ownera nie przyjmuje parametrow.
  exit /b 64
)
if not defined OPENAI_API_KEY (
  echo OPENAI_API_KEY: MISSING
  exit /b 1
)
echo OPENAI_API_KEY: PRESENT

set "CRYPTO_EDGE_RUNTIME_MODE=INTERNAL_BETA"
set "CRYPTO_EDGE_PC1_REVIEW_DEFAULT_ACTOR=OWNER"
set "CRYPTO_EDGE_OWNER_LIVE_AI_SMOKE=1"
set "CRYPTO_EDGE_AI_WORKER_ENABLED=1"
set "ALLOW_LIVE_PROVIDER_CALLS=1"
set "CRYPTO_EDGE_AI_RESEARCH_PROVIDER=OPENAI"
set "CRYPTO_EDGE_AI_RESEARCH_MODEL=gpt-5-mini"
set "CRYPTO_EDGE_AI_RESEARCH_LIVE_CALL_BUDGET=1"
set "CRYPTO_EDGE_AI_WORKER_MAX_CONCURRENCY=1"
set "CRYPTO_EDGE_AI_WORKER_MAX_PER_CYCLE=1"
set "CRYPTO_EDGE_AI_WORKER_MAX_ATTEMPTS=1"

if not exist "%UI_DIR%\node_modules\.bin\tsx.cmd" (
  echo ERROR: Brak tools\ui-mock\node_modules.
  exit /b 1
)

echo === Crypto Edge AI: owner-only live AI smoke ===
echo Runtime: INTERNAL_BETA
echo Execution: central shared worker, one cycle only
echo Budget: at most one OpenAI call

cd /d "%UI_DIR%"
call node_modules\.bin\tsx.cmd server\runOwnerAIResearchLiveSmoke.ts
exit /b %ERRORLEVEL%
