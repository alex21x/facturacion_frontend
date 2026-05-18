@echo off
setlocal
cd /d "%~dp0"
call "%~dp0scripts\limpiar-transaccionales-local.bat"
exit /b %errorlevel%
