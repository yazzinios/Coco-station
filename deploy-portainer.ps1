param (
    [Parameter(Mandatory=$false)][string]$PortainerUrl = "http://localhost:9000",
    [Parameter(Mandatory=$true)][string]$ApiKey,
    [Parameter(Mandatory=$false)][string]$StackName = "cocostation",
    [Parameter(Mandatory=$false)][int]$EndpointId = 1
)

$Host.UI.RawUI.WindowTitle = "Deploying CocoStation to Portainer"

Write-Host "Deploying stack '$StackName' to Portainer at $PortainerUrl (Endpoint $EndpointId)..." -ForegroundColor Cyan

# Read docker-compose.yml
$composeFile = Join-Path -Path $PSScriptRoot -ChildPath "docker-compose.yml"
if (-Not (Test-Path $composeFile)) {
    Write-Host "Error: docker-compose.yml not found at $composeFile" -ForegroundColor Red
    exit 1
}

$composeContent = Get-Content -Path $composeFile -Raw

# Prepare JSON payload
$payload = @{
    name = $StackName
    stackFileContent = $composeContent
} | ConvertTo-Json -Depth 10

# API Request
$uri = "$PortainerUrl/api/stacks/create/standalone/string?endpointId=$EndpointId"
$headers = @{
    "X-API-Key" = $ApiKey
    "Content-Type" = "application/json"
}

try {
    $response = Invoke-RestMethod -Uri $uri -Method Post -Headers $headers -Body $payload
    Write-Host "Success! Stack deployed." -ForegroundColor Green
    Write-Host "Stack ID: $($response.Id)" -ForegroundColor Green
} catch {
    Write-Host "Failed to deploy stack." -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    if ($_.ErrorDetails) {
        Write-Host $_.ErrorDetails.Message -ForegroundColor DarkGray
    }
}
