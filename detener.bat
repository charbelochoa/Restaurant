@echo off
title Detener Restaurant OS
echo ===================================================
echo   RESTAURANT OS - DETENER SERVIDOR LOCAL
echo ===================================================
echo.
cd /d "%~dp0"

echo [INFO] Deteniendo el servidor de Restaurant OS...
taskkill /f /im node.exe >nul 2>&1

echo.
echo [OK] Servidor detenido con exito.
echo.
timeout /t 3 >nul
