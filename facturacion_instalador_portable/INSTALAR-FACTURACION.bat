@echo off
setlocal
cd /d "%~dp0"
call "%~dp0scripts\instalar-local.bat"
exit /b %errorlevel%
