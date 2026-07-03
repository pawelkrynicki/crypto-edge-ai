@echo off
setlocal

set "SCRIPT_DIR=%~dp0"
call "%SCRIPT_DIR%serve-ui-preview.cmd" feedback-notes
exit /b %errorlevel%
