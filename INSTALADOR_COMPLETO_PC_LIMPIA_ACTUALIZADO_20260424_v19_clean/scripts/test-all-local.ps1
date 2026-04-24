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

function Test-HttpOk {
    param(
        [string]$Url,
        [int]$TimeoutSec = 8
    )

    try {
        $null = Invoke-WebRequest -Uri $Url -TimeoutSec $TimeoutSec -ErrorAction Stop
        return $true
    }
    catch {
        return $false
    }
}

function Test-AuthLogin {
    param(
        [string]$BaseUrl
    )

    try {
        $body = @{
            username = 'admin'
            password = 'Admin123456!'
            device_id = 'test-validation'
            device_name = 'Validation Script'
        } | ConvertTo-Json

        $response = Invoke-WebRequest -Uri "$BaseUrl/api/auth/login" -Method Post -ContentType 'application/json' -Body $body -TimeoutSec 15 -ErrorAction Stop
        if ($response.StatusCode -ne 200) {
            return $false
        }

        $json = $response.Content | ConvertFrom-Json
        return $json.user.username -eq 'admin'
    }
    catch {
        return $false
    }
}

$frontendRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$clientConfig = Join-Path $frontendRoot ".client-config.env"
$hasFailures = $false

Write-Host ""
Write-Host "=== VALIDACION FACTURACION LOCAL ===" -ForegroundColor Cyan
Write-Host ""

if (-not (Test-Path $clientConfig)) {
    Write-Host "ERROR: No existe .client-config.env" -ForegroundColor Red
    exit 1
}

Write-Host "1. Configuracion..." -ForegroundColor Yellow

$composeProject = Get-ConfigValue -FilePath $clientConfig -Key "COMPOSE_PROJECT_NAME" -DefaultValue "facturacion_local"
$bindHost = Get-ConfigValue -FilePath $clientConfig -Key "DOCKER_BIND_HOST" -DefaultValue "127.0.0.1"
$backendPort = Get-ConfigValue -FilePath $clientConfig -Key "BACKEND_PORT" -DefaultValue "8000"
$frontendPort = Get-ConfigValue -FilePath $clientConfig -Key "FRONTEND_PORT" -DefaultValue "5173"
$adminPort = Get-ConfigValue -FilePath $clientConfig -Key "ADMIN_PORT" -DefaultValue "5174"
$defaultViteApiBaseUrl = if ($bindHost -eq "0.0.0.0") { "" } else { "http://127.0.0.1:$backendPort" }
$viteApiBaseUrl = Get-ConfigValue -FilePath $clientConfig -Key "VITE_API_BASE_URL" -DefaultValue $defaultViteApiBaseUrl

Write-Host "   OK - Proyecto: $composeProject" -ForegroundColor Green
Write-Host "   OK - Host: $bindHost" -ForegroundColor Green
Write-Host "   OK - Puertos: Backend=$backendPort Frontend=$frontendPort Admin=$adminPort" -ForegroundColor Green
Write-Host ""

Write-Host "2. Docker..." -ForegroundColor Yellow

$composeArgs = @("-p", $composeProject, "-f", $ComposeFile)
$env:DOCKER_BIND_HOST = $bindHost
$env:BACKEND_PORT = $backendPort
$env:FRONTEND_PORT = $frontendPort
$env:ADMIN_PORT = $adminPort
$env:VITE_API_BASE_URL = $viteApiBaseUrl

$runningServices = docker compose @composeArgs ps --services --status running 2>$null
$runningCount = @($runningServices).Count

if ($runningCount -ge 4) {
    Write-Host "   OK - 4 contenedores ejecutandose" -ForegroundColor Green
    foreach ($service in $runningServices) {
        Write-Host "      ${service}: running" -ForegroundColor DarkGray
    }
} else {
    Write-Host "   ERROR - No hay suficientes contenedores" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "3. APIs..." -ForegroundColor Yellow

$backendUrl = "http://$bindHost`:$backendPort"
$frontendUrl = "http://$bindHost`:$frontendPort"
$adminUrl = "http://$bindHost`:$adminPort"

if (Test-HttpOk -Url "$backendUrl/api/auth/login" -TimeoutSec 5) {
    Write-Host "   OK - Backend respondiendo" -ForegroundColor Green
} else {
    try {
        $resp = Invoke-WebRequest -Uri "$backendUrl/api/auth/login" -Method Options -Headers @{'Origin'=$frontendUrl} -TimeoutSec 5 -ErrorAction Stop
        if ($resp.StatusCode -eq 204) {
            Write-Host "   OK - Backend respondiendo" -ForegroundColor Green
        } else {
            Write-Host "   ERROR - Backend no responde" -ForegroundColor Red
            $hasFailures = $true
        }
    }
    catch {
        Write-Host "   ERROR - Backend no responde" -ForegroundColor Red
        $hasFailures = $true
    }
}

if (Test-HttpOk -Url $frontendUrl -TimeoutSec 5) {
    Write-Host "   OK - Frontend respondiendo" -ForegroundColor Green
} else {
    Write-Host "   ERROR - Frontend no responde" -ForegroundColor Red
    $hasFailures = $true
}

if (Test-HttpOk -Url $adminUrl -TimeoutSec 5) {
    Write-Host "   OK - Admin respondiendo" -ForegroundColor Green
} else {
    Write-Host "   ERROR - Admin no responde" -ForegroundColor Red
    $hasFailures = $true
}

Write-Host ""
Write-Host "4. Autenticacion..." -ForegroundColor Yellow

if (Test-AuthLogin -BaseUrl $backendUrl) {
    Write-Host "   OK - Login exitoso" -ForegroundColor Green
} else {
    Write-Host "   ERROR - Login fallido" -ForegroundColor Red
    $hasFailures = $true
}

Write-Host ""
Write-Host "=== RESUMEN ===" -ForegroundColor Cyan
Write-Host "Frontend: $frontendUrl" -ForegroundColor White
Write-Host "Admin:    $adminUrl" -ForegroundColor White
Write-Host "Backend:  $backendUrl" -ForegroundColor DarkGray
Write-Host ""
if ($hasFailures) {
    Write-Host "ERROR - Hay validaciones fallidas" -ForegroundColor Red
    exit 1
}

Write-Host "OK - Sistema listo" -ForegroundColor Green
Write-Host ""
