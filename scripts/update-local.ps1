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

function Test-CleanGitTree {
    param(
        [string]$RepoPath,
        [string]$RepoName
    )

    $status = git -C $RepoPath status --porcelain --untracked-files=no
    if ($LASTEXITCODE -ne 0) {
        throw "No se pudo revisar el repositorio $RepoName."
    }

    if ($status) {
        return $false
    }

    return $true
}

function Resolve-UpdateLayout {
    param([string]$ComposeFilePath)

    $resolvedComposeFile = Resolve-Path $ComposeFilePath -ErrorAction SilentlyContinue
    if ($resolvedComposeFile) {
        $resolvedComposeFilePath = $resolvedComposeFile.Path
        $resolvedFrontendRoot = Split-Path -Path $resolvedComposeFilePath -Parent
        $backendCandidate = Join-Path (Split-Path -Path $resolvedFrontendRoot -Parent) "facturacion_backend"
        $resolvedBackendRoot = Resolve-Path $backendCandidate -ErrorAction SilentlyContinue

        if ($resolvedBackendRoot) {
            return @{
                ComposeFile = $resolvedComposeFilePath
                FrontendRoot = $resolvedFrontendRoot
                BackendRoot = $resolvedBackendRoot.Path
            }
        }
    }

    # Buscar en ubicaciones absolutas estándar de instalación
    $absoluteCandidates = @(
        "C:\FacturacionLocal\facturacion_frontend\docker-compose.local.yml",
        "C:\xampp\htdocs\facturacion_frontend\docker-compose.local.yml",
        "D:\FacturacionLocal\facturacion_frontend\docker-compose.local.yml"
    )

    foreach ($candidate in $absoluteCandidates) {
        if (Test-Path $candidate) {
            $frontendRoot = Split-Path -Path $candidate -Parent
            $backendCandidate = Join-Path (Split-Path -Path $frontendRoot -Parent) "facturacion_backend"
            $resolvedBackendRoot = Resolve-Path $backendCandidate -ErrorAction SilentlyContinue
            if ($resolvedBackendRoot) {
                return @{
                    ComposeFile = $candidate
                    FrontendRoot = $frontendRoot
                    BackendRoot = $resolvedBackendRoot.Path
                }
            }
        }
    }

    # Buscar recursivamente desde el directorio del script hacia arriba
    $currentDir = Split-Path -Path $PSScriptRoot -Parent
    for ($i = 0; $i -lt 10; $i++) {  # Máximo 10 niveles hacia arriba
        if (-not $currentDir) { break }
        $candidateCompose = Join-Path $currentDir "docker-compose.local.yml"
        if (Test-Path $candidateCompose) {
            $backendCandidate = Join-Path (Split-Path -Path $currentDir -Parent) "facturacion_backend"
            $resolvedBackendRoot = Resolve-Path $backendCandidate -ErrorAction SilentlyContinue
            if ($resolvedBackendRoot) {
                return @{
                    ComposeFile = $candidateCompose
                    FrontendRoot = $currentDir
                    BackendRoot = $resolvedBackendRoot.Path
                }
            }
        }
        $currentDir = Split-Path -Path $currentDir -Parent
    }

    # Candidatos relativos (para compatibilidad)
    $relativeCandidates = @(
        (Join-Path $PSScriptRoot "..\\facturacion_frontend"),
        (Join-Path $PSScriptRoot "..")
    )

    foreach ($candidate in $relativeCandidates) {
        $resolvedCandidate = Resolve-Path $candidate -ErrorAction SilentlyContinue
        if (-not $resolvedCandidate) {
            continue
        }

        $candidateCompose = Join-Path $resolvedCandidate.Path "docker-compose.local.yml"
        $backendCandidate = Join-Path (Split-Path -Path $resolvedCandidate.Path -Parent) "facturacion_backend"
        $resolvedBackendRoot = Resolve-Path $backendCandidate -ErrorAction SilentlyContinue

        if ((Test-Path $candidateCompose) -and $resolvedBackendRoot) {
            return @{
                ComposeFile = $candidateCompose
                FrontendRoot = $resolvedCandidate.Path
                BackendRoot = $resolvedBackendRoot.Path
            }
        }
    }

    throw "No se encontro docker-compose.local.yml. Ejecuta primero scripts/instalar-local.bat o INSTALAR-FACTURACION.bat desde el paquete de instalacion."
}

function Resolve-ClientConfig {
    param([string]$RootPath)

    $candidates = @(
        Join-Path $RootPath ".client-config.env",
        Join-Path $RootPath "scripts\.client-config.env",
        Join-Path (Split-Path -Path $RootPath -Parent) ".client-config.env"
    )

    foreach ($candidate in $candidates) {
        if (Test-Path $candidate) {
            return $candidate
        }
    }

    return $null
}

function Ensure-DockerEngineRunning {
    docker info | Out-Null 2>&1
    if ($LASTEXITCODE -eq 0) {
        return
    }

    $dockerDesktopExe = @(
        "$env:ProgramFiles\\Docker\\Docker\\Docker Desktop.exe",
        "$env:LOCALAPPDATA\\Docker\\Docker Desktop.exe"
    ) | Where-Object { Test-Path $_ } | Select-Object -First 1

    if (-not $dockerDesktopExe) {
        throw "Docker no esta disponible. Instala Docker Desktop y vuelve a ejecutar."
    }

    Write-Host "Iniciando Docker Desktop..." -ForegroundColor Yellow
    Start-Process $dockerDesktopExe -ErrorAction SilentlyContinue

    for ($i = 1; $i -le 24; $i++) {
        Start-Sleep -Seconds 5
        docker info | Out-Null 2>&1
        if ($LASTEXITCODE -eq 0) {
            Write-Host "Docker listo." -ForegroundColor Green
            return
        }
    }

    throw "Docker Desktop no respondio a tiempo. Espera un momento y vuelve a intentar."
}

function Invoke-ComposePostgresScalar {
    param(
        [string[]]$ComposeArgs,
        [string]$PostgresPassword,
        [string]$PostgresUser,
        [string]$PostgresDb,
        [string]$Sql
    )

    $result = docker compose @ComposeArgs exec -T -e "PGPASSWORD=$PostgresPassword" postgres psql -U $PostgresUser -d $PostgresDb -tAc $Sql
    if ($LASTEXITCODE -ne 0) {
        throw "No se pudo consultar PostgreSQL dentro del contenedor Docker."
    }

    return ($result | Out-String).Trim()
}

function Initialize-DatabaseFromBootstrap {
    param(
        [string[]]$ComposeArgs,
        [string]$PostgresPassword,
        [string]$PostgresUser,
        [string]$PostgresDb,
        [string]$BootstrapSqlPath
    )

    $resolvedBootstrapSqlPath = Resolve-Path $BootstrapSqlPath -ErrorAction SilentlyContinue
    if (-not $resolvedBootstrapSqlPath) {
        throw "No se encontro el dump base para inicializar la base de datos: $BootstrapSqlPath"
    }

    $hasCompanySettings = Invoke-ComposePostgresScalar -ComposeArgs $ComposeArgs -PostgresPassword $PostgresPassword -PostgresUser $PostgresUser -PostgresDb $PostgresDb -Sql "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'core' AND table_name = 'company_settings');"
    if ($hasCompanySettings -eq "t") {
        return
    }

    Write-Host "Base vacia detectada. Restaurando dump inicial..." -ForegroundColor Cyan

    $postgresRoleExists = Invoke-ComposePostgresScalar -ComposeArgs $ComposeArgs -PostgresPassword $PostgresPassword -PostgresUser $PostgresUser -PostgresDb $PostgresDb -Sql "SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'postgres');"
    if ($postgresRoleExists -ne "t") {
        docker compose @ComposeArgs exec -T -e "PGPASSWORD=$PostgresPassword" postgres psql -U $PostgresUser -d $PostgresDb -c 'CREATE ROLE postgres;' | Out-Null
        if ($LASTEXITCODE -ne 0) {
            throw "No se pudo preparar el rol postgres requerido por el dump base."
        }
    }

    $postgresContainerId = (docker compose @ComposeArgs ps -q postgres | Out-String).Trim()
    if (-not $postgresContainerId) {
        throw "No se pudo identificar el contenedor de PostgreSQL."
    }

    docker cp $resolvedBootstrapSqlPath "${postgresContainerId}:/tmp/bootstrap.sql"
    if ($LASTEXITCODE -ne 0) {
        throw "No se pudo copiar el dump base al contenedor de PostgreSQL."
    }

    docker compose @ComposeArgs exec -T -e "PGPASSWORD=$PostgresPassword" postgres psql -U $PostgresUser -d $PostgresDb -f /tmp/bootstrap.sql
    if ($LASTEXITCODE -ne 0) {
        throw "No se pudo restaurar el dump base dentro de PostgreSQL."
    }

    docker compose @ComposeArgs exec -T postgres rm -f /tmp/bootstrap.sql | Out-Null
}

$layout = Resolve-UpdateLayout -ComposeFilePath $ComposeFile
$ComposeFile = $layout.ComposeFile
$frontendRoot = $layout.FrontendRoot
$backendRoot = $layout.BackendRoot
$clientConfig = Resolve-ClientConfig -RootPath $frontendRoot

if (-not $clientConfig) {
    throw "No existe .client-config.env. Ejecuta primero scripts/instalar-local.bat o setup-local.ps1 desde la carpeta raiz del instalador."
}

$frontendBranch = Get-ConfigValue -FilePath $clientConfig -Key "FRONTEND_BRANCH" -DefaultValue "main"
$backendBranch = Get-ConfigValue -FilePath $clientConfig -Key "BACKEND_BRANCH" -DefaultValue "main"
$composeProject = Get-ConfigValue -FilePath $clientConfig -Key "COMPOSE_PROJECT_NAME" -DefaultValue "facturacion_local"
$runMigrations = Get-ConfigValue -FilePath $clientConfig -Key "RUN_MIGRATIONS" -DefaultValue "true"
$dockerBindHost = Get-ConfigValue -FilePath $clientConfig -Key "DOCKER_BIND_HOST" -DefaultValue "127.0.0.1"
$backendPort = Get-ConfigValue -FilePath $clientConfig -Key "BACKEND_PORT" -DefaultValue "8000"
$frontendPort = Get-ConfigValue -FilePath $clientConfig -Key "FRONTEND_PORT" -DefaultValue "5173"
$adminPort = Get-ConfigValue -FilePath $clientConfig -Key "ADMIN_PORT" -DefaultValue "5174"
$viteApiBaseUrl = Get-ConfigValue -FilePath $clientConfig -Key "VITE_API_BASE_URL" -DefaultValue ("http://{0}:{1}" -f $dockerBindHost, $backendPort)
$postgresDb = Get-ConfigValue -FilePath $clientConfig -Key "POSTGRES_DB" -DefaultValue "facturacion_v2"
$postgresUser = Get-ConfigValue -FilePath $clientConfig -Key "POSTGRES_USER" -DefaultValue "facturacion"
$postgresPassword = Get-ConfigValue -FilePath $clientConfig -Key "POSTGRES_PASSWORD" -DefaultValue "facturacion"
$bootstrapSqlPath = Get-ConfigValue -FilePath $clientConfig -Key "BOOTSTRAP_SQL_PATH" -DefaultValue "..\facturacion_backend\facturacion_v2_export_utf8_clean_20260418_105235.sql"

$composeArgs = @("-p", $composeProject, "-f", $ComposeFile)

$env:DOCKER_BIND_HOST = $dockerBindHost
$env:POSTGRES_DB = $postgresDb
$env:POSTGRES_USER = $postgresUser
$env:POSTGRES_PASSWORD = $postgresPassword
$env:BACKEND_PORT = $backendPort
$env:FRONTEND_PORT = $frontendPort
$env:ADMIN_PORT = $adminPort
$env:VITE_API_BASE_URL = $viteApiBaseUrl

Ensure-DockerEngineRunning

$gitCommand = Get-Command git -ErrorAction SilentlyContinue
$gitAvailable = $null -ne $gitCommand

if ($gitAvailable) {
    $frontendClean = Test-CleanGitTree -RepoPath $frontendRoot -RepoName "frontend"
    $backendClean = Test-CleanGitTree -RepoPath $backendRoot -RepoName "backend"
} else {
    $frontendClean = $false
    $backendClean = $false
    Write-Host "Git no esta instalado: se omiten git pull y se reconstruye con el codigo local actual." -ForegroundColor Yellow
}

if ($frontendClean) {
    Write-Host "Actualizando frontend desde $frontendBranch..." -ForegroundColor Cyan
    git -C $frontendRoot pull --ff-only origin $frontendBranch
    if ($LASTEXITCODE -ne 0) {
        throw "Fallo la actualizacion del frontend."
    }
} else {
    Write-Host "Frontend con cambios locales: se omite git pull y se reconstruye con el codigo actual." -ForegroundColor Yellow
}

if ($backendClean) {
    Write-Host "Actualizando backend desde $backendBranch..." -ForegroundColor Cyan
    git -C $backendRoot pull --ff-only origin $backendBranch
    if ($LASTEXITCODE -ne 0) {
        throw "Fallo la actualizacion del backend."
    }
} else {
    Write-Host "Backend con cambios locales: se omite git pull y se reconstruye con el codigo actual." -ForegroundColor Yellow
}

Write-Host "Reconstruyendo stack local..." -ForegroundColor Cyan
docker compose @composeArgs up -d --build

if ($LASTEXITCODE -ne 0) {
    throw "No se pudo reconstruir el stack local."
}

Initialize-DatabaseFromBootstrap -ComposeArgs $composeArgs -PostgresPassword $postgresPassword -PostgresUser $postgresUser -PostgresDb $postgresDb -BootstrapSqlPath (Join-Path $frontendRoot $bootstrapSqlPath)

if ($runMigrations -eq "true") {
    Write-Host "Aplicando migraciones post-actualizacion..." -ForegroundColor Cyan

    $migrationsApplied = $false
    for ($attempt = 1; $attempt -le 20; $attempt++) {
        docker compose @composeArgs exec -T backend php artisan migrate --force
        if ($LASTEXITCODE -eq 0) {
            $migrationsApplied = $true
            break
        }

        Write-Host "Esperando backend para migrar (intento $attempt/20)..." -ForegroundColor Yellow
        Start-Sleep -Seconds 3
    }

    if (-not $migrationsApplied) {
        throw "No se pudieron aplicar migraciones tras la actualizacion."
    }
}

Write-Host "Asegurando credenciales locales del usuario admin..." -ForegroundColor Cyan
docker compose @composeArgs exec -T backend php artisan tinker --execute "DB::table('auth.users')->where('username','admin')->update(['password_hash'=>Hash::make('Admin123456!'),'updated_at'=>now()]);"
if ($LASTEXITCODE -ne 0) {
    throw "No se pudo establecer la clave local del usuario admin."
}

Write-Host "Actualizacion completada." -ForegroundColor Green
if ($dockerBindHost -eq "0.0.0.0") {
    $displayHost = "127.0.0.1"
} else {
    $displayHost = $dockerBindHost
}
Write-Host "Frontend: http://${displayHost}:${frontendPort}" -ForegroundColor Green
Write-Host "Admin: http://${displayHost}:${adminPort}" -ForegroundColor Green
Write-Host "Backend: http://${displayHost}:${backendPort}" -ForegroundColor Green