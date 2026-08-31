@echo off
setlocal EnableExtensions

rem Copy this release-independent launcher to C:\CryptoEdge\start-cryptoedge-product.cmd.
rem Only CRYPTO_EDGE_RELEASE_ROOT changes for a later immutable application release;
rem private CAMP state remains outside all release worktrees.
if not defined CRYPTO_EDGE_RELEASE_ROOT (
  echo ERROR: CRYPTO_EDGE_RELEASE_ROOT must point to the active extracted release.
  exit /b 1
)

if not defined CRYPTO_EDGE_VPS_STATE_ROOT set "CRYPTO_EDGE_VPS_STATE_ROOT=C:\CryptoEdge\state"
if not defined CRYPTO_EDGE_PC1_REVIEW_DEFAULT_ACTOR set "CRYPTO_EDGE_PC1_REVIEW_DEFAULT_ACTOR=CAMP_USER"
if not defined CRYPTO_EDGE_CAMP_COOKIE_SECURE set "CRYPTO_EDGE_CAMP_COOKIE_SECURE=1"

call "%CRYPTO_EDGE_RELEASE_ROOT%\scripts\win\start-product-vps.cmd"
exit /b %ERRORLEVEL%
