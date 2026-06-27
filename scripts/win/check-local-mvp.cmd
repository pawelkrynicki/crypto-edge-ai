@echo off
setlocal

set "SCRIPT_DIR=%~dp0"
for %%I in ("%SCRIPT_DIR%..\..") do set "REPO_ROOT=%%~fI"

echo.
echo === Crypto Edge AI: local MVP check ===
echo Repo root: %REPO_ROOT%

cd /d "%REPO_ROOT%"
if errorlevel 1 exit /b 1

echo.
echo === Check data POC ===
call "%REPO_ROOT%\scripts\win\check-data-poc.cmd"
if errorlevel 1 exit /b %ERRORLEVEL%

echo.
echo === Check Review Storage modes ===
call "%REPO_ROOT%\scripts\win\check-review-storage-modes.cmd"
if errorlevel 1 exit /b %ERRORLEVEL%

echo.
echo === Check local workflow smoke ===
call "%REPO_ROOT%\scripts\win\check-local-workflow-smoke.cmd"
if errorlevel 1 exit /b %ERRORLEVEL%

echo.
echo === Check analyst report ===
call "%REPO_ROOT%\scripts\win\check-analyst-report.cmd"
if errorlevel 1 exit /b %ERRORLEVEL%

echo.
echo === Check UI mock ===
call "%REPO_ROOT%\scripts\win\check-ui-mock.cmd"
if errorlevel 1 exit /b %ERRORLEVEL%

echo.
echo LOCAL MVP CHECK OK
exit /b 0
