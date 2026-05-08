param(
    [string]$InstallRoot = "",
    [string]$ScriptsDir = "",
    [switch]$EnableLanAccess,
    [string]$FrontendRepoUrl = "https://github.com/alex21x/facturacion_frontend.git",
    [string]$BackendRepoUrl = "https://github.com/alex21x/facturacion_backend.git",
    [string]$FrontendBranch = "feature/docker-multientorno",
    [string]$BackendBranch = "feature/docker-multientorno"
)

function Get-PreferredInstallRoot {
    param([string]$InstallRootOverride)

    if (-not [string]::IsNullOrWhiteSpace($InstallRootOverride)) {
        return $InstallRootOverride
    }

    if (Test-Path "D:\") {
        return "D:\FacturacionLocal"
    }

    return "C:\FacturacionLocal"
}

function Ensure-GitAvailable {
    $gitCommand = Get-Command git -ErrorAction SilentlyContinue
    if ($gitCommand) {
        return
    }

    Write-Host "Git no esta instalado. Intentando instalar Git automaticamente..." -ForegroundColor Yellow
    $wingetCommand = Get-Command winget -ErrorAction SilentlyContinue
    if (-not $wingetCommand) {
        throw "No se encontro winget para instalar Git automaticamente. Instala Git y vuelve a ejecutar el instalador."
    }

    winget source update | Out-Null
    if ($LASTEXITCODE -ne 0) {
        winget source reset --force | Out-Null
        winget source update | Out-Null
    }

    winget install -e --id Git.Git --source winget --accept-package-agreements --accept-source-agreements --disable-interactivity
    if ($LASTEXITCODE -ne 0) {
        winget install -e --id Git.Git --accept-package-agreements --accept-source-agreements --disable-interactivity
    }

    if ($LASTEXITCODE -ne 0) {
        throw "No se pudo instalar Git automaticamente. Instala Git y vuelve a ejecutar el instalador."
    }

    $env:Path = "$env:ProgramFiles\Git\cmd;$env:Path"
    $gitCommand = Get-Command git -ErrorAction SilentlyContinue
    if (-not $gitCommand) {
        throw "Git fue instalado, pero no quedo disponible en esta sesion. Cierra y vuelve a abrir el instalador."
    }
}

function Test-RemoteBranchExists {
    param(
        [string]$RepoUrl,
        [string]$Branch
    )

    if ([string]::IsNullOrWhiteSpace($Branch)) {
        return $false
    }

    git ls-remote --heads $RepoUrl $Branch 2>$null | Out-Null
    return $LASTEXITCODE -eq 0
}

function Ensure-Repository {
    param(
        [string]$TargetPath,
        [string]$RepoUrl,
        [string[]]$BranchCandidates,
        [string]$Name
    )

    $normalizedCandidates = $BranchCandidates | Where-Object { -not [string]::IsNullOrWhiteSpace($_) } | Select-Object -Unique
    if (-not $normalizedCandidates -or $normalizedCandidates.Count -eq 0) {
        throw "No se definieron ramas candidatas para $Name."
    }

    if ((Test-Path $TargetPath) -and (Test-Path (Join-Path $TargetPath ".git"))) {
        Write-Host "Actualizando $Name..." -ForegroundColor Cyan
        # Forzar refspec completo para que fetch traiga TODAS las ramas remotas
        # (repos clonados con --single-branch solo tienen refspec de una rama)
        git -C $TargetPath config remote.origin.fetch "+refs/heads/*:refs/remotes/origin/*" | Out-Null
        git -C $TargetPath fetch --all --prune --quiet 2>&1 | Out-Null
        if ($LASTEXITCODE -ne 0) {
            Write-Host "Fallo fetch de $Name. Intentando recuperacion del remoto..." -ForegroundColor Yellow
            git -C $TargetPath remote set-url origin $RepoUrl 2>&1 | Out-Null
            git -C $TargetPath fetch --all --prune --quiet 2>&1 | Out-Null

            if ($LASTEXITCODE -ne 0) {
                Write-Host "No se pudo recuperar el repositorio local de $Name. Se recreara desde cero..." -ForegroundColor Yellow
                Remove-Item -Path $TargetPath -Recurse -Force -ErrorAction SilentlyContinue
            }
        }

        if ((Test-Path $TargetPath) -and (Test-Path (Join-Path $TargetPath ".git"))) {
            foreach ($branch in $normalizedCandidates) {
                $remoteBranchRef = git -C $TargetPath ls-remote --heads origin $branch 2>&1
                if ([string]::IsNullOrWhiteSpace(($remoteBranchRef | Out-String).Trim())) {
                    continue
                }

                # -B crea la rama local si no existe, o la resetea si ya existe
                git -C $TargetPath checkout -q -B $branch "origin/$branch" 2>&1 | Out-Null
                if ($LASTEXITCODE -eq 0) {
                    Write-Host "Rama activa: $branch" -ForegroundColor Green
                    return
                }
            }

            throw "No se encontro una rama remota valida para $Name. Ramas probadas: $($normalizedCandidates -join ', ')."
        }
    }

    if (Test-Path $TargetPath) {
        Remove-Item -Path $TargetPath -Recurse -Force
    }

    foreach ($branch in $normalizedCandidates) {
        if (-not (Test-RemoteBranchExists -RepoUrl $RepoUrl -Branch $branch)) {
            continue
        }

        Write-Host "Clonando $Name en $TargetPath (rama $branch)..." -ForegroundColor Cyan
        git clone --quiet --branch $branch --single-branch $RepoUrl $TargetPath 2>&1 | Out-Null
        if ($LASTEXITCODE -eq 0) {
            return
        }

        if (Test-Path $TargetPath) {
            Remove-Item -Path $TargetPath -Recurse -Force -ErrorAction SilentlyContinue
        }
    }

    throw "No se pudo clonar $Name desde $RepoUrl en ninguna rama candidata: $($normalizedCandidates -join ', ')."
}

function Ensure-FrontendDockerBranch {
    param(
        [string]$FrontendPath,
        [string[]]$CandidateBranches
    )

    $composeLocal = Join-Path $FrontendPath "docker-compose.local.yml"
    if (Test-Path $composeLocal) {
        return
    }

    foreach ($candidate in $CandidateBranches) {
        if ([string]::IsNullOrWhiteSpace($candidate)) {
            continue
        }

        $remoteBranchRef = git -C $FrontendPath ls-remote --heads origin $candidate 2>$null
        if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace(($remoteBranchRef | Out-String).Trim())) {
            continue
        }

        Write-Host "Probando rama frontend '$candidate' para instalacion docker local..." -ForegroundColor Yellow
        git -C $FrontendPath checkout -q -B $candidate "origin/$candidate" 2>&1 | Out-Null
        if ($LASTEXITCODE -ne 0) {
            continue
        }

        if (Test-Path $composeLocal) {
            Write-Host "Rama activa frontend: $candidate" -ForegroundColor Green
            return
        }
    }

    throw "No se encontro docker-compose.local.yml en frontend despues de probar ramas: $($CandidateBranches -join ', ').";
}

function Ensure-BackendDockerBranch {
    param(
        [string]$BackendPath,
        [string[]]$CandidateBranches
    )

    $backendDockerfile = Join-Path $BackendPath "Dockerfile.local"
    if (Test-Path $backendDockerfile) {
        return
    }

    foreach ($candidate in $CandidateBranches) {
        if ([string]::IsNullOrWhiteSpace($candidate)) {
            continue
        }

        $remoteBranchRef = git -C $BackendPath ls-remote --heads origin $candidate 2>$null
        if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace(($remoteBranchRef | Out-String).Trim())) {
            continue
        }

        Write-Host "Probando rama backend '$candidate' para instalacion docker local..." -ForegroundColor Yellow
        git -C $BackendPath checkout -q -B $candidate "origin/$candidate" 2>&1 | Out-Null
        if ($LASTEXITCODE -ne 0) {
            continue
        }

        if (Test-Path $backendDockerfile) {
            Write-Host "Rama activa backend: $candidate" -ForegroundColor Green
            return
        }
    }

    throw "No se encontro Dockerfile.local en backend despues de probar ramas: $($CandidateBranches -join ', ').";
}

function Assert-PathExists {
    param(
        [string]$Path,
        [string]$Message
    )

    if (-not (Test-Path $Path)) {
        throw $Message
    }
}

function Convert-FileToLf {
    param([string]$Path)

    if (-not (Test-Path $Path)) {
        return
    }

    $content = Get-Content -Path $Path -Raw -ErrorAction SilentlyContinue
    if ($null -eq $content) {
        return
    }

    $normalized = $content -replace "`r`n", "`n"
    $normalized = $normalized -replace "`r", "`n"

    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($Path, $normalized, $utf8NoBom)
}

function Ensure-ComposeCompatibility {
    param([string]$ComposePath)

    if (-not (Test-Path $ComposePath)) {
        return
    }

    $composeText = Get-Content -Path $ComposePath -Raw -ErrorAction SilentlyContinue
    if ([string]::IsNullOrWhiteSpace($composeText)) {
        return
    }

    # PostgreSQL 18+ requires mounting /var/lib/postgresql instead of /var/lib/postgresql/data.
    $patchedText = $composeText -replace 'postgres_data:/var/lib/postgresql/data', 'postgres_data:/var/lib/postgresql'

    if ($patchedText -ne $composeText) {
        $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
        [System.IO.File]::WriteAllText($ComposePath, $patchedText, $utf8NoBom)
    }
}

function Apply-InstallerDockerOverrides {
    param(
        [string]$InstallerScriptsPath,
        [string]$TargetFrontendPath,
        [string]$TargetBackendPath
    )

    if ([string]::IsNullOrWhiteSpace($InstallerScriptsPath)) {
        return
    }

    $installerRoot = Resolve-Path (Join-Path $InstallerScriptsPath "..") -ErrorAction SilentlyContinue
    if (-not $installerRoot) {
        return
    }

    $installerPayloadFrontend = Join-Path $installerRoot.Path "payload\facturacion_frontend"
    $installerPayloadBackend = Join-Path $installerRoot.Path "payload\facturacion_backend"

    $frontendOverrides = @(
        @{ From = (Join-Path $installerPayloadFrontend 'docker-compose.local.yml'); To = (Join-Path $TargetFrontendPath 'docker-compose.local.yml') },
        @{ From = (Join-Path $installerPayloadFrontend 'docker-entrypoint.frontend.sh'); To = (Join-Path $TargetFrontendPath 'docker-entrypoint.frontend.sh') },
        @{ From = (Join-Path $installerPayloadFrontend 'docker-entrypoint.admin.sh'); To = (Join-Path $TargetFrontendPath 'docker-entrypoint.admin.sh') }
    )

    foreach ($item in $frontendOverrides) {
        if (Test-Path $item.From) {
            Copy-Item -Path $item.From -Destination $item.To -Force
        }
    }

    $backendOverrides = @(
        @{ From = (Join-Path $installerPayloadBackend 'Dockerfile.local'); To = (Join-Path $TargetBackendPath 'Dockerfile.local') },
        @{ From = (Join-Path $installerPayloadBackend 'docker\entrypoint.local.sh'); To = (Join-Path $TargetBackendPath 'docker\entrypoint.local.sh') }
    )

    foreach ($item in $backendOverrides) {
        if (Test-Path $item.From) {
            Copy-Item -Path $item.From -Destination $item.To -Force
        }
    }

    Convert-FileToLf -Path (Join-Path $TargetFrontendPath 'docker-entrypoint.frontend.sh')
    Convert-FileToLf -Path (Join-Path $TargetFrontendPath 'docker-entrypoint.admin.sh')
    Convert-FileToLf -Path (Join-Path $TargetBackendPath 'docker\entrypoint.local.sh')
    Ensure-ComposeCompatibility -ComposePath (Join-Path $TargetFrontendPath 'docker-compose.local.yml')
}

function Resolve-InstallScriptPath {
    param(
        [string]$InstallerScriptsPath,
        [string]$ClonedFrontendPath
    )

    $safeCandidate = Join-Path $InstallerScriptsPath "setup-local.ps1"
    if (Test-Path $safeCandidate) {
        return $safeCandidate
    }

    $patternCandidate = Get-ChildItem -Path $InstallerScriptsPath -File -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -like "setup-local*.ps1" } |
        Select-Object -First 1
    if ($patternCandidate) {
        return $patternCandidate.FullName
    }

    $frontendCandidate = Join-Path $ClonedFrontendPath "scripts\setup-local.ps1"
    if (Test-Path $frontendCandidate) {
        return $frontendCandidate
    }

    return $null
}

$resolvedInstallRoot = Get-PreferredInstallRoot -InstallRootOverride $InstallRoot
$targetFrontendRoot = Join-Path $resolvedInstallRoot "facturacion_frontend"
$targetBackendRoot = Join-Path $resolvedInstallRoot "facturacion_backend"

Write-Host "Preparando arquitectura en: $resolvedInstallRoot" -ForegroundColor Cyan
New-Item -ItemType Directory -Path $resolvedInstallRoot -Force | Out-Null

Ensure-GitAvailable
Ensure-Repository -TargetPath $targetFrontendRoot -RepoUrl $FrontendRepoUrl -BranchCandidates @($FrontendBranch, "feature/docker-multientorno", "docker-multi-entorno") -Name "frontend"
Ensure-Repository -TargetPath $targetBackendRoot -RepoUrl $BackendRepoUrl -BranchCandidates @($BackendBranch, "feature/docker-multientorno", "docker-multi-entorno") -Name "backend"
Ensure-FrontendDockerBranch -FrontendPath $targetFrontendRoot -CandidateBranches @($FrontendBranch, "feature/docker-multientorno", "docker-multi-entorno")
Ensure-BackendDockerBranch -BackendPath $targetBackendRoot -CandidateBranches @($BackendBranch, "feature/docker-multientorno", "docker-multi-entorno")

$resolvedScriptsDir = if (-not [string]::IsNullOrWhiteSpace($PSScriptRoot)) {
    $PSScriptRoot
} elseif (-not [string]::IsNullOrWhiteSpace($ScriptsDir)) {
    $ScriptsDir
} else {
    $null
}

$installerScriptsRoot = if ($resolvedScriptsDir) {
    Resolve-Path $resolvedScriptsDir -ErrorAction SilentlyContinue
} else {
    $null
}

$installScript = Resolve-InstallScriptPath -InstallerScriptsPath ($(if ($installerScriptsRoot) { $installerScriptsRoot.Path } else { "" })) -ClonedFrontendPath $targetFrontendRoot
$composeFile = Join-Path $targetFrontendRoot "docker-compose.local.yml"

if ($installerScriptsRoot) {
    Apply-InstallerDockerOverrides -InstallerScriptsPath $installerScriptsRoot.Path -TargetFrontendPath $targetFrontendRoot -TargetBackendPath $targetBackendRoot
}

if (-not $installScript) {
    $clonedScriptsPath = Join-Path $targetFrontendRoot "scripts"
    $installScript = Resolve-InstallScriptPath -InstallerScriptsPath $clonedScriptsPath -ClonedFrontendPath $targetFrontendRoot
}

if (-not $installScript) {
    $scriptsPathLabel = if ($installerScriptsRoot) { $installerScriptsRoot.Path } else { "(sin carpeta local de scripts)" }
    throw "No se encontro script instalador (setup-local.ps1). Ruta de scripts: $scriptsPathLabel. Revisa el repo clonado en $targetFrontendRoot."
}

Assert-PathExists -Path $composeFile -Message "No se encontro docker-compose.local.yml en el frontend clonado."
Assert-PathExists -Path (Join-Path $targetBackendRoot "artisan") -Message "No se encontro artisan en el backend clonado."

$installParams = @{
    ComposeFile = $composeFile
    BackendRoot = $targetBackendRoot
}

if ($PSBoundParameters.ContainsKey('EnableLanAccess')) {
    $installParams.NonInteractive = $true
    if ($EnableLanAccess) {
        $installParams.EnableLanAccess = $true
    }
}

Write-Host "Ejecutando instalador principal..." -ForegroundColor Cyan
& $installScript @installParams
if ($LASTEXITCODE -ne 0) {
    throw "La instalacion principal fallo."
}

Write-Host ""
Write-Host "INSTALACION GUIADA COMPLETADA" -ForegroundColor Green
Write-Host "Raiz local: $resolvedInstallRoot" -ForegroundColor Green
Write-Host "Frontend:   $targetFrontendRoot" -ForegroundColor Green
Write-Host "Backend:    $targetBackendRoot" -ForegroundColor Green
Write-Host ""
