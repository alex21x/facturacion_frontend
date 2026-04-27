param(
    [string]$ComposeFile = (Join-Path $PSScriptRoot "..\docker-compose.local.yml")
)

function Get-ConfigValue {
    param([string]$FilePath,[string]$Key,[string]$DefaultValue)
    if (-not (Test-Path $FilePath)) { return $DefaultValue }
    $match = Get-Content $FilePath | Where-Object { $_ -match "^$Key=" } | Select-Object -First 1
    if (-not $match) { return $DefaultValue }
    return ($match -split '=',2)[1].Trim()
}

function Resolve-CleanupSqlPath {
    param(
        [string]$FrontendRoot,
        [string]$ConfiguredPath
    )

    $candidatePaths = @()

    if ($ConfiguredPath) {
        $candidatePaths += $ConfiguredPath
    }

    $candidatePaths += @(
        'database\sql\clean_transactional_operational.sql',
        '..\facturacion_backend\database\sql\clean_transactional_operational.sql',
        '..\payload\facturacion_backend\database\sql\clean_transactional_operational.sql',
        'payload\facturacion_backend\database\sql\clean_transactional_operational.sql'
    )

    foreach ($candidatePath in ($candidatePaths | Select-Object -Unique)) {
        $resolvedPath = Resolve-Path (Join-Path $FrontendRoot $candidatePath) -ErrorAction SilentlyContinue
        if ($resolvedPath) {
            return $resolvedPath.Path
        }
    }

    return $null
}

$resolvedComposeFile = Resolve-Path $ComposeFile -ErrorAction SilentlyContinue
if (-not $resolvedComposeFile) { throw "No se encontro docker-compose.local.yml en: $ComposeFile" }
$composeFilePath = $resolvedComposeFile.Path
$frontendRoot = Split-Path -Path $composeFilePath -Parent
$clientConfig = Join-Path $frontendRoot '.client-config.env'

$composeProject = Get-ConfigValue -FilePath $clientConfig -Key 'COMPOSE_PROJECT_NAME' -DefaultValue 'facturacion_local'
$dockerBindHost = Get-ConfigValue -FilePath $clientConfig -Key 'DOCKER_BIND_HOST' -DefaultValue '127.0.0.1'
$backendPort = Get-ConfigValue -FilePath $clientConfig -Key 'BACKEND_PORT' -DefaultValue '8000'
$frontendPort = Get-ConfigValue -FilePath $clientConfig -Key 'FRONTEND_PORT' -DefaultValue '5173'
$adminPort = Get-ConfigValue -FilePath $clientConfig -Key 'ADMIN_PORT' -DefaultValue '5174'
$pgadminPort = Get-ConfigValue -FilePath $clientConfig -Key 'PGADMIN_PORT' -DefaultValue '5050'
$postgresDb = Get-ConfigValue -FilePath $clientConfig -Key 'POSTGRES_DB' -DefaultValue 'facturacion_v2'
$postgresUser = Get-ConfigValue -FilePath $clientConfig -Key 'POSTGRES_USER' -DefaultValue 'facturacion'
$postgresPassword = Get-ConfigValue -FilePath $clientConfig -Key 'POSTGRES_PASSWORD' -DefaultValue 'facturacion'
$cleanupSqlPath = Get-ConfigValue -FilePath $clientConfig -Key 'TRANSACTIONAL_CLEANUP_SQL_PATH' -DefaultValue 'database\sql\clean_transactional_operational.sql'

$resolvedCleanupSql = Resolve-CleanupSqlPath -FrontendRoot $frontendRoot -ConfiguredPath $cleanupSqlPath
if (-not $resolvedCleanupSql) {
    throw "No se encontro el script SQL de limpieza. Rutas probadas desde '$frontendRoot': $cleanupSqlPath, database\sql\clean_transactional_operational.sql, ..\facturacion_backend\database\sql\clean_transactional_operational.sql, ..\payload\facturacion_backend\database\sql\clean_transactional_operational.sql"
}

$env:DOCKER_BIND_HOST = $dockerBindHost
$env:BACKEND_PORT = $backendPort
$env:FRONTEND_PORT = $frontendPort
$env:ADMIN_PORT = $adminPort
$env:PGADMIN_PORT = $pgadminPort
$env:POSTGRES_DB = $postgresDb
$env:POSTGRES_USER = $postgresUser
$env:POSTGRES_PASSWORD = $postgresPassword

$composeArgs = @('-p',$composeProject,'-f',$composeFilePath)

$postgresContainerId = (docker compose @composeArgs ps -q postgres | Out-String).Trim()
if (-not $postgresContainerId) {
    throw 'No se detecto el contenedor postgres. Ejecuta primero levantar-local.bat.'
}

Write-Host 'Aplicando limpieza de tablas transaccionales/operacionales...' -ForegroundColor Cyan

docker cp $resolvedCleanupSql "${postgresContainerId}:/tmp/clean_transactional_operational.sql"
if ($LASTEXITCODE -ne 0) {
    throw 'No se pudo copiar el SQL de limpieza al contenedor postgres.'
}

docker compose @composeArgs exec -T -e "PGPASSWORD=$postgresPassword" postgres psql -U $postgresUser -d $postgresDb -f /tmp/clean_transactional_operational.sql
if ($LASTEXITCODE -ne 0) {
    throw 'No se pudo ejecutar el SQL de limpieza en PostgreSQL.'
}

docker compose @composeArgs exec -T postgres rm -f /tmp/clean_transactional_operational.sql | Out-Null

Write-Host 'Asegurando credenciales locales del usuario admin_panel...' -ForegroundColor Cyan
docker compose @composeArgs exec -T backend php artisan tinker --execute "`$panel = DB::table('auth.users')->where('username','admin_panel')->first(); if (!`$panel) { `$legacy = DB::table('auth.users')->where('username','admin')->first(); if (`$legacy) { DB::table('auth.users')->where('id',`$legacy->id)->update(['username'=>'admin_panel']); } else { `$first = DB::table('auth.users')->orderBy('id')->first(); if (`$first) { DB::table('auth.users')->where('id',`$first->id)->update(['username'=>'admin_panel']); } } } DB::table('auth.users')->where('username','<>','admin_panel')->delete(); DB::table('auth.users')->where('username','admin_panel')->update(['password_hash'=>Hash::make('Admin123456!'),'status'=>1,'updated_at'=>now()]);"
if ($LASTEXITCODE -ne 0) {
    throw 'No se pudo establecer la clave local del usuario admin_panel tras la limpieza.'
}

Write-Host 'Limpieza completada.' -ForegroundColor Green
