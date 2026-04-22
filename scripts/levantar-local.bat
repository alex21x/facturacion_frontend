@echo off
setlocal
PowerShell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-local.ps1" -SkipOpenBrowser
if errorlevel 1 (
  echo.
  echo No se pudo levantar el sistema local.
  pause
  exit /b 1
)
for /f "usebackq tokens=1,* delims==" %%A in ("%~dp0..\.client-config.env") do (
  if /I "%%A"=="DOCKER_BIND_HOST" set "DOCKER_BIND_HOST=%%B"
  if /I "%%A"=="FRONTEND_PORT" set "FRONTEND_PORT=%%B"
)
if not defined DOCKER_BIND_HOST set "DOCKER_BIND_HOST=127.0.0.1"
if not defined FRONTEND_PORT set "FRONTEND_PORT=5173"
if /I "%DOCKER_BIND_HOST%"=="0.0.0.0" set "DOCKER_BIND_HOST=127.0.0.1"
set "FRONTEND_URL=http://%DOCKER_BIND_HOST%:%FRONTEND_PORT%"
echo.
echo Abriendo navegador en %FRONTEND_URL%
start "" "%FRONTEND_URL%"
echo.
echo Sistema local levantado.
pause
