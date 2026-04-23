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

    $envPath = Join-Path $RootPath ".client-config.env"
    if (Test-Path $envPath) {
        return $envPath
    }

    $possibleRoot = Join-Path $RootPath "scripts"
    $envPath = Join-Path $possibleRoot ".client-config.env"
    if (Test-Path $envPath) {
        return $envPath
    }

    return $null
}

function Ensure-DockerEngineRunning {
    docker info | Out-Null 2>&1
    if ($LASTEXITCODE -eq 0) {
        return
    }

    $dockerDesktopExe = @(
        "$env:ProgramFiles\Docker\Docker\Docker Desktop.exe",
        "$env:LOCALAPPDATA\Docker\Docker Desktop.exe"
    ) | Where-Object { Test-Path $_ } | Select-Object -First 1

    if (-not $dockerDesktopExe) {
        throw "Docker no esta disponible. Instala Docker Desktop y vuelve a ejecutar."
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

    throw "Docker Desktop no respondio a tiempo. Espera un momento y vuelve a intentar."
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
$viteApiBaseUrl = Get-ConfigValue -FilePath $clientConfig -Key "VITE_API_BASE_URL" -DefaultValue ("http://{0}:{1}" -f $dockerBindHost, $backendPort)

$env:DOCKER_BIND_HOST = $dockerBindHost
$env:BACKEND_PORT = $backendPort
$env:FRONTEND_PORT = $frontendPort
$env:ADMIN_PORT = $adminPort
$env:VITE_API_BASE_URL = $viteApiBaseUrl

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

$frontendUrl = "http://${displayHost}:${frontendPort}"
Write-Host "Frontend: $frontendUrl" -ForegroundColor Green
Write-Host "Admin: http://${displayHost}:${adminPort}" -ForegroundColor Green
Write-Host "Backend: http://${displayHost}:${backendPort}" -ForegroundColor Green

if (-not $SkipOpenBrowser) {
    Write-Host "Abriendo navegador..." -ForegroundColor Cyan
    Start-Process explorer.exe $frontendUrl
}
