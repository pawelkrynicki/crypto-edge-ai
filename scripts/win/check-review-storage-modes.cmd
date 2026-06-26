@echo off
setlocal

set "SCRIPT_DIR=%~dp0"
for %%I in ("%SCRIPT_DIR%..\..") do set "REPO_ROOT=%%~fI"

echo.
echo === Crypto Edge AI: review storage modes check ===
echo Repo root: %REPO_ROOT%

echo.
echo === Check file-backed Review Storage ===
call "%REPO_ROOT%\scripts\win\check-review-storage-file.cmd"
if errorlevel 1 exit /b %ERRORLEVEL%

echo.
echo === Check SQLite Review Storage ===
call "%REPO_ROOT%\scripts\win\check-review-storage-sqlite.cmd"
if errorlevel 1 exit /b %ERRORLEVEL%

echo.
echo REVIEW STORAGE MODES CHECK OK
exit /b 0
