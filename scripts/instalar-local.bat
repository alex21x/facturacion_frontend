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
  echo.
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
set RAW_URL=https://raw.githubusercontent.com/alex21x/facturacion_frontend/%REPO_BRANCH%/scripts/preparar-entorno.ps1

echo.
echo Iniciando instalador...
echo (Descargando logica de instalacion desde GitHub)
echo.

PowerShell -NoProfile -ExecutionPolicy Bypass -Command "$d='%FACTURA_DIR%';$u='%RAW_URL%';try{$c=(New-Object Net.WebClient).DownloadString($u);$sb=[scriptblock]::Create($c);& $sb -ScriptsDir $d}catch{Write-Host ('ERROR: '+$_.Exception.Message) -ForegroundColor Red;Write-Host '';Read-Host 'Presiona Enter para cerrar'}"

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
