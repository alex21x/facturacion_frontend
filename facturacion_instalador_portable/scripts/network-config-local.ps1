
param(
    [string]$ComposeFile = (Join-Path $PSScriptRoot "..\docker-compose.local.yml"),
    [switch]$EnableLanAccess
)

function Resolve-LocalLayout {
    param([string]$ComposeFilePath)

    $resolvedComposeFile = Resolve-Path $ComposeFilePath -ErrorAction SilentlyContinue
    if ($resolvedComposeFile) {
        return @{
            ComposeFile = $resolvedComposeFile.Path
            FrontendRoot = Split-Path -Path $resolvedComposeFile.Path -Parent
        }
    }

    $absoluteCandidates = @(
        "C:\FacturacionLocal\facturacion_frontend\docker-compose.local.yml",
        "C:\xampp\htdocs\facturacion_frontend\docker-compose.local.yml",
        "D:\FacturacionLocal\facturacion_frontend\docker-compose.local.yml"
    )

    foreach ($candidate in $absoluteCandidates) {
        if (Test-Path $candidate) {
            return @{
                ComposeFile = $candidate
                FrontendRoot = Split-Path -Path $candidate -Parent
            }
        }
    }

    $currentDir = Split-Path -Path $PSScriptRoot -Parent
    for ($i = 0; $i -lt 10; $i++) {
        if (-not $currentDir) { break }
        $candidateCompose = Join-Path $currentDir "docker-compose.local.yml"
        if (Test-Path $candidateCompose) {
            return @{
                ComposeFile = $candidateCompose
                FrontendRoot = $currentDir
            }
        }
        $currentDir = Split-Path -Path $currentDir -Parent
    }

    $relativeCandidates = @(
        (Join-Path $PSScriptRoot "..\facturacion_frontend"),
        (Join-Path $PSScriptRoot "..")
    )

    foreach ($candidate in $relativeCandidates) {
        $resolvedCandidate = Resolve-Path $candidate -ErrorAction SilentlyContinue
        if (-not $resolvedCandidate) {
            continue
        }

        $candidateCompose = Join-Path $resolvedCandidate.Path "docker-compose.local.yml"
        if (Test-Path $candidateCompose) {
            return @{
                ComposeFile = $candidateCompose
                FrontendRoot = $resolvedCandidate.Path
            }
        }
    }

    throw "No se encontro docker-compose.local.yml. Ejecuta primero scripts/instalar-local.bat o INSTALAR-FACTURACION.bat desde el paquete de instalacion."
}

function Resolve-ClientConfig {
    param([string]$RootPath)

    $candidates = @()
    $candidates += Join-Path $RootPath ".client-config.env"
    $candidates += Join-Path $RootPath "scripts\.client-config.env"
    $candidates += Join-Path (Split-Path -Path $RootPath -Parent) ".client-config.env"

    foreach ($candidate in $candidates) {
        if (Test-Path $candidate) {
            return $candidate
        }
    }

    return $null
}

function Get-ConfigValue {
    param(
        [string]$FilePath,
        [string]$Key,
        [string]$DefaultValue
    )

    if (-not (Test-Path $FilePath)) {
        return $DefaultValue
    }

    $match = Get-Content $FilePath | Where-Object { $_ -match "^$Key=" } | Select-Object -First 1
    if (-not $match) {
        return $DefaultValue
    }

    return ($match -split '=', 2)[1].Trim()
}

function Set-ConfigValue {
    param(
        [string]$FilePath,
        [string]$Key,
        [string]$Value
    )

    if (-not (Test-Path $FilePath)) {
        throw "Configuracion no existe. Ejecuta primero scripts/instalar-local.bat"
    }

    $lines = Get-Content $FilePath
    $updated = $false

    for ($index = 0; $index -lt $lines.Count; $index++) {
        if ($lines[$index] -match "^$Key=") {
            $lines[$index] = "$Key=$Value"
            $updated = $true
            break
        }
    }

    if (-not $updated) {
        $lines += "$Key=$Value"
    }

    Set-Content -Path $FilePath -Value $lines
}

function Set-BackendFrontendUrls {
    param(
        [string]$FrontendRoot,
        [string]$FrontendUrl,
        [string]$FrontendAppUrl
    )

    $backendRoot = Join-Path (Split-Path -Path $FrontendRoot -Parent) "facturacion_backend"
    $backendEnv = Join-Path $backendRoot ".env"

    if (-not (Test-Path $backendEnv)) {
        return
    }

    Set-ConfigValue -FilePath $backendEnv -Key "FRONTEND_URL" -Value $FrontendUrl
    Set-ConfigValue -FilePath $backendEnv -Key "FRONTEND_APP_URL" -Value $FrontendAppUrl
}

function Get-ApiBaseUrlConfigValue {
    param(
        [string]$BindHost,
        [string]$BackendPort
    )

    if ($BindHost -eq "0.0.0.0") {
        return ""
    }

    return "http://127.0.0.1:$BackendPort"
}

<<<<<<< HEAD
function Test-IsPrivateLanIpv4 {
    param([string]$IpAddress)

    if ([string]::IsNullOrWhiteSpace($IpAddress)) {
        return $false
    }

    return $IpAddress -match '^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.)'
}

function Test-IsVirtualAdapter {
    param(
        [string]$Alias,
        [string]$Description
    )

    $adapterText = ("$Alias $Description").ToLowerInvariant()
    $virtualHints = @(
        'vethernet', 'hyper-v', 'virtual', 'vmware', 'docker', 'wsl',
        'loopback', 'tunnel', 'teredo', 'isatap', 'tailscale', 'zerotier'
    )

    foreach ($hint in $virtualHints) {
        if ($adapterText.Contains($hint)) {
            return $true
        }
    }

    return $false
}

=======
>>>>>>> feature/cambios-generales
function Get-PrimaryLanIpv4 {
    try {
        $cfg = Get-NetIPConfiguration -ErrorAction Stop |
            Where-Object {
                $_.IPv4DefaultGateway -and
                $_.IPv4Address -and
                $_.IPv4Address.IPAddress -and
                $_.IPv4Address.IPAddress -ne '127.0.0.1' -and
                $_.IPv4Address.IPAddress -ne '0.0.0.0' -and
<<<<<<< HEAD
                -not $_.IPv4Address.IPAddress.StartsWith('169.254.') -and
                (Test-IsPrivateLanIpv4 -IpAddress $_.IPv4Address.IPAddress) -and
                -not (Test-IsVirtualAdapter -Alias $_.InterfaceAlias -Description $_.InterfaceDescription)
=======
                -not $_.IPv4Address.IPAddress.StartsWith('169.254.')
>>>>>>> feature/cambios-generales
            } |
            Select-Object -First 1

        if ($cfg -and $cfg.IPv4Address -and $cfg.IPv4Address.IPAddress) {
            return $cfg.IPv4Address.IPAddress
        }
    } catch {
        return $null
    }

    return $null
}

function Get-PreferredBrowserHost {
    param([string]$BindHost)

    if ($BindHost -ne "0.0.0.0") {
        if ([string]::IsNullOrWhiteSpace($BindHost)) {
            return "127.0.0.1"
        }

        return $BindHost
    }

    $primaryLanIp = Get-PrimaryLanIpv4
    if (-not [string]::IsNullOrWhiteSpace($primaryLanIp)) {
        return $primaryLanIp
    }

    $lanIps = Get-LocalIpv4Addresses
    if ($lanIps.Count -gt 0) {
        return $lanIps[0]
    }

    return "127.0.0.1"
}

function Get-LocalIpv4Addresses {
    $addresses = @()

    try {
<<<<<<< HEAD
        $addresses = Get-NetIPConfiguration -ErrorAction Stop |
            Where-Object {
                $_.IPv4Address -and
                -not (Test-IsVirtualAdapter -Alias $_.InterfaceAlias -Description $_.InterfaceDescription)
            } |
            ForEach-Object { $_.IPv4Address.IPAddress } |
            Where-Object {
                $_ -and
                $_ -ne '127.0.0.1' -and
                $_ -ne '0.0.0.0' -and
                -not $_.StartsWith('169.254.') -and
                (Test-IsPrivateLanIpv4 -IpAddress $_)
            } |
            Select-Object -Unique
=======
        $addresses = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction Stop |
            Where-Object {
                $_.IPAddress -and
                $_.IPAddress -ne '127.0.0.1' -and
                $_.IPAddress -ne '0.0.0.0' -and
                -not $_.IPAddress.StartsWith('169.254.')
            } |
            Select-Object -ExpandProperty IPAddress -Unique
>>>>>>> feature/cambios-generales
    } catch {
        $addresses = Get-CimInstance Win32_NetworkAdapterConfiguration -ErrorAction SilentlyContinue |
            Where-Object { $_.IPEnabled -and $_.IPAddress } |
            ForEach-Object { $_.IPAddress } |
            Where-Object {
                $_ -match '^(\d{1,3}\.){3}\d{1,3}$' -and
                $_ -ne '127.0.0.1' -and
                $_ -ne '0.0.0.0' -and
<<<<<<< HEAD
                -not $_.StartsWith('169.254.') -and
                (Test-IsPrivateLanIpv4 -IpAddress $_)
=======
                -not $_.StartsWith('169.254.')
>>>>>>> feature/cambios-generales
            } |
            Select-Object -Unique
    }

    return @($addresses)
}

function Remove-FacturacionFirewallRules {
    param([int[]]$Ports)

    foreach ($port in $Ports) {
        $ruleName = "Facturacion Local $port"
        netsh advfirewall firewall delete rule name="$ruleName" | Out-Null
    }
}

function Ensure-FacturacionFirewallRules {
    param([int[]]$Ports)

    foreach ($port in $Ports) {
        $ruleName = "Facturacion Local $port"
        netsh advfirewall firewall delete rule name="$ruleName" | Out-Null
        netsh advfirewall firewall add rule name="$ruleName" dir=in action=allow protocol=TCP localport=$port profile=private,domain | Out-Null
        if ($LASTEXITCODE -ne 0) {
            throw "No se pudo abrir el puerto $port en el firewall de Windows."
        }
    }
}

$layout = Resolve-LocalLayout -ComposeFilePath $ComposeFile
$ComposeFile = $layout.ComposeFile
$frontendRoot = $layout.FrontendRoot
$clientConfig = Resolve-ClientConfig -RootPath $frontendRoot

if (-not $clientConfig) {
    throw "Configuracion no existe. Ejecuta primero scripts/instalar-local.bat"
}

$composeProject = Get-ConfigValue -FilePath $clientConfig -Key "COMPOSE_PROJECT_NAME" -DefaultValue "facturacion_local"
$currentBindHost = Get-ConfigValue -FilePath $clientConfig -Key "DOCKER_BIND_HOST" -DefaultValue "127.0.0.1"
$backendPort = Get-ConfigValue -FilePath $clientConfig -Key "BACKEND_PORT" -DefaultValue "8000"
$frontendPort = Get-ConfigValue -FilePath $clientConfig -Key "FRONTEND_PORT" -DefaultValue "5173"
$adminPort = Get-ConfigValue -FilePath $clientConfig -Key "ADMIN_PORT" -DefaultValue "5174"

Write-Host ""
Write-Host "==== CAMBIAR ACCESO REMOTO ====" -ForegroundColor Cyan
Write-Host ""
Write-Host "Acceso actual: $currentBindHost" -ForegroundColor Yellow
Write-Host ""

$newAllowNetworkAccess = $false
if ($NonInteractive) {
    $newAllowNetworkAccess = $EnableLanAccess.IsPresent
} else {
    Write-Host "¿Deseas permitir acceso desde otras PCs de la red? (s/n)" -ForegroundColor Cyan
    write-host "  - (s)í = Sistema accesible en toda la red (0.0.0.0)" -ForegroundColor Gray
    write-host "  - (n)o = Solo en esta PC (127.0.0.1)" -ForegroundColor Gray
    $choice = Read-Host "Opcion"
    if ($choice -eq "s") {
        $newAllowNetworkAccess = $true
    }
}

$newBindHost = if ($newAllowNetworkAccess) { "0.0.0.0" } else { "127.0.0.1" }

$browserHost = Get-PreferredBrowserHost -BindHost $newBindHost
$frontendUrl = "http://${browserHost}:${frontendPort}"
$frontendAppUrl = "http://${browserHost}:${adminPort}"
$currentFrontendUrl = Get-ConfigValue -FilePath $clientConfig -Key "FRONTEND_URL" -DefaultValue ""
$currentFrontendAppUrl = Get-ConfigValue -FilePath $clientConfig -Key "FRONTEND_APP_URL" -DefaultValue ""

if ($newBindHost -eq $currentBindHost -and $currentFrontendUrl -eq $frontendUrl -and $currentFrontendAppUrl -eq $frontendAppUrl) {
    Write-Host ""
    Write-Host "✓ Sin cambios necesarios." -ForegroundColor Green
    exit 0
}

Write-Host ""
Write-Host "Actualizando configuracion..." -ForegroundColor Cyan

Set-ConfigValue -FilePath $clientConfig -Key "DOCKER_BIND_HOST" -Value $newBindHost
Set-ConfigValue -FilePath $clientConfig -Key "VITE_API_BASE_URL" -Value (Get-ApiBaseUrlConfigValue -BindHost $newBindHost -BackendPort $backendPort)
Set-ConfigValue -FilePath $clientConfig -Key "FRONTEND_URL" -Value $frontendUrl
Set-ConfigValue -FilePath $clientConfig -Key "FRONTEND_APP_URL" -Value $frontendAppUrl
Set-BackendFrontendUrls -FrontendRoot $frontendRoot -FrontendUrl $frontendUrl -FrontendAppUrl $frontendAppUrl

Write-Host ""
Write-Host "Deteniendo servicios actuales..." -ForegroundColor Cyan

$composeArgs = @("-p", $composeProject, "-f", $ComposeFile)
$env:DOCKER_BIND_HOST = $newBindHost
$env:BACKEND_PORT = $backendPort
$env:FRONTEND_PORT = $frontendPort
$env:ADMIN_PORT = $adminPort
$env:VITE_API_BASE_URL = Get-ApiBaseUrlConfigValue -BindHost $newBindHost -BackendPort $backendPort
$env:FRONTEND_URL = $frontendUrl
$env:FRONTEND_APP_URL = $frontendAppUrl

docker compose @composeArgs down

if ($LASTEXITCODE -ne 0) {
    throw "No se pudo detener los servicios."
}

Write-Host ""
Write-Host "Reiniciando servicios con nueva configuracion..." -ForegroundColor Cyan
docker compose @composeArgs up -d

if ($LASTEXITCODE -ne 0) {
    throw "No se pudo reiniciar los servicios."
}

if ($newAllowNetworkAccess) {
    Ensure-FacturacionFirewallRules -Ports @([int]$backendPort, [int]$frontendPort, [int]$adminPort)
} else {
    Remove-FacturacionFirewallRules -Ports @([int]$backendPort, [int]$frontendPort, [int]$adminPort)
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  ✅ CONFIGURACION ACTUALIZADA" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
if ($newAllowNetworkAccess) {
    Write-Host "🌐 ACCESO REMOTO: Habilitado" -ForegroundColor Green
    Write-Host "    Desde esta PC:   http://127.0.0.1:${frontendPort}" -ForegroundColor Gray
    $lanIps = Get-LocalIpv4Addresses
    foreach ($ip in $lanIps) {
        Write-Host "    Desde otra PC:   http://${ip}:${frontendPort}" -ForegroundColor Gray
    }
} else {
    Write-Host "🔒 ACCESO REMOTO: Deshabilitado" -ForegroundColor Yellow
    Write-Host "    Accesible solo desde esta PC: http://127.0.0.1:${frontendPort}" -ForegroundColor Gray
}
Write-Host ""
