@echo off
setlocal
cd /d "%~dp0"
call "%~dp0scripts\desinstalar-local.bat"
exit /b %errorlevel%
