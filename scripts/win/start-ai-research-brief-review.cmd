@echo off
setlocal EnableExtensions

set "SCRIPT_DIR=%~dp0"
for %%I in ("%SCRIPT_DIR%..\..") do set "REPO_ROOT=%%~fI"
set "RENDER_PREVIEW=0"
set "SHOW_MOBILE_GUIDE=0"

:parse_args
if "%~1"=="" goto args_done
if /i "%~1"=="--render-preview" (
  set "RENDER_PREVIEW=1"
) else if /i "%~1"=="--mobile-guide" (
  set "SHOW_MOBILE_GUIDE=1"
) else (
  echo ERROR: Nieznany parametr: %~1
  echo Uzycie: scripts\win\start-ai-research-brief-review.cmd [--render-preview] [--mobile-guide]
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
set "CRYPTO_EDGE_AI_RESEARCH_PROVIDER=DISABLED"
set "CRYPTO_EDGE_AI_RESEARCH_RENDER_PREVIEW="
set "CRYPTO_EDGE_AI_RESEARCH_SQLITE_PATH=%TEMP%\crypto-edge-ai-research-review-%RANDOM%-%RANDOM%.sqlite"
set "CRYPTO_EDGE_FEEDBACK_SQLITE_PATH=%TEMP%\crypto-edge-ai-research-feedback-%RANDOM%-%RANDOM%.sqlite"
if "%RENDER_PREVIEW%"=="1" set "CRYPTO_EDGE_AI_RESEARCH_RENDER_PREVIEW=1"

echo.
echo === Crypto Edge AI: AI.1 Research Brief owner review ===
echo Runtime: INTERNAL_BETA
echo AI provider: DISABLED
echo OpenAI calls: 0
echo Collector calls: 0
echo Canonical store mutations: 0 podczas render preview
echo Review stores: isolated temporary SQLite paths
echo.

if "%RENDER_PREVIEW%"=="1" (
  echo Render preview: ON
  echo Uzywa najnowszego rzeczywistego lokalnego tokena i zapisanych danych.
  echo Fixture fallback: DISABLED
  echo AI: DISABLED
  echo Zapis AI store: DISABLED
  echo Badge: Podglad formatu - bez wywolania AI
  echo.
  echo Visual QA states ^(dopisz query przed hashem^):
  echo   ?ai_review_state=absent#candidate-detail
  echo   ?ai_review_state=generating#candidate-detail
  echo   ?ai_review_state=stale#candidate-detail
  echo   ?ai_review_state=provider-disabled#candidate-detail
  echo   ?ai_review_state=error#candidate-detail
) else (
  echo Render preview: OFF
  echo Candidate Detail pokaze spokojny stan AI provider niedostepny.
)

if "%SHOW_MOBILE_GUIDE%"=="1" (
  echo.
  echo Mobile guide:
  echo   Ustaw viewport 390 x 844.
  echo   Sprawdz KPI 2 kolumny, pionowa mape dzialan i risk matrix jako liste.
  echo   Sprawdz minimum 44 px, dlugie adresy, zrodla i brak overflow.
)

echo.
echo Launcher nie uruchamia OpenAI, providerow danych, collectora, bootstrap --apply ani operacji ownera.
call "%REPO_ROOT%\scripts\win\start-product-radar-review.cmd" --candidate-detail
exit /b %ERRORLEVEL%
