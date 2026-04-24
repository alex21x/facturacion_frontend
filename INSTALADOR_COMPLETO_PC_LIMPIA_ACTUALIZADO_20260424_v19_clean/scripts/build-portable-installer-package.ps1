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

$trackedScripts = @(
    'actualizar-local.bat',
    'apagar-local.bat',
    'append_cfg_css.ps1',
    'build-portable-installer-package.ps1',
    'config-red-local.bat',
    'desinstalar-local.bat',
    'instalar-local.bat',
    'levantar-local.bat',
    'network-config-local.ps1',
    'preparar-entorno.txt',
    'rebuild_appcfg_return.ps1',
    'setup-local.ps1',
    'start-local.ps1',
    'stop-local.ps1',
    'test-all-local.ps1',
    'uninstall-local.ps1',
    'update-local.ps1',
    'validar-local.bat'
)

if (Test-Path $OutputRoot) {
    Remove-Item -Path $OutputRoot -Recurse -Force
}

New-Item -ItemType Directory -Path $portableScripts -Force | Out-Null
New-Item -ItemType Directory -Path $portablePayload -Force | Out-Null

# Copy only the tracked/required scripts. Some historical PS1 filenames are
# intentionally excluded because Windows Defender/ESET flag them by name even
# though the current flow no longer depends on them.
foreach ($scriptName in $trackedScripts) {
    $sourceScript = Join-Path $frontendRoot.Path "scripts\$scriptName"
    if (-not (Test-Path $sourceScript)) {
        throw "Falta script requerido para el paquete portable: $scriptName"
    }

    Copy-Item -Path $sourceScript -Destination (Join-Path $portableScripts $scriptName) -Force
}

# Copy full frontend/backend payload (excluding heavy transient folders and
# generated installer artifacts to avoid recursive packaging).
robocopy $frontendRoot.Path $portableFrontend /MIR /R:1 /W:1 /NFL /NDL /NJH /NJS /NP /XD .git node_modules dist dist-admin scripts INSTALADOR_COMPLETO_PC_LIMPIA* facturacion_instalador_portable* /XF INSTALADOR_COMPLETO_PC_LIMPIA*.zip
if ($LASTEXITCODE -ge 8) {
    throw "Fallo copia de frontend al paquete portable."
}

robocopy $backendRoot.Path $portableBackend /MIR /R:1 /W:1 /NFL /NDL /NJH /NJS /NP /XD .git vendor storage\logs
if ($LASTEXITCODE -ge 8) {
    throw "Fallo copia de backend al paquete portable."
}

$launcher = Join-Path $OutputRoot "INSTALAR-FACTURACION.bat"
Set-Content -Path $launcher -Value @(
    '@echo off',
    'setlocal',
    'cd /d "%~dp0"',
    'PowerShell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\setup-local.ps1" -ComposeFile "%~dp0payload\facturacion_frontend\docker-compose.local.yml" -BackendRoot "%~dp0payload\facturacion_backend"',
    'exit /b %errorlevel%'
)

Write-Host "Paquete portable generado correctamente." -ForegroundColor Green
Write-Host "Ruta: $OutputRoot" -ForegroundColor Green
Write-Host "Entrega al cliente TODA esta carpeta." -ForegroundColor Yellow
Write-Host "El cliente ejecuta: INSTALAR-FACTURACION.bat" -ForegroundColor Yellow
