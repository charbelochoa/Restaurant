const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const crypto = require('crypto');
const dbPath = path.join(__dirname, 'restaurant.db');

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database:', err);
  } else {
    console.log('Database connected successfully.');
    initDb();
  }
});

function hashPin(pin) {
  return crypto.createHash('sha256').update(pin).digest('hex');
}

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function exec(sql) {
  return new Promise((resolve, reject) => {
    db.exec(sql, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

async function initDb() {
  await exec('PRAGMA foreign_keys = ON;');

  // Create tables
  await run(`CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    nombre TEXT NOT NULL,
    rol TEXT NOT NULL,
    pin TEXT NOT NULL
  )`);

  await run(`CREATE TABLE IF NOT EXISTS inventory (
    id TEXT PRIMARY KEY,
    nombre TEXT NOT NULL,
    cantidadActual REAL NOT NULL,
    unidad TEXT NOT NULL,
    stockMinimo REAL NOT NULL,
    costo REAL DEFAULT 0
  )`);

  await run(`CREATE TABLE IF NOT EXISTS menu (
    id TEXT PRIMARY KEY,
    nombre TEXT NOT NULL,
    precio REAL NOT NULL,
    categoria TEXT NOT NULL,
    favorito INTEGER DEFAULT 0,
    barcode TEXT,
    stockInsumos TEXT
  )`);

  await run(`CREATE TABLE IF NOT EXISTS tables (
    id TEXT PRIMARY KEY,
    numero INTEGER UNIQUE NOT NULL,
    capacidad INTEGER NOT NULL,
    estado TEXT NOT NULL,
    totalActual REAL DEFAULT 0,
    ordenId TEXT,
    abiertaEn INTEGER,
    personas INTEGER DEFAULT 0,
    cliente TEXT,
    telefono TEXT,
    notaCuenta TEXT,
    posX INTEGER DEFAULT 0,
    posY INTEGER DEFAULT 0,
    zona TEXT DEFAULT 'Salón'
  )`);

  try {
    await run('ALTER TABLE tables ADD COLUMN posX INTEGER DEFAULT 0');
  } catch (e) {}
  try {
    await run('ALTER TABLE tables ADD COLUMN posY INTEGER DEFAULT 0');
  } catch (e) {}
  try {
    await run("ALTER TABLE tables ADD COLUMN zona TEXT DEFAULT 'Salón'");
  } catch (e) {}

  await run(`CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    mesaId TEXT NOT NULL,
    bruto REAL NOT NULL,
    descuentoProducto REAL DEFAULT 0,
    descuentoGeneral REAL DEFAULT 0,
    descuentoPorcentaje REAL DEFAULT 0,
    subtotal REAL NOT NULL,
    impuestos REAL NOT NULL,
    propina REAL DEFAULT 0,
    cargo REAL DEFAULT 0,
    cargoPorcentaje REAL DEFAULT 0,
    total REAL NOT NULL,
    estado TEXT NOT NULL,
    timestamp INTEGER NOT NULL,
    preparado INTEGER DEFAULT 0,
    listoEn INTEGER,
    cerradoEn INTEGER,
    meseroId TEXT NOT NULL,
    cajeroId TEXT,
    cliente TEXT,
    personas INTEGER DEFAULT 0,
    notaCuenta TEXT,
    metodoPago TEXT,
    cierreId TEXT,
    items TEXT NOT NULL
  )`);

  // Updated closures to record blind counts (counted cash vs calculated cash difference)
  await run(`CREATE TABLE IF NOT EXISTS closures (
    id TEXT PRIMARY KEY,
    usuarioId TEXT NOT NULL,
    timestamp INTEGER NOT NULL,
    total REAL NOT NULL,
    ordenes INTEGER NOT NULL,
    efectivo REAL DEFAULT 0,
    tarjeta REAL DEFAULT 0,
    puntos REAL DEFAULT 0,
    efectivoContado REAL DEFAULT 0,
    diferencia REAL DEFAULT 0
  )`);

  await run(`CREATE TABLE IF NOT EXISTS kitchen_messages (
    id TEXT PRIMARY KEY,
    texto TEXT NOT NULL,
    usuario TEXT NOT NULL,
    timestamp INTEGER NOT NULL,
    estado TEXT NOT NULL
  )`);

  await run(`CREATE TABLE IF NOT EXISTS hold_tickets (
    id TEXT PRIMARY KEY,
    mesaId TEXT NOT NULL,
    items TEXT NOT NULL,
    tipPercent REAL DEFAULT 10,
    discountPercent REAL DEFAULT 0,
    serviceChargePercent REAL DEFAULT 0,
    timestamp INTEGER NOT NULL
  )`);

  // Updated drawer_logs to record transaction detail (withdrawals support)
  await run(`CREATE TABLE IF NOT EXISTS drawer_logs (
    id TEXT PRIMARY KEY,
    usuarioId TEXT NOT NULL,
    tipo TEXT NOT NULL,
    monto REAL DEFAULT 0,
    motivo TEXT,
    timestamp INTEGER NOT NULL
  )`);

  await run(`CREATE TABLE IF NOT EXISTS restaurant_config (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )`);

  // Professional audit logs
  await run(`CREATE TABLE IF NOT EXISTS audit_logs (
    id TEXT PRIMARY KEY,
    usuarioId TEXT NOT NULL,
    usuarioNombre TEXT NOT NULL,
    accion TEXT NOT NULL,
    detalles TEXT,
    timestamp INTEGER NOT NULL
  )`);

  // Purchases management (recalculating weighted average cost)
  await run(`CREATE TABLE IF NOT EXISTS purchases (
    id TEXT PRIMARY KEY,
    insumoId TEXT NOT NULL,
    cantidad REAL NOT NULL,
    costoUnitario REAL NOT NULL,
    proveedor TEXT,
    timestamp INTEGER NOT NULL
  )`);

  // Mermas management (inventory leaks / waste control)
  await run(`CREATE TABLE IF NOT EXISTS mermas (
    id TEXT PRIMARY KEY,
    insumoId TEXT NOT NULL,
    cantidad REAL NOT NULL,
    motivo TEXT NOT NULL,
    usuarioId TEXT NOT NULL,
    timestamp INTEGER NOT NULL
  )`);

  // Local CRM Customers management
  await run(`CREATE TABLE IF NOT EXISTS customers (
    id TEXT PRIMARY KEY,
    nombre TEXT NOT NULL,
    telefono TEXT,
    rfc TEXT,
    direccion TEXT,
    descuento REAL DEFAULT 0,
    timestamp INTEGER NOT NULL
  )`);

  // Seed default data if users table is empty
  const userCount = await get('SELECT COUNT(*) as count FROM users');
  if (userCount.count === 0) {
    console.log('Seeding initial data into database...');
    
    const defaultUsers = [
      { id: "usr-admin", nombre: "Admin General", rol: "admin", pin: "0000" },
      { id: "usr-mesero", nombre: "Ana Mesas", rol: "mesero", pin: "1111" },
      { id: "usr-cajero", nombre: "Luis Caja", rol: "cajero", pin: "2222" },
      { id: "usr-cocina", nombre: "Mar Cocina", rol: "cocina", pin: "3333" }
    ];
    for (const u of defaultUsers) {
      await run('INSERT INTO users (id, nombre, rol, pin) VALUES (?, ?, ?, ?)', [u.id, u.nombre, u.rol, hashPin(u.pin)]);
    }

    const defaultInventory = [
      { id: "ins-tortilla", nombre: "Tortilla de maíz", cantidadActual: 240, unidad: "pza", stockMinimo: 80, costo: 0.5 },
      { id: "ins-aguacate", nombre: "Aguacate", cantidadActual: 24, unidad: "kg", stockMinimo: 8, costo: 60 },
      { id: "ins-pollo", nombre: "Pollo", cantidadActual: 35, unidad: "kg", stockMinimo: 12, costo: 80 },
      { id: "ins-res", nombre: "Carne de res", cantidadActual: 28, unidad: "kg", stockMinimo: 10, costo: 150 },
      { id: "ins-pan", nombre: "Pan artesanal", cantidadActual: 72, unidad: "pza", stockMinimo: 24, costo: 5 },
      { id: "ins-queso", nombre: "Queso", cantidadActual: 16, unidad: "kg", stockMinimo: 6, costo: 120 },
      { id: "ins-papa", nombre: "Papa", cantidadActual: 50, unidad: "kg", stockMinimo: 18, costo: 25 },
      { id: "ins-arroz", nombre: "Arroz", cantidadActual: 32, unidad: "kg", stockMinimo: 10, costo: 20 },
      { id: "ins-lechuga", nombre: "Lechuga", cantidadActual: 19, unidad: "kg", stockMinimo: 8, costo: 30 },
      { id: "ins-jitomate", nombre: "Jitomate", cantidadActual: 22, unidad: "kg", stockMinimo: 9, costo: 35 },
      { id: "ins-cafe", nombre: "Café", cantidadActual: 9, unidad: "kg", stockMinimo: 5, costo: 250 },
      { id: "ins-limon", nombre: "Limón", cantidadActual: 14, unidad: "kg", stockMinimo: 7, costo: 40 },
      { id: "ins-azucar", nombre: "Azúcar", cantidadActual: 18, unidad: "kg", stockMinimo: 8, costo: 28 },
      { id: "ins-chocolate", nombre: "Chocolate", cantidadActual: 6, unidad: "kg", stockMinimo: 3, costo: 180 },
      { id: "ins-harina", nombre: "Harina", cantidadActual: 25, unidad: "kg", stockMinimo: 9, costo: 18 },
      { id: "ins-fruta", nombre: "Fruta fresca", cantidadActual: 12, unidad: "kg", stockMinimo: 6, costo: 50 },
      { id: "ins-pasta", nombre: "Pasta seca", cantidadActual: 22, unidad: "kg", stockMinimo: 7, costo: 30 },
      { id: "ins-salsa", nombre: "Salsas base", cantidadActual: 18, unidad: "kg", stockMinimo: 6, costo: 40 },
      { id: "ins-tocino", nombre: "Tocino", cantidadActual: 9, unidad: "kg", stockMinimo: 4, costo: 160 },
      { id: "ins-alitas", nombre: "Alitas de pollo", cantidadActual: 30, unidad: "kg", stockMinimo: 10, costo: 90 },
      { id: "ins-refresco", nombre: "Refresco", cantidadActual: 96, unidad: "pza", stockMinimo: 36, costo: 15 }
    ];
    for (const item of defaultInventory) {
      await run('INSERT INTO inventory (id, nombre, cantidadActual, unidad, stockMinimo, costo) VALUES (?, ?, ?, ?, ?, ?)', 
        [item.id, item.nombre, item.cantidadActual, item.unidad, item.stockMinimo, item.costo]);
    }

    const defaultMenu = [
      { id: "prod-guacamole", nombre: "Guacamole de la casa", precio: 135, categoria: "entradas", stockInsumos: { "ins-aguacate": 0.35, "ins-tortilla": 8, "ins-jitomate": 0.08, "ins-limon": 0.04 } },
      { id: "prod-papas", nombre: "Papas trufadas", precio: 115, categoria: "entradas", stockInsumos: { "ins-papa": 0.45, "ins-queso": 0.05 } },
      { id: "prod-tacos", nombre: "Tacos de rib eye", precio: 178, categoria: "fuertes", stockInsumos: { "ins-res": 0.28, "ins-tortilla": 4, "ins-aguacate": 0.08, "ins-limon": 0.03 } },
      { id: "prod-pollo", nombre: "Pollo brasa urbana", precio: 196, categoria: "fuertes", stockInsumos: { "ins-pollo": 0.45, "ins-papa": 0.22, "ins-lechuga": 0.06 } },
      { id: "prod-burger", nombre: "Burger ahumada", precio: 185, categoria: "fuertes", stockInsumos: { "ins-res": 0.22, "ins-pan": 1, "ins-queso": 0.08, "ins-jitomate": 0.05, "ins-lechuga": 0.03 } },
      { id: "prod-risotto", nombre: "Risotto norteño", precio: 164, categoria: "fuertes", stockInsumos: { "ins-arroz": 0.24, "ins-queso": 0.06, "ins-pollo": 0.12 } },
      { id: "prod-ensalada", nombre: "Ensalada mineral", precio: 128, categoria: "entradas", stockInsumos: { "ins-lechuga": 0.22, "ins-jitomate": 0.12, "ins-aguacate": 0.08, "ins-limon": 0.03 } },
      { id: "prod-cafe", nombre: "Café espresso doble", precio: 58, categoria: "bebidas", stockInsumos: { "ins-cafe": 0.02, "ins-azucar": 0.01 } },
      { id: "prod-limonada", nombre: "Limonada mineral", precio: 64, categoria: "bebidas", stockInsumos: { "ins-limon": 0.16, "ins-azucar": 0.04 } },
      { id: "prod-tefrio", nombre: "Té frío de frutas", precio: 72, categoria: "bebidas", stockInsumos: { "ins-fruta": 0.12, "ins-azucar": 0.03, "ins-limon": 0.02 } },
      { id: "prod-brownie", nombre: "Brownie tibio", precio: 98, categoria: "postres", stockInsumos: { "ins-chocolate": 0.11, "ins-harina": 0.08, "ins-azucar": 0.06 } },
      { id: "prod-tarta", nombre: "Tarta de temporada", precio: 104, categoria: "postres", stockInsumos: { "ins-fruta": 0.18, "ins-harina": 0.09, "ins-azucar": 0.05 } },
      { id: "prod-boneless", nombre: "Boneless", precio: 149, categoria: "entradas", favorito: true, barcode: "7501001", stockInsumos: { "ins-pollo": 0.32, "ins-salsa": 0.08, "ins-harina": 0.05 } },
      { id: "prod-aros", nombre: "Aros de cebolla", precio: 96, categoria: "entradas", barcode: "7501002", stockInsumos: { "ins-harina": 0.08, "ins-salsa": 0.03 } },
      { id: "prod-mozzarella", nombre: "Mozzarella sticks", precio: 124, categoria: "entradas", barcode: "7501003", stockInsumos: { "ins-queso": 0.22, "ins-harina": 0.05, "ins-salsa": 0.03 } },
      { id: "prod-nachos", nombre: "Nachos", precio: 132, categoria: "entradas", favorito: true, barcode: "7501004", stockInsumos: { "ins-tortilla": 12, "ins-queso": 0.14, "ins-jitomate": 0.07 } },
      { id: "prod-alitas", nombre: "Alitas 8 pza", precio: 168, categoria: "parrilla", favorito: true, barcode: "7501005", stockInsumos: { "ins-alitas": 0.48, "ins-salsa": 0.09, "ins-papa": 0.12 } },
      { id: "prod-mini-burgers", nombre: "Mini burgers", precio: 158, categoria: "burgers", favorito: true, barcode: "7501006", stockInsumos: { "ins-res": 0.18, "ins-pan": 3, "ins-queso": 0.09, "ins-tocino": 0.04 } },
      { id: "prod-burger-clasica", nombre: "Burger clasica", precio: 162, categoria: "burgers", barcode: "7501007", stockInsumos: { "ins-res": 0.22, "ins-pan": 1, "ins-queso": 0.06, "ins-lechuga": 0.03 } },
      { id: "prod-pasta-alfredo", nombre: "Pasta Alfredo", precio: 148, categoria: "pastas", barcode: "7501008", stockInsumos: { "ins-pasta": 0.22, "ins-queso": 0.09, "ins-pollo": 0.12 } },
      { id: "prod-pasta-arrabiata", nombre: "Pasta arrabiata", precio: 136, categoria: "pastas", barcode: "7501009", stockInsumos: { "ins-pasta": 0.22, "ins-jitomate": 0.14, "ins-salsa": 0.06 } },
      { id: "prod-pizza-margarita", nombre: "Pizza margarita", precio: 189, categoria: "pizzas", favorito: true, barcode: "7501010", stockInsumos: { "ins-harina": 0.32, "ins-queso": 0.22, "ins-jitomate": 0.18 } },
      { id: "prod-pizza-pepperoni", nombre: "Pizza pepperoni", precio: 205, categoria: "pizzas", barcode: "7501011", stockInsumos: { "ins-harina": 0.32, "ins-queso": 0.24, "ins-tocino": 0.08 } },
      { id: "prod-corte", nombre: "Corte la parrilla", precio: 285, categoria: "parrilla", barcode: "7501012", stockInsumos: { "ins-res": 0.42, "ins-papa": 0.24, "ins-lechuga": 0.06 } },
      { id: "prod-flan", nombre: "Flan de casa", precio: 86, categoria: "postres", barcode: "7501013", stockInsumos: { "ins-azucar": 0.08, "ins-harina": 0.04 } },
      { id: "prod-margarita", nombre: "Margarita", precio: 118, categoria: "cocktails", favorito: true, barcode: "7501014", stockInsumos: { "ins-limon": 0.12, "ins-azucar": 0.03 } },
      { id: "prod-mojito", nombre: "Mojito", precio: 112, categoria: "cocktails", barcode: "7501015", stockInsumos: { "ins-limon": 0.1, "ins-azucar": 0.04 } },
      { id: "prod-refresco", nombre: "Refresco", precio: 48, categoria: "bebidas", barcode: "7501016", stockInsumos: { "ins-refresco": 1 } },
      { id: "prod-salsa-macha", nombre: "Mod. salsa macha", precio: 18, categoria: "salsas", barcode: "7501017", stockInsumos: { "ins-salsa": 0.04 } },
      { id: "prod-salsa-verde", nombre: "Mod. salsa verde", precio: 14, categoria: "salsas", barcode: "7501018", stockInsumos: { "ins-salsa": 0.04 } },
      { id: "prod-extra-queso", nombre: "Aderezo extra queso", precio: 22, categoria: "aderezos", barcode: "7501019", stockInsumos: { "ins-queso": 0.06 } },
      { id: "prod-ranch", nombre: "Aderezo ranch", precio: 18, categoria: "aderezos", barcode: "7501020", stockInsumos: { "ins-salsa": 0.04 } },
      { id: "prod-sin-cebolla", nombre: "Mod. sin cebolla", precio: 0, categoria: "mod_alimentos", barcode: "7501021", stockInsumos: {} },
      { id: "prod-termino-medio", nombre: "Mod. termino medio", precio: 0, categoria: "mod_alimentos", barcode: "7501022", stockInsumos: {} },
      { id: "prod-servicio", nombre: "Cargo servicio", precio: 25, categoria: "otros", barcode: "7501023", stockInsumos: {} }
    ];
    for (const p of defaultMenu) {
      await run('INSERT INTO menu (id, nombre, precio, categoria, favorito, barcode, stockInsumos) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [p.id, p.nombre, p.precio, p.categoria, p.favorito ? 1 : 0, p.barcode || null, JSON.stringify(p.stockInsumos)]);
    }

    for (let i = 1; i <= 12; i++) {
      const capacidad = i % 4 === 0 ? 6 : i % 3 === 0 ? 2 : 4;
      const zona = i <= 6 ? 'Salón' : (i <= 10 ? 'Terraza' : 'VIP');
      await run('INSERT INTO tables (id, numero, capacidad, estado, zona) VALUES (?, ?, ?, ?, ?)',
        ['mesa-' + i, i, capacidad, 'libre', zona]);
    }

    const defaultPrinterMap = {
      entradas: "Cocina",
      fuertes: "Cocina",
      parrilla: "Cocina",
      burgers: "Cocina",
      pastas: "Cocina",
      pizzas: "Cocina",
      postres: "Cocina",
      bebidas: "Barra",
      cocktails: "Barra",
      salsas: "Cocina",
      aderezos: "Cocina",
      otros: "Caja"
    };

    const defaultConfig = {
      nombre: "Restaurant OS",
      direccion: "Calle de la Gastronomía 789",
      rfc: "ROS-260527-MIT",
      telefono: "555-0199",
      mensajeEncabezado: "Terminal de Venta Local",
      mensajePie: "¡Gracias por su visita! Recibo sin valor fiscal.",
      ivaPorcentaje: 16,
      moneda: "MXN",
      simboloMoneda: "$",
      cajaLimiteEfectivo: 5000,
      logoUrl: "",
      printer_map: JSON.stringify(defaultPrinterMap)
    };
    for (const [key, value] of Object.entries(defaultConfig)) {
      await run('INSERT INTO restaurant_config (key, value) VALUES (?, ?)', [key, String(value)]);
    }

    // Seed default customers in local CRM
    const defaultCustomers = [
      { id: "cli-1", nombre: "Juan Pérez (VIP)", telefono: "555-0101", rfc: "PEPJ-800101-XXX", direccion: "Av. Reforma 100", descuento: 10, timestamp: Date.now() },
      { id: "cli-2", nombre: "María Gómez", telefono: "555-0102", rfc: "GOMM-850202-YYY", direccion: "Calle Benito Juárez 45", descuento: 0, timestamp: Date.now() }
    ];
    for (const c of defaultCustomers) {
      await run('INSERT INTO customers (id, nombre, telefono, rfc, direccion, descuento, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [c.id, c.nombre, c.telefono, c.rfc, c.direccion, c.descuento, c.timestamp]);
    }
  }
}

module.exports = {
  run,
  all,
  get,
  exec,
  hashPin
};
