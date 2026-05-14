@echo off
setlocal
PowerShell -NoProfile -ExecutionPolicy Bypass -File "%~dp0update-local.ps1"
if errorlevel 1 (
  echo.
  echo La actualizacion fallo. Revisa el mensaje anterior.
  pause
  exit /b 1
)
echo.
echo Actualizacion completada.
pause
