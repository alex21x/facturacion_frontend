@echo off
setlocal
cd /d "%~dp0"
if not exist "%~dp0scripts\instalar-local.bat" (
	echo.
	echo No se encontro scripts\instalar-local.bat
	pause
	exit /b 1
)

echo.
echo Ejecutando instalador completo de Facturacion...
echo.

call "%~dp0scripts\instalar-local.bat"
exit /b %errorlevel%
