@echo off
setlocal

set "SCRIPT_DIR=%~dp0"
set "SCRIPT_PS1=%SCRIPT_DIR%export-db-local.ps1"

if not exist "%SCRIPT_PS1%" (
  echo No se encontro script de exportacion: %SCRIPT_PS1%
  pause
  exit /b 1
)

PowerShell -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_PS1%"
if errorlevel 1 (
  echo.
  echo La exportacion de BD fallo.
  pause
  exit /b 1
)

echo.
echo Exportacion de BD completada.
pause
