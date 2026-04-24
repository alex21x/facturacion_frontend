@echo off
setlocal

set "SCRIPT_DIR=%~dp0"
set "PREPARAR_PS1=%SCRIPT_DIR%preparar-entorno.ps1"

if not exist "%PREPARAR_PS1%" (
  echo.
  echo No se encontro el instalador principal:
  echo %PREPARAR_PS1%
  echo.
  pause
  exit /b 1
)

echo.
echo Iniciando instalacion local completa...
echo.

PowerShell -NoProfile -ExecutionPolicy Bypass -File "%PREPARAR_PS1%" -ScriptsDir "%SCRIPT_DIR%"

if errorlevel 1 (
  echo.
  echo La instalacion fallo. Revisa el mensaje anterior.
  echo El instalador crea toda la arquitectura automaticamente en D:\FacturacionLocal ^(o C:\FacturacionLocal^).
  echo Verifica conexion a Internet, Docker Desktop y permisos de Administrador.
  pause
  exit /b 1
)
echo.
echo Instalacion completada.
pause
