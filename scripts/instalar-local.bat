@echo off
setlocal

net session >nul 2>&1
if not "%errorlevel%"=="0" (
  echo.
  echo Solicitando permisos de Administrador...
  PowerShell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)

set "SCRIPT_DIR=%~dp0"
set "ROOT_DIR=%SCRIPT_DIR%.."
set "PREPARAR_PS1=%SCRIPT_DIR%preparar-entorno.ps1"
set "SETUP_PS1=%SCRIPT_DIR%setup-local.ps1"
set "COMPOSE_FILE=%ROOT_DIR%\payload\facturacion_frontend\docker-compose.local.yml"
set "BACKEND_ROOT=%ROOT_DIR%\payload\facturacion_backend"

if exist "%PREPARAR_PS1%" (
  echo.
  echo Preparando entorno local ^(Git frontend/backend + Docker^) ...
  echo.
  PowerShell -NoProfile -ExecutionPolicy Bypass -Command "Get-ChildItem -Path '%ROOT_DIR%' -Recurse -File | ForEach-Object { Unblock-File -Path $_.FullName -ErrorAction SilentlyContinue }" >nul 2>&1
  PowerShell -NoProfile -ExecutionPolicy Bypass -File "%PREPARAR_PS1%" -ScriptsDir "%SCRIPT_DIR%"
  if errorlevel 1 (
    echo.
    echo La instalacion fallo. Revisa el mensaje anterior.
    pause
    exit /b 1
  )

  echo.
  echo Instalacion completada.
  pause
  exit /b 0
)

if not exist "%SETUP_PS1%" (
  echo.
  echo No se encontro setup-local.ps1:
  echo %SETUP_PS1%
  echo.
  pause
  exit /b 1
)

if not exist "%COMPOSE_FILE%" (
  set "COMPOSE_FILE=%ROOT_DIR%\docker-compose.local.yml"
)

if not exist "%BACKEND_ROOT%" (
  set "BACKEND_ROOT=%ROOT_DIR%\..\facturacion_backend"
)

echo.
echo Iniciando instalacion local Docker...
echo.

PowerShell -NoProfile -ExecutionPolicy Bypass -File "%SETUP_PS1%" -ComposeFile "%COMPOSE_FILE%" -BackendRoot "%BACKEND_ROOT%"

if errorlevel 1 (
  echo.
  echo La instalacion fallo. Revisa el mensaje anterior.
  pause
  exit /b 1
)
echo.
echo Instalacion completada.
pause
