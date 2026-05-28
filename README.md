# Restaurant OS Local

Sistema local de gestión para restaurantes en un solo archivo HTML: ERP, POS, plano de mesas, KDS, inventario, usuarios y cierre de caja.

## Características

- Aplicación 100% local, sin nube ni servidor obligatorio.
- Archivo principal único: `index.html`.
- Persistencia en `localStorage` del navegador del equipo.
- Roles RBAC: administrador, mesero, cajero y cocina.
- Plano de 12 mesas con estados operativos.
- POS con carrito, notas de cocina, IVA 16%, propina y envío a cocina.
- KDS con temporizador, preparación y órdenes listas.
- Inventario con descuento automático por recetas y reabastecimiento.
- Alta local de usuarios y administradores.
- Cierre de caja para cajero y administrador.

## Instalación rápida

1. Descarga o clona el repositorio.
2. Abre `index.html` con Chrome, Edge, Firefox o Safari.
3. Usa uno de los usuarios demo para entrar al flujo:

| Usuario | Rol | PIN |
| --- | --- | --- |
| Admin General | Administrador | `0000` |
| Ana Mesas | Mesero | `1111` |
| Luis Caja | Cajero | `2222` |
| Mar Cocina | Cocina | `3333` |

## Uso local

La app guarda datos en el almacenamiento local del navegador donde se abre. Cada computadora mantiene su propia base local. Para compartir datos entre equipos se puede extender el proyecto con una capa opcional de SQLite, IndexedDB sincronizado o una API local, manteniendo el `index.html` como interfaz.

## Flujo recomendado

1. Entra como mesero o administrador.
2. Abre una mesa libre desde el plano de mesas.
3. Agrega productos en POS, ajusta notas, propina y envía a cocina.
4. Entra como cocina y marca la orden como `Preparar` o `Listo`.
5. Entra como cajero o administrador, solicita la cuenta y procesa el pago.
6. Marca la mesa como limpia para volverla a usar.

## Modificar el sistema

Todo el código está en `index.html`.

Las estructuras principales están en `AppState`:

- `users`
- `currentUser`
- `tables`
- `menu`
- `inventory`
- `orders`

Para agregar productos o recetas modifica el arreglo `menu`. Para cambiar insumos modifica `inventory`. Cada producto tiene `stockInsumos`, que define cuánto inventario se descuenta al enviar una comanda.

## Publicar en GitHub Pages

1. Sube el repositorio a GitHub.
2. Ve a `Settings`.
3. Entra a `Pages`.
4. Selecciona la rama principal y la carpeta raíz.
5. Guarda los cambios.

## Licencia

MIT. Puedes usarlo, modificarlo y distribuirlo libremente.
