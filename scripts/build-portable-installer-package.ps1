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

if (Test-Path $OutputRoot) {
    Remove-Item -Path $OutputRoot -Recurse -Force
}

New-Item -ItemType Directory -Path $portableScripts -Force | Out-Null
New-Item -ItemType Directory -Path $portablePayload -Force | Out-Null

# Copy scripts folder as-is
robocopy (Join-Path $frontendRoot.Path "scripts") $portableScripts /MIR /R:1 /W:1 /NFL /NDL /NJH /NJS /NP
if ($LASTEXITCODE -ge 8) {
    throw "Fallo copia de scripts al paquete portable."
}

# Copy full frontend/backend payload (excluding heavy transient folders)
robocopy $frontendRoot.Path $portableFrontend /MIR /R:1 /W:1 /NFL /NDL /NJH /NJS /NP /XD .git node_modules dist dist-admin
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
    'call "%~dp0scripts\instalar-local.bat"',
    'exit /b %errorlevel%'
)

Write-Host "Paquete portable generado correctamente." -ForegroundColor Green
Write-Host "Ruta: $OutputRoot" -ForegroundColor Green
Write-Host "Entrega al cliente TODA esta carpeta." -ForegroundColor Yellow
Write-Host "El cliente ejecuta: INSTALAR-FACTURACION.bat" -ForegroundColor Yellow
