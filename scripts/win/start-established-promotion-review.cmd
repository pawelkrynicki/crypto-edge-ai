@echo off
setlocal EnableExtensions

set "SCRIPT_DIR=%~dp0"
echo === Crypto Edge AI: Established promotion owner review ===
echo Tryb: INTERNAL_BETA + REVIEW_SAFE
echo Zakres: Candidate Detail, status i read-only preview
echo Zapis do Established pozostaje zablokowany.
echo Live provider calls, collector i automatyzacja pozostaja wylaczone.

call "%SCRIPT_DIR%start-product-radar-review.cmd" --candidate-detail --established-promotion-review %*
exit /b %ERRORLEVEL%
