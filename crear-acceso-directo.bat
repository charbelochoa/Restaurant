@echo off
title Crear Acceso Directo de Escritorio
echo ===================================================
echo   RESTAURANT OS - INSTALADOR DE ACCESO DIRECTO
echo ===================================================
echo.
cd /d "%~dp0"

set "SCRIPT_DIR=%~dp0"
set "SHORTCUT_PATH=%USERPROFILE%\Desktop\Restaurant OS.lnk"
set "TARGET_PATH=%SCRIPT_DIR%iniciar.vbs"
set "ICON_PATH=%SCRIPT_DIR%restaurant-os.ico"

echo [INFO] Creando acceso directo silencioso en tu Escritorio...

powershell -NoProfile -Command "$WshShell = New-Object -ComObject WScript.Shell; $Shortcut = $WshShell.CreateShortcut('%SHORTCUT_PATH%'); $Shortcut.TargetPath = '%TARGET_PATH%'; $Shortcut.WorkingDirectory = '%SCRIPT_DIR%'; $Shortcut.IconLocation = '%ICON_PATH%'; $Shortcut.Description = 'Sistema de Gestion Comercial Local para Restaurantes'; $Shortcut.Save();"

if %errorlevel% equ 0 (
    echo.
    echo [OK] ¡Acceso directo creado con exito en tu Escritorio!
    echo Ya puedes iniciar el sistema con doble clic sobre "Restaurant OS" en tu Escritorio.
    echo.
) else (
    echo.
    echo [ERROR] No se pudo crear el acceso directo de escritorio.
    echo.
)

pause
