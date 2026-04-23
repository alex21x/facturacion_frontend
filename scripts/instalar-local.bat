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

echo.
echo Iniciando instalador...
echo (Descargando logica de instalacion desde GitHub)
echo.

PowerShell -NoProfile -ExecutionPolicy Bypass -Command "$d='%FACTURA_DIR%';$urls=@('%RAW_URL%','%CDN_URL%','%GITHUB_URL%');$ErrorActionPreference='Stop';try{[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12}catch{};function Download-InstallerContent([string]$u){try{Write-Host ('Descargando desde: '+$u) -ForegroundColor Cyan;$req=[Net.HttpWebRequest]::Create($u);$req.Method='GET';$req.Timeout=15000;$req.ReadWriteTimeout=15000;$req.UserAgent='FacturacionInstaller/1.0';$resp=$req.GetResponse();$reader=New-Object IO.StreamReader($resp.GetResponseStream());try{$text=$reader.ReadToEnd()}finally{$reader.Dispose();$resp.Dispose()};if([string]::IsNullOrWhiteSpace($text)){throw 'Respuesta vacia'};return $text}catch{Write-Host ('Fallo descarga: '+$u+' -> '+$_.Exception.Message) -ForegroundColor Yellow;return $null}};$c=$null;foreach($u in $urls){$c=Download-InstallerContent $u;if(-not [string]::IsNullOrWhiteSpace($c)){break}};if([string]::IsNullOrWhiteSpace($c)){throw 'No se pudo descargar la logica del instalador desde ninguno de los servidores publicos. Revisa DNS/Internet o acceso HTTPS a GitHub/jsDelivr.'};Write-Host 'Ejecutando...' -ForegroundColor Green;$sb=[scriptblock]::Create($c);& $sb -ScriptsDir $d;exit $LASTEXITCODE"

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
