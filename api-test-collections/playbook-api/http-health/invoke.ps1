$baseUrl = if ($env:BASE_URL) { $env:BASE_URL } else { "http://localhost:7071/api" }
Invoke-RestMethod -Uri "$baseUrl/health" -Method Get
