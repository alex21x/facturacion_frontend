@echo off
setlocal

net session >nul 2>&1
if not "%errorlevel%"=="0" (
  echo.
  echo Solicitando permisos de Administrador...
  PowerShell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)

PowerShell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-local.ps1"
if errorlevel 1 (
  echo.
  echo No se pudo levantar el sistema local.
  pause
  exit /b 1
)
echo.
echo Sistema local levantado.
pause
