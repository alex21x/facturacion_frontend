
param(
    [string]$ComposeFile = (Join-Path $PSScriptRoot "..\docker-compose.local.yml"),
    [switch]$SkipOpenBrowser
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

    # Buscar en ubicaciones absolutas estándar de instalación
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

    # Buscar recursivamente desde el directorio del script hacia arriba
    $currentDir = Split-Path -Path $PSScriptRoot -Parent
    for ($i = 0; $i -lt 10; $i++) {  # Máximo 10 niveles hacia arriba
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

    # Candidatos relativos (para compatibilidad)
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

function Ensure-DockerEngineRunning {
    $script:DOCKER_WSL2_MODE = $false

    $dockerCommand = Get-Command docker -ErrorAction SilentlyContinue
    if ($dockerCommand) {
        docker info | Out-Null 2>&1
        if ($LASTEXITCODE -eq 0) {
            return
        }
    }

    if (Test-DockerViaWSL2) {
        Enable-DockerWslProxy
        $script:DOCKER_WSL2_MODE = $true
        Write-Host "Docker operativo via WSL2 (sin Docker Desktop)." -ForegroundColor Green
        return
    }

    $dockerDesktopExe = @(
        "$env:ProgramFiles\Docker\Docker\Docker Desktop.exe",
        "$env:LOCALAPPDATA\Docker\Docker Desktop.exe"
    ) | Where-Object { Test-Path $_ } | Select-Object -First 1

    if (-not $dockerDesktopExe) {
        throw "Docker no esta disponible. Activa Docker en WSL2 (Ubuntu) o Docker Desktop y vuelve a ejecutar."
    }

    Write-Host "Iniciando Docker Desktop..." -ForegroundColor Yellow
    Start-Process $dockerDesktopExe -ErrorAction SilentlyContinue

    for ($i = 1; $i -le 24; $i++) {
        Start-Sleep -Seconds 5
        docker info | Out-Null 2>&1
        if ($LASTEXITCODE -eq 0) {
            Write-Host "Docker listo." -ForegroundColor Green
            return
        }
    }

    throw "El engine Docker no respondio a tiempo. Espera un momento y vuelve a intentar."
}

function Test-DockerViaWSL2 {
    $wslCommand = Get-Command wsl -ErrorAction SilentlyContinue
    if (-not $wslCommand) {
        return $false
    }

    wsl -d Ubuntu -u root -e service docker start >$null 2>&1
    wsl -d Ubuntu -u root -e docker info >$null 2>&1
    return $LASTEXITCODE -eq 0
}

function Convert-ToWslPath {
    param([string]$Path)

    if ([string]::IsNullOrWhiteSpace($Path)) {
        return $Path
    }

    if ($Path -match '^[A-Za-z]:\\') {
        $drive = $Path.Substring(0,1).ToLowerInvariant()
        $tail = $Path.Substring(2) -replace '\\','/'
        return "/mnt/$drive$tail"
    }

    return $Path
}

function Enable-DockerWslProxy {
    function global:docker {
        $mappedArgs = @()
        foreach ($arg in $args) {
            $mappedArgs += Convert-ToWslPath -Path $arg
        }

        wsl -d Ubuntu -u root -e docker @mappedArgs
    }
}

function Test-IsAdministrator {
    $currentIdentity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($currentIdentity)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Get-WslPrimaryIpv4 {
    $ip = wsl -d Ubuntu -u root -e sh -lc "hostname -I 2>/dev/null | cut -d' ' -f1" 2>$null
    if ($LASTEXITCODE -ne 0) {
        return $null
    }

    $resolved = ($ip | Out-String).Trim()
    if ([string]::IsNullOrWhiteSpace($resolved)) {
        return $null
    }

    return $resolved
}

function Ensure-WslLocalhostPortProxy {
    param([int[]]$Ports)

    if (-not $script:DOCKER_WSL2_MODE) {
        return
    }

    if (-not (Test-IsAdministrator)) {
        Write-Host 'ADVERTENCIA: No se pudo aplicar puente WSL->127.0.0.1 porque PowerShell no tiene permisos de Administrador.' -ForegroundColor Yellow
        return
    }

    $wslIp = Get-WslPrimaryIpv4
    if ([string]::IsNullOrWhiteSpace($wslIp)) {
        Write-Host 'ADVERTENCIA: No se pudo detectar IP de WSL para configurar portproxy.' -ForegroundColor Yellow
        return
    }

    foreach ($port in $Ports) {
        netsh interface portproxy delete v4tov4 listenaddress=127.0.0.1 listenport=$port | Out-Null
        netsh interface portproxy add v4tov4 listenaddress=127.0.0.1 listenport=$port connectaddress=$wslIp connectport=$port protocol=tcp | Out-Null
        if ($LASTEXITCODE -ne 0) {
            Write-Host "ADVERTENCIA: No se pudo crear portproxy para 127.0.0.1:${port} -> ${wslIp}:${port}" -ForegroundColor Yellow
        }
    }
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
        Set-Content -Path $FilePath -Value "$Key=$Value"
        return
    }

    $lines = Get-Content $FilePath
    $updated = $false
    for ($i = 0; $i -lt $lines.Count; $i++) {
        if ($lines[$i] -match "^$Key=") {
            $lines[$i] = "$Key=$Value"
            $updated = $true
            break
        }
    }

    if (-not $updated) {
        $lines += "$Key=$Value"
    }

    Set-Content -Path $FilePath -Value $lines
}

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
function Get-LocalIpv4Addresses {
    $addresses = @()

    try {
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
    } catch {
        $addresses = Get-CimInstance Win32_NetworkAdapterConfiguration -ErrorAction SilentlyContinue |
            Where-Object { $_.IPEnabled -and $_.IPAddress } |
            ForEach-Object { $_.IPAddress } |
            Where-Object {
                $_ -match '^(\d{1,3}\.){3}\d{1,3}$' -and
                $_ -ne '127.0.0.1' -and
                $_ -ne '0.0.0.0' -and
                -not $_.StartsWith('169.254.') -and
                (Test-IsPrivateLanIpv4 -IpAddress $_)
            } |
            Select-Object -Unique
    }

    return @($addresses)
}

function Get-PrimaryLanIpv4 {
    try {
        $cfg = Get-NetIPConfiguration -ErrorAction Stop |
            Where-Object {
                $_.IPv4DefaultGateway -and
                $_.IPv4Address -and
                $_.IPv4Address.IPAddress -and
                $_.IPv4Address.IPAddress -ne '127.0.0.1' -and
                $_.IPv4Address.IPAddress -ne '0.0.0.0' -and
                -not $_.IPv4Address.IPAddress.StartsWith('169.254.') -and
                (Test-IsPrivateLanIpv4 -IpAddress $_.IPv4Address.IPAddress) -and
                -not (Test-IsVirtualAdapter -Alias $_.InterfaceAlias -Description $_.InterfaceDescription)
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

    if ($BindHost -ne '0.0.0.0') {
        if ([string]::IsNullOrWhiteSpace($BindHost)) {
            return '127.0.0.1'
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

    return '127.0.0.1'
}

function Test-ValidEmail {
    param([string]$Email)

    if ([string]::IsNullOrWhiteSpace($Email)) {
        return $false
    }

    return ($Email -match '^[^@\s]+@[^@\s]+\.[^@\s]+$')
}

$layout = Resolve-LocalLayout -ComposeFilePath $ComposeFile
$ComposeFile = $layout.ComposeFile
$frontendRoot = $layout.FrontendRoot
$clientConfig = Resolve-ClientConfig -RootPath $frontendRoot

if (-not $clientConfig) {
    throw "No existe .client-config.env. Ejecuta primero scripts/instalar-local.bat o setup-local.ps1 desde la carpeta raiz del instalador."
}

$composeProject = Get-ConfigValue -FilePath $clientConfig -Key "COMPOSE_PROJECT_NAME" -DefaultValue "facturacion_local"
$dockerBindHost = Get-ConfigValue -FilePath $clientConfig -Key "DOCKER_BIND_HOST" -DefaultValue "127.0.0.1"
$backendPort = Get-ConfigValue -FilePath $clientConfig -Key "BACKEND_PORT" -DefaultValue "8000"
$frontendPort = Get-ConfigValue -FilePath $clientConfig -Key "FRONTEND_PORT" -DefaultValue "5173"
$adminPort = Get-ConfigValue -FilePath $clientConfig -Key "ADMIN_PORT" -DefaultValue "5174"
$pgadminPort = Get-ConfigValue -FilePath $clientConfig -Key "PGADMIN_PORT" -DefaultValue "5050"
$pgadminEmail = Get-ConfigValue -FilePath $clientConfig -Key "PGADMIN_DEFAULT_EMAIL" -DefaultValue "admin@example.com"
$fallbackPgadminEmail = "admin@example.com"
if (-not (Test-ValidEmail -Email $pgadminEmail)) {
    Write-Host "PGADMIN_DEFAULT_EMAIL invalido en .client-config.env. Corrigiendo a $fallbackPgadminEmail..." -ForegroundColor Yellow
    $pgadminEmail = $fallbackPgadminEmail
    Set-ConfigValue -FilePath $clientConfig -Key "PGADMIN_DEFAULT_EMAIL" -Value $pgadminEmail
}
$defaultViteApiBaseUrl = if ($dockerBindHost -eq "0.0.0.0") { "" } else { "http://127.0.0.1:$backendPort" }
$viteApiBaseUrl = Get-ConfigValue -FilePath $clientConfig -Key "VITE_API_BASE_URL" -DefaultValue $defaultViteApiBaseUrl
$browserHost = Get-PreferredBrowserHost -BindHost $dockerBindHost
$frontendUrlValue = "http://${browserHost}:${frontendPort}"
$frontendAppUrlValue = "http://${browserHost}:${adminPort}"

$env:DOCKER_BIND_HOST = $dockerBindHost
$env:BACKEND_PORT = $backendPort
$env:FRONTEND_PORT = $frontendPort
$env:ADMIN_PORT = $adminPort
$env:PGADMIN_PORT = $pgadminPort
$env:PGADMIN_DEFAULT_EMAIL = $pgadminEmail
$env:VITE_API_BASE_URL = $viteApiBaseUrl
$env:FRONTEND_URL = $frontendUrlValue
$env:FRONTEND_APP_URL = $frontendAppUrlValue

$composeArgs = @("-p", $composeProject, "-f", $ComposeFile)

if ($dockerBindHost -eq "0.0.0.0") {
    $displayHost = "127.0.0.1"
} else {
    $displayHost = $dockerBindHost
}

Write-Host "Levantando sistema local..." -ForegroundColor Cyan
Ensure-DockerEngineRunning
docker compose @composeArgs up -d

if ($LASTEXITCODE -ne 0) {
    throw "No se pudo levantar el sistema local."
}

if ($script:DOCKER_WSL2_MODE -and $dockerBindHost -eq '127.0.0.1') {
    Ensure-WslLocalhostPortProxy -Ports @([int]$backendPort, [int]$frontendPort, [int]$adminPort, [int]$pgadminPort)
}

$frontendUrl = "http://${displayHost}:${frontendPort}"
Write-Host "Frontend: $frontendUrl" -ForegroundColor Green
Write-Host "Admin: http://${displayHost}:${adminPort}" -ForegroundColor Green
Write-Host "Backend: http://${displayHost}:${backendPort}" -ForegroundColor Green
Write-Host "pgAdmin: http://${displayHost}:${pgadminPort}" -ForegroundColor Green

$pgadminState = (docker compose @composeArgs ps --format json pgadmin | ConvertFrom-Json -ErrorAction SilentlyContinue)
if ($pgadminState -and $pgadminState.Count -gt 0) {
    $stateText = $pgadminState[0].State
    if ($stateText -ne 'running') {
        Write-Host "ADVERTENCIA: pgAdmin no quedo en estado running. Revisa logs con: docker compose @composeArgs logs pgadmin" -ForegroundColor Yellow
    }
}

function Open-Browser {
    param([string]$Url)

    # Intentar Chrome primero
    $chromePaths = @(
        "${env:ProgramFiles}\Google\Chrome\Application\chrome.exe",
        "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
        "${env:LOCALAPPDATA}\Google\Chrome\Application\chrome.exe"
    )

    foreach ($chromePath in $chromePaths) {
        if (Test-Path $chromePath) {
            try {
                Start-Process $chromePath $Url
                return
            } catch {
                # Continuar si falla
            }
        }
    }

    Write-Host "Chrome no esta instalado. No se abrira navegador automaticamente." -ForegroundColor Yellow
}

if (-not $SkipOpenBrowser) {
    Write-Host "Abriendo navegador..." -ForegroundColor Cyan
    Open-Browser -Url $frontendUrl
}
