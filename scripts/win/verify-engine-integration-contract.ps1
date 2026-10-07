<#
  ALLinCrypto Engine -> Crypto Edge integration contract verifier (CLAUDE_ENGINE_UPDATE_RULES.md).

  Checks the files that are ACTUALLY compiled together, not some other canonical copy:
    * the publisher is resolved exactly like `#include <CryptoEdgePublisher.mqh>` resolves it
      (<IncludeRoot>\Include\CryptoEdgePublisher.mqh, IncludeRoot = MQL4 folder passed to MetaEditor /inc),
    * Engine + that publisher are compiled by MetaEditor in an isolated temp copy of the MQL4 tree,
    * the compile log must name that publisher as the included file and report 0 errors / 0 warnings,
    * CE values (InpCE_Enabled / InpCE_EngineVer / InpCE_StrategyVer / InpCE_TerminalId) are read from the Engine,
      the publisher must not declare them (setup- and version-agnostic).
  MetaEditor output is not byte-deterministic, so the release EX4 is the one this script compiles (-OutDir).

  Usage:
    .\verify-engine-integration-contract.ps1 -EngineMq4 "...\MQL4\Experts\ALLinCrypto Engine 1.10.mq4" [-IncludeRoot "...\MQL4"]
        [-PublisherMqh "...\CryptoEdgePublisher.mqh"] [-OutDir "...\out"] [-MetaEditor "...\metaeditor.exe"]
  Exit code 0 = PASS, 1 = FAIL.
#>
param(
  [Parameter(Mandatory=$true)]
  [string]$EngineMq4,

  [string]$IncludeRoot,

  [string]$PublisherMqh,

  [string]$EngineEx4,

  [string]$OutDir,

  [string]$MetaEditor = "C:\Program Files (x86)\MetaTrader 4 Axi Terminal\CRYPTO_TESTY\metaeditor.exe"
)

$ErrorActionPreference = "Stop"

function Get-Sha([string]$p) { return (Get-FileHash -LiteralPath $p -Algorithm SHA256).Hash }

function Remove-MqlComments([string]$s) {
  # strips // and /* */ comments, keeps string and char literals intact
  $sb = New-Object System.Text.StringBuilder
  $i = 0; $n = $s.Length
  while ($i -lt $n) {
    $c = $s[$i]
    if ($c -eq '"' -or $c -eq "'") {
      $q = $c; [void]$sb.Append($c); $i++
      while ($i -lt $n) {
        $d = $s[$i]; [void]$sb.Append($d)
        if ($d -eq '\' -and $i + 1 -lt $n) { [void]$sb.Append($s[$i + 1]); $i += 2; continue }
        $i++
        if ($d -eq $q) { break }
      }
      continue
    }
    if ($c -eq '/' -and $i + 1 -lt $n -and $s[$i + 1] -eq '/') {
      while ($i -lt $n -and $s[$i] -ne "`n") { $i++ }
      continue
    }
    if ($c -eq '/' -and $i + 1 -lt $n -and $s[$i + 1] -eq '*') {
      $j = $s.IndexOf('*/', $i + 2)
      if ($j -lt 0) { $i = $n } else { $i = $j + 2 }
      continue
    }
    [void]$sb.Append($c); $i++
  }
  return $sb.ToString()
}

function Get-FunctionBody([string]$code, [string]$headerRegex) {
  $m = [regex]::Match($code, $headerRegex)
  if (!$m.Success) { return "" }
  $open = $code.IndexOf('{', $m.Index + $m.Length)
  if ($open -lt 0) { return "" }
  $depth = 0
  for ($k = $open; $k -lt $code.Length; $k++) {
    if ($code[$k] -eq '{') { $depth++ }
    elseif ($code[$k] -eq '}') { $depth--; if ($depth -eq 0) { return $code.Substring($open, $k - $open + 1) } }
  }
  return ""
}

# ------------------------------------------------------------ resolve the files that are really compiled together
if (!(Test-Path -LiteralPath $EngineMq4)) { throw "ENGINE_MQ4_NOT_FOUND: $EngineMq4" }
$EngineMq4 = (Resolve-Path -LiteralPath $EngineMq4).Path

if (!$MetaEditor) {
  $metaCandidates = New-Object System.Collections.Generic.List[string]

  try {
    $running = Get-CimInstance Win32_Process | Where-Object { $_.Name -match '^terminal(64)?\.exe$' }
    foreach ($proc in $running) {
      if ($proc.ExecutablePath) {
        $dir = Split-Path $proc.ExecutablePath -Parent
        foreach ($name in @("metaeditor.exe","metaeditor64.exe")) {
          $candidate = Join-Path $dir $name
          if (Test-Path -LiteralPath $candidate) { $metaCandidates.Add($candidate) }
        }
      }
    }
  } catch { }

  foreach ($candidate in @(
    "C:\Program Files (x86)\MetaTrader 4 Axi Terminal\CRYPTO_TESTY\metaeditor.exe",
    "C:\Program Files (x86)\MetaTrader 4 Axi Terminal\CRYPTO ENGINE\metaeditor.exe",
    "C:\Program Files (x86)\MetaTrader 4 Axi Terminal\metaeditor.exe",
    "C:\Program Files (x86)\MetaTrader 4 Axi Terminal\metaeditor64.exe",
    "C:\Program Files\MetaTrader 4 Axi Terminal\metaeditor.exe",
    "C:\Program Files\MetaTrader 4 Axi Terminal\metaeditor64.exe"
  )) {
    if (Test-Path -LiteralPath $candidate) { $metaCandidates.Add($candidate) }
  }

  $MetaEditor = $metaCandidates | Select-Object -Unique | Select-Object -First 1
}
if (!$MetaEditor -or !(Test-Path -LiteralPath $MetaEditor)) {
  throw "METAEDITOR_NOT_FOUND: pass -MetaEditor <path>"
}
if (!$IncludeRoot) {
  $engineDir = Split-Path $EngineMq4 -Parent
  if ((Split-Path $engineDir -Leaf) -ne "Experts") { throw "INCLUDE_ROOT_REQUIRED: Engine is not in <MQL4>\Experts - pass -IncludeRoot <MQL4 folder used by /inc>" }
  $IncludeRoot = Split-Path $engineDir -Parent
}
$IncludeRoot = (Resolve-Path -LiteralPath $IncludeRoot).Path
$resolvedPublisher = Join-Path $IncludeRoot "Include\CryptoEdgePublisher.mqh"
if (!(Test-Path -LiteralPath $resolvedPublisher)) { throw "PUBLISHER_NOT_FOUND_IN_INCLUDE_ROOT: $resolvedPublisher" }
if (!(Test-Path -LiteralPath $MetaEditor)) { throw "METAEDITOR_NOT_FOUND: $MetaEditor" }

$engineRaw = Get-Content -LiteralPath $EngineMq4 -Raw -Encoding UTF8
$publisherRaw = Get-Content -LiteralPath $resolvedPublisher -Raw -Encoding UTF8
$engine = Remove-MqlComments $engineRaw
$publisher = Remove-MqlComments $publisherRaw
$engineSha = Get-Sha $EngineMq4
$publisherSha = Get-Sha $resolvedPublisher

# ------------------------------------------------------------ values from the Engine
$m = [regex]::Match($engine, '#property\s+version\s+"([^"]+)"')
$engineVersion = if ($m.Success) { $m.Groups[1].Value } else { "" }
$m = [regex]::Match($engine, '#define\s+NS\s+(\d+)')
$setupCount = if ($m.Success) { $m.Groups[1].Value } else { "" }
$m = [regex]::Match($engine, 'sId\[NS\]\s*=\s*\{([^}]+)\}')
$setupIds = if ($m.Success) { ($m.Groups[1].Value -replace '"', '' -replace '\s', '') } else { "" }
$idCount = if ($setupIds) { ($setupIds -split ',').Count } else { 0 }

$includePos = $engine.IndexOf("#include <CryptoEdgePublisher.mqh>")
$ce = [ordered]@{}
$cePos = @()
foreach ($spec in @(@("InpCE_Enabled", "bool", '(true|false)'), @("InpCE_EngineVer", "string", '"([^"]*)"'),
                    @("InpCE_StrategyVer", "string", '"([^"]*)"'), @("InpCE_TerminalId", "string", '"([^"]*)"'))) {
  $m = [regex]::Match($engine, '(?m)^\s*(?:input|extern)\s+' + $spec[1] + '\s+' + $spec[0] + '\s*=\s*' + $spec[2] + '\s*;')
  if ($m.Success) { $ce[$spec[0]] = $m.Groups[1].Value; $cePos += $m.Index } else { $ce[$spec[0]] = $null; $cePos += -1 }
}
$ceDeclared = ($cePos | Where-Object { $_ -lt 0 }).Count -eq 0
$ceBeforeInclude = $ceDeclared -and $includePos -ge 0 -and (($cePos | Measure-Object -Maximum).Maximum -lt $includePos)

$onInit = Get-FunctionBody $engine 'int\s+OnInit\s*\(\s*\)'
$publishCount = ([regex]::Matches($engine, 'CryptoEdgePublishSignal\s*\(')).Count
$publishPos = $engine.IndexOf("CryptoEdgePublishSignal(")
$gate = [regex]::Match($engine, 'if\s*\(\s*!\s*gAuto\s*\)')
$autoGatePos = if ($gate.Success) { $gate.Index } else { -1 }

# ------------------------------------------------------------ publisher must only USE the values
$pubDeclaresInputs = $publisher -match '(?m)^\s*(input|extern|sinput)\s'
$pubAssignsCE = $publisher -match 'InpCE_\w+\s*=[^=]'
$pubUses = ($publisher -match 'InpCE_Enabled') -and ($publisher -match 'InpCE_EngineVer') -and ($publisher -match 'InpCE_StrategyVer') -and ($publisher -match 'InpCE_TerminalId')
$pubVersionLiteral = $publisher -match '"\s*v?\d+\.\d+[^"]*"'
$pubSetupLiteral = $publisher -match '"[A-Z]"'

# ------------------------------------------------------------ compile Engine + resolved publisher in isolation
$work = Join-Path $env:TEMP ("ce_verify_" + (Get-Date -Format "yyyyMMdd_HHmmss") + "_" + [guid]::NewGuid().ToString("N").Substring(0, 6))
$wInc = Join-Path $work "MQL4\Include"
$wExp = Join-Path $work "MQL4\Experts"
New-Item -ItemType Directory -Force -Path $wInc, $wExp | Out-Null
Copy-Item -Path (Join-Path $IncludeRoot "Include\*") -Destination $wInc -Recurse -Force
$engineName = Split-Path $EngineMq4 -Leaf
$wMq4 = Join-Path $wExp $engineName
Copy-Item -LiteralPath $EngineMq4 -Destination $wMq4 -Force
$wLog = Join-Path $work "compile.log"
$proc = Start-Process -FilePath $MetaEditor -ArgumentList @("/compile:`"$wMq4`"", "/inc:`"$(Join-Path $work 'MQL4')`"", "/log:`"$wLog`"") -Wait -PassThru -WindowStyle Hidden
$logLines = @()
if (Test-Path -LiteralPath $wLog) { $logLines = Get-Content -LiteralPath $wLog -Encoding Unicode | Where-Object { $_.Trim() -ne "" } }
$errors = -1; $warnings = -1
foreach ($l in $logLines) {
  $r = [regex]::Match($l, '(\d+)\s+errors?,\s+(\d+)\s+warnings?')
  if ($r.Success) { $errors = [int]$r.Groups[1].Value; $warnings = [int]$r.Groups[2].Value }
}
$includedPublishers = @()
foreach ($l in $logLines) {
  $r = [regex]::Match($l, "^(.*?CryptoEdgePublisher\.mqh)\s*:\s*information:\s*including")
  if ($r.Success) { $includedPublishers += $r.Groups[1].Value.Trim() }
}
$compiledPublisherOk = $false
if ($includedPublishers.Count -eq 1 -and (Test-Path -LiteralPath $includedPublishers[0])) {
  $compiledPublisherOk = ((Get-Sha $includedPublishers[0]) -eq $publisherSha)
}
$compiledEngineOk = ((Get-Sha $wMq4) -eq $engineSha)
$wEx4 = [System.IO.Path]::ChangeExtension($wMq4, ".ex4")
$ex4Ok = (Test-Path -LiteralPath $wEx4) -and ((Get-Item -LiteralPath $wEx4).Length -gt 0)
$ex4Sha = if ($ex4Ok) { Get-Sha $wEx4 } else { "" }

$publisherArgOk = $true
if ($PublisherMqh) {
  if (!(Test-Path -LiteralPath $PublisherMqh)) { throw "PUBLISHER_MQH_NOT_FOUND: $PublisherMqh" }
  $publisherArgOk = ((Get-Sha $PublisherMqh) -eq $publisherSha)
}

# ------------------------------------------------------------ checks
$checks = [ordered]@{
  ENGINE_VERSION_PRESENT          = ($engineVersion -ne "")
  SETUP_COUNT_PRESENT             = ($setupCount -ne "")
  SETUP_IDS_PRESENT               = ($setupIds -ne "")
  SETUP_COUNT_MATCHES_IDS         = ($setupCount -ne "" -and [int]$setupCount -eq $idCount)
  CE_INCLUDE                      = ($includePos -ge 0)
  CE_INPUTS_DECLARED_IN_ENGINE    = $ceDeclared
  CE_INPUTS_BEFORE_INCLUDE        = $ceBeforeInclude
  CE_INIT_IN_ONINIT               = ($onInit -match 'CryptoEdgeInit\s*\(\s*\)\s*;')
  CE_PUBLISH_SINGLE_CALL          = ($publishCount -eq 1)
  CE_PUBLISH_BEFORE_AUTO_GATE     = ($publishPos -ge 0 -and $autoGatePos -ge 0 -and $publishPos -lt $autoGatePos)
  MARKET_MAPPING                  = ($engine -match '\(g\.kind\s*==\s*1\)\s*\?\s*"LIMIT"\s*:\s*"MARKET"')
  LIMIT_CANCEL                    = ($engine -match '\(g\.kind\s*==\s*1\)\s*\?\s*g\.cancel\s*:\s*0')
  LIMIT_VALIDITY                  = ($engine -match '\(g\.kind\s*==\s*1\)\s*\?\s*sWait\[i\]\s*\*\s*sTF\[i\]\s*\*\s*60')
  ENGINE_CE_ENABLED_DEFAULT_TRUE  = ($ce["InpCE_Enabled"] -eq "true")
  ENGINE_VERSION_METADATA_SYNC    = ($engineVersion -ne "" -and $ce["InpCE_EngineVer"] -eq $engineVersion)
  STRATEGY_VERSION_SET            = ($ce["InpCE_StrategyVer"] -ne $null -and $ce["InpCE_StrategyVer"] -ne "")
  PUBLISHER_IS_COMPILED_ONE       = ($compiledPublisherOk -and $publisherArgOk)
  PUBLISHER_NO_CE_DECLARATIONS    = (!$pubDeclaresInputs -and !$pubAssignsCE)
  PUBLISHER_USES_ENGINE_CE_VALUES = $pubUses
  PUBLISHER_VERSION_AGNOSTIC      = (!$pubVersionLiteral)
  PUBLISHER_SETUP_AGNOSTIC        = (!$pubSetupLiteral)
  PUBLISHER_NO_WEBREQUEST         = ($publisher -notmatch 'WebRequest\s*\(')
  PUBLISHER_NO_KRAKEN             = ($publisherRaw -notmatch '(?i)kraken')
  PUBLISHER_NO_ORDERS             = ($publisher -notmatch 'Order(Send|Modify|Close|Delete)\s*\(')
  COMPILED_ENGINE_IS_INPUT        = $compiledEngineOk
  COMPILE_0_ERRORS_0_WARNINGS     = ($errors -eq 0 -and $warnings -eq 0)
  EX4_PRODUCED                    = $ex4Ok
}
$allPass = -not ($checks.Values -contains $false)
function PF($b) { if ($b) { "PASS" } else { "FAIL" } }

# ------------------------------------------------------------ report (format from CLAUDE_ENGINE_UPDATE_RULES.md)
$report = New-Object System.Collections.Generic.List[string]
$report.Add("ENGINE RELEASE CHECK")
$report.Add("Version: $engineVersion")
$report.Add("Setups: $setupCount " + [char]0x2014 + " $setupIds")
$report.Add("Crypto Edge include: " + (PF $checks.CE_INCLUDE))
$report.Add("Crypto Edge init: " + (PF $checks.CE_INIT_IN_ONINIT))
$report.Add("Crypto Edge publish hook: " + (PF $checks.CE_PUBLISH_SINGLE_CALL))
$report.Add("Hook before AUTO gating: " + (PF $checks.CE_PUBLISH_BEFORE_AUTO_GATE))
$report.Add("MARKET mapping: " + (PF $checks.MARKET_MAPPING))
$report.Add("LIMIT mapping: " + (PF ($checks.LIMIT_CANCEL -and $checks.LIMIT_VALIDITY)))
$report.Add("Publisher default enabled: " + (PF $checks.ENGINE_CE_ENABLED_DEFAULT_TRUE))
$report.Add("Engine version metadata synced: " + (PF $checks.ENGINE_VERSION_METADATA_SYNC))
$report.Add("Compile: $errors errors / $warnings warnings")
$report.Add("MQ4 SHA256: $engineSha")
$report.Add("EX4 SHA256: $ex4Sha")
$report.Add("Publisher SHA256: $publisherSha")
$report.Add("RESULT: " + (PF $allPass))
$report.Add("")
$report.Add("DETAILS")
foreach ($k in $checks.Keys) { $report.Add(("  {0,-32} {1}" -f $k, (PF $checks[$k]))) }
$report.Add("")
$report.Add("  InpCE_Enabled     = " + $ce["InpCE_Enabled"] + "   (Engine)")
$report.Add("  InpCE_EngineVer   = `"" + $ce["InpCE_EngineVer"] + "`"   (Engine; #property version `"$engineVersion`")")
$report.Add("  InpCE_StrategyVer = `"" + $ce["InpCE_StrategyVer"] + "`"   (Engine)")
$report.Add("  InpCE_TerminalId  = `"" + $ce["InpCE_TerminalId"] + "`"   (Engine; empty = ACC<account>)")
$report.Add("  Engine MQ4        = $EngineMq4")
$report.Add("  Include root      = $IncludeRoot")
$report.Add("  Publisher (used)  = $resolvedPublisher")
if ($PublisherMqh) { $report.Add("  Publisher (arg)   = $PublisherMqh  " + $(if ($publisherArgOk) { "(same file content)" } else { "(DIFFERENT from the compiled one)" })) }
$report.Add("  Compiled in       = $work")
$report.Add("  Compile log       = " + (($logLines | Where-Object { $_ -match 'Result|error|warning' }) -join " | "))
if ($EngineEx4) {
  if (Test-Path -LiteralPath $EngineEx4) {
    $report.Add("  Given EX4         = $EngineEx4  SHA256 " + (Get-Sha $EngineEx4) + "  (MetaEditor builds are not byte-deterministic; release EX4 = the one compiled above)")
  } else { $report.Add("  Given EX4         = NOT FOUND: $EngineEx4") }
}

if ($OutDir -and $allPass) {
  New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
  Copy-Item -LiteralPath $wEx4 -Destination (Join-Path $OutDir (Split-Path $wEx4 -Leaf)) -Force
  Copy-Item -LiteralPath $EngineMq4 -Destination (Join-Path $OutDir $engineName) -Force
  Copy-Item -LiteralPath $resolvedPublisher -Destination (Join-Path $OutDir "CryptoEdgePublisher.mqh") -Force
  Copy-Item -LiteralPath $wLog -Destination (Join-Path $OutDir "compile.log") -Force
  $report.Add("  Release copied to = $OutDir (MQ4 + EX4 + publisher + compile.log + report)")
}

$report | ForEach-Object { Write-Output $_ }
if ($OutDir -and $allPass) {
  $report | Set-Content -LiteralPath (Join-Path $OutDir "ENGINE_RELEASE_CHECK.txt") -Encoding UTF8
}

if (!$allPass) {
  Write-Output "CRYPTO_EDGE_ENGINE_CONTRACT=FAIL"
  exit 1
}
Write-Output "CRYPTO_EDGE_ENGINE_CONTRACT=PASS"
exit 0
