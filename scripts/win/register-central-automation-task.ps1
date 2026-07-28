param(
  [Parameter(Mandatory = $true)][string]$TaskName,
  [Parameter(Mandatory = $true)][string]$TaskUser,
  [Parameter(Mandatory = $true)][string]$RepoRoot,
  [Parameter(Mandatory = $true)][string]$RunnerPath,
  [Parameter(Mandatory = $true)][ValidateRange(1, 1440)][int]$IntervalMinutes,
  [Parameter(Mandatory = $true)][string]$BackupDirectory
)

$ErrorActionPreference = 'Stop'
New-Item -ItemType Directory -Path $BackupDirectory -Force | Out-Null
$existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
$backup = [ordered]@{
  schema_version = 'central_task_config_backup_v1'
  created_at = (Get-Date).ToUniversalTime().ToString('o')
  task_name = $TaskName
  task_existed = ($null -ne $existing)
  xml_file = $null
}
if ($null -ne $existing) {
  $xmlPath = Join-Path $BackupDirectory 'previous-task.xml'
  Export-ScheduledTask -TaskName $TaskName | Set-Content -LiteralPath $xmlPath -Encoding Unicode
  $backup.xml_file = 'previous-task.xml'
}
$backup | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $BackupDirectory 'task-config-backup.json') -Encoding UTF8
$action = New-ScheduledTaskAction -Execute $env:ComSpec -Argument "/d /c `"$RunnerPath`"" -WorkingDirectory $RepoRoot
$intervalTrigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes $IntervalMinutes)
$startupTrigger = New-ScheduledTaskTrigger -AtStartup
$settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -StartWhenAvailable
$principal = New-ScheduledTaskPrincipal -UserId $TaskUser -LogonType S4U -RunLevel Limited
Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger @($intervalTrigger, $startupTrigger) -Settings $settings -Principal $principal -Force | Out-Null
Write-Output "Registered: $TaskName (every $IntervalMinutes minutes)"
