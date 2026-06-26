@echo off
setlocal

set "SCRIPT_DIR=%~dp0"
for %%I in ("%SCRIPT_DIR%..\..") do set "REPO_ROOT=%%~fI"

echo.
echo === Crypto Edge AI: local workflow smoke check ===
echo Repo root: %REPO_ROOT%

cd /d "%REPO_ROOT%\tools\ui-mock"
if errorlevel 1 exit /b 1

if not exist "node_modules\.bin\tsx.cmd" (
  echo ERROR: ui-mock node_modules missing. Run pnpm install in tools/ui-mock.
  exit /b 1
)

echo.
echo === Run local end-to-end workflow smoke ===
call node_modules\.bin\tsx.cmd scripts\localWorkflowSmoke.ts
if errorlevel 1 exit /b %ERRORLEVEL%

echo.
echo LOCAL WORKFLOW SMOKE CHECK OK
exit /b 0
