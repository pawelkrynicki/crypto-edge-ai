@echo off
setlocal

set "SCRIPT_DIR=%~dp0"
call "%SCRIPT_DIR%dev-ui-view.cmd" webinar-teaser
exit /b %errorlevel%
