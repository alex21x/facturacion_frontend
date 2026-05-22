@echo off
setlocal
PowerShell -NoProfile -ExecutionPolicy Bypass -File "%~dp0uninstall-local.ps1"
if errorlevel 1 (
	echo.
	echo La desinstalacion fallo. Revisa el mensaje anterior.
	pause
	exit /b 1
)
echo.
echo Desinstalacion completada.
pause
