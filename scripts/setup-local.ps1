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

    if (-not (Test-Path $dockerDataPath)) {
        New-Item -ItemType Directory -Path $dockerDataPath -Force | Out-Null
    }

    Write-Host "Reparando permisos de Docker Desktop..." -ForegroundColor Cyan
    cmd /c "takeown /F \"$dockerDataPath\" /A /R /D Y >nul 2>&1"
    cmd /c "icacls \"$dockerDataPath\" /setowner *S-1-5-32-544 /T /C >nul 2>&1"
    cmd /c "icacls \"$dockerDataPath\" /grant *S-1-5-32-544:(OI)(CI)F /T /C >nul 2>&1"
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
    Write-Host "Deseas permitir acceso desde otras PCs de la red? (s/n)" -ForegroundColor Cyan
    $choice = Read-Host "Opcion"
    if ($choice -eq 's') { $allowNetworkAccess = $true }
}

$bindHost = if ($allowNetworkAccess) { '0.0.0.0' } else { '127.0.0.1' }

if (-not (Test-Path $clientConfig)) {
    Set-Content -Path $clientConfig -Value @(
        "COMPOSE_PROJECT_NAME=facturacion_local",
        "DOCKER_BIND_HOST=$bindHost",
        "BACKEND_PORT=8000",
        "FRONTEND_PORT=5173",
        "ADMIN_PORT=5174",
        "VITE_API_BASE_URL=http://${bindHost}:8000",
        "POSTGRES_DB=facturacion_v2",
        "POSTGRES_USER=facturacion",
        "POSTGRES_PASSWORD=facturacion",
        "RUN_MIGRATIONS=true"
    )
}

$composeProject = Get-ConfigValue -FilePath $clientConfig -Key 'COMPOSE_PROJECT_NAME' -DefaultValue 'facturacion_local'
$dockerBindHost = Get-ConfigValue -FilePath $clientConfig -Key 'DOCKER_BIND_HOST' -DefaultValue $bindHost
$backendPort = Get-ConfigValue -FilePath $clientConfig -Key 'BACKEND_PORT' -DefaultValue '8000'
$frontendPort = Get-ConfigValue -FilePath $clientConfig -Key 'FRONTEND_PORT' -DefaultValue '5173'
$adminPort = Get-ConfigValue -FilePath $clientConfig -Key 'ADMIN_PORT' -DefaultValue '5174'
$viteApiBaseUrl = "http://{0}:{1}" -f $dockerBindHost, $backendPort

Set-ConfigValue -FilePath $clientConfig -Key 'DOCKER_BIND_HOST' -Value $dockerBindHost
Set-ConfigValue -FilePath $clientConfig -Key 'VITE_API_BASE_URL' -Value $viteApiBaseUrl

$env:DOCKER_BIND_HOST = $dockerBindHost
$env:BACKEND_PORT = $backendPort
$env:FRONTEND_PORT = $frontendPort
$env:ADMIN_PORT = $adminPort
$env:VITE_API_BASE_URL = $viteApiBaseUrl

$composeArgs = @('-p',$composeProject,'-f',$ComposeFile)

Write-Host 'Levantando stack local Docker...' -ForegroundColor Cyan
docker compose @composeArgs up -d --build
if ($LASTEXITCODE -ne 0) { throw 'No se pudo levantar el stack local.' }

$runMigrations = Get-ConfigValue -FilePath $clientConfig -Key 'RUN_MIGRATIONS' -DefaultValue 'true'
if ($runMigrations -eq 'true') {
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

$cmdPath = (Get-Command cmd.exe).Source
$scriptsRoot = Join-Path (Split-Path -Path $frontendRoot -Parent) 'scripts_local'
New-Item -ItemType Directory -Path $scriptsRoot -Force | Out-Null
Copy-Item -Path (Join-Path $PSScriptRoot '*.ps1') -Destination $scriptsRoot -Force -ErrorAction SilentlyContinue
Copy-Item -Path (Join-Path $PSScriptRoot '*.bat') -Destination $scriptsRoot -Force -ErrorAction SilentlyContinue

New-DesktopShortcut -Name 'Facturacion - Levantar' -TargetPath $cmdPath -Arguments "/c \"$scriptsRoot\levantar-local.bat\"" -WorkingDirectory $scriptsRoot
New-DesktopShortcut -Name 'Facturacion - Apagar' -TargetPath $cmdPath -Arguments "/c \"$scriptsRoot\apagar-local.bat\"" -WorkingDirectory $scriptsRoot

$desktopPath = [Environment]::GetFolderPath('Desktop')
$updateShortcutPath = Join-Path $desktopPath 'Facturacion - Actualizar.lnk'
$uninstallShortcutPath = Join-Path $desktopPath 'Facturacion - Desinstalar.lnk'
if (Test-Path $updateShortcutPath) { Remove-Item $updateShortcutPath -Force }
if (Test-Path $uninstallShortcutPath) { Remove-Item $uninstallShortcutPath -Force }

if ($dockerBindHost -eq '0.0.0.0') { $displayHost = '127.0.0.1' } else { $displayHost = $dockerBindHost }
Write-Host 'Instalacion completada.' -ForegroundColor Green
Write-Host ("Frontend: http://{0}:{1}" -f $displayHost, $frontendPort) -ForegroundColor Green
Write-Host ("Admin: http://{0}:{1}" -f $displayHost, $adminPort) -ForegroundColor Green
Write-Host ("Backend: http://{0}:{1}" -f $displayHost, $backendPort) -ForegroundColor Green
