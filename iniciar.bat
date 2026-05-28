@echo off
title Iniciando Restaurant OS...
cd /d "%~dp0"

REM 1. Validar si existe node_modules (si no, intentar instalarlo si hay Node global)
if not exist "node_modules\" (
    echo [INFO] Carpeta node_modules no encontrada. Instalando dependencias necesarias...
    node -v >nul 2>&1
    if %errorlevel% equ 0 (
        call npm install
    ) else (
        echo [ERROR] No se encuentra la carpeta node_modules ni Node.js global para instalar dependencias.
        echo Asegúrate de extraer todos los archivos del ZIP antes de abrir la aplicación.
        pause
        exit /b
    )
)

REM 2. Iniciar el servidor Express utilizando el runtime portable si existe, o el global
if exist "bin\node.exe" (
    start "" /b "bin\node.exe" server.js
) else (
    node -v >nul 2>&1
    if %errorlevel% equ 0 (
        start "" /b node server.js
    ) else (
        echo [ERROR] No se detectó Node.js local ni global en el sistema.
        echo Por favor instala Node.js desde https://nodejs.org/ o conserva el archivo bin\node.exe.
        pause
        exit /b
    )
)

REM 3. Esperar a que inicialice el servidor local e iniciar el navegador
timeout /t 2 /nobreak >nul
start http://localhost:3000
exit
