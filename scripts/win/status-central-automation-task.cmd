@echo off
setlocal
set "TASK_NAME=Crypto Edge AI Central Automation"
powershell.exe -NoProfile -Command "$task = Get-ScheduledTask -TaskName '%TASK_NAME%' -ErrorAction SilentlyContinue; if ($null -eq $task) { Write-Output 'NOT_INSTALLED'; exit 0 }; $info = Get-ScheduledTaskInfo -TaskName '%TASK_NAME%'; [pscustomobject]@{ TaskName=$task.TaskName; State=$task.State; LastRunTime=$info.LastRunTime; LastTaskResult=$info.LastTaskResult; NextRunTime=$info.NextRunTime } | ConvertTo-Json"
exit /b %ERRORLEVEL%
