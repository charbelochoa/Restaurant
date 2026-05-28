# Restaurant OS (Open Source Professional Management Software)

Sistema local de gestión profesional para restaurantes basado en Node.js, Express, SQLite y Server-Sent Events (SSE). Diseñado para correr localmente de forma autónoma o en red local para sincronizar terminales múltiples (POS, Cajero, KDS Cocina, Configuración ERP).

## Características Profesionales

- **Backend en Node.js + Express**: Servidor HTTP nativo para la persistencia centralizada y el manejo seguro del flujo comercial.
- **Base de Datos SQLite**: Almacenamiento transaccional robusto en un archivo local (`restaurant.db`). Incluye migración de esquema automática y semilla (seeding) de prueba en la primera ejecución.
- **Sincronización en Tiempo Real (SSE)**: Canal de Server-Sent Events (`/api/events`) que alerta y sincroniza al instante todas las pantallas de los usuarios cuando ocurre un cambio en el salón, inventario o comandas (ej. la cocina recibe una alerta sonora de comanda nueva en tiempo real cuando el mesero la envía desde su terminal).
- **Roles RBAC (Control de Acceso)**: Administrador, Mesero, Cajero y Cocina.
- **Gestión de Inventario Real**:
  - Catálogo de insumos en bodega con unidad de medida, costos reales y stock mínimo con alertas visuales de insumos críticos.
  - Recetas dinámicas para cada platillo del menú que descuentan automáticamente los insumos en miligramos/gramos/piezas de la bodega al enviar la orden.
- **Plano de Salón Interactivo**: Distribución dinámica de mesas y estados (libre, ocupada, sucia, cuenta pedida) con persistencia centralizada.
- **Historial de Ventas y Finanzas**:
  - Reporte e historial detallado de cortes de caja (cierres de turno).
  - Exportación completa del libro de ventas a formato CSV compatible con Microsoft Excel.
  - Descarga e importación de copias de seguridad de toda la base de datos en formato JSON directo desde el panel de ajustes.
- **POS de Facturación Profesional**: Panel táctil intuitivo, modificadores (sin cebolla, término medio, etc.), descuentos, propina sugerida y ticketera térmica integrada con hojas de estilo CSS preparadas para impresoras físicas.

## Instalación y Arranque Rápido

### Requisitos previos

- Node.js instalado (Versión 16 o superior).

### Instrucciones de inicio

1. Clona o descarga el código fuente del proyecto.
2. Abre tu terminal de comandos en la carpeta raíz del proyecto.
3. Instala las dependencias necesarias:
   ```bash
   npm install
   ```
4. Inicia el servidor de la aplicación:
   ```bash
   npm start
   ```
5. Abre en tu navegador de internet (Chrome, Edge, Firefox, etc.) la siguiente URL:
   ```
   http://localhost:3000
   ```
   *Nota: Puedes abrir esta dirección en múltiples dispositivos (tablets, teléfonos o PCs) conectados a la misma red local (LAN) usando la IP local de la computadora servidor.*

## Usuarios Demo de Acceso

| Rol | Usuario Demo | PIN de Acceso |
| --- | --- | --- |
| **Administrador** | Admin General | `0000` |
| **Mesero** | Ana Mesas | `1111` |
| **Cajero** | Luis Caja | `2222` |
| **Cocina** | Mar Cocina | `3333` |

## Licencia

Este proyecto está bajo la Licencia MIT. Libre de usar, modificar y distribuir comercialmente.
