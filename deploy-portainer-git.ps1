param (
    [Parameter(Mandatory=$false)][string]$PortainerUrl = "http://localhost:9000",
    [Parameter(Mandatory=$true)][string]$ApiKey,
    [Parameter(Mandatory=$false)][string]$StackName = "cocostation",
    [Parameter(Mandatory=$false)][int]$EndpointId = 1,
    [Parameter(Mandatory=$false)][string]$RepoUrl = "https://github.com/yazzinios/Coco-station.git",
    [Parameter(Mandatory=$false)][string]$ComposeFile = "docker-compose.yml"
)

$Host.UI.RawUI.WindowTitle = "Deploying CocoStation to Portainer via Git"

Write-Host "Deploying stack '$StackName' to Portainer at $PortainerUrl (Endpoint $EndpointId)..." -ForegroundColor Cyan
Write-Host "Pulling from Repository: $RepoUrl" -ForegroundColor Cyan

# We read the .env file locally and send it as Portainer environment variables
$envArray = @()
$envFile = Join-Path -Path $PSScriptRoot -ChildPath ".env"
if (Test-Path $envFile) {
    foreach ($line in Get-Content $envFile) {
        if (!([string]::IsNullOrWhiteSpace($line)) -and !$line.StartsWith("#")) {
            $parts = $line.Split("=", 2)
            if ($parts.Length -eq 2) {
                $envArray += @{
                    name = $parts[0]
                    value = $parts[1]
                }
            }
        }
    }
    Write-Host "Loaded $($envArray.Count) environment variables from .env" -ForegroundColor DarkGray
}

$payload = @{
    name = $StackName
    repositoryURL = $RepoUrl
    repositoryReferenceName = "refs/heads/main"
    composeFile = $ComposeFile
    env = $envArray
} | ConvertTo-Json -Depth 10

# Note: Using create/standalone/repository API allows Portainer to clone the github repo. 
# This way, all the folders (dashboard, api, ffmpeg-mixer) are present when Docker Compose builds the images!
$uri = "$PortainerUrl/api/stacks/create/standalone/repository?endpointId=$EndpointId"
$headers = @{
    "X-API-Key" = $ApiKey
    "Content-Type" = "application/json"
}

try {
    Write-Host "Sending deployment request to Portainer (this may take a few minutes as it builds images)..." -ForegroundColor Yellow
    $response = Invoke-RestMethod -Uri $uri -Method Post -Headers $headers -Body $payload -TimeoutSec 600
    Write-Host "Success! Stack deployed." -ForegroundColor Green
    Write-Host "Stack ID: $($response.Id)" -ForegroundColor Green
} catch {
    Write-Host "Failed to deploy stack." -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    if ($_.ErrorDetails) {
        Write-Host $_.ErrorDetails.Message -ForegroundColor DarkGray
    }
}
