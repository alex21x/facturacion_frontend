@echo off
setlocal

set "SCRIPT_DIR=%~dp0"
set "SCRIPT_PS1=%SCRIPT_DIR%restore-db-local.ps1"

if not exist "%SCRIPT_PS1%" (
  echo No se encontro script de restauracion: %SCRIPT_PS1%
  pause
  exit /b 1
)

if "%~1"=="" (
  echo.
  echo Uso: restaurar-bd-local.bat "ruta\backup.dump^|.sql"
  echo Si no pasas archivo, se restaura el ultimo backup encontrado.
  echo.
)

PowerShell -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_PS1%" -BackupFile "%~1"
if errorlevel 1 (
  echo.
  echo La restauracion de BD fallo.
  pause
  exit /b 1
)

echo.
echo Restauracion de BD completada.
pause
