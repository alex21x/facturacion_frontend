param(
    [string]$ComposeFile = (Join-Path $PSScriptRoot "..\docker-compose.local.yml"),
    [ValidateSet('custom','sql')]
    [string]$Format = 'custom',
    [string]$OutputDir = '',
    [string]$OutputFile = ''
)

function Get-ConfigValue {
    param([string]$FilePath,[string]$Key,[string]$DefaultValue)
    if (-not (Test-Path $FilePath)) { return $DefaultValue }
    $match = Get-Content $FilePath | Where-Object { $_ -match "^$Key=" } | Select-Object -First 1
    if (-not $match) { return $DefaultValue }
    return ($match -split '=',2)[1].Trim()
}

function Resolve-ComposeFilePath {
    param([string]$ComposeFileValue,[string]$ScriptRoot)

    $candidatePaths = @()
    if ($ComposeFileValue) { $candidatePaths += $ComposeFileValue }
    $candidatePaths += @(
        (Join-Path $ScriptRoot "..\docker-compose.local.yml"),
        (Join-Path $ScriptRoot "..\payload\facturacion_frontend\docker-compose.local.yml"),
        (Join-Path $ScriptRoot "payload\facturacion_frontend\docker-compose.local.yml")
    )

    foreach ($candidate in ($candidatePaths | Select-Object -Unique)) {
        $resolved = Resolve-Path $candidate -ErrorAction SilentlyContinue
        if ($resolved) { return $resolved.Path }
    }

    return $null
}

$composeFilePath = Resolve-ComposeFilePath -ComposeFileValue $ComposeFile -ScriptRoot $PSScriptRoot
if (-not $composeFilePath) {
    throw "No se encontro docker-compose.local.yml."
}

$frontendRoot = Split-Path -Path $composeFilePath -Parent
$clientConfig = Join-Path $frontendRoot '.client-config.env'

$composeProject = Get-ConfigValue -FilePath $clientConfig -Key 'COMPOSE_PROJECT_NAME' -DefaultValue 'facturacion_local'
$postgresDb = Get-ConfigValue -FilePath $clientConfig -Key 'POSTGRES_DB' -DefaultValue 'facturacion_v2'
$postgresUser = Get-ConfigValue -FilePath $clientConfig -Key 'POSTGRES_USER' -DefaultValue 'facturacion'
$postgresPassword = Get-ConfigValue -FilePath $clientConfig -Key 'POSTGRES_PASSWORD' -DefaultValue 'facturacion'
$dbBackupDirConfig = Get-ConfigValue -FilePath $clientConfig -Key 'DB_BACKUP_DIR' -DefaultValue 'backups\db'

if ([string]::IsNullOrWhiteSpace($OutputDir)) {
    $OutputDir = $dbBackupDirConfig
}

if ([System.IO.Path]::IsPathRooted($OutputDir)) {
    $resolvedOutputDir = $OutputDir
} else {
    $resolvedOutputDir = Join-Path $frontendRoot $OutputDir
}

New-Item -ItemType Directory -Path $resolvedOutputDir -Force | Out-Null

$timestamp = Get-Date -Format 'yyyyMMdd_HHmmss'
$extension = if ($Format -eq 'custom') { 'dump' } else { 'sql' }

if ([string]::IsNullOrWhiteSpace($OutputFile)) {
    $OutputFile = "facturacion_${postgresDb}_${timestamp}.${extension}"
}

if ([System.IO.Path]::IsPathRooted($OutputFile)) {
    $outputPath = $OutputFile
} else {
    $outputPath = Join-Path $resolvedOutputDir $OutputFile
}

$outputParent = Split-Path -Path $outputPath -Parent
if ($outputParent) {
    New-Item -ItemType Directory -Path $outputParent -Force | Out-Null
}

$composeArgs = @('-p',$composeProject,'-f',$composeFilePath)
$containerTmpPath = if ($Format -eq 'custom') { '/tmp/facturacion_export.dump' } else { '/tmp/facturacion_export.sql' }

$postgresContainerId = (docker compose @composeArgs ps -q postgres | Out-String).Trim()
if (-not $postgresContainerId) {
    throw 'No se detecto el contenedor postgres. Ejecuta primero scripts/levantar-local.bat.'
}

Write-Host 'Exportando base de datos desde Docker...' -ForegroundColor Cyan

if ($Format -eq 'custom') {
    docker compose @composeArgs exec -T -e "PGPASSWORD=$postgresPassword" postgres pg_dump -U $postgresUser -d $postgresDb --format=custom --compress=6 --no-owner --no-privileges -f $containerTmpPath
} else {
    docker compose @composeArgs exec -T -e "PGPASSWORD=$postgresPassword" postgres pg_dump -U $postgresUser -d $postgresDb --format=plain --encoding=UTF8 --no-owner --no-privileges --clean --if-exists -f $containerTmpPath
}

if ($LASTEXITCODE -ne 0) {
    throw 'No se pudo exportar la base de datos desde PostgreSQL.'
}

docker cp "${postgresContainerId}:${containerTmpPath}" $outputPath
if ($LASTEXITCODE -ne 0) {
    throw 'No se pudo copiar el archivo de backup desde el contenedor postgres.'
}

docker compose @composeArgs exec -T postgres rm -f $containerTmpPath | Out-Null

Write-Host 'Backup generado correctamente.' -ForegroundColor Green
Write-Host "Archivo: $outputPath" -ForegroundColor Green
