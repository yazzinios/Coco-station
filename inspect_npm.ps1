$PortainerUrl = "http://172.22.255.10:9000"
$ApiKey = "ptr_wDSLNuETf0la5NOkRCDsVnC7JipolifruR6rPLF56Mo="
$headers = @{ "X-API-Key" = $ApiKey }

$inspect = Invoke-RestMethod -Uri "$PortainerUrl/api/endpoints/3/docker/containers/npm/json" -Headers $headers
$inspect.Mounts | ForEach-Object {
    [PSCustomObject]@{
        Source = $_.Source
        Destination = $_.Destination
        Mode = $_.Mode
    }
} | Format-Table -Wrap
