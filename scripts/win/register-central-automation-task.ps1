param(
  [Parameter(Mandatory = $true)][string]$TaskName,
  [Parameter(Mandatory = $true)][string]$TaskUser,
  [Parameter(Mandatory = $true)][string]$RepoRoot,
  [Parameter(Mandatory = $true)][string]$RunnerPath
)

$ErrorActionPreference = 'Stop'
$action = New-ScheduledTaskAction -Execute $env:ComSpec -Argument "/d /c `"$RunnerPath`"" -WorkingDirectory $RepoRoot
$intervalTrigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 5)
$startupTrigger = New-ScheduledTaskTrigger -AtStartup
$settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -StartWhenAvailable
$principal = New-ScheduledTaskPrincipal -UserId $TaskUser -LogonType S4U -RunLevel Limited
Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger @($intervalTrigger, $startupTrigger) -Settings $settings -Principal $principal -Force | Out-Null
Write-Output "Registered: $TaskName"
