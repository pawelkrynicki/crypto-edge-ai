@echo off
setlocal

set "SCRIPT_DIR=%~dp0"
call "%SCRIPT_DIR%serve-ui-preview.cmd" trusted-preview
exit /b %errorlevel%
