param(
    [string]$ComposeFile = (Join-Path $PSScriptRoot "..\docker-compose.local.yml")
)

function Resolve-LocalLayout {
    param([string]$ComposeFilePath)

    $composeCandidates = New-Object System.Collections.Generic.List[string]

    $resolvedComposeFile = Resolve-Path $ComposeFilePath -ErrorAction SilentlyContinue
    if ($resolvedComposeFile) {
        [void]$composeCandidates.Add($resolvedComposeFile.Path)
    }

    $absoluteCandidates = @(
        "C:\FacturacionLocal\facturacion_frontend\docker-compose.local.yml",
        "C:\xampp\htdocs\facturacion_frontend\docker-compose.local.yml",
        "D:\FacturacionLocal\facturacion_frontend\docker-compose.local.yml"
    )

    foreach ($candidate in $absoluteCandidates) {
        if (Test-Path $candidate) {
            [void]$composeCandidates.Add($candidate)
        }
    }

    $currentDir = Split-Path -Path $PSScriptRoot -Parent
    for ($i = 0; $i -lt 10; $i++) {
        if (-not $currentDir) { break }
        $candidateCompose = Join-Path $currentDir "docker-compose.local.yml"
        if (Test-Path $candidateCompose) {
            [void]$composeCandidates.Add($candidateCompose)
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
            [void]$composeCandidates.Add($candidateCompose)
        }
    }

    $selected = $null
    $fallback = $null
    foreach ($candidate in ($composeCandidates | Select-Object -Unique)) {
        $candidateRoot = Split-Path -Path $candidate -Parent
        $candidateConfig = Join-Path $candidateRoot ".client-config.env"

        if (-not $fallback) {
            $fallback = @{
                ComposeFile = $candidate
                FrontendRoot = $candidateRoot
            }
        }

        if (Test-Path $candidateConfig) {
            $selected = @{
                ComposeFile = $candidate
                FrontendRoot = $candidateRoot
            }
            break
        }
    }

    if ($selected) {
        return $selected
    }

    if ($fallback) {
        return $fallback
    }

    throw "No se encontro docker-compose.local.yml. Ejecuta primero scripts/instalar-local.bat o INSTALAR-FACTURACION.bat desde el paquete de instalacion."
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

function Initialize-DockerRuntime {
    $dockerCommand = Get-Command docker -ErrorAction SilentlyContinue
    if ($dockerCommand) {
        docker info | Out-Null 2>&1
        if ($LASTEXITCODE -eq 0) {
            return $true
        }
    }

    if (Test-DockerViaWSL2) {
        Enable-DockerWslProxy
        Write-Host "Docker operativo via WSL2 (sin Docker Desktop)." -ForegroundColor Green
        return $true
    }

    return $false
}

function Remove-FacturacionShortcuts {
    $desktopPath = [Environment]::GetFolderPath('Desktop')
    $shortcutNames = @(
        'Facturacion - Levantar.lnk',
        'Facturacion - Apagar.lnk',
        'Facturacion - Config Red.lnk',
        'Facturacion - Limpiar Transacciones.lnk',
        'Facturacion - pgAdmin.lnk',
        'Facturacion - Actualizar.lnk',
        'Facturacion - Desinstalar.lnk'
    )

    foreach ($shortcutName in $shortcutNames) {
        $shortcutPath = Join-Path $desktopPath $shortcutName
        if (Test-Path $shortcutPath) {
            Remove-Item $shortcutPath -Force -ErrorAction SilentlyContinue
        }
    }
}

$layout = Resolve-LocalLayout -ComposeFilePath $ComposeFile
$ComposeFile = $layout.ComposeFile
$frontendRoot = $layout.FrontendRoot
$clientConfig = Join-Path $frontendRoot ".client-config.env"

Write-Host ""
Write-Host "============================================================" -ForegroundColor Red
Write-Host "  ADVERTENCIA: DESINSTALAR FACTURACION LOCAL" -ForegroundColor Red
Write-Host "============================================================" -ForegroundColor Red
Write-Host ""
Write-Host "Esta operacion eliminara:" -ForegroundColor Yellow
Write-Host "  - Contenedores Docker (postgres, backend, frontend, admin)" -ForegroundColor Yellow
Write-Host "  - Volumenes de datos (incluye BD completa)" -ForegroundColor Yellow
Write-Host "  - Imagenes Docker compiladas" -ForegroundColor Yellow
Write-Host ""
Write-Host "NO se eliminaran:" -ForegroundColor Cyan
Write-Host "  - Archivos de codigo fuente (backend/frontend)" -ForegroundColor Cyan
Write-Host "  - .client-config.env (configuracion)" -ForegroundColor Cyan
Write-Host "  - Archivos de backup fuera de Docker" -ForegroundColor Cyan
Write-Host ""

$confirm = Read-Host "Escribe 'DESINSTALAR' para confirmar (sin comillas)"

if ($confirm -ne "DESINSTALAR") {
    Write-Host ""
    Write-Host "Operacion cancelada." -ForegroundColor Green
    exit 0
}

$composeProject = "facturacion_local"
if (-not (Test-Path $clientConfig)) {
    Write-Host ""
    Write-Host "No existe .client-config.env. Se usara COMPOSE_PROJECT_NAME=facturacion_local por defecto." -ForegroundColor Yellow
} else {
    $composeProject = Get-ConfigValue -FilePath $clientConfig -Key "COMPOSE_PROJECT_NAME" -DefaultValue "facturacion_local"
}
$composeArgs = @("-p", $composeProject, "-f", $ComposeFile)
$dockerReady = Initialize-DockerRuntime

Write-Host ""
if ($dockerReady) {
    Write-Host "Deteniendo servicios..." -ForegroundColor Cyan
    docker compose @composeArgs stop 2>$null | Out-Null

    Write-Host "Eliminando contenedores..." -ForegroundColor Cyan
    docker compose @composeArgs down --remove-orphans 2>$null | Out-Null

    Write-Host "Eliminando volumenes..." -ForegroundColor Cyan
    docker compose @composeArgs down -v --remove-orphans 2>$null | Out-Null

    Write-Host "Eliminando imagenes compiladas..." -ForegroundColor Cyan
    docker image rm "${composeProject}-backend" 2>$null | Out-Null
    docker image rm "${composeProject}-frontend" 2>$null | Out-Null
    docker image rm "${composeProject}-admin" 2>$null | Out-Null
} else {
    Write-Host "ADVERTENCIA: Docker no esta disponible en Windows ni WSL2. Se omite limpieza de contenedores/volumenes." -ForegroundColor Yellow
}

Write-Host "Eliminando accesos directos del escritorio..." -ForegroundColor Cyan
Remove-FacturacionShortcuts

Write-Host ""
Write-Host "============================================================" -ForegroundColor Green
Write-Host "  DESINSTALACION COMPLETADA" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Green
Write-Host ""
Write-Host "Pasos siguientes:" -ForegroundColor Cyan
Write-Host "  1. Ejecuta: powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\instalar-local.bat" -ForegroundColor White
Write-Host "  2. O haz doble click en: Facturacion - Instalar (escritorio)" -ForegroundColor White
Write-Host ""
Write-Host "Tu .client-config.env se ha preservado para proximas instalaciones." -ForegroundColor Gray
Write-Host ""
