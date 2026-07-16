@echo off
setlocal

set "SCRIPT_DIR=%~dp0"
for %%I in ("%SCRIPT_DIR%..\..") do set "REPO_ROOT=%%~fI"

echo.
echo === Crypto Edge AI: local preview with SQLite Review Storage ===
echo Repo root: %REPO_ROOT%

if not exist "%REPO_ROOT%\tools\ui-mock\node_modules\.bin\tsx.cmd" (
  echo ERROR: ui-mock node_modules missing. Run pnpm install in tools/ui-mock.
  exit /b 1
)

if not exist "%REPO_ROOT%\tools\ui-mock\node_modules\.bin\vite.cmd" (
  echo ERROR: ui-mock node_modules missing. Run pnpm install in tools/ui-mock.
  exit /b 1
)

if not exist "%REPO_ROOT%\tools\ui-mock\.local" mkdir "%REPO_ROOT%\tools\ui-mock\.local"

echo.
echo === Starting API on port 5177 with SQLite Review Storage ===
start "Crypto Edge API 5177 SQLite" cmd /k "cd /d ""%REPO_ROOT%\tools\ui-mock"" && set ""CRYPTO_EDGE_RUNTIME_MODE=DEVELOPMENT_DEMO"" && set ""CRYPTO_EDGE_REVIEW_STORAGE_PROVIDER=sqlite"" && set ""CRYPTO_EDGE_REVIEW_SQLITE_PATH=%REPO_ROOT%\tools\ui-mock\.local\review-session.sqlite"" && call node_modules\.bin\tsx.cmd server\scannerApiServer.ts"

echo.
echo === Starting frontend on port 5173 ===
start "Crypto Edge UI 5173" cmd /k "cd /d ""%REPO_ROOT%\tools\ui-mock"" && set ""CRYPTO_EDGE_RUNTIME_MODE=DEVELOPMENT_DEMO"" && call node_modules\.bin\vite.cmd --host 127.0.0.1 --port 5173"

echo.
echo Open http://127.0.0.1:5173
exit /b 0
