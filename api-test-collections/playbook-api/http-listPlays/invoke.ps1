if (-not $env:PLAYBOOK_ID) { throw "Set PLAYBOOK_ID to an existing playbook ID." }
& (Join-Path $PSScriptRoot "..\Invoke-Api.ps1") -Method Get -Path "/playbooks/$env:PLAYBOOK_ID/plays"