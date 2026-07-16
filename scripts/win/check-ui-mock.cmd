@echo off
setlocal

set "SCRIPT_DIR=%~dp0"
for %%I in ("%SCRIPT_DIR%..\..") do set "REPO_ROOT=%%~fI"

echo.
echo === Crypto Edge AI: ui-mock check ===
echo Repo root: %REPO_ROOT%

cd /d "%REPO_ROOT%\tools\ui-mock"
if errorlevel 1 exit /b 1

if not exist "node_modules\.bin\tsx.cmd" (
  echo ERROR: ui-mock node_modules missing. Run pnpm install in tools/ui-mock.
  exit /b 1
)

echo.
echo === Run UI contract test ===
call node --import tsx tests\contract.test.ts
if errorlevel 1 exit /b %ERRORLEVEL%

echo.
echo === Run fail-closed real-data boundary tests ===
call node --import tsx --test tests\realDataBoundary.test.ts
if errorlevel 1 exit /b %ERRORLEVEL%

echo.
echo === Run UI typecheck ===
call node_modules\.bin\tsc.cmd -b
if errorlevel 1 exit /b %ERRORLEVEL%

echo.
echo === Build INTERNAL_BETA UI ===
call node_modules\.bin\vite.cmd build --mode internal-beta
if errorlevel 1 exit /b %ERRORLEVEL%

echo.
echo === Assert INTERNAL_BETA contains no demo/sample surfaces ===
call node --import tsx scripts\assertInternalBetaBuild.ts
if errorlevel 1 exit /b %ERRORLEVEL%

echo.
echo UI-MOCK CHECK OK
exit /b 0
