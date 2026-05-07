param(
    [string]$ComposeFile = (Join-Path $PSScriptRoot "..\docker-compose.local.yml"),
    [string]$BackupFile = '',
    [switch]$NoCleanSchemas,
    [switch]$SkipPreRestoreBackup
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

function Resolve-BackupFilePath {
    param(
        [string]$FrontendRoot,
        [string]$BackupFileValue,
        [string]$DefaultBackupDir
    )

    if (-not [string]::IsNullOrWhiteSpace($BackupFileValue)) {
        if ([System.IO.Path]::IsPathRooted($BackupFileValue)) {
            $resolved = Resolve-Path $BackupFileValue -ErrorAction SilentlyContinue
        } else {
            $resolved = Resolve-Path (Join-Path $FrontendRoot $BackupFileValue) -ErrorAction SilentlyContinue
        }

        if ($resolved) {
            return $resolved.Path
        }

        throw "No se encontro el archivo de backup indicado: $BackupFileValue"
    }

    $backupDir = if ([System.IO.Path]::IsPathRooted($DefaultBackupDir)) { $DefaultBackupDir } else { Join-Path $FrontendRoot $DefaultBackupDir }
    if (-not (Test-Path $backupDir)) {
        throw "No se encontro la carpeta de backups: $backupDir"
    }

    $latest = Get-ChildItem -Path $backupDir -File -ErrorAction SilentlyContinue |
        Where-Object { $_.Extension -in @('.dump', '.sql', '.backup') } |
        Sort-Object LastWriteTime -Descending |
        Select-Object -First 1

    if (-not $latest) {
        throw "No se encontraron backups (*.dump, *.backup, *.sql) en: $backupDir"
    }

    return $latest.FullName
}

$composeFilePath = Resolve-ComposeFilePath -ComposeFileValue $ComposeFile -ScriptRoot $PSScriptRoot
if (-not $composeFilePath) {
    throw 'No se encontro docker-compose.local.yml.'
}

$frontendRoot = Split-Path -Path $composeFilePath -Parent
$clientConfig = Join-Path $frontendRoot '.client-config.env'

$composeProject = Get-ConfigValue -FilePath $clientConfig -Key 'COMPOSE_PROJECT_NAME' -DefaultValue 'facturacion_local'
$postgresDb = Get-ConfigValue -FilePath $clientConfig -Key 'POSTGRES_DB' -DefaultValue 'facturacion_v2'
$postgresUser = Get-ConfigValue -FilePath $clientConfig -Key 'POSTGRES_USER' -DefaultValue 'facturacion'
$postgresPassword = Get-ConfigValue -FilePath $clientConfig -Key 'POSTGRES_PASSWORD' -DefaultValue 'facturacion'
$dbBackupDirConfig = Get-ConfigValue -FilePath $clientConfig -Key 'DB_BACKUP_DIR' -DefaultValue 'backups\db'
$preRestoreAutoBackup = Get-ConfigValue -FilePath $clientConfig -Key 'PRE_RESTORE_AUTO_BACKUP' -DefaultValue 'true'

$resolvedBackupFile = Resolve-BackupFilePath -FrontendRoot $frontendRoot -BackupFileValue $BackupFile -DefaultBackupDir $dbBackupDirConfig
$extension = [System.IO.Path]::GetExtension($resolvedBackupFile).ToLowerInvariant()

$composeArgs = @('-p',$composeProject,'-f',$composeFilePath)
$postgresContainerId = (docker compose @composeArgs ps -q postgres | Out-String).Trim()
if (-not $postgresContainerId) {
    throw 'No se detecto el contenedor postgres. Ejecuta primero scripts/levantar-local.bat.'
}

if (-not $SkipPreRestoreBackup -and $preRestoreAutoBackup -eq 'true') {
    Write-Host 'Generando backup de seguridad previo a la restauracion...' -ForegroundColor Yellow
    & (Join-Path $PSScriptRoot 'export-db-local.ps1') -ComposeFile $composeFilePath -Format custom
    if ($LASTEXITCODE -ne 0) {
        throw 'No se pudo generar backup de seguridad previo a la restauracion.'
    }
}

$postgresRoleExists = docker compose @composeArgs exec -T -e "PGPASSWORD=$postgresPassword" postgres psql -U $postgresUser -d $postgresDb -tAc "SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'postgres');"
if ($LASTEXITCODE -ne 0) {
    throw 'No se pudo validar roles de PostgreSQL.'
}
if ((($postgresRoleExists | Out-String).Trim()) -ne 't') {
    docker compose @composeArgs exec -T -e "PGPASSWORD=$postgresPassword" postgres psql -U $postgresUser -d $postgresDb -c 'CREATE ROLE postgres;' | Out-Null
    if ($LASTEXITCODE -ne 0) {
        throw 'No se pudo crear el rol postgres requerido por algunos dumps.'
    }
}

if (-not $NoCleanSchemas) {
    Write-Host 'Limpiando esquemas antes de restaurar...' -ForegroundColor Cyan
    docker compose @composeArgs exec -T -e "PGPASSWORD=$postgresPassword" postgres psql -q -v ON_ERROR_STOP=1 -U $postgresUser -d $postgresDb -c "SET client_min_messages TO warning; DROP SCHEMA IF EXISTS appcfg,auth,billing,core,inventory,master,ops,restaurant,sales CASCADE; DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public; GRANT ALL ON SCHEMA public TO public;"
    if ($LASTEXITCODE -ne 0) {
        throw 'No se pudo limpiar esquemas antes de restaurar.'
    }
}

$containerRestorePath = '/tmp/facturacion_restore_input'

docker cp $resolvedBackupFile "${postgresContainerId}:${containerRestorePath}"
if ($LASTEXITCODE -ne 0) {
    throw 'No se pudo copiar el backup al contenedor postgres.'
}

Write-Host "Restaurando backup: $resolvedBackupFile" -ForegroundColor Cyan

if ($extension -in @('.dump', '.backup')) {
    docker compose @composeArgs exec -T -e "PGPASSWORD=$postgresPassword" postgres pg_restore -U $postgresUser -d $postgresDb --no-owner --no-privileges --clean --if-exists $containerRestorePath
    if ($LASTEXITCODE -ne 0) {
        throw 'Fallo la restauracion del backup binario (pg_restore).'
    }
} elseif ($extension -eq '.sql') {
    docker compose @composeArgs exec -T -e "PGPASSWORD=$postgresPassword" postgres psql -q -v ON_ERROR_STOP=1 -U $postgresUser -d $postgresDb -f $containerRestorePath
    if ($LASTEXITCODE -ne 0) {
        throw 'Fallo la restauracion del backup SQL (psql).'
    }
} else {
    throw 'Formato de backup no soportado. Usa .dump, .backup o .sql'
}

docker compose @composeArgs exec -T postgres rm -f $containerRestorePath | Out-Null

Write-Host 'Restauracion completada.' -ForegroundColor Green
Write-Host 'Reaplicando migraciones pendientes...' -ForegroundColor Cyan

docker compose @composeArgs exec -T backend php artisan migrate --force
if ($LASTEXITCODE -ne 0) {
    Write-Host 'Advertencia: no se pudieron ejecutar migraciones automaticas. Revisa el backend manualmente.' -ForegroundColor Yellow
}
