$PortainerUrl = "http://172.22.255.10:9000"
$ApiKey = "ptr_wDSLNuETf0la5NOkRCDsVnC7JipolifruR6rPLF56Mo="
$headers = @{ "X-API-Key" = $ApiKey }

$containers = Invoke-RestMethod -Uri "$PortainerUrl/api/endpoints/3/docker/containers/json?all=1" -Headers $headers
$containers | ForEach-Object {
    $name = $_.Names[0]
    $ports = $_.Ports | ForEach-Object { "$($_.PublicPort)->$($_.PrivatePort)/$($_.Type)" }
    [PSCustomObject]@{
        Name = $name
        Ports = $ports -join ", "
        State = $_.State
    }
} | Format-Table
