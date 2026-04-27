@echo off
setlocal
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
