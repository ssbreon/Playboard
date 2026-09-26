param(
  [Parameter(Mandatory = $true)][string]$Method,
  [Parameter(Mandatory = $true)][string]$Path,
  [string]$BodyPath
)

$baseUrl = if ($env:BASE_URL) { $env:BASE_URL.TrimEnd('/') } else { "http://localhost:7071/api" }
$request = @{ Uri = "$baseUrl$Path"; Method = $Method }
if ($BodyPath) {
  $request.ContentType = "application/json"
  $request.Body = Get-Content -Raw -Path $BodyPath
}
Invoke-RestMethod @request