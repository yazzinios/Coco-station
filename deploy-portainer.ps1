param (
    [Parameter(Mandatory=$false)][string]$PortainerUrl = "http://localhost:9000",
    [Parameter(Mandatory=$true)][string]$ApiKey,
    [Parameter(Mandatory=$false)][string]$StackName = "cocostation",
    [Parameter(Mandatory=$false)][int]$EndpointId = 1,
    [Parameter(Mandatory=$false)][string]$ComposeFile = "docker-compose.yml"
)

$Host.UI.RawUI.WindowTitle = "Deploying CocoStation to Portainer"

Write-Host "Deploying stack '$StackName' to Portainer at $PortainerUrl (Endpoint $EndpointId)..." -ForegroundColor Cyan

# Read Compose file
$composeFilePath = Join-Path -Path $PSScriptRoot -ChildPath $ComposeFile
if (-Not (Test-Path $composeFilePath)) {
    Write-Host "Error: Compose file not found at $composeFilePath" -ForegroundColor Red
    exit 1
}

$composeContent = Get-Content -Path $composeFilePath -Raw

# Read .env and prepare Env array
$envArray = @()
$envFile = Join-Path -Path $PSScriptRoot -ChildPath ".env"
if (Test-Path $envFile) {
    Get-Content $envFile | ForEach-Object {
        if (!([string]::IsNullOrWhiteSpace($_)) -and !($_.StartsWith("#"))) {
            $parts = $_.Split("=", 2)
            if ($parts.Length -eq 2) {
                $envArray += @{
                    name = $parts[0]
                    value = $parts[1]
                }
            }
        }
    }
}

# Prepare JSON payload
$payload = @{
    Name = $StackName
    StackFileContent = $composeContent
    Env = $envArray
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
    if ($_.Exception.Response) {
        try {
            $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
            $body = $reader.ReadToEnd()
            Write-Host "Response Body: $body" -ForegroundColor Yellow
        } catch {
            Write-Host "Could not read response body." -ForegroundColor Gray
        }
    }
}
