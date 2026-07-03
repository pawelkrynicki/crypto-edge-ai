@echo off
setlocal

set "SCRIPT_DIR=%~dp0"
for %%I in ("%SCRIPT_DIR%..\..") do set "REPO_ROOT=%%~fI"

echo.
echo === Crypto Edge AI: production UI mock build ===
echo Repo root: %REPO_ROOT%

cd /d "%REPO_ROOT%" || exit /b 1
cd /d "%REPO_ROOT%\tools\ui-mock"
if errorlevel 1 exit /b 1

if not exist "package.json" (
  echo ERROR: tools\ui-mock\package.json not found.
  exit /b 1
)

if not exist "node_modules\.bin\tsc.cmd" (
  echo ERROR: ui-mock node_modules missing. Run pnpm install in tools/ui-mock.
  exit /b 1
)

if not exist "node_modules\.bin\vite.cmd" (
  echo ERROR: ui-mock node_modules missing. Run pnpm install in tools/ui-mock.
  exit /b 1
)

echo.
echo === Running package.json build ===
call npm run build
if errorlevel 1 exit /b %ERRORLEVEL%

if not exist "dist\index.html" (
  echo ERROR: production build finished, but dist\index.html was not found.
  exit /b 1
)

echo.
echo OK: production UI preview build gotowy.
echo Dist: %REPO_ROOT%\tools\ui-mock\dist
exit /b 0
