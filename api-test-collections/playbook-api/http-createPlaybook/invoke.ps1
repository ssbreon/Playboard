$baseUrl = if ($env:BASE_URL) { $env:BASE_URL } else { "http://localhost:7071/api" }
$body = Get-Content -Raw -Path (Join-Path $PSScriptRoot "sample-data.json")
Invoke-RestMethod -Uri "$baseUrl/playbooks" -Method Post -ContentType "application/json" -Body $body
