param(
    [string]$ComposeFile = (Join-Path $PSScriptRoot "..\docker-compose.local.yml"),
    [string]$BackendRoot = "",
    [switch]$NonInteractive,
    [switch]$EnableLanAccess
)

function Get-ConfigValue {
    param([string]$FilePath,[string]$Key,[string]$DefaultValue)
    if (-not (Test-Path $FilePath)) { return $DefaultValue }
    $match = Get-Content $FilePath | Where-Object { $_ -match "^$Key=" } | Select-Object -First 1
    if (-not $match) { return $DefaultValue }
    return ($match -split '=',2)[1].Trim()
}

function Set-ConfigValue {
    param([string]$FilePath,[string]$Key,[string]$Value)
    if (-not (Test-Path $FilePath)) { Set-Content -Path $FilePath -Value "$Key=$Value"; return }
    $lines = Get-Content $FilePath
    $updated = $false
    for ($i=0; $i -lt $lines.Count; $i++) {
        if ($lines[$i] -match "^$Key=") { $lines[$i] = "$Key=$Value"; $updated = $true; break }
    }
    if (-not $updated) { $lines += "$Key=$Value" }
    Set-Content -Path $FilePath -Value $lines
}

function Test-ValidEmail {
    param([string]$Email)

    if ([string]::IsNullOrWhiteSpace($Email)) {
        return $false
    }

    return ($Email -match '^[^@\s]+@[^@\s]+\.[^@\s]+$')
}

function Get-ApiBaseUrlConfigValue {
    param(
        [string]$BindHost,
        [string]$BackendPort
    )

    if ($BindHost -eq '0.0.0.0') {
        return ''
    }

    return "http://127.0.0.1:$BackendPort"
}

function Get-LocalIpv4Addresses {
    $addresses = @()

    try {
        $addresses = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction Stop |
            Where-Object {
                $_.IPAddress -and
                $_.IPAddress -ne '127.0.0.1' -and
                -not $_.IPAddress.StartsWith('169.254.')
            } |
            Select-Object -ExpandProperty IPAddress -Unique
    } catch {
        $addresses = Get-CimInstance Win32_NetworkAdapterConfiguration -ErrorAction SilentlyContinue |
            Where-Object { $_.IPEnabled -and $_.IPAddress } |
            ForEach-Object { $_.IPAddress } |
            Where-Object {
                $_ -match '^(\d{1,3}\.){3}\d{1,3}$' -and
                $_ -ne '127.0.0.1' -and
                -not $_.StartsWith('169.254.')
            } |
            Select-Object -Unique
    }

    return @($addresses)
}

function Remove-FacturacionFirewallRules {
    param([int[]]$Ports)

    foreach ($port in $Ports) {
        $ruleName = "Facturacion Local $port"
        netsh advfirewall firewall delete rule name="$ruleName" | Out-Null
    }
}

function Ensure-FacturacionFirewallRules {
    param([int[]]$Ports)

    foreach ($port in $Ports) {
        $ruleName = "Facturacion Local $port"
        netsh advfirewall firewall delete rule name="$ruleName" | Out-Null
        netsh advfirewall firewall add rule name="$ruleName" dir=in action=allow protocol=TCP localport=$port profile=private,domain | Out-Null
        if ($LASTEXITCODE -ne 0) {
            throw "No se pudo abrir el puerto $port en el firewall de Windows."
        }
    }
}

function Show-AccessUrls {
    param(
        [string]$BindHost,
        [string]$BackendPort,
        [string]$FrontendPort,
        [string]$AdminPort,
        [string]$PgAdminPort,
        [string]$PgAdminEmail,
        [string]$PgAdminPassword
    )

    Write-Host ("Frontend local: http://127.0.0.1:{0}" -f $FrontendPort) -ForegroundColor Green
    Write-Host ("Admin local: http://127.0.0.1:{0}" -f $AdminPort) -ForegroundColor Green
    Write-Host ("Backend local: http://127.0.0.1:{0}" -f $BackendPort) -ForegroundColor Green
    Write-Host ("pgAdmin local: http://127.0.0.1:{0}" -f $PgAdminPort) -ForegroundColor Green
    Write-Host ("pgAdmin usuario: {0}" -f $PgAdminEmail) -ForegroundColor Green
    Write-Host ("pgAdmin clave:   {0}" -f $PgAdminPassword) -ForegroundColor Green

    if ($BindHost -ne '0.0.0.0') {
        return
    }

    $lanIps = Get-LocalIpv4Addresses
    if ($lanIps.Count -eq 0) {
        Write-Host 'Acceso remoto habilitado, pero no se detecto una IP LAN automaticamente.' -ForegroundColor Yellow
        Write-Host 'Usa la IP IPv4 de esta PC dentro de la red local.' -ForegroundColor Yellow
        return
    }

    Write-Host ''
    Write-Host 'Acceso desde otras PCs de la red:' -ForegroundColor Cyan
    foreach ($ip in $lanIps) {
        Write-Host ("  Frontend: http://{0}:{1}" -f $ip, $FrontendPort) -ForegroundColor Green
        Write-Host ("  Admin:    http://{0}:{1}" -f $ip, $AdminPort) -ForegroundColor Green
        Write-Host ("  Backend:  http://{0}:{1}" -f $ip, $BackendPort) -ForegroundColor Green
        Write-Host ("  pgAdmin:  http://{0}:{1}" -f $ip, $PgAdminPort) -ForegroundColor Green
    }
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
        throw 'No se pudo consultar PostgreSQL dentro del contenedor Docker.'
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

    $existingUserTables = Invoke-ComposePostgresScalar -ComposeArgs $ComposeArgs -PostgresPassword $PostgresPassword -PostgresUser $PostgresUser -PostgresDb $PostgresDb -Sql @"
SELECT COUNT(*)
FROM information_schema.tables
WHERE table_schema NOT IN ('information_schema', 'pg_catalog')
  AND table_type = 'BASE TABLE';
"@
    $existingUserTablesCount = 0
    [void][int]::TryParse($existingUserTables, [ref]$existingUserTablesCount)

    $requiredTables = @(
        "core.company_settings",
        "core.companies",
        "auth.users",
        "master.branches",
        "sales.series_numbers"
    )

    $missingTables = @()
    foreach ($requiredTable in $requiredTables) {
        $parts = $requiredTable.Split('.')
        $schema = $parts[0]
        $table = $parts[1]
        $exists = Invoke-ComposePostgresScalar -ComposeArgs $ComposeArgs -PostgresPassword $PostgresPassword -PostgresUser $PostgresUser -PostgresDb $PostgresDb -Sql "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = '$schema' AND table_name = '$table');"
        if ($exists -ne 't') {
            $missingTables += $requiredTable
        }
    }

    if ($missingTables.Count -eq 0) {
        # If core schemas exist but are empty (e.g. DB created with migrations only),
        # still force bootstrap restore to keep master/config data available.
        $minimumDatasetChecks = @(
            @{ Schema = 'core'; Table = 'company_settings'; MinCount = 1 },
            @{ Schema = 'master'; Table = 'payment_types'; MinCount = 1 },
            @{ Schema = 'sales'; Table = 'series_numbers'; MinCount = 1 }
        )

        $missingData = @()
        foreach ($check in $minimumDatasetChecks) {
            $tableExists = Invoke-ComposePostgresScalar -ComposeArgs $ComposeArgs -PostgresPassword $PostgresPassword -PostgresUser $PostgresUser -PostgresDb $PostgresDb -Sql "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = '$($check.Schema)' AND table_name = '$($check.Table)');"
            if ($tableExists -ne 't') {
                $missingData += "$($check.Schema).$($check.Table)"
                continue
            }

            $rowCount = Invoke-ComposePostgresScalar -ComposeArgs $ComposeArgs -PostgresPassword $PostgresPassword -PostgresUser $PostgresUser -PostgresDb $PostgresDb -Sql "SELECT COUNT(*) FROM $($check.Schema).$($check.Table);"
            $countInt = 0
            [void][int]::TryParse($rowCount, [ref]$countInt)
            if ($countInt -lt [int]$check.MinCount) {
                $missingData += "$($check.Schema).$($check.Table)"
            }
        }

        if ($missingData.Count -eq 0) {
            return $false
        }

        Write-Host "Base detectada sin maestros/configuracion base. Restaurando dump inicial..." -ForegroundColor Cyan
        Write-Host ("Tablas sin data minima: " + ($missingData -join ', ')) -ForegroundColor Yellow
    }

    if ($existingUserTablesCount -eq 0) {
        Write-Host "Base vacia detectada. Restaurando dump inicial..." -ForegroundColor Cyan
    } else {
        Write-Host "Base incompleta detectada. Restaurando dump inicial..." -ForegroundColor Cyan
        Write-Host ("Tablas faltantes: " + ($missingTables -join ', ')) -ForegroundColor Yellow
    }

    $postgresRoleExists = Invoke-ComposePostgresScalar -ComposeArgs $ComposeArgs -PostgresPassword $PostgresPassword -PostgresUser $PostgresUser -PostgresDb $PostgresDb -Sql "SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'postgres');"
    if ($postgresRoleExists -ne 't') {
        docker compose @ComposeArgs exec -T -e "PGPASSWORD=$PostgresPassword" postgres psql -U $PostgresUser -d $PostgresDb -c 'CREATE ROLE postgres;' | Out-Null
        if ($LASTEXITCODE -ne 0) {
            throw 'No se pudo preparar el rol postgres requerido por el dump base.'
        }
    }

    $postgresContainerId = (docker compose @ComposeArgs ps -q postgres | Out-String).Trim()
    if (-not $postgresContainerId) {
        throw 'No se pudo identificar el contenedor de PostgreSQL.'
    }

    # If schemas are partially present, clean them first to avoid restore conflicts.
    docker compose @ComposeArgs exec -T -e "PGPASSWORD=$PostgresPassword" postgres psql -q -v ON_ERROR_STOP=1 -U $PostgresUser -d $PostgresDb -c "SET client_min_messages TO warning; DROP SCHEMA IF EXISTS appcfg,auth,billing,core,inventory,master,ops,restaurant,sales CASCADE; DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public; GRANT ALL ON SCHEMA public TO public;"
    if ($LASTEXITCODE -ne 0) {
        throw 'No se pudo limpiar esquemas existentes antes de restaurar el dump base.'
    }

    docker cp $resolvedBootstrapSqlPath "${postgresContainerId}:/tmp/bootstrap.sql"
    if ($LASTEXITCODE -ne 0) {
        throw 'No se pudo copiar el dump base al contenedor de PostgreSQL.'
    }

    docker compose @ComposeArgs exec -T -e "PGPASSWORD=$PostgresPassword" postgres psql -q -v ON_ERROR_STOP=1 -U $PostgresUser -d $PostgresDb -f /tmp/bootstrap.sql
    if ($LASTEXITCODE -ne 0) {
        throw 'No se pudo restaurar el dump base dentro de PostgreSQL.'
    }

    docker compose @ComposeArgs exec -T postgres rm -f /tmp/bootstrap.sql | Out-Null

    return $true
}

function Invoke-ComposePostgresSqlFile {
    param(
        [string[]]$ComposeArgs,
        [string]$PostgresPassword,
        [string]$PostgresUser,
        [string]$PostgresDb,
        [string]$SqlFilePath
    )

    $resolvedSqlFilePath = Resolve-Path $SqlFilePath -ErrorAction SilentlyContinue
    if (-not $resolvedSqlFilePath) {
        throw "No se encontro script SQL: $SqlFilePath"
    }

    $postgresContainerId = (docker compose @ComposeArgs ps -q postgres | Out-String).Trim()
    if (-not $postgresContainerId) {
        throw 'No se pudo identificar el contenedor de PostgreSQL.'
    }

    docker cp $resolvedSqlFilePath "${postgresContainerId}:/tmp/runtime-script.sql"
    if ($LASTEXITCODE -ne 0) {
        throw 'No se pudo copiar el script SQL al contenedor de PostgreSQL.'
    }

    docker compose @ComposeArgs exec -T -e "PGPASSWORD=$PostgresPassword" postgres psql -q -U $PostgresUser -d $PostgresDb -v ON_ERROR_STOP=1 -f /tmp/runtime-script.sql
    if ($LASTEXITCODE -ne 0) {
        throw 'No se pudo ejecutar el script SQL en PostgreSQL.'
    }

    docker compose @ComposeArgs exec -T postgres rm -f /tmp/runtime-script.sql | Out-Null
}

function New-DesktopShortcut {
    param([string]$Name,[string]$TargetPath,[string]$Arguments="",[string]$WorkingDirectory="")
    $desktopPath = [Environment]::GetFolderPath('Desktop')
    $shortcutPath = Join-Path $desktopPath ("{0}.lnk" -f $Name)
    $wshShell = New-Object -ComObject WScript.Shell
    $shortcut = $wshShell.CreateShortcut($shortcutPath)
    $shortcut.TargetPath = $TargetPath
    $shortcut.Arguments = $Arguments
    if ($WorkingDirectory -ne "") { $shortcut.WorkingDirectory = $WorkingDirectory }
    $shortcut.IconLocation = "shell32.dll,220"
    $shortcut.Save()
}

function Repair-DockerDesktopDataPath {
    $dockerDataPath = 'C:\ProgramData\DockerDesktop'

    Write-Host "Reparando permisos de Docker Desktop..." -ForegroundColor Cyan

    # Cerrar procesos de Docker para evitar archivos bloqueados.
    Get-Process -Name 'Docker Desktop','com.docker.service','DockerCli' -ErrorAction SilentlyContinue |
        Stop-Process -Force -ErrorAction SilentlyContinue

    # Tomar control y limpiar carpeta previa para evitar ACL corruptas heredadas.
    if (Test-Path $dockerDataPath) {
        cmd /c "takeown /F \"$dockerDataPath\" /A /R /D Y >nul 2>&1"
        cmd /c "icacls \"$dockerDataPath\" /grant *S-1-5-32-544:(OI)(CI)F /T /C >nul 2>&1"
        Remove-Item -Path $dockerDataPath -Recurse -Force -ErrorAction SilentlyContinue
        if (Test-Path $dockerDataPath) {
            cmd /c "rmdir /S /Q \"$dockerDataPath\" >nul 2>&1"
        }
    }

    New-Item -ItemType Directory -Path $dockerDataPath -Force | Out-Null

    # Owner y ACL mínimos esperados por Docker Desktop (via SID, independiente del idioma del SO).
    cmd /c "icacls \"$dockerDataPath\" /setowner *S-1-5-32-544 /T /C >nul 2>&1"
    cmd /c "icacls \"$dockerDataPath\" /grant *S-1-5-32-544:(OI)(CI)F /T /C >nul 2>&1"
    cmd /c "icacls \"$dockerDataPath\" /grant *S-1-5-18:(OI)(CI)F /T /C >nul 2>&1"
}

function Assert-DockerDesktopDataPathOwner {
    $dockerDataPath = 'C:\ProgramData\DockerDesktop'
    if (-not (Test-Path $dockerDataPath)) {
        throw 'No existe C:\ProgramData\DockerDesktop despues de la reparacion.'
    }

    $owner = (Get-Acl $dockerDataPath).Owner
    Write-Host "Owner actual de DockerDesktop: $owner" -ForegroundColor DarkGray
    if ($owner -notmatch 'Administrators|Administradores|SYSTEM|Sistema') {
        throw "Owner invalido para C:\ProgramData\DockerDesktop: $owner"
    }
}

function Install-DockerDesktopDirectly {
    $installerPath = Join-Path $env:TEMP 'DockerDesktopInstaller.exe'
    $downloadUrl = 'https://desktop.docker.com/win/main/amd64/Docker%20Desktop%20Installer.exe'

    Write-Host "Descargando instalador oficial de Docker Desktop..." -ForegroundColor Cyan
    Invoke-WebRequest -Uri $downloadUrl -OutFile $installerPath -UseBasicParsing

    if (-not (Test-Path $installerPath)) {
        throw 'No se pudo descargar el instalador oficial de Docker Desktop.'
    }

    Write-Host "Ejecutando instalador oficial de Docker Desktop..." -ForegroundColor Cyan
    $process = Start-Process -FilePath $installerPath -ArgumentList 'install', '--accept-license', '--backend=wsl-2' -Wait -PassThru
    if ($process.ExitCode -ne 0) {
        throw "El instalador oficial de Docker Desktop fallo con codigo $($process.ExitCode)."
    }
}

function Test-DockerRegistryDns {
    try {
        $addresses = [System.Net.Dns]::GetHostAddresses('registry-1.docker.io')
        return ($addresses -and $addresses.Count -gt 0)
    } catch {
        return $false
    }
}

function Repair-DockerDnsResolution {
    Write-Host "Intentando reparar DNS de Docker (registry-1.docker.io)..." -ForegroundColor Yellow

    $dockerConfigDir = 'C:\ProgramData\Docker\config'
    $daemonJsonPath = Join-Path $dockerConfigDir 'daemon.json'
    New-Item -ItemType Directory -Path $dockerConfigDir -Force | Out-Null

    $daemonConfig = @{}
    if (Test-Path $daemonJsonPath) {
        try {
            $existing = Get-Content $daemonJsonPath -Raw -ErrorAction SilentlyContinue
            if (-not [string]::IsNullOrWhiteSpace($existing)) {
                $parsed = $existing | ConvertFrom-Json -Depth 20
                if ($parsed) {
                    $daemonConfig = @{}
                    foreach ($prop in $parsed.PSObject.Properties) {
                        $daemonConfig[$prop.Name] = $prop.Value
                    }
                }
            }
        } catch {
            $daemonConfig = @{}
        }
    }

    $dnsValues = @('1.1.1.1','8.8.8.8','8.8.4.4')
    if ($daemonConfig.ContainsKey('dns') -and $daemonConfig['dns']) {
        $dnsValues = @($daemonConfig['dns']) + $dnsValues
    }
    $daemonConfig['dns'] = @($dnsValues | Where-Object { -not [string]::IsNullOrWhiteSpace($_) } | Select-Object -Unique)

    ($daemonConfig | ConvertTo-Json -Depth 20) | Set-Content -Path $daemonJsonPath -Encoding UTF8

    try {
        Restart-Service -Name 'com.docker.service' -Force -ErrorAction Stop
    } catch {
        Write-Host "No se pudo reiniciar com.docker.service directamente. Intentando abrir Docker Desktop..." -ForegroundColor DarkYellow
    }

    $dockerDesktopExe = @(
        "$env:ProgramFiles\Docker\Docker\Docker Desktop.exe",
        "$env:LOCALAPPDATA\Docker\Docker Desktop.exe"
    ) | Where-Object { Test-Path $_ } | Select-Object -First 1

    if ($dockerDesktopExe) {
        Start-Process $dockerDesktopExe -ErrorAction SilentlyContinue
    }

    for ($i = 1; $i -le 18; $i++) {
        Start-Sleep -Seconds 5
        docker info | Out-Null 2>&1
        if ($LASTEXITCODE -eq 0) {
            break
        }
    }
}

$resolvedComposeFile = Resolve-Path $ComposeFile -ErrorAction SilentlyContinue
if (-not $resolvedComposeFile) { throw "No se encontro docker-compose.local.yml en la ruta recibida: $ComposeFile" }
$ComposeFile = $resolvedComposeFile.Path
$frontendRoot = Split-Path -Path $ComposeFile -Parent

if ([string]::IsNullOrWhiteSpace($BackendRoot)) {
    $BackendRoot = Join-Path (Split-Path -Path $frontendRoot -Parent) "facturacion_backend"
}
$resolvedBackendRoot = Resolve-Path $BackendRoot -ErrorAction SilentlyContinue
if (-not $resolvedBackendRoot) { throw "No se encontro backend en: $BackendRoot" }
$backendRoot = $resolvedBackendRoot.Path
if (-not (Test-Path (Join-Path $backendRoot 'artisan'))) { throw "La ruta backend no contiene artisan: $backendRoot" }

function Ensure-DockerAvailable {
    $dockerCommand = Get-Command docker -ErrorAction SilentlyContinue
    if ($dockerCommand) {
        # Docker encontrado, verificar engine
        $dockerInfo = docker info 2>&1
        if ($LASTEXITCODE -eq 0) {
            return  # Todo bien
        }
        # Engine no responde - intentar iniciar Docker Desktop
        Write-Host "Docker esta instalado pero el engine no esta corriendo. Intentando iniciar Docker Desktop..." -ForegroundColor Yellow
        $dockerDesktopExe = @(
            "$env:ProgramFiles\Docker\Docker\Docker Desktop.exe",
            "$env:LOCALAPPDATA\Docker\Docker Desktop.exe"
        ) | Where-Object { Test-Path $_ } | Select-Object -First 1

        if ($dockerDesktopExe) {
            Start-Process $dockerDesktopExe
            Write-Host "Esperando que el engine Docker inicie (hasta 90 segundos)..." -ForegroundColor Yellow
            $started = $false
            for ($i = 1; $i -le 18; $i++) {
                Start-Sleep -Seconds 5
                $testInfo = docker info 2>&1
                if ($LASTEXITCODE -eq 0) {
                    Write-Host "Docker engine listo." -ForegroundColor Green
                    $started = $true
                    break
                }
                Write-Host "  Esperando... ($($i*5)s)" -ForegroundColor DarkGray
            }
            if (-not $started) {
                throw "Docker Desktop se inicio pero el engine no respondio en 90s. Espera un momento y vuelve a ejecutar el instalador."
            }
            return
        }

        throw "Docker esta instalado pero el engine no responde. Abre Docker Desktop manualmente y vuelve a ejecutar."
    }

    # Docker no instalado - instalar automaticamente via winget
    Write-Host "" -ForegroundColor White
    Write-Host "============================================" -ForegroundColor Yellow
    Write-Host " Docker no esta instalado. Instalando..." -ForegroundColor Yellow
    Write-Host " (Descarga ~500MB, puede tardar varios minutos)" -ForegroundColor Yellow
    Write-Host "============================================" -ForegroundColor Yellow
    Write-Host ""

    # Habilitar WSL2 (requerido por Docker Desktop en Windows 10/11)
    Write-Host "Habilitando funcionalidad WSL2..." -ForegroundColor Cyan
    $wslFeature = dism.exe /online /Get-FeatureInfo /FeatureName:Microsoft-Windows-Subsystem-Linux 2>&1 | Out-String
    if ($wslFeature -notmatch "State : Enabled") {
        dism.exe /online /enable-feature /featurename:Microsoft-Windows-Subsystem-Linux /all /norestart | Out-Null
    }
    $vmFeature = dism.exe /online /Get-FeatureInfo /FeatureName:VirtualMachinePlatform 2>&1 | Out-String
    if ($vmFeature -notmatch "State : Enabled") {
        dism.exe /online /enable-feature /featurename:VirtualMachinePlatform /all /norestart | Out-Null
    }

    Repair-DockerDesktopDataPath
    Assert-DockerDesktopDataPathOwner

    # Intentar instalar Docker Desktop via winget
    $wingetCommand = Get-Command winget -ErrorAction SilentlyContinue
    if (-not $wingetCommand) {
        Install-DockerDesktopDirectly
    } else {
        Write-Host "Instalando Docker Desktop via winget..." -ForegroundColor Cyan
        winget source update 2>&1 | Out-Null
        winget install -e --id Docker.DockerDesktop --scope machine --accept-package-agreements --accept-source-agreements --disable-interactivity
        if ($LASTEXITCODE -ne 0) {
            # Intentar sin --scope machine (algunos winget no lo soportan)
            winget install -e --id Docker.DockerDesktop --accept-package-agreements --accept-source-agreements --disable-interactivity
        }

        if ($LASTEXITCODE -ne 0) {
            Write-Host "Winget no pudo instalar Docker Desktop. Intentando instalador oficial..." -ForegroundColor Yellow
            Repair-DockerDesktopDataPath
            Assert-DockerDesktopDataPathOwner
            Install-DockerDesktopDirectly
        }
    }

    Write-Host "" -ForegroundColor White
    Write-Host "============================================" -ForegroundColor Green
    Write-Host " Docker Desktop instalado correctamente." -ForegroundColor Green
    Write-Host " IMPORTANTE: Debes REINICIAR la PC para" -ForegroundColor Yellow
    Write-Host " que Docker quede activo. Despues de" -ForegroundColor Yellow
    Write-Host " reiniciar, vuelve a ejecutar este" -ForegroundColor Yellow
    Write-Host " instalador." -ForegroundColor Yellow
    Write-Host "============================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "Presiona una tecla para reiniciar ahora, o cierra esta ventana para reiniciar manualmente." -ForegroundColor Cyan
    $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
    Restart-Computer -Force
    exit 0
}

Ensure-DockerAvailable

$clientConfig = Join-Path $frontendRoot '.client-config.env'
$clientConfigExample = Join-Path $frontendRoot '.client-config.example.env'
if (-not (Test-Path $clientConfig) -and (Test-Path $clientConfigExample)) { Copy-Item $clientConfigExample $clientConfig }

$allowNetworkAccess = $false
if ($NonInteractive) {
    $allowNetworkAccess = $EnableLanAccess.IsPresent
} else {
    Write-Host "
" -ForegroundColor White
    Write-Host "======================================" -ForegroundColor Yellow
    Write-Host "  ACCESO REMOTO" -ForegroundColor Yellow
    Write-Host "======================================" -ForegroundColor Yellow
    Write-Host "
" -ForegroundColor White
    Write-Host "¿Deseas permitir acceso desde otras PCs en la red?" -ForegroundColor Cyan
    Write-Host "
" -ForegroundColor White
    Write-Host "  [s] Si  - Accesible desde cualquier PC de la red" -ForegroundColor Green
    Write-Host "          (puertos abiertos: backend 8000, frontend 5173, admin 5174)" -ForegroundColor DarkGray
    Write-Host "
" -ForegroundColor White
    Write-Host "  [n] No - Solo accesible localmente en esta PC (más seguro)" -ForegroundColor Yellow
    Write-Host "
" -ForegroundColor White
    $choice = Read-Host "Opcion"
    if ($choice -eq 's' -or $choice -eq 'S') { $allowNetworkAccess = $true }
}

$bindHost = if ($allowNetworkAccess) { '0.0.0.0' } else { '127.0.0.1' }

if (-not (Test-Path $clientConfig)) {
    Set-Content -Path $clientConfig -Value @(
        "COMPOSE_PROJECT_NAME=facturacion_local",
        "DOCKER_BIND_HOST=$bindHost",
        "BACKEND_PORT=8000",
        "FRONTEND_PORT=5173",
        "ADMIN_PORT=5174",
        "PGADMIN_PORT=5050",
        ("VITE_API_BASE_URL={0}" -f (Get-ApiBaseUrlConfigValue -BindHost $bindHost -BackendPort '8000')),
        "VITE_BACKEND_PORT=8000",
        "POSTGRES_DB=facturacion_v2",
        "POSTGRES_USER=facturacion",
        "POSTGRES_PASSWORD=facturacion",
        "PGADMIN_DEFAULT_EMAIL=admin@example.com",
        "PGADMIN_DEFAULT_PASSWORD=Admin123!",
        "BOOTSTRAP_SQL_PATH=..\facturacion_backend\facturacion_v2_bootstrap_20260423.sql",
        "TRANSACTIONAL_CLEANUP_SQL_PATH=database\sql\clean_transactional_operational.sql",
        "CLEAN_TRANSACTIONAL_ON_RESTORE=true",
        "RUN_MIGRATIONS=true"
    )
}

$composeProject = Get-ConfigValue -FilePath $clientConfig -Key 'COMPOSE_PROJECT_NAME' -DefaultValue 'facturacion_local'
$dockerBindHost = Get-ConfigValue -FilePath $clientConfig -Key 'DOCKER_BIND_HOST' -DefaultValue $bindHost
$backendPort = Get-ConfigValue -FilePath $clientConfig -Key 'BACKEND_PORT' -DefaultValue '8000'
$frontendPort = Get-ConfigValue -FilePath $clientConfig -Key 'FRONTEND_PORT' -DefaultValue '5173'
$adminPort = Get-ConfigValue -FilePath $clientConfig -Key 'ADMIN_PORT' -DefaultValue '5174'
$pgadminPort = Get-ConfigValue -FilePath $clientConfig -Key 'PGADMIN_PORT' -DefaultValue '5050'
$postgresDb = Get-ConfigValue -FilePath $clientConfig -Key 'POSTGRES_DB' -DefaultValue 'facturacion_v2'
$postgresUser = Get-ConfigValue -FilePath $clientConfig -Key 'POSTGRES_USER' -DefaultValue 'facturacion'
$postgresPassword = Get-ConfigValue -FilePath $clientConfig -Key 'POSTGRES_PASSWORD' -DefaultValue 'facturacion'
$pgadminEmail = Get-ConfigValue -FilePath $clientConfig -Key 'PGADMIN_DEFAULT_EMAIL' -DefaultValue 'admin@example.com'
$fallbackPgadminEmail = 'admin@example.com'
if (-not (Test-ValidEmail -Email $pgadminEmail)) {
    Write-Host ("PGADMIN_DEFAULT_EMAIL invalido ('$pgadminEmail'). Se usara '$fallbackPgadminEmail'.") -ForegroundColor Yellow
    $pgadminEmail = $fallbackPgadminEmail
}
$pgadminPassword = Get-ConfigValue -FilePath $clientConfig -Key 'PGADMIN_DEFAULT_PASSWORD' -DefaultValue 'Admin123!'
$bootstrapSqlPath = Get-ConfigValue -FilePath $clientConfig -Key 'BOOTSTRAP_SQL_PATH' -DefaultValue '..\facturacion_backend\facturacion_v2_bootstrap_20260423.sql'
$transactionalCleanupSqlPath = Get-ConfigValue -FilePath $clientConfig -Key 'TRANSACTIONAL_CLEANUP_SQL_PATH' -DefaultValue 'database\sql\clean_transactional_operational.sql'
$cleanTransactionalOnRestore = Get-ConfigValue -FilePath $clientConfig -Key 'CLEAN_TRANSACTIONAL_ON_RESTORE' -DefaultValue 'true'
$viteApiBaseUrl = Get-ApiBaseUrlConfigValue -BindHost $dockerBindHost -BackendPort $backendPort

Set-ConfigValue -FilePath $clientConfig -Key 'DOCKER_BIND_HOST' -Value $dockerBindHost
Set-ConfigValue -FilePath $clientConfig -Key 'VITE_API_BASE_URL' -Value $viteApiBaseUrl
Set-ConfigValue -FilePath $clientConfig -Key 'VITE_BACKEND_PORT' -Value $backendPort
Set-ConfigValue -FilePath $clientConfig -Key 'PGADMIN_PORT' -Value $pgadminPort
Set-ConfigValue -FilePath $clientConfig -Key 'PGADMIN_DEFAULT_EMAIL' -Value $pgadminEmail
Set-ConfigValue -FilePath $clientConfig -Key 'PGADMIN_DEFAULT_PASSWORD' -Value $pgadminPassword
Set-ConfigValue -FilePath $clientConfig -Key 'TRANSACTIONAL_CLEANUP_SQL_PATH' -Value $transactionalCleanupSqlPath
Set-ConfigValue -FilePath $clientConfig -Key 'CLEAN_TRANSACTIONAL_ON_RESTORE' -Value $cleanTransactionalOnRestore

$env:DOCKER_BIND_HOST = $dockerBindHost
$env:BACKEND_PORT = $backendPort
$env:FRONTEND_PORT = $frontendPort
$env:ADMIN_PORT = $adminPort
$env:PGADMIN_PORT = $pgadminPort
$env:POSTGRES_DB = $postgresDb
$env:POSTGRES_USER = $postgresUser
$env:POSTGRES_PASSWORD = $postgresPassword
$env:PGADMIN_DEFAULT_EMAIL = $pgadminEmail
$env:PGADMIN_DEFAULT_PASSWORD = $pgadminPassword
$env:VITE_API_BASE_URL = $viteApiBaseUrl
$env:VITE_BACKEND_PORT = $backendPort

$composeArgs = @('-p',$composeProject,'-f',$ComposeFile)

$installLog = Join-Path $frontendRoot 'install-local.log'

function Append-InstallLog {
    param([string]$Message)
    $timestamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
    Add-Content -Path $installLog -Value ("[$timestamp] $Message")
}

$composeVersion = docker compose version 2>&1
if ($LASTEXITCODE -ne 0) {
    throw "Docker Compose v2 no esta disponible. Salida: $($composeVersion -join ' ')"
}

# Always ensure daemon.json has explicit DNS servers so Docker builds can reach apt/pypi/etc.
# Repair-DockerDnsResolution is idempotent; it merges existing config without overwriting.
Repair-DockerDnsResolution
Append-InstallLog 'DNS de Docker verificado/reparado antes del primer compose up.'

Write-Host 'Levantando stack local Docker...' -ForegroundColor Cyan
$previousErrorActionPreference = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
$composeUpOutput = docker compose @composeArgs up -d --build 2>&1
$composeExitCode = $LASTEXITCODE
$ErrorActionPreference = $previousErrorActionPreference
if ($composeExitCode -ne 0) {
    Append-InstallLog 'Primer intento de docker compose up fallo.'
    $composeUpOutput | ForEach-Object { Append-InstallLog $_ }

    $composeOutputText = ($composeUpOutput | Out-String)
    $dnsFailure     = ($composeOutputText -match 'registry-1\.docker\.io|no such host|lookup.*docker') 
    $aptFailure     = ($composeOutputText -match 'apt-get|exit code 100|E: Unable to fetch|E: Failed to fetch')
    $entrypointBad  = ($composeOutputText -match 'docker-entrypoint\.sh.*no such file|no such file.*docker-entrypoint|exec.*entrypoint.*no such file')

    if ($dnsFailure -or $aptFailure) {
        Write-Host 'Detectado fallo DNS/red en build Docker. Reparando DNS y reintentando...' -ForegroundColor Yellow
        Append-InstallLog 'Fallo DNS/apt detectado. Ejecutando Repair-DockerDnsResolution.'
        Repair-DockerDnsResolution
    }

    Write-Host 'Error al levantar el stack local. Salida de docker compose up:' -ForegroundColor Red
    $composeUpOutput | ForEach-Object { Write-Host $_ -ForegroundColor DarkYellow }

    Write-Host ''
    Write-Host 'Intentando recuperacion automatica (down + segundo up)...' -ForegroundColor Yellow
    docker compose @composeArgs down --remove-orphans 2>&1 | ForEach-Object {
        Write-Host $_ -ForegroundColor DarkGray
        Append-InstallLog $_
    }

    if ($entrypointBad -or $aptFailure) {
        Write-Host 'Reconstruyendo imagen backend sin cache (imagen obsoleta o fallo de red en build)...' -ForegroundColor Yellow
        Append-InstallLog 'Reconstruyendo backend con --no-cache por imagen obsoleta o fallo apt.'
        $ErrorActionPreference = 'Continue'
        docker compose @composeArgs build --no-cache backend 2>&1 | ForEach-Object {
            Write-Host $_ -ForegroundColor DarkGray
            Append-InstallLog $_
        }
        $ErrorActionPreference = $previousErrorActionPreference
    }

    $previousErrorActionPreference = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    $composeUpOutputRetry = docker compose @composeArgs up -d --build 2>&1
    $composeExitCodeRetry = $LASTEXITCODE
    $ErrorActionPreference = $previousErrorActionPreference

    if ($composeExitCodeRetry -ne 0) {
        Append-InstallLog 'Segundo intento de docker compose up fallo.'
        $composeUpOutputRetry | ForEach-Object { Append-InstallLog $_ }

        Write-Host 'Segundo intento fallido. Salida de docker compose up:' -ForegroundColor Red
        $composeUpOutputRetry | ForEach-Object { Write-Host $_ -ForegroundColor DarkYellow }

        Write-Host ''
        Write-Host 'Estado actual de servicios:' -ForegroundColor Yellow
        docker compose @composeArgs ps 2>&1 | ForEach-Object {
            Write-Host $_
            Append-InstallLog $_
        }

        Write-Host ''
        Write-Host 'Ultimos logs de servicios (tail 120):' -ForegroundColor Yellow
        docker compose @composeArgs logs --tail=120 2>&1 | ForEach-Object {
            Write-Host $_
            Append-InstallLog $_
        }

        throw "No se pudo levantar el stack local tras 2 intentos. Revisa el log: $installLog"
    }

    Write-Host 'Recuperacion automatica exitosa en segundo intento.' -ForegroundColor Green
    Append-InstallLog 'Segundo intento de docker compose up exitoso.'
} else {
    Append-InstallLog 'docker compose up exitoso en primer intento.'
}

if ($dockerBindHost -eq '0.0.0.0') {
    Ensure-FacturacionFirewallRules -Ports @([int]$backendPort, [int]$frontendPort, [int]$adminPort, [int]$pgadminPort)
    Append-InstallLog 'Acceso remoto habilitado: reglas de firewall aplicadas.'
} else {
    Remove-FacturacionFirewallRules -Ports @([int]$backendPort, [int]$frontendPort, [int]$adminPort, [int]$pgadminPort)
    Append-InstallLog 'Acceso remoto deshabilitado: reglas de firewall removidas.'
}

$runMigrations = Get-ConfigValue -FilePath $clientConfig -Key 'RUN_MIGRATIONS' -DefaultValue 'true'
if ($runMigrations -eq 'true') {
    $bootstrapRestored = Initialize-DatabaseFromBootstrap -ComposeArgs $composeArgs -PostgresPassword $postgresPassword -PostgresUser $postgresUser -PostgresDb $postgresDb -BootstrapSqlPath (Join-Path $frontendRoot $bootstrapSqlPath)

    if ($bootstrapRestored -and $cleanTransactionalOnRestore -eq 'true') {
        Write-Host 'Limpiando tablas operacionales/transaccionales del dump base...' -ForegroundColor Cyan
        try {
            Invoke-ComposePostgresSqlFile -ComposeArgs $composeArgs -PostgresPassword $postgresPassword -PostgresUser $postgresUser -PostgresDb $postgresDb -SqlFilePath (Join-Path $frontendRoot $transactionalCleanupSqlPath)
            Append-InstallLog 'Limpieza transaccional aplicada sobre dump restaurado.'
        } catch {
            Write-Host "ADVERTENCIA: Limpieza transaccional no critica fallo: $_" -ForegroundColor Yellow
            Append-InstallLog "ADVERTENCIA limpieza transaccional: $_"
        }
    }

    Write-Host 'Aplicando migraciones...' -ForegroundColor Cyan
    $ok = $false
    for ($attempt=1; $attempt -le 20; $attempt++) {
        docker compose @composeArgs exec -T backend php artisan migrate --force
        if ($LASTEXITCODE -eq 0) { $ok = $true; break }
        Write-Host "Esperando backend para migrar (intento $attempt/20)..." -ForegroundColor Yellow
        Start-Sleep -Seconds 3
    }
    if (-not $ok) { throw 'No se pudieron aplicar migraciones automaticamente.' }
}

Write-Host 'Asegurando superadmin + empresas base (retail/restaurante)...' -ForegroundColor Cyan
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
    throw 'No se pudo asegurar el baseline (superadmin + retail + restaurante).'
}

$cmdPath = (Get-Command cmd.exe).Source
$scriptsRoot = Join-Path (Split-Path -Path $frontendRoot -Parent) 'scripts_local'
New-Item -ItemType Directory -Path $scriptsRoot -Force | Out-Null
Copy-Item -Path (Join-Path $PSScriptRoot '*.ps1') -Destination $scriptsRoot -Force -ErrorAction SilentlyContinue
Copy-Item -Path (Join-Path $PSScriptRoot '*.bat') -Destination $scriptsRoot -Force -ErrorAction SilentlyContinue

New-DesktopShortcut -Name 'Facturacion - Levantar' -TargetPath (Join-Path $scriptsRoot 'levantar-local.bat') -WorkingDirectory $scriptsRoot
New-DesktopShortcut -Name 'Facturacion - Apagar' -TargetPath (Join-Path $scriptsRoot 'apagar-local.bat') -WorkingDirectory $scriptsRoot
New-DesktopShortcut -Name 'Facturacion - Limpiar Transacciones' -TargetPath (Join-Path $scriptsRoot 'limpiar-transaccionales-local.bat') -WorkingDirectory $scriptsRoot
New-DesktopShortcut -Name 'Facturacion - pgAdmin' -TargetPath "$env:WINDIR\explorer.exe" -Arguments ("http://127.0.0.1:{0}" -f $pgadminPort)

$desktopPath = [Environment]::GetFolderPath('Desktop')
$updateShortcutPath = Join-Path $desktopPath 'Facturacion - Actualizar.lnk'
$uninstallShortcutPath = Join-Path $desktopPath 'Facturacion - Desinstalar.lnk'
if (Test-Path $updateShortcutPath) { Remove-Item $updateShortcutPath -Force }
if (Test-Path $uninstallShortcutPath) { Remove-Item $uninstallShortcutPath -Force }

Write-Host 'Instalacion completada.' -ForegroundColor Green
Show-AccessUrls -BindHost $dockerBindHost -BackendPort $backendPort -FrontendPort $frontendPort -AdminPort $adminPort -PgAdminPort $pgadminPort -PgAdminEmail $pgadminEmail -PgAdminPassword $pgadminPassword
