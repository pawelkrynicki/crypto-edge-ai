@echo off
setlocal EnableExtensions EnableDelayedExpansion

set "SCRIPT_DIR=%~dp0"
for %%I in ("%SCRIPT_DIR%..\..") do set "REPO_ROOT=%%~fI"
set "REVIEW_STORE=%REPO_ROOT%\tools\ui-mock\.local\ai-research-openai-review.sqlite"
set "FAILED=0"

for %%F in ("%REVIEW_STORE%" "%REVIEW_STORE%-wal" "%REVIEW_STORE%-shm") do (
  if exist "%%~fF" (
    del /f /q "%%~fF" 2>nul
    if exist "%%~fF" set "FAILED=1"
  )
)

if "!FAILED!"=="1" (
  echo ERROR: Nie mozna wyczyscic izolowanego AI review store.
  echo Zamknij okna runtime uruchomione przez launcher i ponow komende.
  echo Nie zatrzymano zadnego procesu automatycznie.
  exit /b 1
)

echo AI.2 review store wyczyszczony idempotentnie.
echo Usunieto wylacznie review SQLite oraz jego pliki WAL i SHM, jezeli istnialy.
exit /b 0
