param(
    [string]$ComposeFile = (Join-Path $PSScriptRoot "..\docker-compose.local.yml")
)

function Resolve-LocalLayout {
    param([string]$ComposeFilePath)

    $resolvedComposeFile = Resolve-Path $ComposeFilePath -ErrorAction SilentlyContinue
    if ($resolvedComposeFile) {
        return @{
            ComposeFile = $resolvedComposeFile.Path
            FrontendRoot = Split-Path -Path $resolvedComposeFile.Path -Parent
        }
    }

    $candidates = @(
        (Join-Path $PSScriptRoot "..\facturacion_frontend"),
        (Join-Path $PSScriptRoot "..")
    )

    foreach ($candidate in $candidates) {
        $resolvedCandidate = Resolve-Path $candidate -ErrorAction SilentlyContinue
        if (-not $resolvedCandidate) {
            continue
        }

        $candidateCompose = Join-Path $resolvedCandidate.Path "docker-compose.local.yml"
        if (Test-Path $candidateCompose) {
            return @{
                ComposeFile = $candidateCompose
                FrontendRoot = $resolvedCandidate.Path
            }
        }
    }

    throw "No se encontro docker-compose.local.yml. Ejecuta primero scripts/instalar-local.bat."
}

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

$layout = Resolve-LocalLayout -ComposeFilePath $ComposeFile
$ComposeFile = $layout.ComposeFile
$frontendRoot = $layout.FrontendRoot
$clientConfig = Join-Path $frontendRoot ".client-config.env"
$composeProject = Get-ConfigValue -FilePath $clientConfig -Key "COMPOSE_PROJECT_NAME" -DefaultValue "facturacion_local"

$composeArgs = @("-p", $composeProject, "-f", $ComposeFile)

Write-Host "Apagando sistema local..." -ForegroundColor Cyan
docker compose @composeArgs stop

if ($LASTEXITCODE -ne 0) {
    throw "No se pudo apagar el sistema local."
}

Write-Host "Sistema local apagado correctamente." -ForegroundColor Green
Write-Host "Datos preservados en volumenes Docker." -ForegroundColor Green
Write-Host "Para levantar el sistema de nuevo, ejecuta: Facturacion - Levantar" -ForegroundColor Cyan
