@echo off
title Empaquetar Release - Restaurant OS
echo ===================================================
echo   RESTAURANT OS - EMPAQUETADOR DE DISTRIBUCION
echo ===================================================
echo.
cd /d "%~dp0"

set "ZIP_NAME=restaurant-os-release.zip"

if not exist "bin\" mkdir bin
if not exist "bin\node.exe" (
    echo [INFO] Descargando Node.exe portable para Windows ^(v20.11.1^)...
    echo Por favor, espera a que se complete la descarga...
    powershell -NoProfile -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri 'https://nodejs.org/dist/v20.11.1/win-x64/node.exe' -OutFile 'bin\node.exe'"
)

if exist "%ZIP_NAME%" del "%ZIP_NAME%"

echo.
echo [INFO] Creando archivo comprimido %ZIP_NAME%...
echo Comprimiendo archivos fuentes, binarios locales y dependencias pre-instaladas...
echo Esto puede tomar un momento...

powershell -NoProfile -Command "Compress-Archive -Path public, bin, node_modules, db.js, server.js, package.json, package-lock.json, iniciar.bat, iniciar.vbs, detener.bat, crear-acceso-directo.bat, restaurant-os.ico, logo.png, LICENSE, README.md -DestinationPath '%ZIP_NAME%' -Force"

if %errorlevel% equ 0 (
    echo.
    echo [OK] ¡Archivo comprimido %ZIP_NAME% creado con exito!
    echo Este archivo contiene el runtime local integrado y esta 100%% listo para distribuirse.
    echo El cliente final solo necesita extraerlo y hacer clic en iniciar.
    echo.
) else (
    echo.
    echo [ERROR] No se pudo crear el archivo comprimido.
    echo.
)

pause
