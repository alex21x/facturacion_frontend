@echo off
setlocal
cd /d "%~dp0"
call "%~dp0scripts\actualizar-local.bat"
exit /b %errorlevel%
