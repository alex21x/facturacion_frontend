param(
    [string]$ComposeFile = (Join-Path $PSScriptRoot "..\docker-compose.local.yml")
)

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

$frontendRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
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
Write-Host "  - Accesos directos del escritorio" -ForegroundColor Cyan
Write-Host ""

$confirm = Read-Host "Escribe 'DESINSTALAR' para confirmar (sin comillas)"

if ($confirm -ne "DESINSTALAR") {
    Write-Host ""
    Write-Host "Operacion cancelada." -ForegroundColor Green
    exit 0
}

if (-not (Test-Path $clientConfig)) {
    Write-Host ""
    Write-Host "No existe .client-config.env. Nada que desinstalar." -ForegroundColor Yellow
    exit 0
}

$composeProject = Get-ConfigValue -FilePath $clientConfig -Key "COMPOSE_PROJECT_NAME" -DefaultValue "facturacion_local"
$composeArgs = @("-p", $composeProject, "-f", $ComposeFile)

Write-Host ""
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
