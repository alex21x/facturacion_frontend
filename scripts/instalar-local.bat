@echo off
setlocal

:: Elevar a Administrador via VBScript (maneja rutas con espacios y parentesis)
net session >nul 2>&1
if %errorLevel% neq 0 (
  echo Solicitando permisos de Administrador...
  echo Set oShell = CreateObject("Shell.Application") > "%temp%\elev_factura.vbs"
  echo oShell.ShellExecute "cmd.exe", "/c cd /d ""%~dp0"" && ""%~f0""", "", "runas", 1 >> "%temp%\elev_factura.vbs"
  cscript //nologo "%temp%\elev_factura.vbs"
  del "%temp%\elev_factura.vbs" >nul 2>&1
  exit /b
)

:: Ya somos Admin - excluir esta carpeta de Windows Defender para que no borre los scripts
PowerShell -NoProfile -ExecutionPolicy Bypass -Command "Add-MpPreference -ExclusionPath '%~dp0' -ErrorAction SilentlyContinue"

PowerShell -NoProfile -ExecutionPolicy Bypass -File "%~dp0preparar-entorno.ps1"
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
