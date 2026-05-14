@echo off
setlocal
PowerShell -NoProfile -ExecutionPolicy Bypass -File "%~dp0stop-local.ps1"
if errorlevel 1 (
  echo.
  echo No se pudo apagar el sistema local.
  pause
  exit /b 1
)
echo.
echo Sistema local apagado.
pause
