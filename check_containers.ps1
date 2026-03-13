$PortainerUrl = "http://172.22.255.10:9000"
$ApiKey = "ptr_wDSLNuETf0la5NOkRCDsVnC7JipolifruR6rPLF56Mo="
$headers = @{ "X-API-Key" = $ApiKey }

Write-Host "--- Containers ---"
$containers = Invoke-RestMethod -Uri "$PortainerUrl/api/endpoints/3/docker/containers/json?all=1" -Headers $headers
$containers | Select-Object Names, State, Status | Format-Table
