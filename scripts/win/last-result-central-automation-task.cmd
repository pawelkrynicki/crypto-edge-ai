@echo off
setlocal
set "TASK_NAME=Crypto Edge AI Central Automation"
powershell.exe -NoProfile -Command "$task = Get-ScheduledTask -TaskName '%TASK_NAME%' -ErrorAction SilentlyContinue; if ($null -eq $task) { Write-Output 'NOT_INSTALLED'; exit 0 }; Get-ScheduledTaskInfo -TaskName '%TASK_NAME%' | Select-Object LastRunTime,LastTaskResult,NextRunTime,NumberOfMissedRuns | ConvertTo-Json"
exit /b %ERRORLEVEL%
