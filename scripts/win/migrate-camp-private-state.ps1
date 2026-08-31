[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$SourcePrivateStateRoot,
  [Parameter(Mandatory = $true)]
  [string]$TargetStateRoot,
  [switch]$Apply
)

$ErrorActionPreference = "Stop"

function Resolve-AbsolutePath([string]$Path) {
  return [System.IO.Path]::GetFullPath($Path)
}

$sourceRoot = Resolve-AbsolutePath $SourcePrivateStateRoot
$targetRoot = Resolve-AbsolutePath $TargetStateRoot
if (-not (Test-Path -LiteralPath $sourceRoot -PathType Container)) {
  throw "SOURCE_PRIVATE_STATE_ROOT_MISSING:$sourceRoot"
}

$stores = @(
  "user-workspace.sqlite",
  "research-evidence.sqlite",
  "tester-feedback.sqlite",
  "camp-user-identities.json"
)
$sidecars = @("-wal", "-shm")
$entries = @()
foreach ($name in $stores) {
  foreach ($suffix in @("", $sidecars)) {
    $source = Join-Path $sourceRoot "$name$suffix"
    $target = Join-Path $targetRoot "$name$suffix"
    if (Test-Path -LiteralPath $source -PathType Leaf) {
      $entries += [pscustomobject]@{
        store = "$name$suffix"
        source = $source
        target = $target
        target_exists = Test-Path -LiteralPath $target -PathType Leaf
      }
    }
  }
}

$preview = [ordered]@{
  schema_version = "camp_private_state_migration_preview_v1"
  mode = if ($Apply) { "APPLY" } else { "PREVIEW" }
  source_private_state_root = $sourceRoot
  target_state_root = $targetRoot
  source_entries = $entries
  copyable_entries = @($entries | Where-Object { -not $_.target_exists }).Count
  blocked_existing_targets = @($entries | Where-Object { $_.target_exists }).Count
  automatic_deletion = $false
  notes = @(
    "Stop the product runtime before applying a private-state migration.",
    "The operation never overwrites an existing target file.",
    "A missing camp-user-identities.json is expected for RC2; existing RC2 cookies cannot be reconstructed retroactively."
  )
}

if (-not $Apply) {
  $preview | ConvertTo-Json -Depth 5
  exit 0
}

if (@($entries | Where-Object { $_.target_exists }).Count -gt 0) {
  throw "TARGET_PRIVATE_STATE_EXISTS: use the preview output and resolve the target manually; this script never overwrites."
}

New-Item -ItemType Directory -Force -Path $targetRoot | Out-Null
foreach ($entry in $entries) {
  Copy-Item -LiteralPath $entry.source -Destination $entry.target -ErrorAction Stop
}

$preview.mode = "APPLIED"
$preview | ConvertTo-Json -Depth 5
