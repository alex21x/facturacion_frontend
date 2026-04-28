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

function Resolve-ComposeFilePath {
    param(
        [string]$ComposeFileValue,
        [string]$ScriptRoot
    )

    $candidatePaths = @()

    if ($ComposeFileValue) {
        $candidatePaths += $ComposeFileValue
    }

    $candidatePaths += @(
        (Join-Path $ScriptRoot "..\docker-compose.local.yml"),
        (Join-Path $ScriptRoot "..\payload\facturacion_frontend\docker-compose.local.yml"),
        (Join-Path $ScriptRoot "payload\facturacion_frontend\docker-compose.local.yml")
    )

    foreach ($candidate in ($candidatePaths | Select-Object -Unique)) {
        $resolved = Resolve-Path $candidate -ErrorAction SilentlyContinue
        if ($resolved) {
            return $resolved.Path
        }
    }

    return $null
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

$composeFilePath = Resolve-ComposeFilePath -ComposeFileValue $ComposeFile -ScriptRoot $PSScriptRoot
if (-not $composeFilePath) {
    throw "No se encontro docker-compose.local.yml. Rutas probadas: $ComposeFile, ..\docker-compose.local.yml, ..\payload\facturacion_frontend\docker-compose.local.yml"
}
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

$seedSuperAdminSqlPath = Join-Path $env:TEMP 'facturacion_seed_superadmin.sql'
Set-Content -Path $seedSuperAdminSqlPath -Encoding UTF8 -Value @'
DO $$
DECLARE
    v_now timestamptz := now();
    v_branch_id bigint;
    v_role_id bigint;
    v_user_id bigint;
BEGIN
    SELECT id INTO v_branch_id
    FROM core.branches
    WHERE company_id = 1 AND is_main = true
    ORDER BY id
    LIMIT 1;

    IF v_branch_id IS NULL THEN
        SELECT id INTO v_branch_id
        FROM core.branches
        WHERE company_id = 1
        ORDER BY id
        LIMIT 1;
    END IF;

    IF v_branch_id IS NULL THEN
        RAISE EXCEPTION 'No existe sucursal para company_id=1';
    END IF;

    SELECT id INTO v_role_id
    FROM auth.roles
    WHERE company_id = 1 AND UPPER(code) = 'ADMIN'
    ORDER BY id
    LIMIT 1;

    IF v_role_id IS NULL THEN
        INSERT INTO auth.roles (company_id, code, name, status)
        VALUES (1, 'ADMIN', 'Administrador', 1)
        RETURNING id INTO v_role_id;
    END IF;

    SELECT id INTO v_user_id
    FROM auth.users
    WHERE username = 'admin_panel'
    ORDER BY id
    LIMIT 1;

    IF v_user_id IS NULL THEN
        INSERT INTO auth.users (
            company_id,
            branch_id,
            username,
            password_hash,
            first_name,
            last_name,
            email,
            phone,
            status,
            created_at,
            updated_at
        ) VALUES (
            1,
            v_branch_id,
            'admin_panel',
            '$2y$10$kt/Rblu2jmRTCMHZ9pMnJez2MNNTiwrkgXYWMAvmNTbH2QbJGe5l.',
            'Super',
            'Admin',
            'admin.panel@demo.local',
            NULL,
            1,
            v_now,
            v_now
        ) RETURNING id INTO v_user_id;
    ELSE
        UPDATE auth.users
        SET company_id = 1,
            branch_id = v_branch_id,
            password_hash = '$2y$10$kt/Rblu2jmRTCMHZ9pMnJez2MNNTiwrkgXYWMAvmNTbH2QbJGe5l.',
            first_name = 'Super',
            last_name = 'Admin',
            email = 'admin.panel@demo.local',
            status = 1,
            updated_at = v_now
        WHERE id = v_user_id;
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM auth.user_roles
        WHERE user_id = v_user_id AND role_id = v_role_id
    ) THEN
        INSERT INTO auth.user_roles (user_id, role_id)
        VALUES (v_user_id, v_role_id);
    END IF;

    IF to_regclass('appcfg.admin_portal_users') IS NOT NULL THEN
        INSERT INTO appcfg.admin_portal_users (user_id, status, created_at, updated_at)
        VALUES (v_user_id, 1, v_now, v_now)
        ON CONFLICT (user_id) DO UPDATE
        SET status = EXCLUDED.status,
            updated_at = EXCLUDED.updated_at;
    END IF;
END;
$$;
'@

docker cp $seedSuperAdminSqlPath "${postgresContainerId}:/tmp/seed_superadmin.sql"
if ($LASTEXITCODE -ne 0) {
    throw 'No se pudo copiar el SQL de superadmin al contenedor postgres.'
}

docker compose @composeArgs exec -T -e "PGPASSWORD=$postgresPassword" postgres psql -q -v ON_ERROR_STOP=1 -U $postgresUser -d $postgresDb -f /tmp/seed_superadmin.sql
if ($LASTEXITCODE -ne 0) {
    throw 'No se pudo restaurar el superadmin por defecto (admin_panel).'
}

docker compose @composeArgs exec -T postgres rm -f /tmp/seed_superadmin.sql | Out-Null

Write-Host 'Limpieza completada.' -ForegroundColor Green
Write-Host 'Superadmin restaurado: usuario admin_panel / clave Admin123456!' -ForegroundColor Cyan
