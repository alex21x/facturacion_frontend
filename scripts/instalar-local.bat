@echo off
setlocal

:: Auto-elevar a Administrador si no lo somos ya (requerido por Docker Desktop)
net session >nul 2>&1
if %errorLevel% neq 0 (
  echo Solicitando permisos de Administrador...
  PowerShell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process cmd -ArgumentList '/c cd /d \"%~dp0\" && \"%~f0\"' -Verb RunAs"
  exit /b
)

PowerShell -NoProfile -ExecutionPolicy Bypass -File "%~dp0bootstrap-clean-install.ps1"
if errorlevel 1 (
  echo.
  echo La instalacion fallo. Revisa el mensaje anterior.
  echo El instalador crea toda la arquitectura automaticamente en D:\FacturacionLocal ^(o C:\FacturacionLocal^).
  echo Verifica conexion a Internet y permisos de instalacion, luego vuelve a hacer doble clic.
  pause
  exit /b 1
)
echo.
echo Instalacion completada.
pause
