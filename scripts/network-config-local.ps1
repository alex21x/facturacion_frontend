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

$frontendRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$clientConfig = Join-Path $frontendRoot ".client-config.env"

if (-not (Test-Path $clientConfig)) {
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
Write-Host "¿Deseas permitir acceso desde otras PCs de la red? (s/n)" -ForegroundColor Cyan
write-host "  - (s)í = Sistema accesible en toda la red (0.0.0.0)" -ForegroundColor Gray
write-host "  - (n)o = Solo en esta PC (127.0.0.1)" -ForegroundColor Gray
$choice = Read-Host "Opcion"
if ($choice -eq "s") {
    $newAllowNetworkAccess = $true
}

$newBindHost = if ($newAllowNetworkAccess) { "0.0.0.0" } else { "127.0.0.1" }

if ($newBindHost -eq $currentBindHost) {
    Write-Host ""
    Write-Host "✓ Sin cambios necesarios." -ForegroundColor Green
    exit 0
}

Write-Host ""
Write-Host "Actualizando configuracion..." -ForegroundColor Cyan

Set-ConfigValue -FilePath $clientConfig -Key "DOCKER_BIND_HOST" -Value $newBindHost
Set-ConfigValue -FilePath $clientConfig -Key "VITE_API_BASE_URL" -Value "http://${newBindHost}:${backendPort}"

Write-Host ""
Write-Host "Deteniendo servicios actuales..." -ForegroundColor Cyan

$composeArgs = @("-p", $composeProject, "-f", $ComposeFile)
$env:DOCKER_BIND_HOST = $newBindHost
$env:BACKEND_PORT = $backendPort
$env:FRONTEND_PORT = $frontendPort
$env:ADMIN_PORT = $adminPort
$env:VITE_API_BASE_URL = "http://${newBindHost}:${backendPort}"

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

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  ✅ CONFIGURACION ACTUALIZADA" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
if ($newAllowNetworkAccess) {
    Write-Host "🌐 ACCESO REMOTO: Habilitado" -ForegroundColor Green
    Write-Host "    Accesible desde: http://0.0.0.0:${frontendPort}" -ForegroundColor Gray
    Write-Host "    Desde esta PC:   http://127.0.0.1:${frontendPort}" -ForegroundColor Gray
} else {
    Write-Host "🔒 ACCESO REMOTO: Deshabilitado" -ForegroundColor Yellow
    Write-Host "    Accesible solo desde esta PC: http://127.0.0.1:${frontendPort}" -ForegroundColor Gray
}
Write-Host ""
