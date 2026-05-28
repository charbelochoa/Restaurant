const express = require('express');
const path = require('path');
const fs = require('fs');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Server-Sent Events (SSE) clients pool
let sseClients = [];

app.get('/api/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  sseClients.push(res);
  console.log(`SSE client connected. Total clients: ${sseClients.length}`);

  req.on('close', () => {
    sseClients = sseClients.filter(c => c !== res);
    console.log(`SSE client disconnected. Total clients: ${sseClients.length}`);
  });
});

function broadcast(data) {
  const payload = `data: ${JSON.stringify(data)}\n\n`;
  sseClients.forEach(c => c.write(payload));
}

// Helpers to serialize/deserialize json fields
function parseRow(row, jsonFields = []) {
  if (!row) return row;
  const result = { ...row };
  jsonFields.forEach(field => {
    if (result[field]) {
      try {
        result[field] = JSON.parse(result[field]);
      } catch (e) {
        result[field] = [];
      }
    }
  });
  return result;
}

// Security Audit Log Helper
async function logAudit(req, action, details) {
  const userId = req.headers['x-user-id'] || 'system';
  let userName = 'Sistema';
  if (userId !== 'system') {
    try {
      const u = await db.get('SELECT nombre FROM users WHERE id = ?', [userId]);
      if (u) userName = u.nombre;
    } catch (e) {
      console.error('Audit user check error:', e);
    }
  }
  const id = 'aud-' + Math.random().toString(36).substr(2, 9);
  await db.run('INSERT INTO audit_logs (id, usuarioId, usuarioNombre, accion, detalles, timestamp) VALUES (?, ?, ?, ?, ?, ?)',
    [id, userId, userName, action, details, Date.now()]);
}

// REST API State
app.get('/api/state', async (req, res) => {
  try {
    const usersRows = await db.all('SELECT * FROM users');
    const menuRows = await db.all('SELECT * FROM menu');
    const inventory = await db.all('SELECT * FROM inventory');
    const tables = await db.all('SELECT * FROM tables');
    const orderRows = await db.all('SELECT * FROM orders');
    const closures = await db.all('SELECT * FROM closures');
    const kitchenMessages = await db.all('SELECT * FROM kitchen_messages');
    const holdTicketRows = await db.all('SELECT * FROM hold_tickets');
    const drawerLogs = await db.all('SELECT * FROM drawer_logs ORDER BY timestamp DESC');
    const configRows = await db.all('SELECT * FROM restaurant_config');
    const auditLogs = await db.all('SELECT * FROM audit_logs ORDER BY timestamp DESC LIMIT 150');
    const purchases = await db.all('SELECT * FROM purchases ORDER BY timestamp DESC');
    const mermas = await db.all('SELECT * FROM mermas ORDER BY timestamp DESC');
    const customers = await db.all('SELECT * FROM customers ORDER BY nombre ASC');

    // Secure users check: NEVER send security PINs (plain or hashes) to client browser
    const users = usersRows.map(u => {
      const parsed = { ...u };
      delete parsed.pin;
      return parsed;
    });

    // Parse JSON fields
    const menu = menuRows.map(p => {
      const parsed = parseRow(p, ['stockInsumos']);
      parsed.favorito = Boolean(parsed.favorito);
      return parsed;
    });

    const orders = orderRows.map(o => {
      const parsed = parseRow(o, ['items']);
      parsed.preparado = Boolean(parsed.preparado);
      return parsed;
    });

    const holdTickets = holdTicketRows.map(t => parseRow(t, ['items']));

    // Convert config key-value rows to object
    const restaurantConfig = {};
    configRows.forEach(row => {
      let value = row.value;
      if (row.key === 'ivaPorcentaje') value = Number(value);
      if (row.key === 'cajaLimiteEfectivo') value = Number(value);
      restaurantConfig[row.key] = value;
    });

    res.json({
      users,
      menu,
      inventory,
      tables,
      orders,
      closures,
      kitchenMessages,
      holdTickets,
      drawerLogs,
      restaurantConfig,
      auditLogs,
      purchases,
      mermas,
      customers
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error loading application state.' });
  }
});

// Unlock Screen Authentication
app.post('/api/users/unlock', async (req, res) => {
  const { id, pin } = req.body;
  try {
    const user = await db.get('SELECT * FROM users WHERE id = ?', [id]);
    if (user && user.pin === db.hashPin(pin)) {
      res.json({ success: true });
    } else {
      res.status(401).json({ error: 'PIN de acceso incorrecto.' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Admin PIN Security Authorization
app.post('/api/users/authorize-admin', async (req, res) => {
  const { pin } = req.body;
  try {
    const hashed = db.hashPin(pin);
    const admin = await db.get('SELECT * FROM users WHERE rol = "admin" AND pin = ?', [hashed]);
    if (admin) {
      res.json({ success: true, authorizedBy: admin.nombre });
    } else {
      res.status(401).json({ error: 'PIN de administrador no válido.' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Configure Business Settings
app.post('/api/config', async (req, res) => {
  const config = req.body;
  try {
    for (const [key, value] of Object.entries(config)) {
      await db.run('INSERT INTO restaurant_config (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = ?', [key, String(value), String(value)]);
    }
    await logAudit(req, 'Configuración modificada', 'Se actualizaron los parámetros comerciales del establecimiento');
    broadcast({ type: 'reload' });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Users Management
app.post('/api/users', async (req, res) => {
  const { id, nombre, rol, pin } = req.body;
  try {
    const hashedPin = db.hashPin(pin);
    await db.run('INSERT INTO users (id, nombre, rol, pin) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET nombre = ?, rol = ?, pin = ?', 
      [id, nombre, rol, hashedPin, nombre, rol, hashedPin]);
    await logAudit(req, 'Usuario modificado/creado', `Nombre: ${nombre}, Rol: ${rol}`);
    broadcast({ type: 'reload' });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/users/:id', async (req, res) => {
  try {
    const targetUser = await db.get('SELECT nombre FROM users WHERE id = ?', [req.params.id]);
    const details = targetUser ? `Nombre: ${targetUser.nombre}` : `ID: ${req.params.id}`;
    await db.run('DELETE FROM users WHERE id = ?', [req.params.id]);
    await logAudit(req, 'Usuario eliminado', details);
    broadcast({ type: 'reload' });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Menu Management
app.post('/api/menu', async (req, res) => {
  const { id, nombre, precio, categoria, favorito, barcode, stockInsumos } = req.body;
  try {
    await db.run('INSERT INTO menu (id, nombre, precio, categoria, favorito, barcode, stockInsumos) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET nombre = ?, precio = ?, categoria = ?, favorito = ?, barcode = ?, stockInsumos = ?',
      [id, nombre, precio, categoria, favorito ? 1 : 0, barcode || null, JSON.stringify(stockInsumos || {}),
       nombre, precio, categoria, favorito ? 1 : 0, barcode || null, JSON.stringify(stockInsumos || {})]);
    await logAudit(req, 'Plato del menú modificado/creado', `Plato: ${nombre}, Precio: $${precio}`);
    broadcast({ type: 'reload' });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/menu/:id', async (req, res) => {
  try {
    const dish = await db.get('SELECT nombre FROM menu WHERE id = ?', [req.params.id]);
    const details = dish ? `Nombre: ${dish.nombre}` : `ID: ${req.params.id}`;
    await db.run('DELETE FROM menu WHERE id = ?', [req.params.id]);
    await logAudit(req, 'Plato del menú eliminado', details);
    broadcast({ type: 'reload' });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Inventory Management
app.post('/api/inventory', async (req, res) => {
  const { id, nombre, cantidadActual, unidad, stockMinimo, costo } = req.body;
  try {
    await db.run('INSERT INTO inventory (id, nombre, cantidadActual, unidad, stockMinimo, costo) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET nombre = ?, cantidadActual = ?, unidad = ?, stockMinimo = ?, costo = ?',
      [id, nombre, cantidadActual, unidad, stockMinimo, costo, nombre, cantidadActual, unidad, stockMinimo, costo]);
    await logAudit(req, 'Insumo de bodega modificado/creado', `Insumo: ${nombre}, Cant: ${cantidadActual} ${unidad}, Costo: $${costo}`);
    broadcast({ type: 'reload' });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/inventory/restock', async (req, res) => {
  const { id, cantidad } = req.body;
  try {
    await db.run('UPDATE inventory SET cantidadActual = cantidadActual + ? WHERE id = ?', [cantidad, id]);
    const item = await db.get('SELECT nombre FROM inventory WHERE id = ?', [id]);
    await logAudit(req, 'Reabastecimiento directo', `Insumo: ${item ? item.nombre : id}, Cantidad añadida: ${cantidad}`);
    broadcast({ type: 'reload' });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/inventory/:id', async (req, res) => {
  try {
    const item = await db.get('SELECT nombre FROM inventory WHERE id = ?', [req.params.id]);
    const details = item ? `Insumo: ${item.nombre}` : `ID: ${req.params.id}`;
    await db.run('DELETE FROM inventory WHERE id = ?', [req.params.id]);
    await logAudit(req, 'Insumo eliminado de bodega', details);
    broadcast({ type: 'reload' });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Purchases (Recalculating weighted average cost)
app.post('/api/purchases', async (req, res) => {
  const { id, insumoId, cantidad, costoUnitario, proveedor, timestamp } = req.body;
  try {
    // 1. Record purchase
    await db.run('INSERT INTO purchases (id, insumoId, cantidad, costoUnitario, proveedor, timestamp) VALUES (?, ?, ?, ?, ?, ?)',
      [id, insumoId, cantidad, costoUnitario, proveedor, timestamp]);
    
    // 2. Weighted average cost recalculation
    const item = await db.get('SELECT nombre, cantidadActual, costo FROM inventory WHERE id = ?', [insumoId]);
    if (item) {
      const currentQty = Number(item.cantidadActual);
      const currentCost = Number(item.costo || 0);
      
      const newQty = currentQty + Number(cantidad);
      const newCost = newQty > 0 ? ((currentQty * currentCost) + (Number(cantidad) * Number(costoUnitario))) / newQty : costoUnitario;
      
      await db.run('UPDATE inventory SET cantidadActual = ?, costo = ? WHERE id = ?', [newQty, newCost, insumoId]);
      await logAudit(req, 'Compra de Insumo registrada', `Insumo: ${item.nombre}, Cant: ${cantidad}, Costo U: $${costoUnitario}, Proveedor: ${proveedor || 'N/A'}`);
    }
    
    broadcast({ type: 'reload' });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Mermas (Inventory Waste Control)
app.post('/api/mermas', async (req, res) => {
  const { id, insumoId, cantidad, motivo, usuarioId, timestamp } = req.body;
  try {
    await db.run('INSERT INTO mermas (id, insumoId, cantidad, motivo, usuarioId, timestamp) VALUES (?, ?, ?, ?, ?, ?)',
      [id, insumoId, cantidad, motivo, usuarioId, timestamp]);
    
    const item = await db.get('SELECT nombre, unidad FROM inventory WHERE id = ?', [insumoId]);
    if (item) {
      await db.run('UPDATE inventory SET cantidadActual = MAX(0, cantidadActual - ?) WHERE id = ?', [Number(cantidad), insumoId]);
      await logAudit(req, 'Merma / Desperdicio registrado', `Insumo: ${item.nombre}, Cantidad: ${cantidad} ${item.unidad}, Motivo: ${motivo}`);
    }
    
    broadcast({ type: 'reload' });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Tables Management
app.post('/api/tables', async (req, res) => {
  const { id, numero, capacidad, estado, totalActual, ordenId, abiertaEn, personas, cliente, telefono, notaCuenta, posX, posY, zona } = req.body;
  try {
    await db.run('INSERT INTO tables (id, numero, capacidad, estado, totalActual, ordenId, abiertaEn, personas, cliente, telefono, notaCuenta, posX, posY, zona) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET numero = ?, capacidad = ?, estado = ?, totalActual = ?, ordenId = ?, abiertaEn = ?, personas = ?, cliente = ?, telefono = ?, notaCuenta = ?, posX = COALESCE(?, posX), posY = COALESCE(?, posY), zona = COALESCE(?, zona)',
      [id, numero, capacidad, estado, totalActual || 0, ordenId || null, abiertaEn || null, personas || 0, cliente || null, telefono || null, notaCuenta || null, posX || 0, posY || 0, zona || 'Salón',
       numero, capacidad, estado, totalActual || 0, ordenId || null, abiertaEn || null, personas || 0, cliente || null, telefono || null, notaCuenta || null, posX, posY, zona]);
    await logAudit(req, 'Mesas del salón modificadas', `Mesa ${numero}, Capacidad: ${capacidad}, Zona: ${zona || 'Salón'}`);
    broadcast({ type: 'reload' });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/tables/positions', async (req, res) => {
  const { positions } = req.body;
  try {
    for (const pos of positions) {
      await db.run('UPDATE tables SET posX = ?, posY = ? WHERE id = ?', [pos.posX, pos.posY, pos.id]);
    }
    broadcast({ type: 'reload' });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/tables/:id', async (req, res) => {
  try {
    const table = await db.get('SELECT numero FROM tables WHERE id = ?', [req.params.id]);
    const details = table ? `Mesa: ${table.numero}` : `ID: ${req.params.id}`;
    await db.run('DELETE FROM tables WHERE id = ?', [req.params.id]);
    await logAudit(req, 'Mesa eliminada del salón', details);
    broadcast({ type: 'reload' });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Orders Management
app.post('/api/orders', async (req, res) => {
  const o = req.body;
  try {
    // 1. Insert order
    await db.run(`INSERT INTO orders (
      id, mesaId, bruto, descuentoProducto, descuentoGeneral, descuentoPorcentaje, subtotal, impuestos, propina, cargo, cargoPorcentaje, total, estado, timestamp, preparado, listoEn, cerradoEn, meseroId, cajeroId, cliente, personas, notaCuenta, metodoPago, cierreId, items
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [o.id, o.mesaId, o.bruto, o.descuentoProducto, o.descuentoGeneral, o.descuentoPorcentaje, o.subtotal, o.impuestos, o.propina, o.cargo, o.cargoPorcentaje, o.total, o.estado, o.timestamp, o.preparado ? 1 : 0, o.listoEn || null, o.cerradoEn || null, o.meseroId, o.cajeroId || null, o.cliente || null, o.personas || 0, o.notaCuenta || null, o.metodoPago || null, o.cierreId || null, JSON.stringify(o.items)]);

    // 2. Discount inventory stock
    for (const item of o.items) {
      const p = await db.get('SELECT stockInsumos FROM menu WHERE id = ?', [item.id]);
      if (p && p.stockInsumos) {
        const ingredients = JSON.parse(p.stockInsumos);
        for (const [insumoId, qty] of Object.entries(ingredients)) {
          const discount = qty * item.cantidad;
          await db.run('UPDATE inventory SET cantidadActual = MAX(0, cantidadActual - ?) WHERE id = ?', [discount, insumoId]);
        }
      }
    }

    // 3. Update table totals & state
    await db.run('UPDATE tables SET estado = ?, totalActual = totalActual + ?, ordenId = ?, abiertaEn = COALESCE(abiertaEn, ?), personas = ?, cliente = ?, telefono = ?, notaCuenta = ? WHERE id = ?',
      ['ocupada', o.total, o.id, o.timestamp, o.personas, o.cliente, o.telefono, o.notaCuenta, o.mesaId]);

    const table = await db.get('SELECT numero FROM tables WHERE id = ?', [o.mesaId]);
    await logAudit(req, 'Orden enviada a cocina', `Mesa: ${table ? table.numero : o.mesaId}, Total: $${o.total}`);
    broadcast({ type: 'reload' });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update comanda state (KDS preparation or finalized)
app.post('/api/orders/state', async (req, res) => {
  const { id, estado, preparado, listoEn } = req.body;
  try {
    await db.run('UPDATE orders SET estado = ?, preparado = ?, listoEn = ? WHERE id = ?', [estado, preparado ? 1 : 0, listoEn || null, id]);
    
    const o = await db.get('SELECT mesaId FROM orders WHERE id = ?', [id]);
    const table = o ? await db.get('SELECT numero FROM tables WHERE id = ?', [o.mesaId]) : null;
    const details = `Mesa: ${table ? table.numero : 'N/A'}, Estado: ${estado}`;
    await logAudit(req, 'Estado de comanda KDS modificado', details);
    
    broadcast({ type: 'reload' });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Process bill payment
app.post('/api/orders/pay', async (req, res) => {
  const { mesaId, cajeroId, metodoPago, cerradoEn } = req.body;
  try {
    // 1. Mark active orders as paid
    await db.run('UPDATE orders SET estado = "pagado", metodoPago = ?, cajeroId = ?, cerradoEn = ? WHERE mesaId = ? AND estado != "pagado"',
      [metodoPago, cajeroId, cerradoEn, mesaId]);

    // 2. Clean table state (mark table as dirty/sucia)
    await db.run('UPDATE tables SET estado = "sucia", totalActual = 0, ordenId = NULL, abiertaEn = NULL, personas = 0, cliente = "", telefono = "", notaCuenta = "" WHERE id = ?', [mesaId]);

    const table = await db.get('SELECT numero FROM tables WHERE id = ?', [mesaId]);
    await logAudit(req, 'Mesa cobrada / Liquidada', `Mesa: ${table ? table.numero : mesaId}, Método: ${metodoPago}`);

    broadcast({ type: 'reload' });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Split and pay sub-bill
app.post('/api/orders/split', async (req, res) => {
  const { originalOrderId, remainingItems, remainingTotals, paidOrder } = req.body;
  try {
    await db.exec('BEGIN TRANSACTION;');
    
    // 1. If remainingItems is empty, delete the original order
    if (remainingItems.length === 0) {
      await db.run('DELETE FROM orders WHERE id = ?', [originalOrderId]);
    } else {
      // Update original order with remaining items and recalculate
      await db.run(`UPDATE orders SET 
        items = ?, bruto = ?, subtotal = ?, impuestos = ?, total = ?
        WHERE id = ?`,
        [JSON.stringify(remainingItems), remainingTotals.bruto, remainingTotals.subtotal, remainingTotals.impuestos, remainingTotals.total, originalOrderId]);
    }
    
    // 2. Insert the paid sub-bill order
    const o = paidOrder;
    await db.run(`INSERT INTO orders (
      id, mesaId, bruto, descuentoProducto, descuentoGeneral, descuentoPorcentaje, subtotal, impuestos, propina, cargo, cargoPorcentaje, total, estado, timestamp, preparado, listoEn, cerradoEn, meseroId, cajeroId, cliente, personas, notaCuenta, metodoPago, cierreId, items
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [o.id, o.mesaId, o.bruto, o.descuentoProducto || 0, o.descuentoGeneral || 0, o.descuentoPorcentaje || 0, o.subtotal, o.impuestos, o.propina || 0, o.cargo || 0, o.cargoPorcentaje || 0, o.total, "pagado", o.timestamp, 1, o.cerradoEn, o.cerradoEn, o.meseroId, o.cajeroId, o.cliente, o.personas || 1, o.notaCuenta || null, o.metodoPago, o.cierreId || null, JSON.stringify(o.items)]);
    
    // 3. Update table totals
    await db.run('UPDATE tables SET totalActual = MAX(0, totalActual - ?) WHERE id = ?', [o.total, o.mesaId]);
    
    await db.exec('COMMIT;');
    await logAudit(req, 'Comanda dividida y cobrada parcialmente', `Orden original: ${originalOrderId}, Cuenta cobrada: $${o.total}`);
    broadcast({ type: 'reload' });
    res.json({ success: true });
  } catch (error) {
    await db.exec('ROLLBACK;');
    res.status(500).json({ error: error.message });
  }
});

// Shift Cash Closure (with automatic file-level backup & blind closure counts)
app.post('/api/closures', async (req, res) => {
  const { id, usuarioId, timestamp, total, ordenes, efectivo, tarjeta, puntos, efectivoContado, diferencia } = req.body;
  try {
    // 1. Assign closure id to all unclosed paid orders
    await db.run('UPDATE orders SET cierreId = ? WHERE estado = "pagado" AND cierreId IS NULL', [id]);

    // 2. Insert closure report with blind counts
    await db.run('INSERT INTO closures (id, usuarioId, timestamp, total, ordenes, efectivo, tarjeta, puntos, efectivoContado, diferencia) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [id, usuarioId, timestamp, total, ordenes, efectivo, tarjeta, puntos, efectivoContado || 0, diferencia || 0]);

    // 3. Automated Local Database File Backup (100% offline, cross-platform)
    try {
      const backupDir = path.join(__dirname, 'backups');
      if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
      }
      const date = new Date(timestamp);
      const timestampStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}_${String(date.getHours()).padStart(2, '0')}-${String(date.getMinutes()).padStart(2, '0')}-${String(date.getSeconds()).padStart(2, '0')}`;
      const backupFilename = `backup-cierre-${timestampStr}.db`;
      const backupPath = path.join(backupDir, backupFilename);
      
      fs.copyFileSync(path.join(__dirname, 'restaurant.db'), backupPath);
      console.log(`Automatic database backup created at ${backupPath}`);
      await logAudit(req, 'Cierre de Caja e Historial Guardado', `Total: $${total}. Diferencia de arqueo ciego: $${diferencia}. Respaldo: ${backupFilename}`);
    } catch (backupError) {
      console.error('Auto-backup database error:', backupError);
    }

    broadcast({ type: 'reload' });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Kitchen messages alert alerts
app.post('/api/kitchen-messages', async (req, res) => {
  const { id, texto, usuario, timestamp, estado } = req.body;
  try {
    await db.run('INSERT INTO kitchen_messages (id, texto, usuario, timestamp, estado) VALUES (?, ?, ?, ?, ?)', [id, texto, usuario, timestamp, estado]);
    broadcast({ type: 'reload' });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/kitchen-messages/:id', async (req, res) => {
  try {
    await db.run('DELETE FROM kitchen_messages WHERE id = ?', [req.params.id]);
    broadcast({ type: 'reload' });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Hold Ticket suspension POS
app.post('/api/hold-tickets', async (req, res) => {
  const { id, mesaId, items, tipPercent, discountPercent, serviceChargePercent, timestamp, remove } = req.body;
  try {
    if (remove) {
      await db.run('DELETE FROM hold_tickets WHERE mesaId = ?', [mesaId]);
    } else {
      await db.run('INSERT INTO hold_tickets (id, mesaId, items, tipPercent, discountPercent, serviceChargePercent, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [id, mesaId, JSON.stringify(items), tipPercent, discountPercent, serviceChargePercent, timestamp]);
    }
    broadcast({ type: 'reload' });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Drawer logs & Withdrawals
app.post('/api/drawer-logs', async (req, res) => {
  const { id, usuarioId, tipo, monto, motivo, timestamp } = req.body;
  try {
    await db.run('INSERT INTO drawer_logs (id, usuarioId, tipo, monto, motivo, timestamp) VALUES (?, ?, ?, ?, ?, ?)', 
      [id, usuarioId, tipo, monto || 0, motivo || null, timestamp]);
    
    const details = tipo === 'retiro' 
      ? `Retiro de efectivo: $${monto}, Motivo: ${motivo}` 
      : `Apertura manual de cajón`;
    await logAudit(req, tipo === 'retiro' ? 'Retiro de caja registrado' : 'Cajón de dinero abierto', details);
    
    broadcast({ type: 'reload' });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// CRM Customers endpoints
app.get('/api/customers', async (req, res) => {
  try {
    const rows = await db.all('SELECT * FROM customers ORDER BY nombre ASC');
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/customers', async (req, res) => {
  const { id, nombre, telefono, rfc, direccion, descuento, timestamp } = req.body;
  try {
    await db.run(`INSERT INTO customers (id, nombre, telefono, rfc, direccion, descuento, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?) 
      ON CONFLICT(id) DO UPDATE SET nombre = ?, telefono = ?, rfc = ?, direccion = ?, descuento = ?`,
      [id, nombre, telefono || null, rfc || null, direccion || null, descuento || 0, timestamp || Date.now(),
       nombre, telefono || null, rfc || null, direccion || null, descuento || 0]);
    await logAudit(req, 'Cliente registrado/modificado CRM', `Cliente: ${nombre}, Descuento VIP: ${descuento}%`);
    broadcast({ type: 'reload' });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/customers/:id', async (req, res) => {
  try {
    const customer = await db.get('SELECT nombre FROM customers WHERE id = ?', [req.params.id]);
    await db.run('DELETE FROM customers WHERE id = ?', [req.params.id]);
    await logAudit(req, 'Cliente eliminado CRM', `Cliente: ${customer ? customer.nombre : req.params.id}`);
    broadcast({ type: 'reload' });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Overwrite database database restore backup
app.post('/api/restore', async (req, res) => {
  const data = req.body;
  try {
    // Drop all data inside a transaction
    await db.exec('BEGIN TRANSACTION;');
    
    await db.exec('DELETE FROM users;');
    await db.exec('DELETE FROM inventory;');
    await db.exec('DELETE FROM menu;');
    await db.exec('DELETE FROM tables;');
    await db.exec('DELETE FROM orders;');
    await db.exec('DELETE FROM closures;');
    await db.exec('DELETE FROM kitchen_messages;');
    await db.exec('DELETE FROM hold_tickets;');
    await db.exec('DELETE FROM drawer_logs;');
    await db.exec('DELETE FROM restaurant_config;');
    await db.exec('DELETE FROM audit_logs;');
    await db.exec('DELETE FROM purchases;');
    await db.exec('DELETE FROM mermas;');
    await db.exec('DELETE FROM customers;');

    for (const u of data.users) {
      const userPin = u.pin.length === 64 ? u.pin : db.hashPin(u.pin);
      await db.run('INSERT INTO users (id, nombre, rol, pin) VALUES (?, ?, ?, ?)', [u.id, u.nombre, u.rol, userPin]);
    }
    for (const item of data.inventory) {
      await db.run('INSERT INTO inventory (id, nombre, cantidadActual, unidad, stockMinimo, costo) VALUES (?, ?, ?, ?, ?, ?)', 
        [item.id, item.nombre, item.cantidadActual, item.unidad, item.stockMinimo, item.costo]);
    }
    for (const p of data.menu) {
      await db.run('INSERT INTO menu (id, nombre, precio, categoria, favorito, barcode, stockInsumos) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [p.id, p.nombre, p.precio, p.categoria, p.favorito ? 1 : 0, p.barcode || null, JSON.stringify(p.stockInsumos)]);
    }
    for (const t of data.tables) {
      await db.run('INSERT INTO tables (id, numero, capacidad, estado, totalActual, ordenId, abiertaEn, personas, cliente, telefono, notaCuenta) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [t.id, t.numero, t.capacidad, t.estado, t.totalActual, t.ordenId, t.abiertaEn, t.personas, t.cliente, t.telefono, t.notaCuenta]);
    }
    for (const o of data.orders) {
      await db.run(`INSERT INTO orders (
        id, mesaId, bruto, descuentoProducto, descuentoGeneral, descuentoPorcentaje, subtotal, impuestos, propina, cargo, cargoPorcentaje, total, estado, timestamp, preparado, listoEn, cerradoEn, meseroId, cajeroId, cliente, personas, notaCuenta, metodoPago, cierreId, items
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [o.id, o.mesaId, o.bruto, o.descuentoProducto, o.descuentoGeneral, o.descuentoPorcentaje, o.subtotal, o.impuestos, o.propina, o.cargo, o.cargoPorcentaje, o.total, o.estado, o.timestamp, o.preparado ? 1 : 0, o.listoEn || null, o.cerradoEn || null, o.meseroId, o.cajeroId || null, o.cliente || null, o.personas || 0, o.notaCuenta || null, o.metodoPago || null, o.cierreId || null, JSON.stringify(o.items)]);
    }
    for (const c of data.closures) {
      await db.run('INSERT INTO closures (id, usuarioId, timestamp, total, ordenes, efectivo, tarjeta, puntos, efectivoContado, diferencia) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [c.id, c.usuarioId, c.timestamp, c.total, c.ordenes, c.efectivo, c.tarjeta, c.puntos, c.efectivoContado || 0, c.diferencia || 0]);
    }
    if (data.kitchenMessages) {
      for (const m of data.kitchenMessages) {
        await db.run('INSERT INTO kitchen_messages (id, texto, usuario, timestamp, estado) VALUES (?, ?, ?, ?, ?)', [m.id, m.texto, m.usuario, m.timestamp, m.estado]);
      }
    }
    if (data.holdTickets) {
      for (const ht of data.holdTickets) {
        await db.run('INSERT INTO hold_tickets (id, mesaId, items, tipPercent, discountPercent, serviceChargePercent, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [ht.id, ht.mesaId, JSON.stringify(ht.items), ht.tipPercent, ht.discountPercent, ht.serviceChargePercent, ht.timestamp]);
      }
    }
    if (data.drawerLogs) {
      for (const dl of data.drawerLogs) {
        await db.run('INSERT INTO drawer_logs (id, usuarioId, tipo, monto, motivo, timestamp) VALUES (?, ?, ?, ?, ?, ?)', 
          [dl.id, dl.usuarioId, dl.tipo || 'apertura', dl.monto || 0, dl.motivo || null, dl.timestamp]);
      }
    }
    if (data.restaurantConfig) {
      for (const [key, value] of Object.entries(data.restaurantConfig)) {
        await db.run('INSERT INTO restaurant_config (key, value) VALUES (?, ?)', [key, String(value)]);
      }
    }
    if (data.auditLogs) {
      for (const al of data.auditLogs) {
        await db.run('INSERT INTO audit_logs (id, usuarioId, usuarioNombre, accion, detalles, timestamp) VALUES (?, ?, ?, ?, ?, ?)',
          [al.id, al.usuarioId, al.usuarioNombre, al.accion, al.detalles, al.timestamp]);
      }
    }
    if (data.purchases) {
      for (const pu of data.purchases) {
        await db.run('INSERT INTO purchases (id, insumoId, cantidad, costoUnitario, proveedor, timestamp) VALUES (?, ?, ?, ?, ?, ?)',
          [pu.id, pu.insumoId, pu.cantidad, pu.costoUnitario, pu.proveedor, pu.timestamp]);
      }
    }
    if (data.mermas) {
      for (const me of data.mermas) {
        await db.run('INSERT INTO mermas (id, insumoId, cantidad, motivo, usuarioId, timestamp) VALUES (?, ?, ?, ?, ?, ?)',
          [me.id, me.insumoId, me.cantidad, me.motivo, me.usuarioId, me.timestamp]);
      }
    }
    if (data.customers) {
      for (const cu of data.customers) {
        await db.run('INSERT INTO customers (id, nombre, telefono, rfc, direccion, descuento, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [cu.id, cu.nombre, cu.telefono, cu.rfc, cu.direccion, cu.descuento, cu.timestamp]);
      }
    }

    await db.exec('COMMIT;');
    await logAudit(req, 'Restauración de Base de Datos', 'Se importó un archivo JSON de respaldo sobrescribiendo toda la información central.');
    broadcast({ type: 'reload' });
    res.json({ success: true });
  } catch (error) {
    await db.exec('ROLLBACK;');
    res.status(500).json({ error: error.message });
  }
});

// General ESC/POS Ticket stream generator
app.get('/api/orders/:id/escpos', async (req, res) => {
  try {
    const o = await db.get('SELECT * FROM orders WHERE id = ?', [req.params.id]);
    if (!o) return res.status(404).json({ error: 'Comanda no encontrada' });
    
    const order = parseRow(o, ['items']);
    const configRows = await db.all('SELECT * FROM restaurant_config');
    const config = {};
    configRows.forEach(row => config[row.key] = row.value);
    
    const init = '\x1b\x40';
    const center = '\x1b\x61\x01';
    const left = '\x1b\x61\x00';
    const right = '\x1b\x61\x02';
    const doubleSize = '\x1d\x21\x11';
    const normalSize = '\x1d\x21\x00';
    const cut = '\x1d\x56\x42\x00';
    
    let stream = '';
    stream += init;
    
    // Render base64 or URL logo if exists (Placeholder note in ESC/POS)
    if (config.logoUrl) {
      stream += center + `[ LOGO ESTABLECIMIENTO: ${config.logoUrl.substring(0, 30)}... ]\n\n`;
    }
    
    stream += center + doubleSize + (config.nombre || 'RESTAURANT OS').toUpperCase() + '\n' + normalSize;
    if (config.mensajeEncabezado) stream += config.mensajeEncabezado + '\n';
    if (config.direccion) stream += config.direccion + '\n';
    if (config.rfc) stream += 'RFC: ' + config.rfc + '\n';
    if (config.telefono) stream += 'Tel: ' + config.telefono + '\n';
    stream += '------------------------------------------\n';
    stream += left + 'Fecha: ' + new Date(order.cerradoEn || order.timestamp).toLocaleString('es-MX') + '\n';
    stream += 'Ticket ID: ' + order.id + '\n';
    const activeTable = await db.get('SELECT numero FROM tables WHERE id = ?', [order.mesaId]);
    stream += 'Mesa: Mesa ' + (activeTable ? activeTable.numero : order.mesaId) + '\n';
    if (order.cliente) stream += 'Cliente CRM: ' + order.cliente + '\n';
    stream += '------------------------------------------\n';
    
    for (const item of order.items) {
      const p = await db.get('SELECT nombre, precio FROM menu WHERE id = ?', [item.id]);
      const name = p ? p.nombre : item.id;
      const price = p ? p.precio : 0;
      const lineTotal = price * item.cantidad;
      stream += `${item.cantidad}x ${name.padEnd(25).substring(0, 25)} $${lineTotal.toFixed(2)}\n`;
      if (item.notas) stream += `  * Obs: ${item.notas}\n`;
    }
    
    stream += '------------------------------------------\n';
    stream += right;
    stream += 'Subtotal: $' + Number(order.bruto || 0).toFixed(2) + '\n';
    const totalDeductions = (order.descuentoProducto || 0) + (order.descuentoGeneral || 0);
    if (totalDeductions > 0) stream += 'Descuentos: -$' + totalDeductions.toFixed(2) + '\n';
    stream += 'IVA (' + (config.ivaPorcentaje || 16) + '%): $' + Number(order.impuestos || 0).toFixed(2) + '\n';
    if (order.propina > 0) stream += 'Propina: $' + Number(order.propina || 0).toFixed(2) + '\n';
    if (order.cargo > 0) stream += 'Cargo Serv: $' + Number(order.cargo || 0).toFixed(2) + '\n';
    stream += doubleSize + 'TOTAL: $' + Number(order.total || 0).toFixed(2) + '\n' + normalSize;
    stream += '------------------------------------------\n';
    stream += center + (config.mensajePie || '¡Gracias por su visita!') + '\n\n\n\n';
    stream += cut;
    
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename=ticket-${order.id}.bin`);
    res.send(Buffer.from(stream, 'binary'));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Specific Station/Printer ESC/POS Ticket stream generator
app.get('/api/orders/:id/escpos/:printerTarget', async (req, res) => {
  try {
    const o = await db.get('SELECT * FROM orders WHERE id = ?', [req.params.id]);
    if (!o) return res.status(404).json({ error: 'Comanda no encontrada' });
    
    const order = parseRow(o, ['items']);
    const configRows = await db.all('SELECT * FROM restaurant_config');
    const config = {};
    configRows.forEach(row => config[row.key] = row.value);
    
    const printerTarget = req.params.printerTarget; // 'Cocina', 'Barra', 'Caja', etc.
    const printerMap = config.printer_map ? JSON.parse(config.printer_map) : {};
    
    // Filter items belonging to this printer target
    const filteredItems = [];
    for (const item of order.items) {
      const p = await db.get('SELECT categoria, nombre FROM menu WHERE id = ?', [item.id]);
      const cat = p ? p.categoria : 'otros';
      const targetStation = printerMap[cat] || 'Caja';
      if (targetStation.toLowerCase() === printerTarget.toLowerCase()) {
        filteredItems.push({
          ...item,
          nombre: p ? p.nombre : item.id
        });
      }
    }
    
    if (filteredItems.length === 0) {
      return res.status(400).json({ error: `No hay productos asignados a la impresora: ${printerTarget}` });
    }
    
    const init = '\x1b\x40';
    const center = '\x1b\x61\x01';
    const left = '\x1b\x61\x00';
    const doubleSize = '\x1d\x21\x11';
    const normalSize = '\x1d\x21\x00';
    const cut = '\x1d\x56\x42\x00';
    
    let stream = '';
    stream += init;
    stream += center + doubleSize + `COMANDA: ${printerTarget.toUpperCase()}` + '\n' + normalSize;
    const activeTable = await db.get('SELECT numero FROM tables WHERE id = ?', [order.mesaId]);
    stream += 'Mesa: Mesa ' + (activeTable ? activeTable.numero : order.mesaId) + '\n';
    stream += 'Fecha: ' + new Date(order.timestamp).toLocaleString('es-MX') + '\n';
    stream += 'Ticket ID: ' + order.id + '\n';
    stream += '------------------------------------------\n';
    stream += left;
    
    for (const item of filteredItems) {
      stream += `${item.cantidad}x ${item.nombre.padEnd(25).substring(0, 25)}\n`;
      if (item.notas) stream += `  * Obs: ${item.notas}\n`;
    }
    
    stream += '------------------------------------------\n\n\n\n';
    stream += cut;
    
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename=ticket-${printerTarget}-${order.id}.bin`);
    res.send(Buffer.from(stream, 'binary'));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Fallback to client routing
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}`);
});
