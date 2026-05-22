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
                $_.IPAddress -ne '0.0.0.0' -and
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
                $_ -ne '0.0.0.0' -and
                -not $_.StartsWith('169.254.')
            } |
            Select-Object -Unique
    }

    return @($addresses)
}

function Get-PrimaryLanIpv4 {
    try {
        $cfg = Get-NetIPConfiguration -ErrorAction Stop |
            Where-Object {
                $_.IPv4DefaultGateway -and
                $_.IPv4Address -and
                $_.IPv4Address.IPAddress -and
                $_.IPv4Address.IPAddress -ne '127.0.0.1' -and
                $_.IPv4Address.IPAddress -ne '0.0.0.0' -and
                -not $_.IPv4Address.IPAddress.StartsWith('169.254.')
            } |
            Select-Object -First 1

        if ($cfg -and $cfg.IPv4Address -and $cfg.IPv4Address.IPAddress) {
            return $cfg.IPv4Address.IPAddress
        }
    } catch {
        return $null
    }

    return $null
}

function Get-PreferredBrowserHost {
    param(
        [string]$BindHost
    )

    if ($BindHost -ne '0.0.0.0') {
        if ([string]::IsNullOrWhiteSpace($BindHost)) {
            return '127.0.0.1'
        }

        return $BindHost
    }

    $primaryLanIp = Get-PrimaryLanIpv4
    if (-not [string]::IsNullOrWhiteSpace($primaryLanIp)) {
        return $primaryLanIp
    }

    $lanIps = Get-LocalIpv4Addresses
    if ($lanIps.Count -gt 0) {
        return $lanIps[0]
    }

    return '127.0.0.1'
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

    $result = docker compose @ComposeArgs exec -T --env "PGPASSWORD=$PostgresPassword" postgres psql -U $PostgresUser -d $PostgresDb -tAc $Sql
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
        "core.branches",
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
        docker compose @ComposeArgs exec -T --env "PGPASSWORD=$PostgresPassword" postgres psql -U $PostgresUser -d $PostgresDb -c 'CREATE ROLE postgres;' | Out-Null
        if ($LASTEXITCODE -ne 0) {
            throw 'No se pudo preparar el rol postgres requerido por el dump base.'
        }
    }

    $postgresContainerId = (docker compose @ComposeArgs ps -q postgres | Out-String).Trim()
    if (-not $postgresContainerId) {
        throw 'No se pudo identificar el contenedor de PostgreSQL.'
    }

    # If schemas are partially present, clean them first to avoid restore conflicts.
    docker compose @ComposeArgs exec -T --env "PGPASSWORD=$PostgresPassword" postgres psql -q -v ON_ERROR_STOP=1 -U $PostgresUser -d $PostgresDb -c "SET client_min_messages TO warning; DROP SCHEMA IF EXISTS appcfg,auth,billing,core,inventory,master,ops,restaurant,sales CASCADE; DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public; GRANT ALL ON SCHEMA public TO public;"
    if ($LASTEXITCODE -ne 0) {
        throw 'No se pudo limpiar esquemas existentes antes de restaurar el dump base.'
    }

    docker cp $resolvedBootstrapSqlPath "${postgresContainerId}:/tmp/bootstrap.sql"
    if ($LASTEXITCODE -ne 0) {
        throw 'No se pudo copiar el dump base al contenedor de PostgreSQL.'
    }

    docker compose @ComposeArgs exec -T --env "PGPASSWORD=$PostgresPassword" postgres psql -q -v ON_ERROR_STOP=1 -U $PostgresUser -d $PostgresDb -f /tmp/bootstrap.sql
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

    docker compose @ComposeArgs exec -T --env "PGPASSWORD=$PostgresPassword" postgres psql -q -U $PostgresUser -d $PostgresDb -v ON_ERROR_STOP=1 -f /tmp/runtime-script.sql
    if ($LASTEXITCODE -ne 0) {
        throw 'No se pudo ejecutar el script SQL en PostgreSQL.'
    }

    docker compose @ComposeArgs exec -T postgres rm -f /tmp/runtime-script.sql | Out-Null
}

function Resolve-TransactionalCleanupSqlPath {
    param(
        [string]$FrontendRoot,
        [string]$BackendRoot,
        [string]$ConfiguredPath,
        [string]$ScriptRoot
    )

    $candidates = @()

    if (-not [string]::IsNullOrWhiteSpace($ConfiguredPath)) {
        if ([System.IO.Path]::IsPathRooted($ConfiguredPath)) {
            $candidates += $ConfiguredPath
        } else {
            $candidates += (Join-Path $FrontendRoot $ConfiguredPath)
        }
    }

    # Prioridad: repo frontend/backend reales descargados desde git.
    $candidates += @(
        (Join-Path $FrontendRoot 'database\sql\clean_transactional_operational.sql'),
        (Join-Path $BackendRoot 'database\sql\clean_transactional_operational.sql'),
        (Join-Path $FrontendRoot '..\facturacion_backend\database\sql\clean_transactional_operational.sql')
    )

    # Ultimo recurso: copia de payload incluida en instalador portable.
    $candidates += @(
        (Join-Path $ScriptRoot '..\database\sql\clean_transactional_operational.sql'),
        (Join-Path $ScriptRoot '..\payload\facturacion_backend\database\sql\clean_transactional_operational.sql'),
        (Join-Path $FrontendRoot 'payload\facturacion_backend\database\sql\clean_transactional_operational.sql')
    )

    foreach ($candidate in ($candidates | Select-Object -Unique)) {
        $resolved = Resolve-Path $candidate -ErrorAction SilentlyContinue
        if ($resolved) {
            return $resolved.Path
        }
    }

    return $null
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

    # Owner y ACL m├¡nimos esperados por Docker Desktop (via SID, independiente del idioma del SO).
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

function Enable-WSL2 {
    Write-Host "Habilitando WSL2..." -ForegroundColor Cyan

    $isAdmin = ([System.Security.Principal.WindowsIdentity]::GetCurrent().Groups -contains 'S-1-5-32-544')
    if (-not $isAdmin) {
        throw "Se requieren permisos de administrador para habilitar WSL2. Reinicia el instalador como Administrador."
    }

    $script:WSL2_REBOOT_REQUIRED = $false

    dism /online /enable-feature /featurename:Microsoft-Windows-Subsystem-Linux /quiet /norestart | Out-Null
    if ($LASTEXITCODE -eq 3010) {
        $script:WSL2_REBOOT_REQUIRED = $true
        Write-Host "Microsoft-Windows-Subsystem-Linux habilitado. Requiere reinicio." -ForegroundColor Yellow
    } elseif ($LASTEXITCODE -ne 0) {
        Write-Host "Advertencia: DISM no pudo habilitar WSL (puede ya estar habilitado). Continuando..." -ForegroundColor Yellow
    }

    dism /online /enable-feature /featurename:VirtualMachinePlatform /quiet /norestart | Out-Null
    if ($LASTEXITCODE -eq 3010) {
        $script:WSL2_REBOOT_REQUIRED = $true
        Write-Host "VirtualMachinePlatform habilitado. Requiere reinicio." -ForegroundColor Yellow
    } elseif ($LASTEXITCODE -ne 0) {
        Write-Host "Advertencia: VirtualMachinePlatform no pudo habilitarse (puede ya estar habilitado). Continuando..." -ForegroundColor Yellow
    }

    # Fallback: check Windows registry for any pending reboot
    if (-not $script:WSL2_REBOOT_REQUIRED) {
        foreach ($rp in @('HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Component Based Servicing\RebootPending','HKLM:\SYSTEM\CurrentControlSet\Control\Session Manager\PendingFileRenameOperations')) {
            if (Test-Path $rp) { $script:WSL2_REBOOT_REQUIRED = $true; break }
        }
    }

    if ($script:WSL2_REBOOT_REQUIRED) {
        Write-Host "WSL2 habilitado por primera vez en este equipo." -ForegroundColor Yellow
        Write-Host "SE REQUIERE REINICIAR WINDOWS antes de instalar Ubuntu." -ForegroundColor Yellow
    } else {
        Write-Host "WSL2 ya estaba habilitado y listo." -ForegroundColor Green
    }
}

function Ensure-UbuntuInWSL2 {
    Write-Host "Preparando Ubuntu en WSL2..." -ForegroundColor Cyan

    # If DISM just enabled WSL features for the first time, Windows needs a reboot
    # before wsl --install or any wsl command can actually work.
    if ($script:WSL2_REBOOT_REQUIRED) {
        Write-Host ""
        Write-Host "============================================================" -ForegroundColor Yellow
        Write-Host "  REINICIO DE WINDOWS REQUERIDO" -ForegroundColor Yellow
        Write-Host "  WSL2 se acabo de habilitar por primera vez en este equipo." -ForegroundColor Yellow
        Write-Host "  Pasos:" -ForegroundColor Yellow
        Write-Host "    1. Cierra esta ventana." -ForegroundColor White
        Write-Host "    2. Reinicia Windows (Inicio > Reiniciar)." -ForegroundColor White
        Write-Host "    3. Ejecuta nuevamente INSTALAR-FACTURACION.bat como Admin." -ForegroundColor White
        Write-Host "============================================================" -ForegroundColor Yellow
        Write-Host ""
        throw "Reinicio requerido: WSL2 se habilito por primera vez. Reinicia Windows y ejecuta el instalador nuevamente."
    }

    $wslCommand = Get-Command wsl -ErrorAction SilentlyContinue
    if (-not $wslCommand) {
        Write-Host "WSL no esta disponible. Abre PowerShell como Admin y ejecuta:" -ForegroundColor Yellow
        Write-Host "  wsl --install -d Ubuntu" -ForegroundColor Cyan
        return $false
    }

    # Primary check: if distro 'Ubuntu' can start, skip installation flow.
    wsl -d Ubuntu -e sh -lc "exit 0" >$null 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "Ubuntu en WSL2 detectado y operativo." -ForegroundColor Green
        return $true
    }

    $ubuntuDistributions = @(wsl --list --quiet 2>$null | ForEach-Object { $_.Trim() } | Where-Object { $_ -match '^(?i)Ubuntu($|[- ].*)' })
    if ($ubuntuDistributions.Count -gt 0) {
        Write-Host "Ubuntu en WSL2 detectado: $($ubuntuDistributions -join ', ')." -ForegroundColor Green
        return $true
    }

    Write-Host "Instalando Ubuntu en WSL2 (primera vez, puede tardar 2-5 minutos)..." -ForegroundColor Cyan
    $installOutput = wsl --install -d Ubuntu --no-launch 2>&1
    $installOutput | ForEach-Object { Write-Host "  $_" -ForegroundColor DarkGray }
    if ($LASTEXITCODE -eq 0) {
        Write-Host "Ubuntu instalado en WSL2." -ForegroundColor Green
        return $true
    }

    $installText = ($installOutput | Out-String)
    if ($installText -match '(?i)ERROR_ALREADY_EXISTS|already exists|Ya existe una distribuci') {
        Write-Host "Ubuntu ya existia en WSL2; se continuara con esa instalacion." -ForegroundColor Yellow
        return $true
    }

    # Fallback check: even if localized output is not parsed as expected,
    # continue when Ubuntu can be launched after the install attempt.
    wsl -d Ubuntu -e sh -lc "exit 0" >$null 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "Ubuntu ya estaba disponible en WSL2; se continuara con esa instalacion." -ForegroundColor Yellow
        return $true
    }

    $ubuntuDistributions = @(wsl --list --quiet 2>$null | ForEach-Object { $_.Trim() } | Where-Object { $_ -match '^(?i)Ubuntu($|[- ].*)' })
    if ($ubuntuDistributions.Count -gt 0) {
        Write-Host "Ubuntu ya estaba registrado en WSL2: $($ubuntuDistributions -join ', ')." -ForegroundColor Yellow
        return $true
    }

    if ($LASTEXITCODE -eq 3010) {
        Write-Host ""
        Write-Host "============================================================" -ForegroundColor Yellow
        Write-Host "  Ubuntu instalado pero requiere reinicio para activarse." -ForegroundColor Yellow
        Write-Host "  Reinicia Windows y ejecuta el instalador nuevamente." -ForegroundColor Yellow
        Write-Host "============================================================" -ForegroundColor Yellow
        throw "Reinicio requerido tras instalar Ubuntu en WSL2. Reinicia Windows y ejecuta el instalador nuevamente."
    }

    Write-Host "Ubuntu no pudo instalarse automaticamente." -ForegroundColor Yellow
    return $false
}

function Install-DockerInUbuntuWSL2 {
    Write-Host "Instalando Docker nativo en Ubuntu/WSL2..." -ForegroundColor Cyan
    Write-Host "(Descarga ligera comparada con Docker Desktop)" -ForegroundColor DarkGray

    $wslCommand = Get-Command wsl -ErrorAction SilentlyContinue
    if (-not $wslCommand) {
        return $false
    }

    $ubuntuRunning = wsl -l -v 2>$null | Select-String "Ubuntu.*Running"
    if (-not $ubuntuRunning) {
        Write-Host "Iniciando Ubuntu..." -ForegroundColor Yellow
        wsl -d Ubuntu -e ls >$null 2>&1
    }

    wsl -d Ubuntu -u root -e bash -lc "apt-get update -qq && (apt-get install -y docker.io docker-compose || apt-get install -y docker.io docker-compose-plugin)" 2>$null | Out-Null
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Docker en WSL2 no pudo instalarse." -ForegroundColor Yellow
        return $false
    }

    Write-Host "Iniciando Docker daemon en Ubuntu..." -ForegroundColor Cyan
    wsl -d Ubuntu -u root -e service docker start 2>$null | Out-Null
    wsl -d Ubuntu -u root -e docker version >$null 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "Docker en WSL2 operativo." -ForegroundColor Green
        return $true
    }

    Write-Host "Docker en WSL2 no pudo iniciar correctamente." -ForegroundColor Yellow
    return $false
}

function Test-DockerViaWSL2 {
    $wslCommand = Get-Command wsl -ErrorAction SilentlyContinue
    if (-not $wslCommand) {
        return $false
    }

    wsl -d Ubuntu -u root -e service docker start >$null 2>&1
    wsl -d Ubuntu -u root -e docker info >$null 2>&1
    return $LASTEXITCODE -eq 0
}

function Convert-ToWslPath {
    param([string]$Path)

    if ([string]::IsNullOrWhiteSpace($Path)) {
        return $Path
    }

    if ($Path -match '^[A-Za-z]:\\') {
        $drive = $Path.Substring(0,1).ToLowerInvariant()
        $tail = $Path.Substring(2) -replace '\\','/'
        return "/mnt/$drive$tail"
    }

    return $Path
}

function Enable-DockerWslProxy {
    function global:docker {
        # Use automatic $args so PowerShell does NOT bind flags like -d, -e, -T as named params.

        $mappedArgs = @()
        foreach ($arg in $args) {
            $mappedArgs += Convert-ToWslPath -Path $arg
        }

        wsl -d Ubuntu -u root -e docker @mappedArgs
    }
}
function Confirm-Yes {
    param(
        [string]$Prompt,
        [bool]$DefaultYes = $false
    )

    if ($DefaultYes) {
        $answer = Read-Host "$Prompt [S/n]"
        if ([string]::IsNullOrWhiteSpace($answer)) { return $true }
        return @('s', 'si', 'y', 'yes') -contains $answer.Trim().ToLowerInvariant()
    }

    $answer = Read-Host "$Prompt [s/N]"
    if ([string]::IsNullOrWhiteSpace($answer)) { return $false }
    return @('s', 'si', 'y', 'yes') -contains $answer.Trim().ToLowerInvariant()
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
    $global:DOCKER_WSL2_MODE = $false

    $dockerCommand = Get-Command docker -ErrorAction SilentlyContinue
    if ($dockerCommand) {
        docker info | Out-Null 2>&1
        if ($LASTEXITCODE -eq 0) {
            Write-Host "Docker en Windows operativo." -ForegroundColor Green
            return
        }

        Write-Host "Docker CLI existe, pero el engine Windows no responde." -ForegroundColor Yellow
    } else {
        Write-Host "Docker CLI no esta disponible en Windows." -ForegroundColor Yellow
    }

    Write-Host "Instalacion ligera por defecto: Docker Engine en WSL2 (sin Docker Desktop)." -ForegroundColor Cyan

    Enable-WSL2
    if (-not (Ensure-UbuntuInWSL2)) {
        throw "No se pudo preparar Ubuntu en WSL2 automaticamente. Reinicia Windows y vuelve a ejecutar como Administrador."
    }

    if (-not (Install-DockerInUbuntuWSL2)) {
        throw "No se pudo instalar Docker en WSL2 automaticamente. Verifica WSL/Ubuntu y reintenta."
    }

    if (-not (Test-DockerViaWSL2)) {
        throw "Docker en WSL2 no quedo operativo tras la instalacion. Reinicia Windows y vuelve a ejecutar el instalador."
    }

    $global:DOCKER_WSL2_MODE = $true
    Write-Host "Docker en WSL2 listo y operativo." -ForegroundColor Green
}

Ensure-DockerAvailable

if ($global:DOCKER_WSL2_MODE) {
    Enable-DockerWslProxy
    Write-Host "Docker operara en modo WSL2 (proxy activo)." -ForegroundColor Green
}

$clientConfig = Join-Path $frontendRoot '.client-config.env'
$clientConfigExample = Join-Path $frontendRoot '.client-config.example.env'
if (-not (Test-Path $clientConfig) -and (Test-Path $clientConfigExample)) { Copy-Item $clientConfigExample $clientConfig }

$allowNetworkAccess = $false
if ($NonInteractive) {
    $allowNetworkAccess = $EnableLanAccess.IsPresent
} else {
    Write-Host "" -ForegroundColor White
    Write-Host "======================================" -ForegroundColor Yellow
    Write-Host "  ACCESO REMOTO" -ForegroundColor Yellow
    Write-Host "======================================" -ForegroundColor Yellow
    Write-Host "" -ForegroundColor White
    Write-Host "Deseas permitir acceso desde otras PCs en la red?" -ForegroundColor Cyan
    Write-Host "" -ForegroundColor White
    Write-Host "  [s] Si  - Accesible desde cualquier PC de la red" -ForegroundColor Green
    Write-Host "          (puertos abiertos: backend 8000, frontend 5173, admin 5174)" -ForegroundColor DarkGray
    Write-Host "" -ForegroundColor White
    Write-Host "  [n] No - Solo accesible localmente en esta PC (mas seguro)" -ForegroundColor Yellow
    Write-Host "" -ForegroundColor White
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
$browserHost = Get-PreferredBrowserHost -BindHost $dockerBindHost
$frontendUrl = "http://${browserHost}:${frontendPort}"
$frontendAppUrl = "http://${browserHost}:${adminPort}"

Set-ConfigValue -FilePath $clientConfig -Key 'DOCKER_BIND_HOST' -Value $dockerBindHost
Set-ConfigValue -FilePath $clientConfig -Key 'VITE_API_BASE_URL' -Value $viteApiBaseUrl
Set-ConfigValue -FilePath $clientConfig -Key 'VITE_BACKEND_PORT' -Value $backendPort
Set-ConfigValue -FilePath $clientConfig -Key 'PGADMIN_PORT' -Value $pgadminPort
Set-ConfigValue -FilePath $clientConfig -Key 'PGADMIN_DEFAULT_EMAIL' -Value $pgadminEmail
Set-ConfigValue -FilePath $clientConfig -Key 'PGADMIN_DEFAULT_PASSWORD' -Value $pgadminPassword
Set-ConfigValue -FilePath $clientConfig -Key 'TRANSACTIONAL_CLEANUP_SQL_PATH' -Value $transactionalCleanupSqlPath
Set-ConfigValue -FilePath $clientConfig -Key 'CLEAN_TRANSACTIONAL_ON_RESTORE' -Value $cleanTransactionalOnRestore
Set-ConfigValue -FilePath $clientConfig -Key 'FRONTEND_URL' -Value $frontendUrl
Set-ConfigValue -FilePath $clientConfig -Key 'FRONTEND_APP_URL' -Value $frontendAppUrl

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
$env:FRONTEND_URL = $frontendUrl
$env:FRONTEND_APP_URL = $frontendAppUrl

$composeFileForDocker = if ($global:DOCKER_WSL2_MODE) { Convert-ToWslPath -Path $ComposeFile } else { $ComposeFile }
$clientConfigForDocker = if ($global:DOCKER_WSL2_MODE) { Convert-ToWslPath -Path $clientConfig } else { $clientConfig }
$composeArgs = @('-p',$composeProject,'-f',$composeFileForDocker,'--env-file',$clientConfigForDocker)

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

Append-InstallLog 'Instalacion rapida: se omite reparacion DNS preventiva (solo se aplica ante falla real).'

Write-Host 'Levantando stack local Docker...' -ForegroundColor Cyan
$previousErrorActionPreference = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
$composeUpOutput = docker compose @composeArgs up -d 2>&1
$composeExitCode = $LASTEXITCODE
$ErrorActionPreference = $previousErrorActionPreference
if ($composeExitCode -ne 0) {
    Append-InstallLog 'Primer intento de docker compose up fallo.'
    $composeUpOutput | ForEach-Object { Append-InstallLog $_ }

    $composeOutputText = ($composeUpOutput | Out-String)
    $dnsFailure     = ($composeOutputText -match 'registry-1\.docker\.io|no such host|lookup.*docker') 
    $aptFailure     = ($composeOutputText -match 'apt-get|exit code 100|E: Unable to fetch|E: Failed to fetch')
    $entrypointBad  = ($composeOutputText -match 'docker-entrypoint\.sh.*no such file|no such file.*docker-entrypoint|exec.*entrypoint.*no such file')
    $postgresUpgradeMismatch = $false

    if ($dnsFailure -or $aptFailure) {
        Write-Host 'Detectado fallo DNS/red en build Docker. Reparando DNS y reintentando...' -ForegroundColor Yellow
        Append-InstallLog 'Fallo DNS/apt detectado. Ejecutando Repair-DockerDnsResolution.'
        Repair-DockerDnsResolution
    }

    Write-Host 'Error al levantar el stack local. Salida de docker compose up:' -ForegroundColor Red
    $composeUpOutput | ForEach-Object { Write-Host $_ -ForegroundColor DarkYellow }

    # Detect PostgreSQL 18+ volume layout mismatch from previous versions.
    # If detected, recreate postgres volume automatically (clean install behavior).
    $postgresLogsText = (docker compose @composeArgs logs --tail=120 postgres 2>&1 | Out-String)
    if ($postgresLogsText -match 'in 18\+, these Docker images are configured to store database data' -or $postgresLogsText -match 'Counter to that, there appears to be PostgreSQL data in:') {
        $postgresUpgradeMismatch = $true
        Write-Host 'Detectado volumen PostgreSQL incompatible (upgrade 18+). Se recreara volumen de postgres para continuar.' -ForegroundColor Yellow
        Append-InstallLog 'Detectado mismatch de volumen PostgreSQL 18+. Se ejecutara down -v para recrear volumen.'
    }

    Write-Host ''
    if ($postgresUpgradeMismatch) {
        Write-Host 'Intentando recuperacion automatica (down -v + segundo up con build)...' -ForegroundColor Yellow
        docker compose @composeArgs down --remove-orphans -v 2>&1 | ForEach-Object {
            Write-Host $_ -ForegroundColor DarkGray
            Append-InstallLog $_
        }
    } else {
        Write-Host 'Intentando recuperacion automatica (down + segundo up con build)...' -ForegroundColor Yellow
        docker compose @composeArgs down --remove-orphans 2>&1 | ForEach-Object {
            Write-Host $_ -ForegroundColor DarkGray
            Append-InstallLog $_
        }
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
    $backendReady = $false
    for ($backendAttempt = 1; $backendAttempt -le 15; $backendAttempt++) {
        $backendPs = docker compose @composeArgs ps --format json backend 2>$null
        $backendState = $null
        if ($backendPs) {
            $backendState = $backendPs | ConvertFrom-Json -ErrorAction SilentlyContinue
        }

        if ($backendState -and $backendState.State -eq 'running') {
            $backendReady = $true
            break
        }

        if ($backendAttempt -eq 1) {
            Write-Host 'Backend no esta en running. Intentando recuperacion automatica sin rebuild...' -ForegroundColor Yellow
        }

        docker compose @composeArgs up -d backend 2>&1 | ForEach-Object {
            Write-Host $_ -ForegroundColor DarkGray
            Append-InstallLog $_
        }

        Write-Host "Esperando backend en running (intento $backendAttempt/15)..." -ForegroundColor Yellow
        Start-Sleep -Seconds 2
    }

    if (-not $backendReady) {
        Write-Host 'Backend sigue sin running. Ultimos logs del backend:' -ForegroundColor Red
        docker compose @composeArgs logs --tail=120 backend 2>&1 | ForEach-Object {
            Write-Host $_ -ForegroundColor DarkYellow
            Append-InstallLog $_
        }
        throw 'No se pudo dejar backend en running antes de aplicar migraciones.'
    }

    $bootstrapRestored = Initialize-DatabaseFromBootstrap -ComposeArgs $composeArgs -PostgresPassword $postgresPassword -PostgresUser $postgresUser -PostgresDb $postgresDb -BootstrapSqlPath (Join-Path $frontendRoot $bootstrapSqlPath)

    if ($bootstrapRestored -and $cleanTransactionalOnRestore -eq 'true') {
        Write-Host 'Limpiando tablas operacionales/transaccionales del dump base...' -ForegroundColor Cyan
        try {
            $cleanupSqlFullPath = Resolve-TransactionalCleanupSqlPath -FrontendRoot $frontendRoot -BackendRoot $backendRoot -ConfiguredPath $transactionalCleanupSqlPath -ScriptRoot $PSScriptRoot
            if (-not $cleanupSqlFullPath) {
                throw "No se encontro script SQL de limpieza transaccional en frontend/backend del repo ni en payload de respaldo."
            }

            Invoke-ComposePostgresSqlFile -ComposeArgs $composeArgs -PostgresPassword $postgresPassword -PostgresUser $postgresUser -PostgresDb $postgresDb -SqlFilePath $cleanupSqlFullPath
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
        docker compose @composeArgs up -d backend | Out-Null
        Write-Host "Esperando backend para migrar (intento $attempt/20)..." -ForegroundColor Yellow
        Start-Sleep -Seconds 3
    }
    if (-not $ok) { throw 'No se pudieron aplicar migraciones automaticamente.' }
}

Write-Host 'Asegurando credenciales locales del usuario admin_panel...' -ForegroundColor Cyan
docker compose @composeArgs exec -T backend php artisan tinker --execute "if (!DB::table('auth.users')->where('username','admin_panel')->exists()) { DB::table('auth.users')->where('username','admin')->update(['username'=>'admin_panel']); } DB::table('auth.users')->where('username','admin_panel')->update(['password_hash'=>Hash::make('Admin123456!'),'updated_at'=>now()]);"
if ($LASTEXITCODE -ne 0) {
    throw 'No se pudo establecer las credenciales locales del usuario admin_panel.'
}

$cmdPath = (Get-Command cmd.exe).Source
$scriptsRoot = Join-Path (Split-Path -Path $frontendRoot -Parent) 'scripts_local'
New-Item -ItemType Directory -Path $scriptsRoot -Force | Out-Null
Copy-Item -Path (Join-Path $PSScriptRoot '*.ps1') -Destination $scriptsRoot -Force -ErrorAction SilentlyContinue
Copy-Item -Path (Join-Path $PSScriptRoot '*.bat') -Destination $scriptsRoot -Force -ErrorAction SilentlyContinue

New-DesktopShortcut -Name 'Facturacion - Levantar' -TargetPath (Join-Path $scriptsRoot 'levantar-local.bat') -WorkingDirectory $scriptsRoot
New-DesktopShortcut -Name 'Facturacion - Apagar' -TargetPath (Join-Path $scriptsRoot 'apagar-local.bat') -WorkingDirectory $scriptsRoot
New-DesktopShortcut -Name 'Facturacion - Config Red' -TargetPath (Join-Path $scriptsRoot 'config-red-local.bat') -WorkingDirectory $scriptsRoot
New-DesktopShortcut -Name 'Facturacion - Limpiar Transacciones' -TargetPath (Join-Path $scriptsRoot 'limpiar-transaccionales-local.bat') -WorkingDirectory $scriptsRoot
New-DesktopShortcut -Name 'Facturacion - pgAdmin' -TargetPath "$env:WINDIR\explorer.exe" -Arguments ("http://127.0.0.1:{0}" -f $pgadminPort)
New-DesktopShortcut -Name 'Facturacion - Actualizar' -TargetPath (Join-Path $scriptsRoot 'actualizar-local.bat') -WorkingDirectory $scriptsRoot
New-DesktopShortcut -Name 'Facturacion - Desinstalar' -TargetPath (Join-Path $scriptsRoot 'desinstalar-local.bat') -WorkingDirectory $scriptsRoot

Write-Host 'Instalacion completada.' -ForegroundColor Green
Show-AccessUrls -BindHost $dockerBindHost -BackendPort $backendPort -FrontendPort $frontendPort -AdminPort $adminPort -PgAdminPort $pgadminPort -PgAdminEmail $pgadminEmail -PgAdminPassword $pgadminPassword
