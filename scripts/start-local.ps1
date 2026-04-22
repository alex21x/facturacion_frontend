param(
    [string]$ComposeFile = (Join-Path $PSScriptRoot "..\docker-compose.local.yml"),
    [switch]$SkipOpenBrowser
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

if (-not (Test-Path $clientConfig)) {
    throw "No existe .client-config.env. Ejecuta primero scripts/instalar-local.bat"
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
