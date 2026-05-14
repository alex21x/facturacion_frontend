@echo off
setlocal
PowerShell -NoProfile -ExecutionPolicy Bypass -File "%~dp0clean-transactional-local.ps1"
if errorlevel 1 (
  echo.
  echo No se pudo completar la limpieza transaccional.
  pause
  exit /b 1
)
echo.
echo Limpieza transaccional completada.
pause
