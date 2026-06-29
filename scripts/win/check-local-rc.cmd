@echo off
setlocal

set "SCRIPT_DIR=%~dp0"
for %%I in ("%SCRIPT_DIR%..\..") do set "REPO_ROOT=%%~fI"

echo.
echo === Crypto Edge AI: local MVP RC check ===
echo Repo root: %REPO_ROOT%

cd /d "%REPO_ROOT%"
if errorlevel 1 exit /b 1

echo.
echo === Check required RC documents ===
for %%F in (
  "docs\local_mvp_runbook.md"
  "docs\pre_holiday_freeze_checklist.md"
  "docs\ux2_visual_qa_checklist.md"
) do (
  if not exist "%REPO_ROOT%\%%~F" (
    echo ERROR: missing %%~F
    exit /b 1
  )
)

echo.
echo === Check required RC scripts ===
for %%F in (
  "scripts\win\check-local-mvp.cmd"
  "scripts\win\check-analyst-report.cmd"
  "scripts\win\check-local-workflow-smoke.cmd"
  "scripts\win\check-review-storage-modes.cmd"
) do (
  if not exist "%REPO_ROOT%\%%~F" (
    echo ERROR: missing %%~F
    exit /b 1
  )
)

echo.
echo === Run local MVP check ===
call "%REPO_ROOT%\scripts\win\check-local-mvp.cmd"
if errorlevel 1 exit /b %ERRORLEVEL%

echo.
echo LOCAL MVP RC CHECK OK
exit /b 0
