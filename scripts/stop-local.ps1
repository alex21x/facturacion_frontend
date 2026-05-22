param(
    [string]$ComposeFile = (Join-Path $PSScriptRoot "..\docker-compose.local.yml")
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

function Ensure-DockerEngineRunning {
    $dockerCommand = Get-Command docker -ErrorAction SilentlyContinue
    if ($dockerCommand) {
        docker info | Out-Null 2>&1
        if ($LASTEXITCODE -eq 0) {
            return
        }
    }

    if (Test-DockerViaWSL2) {
        Enable-DockerWslProxy
        Write-Host "Docker operativo via WSL2 (sin Docker Desktop)." -ForegroundColor Green
        return
    }

    throw "Docker no esta disponible. Activa Docker en WSL2 (Ubuntu) o Docker Desktop y vuelve a ejecutar."
}

$layout = Resolve-LocalLayout -ComposeFilePath $ComposeFile
$ComposeFile = $layout.ComposeFile
$frontendRoot = $layout.FrontendRoot
$clientConfig = Resolve-ClientConfig -RootPath $frontendRoot
if (-not $clientConfig) {
    throw "No existe .client-config.env. Ejecuta primero scripts/instalar-local.bat o setup-local.ps1 desde la carpeta raiz del instalador."
}
$composeProject = Get-ConfigValue -FilePath $clientConfig -Key "COMPOSE_PROJECT_NAME" -DefaultValue "facturacion_local"

$composeArgs = @("-p", $composeProject, "-f", $ComposeFile)

Write-Host "Apagando sistema local..." -ForegroundColor Cyan
Ensure-DockerEngineRunning
docker compose @composeArgs stop

if ($LASTEXITCODE -ne 0) {
    throw "No se pudo apagar el sistema local."
}

Write-Host "Sistema local apagado correctamente." -ForegroundColor Green
Write-Host "Datos preservados en volumenes Docker." -ForegroundColor Green
Write-Host "Para levantar el sistema de nuevo, ejecuta: Facturacion - Levantar" -ForegroundColor Cyan
