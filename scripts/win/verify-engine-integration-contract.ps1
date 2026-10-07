param(
  [Parameter(Mandatory=$true)]
  [string]$EngineMq4,

  [Parameter(Mandatory=$true)]
  [string]$PublisherMqh,

  [string]$EngineEx4
)

$ErrorActionPreference = "Stop"

if (!(Test-Path $EngineMq4)) { throw "ENGINE_MQ4_NOT_FOUND" }
if (!(Test-Path $PublisherMqh)) { throw "PUBLISHER_MQH_NOT_FOUND" }

$engine = Get-Content $EngineMq4 -Raw
$publisher = Get-Content $PublisherMqh -Raw

$versionMatch = [regex]::Match($engine, '#property\s+version\s+"([^"]+)"')
$engineVersion = if ($versionMatch.Success) { $versionMatch.Groups[1].Value } else { "" }

$publisherVersionMatch = [regex]::Match($publisher, 'InpCE_EngineVer\s*=\s*"([^"]+)"')
$publisherVersion = if ($publisherVersionMatch.Success) { $publisherVersionMatch.Groups[1].Value } else { "" }

$nsMatch = [regex]::Match($engine, '#define\s+NS\s+(\d+)')
$setupCount = if ($nsMatch.Success) { $nsMatch.Groups[1].Value } else { "" }

$idsMatch = [regex]::Match($engine, 'sId\[NS\]\s*=\s*\{([^}]+)\}')
$setupIds = if ($idsMatch.Success) { ($idsMatch.Groups[1].Value -replace '"','' -replace '\s','') } else { "" }

$publishPos = $engine.IndexOf("CryptoEdgePublishSignal(")
$autoGateCandidates = @(
  $engine.IndexOf('if(!gAuto)'),
  $engine.IndexOf('if (!gAuto)')
) | Where-Object { $_ -ge 0 }
$autoGatePos = if ($autoGateCandidates.Count -gt 0) { ($autoGateCandidates | Measure-Object -Minimum).Minimum } else { -1 }

$checks = [ordered]@{
  ENGINE_VERSION_PRESENT = ($engineVersion -ne "")
  SETUP_COUNT_PRESENT = ($setupCount -ne "")
  SETUP_IDS_PRESENT = ($setupIds -ne "")
  CE_INCLUDE = $engine.Contains("#include <CryptoEdgePublisher.mqh>")
  CE_INIT = $engine.Contains("CryptoEdgeInit();")
  CE_PUBLISH = ($publishPos -ge 0)
  CE_PUBLISH_BEFORE_AUTO_GATE = ($publishPos -ge 0 -and $autoGatePos -ge 0 -and $publishPos -lt $autoGatePos)
  MARKET_MAPPING = ($engine -match '\(g\.kind\s*==\s*1\)\s*\?\s*"LIMIT"\s*:\s*"MARKET"')
  LIMIT_CANCEL = ($engine -match '\(g\.kind\s*==\s*1\)\s*\?\s*g\.cancel\s*:\s*0')
  LIMIT_VALIDITY = ($engine -match '\(g\.kind\s*==\s*1\).*sWait\[i\].*sTF\[i\].*60')
  PUBLISHER_DEFAULT_ENABLED = ($publisher -match 'InpCE_Enabled\s*=\s*true;')
  PUBLISHER_NO_WEBREQUEST = ($publisher -notmatch 'WebRequest\s*\(')
  PUBLISHER_NO_KRAKEN = ($publisher -notmatch '(?i)kraken')
  ENGINE_VERSION_METADATA_SYNC = ($engineVersion -ne "" -and $publisherVersion -eq $engineVersion)
}

$checks.GetEnumerator() | ForEach-Object {
  [PSCustomObject]@{
    Check = $_.Key
    Result = if ($_.Value) { "PASS" } else { "FAIL" }
  }
} | Format-Table -AutoSize

Write-Host ""
Write-Host "ENGINE_VERSION=$engineVersion"
Write-Host "SETUP_COUNT=$setupCount"
Write-Host "SETUPS=$setupIds"
Write-Host "MQ4_SHA256=$((Get-FileHash $EngineMq4 -Algorithm SHA256).Hash)"
Write-Host "PUBLISHER_SHA256=$((Get-FileHash $PublisherMqh -Algorithm SHA256).Hash)"

if ($EngineEx4) {
  if (!(Test-Path $EngineEx4)) { throw "ENGINE_EX4_NOT_FOUND" }
  Write-Host "EX4_SHA256=$((Get-FileHash $EngineEx4 -Algorithm SHA256).Hash)"
}

if ($checks.Values -contains $false) {
  throw "CRYPTO_EDGE_ENGINE_CONTRACT=FAIL"
}

Write-Host ""
Write-Host "CRYPTO_EDGE_ENGINE_CONTRACT=PASS" -ForegroundColor Green
