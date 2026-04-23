@echo off
setlocal

:: Verificar si tenemos permisos de Administrador
net session >nul 2>&1
if %errorLevel% neq 0 (
  cls
  echo.
  echo  =====================================================
  echo   PASO NECESARIO: Ejecutar como Administrador
  echo  =====================================================
  echo  Este instalador necesita permisos de Administrador
  echo  para instalar Docker y crear la arquitectura local.
  echo.
  echo  Instrucciones:
  echo  1. CIERRA esta ventana
  echo  2. Haz CLIC DERECHO en el archivo instalar-local.bat
  echo  3. Selecciona "Ejecutar como administrador"
  echo  4. Acepta el aviso de seguridad que aparece
  echo.
  echo  =====================================================
  echo.
  pause
  exit /b 1
)

:: Ya somos Administrador
:: Ejecutamos el script desde GitHub en memoria para evitar que el
:: antivirus (ESET, Defender, etc.) bloquee el archivo .ps1
set FACTURA_DIR=%~dp0
set REPO_BRANCH=feature/docker-multientorno
set RAW_URL=https://raw.githubusercontent.com/alex21x/facturacion_frontend/%REPO_BRANCH%/scripts/preparar-entorno.txt
set CDN_URL=https://cdn.jsdelivr.net/gh/alex21x/facturacion_frontend@%REPO_BRANCH%/scripts/preparar-entorno.txt
set GITHUB_URL=https://github.com/alex21x/facturacion_frontend/raw/%REPO_BRANCH%/scripts/preparar-entorno.txt
set TEMP_BOOTSTRAP=%TEMP%\facturacion_preparar_entorno.txt

echo.
echo Iniciando instalador...
echo (Descargando logica de instalacion desde GitHub)
echo.

if exist "%TEMP_BOOTSTRAP%" del /f /q "%TEMP_BOOTSTRAP%" >nul 2>&1

echo Descargando desde: %RAW_URL%
curl.exe -L --fail --silent --show-error --connect-timeout 10 --max-time 20 "%RAW_URL%" -o "%TEMP_BOOTSTRAP%"
if errorlevel 1 (
  echo Fallo descarga principal. Probando CDN...
  curl.exe -L --fail --silent --show-error --connect-timeout 10 --max-time 20 "%CDN_URL%" -o "%TEMP_BOOTSTRAP%"
)
if errorlevel 1 (
  echo Fallo CDN. Probando GitHub raw...
  curl.exe -L --fail --silent --show-error --connect-timeout 10 --max-time 20 "%GITHUB_URL%" -o "%TEMP_BOOTSTRAP%"
)
if errorlevel 1 (
  echo.
  echo No se pudo descargar la logica del instalador desde GitHub/CDN.
  echo Verifica antivirus, proxy, DNS o inspeccion HTTPS en esta PC.
  pause
  exit /b 1
)

if not exist "%TEMP_BOOTSTRAP%" (
  echo.
  echo La descarga termino sin crear el archivo temporal del instalador.
  pause
  exit /b 1
)

echo Ejecutando instalador descargado...
PowerShell -NoProfile -ExecutionPolicy Bypass -Command "$d='%FACTURA_DIR%';$p='%TEMP_BOOTSTRAP%';$ErrorActionPreference='Stop';$c=[IO.File]::ReadAllText($p);if([string]::IsNullOrWhiteSpace($c)){throw 'El archivo descargado esta vacio.'};$sb=[scriptblock]::Create($c);& $sb -ScriptsDir $d;exit $LASTEXITCODE"

if errorlevel 1 (
  echo.
  echo La instalacion fallo. Revisa el mensaje anterior.
  echo El instalador crea toda la arquitectura automaticamente en D:\FacturacionLocal ^(o C:\FacturacionLocal^).
  echo Verifica conexion a Internet y permisos de instalacion, luego vuelve a hacer doble clic.
  pause
  exit /b 1
)
echo.
echo Instalacion completada.
pause
