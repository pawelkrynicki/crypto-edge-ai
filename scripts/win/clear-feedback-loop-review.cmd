@echo off
setlocal EnableExtensions

set "SCRIPT_DIR=%~dp0"
for %%I in ("%SCRIPT_DIR%..\..") do set "REPO_ROOT=%%~fI"
set "REVIEW_STORE=%REPO_ROOT%\tools\ui-mock\.local\feedback-loop-review.sqlite"

echo.
echo === Crypto Edge AI: clear isolated Feedback Loop review store ===
echo Scope: feedback-loop-review.sqlite and its SQLite WAL/SHM companions only.

if exist "%REVIEW_STORE%" del /q "%REVIEW_STORE%"
if exist "%REVIEW_STORE%-wal" del /q "%REVIEW_STORE%-wal"
if exist "%REVIEW_STORE%-shm" del /q "%REVIEW_STORE%-shm"

if exist "%REVIEW_STORE%" (
  echo ERROR: Review store is still in use. Close the Feedback Review runtime and retry.
  exit /b 1
)

echo OK: isolated Feedback Loop review store is clear. No other product data was touched.
exit /b 0
