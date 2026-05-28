#!/bin/bash
echo "==================================================="
echo "    RESTAURANT OS - SISTEMA DE GESTION LOCAL"
echo "==================================================="
echo ""

# Ir al directorio del script
cd "$(dirname "$0")"

# Validar si Node.js esta instalado
if ! command -v node &> /dev/null
then
    echo "[ERROR] Node.js no está instalado en este equipo."
    echo "Por favor, descarga e instala Node.js desde https://nodejs.org/"
    echo ""
    read -p "Presiona Enter para salir..."
    exit 1
fi

# Instalar dependencias si no existe node_modules
if [ ! -d "node_modules" ]; then
    echo "[INFO] Detectando instalación por primera vez. Instalando dependencias..."
    npm install
fi

# Iniciar el servidor Express en segundo plano
echo "[INFO] Levantando el servidor local en http://localhost:3000 ..."
node server.js &
SERVER_PID=$!

# Esperar 2 segundos a que el servidor inicialice
sleep 2

# Abrir navegador segun el OS
if [[ "$OSTYPE" == "darwin"* ]]; then
    open "http://localhost:3000"
else
    xdg-open "http://localhost:3000" 2>/dev/null || echo "Abre http://localhost:3000 en tu navegador"
fi

echo "[INFO] Servidor corriendo con PID $SERVER_PID. Presiona Ctrl+C para detener."
wait $SERVER_PID
