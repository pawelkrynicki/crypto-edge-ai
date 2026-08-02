$ErrorActionPreference = "Stop"

$scriptDirectory = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = [System.IO.Path]::GetFullPath((Join-Path $scriptDirectory "..\.."))
$uiDirectory = Join-Path $repoRoot "tools\ui-mock"
$productLauncher = Join-Path $repoRoot "scripts\win\start-product-vps.cmd"
$productUrl = "http://127.0.0.1:4180/#candidate-results"
$healthUrl = "http://127.0.0.1:4180/api/health"
$productPort = 4180

if (-not (Test-Path -LiteralPath $productLauncher -PathType Leaf)) {
  throw "Local Crypto Edge AI launcher not found: $productLauncher"
}

$repoRootComparison = $repoRoot.TrimEnd("\").ToLowerInvariant()
$listenerPids = @(Get-NetTCPConnection -LocalPort $productPort -State Listen -ErrorAction SilentlyContinue |
  Select-Object -ExpandProperty OwningProcess -Unique)

foreach ($listenerPid in $listenerPids) {
  $process = Get-CimInstance Win32_Process -Filter "ProcessId = $listenerPid"
  $commandLine = [string]$process.CommandLine
  $isLocalCryptoEdgeRuntime = $commandLine.ToLowerInvariant().Contains($repoRootComparison) -and
    $commandLine -match "productVpsServer\.(?:ts|js)"
  if (-not $isLocalCryptoEdgeRuntime) {
    throw "Port $productPort is owned by another process (PID $listenerPid); it was not stopped."
  }
  Stop-Process -Id $listenerPid -Force
}

$env:CRYPTO_EDGE_DATA_ENV = "INTERNAL_BETA"
$env:CRYPTO_EDGE_RUNTIME_MODE = "INTERNAL_BETA"
$env:CRYPTO_EDGE_PRODUCT_HOST = "127.0.0.1"
$env:CRYPTO_EDGE_PRODUCT_PORT = [string]$productPort
$env:CRYPTO_EDGE_AUTOMATION_ENABLED = "0"
$env:ALLOW_LIVE_PROVIDER_CALLS = "0"
$env:CRYPTO_EDGE_ALLOW_LIVE_SOURCE_CHECK = "0"
$env:CRYPTO_EDGE_AI_WORKER_ENABLED = "0"
$env:CRYPTO_EDGE_AI_RESEARCH_PROVIDER = "DISABLED"
$env:CRYPTO_EDGE_AI_RESEARCH_MODEL = ""
$env:CRYPTO_EDGE_AI_RESEARCH_LIVE_CALL_BUDGET = "0"
$env:CRYPTO_EDGE_OWNER_OPERATIONS_MODE = "DISABLED"
$env:OPENAI_API_KEY = ""

Push-Location $uiDirectory
try {
  & pnpm.cmd run build:internal-beta
  if ($LASTEXITCODE -ne 0) { throw "INTERNAL_BETA build exited with code $LASTEXITCODE." }
} finally {
  Pop-Location
}

Start-Process -FilePath "cmd.exe" -ArgumentList @("/d", "/c", "call `"$productLauncher`"") -WorkingDirectory $repoRoot -WindowStyle Hidden

$ready = $false
for ($attempt = 0; $attempt -lt 30; $attempt += 1) {
  try {
    $health = Invoke-RestMethod -Uri $healthUrl -Method Get -TimeoutSec 1
    if ($health.status -eq "ok" -and $health.runtime_mode -eq "INTERNAL_BETA") {
      $ready = $true
      break
    }
  } catch {
    Start-Sleep -Milliseconds 500
  }
}
if (-not $ready) { throw "The local product did not start at $healthUrl." }

Start-Process $productUrl
Write-Output "Crypto Edge AI Radar: $productUrl"
Write-Output "Collector disabled; provider calls: 0; OpenAI calls: 0."
