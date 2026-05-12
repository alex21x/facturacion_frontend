param(
    [string]$OutputRoot = (Join-Path (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path "facturacion_instalador_portable")
)

$frontendRoot = Resolve-Path (Join-Path $PSScriptRoot "..") -ErrorAction SilentlyContinue
if (-not $frontendRoot) {
    throw "No se encontro la carpeta frontend actual."
}

$backendRoot = Resolve-Path (Join-Path $frontendRoot.Path "..\facturacion_backend") -ErrorAction SilentlyContinue
if (-not $backendRoot) {
    throw "No se encontro facturacion_backend como carpeta hermana."
}

$portableScripts = Join-Path $OutputRoot "scripts"
$portablePayload = Join-Path $OutputRoot "payload"
$portableFrontend = Join-Path $portablePayload "facturacion_frontend"
$portableBackend = Join-Path $portablePayload "facturacion_backend"
$portableDatabaseSql = Join-Path $OutputRoot "database\sql"

function Copy-PayloadFile {
    param(
        [string]$From,
        [string]$To
    )

    if (-not (Test-Path $From)) {
        throw "Falta archivo requerido para payload portable: $From"
    }

    $targetDir = Split-Path -Path $To -Parent
    if (-not (Test-Path $targetDir)) {
        New-Item -ItemType Directory -Path $targetDir -Force | Out-Null
    }

    Copy-Item -Path $From -Destination $To -Force
}

$trackedScripts = @(
    'apagar-local.bat',
    'actualizar-local.bat',
    'clean-transactional-local.ps1',
    'desinstalar-local.bat',
    'instalar-local.bat',
    'levantar-local.bat',
    'limpiar-transaccionales-local.bat',
    'preparar-entorno.ps1',
    'setup-local.ps1',
    'start-local.ps1',
    'stop-local.ps1',
    'uninstall-local.ps1',
    'update-local.ps1'
)

if (Test-Path $OutputRoot) {
    Remove-Item -Path $OutputRoot -Recurse -Force
}

New-Item -ItemType Directory -Path $portableScripts -Force | Out-Null
New-Item -ItemType Directory -Path $portablePayload -Force | Out-Null
New-Item -ItemType Directory -Path $portableDatabaseSql -Force | Out-Null

# Copy only required scripts for Docker install/update/uninstall.
foreach ($scriptName in $trackedScripts) {
    $sourceScript = Join-Path $frontendRoot.Path "scripts\$scriptName"
    if (-not (Test-Path $sourceScript)) {
        throw "Falta script requerido para el paquete portable: $scriptName"
    }

    Copy-Item -Path $sourceScript -Destination (Join-Path $portableScripts $scriptName) -Force
}

# Keep payload minimal: only files used by Apply-InstallerDockerOverrides and
# cleanup fallback logic. This avoids shipping logs/backups/dumps unnecessarily.
$payloadFrontendFiles = @(
    'docker-compose.local.yml',
    'docker-entrypoint.frontend.sh',
    'docker-entrypoint.admin.sh'
)

foreach ($relativePath in $payloadFrontendFiles) {
    Copy-PayloadFile -From (Join-Path $frontendRoot.Path $relativePath) -To (Join-Path $portableFrontend $relativePath)
}

$payloadBackendFiles = @(
    'Dockerfile.local',
    'docker\entrypoint.local.sh',
    'database\sql\clean_transactional_operational.sql'
)

foreach ($relativePath in $payloadBackendFiles) {
    Copy-PayloadFile -From (Join-Path $backendRoot.Path $relativePath) -To (Join-Path $portableBackend $relativePath)
}

$cleanupSqlSource = Join-Path $backendRoot.Path 'database\sql\clean_transactional_operational.sql'
if (-not (Test-Path $cleanupSqlSource)) {
    throw 'Falta el SQL de limpieza transaccional en facturacion_backend\database\sql\clean_transactional_operational.sql'
}

Copy-Item -Path $cleanupSqlSource -Destination (Join-Path $portableDatabaseSql 'clean_transactional_operational.sql') -Force

$launcher = Join-Path $OutputRoot "INSTALAR-FACTURACION.bat"
Set-Content -Path $launcher -Value @(
    '@echo off',
    'setlocal',
    'cd /d "%~dp0"',
    'call "%~dp0scripts\instalar-local.bat"',
    'exit /b %errorlevel%'
)

$updater = Join-Path $OutputRoot "ACTUALIZAR-FACTURACION.bat"
Set-Content -Path $updater -Value @(
    '@echo off',
    'setlocal',
    'cd /d "%~dp0"',
    'call "%~dp0scripts\actualizar-local.bat"',
    'exit /b %errorlevel%'
)

$uninstaller = Join-Path $OutputRoot "DESINSTALAR-FACTURACION.bat"
Set-Content -Path $uninstaller -Value @(
    '@echo off',
    'setlocal',
    'cd /d "%~dp0"',
    'call "%~dp0scripts\desinstalar-local.bat"',
    'exit /b %errorlevel%'
)

$cleaner = Join-Path $OutputRoot "LIMPIAR-TRANSACCIONALES.bat"
Set-Content -Path $cleaner -Value @(
    '@echo off',
    'setlocal',
    'cd /d "%~dp0"',
    'call "%~dp0scripts\limpiar-transaccionales-local.bat"',
    'exit /b %errorlevel%'
)

Write-Host "Paquete portable generado correctamente." -ForegroundColor Green
Write-Host "Ruta: $OutputRoot" -ForegroundColor Green
Write-Host "Entrega al cliente TODA esta carpeta." -ForegroundColor Yellow
Write-Host "Comandos para el cliente:" -ForegroundColor Yellow
Write-Host "  INSTALAR-FACTURACION.bat" -ForegroundColor Yellow
Write-Host "  ACTUALIZAR-FACTURACION.bat" -ForegroundColor Yellow
Write-Host "  DESINSTALAR-FACTURACION.bat" -ForegroundColor Yellow
Write-Host "  LIMPIAR-TRANSACCIONALES.bat" -ForegroundColor Yellow
