param(
  [Parameter(Mandatory = $true)][string]$TaskName,
  [Parameter(Mandatory = $true)][string]$BackupDirectory
)

$ErrorActionPreference = 'Stop'
$manifestPath = Join-Path $BackupDirectory 'task-config-backup.json'
if (-not (Test-Path -LiteralPath $manifestPath)) { throw 'TASK_CONFIG_BACKUP_NOT_FOUND' }
$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
if ($manifest.schema_version -ne 'central_task_config_backup_v1' -or $manifest.task_name -ne $TaskName) {
  throw 'TASK_CONFIG_BACKUP_INVALID'
}
if ($manifest.task_existed) {
  $xmlPath = Join-Path $BackupDirectory $manifest.xml_file
  if (-not (Test-Path -LiteralPath $xmlPath)) { throw 'TASK_CONFIG_XML_NOT_FOUND' }
  Register-ScheduledTask -TaskName $TaskName -Xml (Get-Content -LiteralPath $xmlPath -Raw) -Force | Out-Null
  Write-Output "Restored previous task configuration: $TaskName"
} else {
  $task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
  if ($null -ne $task) { Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false }
  Write-Output "Restored previous absence of task: $TaskName"
}
