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

Write-Host 'Asegurando baseline local: superadmin + empresas retail/restaurante...' -ForegroundColor Cyan
$seedBaseline = @'
$now = now();

$ensureCompany = function ($id, $taxId, $legalName, $tradeName) use ($now) {
    $existing = DB::table('core.companies')->where('id', $id)->first();
    if (!$existing) {
        DB::table('core.companies')->insert([
            'id' => $id,
            'tax_id' => $taxId,
            'legal_name' => $legalName,
            'trade_name' => $tradeName,
            'status' => 1,
            'created_at' => $now,
            'updated_at' => $now,
        ]);
    } else {
        DB::table('core.companies')->where('id', $id)->update([
            'status' => 1,
            'updated_at' => $now,
        ]);
    }
};

$ensureBranch = function ($companyId, $code, $name) use ($now) {
    $main = DB::table('core.branches')
        ->where('company_id', $companyId)
        ->where('is_main', true)
        ->orderBy('id')
        ->first();

    if ($main) {
        DB::table('core.branches')->where('id', $main->id)->update([
            'status' => 1,
            'updated_at' => $now,
        ]);
        return (int) $main->id;
    }

    return (int) DB::table('core.branches')->insertGetId([
        'company_id' => $companyId,
        'code' => $code,
        'name' => $name,
        'address' => null,
        'is_main' => true,
        'status' => 1,
        'created_at' => $now,
        'updated_at' => $now,
    ]);
};

$ensureRole = function ($companyId) {
    $role = DB::table('auth.roles')
        ->where('company_id', $companyId)
        ->whereRaw("UPPER(code) = 'ADMIN'")
        ->orderBy('id')
        ->first();

    if ($role) {
        return (int) $role->id;
    }

    return (int) DB::table('auth.roles')->insertGetId([
        'company_id' => $companyId,
        'code' => 'ADMIN',
        'name' => 'Administrador',
        'status' => 1,
    ]);
};

$ensureAdminUser = function ($companyId, $branchId, $username, $firstName, $lastName, $email, $password) use ($now) {
    $user = DB::table('auth.users')->where('username', $username)->first();

    if (!$user) {
        $userId = (int) DB::table('auth.users')->insertGetId([
            'company_id' => $companyId,
            'branch_id' => $branchId,
            'username' => $username,
            'password_hash' => Hash::make($password),
            'first_name' => $firstName,
            'last_name' => $lastName,
            'email' => $email,
            'phone' => null,
            'status' => 1,
            'created_at' => $now,
            'updated_at' => $now,
        ]);
        return $userId;
    }

    DB::table('auth.users')->where('id', $user->id)->update([
        'company_id' => $companyId,
        'branch_id' => $branchId,
        'password_hash' => Hash::make($password),
        'first_name' => $firstName,
        'last_name' => $lastName,
        'email' => $email,
        'status' => 1,
        'updated_at' => $now,
    ]);

    return (int) $user->id;
};

$ensureRoleLink = function ($userId, $roleId) {
    $exists = DB::table('auth.user_roles')->where('user_id', $userId)->where('role_id', $roleId)->exists();
    if (!$exists) {
        DB::table('auth.user_roles')->insert(['user_id' => $userId, 'role_id' => $roleId]);
    }
};

$ensureCompany(1, '00000000001', 'MSEP PERU SAC', 'SISTEMA');
$ensureCompany(2, '00000000002', 'DEMO RETAIL', 'RETAIL');
$ensureCompany(3, '00000000003', 'DEMO RESTAURANTE', 'RESTAURANTE');

$branch1 = $ensureBranch(1, '001', 'Sucursal Principal');
$branch2 = $ensureBranch(2, '001', 'Sucursal Retail');
$branch3 = $ensureBranch(3, '001', 'Sucursal Restaurante');

$role1 = $ensureRole(1);
$role2 = $ensureRole(2);
$role3 = $ensureRole(3);

$u1 = $ensureAdminUser(1, $branch1, 'admin_panel', 'Super', 'Admin', 'admin.panel@demo.local', 'Admin123456!');
$u2 = $ensureAdminUser(2, $branch2, 'admin_retail', 'Admin', 'Retail', 'admin.retail@local.test', 'Admin123456!');
$u3 = $ensureAdminUser(3, $branch3, 'admin_restaurante', 'Admin', 'Restaurante', 'admin.restaurante@local.test', 'Admin123456!');

$ensureRoleLink($u1, $role1);
$ensureRoleLink($u2, $role2);
$ensureRoleLink($u3, $role3);

DB::table('appcfg.admin_portal_users')->updateOrInsert(
    ['user_id' => $u1],
    ['status' => 1, 'updated_at' => $now, 'created_at' => $now]
);
'@
docker compose @composeArgs exec -T backend php artisan tinker --execute $seedBaseline
if ($LASTEXITCODE -ne 0) {
    throw 'No se pudo asegurar el baseline local tras la limpieza (superadmin + retail + restaurante).'
}

Write-Host 'Limpieza completada.' -ForegroundColor Green
