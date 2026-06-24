@echo off
setlocal EnableDelayedExpansion

echo.
echo === Crypto Edge AI: free local preview ports ===

set "KILLED_PIDS= "

for %%P in (5173 5177) do (
  echo.
  echo === Checking port %%P ===
  set "PORT_FOUND=0"
  for /f "tokens=5" %%A in ('netstat -ano ^| findstr /R /C:":%%P .*LISTENING"') do (
    set "PORT_FOUND=1"
    call :KillPid %%A %%P
    if errorlevel 1 exit /b 1
  )
  if "!PORT_FOUND!"=="0" echo No listener found on port %%P
)

echo.
echo LOCAL PORTS CLEANED
exit /b 0

:KillPid
echo !KILLED_PIDS! | findstr /C:" %~1 " >nul
if not errorlevel 1 (
  echo PID %~1 on port %~2 was already handled
  exit /b 0
)

set "KILLED_PIDS=!KILLED_PIDS!%~1 "
echo Found PID %~1 on port %~2
taskkill /PID %~1 /F
if errorlevel 1 exit /b 1
exit /b 0
