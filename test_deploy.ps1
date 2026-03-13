$PortainerUrl = "http://172.22.255.10:9000"
$ApiKey = "ptr_wDSLNuETf0la5NOkRCDsVnC7JipolifruR6rPLF56Mo="
$headers = @{ 
    "X-API-Key" = $ApiKey 
    "Content-Type" = "application/json"
}

$payload = @{
    name = "test-mini"
    stackFileContent = "version: '3.8'`nservices:`n  web:`n    image: nginx:alpine"
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "$PortainerUrl/api/stacks/create/standalone/string?endpointId=3" -Method Post -Headers $headers -Body $payload
    Write-Host "Success! Stack ID: $($response.Id)" -ForegroundColor Green
} catch {
    Write-Host "Failed!" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    if ($_.ErrorDetails) {
        Write-Host $_.ErrorDetails.Message -ForegroundColor DarkGray
    }
    # Try to read the body of the error response
    if ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $body = $reader.ReadToEnd()
        Write-Host "Response Body: $body" -ForegroundColor Yellow
    }
}
