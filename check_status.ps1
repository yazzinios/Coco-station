$PortainerUrl = "http://172.22.255.10:9000"
$ApiKey = "ptr_wDSLNuETf0la5NOkRCDsVnC7JipolifruR6rPLF56Mo="

$headers = @{
    "X-API-Key" = $ApiKey
}

Write-Host "--- Stacks ---"
Invoke-RestMethod -Uri "$PortainerUrl/api/stacks" -Headers $headers | Select-Object Id, Name, Status | Format-Table

Write-Host "--- Recent Images ---"
$images = Invoke-RestMethod -Uri "$PortainerUrl/api/endpoints/3/docker/images/json" -Headers $headers
$images | Sort-Object Created -Descending | Select-Object -First 10 -Property RepoTags, Created | Format-Table
