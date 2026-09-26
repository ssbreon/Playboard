if (-not $env:EXPORT_ID) { throw "Set EXPORT_ID to an existing export ID." }
& (Join-Path $PSScriptRoot "..\Invoke-Api.ps1") -Method Get -Path "/exports/$env:EXPORT_ID"