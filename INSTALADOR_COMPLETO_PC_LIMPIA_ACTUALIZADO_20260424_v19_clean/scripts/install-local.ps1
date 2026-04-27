param(
	[string]$InstallRoot = "",
	[string]$ScriptsDir = "",
	[switch]$EnableLanAccess,
	[string]$FrontendRepoUrl = "https://github.com/alex21x/facturacion_frontend.git",
	[string]$BackendRepoUrl = "https://github.com/alex21x/facturacion_backend.git",
	[string]$FrontendBranch = "feature/docker-multientorno",
	[string]$BackendBranch = "feature/docker-multientorno"
)

$prepararEntornoScript = Join-Path $PSScriptRoot 'preparar-entorno.ps1'
if (-not (Test-Path $prepararEntornoScript)) {
	throw "No se encontro preparar-entorno.ps1 en: $prepararEntornoScript"
}

$resolvedScriptsDir = if ([string]::IsNullOrWhiteSpace($ScriptsDir)) {
	$PSScriptRoot
} else {
	$ScriptsDir
}

$invokeParams = @{
	InstallRoot = $InstallRoot
	ScriptsDir = $resolvedScriptsDir
	FrontendRepoUrl = $FrontendRepoUrl
	BackendRepoUrl = $BackendRepoUrl
	FrontendBranch = $FrontendBranch
	BackendBranch = $BackendBranch
}

if ($EnableLanAccess) {
	$invokeParams.EnableLanAccess = $true
}

& $prepararEntornoScript @invokeParams
exit $LASTEXITCODE
