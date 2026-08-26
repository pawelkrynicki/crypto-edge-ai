[CmdletBinding()]
param(
  [string]$ReleaseId = "CAMP2026-VPS-RC1",
  [string]$BackupId = "RECORDED_IN_FINAL_RC_REPORT",
  [string]$BackupCreatedAtUtc = "RECORDED_IN_FINAL_RC_REPORT",
  [string]$TestSummary = "All required offline RC validations are recorded in the final RC report."
)

$ErrorActionPreference = "Stop"

function Require-Command([string]$Name) {
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "REQUIRED_COMMAND_MISSING:$Name"
  }
}

function Get-Sha256([string]$Path) {
  $stream = [System.IO.File]::OpenRead($Path)
  $sha = [System.Security.Cryptography.SHA256]::Create()
  try {
    return ([System.BitConverter]::ToString($sha.ComputeHash($stream))).Replace("-", "").ToLowerInvariant()
  }
  finally {
    $sha.Dispose()
    $stream.Dispose()
  }
}

function Get-DirectorySha256([string]$Path) {
  $lines = Get-ChildItem -LiteralPath $Path -Recurse -File | Sort-Object FullName | ForEach-Object {
    $relative = $_.FullName.Substring($Path.Length).TrimStart([char]92, [char]47) -replace '\\', '/'
    "$(Get-Sha256 $_.FullName)  $relative"
  }
  $bytes = [System.Text.Encoding]::UTF8.GetBytes(($lines -join "`n") + "`n")
  $sha = [System.Security.Cryptography.SHA256]::Create()
  try {
    return ([System.BitConverter]::ToString($sha.ComputeHash($bytes))).Replace("-", "").ToLowerInvariant()
  }
  finally {
    $sha.Dispose()
  }
}

function Test-EmptyEnvironmentValue([string]$Value) {
  $trimmed = $Value.Trim()
  return $trimmed.Length -eq 0 -or $trimmed -eq '""' -or $trimmed -eq "''"
}

Require-Command git
Require-Command pnpm

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$releaseRoot = Join-Path $repoRoot (Join-Path "release-artifacts" $ReleaseId)
$stagingRoot = Join-Path $releaseRoot "staging"
$sourceArchive = Join-Path $releaseRoot "source-only.zip"
$appArchiveName = "crypto-edge-ai-$ReleaseId-app.zip"
$appArchive = Join-Path $releaseRoot $appArchiveName
$archivePrefix = "crypto-edge-ai-$ReleaseId"
$stageAppRoot = Join-Path $stagingRoot $archivePrefix
$distSource = Join-Path $repoRoot "tools\ui-mock\dist"
$distDestination = Join-Path $stageAppRoot "tools\ui-mock\dist"
$manifestJson = Join-Path $releaseRoot "RC_RELEASE_MANIFEST.json"
$manifestMarkdown = Join-Path $releaseRoot "RC_RELEASE_MANIFEST.md"
$checksums = Join-Path $releaseRoot "SHA256SUMS.txt"
$environmentTemplate = Join-Path $releaseRoot "vps.env.example"
$rollbackManifest = Join-Path $releaseRoot "ROLLBACK_MANIFEST.md"
$verificationRoot = Join-Path $releaseRoot "verify"

Push-Location $repoRoot
try {
  $status = (& git status --short)
  if ($LASTEXITCODE -ne 0) { throw "GIT_STATUS_FAILED" }
  if ($status) { throw "WORKING_TREE_NOT_CLEAN" }

  $head = (& git rev-parse HEAD).Trim()
  if ($LASTEXITCODE -ne 0 -or $head -notmatch '^[0-9a-f]{40}$') { throw "GIT_HEAD_UNRESOLVED" }

  $branch = (& git branch --show-current).Trim()
  if ($LASTEXITCODE -ne 0 -or -not $branch) { throw "GIT_BRANCH_UNRESOLVED" }

  if (Test-Path -LiteralPath $releaseRoot) { throw "RELEASE_ARTIFACT_ALREADY_EXISTS:$releaseRoot" }
  if (-not (Test-Path -LiteralPath (Join-Path $distSource "index.html"))) { throw "INTERNAL_BETA_DIST_MISSING" }

  # Build inside the canonical offline INTERNAL_BETA launcher before copying dist.
  & (Join-Path $repoRoot "scripts\win\build-product-vps.cmd")
  if ($LASTEXITCODE -ne 0) { throw "INTERNAL_BETA_BUILD_FAILED" }
  if (-not (Test-Path -LiteralPath (Join-Path $distSource "index.html"))) { throw "INTERNAL_BETA_DIST_MISSING_AFTER_BUILD" }

  New-Item -ItemType Directory -Path $releaseRoot -Force | Out-Null
  & git archive --format=zip --prefix="$archivePrefix/" --output=$sourceArchive $head
  if ($LASTEXITCODE -ne 0) { throw "GIT_ARCHIVE_FAILED" }
  Expand-Archive -LiteralPath $sourceArchive -DestinationPath $stagingRoot -Force
  Copy-Item -LiteralPath $distSource -Destination $distDestination -Recurse -Force

  # Tracked .gitkeep placeholders are useful locally but are not application input.
  # Remove every .local directory from the staging tree before the package safety scan.
  $localDirectories = @(Get-ChildItem -LiteralPath $stageAppRoot -Recurse -Directory -Force |
    Where-Object { $_.Name -eq ".local" } |
    Sort-Object { $_.FullName.Length } -Descending)
  foreach ($directory in $localDirectories) {
    Remove-Item -LiteralPath $directory.FullName -Recurse -Force
  }

  $forbiddenPath = Get-ChildItem -LiteralPath $stageAppRoot -Recurse -Force | Where-Object {
    $relativePath = $_.FullName.Substring($stageAppRoot.Length).TrimStart([char]92, [char]47) -replace '\\', '/'
    $relativePath -match '(^|/)(?:\.local|node_modules|release-artifacts)(?:/|$)' -or $_.Name -match '\.(?:sqlite|sqlite3|db)$'
  }
  if ($forbiddenPath) { throw "PACKAGE_FORBIDDEN_STATE_PATH:$($forbiddenPath[0].FullName)" }

  $secretViolations = @()
  Get-ChildItem -LiteralPath $stageAppRoot -Recurse -File | Where-Object { $_.Name -match '^\.env(?:\..+)?$' } | ForEach-Object {
    foreach ($line in (Get-Content -LiteralPath $_.FullName)) {
      if ($line -match '^\s*(OPENAI_API_KEY|CRYPTO_EDGE_AI_RESEARCH_SESSION_SECRET)\s*=\s*(.*)$' -and -not (Test-EmptyEnvironmentValue $Matches[2])) {
        $secretViolations += "$($_.FullName):$($Matches[1])"
      }
    }
  }
  if ($secretViolations.Count -gt 0) { throw "PACKAGE_SECRET_VALUE_DETECTED:$($secretViolations[0])" }

  $knownSyntheticCanaryPaths = @(
    "tools/ui-mock/server/backupRestoreRollbackDrills.ts",
    "tools/ui-mock/tests/backupRestoreRollback.test.ts"
  )
  $canaryMatches = Get-ChildItem -LiteralPath $stageAppRoot -Recurse -File |
    Where-Object { $_.Extension -in ".ts", ".tsx", ".js", ".json", ".md", ".env", ".example", ".txt" } |
    Select-String -Pattern 'sk-[A-Za-z0-9_-]{16,}' -List
  $unknownCanary = @($canaryMatches | Where-Object {
    $relativePath = $_.Path.Substring($stageAppRoot.Length).TrimStart([char]92, [char]47) -replace '\\', '/'
    $relativePath -notin $knownSyntheticCanaryPaths
  })
  if ($unknownCanary.Count -gt 0) { throw "PACKAGE_UNEXPECTED_SECRET_CANARY:$($unknownCanary[0].Path)" }

  $localPathLeak = Get-ChildItem -LiteralPath $stageAppRoot -Recurse -File |
    Where-Object { $_.Extension -in ".cmd", ".ps1", ".ts", ".tsx", ".js", ".json", ".md", ".env", ".example", ".txt" } |
    Select-String -Pattern 'C:\\Users\\|AppData[\\/]' -List
  if ($localPathLeak) { throw "PACKAGE_LOCAL_PATH_LEAK:$($localPathLeak[0].Path)" }

  $excludedStores = @(
    "feedback_sqlite",
    "ai_queue_cache_sqlite",
    "user_workspace_sqlite",
    "research_evidence_sqlite",
    "central_automation_state"
  )
  $classification = [ordered]@{
    immutable_application = "included: committed source at $head plus freshly-built tools/ui-mock/dist"
    canonical_shared_state = "not included: NOT_CREATED_SAFETY_BOUNDARY; requires owner-approved, store-level export"
    owner_private_state = "excluded: user workspace, research evidence, tester feedback"
    transient_runtime_state = "excluded: AI queue/cache, automation state, local databases, runtime output"
    secrets = "excluded: environment values and key material; only empty-value .env.example is included"
    excluded_logical_stores = $excludedStores
  }

  $nodeVersion = (& node --version).Trim()
  $pnpmVersion = (& pnpm --version).Trim()
  $distFileCount = @(Get-ChildItem -LiteralPath $distSource -Recurse -File).Count
  $distSizeBytes = ((Get-ChildItem -LiteralPath $distSource -Recurse -File | Measure-Object -Property Length -Sum).Sum)
  $distSha256 = Get-DirectorySha256 $distSource
  $environmentNames = Get-Content -LiteralPath (Join-Path $repoRoot "tools\ui-mock\.env.example") |
    ForEach-Object { if ($_ -match '^([A-Z][A-Z0-9_]+)=') { $Matches[1] } } |
    Select-Object -Unique
  $manifest = [ordered]@{
    release_id = $ReleaseId
    created_at_utc = (Get-Date).ToUniversalTime().ToString("o")
    accepted_product_sha = "3be40a1720f78630ccde81a7d3fa11a68699ea71"
    packaging_commit_sha = $head
    git_commit = $head
    git_branch = $branch
    git_tag = "camp2026-vps-rc1"
    runtime_mode = "INTERNAL_BETA"
    target_platform = "Windows VPS"
    default_internal_host = "127.0.0.1"
    default_internal_port = 4180
    node_version = $nodeVersion
    pnpm_version = $pnpmVersion
    application_archive = $appArchiveName
    application_archive_sha256 = $null # set below after archive creation
    shared_state_bootstrap = "NOT_CREATED_SAFETY_BOUNDARY"
    shared_state_archive_sha256 = $null
    frontend_build_sha256 = $distSha256
    frontend_build_file_count = $distFileCount
    frontend_build_size_bytes = $distSizeBytes
    backup_id = $BackupId
    backup_created_at_utc = $BackupCreatedAtUtc
    canonical_document = "docs/camp2026_vps_rc_deployment.md"
    required_environment_variable_names = @($environmentNames)
    required_secret_names = @("OPENAI_API_KEY", "CRYPTO_EDGE_AI_RESEARCH_SESSION_SECRET")
    initial_automation_policy = "disabled; no collector, scheduler, provider call, or AI worker is started by the VPS launcher"
    reports_frontend_policy = "hidden from CAMP frontend"
    opinions_frontend_policy = "hidden from CAMP frontend"
    ai_contract_versions = [ordered]@{
      prompt = "ai_research_prompt_v7"
      narrative = "ai_research_narrative_v6"
      public_schema = "ai_research_brief_v2"
      provider_wire_schema = "ai_research_wire_schema_v3"
      semantic_policy = "ai_research_semantic_policy_v3"
      composition_policy = "ai_research_composition_policy_v1"
    }
    provider_cadence_summary = "disabled for initial VPS deployment; owner authorization is required before a one-shot or persistent automation"
    deployment_sequence = @("VPS.1 deploy application only", "VPS.2 verify same-origin runtime", "VPS.3 import only a future owner-approved shared-state export", "VPS.4 owner-authorized AI smoke", "VPS.5 owner-authorized data one-shot", "VPS.6 enable persistent automation after gates", "VPS.7 bounded operational soak", "then tunnel/domain", "then AIKINTEL entry/redirect")
    rollback_source = "ROLLBACK_MANIFEST.md and docs/camp2026_vps_rc_deployment.md"
    test_summary = $TestSummary
    state_classification = $classification
    build_environment = [ordered]@{
      os = [System.Environment]::OSVersion.VersionString
      node = $nodeVersion
      pnpm = $pnpmVersion
      build_command = "scripts\\win\\build-product-vps.cmd"
      package_command = "scripts\\win\\package-camp-vps-rc.cmd"
    }
    validation = [ordered]@{
      source = "git archive exact commit"
      internal_beta_dist = "tools/ui-mock/dist/index.html present"
      secret_values = "no non-empty OPENAI_API_KEY or CRYPTO_EDGE_AI_RESEARCH_SESSION_SECRET in packaged env files"
      secret_canaries = "only the two allowlisted synthetic backup/restore test canaries are present"
      forbidden_runtime_paths = "no .local, node_modules, release-artifacts, or sqlite/db files"
      local_path_leaks = "no C:\\Users or AppData paths in package text files"
    }
  }

  # The package content is now complete. Compress the staged committed source and freshly built runtime dist.
  Compress-Archive -LiteralPath $stageAppRoot -DestinationPath $appArchive -CompressionLevel Optimal
  $manifest.application_archive_sha256 = Get-Sha256 $appArchive
  $manifest | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $manifestJson -Encoding utf8

  @(
    "# Crypto Edge AI release manifest",
    "",
    "- Release: $ReleaseId",
    "- Commit: $head",
    "- Local tag: camp2026-vps-rc1",
    "- Runtime: INTERNAL_BETA",
    "- Application archive: $appArchiveName",
    "- Application archive SHA-256: $($manifest.application_archive_sha256)",
    "- Shared-state bootstrap: NOT_CREATED_SAFETY_BOUNDARY",
    "- Frontend build SHA-256: $distSha256",
    "- Canonical backup id: $BackupId",
    "",
    "The archive contains only committed application source at the recorded commit and a freshly built INTERNAL_BETA dist. It excludes canonical runtime state, owner-private data, SQLite files, local output, secrets, and automation/AI transient state.",
    "",
    "For deployment, follow docs/camp2026_vps_rc_deployment.md from the packaged source."
  ) | Set-Content -LiteralPath $manifestMarkdown -Encoding utf8

  Copy-Item -LiteralPath (Join-Path $repoRoot "tools\ui-mock\.env.example") -Destination $environmentTemplate -Force
  @(
    "# CAMP2026 VPS RC1 rollback manifest",
    "",
    "- Release: $ReleaseId",
    "- Application rollback source: previously verified application archive and checksum.",
    "- Canonical recovery backup id: $BackupId",
    "- State rollback source: only a validated owner-approved recovery bundle; no .local directory copy.",
    "- Pre-import restore-preview: required; --apply is prohibited for release validation.",
    "- Automation rollback: keep disabled; do not install or enable a Task Scheduler task during rollback.",
    "- Private state excluded from shared rollback: user workspace, research evidence, manual verification decisions, and tester feedback.",
    "",
    "See docs/camp2026_vps_rc_deployment.md for the stop, deploy, restore-preview, and verification sequence."
  ) | Set-Content -LiteralPath $rollbackManifest -Encoding utf8

  @(
    "$(Get-Sha256 $appArchive)  $appArchiveName",
    "$(Get-Sha256 $manifestJson)  RC_RELEASE_MANIFEST.json",
    "$(Get-Sha256 $manifestMarkdown)  RC_RELEASE_MANIFEST.md",
    "$(Get-Sha256 $environmentTemplate)  vps.env.example",
    "$(Get-Sha256 $rollbackManifest)  ROLLBACK_MANIFEST.md",
    "$(Get-Sha256 (Join-Path $repoRoot 'scripts\\win\\build-product-vps.cmd'))  source/scripts/win/build-product-vps.cmd",
    "$(Get-Sha256 (Join-Path $repoRoot 'scripts\\win\\start-product-vps.cmd'))  source/scripts/win/start-product-vps.cmd",
    "$(Get-Sha256 (Join-Path $repoRoot 'scripts\\win\\check-product-vps-runtime.cmd'))  source/scripts/win/check-product-vps-runtime.cmd",
    "$(Get-Sha256 (Join-Path $repoRoot 'scripts\\win\\package-camp-vps-rc.cmd'))  source/scripts/win/package-camp-vps-rc.cmd",
    "$(Get-Sha256 (Join-Path $repoRoot 'scripts\\win\\package-camp-vps-rc.ps1'))  source/scripts/win/package-camp-vps-rc.ps1"
  ) | Set-Content -LiteralPath $checksums -Encoding ascii

  Expand-Archive -LiteralPath $appArchive -DestinationPath $verificationRoot -Force
  $verifiedDist = Join-Path $verificationRoot "$archivePrefix\tools\ui-mock\dist\index.html"
  if (-not (Test-Path -LiteralPath $verifiedDist)) { throw "APPLICATION_ARCHIVE_VERIFICATION_FAILED" }
  $verificationForbidden = Get-ChildItem -LiteralPath $verificationRoot -Recurse -Force | Where-Object {
    $relativePath = $_.FullName.Substring($verificationRoot.Length).TrimStart([char]92, [char]47) -replace '\\', '/'
    $relativePath -match '(^|/)(?:\.local|node_modules|release-artifacts)(?:/|$)' -or $_.Name -match '\.(?:sqlite|sqlite3|db)$'
  }
  if ($verificationForbidden) { throw "APPLICATION_ARCHIVE_FORBIDDEN_STATE:$($verificationForbidden[0].FullName)" }
  foreach ($line in (Get-Content -LiteralPath $checksums)) {
    if ($line -notmatch '^([0-9a-f]{64})  (.+)$') { throw "CHECKSUMS_FORMAT_INVALID" }
    $expected = $Matches[1]
    $relative = $Matches[2]
    $path = if ($relative.StartsWith("source/")) { Join-Path $repoRoot $relative.Substring(7) } else { Join-Path $releaseRoot $relative }
    if ((Get-Sha256 $path) -ne $expected) { throw "CHECKSUM_VERIFICATION_FAILED:$relative" }
  }

  Remove-Item -LiteralPath $stagingRoot -Recurse -Force
  Remove-Item -LiteralPath $sourceArchive -Force
  Remove-Item -LiteralPath $verificationRoot -Recurse -Force
  Write-Output "PRODUCT_RC_PACKAGE_OK"
  Write-Output "RELEASE_ROOT=$releaseRoot"
  Write-Output "APPLICATION_ARCHIVE=$appArchive"
}
finally {
  Pop-Location
}
