/* =====================================================================
   db.js — ElectroStock
   ---------------------------------------------------------------------
   "Base de datos" local de DEMOSTRACIÓN. Sustituye por completo a los
   antiguos endpoints api_*.php y a las llamadas directas a Supabase.
   Todo se guarda en localStorage del navegador (persiste al recargar,
   se borra si limpias datos del navegador o usas otra máquina).

   CUANDO EL EQUIPO TENGA SU BACKEND REAL:
   No hace falta tocar los HTML. Solo hay que reescribir las funciones
   de este archivo (apiInventarioLocal, apiProcesarVenta, etc.) para que
   en vez de leer/escribir localStorage, hagan fetch() a su API real.
   El "contrato" (qué recibe y qué regresa cada función) ya está definido
   abajo para que la migración sea directa.
   ===================================================================== */

const DB = {
    PRODUCTOS: 'es_productos',
    INVENTARIO: 'es_inventario_nodos',
    MOVIMIENTOS: 'es_movimientos',
    PRESTAMOS: 'es_prestamos',
    USUARIOS: 'es_usuarios',
    FOLIOS: 'es_folios',
    VENTAS_PENDIENTES_MATRIZ: 'es_ventas_pendientes_matriz',
    ENTRADAS_PENDIENTES_MATRIZ: 'es_entradas_pendientes_matriz',
    RED_CACHE: 'es_red_cache',
    PRESTAMOS_RED: 'es_prestamos_red',
    PRESTAMOS_RED_CACHE: 'es_prestamos_red_cache',
    CATALOGO_TS: 'es_catalogo_ts',
    RED_NODOS: 'es_red_nodos'
};

// Estructura fija de la red: 9 equipos, el equipo 4 es la Matriz/Central
const SUCURSALES_RED = [
    { id: 1, nombre: 'Sucursal Norte' },
    { id: 2, nombre: 'Sucursal Sur' },
    { id: 3, nombre: 'Sucursal Centro' },
    { id: 4, nombre: 'Matriz / Central' },
    { id: 5, nombre: 'Sucursal Poniente' },
    { id: 6, nombre: 'Sucursal Oriente' },
    { id: 7, nombre: 'Sucursal Express' },
    { id: 8, nombre: 'Sucursal Plaza' },
    { id: 9, nombre: 'Sucursal Satélite' }
];

function _leer(key, porDefecto) {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : porDefecto;
}
function _guardar(key, valor) { localStorage.setItem(key, JSON.stringify(valor)); }
function _nuevoId(lista, campo) {
    return lista.length ? Math.max(...lista.map(x => x[campo] || 0)) + 1 : 1;
}
function _folio(prefijo) {
    const contadores = _leer(DB.FOLIOS, {});
    contadores[prefijo] = (contadores[prefijo] || 0) + 1;
    _guardar(DB.FOLIOS, contadores);
    return `${prefijo}-${String(contadores[prefijo]).padStart(4, '0')}`;
}

/* ---------------------------------------------------------------------
   CATÁLOGO BASE = los productos reales de la Matriz (ITCV).
   Sirve para trabajar sin conexión; en cuanto hay conexión, el catálogo
   oficial (GET /api/catalogo) lo reemplaza.
   Solo HDMI123 (id 1) y ESP32 (id 2) tienen id_producto confirmado en el
   documento de la Matriz. Los demás reciben su id real al sincronizar el
   catálogo: así nunca se registra una venta/préstamo con un id inventado.
   --------------------------------------------------------------------- */
const _CATALOGO_BASE = [
    { id_producto: 1, sku_id: 'HDMI123',  nombre_pieza: 'Cable HDMI 2m',                                  marca: 'Matriz', precio_lista_sugerido: 150.00, stock_minimo_alerta: 5 },
    { id_producto: 2, sku_id: 'ESP32',    nombre_pieza: 'Microcontrolador ESP32',                         marca: 'Matriz', precio_lista_sugerido: 180.00, stock_minimo_alerta: 5 },
    {                 sku_id: 'ARD001',   nombre_pieza: 'Arduino Uno R3',                                 marca: 'Matriz', precio_lista_sugerido: 250.00, stock_minimo_alerta: 5 },
    {                 sku_id: 'RES10K',   nombre_pieza: 'Paquete Resistencias 10k ohm (100pcs)',          marca: 'Matriz', precio_lista_sugerido: 35.00,  stock_minimo_alerta: 5 },
    {                 sku_id: 'LED5MM',   nombre_pieza: 'Paquete LEDs 5mm Colores Surtidos (50pcs)',      marca: 'Matriz', precio_lista_sugerido: 45.00,  stock_minimo_alerta: 5 },
    {                 sku_id: 'PROTO830', nombre_pieza: 'Protoboard 830 puntos',                          marca: 'Matriz', precio_lista_sugerido: 85.00,  stock_minimo_alerta: 5 },
    {                 sku_id: 'MTSG90',   nombre_pieza: 'Micro Servomotor SG90',                          marca: 'Matriz', precio_lista_sugerido: 65.00,  stock_minimo_alerta: 5 }
];

// Stock de ejemplo del Almacén Matriz (solo para modo sin conexión; se sobrescribe al sincronizar).
const _STOCK_MATRIZ_DEMO = { HDMI123: 1949, ESP32: 645, ARD001: 190, RES10K: 290, LED5MM: 0, PROTO830: 40, MTSG90: 20 };

function _inventarioDemo(productos) {
    const yo = Number(SUCURSAL_ACTUAL.id);
    const filas = [];
    productos.forEach(p => {
        SUCURSALES_RED.forEach(s => {
            if (s.id === 4) filas.push({ sku_id: p.sku_id, id_sucursal: 4, cantidad_actual: _STOCK_MATRIZ_DEMO[p.sku_id] ?? 50 });
            // Tu sucursal parte en 0 (marcado "demo"): tu stock real llega al sincronizar con la Matriz.
            else if (s.id === yo) filas.push({ sku_id: p.sku_id, id_sucursal: s.id, cantidad_actual: 0, demo: true });
            else filas.push({ sku_id: p.sku_id, id_sucursal: s.id, cantidad_actual: Math.floor(Math.random() * 25) });
        });
    });
    return filas;
}

// Quien ya tenía el catálogo de ejemplo anterior (ELC-xxx) pasa al catálogo real sin perder ventas/movimientos.
function _migrarCatalogoDemo() {
    const prods = _leer(DB.PRODUCTOS, null);
    if (!prods || !prods.length) return;
    const soloElc = prods.every(p => /^ELC-/.test(p.sku_id));
    const hayElc = prods.some(p => /^ELC-/.test(p.sku_id));
    let inv = _leer(DB.INVENTARIO, []);
    if (soloElc) {
        _guardar(DB.PRODUCTOS, _CATALOGO_BASE.map(p => ({ ...p })));
        inv = inv.filter(r => !/^ELC-/.test(r.sku_id)).concat(_inventarioDemo(_CATALOGO_BASE));
        _guardar(DB.INVENTARIO, inv);
        _guardar(DB.RED_CACHE, {});
    } else if (!hayElc && inv.some(r => /^ELC-/.test(r.sku_id))) {
        // catálogo real ya sincronizado: se limpian filas huérfanas que se veían como "N/A"
        _guardar(DB.INVENTARIO, inv.filter(r => !/^ELC-/.test(r.sku_id)));
    }
}

function _inicializarDB() {
    if (!localStorage.getItem(DB.PRODUCTOS)) _guardar(DB.PRODUCTOS, _CATALOGO_BASE.map(p => ({ ...p })));
    if (!localStorage.getItem(DB.INVENTARIO)) _guardar(DB.INVENTARIO, _inventarioDemo(_leer(DB.PRODUCTOS, [])));
    _migrarCatalogoDemo();

    if (!localStorage.getItem(DB.MOVIMIENTOS)) _guardar(DB.MOVIMIENTOS, []);
    if (!localStorage.getItem(DB.PRESTAMOS)) _guardar(DB.PRESTAMOS, []);
    if (!localStorage.getItem(DB.USUARIOS)) {
        _guardar(DB.USUARIOS, [
            { id: 1, username: 'admin.central', rol: 'root' },
            { id: 2, username: 'cajero.sucursal', rol: 'cajero' }
        ]);
    }
}
_inicializarDB();

/* ---------------------------------------------------------------------
   PRODUCTOS / INVENTARIO
   --------------------------------------------------------------------- */
function apiProductos() { return _leer(DB.PRODUCTOS, []); }

function apiInventarioLocal(idSucursal) {
    const dictProd = {};
    apiProductos().forEach(p => dictProd[p.sku_id] = p);
    return _leer(DB.INVENTARIO, [])
        .filter(r => r.id_sucursal === idSucursal)
        .map(r => ({ sku_id: r.sku_id, cantidad_actual: r.cantidad_actual, productos: dictProd[r.sku_id] || {} }));
}

// Igual que apiInventarioLocal pero expone todos los nodos de la red (para cotizador/consultas cruzadas)
function apiInventarioRed() { return _leer(DB.INVENTARIO, []); }

function apiStockDisponibleEnRed(sku, excluirSucursal) {
    return _leer(DB.INVENTARIO, [])
        .filter(r => r.sku_id === sku && r.cantidad_actual > 0 && r.id_sucursal != excluirSucursal)
        .map(r => ({ id_sucursal: r.id_sucursal, cantidad_actual: r.cantidad_actual }));
}

function _ajustarStock(idSucursal, sku, delta) {
    const inv = _leer(DB.INVENTARIO, []);
    const registro = inv.find(r => r.id_sucursal === idSucursal && r.sku_id === sku);
    if (registro) {
        registro.cantidad_actual = Math.max(0, registro.cantidad_actual + delta);
        delete registro.demo;
    } else {
        inv.push({ sku_id: sku, id_sucursal: idSucursal, cantidad_actual: Math.max(0, delta) });
    }
    _guardar(DB.INVENTARIO, inv);
}

function _registrarMovimiento(datos) {
    const movs = _leer(DB.MOVIMIENTOS, []);
    movs.push({
        id_movimiento: _nuevoId(movs, 'id_movimiento'),
        fecha_movimiento: new Date().toISOString(),
        ...datos
    });
    _guardar(DB.MOVIMIENTOS, movs);
}

/* ---------------------------------------------------------------------
   VENTA
   --------------------------------------------------------------------- */
function _apiProcesarVentaLocalImpl(idSucursal, cajero, items) {
    for (const item of items) {
        const inv = _leer(DB.INVENTARIO, []);
        const registro = inv.find(r => r.id_sucursal === idSucursal && r.sku_id === item.sku);
        if (!registro || registro.cantidad_actual < item.cantidad) {
            return { error: true, mensaje: `No hay existencia suficiente de ${item.sku} en esta sucursal.` };
        }
    }
    const folio = _folio('VENTA');
    items.forEach(item => {
        _ajustarStock(idSucursal, item.sku, -item.cantidad);
        _registrarMovimiento({
            id_sucursal: idSucursal, sku_id: item.sku, cantidad: item.cantidad,
            tipo_movimiento: 'VENTA', folio_referencia: folio,
            descripcion: `Venta procesada por ${cajero}`
        });
    });
    return { error: false, folio };
}

/* ---------------------------------------------------------------------
   PRÉSTAMOS ENTRE SUCURSALES
   --------------------------------------------------------------------- */
function apiSolicitarPrestamo(sku, cantidad, sucursalSolicitante, sucursalPrestadora) {
    const prestamos = _leer(DB.PRESTAMOS, []);
    const folio = _folio('PRE');
    prestamos.push({
        id_prestamo: _nuevoId(prestamos, 'id_prestamo'),
        folio, sku_id: sku, cantidad,
        sucursal_solicitante: sucursalSolicitante,
        sucursal_prestadora: sucursalPrestadora,
        estado: 'PENDIENTE',
        fecha_solicitud: new Date().toISOString()
    });
    _guardar(DB.PRESTAMOS, prestamos);
    return { error: false, folio };
}

function apiPrestamosActivos(idSucursal) {
    const productos = {}; apiProductos().forEach(p => productos[p.sku_id] = p);
    const prestamos = _leer(DB.PRESTAMOS, []).map(p => ({ ...p, productos: productos[p.sku_id] || {} }));
    return {
        mis_deudas: prestamos.filter(p => p.sucursal_solicitante === idSucursal),
        me_deben: prestamos.filter(p => p.sucursal_prestadora === idSucursal)
    };
}

function apiResponderPrestamo(idPrestamo, accion, cantidadExtra) {
    const prestamos = _leer(DB.PRESTAMOS, []);
    const p = prestamos.find(x => x.id_prestamo === idPrestamo);
    if (!p) return { error: true, mensaje: 'Préstamo no encontrado.' };

    if (accion === 'ACEPTADO') p.estado = 'ACEPTADO';
    else if (accion === 'RECHAZADO') p.estado = 'RECHAZADO';
    else if (accion === 'CANCELADO') p.estado = 'CANCELADO';
    else if (accion === 'OFERTA') p.estado = `OFERTA (${cantidadExtra})`;
    else if (accion === 'ACEPTAR_OFERTA') { p.cantidad = parseInt(cantidadExtra); p.estado = 'ACEPTADO'; }
    else return { error: true, mensaje: 'Acción desconocida.' };

    _guardar(DB.PRESTAMOS, prestamos);
    return { error: false };
}

// El solicitante confirma que ya recibió físicamente la mercancía prestada:
// se suma a su inventario y queda formalmente "en deuda" con la prestadora.
function apiConfirmarRecepcion(idPrestamo) {
    const prestamos = _leer(DB.PRESTAMOS, []);
    const p = prestamos.find(x => x.id_prestamo === idPrestamo);
    if (!p) return { error: true, mensaje: 'Préstamo no encontrado.' };

    _ajustarStock(p.sucursal_prestadora, p.sku_id, -p.cantidad);
    _ajustarStock(p.sucursal_solicitante, p.sku_id, p.cantidad);
    p.estado = 'EN_DEUDA';
    _guardar(DB.PRESTAMOS, prestamos);
    return { error: false };
}

// El deudor paga la deuda con su propio stock: se descuenta de inmediato
// y queda "en tránsito" hasta que la prestadora confirme la devolución.
function apiPagarDeudaManual(idPrestamo) {
    const prestamos = _leer(DB.PRESTAMOS, []);
    const p = prestamos.find(x => x.id_prestamo === idPrestamo);
    if (!p) return { error: true, mensaje: 'Préstamo no encontrado.' };

    const inv = _leer(DB.INVENTARIO, []);
    const registro = inv.find(r => r.id_sucursal === p.sucursal_solicitante && r.sku_id === p.sku_id);
    if (!registro || registro.cantidad_actual < p.cantidad) {
        return { error: true, mensaje: 'No tienes stock suficiente para pagar esta deuda.' };
    }
    _ajustarStock(p.sucursal_solicitante, p.sku_id, -p.cantidad);
    p.estado = 'TRANSITO';
    _guardar(DB.PRESTAMOS, prestamos);
    return { error: false };
}

// La prestadora confirma que recibió de vuelta la mercancía prestada.
function apiRecibirDevolucion(idPrestamo) {
    const prestamos = _leer(DB.PRESTAMOS, []);
    const p = prestamos.find(x => x.id_prestamo === idPrestamo);
    if (!p) return { error: true, mensaje: 'Préstamo no encontrado.' };

    _ajustarStock(p.sucursal_prestadora, p.sku_id, p.cantidad);
    p.estado = 'COMPLETADO';
    _guardar(DB.PRESTAMOS, prestamos);
    return { error: false };
}

// Alias usado por venta.html al recibir stock ya aceptado por la prestadora
function apiRecibirStock(idPrestamo) { return apiConfirmarRecepcion(idPrestamo); }

/* ---------------------------------------------------------------------
   PEDIDOS A MATRIZ (reabastecimiento)
   --------------------------------------------------------------------- */
function apiProcesarPedido(idSucursal, items) {
    const folio = _folio('ORD-MATRIZ');
    items.forEach(item => {
        _registrarMovimiento({
            id_sucursal: idSucursal, sku_id: item.sku, cantidad: item.cantidad,
            tipo_movimiento: 'PENDIENTE', folio_referencia: folio,
            descripcion: 'Solicitud de reabastecimiento a Matriz'
        });
    });
    return { error: false, folio };
}

function apiRastreoMatriz(idSucursal) {
    return _leer(DB.MOVIMIENTOS, []).filter(m =>
        m.id_sucursal === idSucursal &&
        m.folio_referencia && m.folio_referencia.includes('ORD-MATRIZ') &&
        !(m.descripcion && m.descripcion.includes('[INGRESADO ALMACEN]'))
    );
}

function apiIngresarPedidoMatriz(idMovimiento) {
    const movs = _leer(DB.MOVIMIENTOS, []);
    const m = movs.find(x => x.id_movimiento === idMovimiento);
    if (!m) return { error: true, mensaje: 'Movimiento no encontrado.' };
    if (m.tipo_movimiento !== 'SALIDA') return { error: true, mensaje: 'La Matriz aún no ha surtido este pedido.' };

    _ajustarStock(m.id_sucursal, m.sku_id, m.cantidad);
    m.descripcion += ' [INGRESADO ALMACEN]';
    _guardar(DB.MOVIMIENTOS, movs);
    return { error: false };
}

// Para uso futuro del equipo 4 (Central): aprobar/surtir un pedido pendiente
function apiAprobarPedidoMatriz(idMovimiento) {
    const movs = _leer(DB.MOVIMIENTOS, []);
    const m = movs.find(x => x.id_movimiento === idMovimiento);
    if (!m) return { error: true, mensaje: 'Movimiento no encontrado.' };
    _ajustarStock(4, m.sku_id, -m.cantidad); // descuenta del almacén central (sucursal 4)
    m.tipo_movimiento = 'SALIDA';
    _guardar(DB.MOVIMIENTOS, movs);
    return { error: false };
}

function apiPedidosPendientesGlobal() {
    return _leer(DB.MOVIMIENTOS, []).filter(m => m.tipo_movimiento === 'PENDIENTE');
}

/* ---------------------------------------------------------------------
   USUARIOS (sin autenticación real, solo administración de la lista)
   --------------------------------------------------------------------- */
function apiUsuarios() { return _leer(DB.USUARIOS, []); }

function apiCrearUsuario(username, rol) {
    const usuarios = _leer(DB.USUARIOS, []);
    if (usuarios.some(u => u.username.toLowerCase() === username.toLowerCase())) {
        return { error: true, mensaje: 'Ese nombre de usuario ya existe.' };
    }
    usuarios.push({ id: _nuevoId(usuarios, 'id'), username, rol });
    _guardar(DB.USUARIOS, usuarios);
    return { error: false };
}

function apiEliminarUsuario(id) {
    let usuarios = _leer(DB.USUARIOS, []);
    usuarios = usuarios.filter(u => u.id !== id);
    _guardar(DB.USUARIOS, usuarios);
    return { error: false };
}

/* ---------------------------------------------------------------------
   REPORTES / AUDITORÍA
   --------------------------------------------------------------------- */
function apiReportes() { return _leer(DB.MOVIMIENTOS, []); }

/* =====================================================================
   CONEXIÓN REAL CON MATRIZ
   Contrato proporcionado por la práctica:
   Base: https://delicate-uphold-consumer.ngrok-free.dev
   Sucursal de este equipo: 7
   ===================================================================== */

const MATRIZ_API_BASE = 'https://delicate-uphold-consumer.ngrok-free.dev';

let MATRIZ_CONECTADA = false;
let MATRIZ_ULTIMA_SINCRONIZACION = null;

async function _fetchMatriz(endpoint, options = {}) {
    const url = `${MATRIZ_API_BASE}${endpoint}`;
    const config = {
        ...options,
        headers: {
            ...(options.headers || {}),
            'Accept': 'application/json',
            ...(String(options.method || 'GET').toUpperCase() === 'GET' ? { 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' } : {})
        }
    };
    if (config.body && typeof config.body !== 'string') {
        config.headers['Content-Type'] = 'application/json';
        config.body = JSON.stringify(config.body);
    }

    // ngrok (plan gratis) intercepta los GET del navegador con una página HTML de aviso (ERR_NGROK_6024).
    // Este header le dice que no la muestre. Si el servidor no lo permite en CORS, se reintenta sin él.
    let respuesta;
    try {
        respuesta = await fetch(url, { ...config, headers: { ...config.headers, 'ngrok-skip-browser-warning': 'true' } });
    } catch (e) {
        if (!(e instanceof TypeError)) throw e;
        respuesta = await fetch(url, config);
    }
    const texto = await respuesta.text();
    let data;
    try { data = texto ? JSON.parse(texto) : {}; }
    catch {
        // Una página HTML (aviso de ngrok, error del túnel...) NO es una respuesta válida de la API.
        if (/ERR_NGROK|<!DOCTYPE|<html/i.test(texto)) throw new Error('ERR_NGROK_6024: ngrok devolvió su página de aviso en lugar de JSON.');
        data = { error: texto || `HTTP ${respuesta.status}` };
    }

    if (!respuesta.ok) {
        throw new Error(data.error || data.mensaje || `HTTP ${respuesta.status}`);
    }
    MATRIZ_CONECTADA = true;
    return data;
}

function _normalizarCatalogoMatriz(data) {
    const lista = Array.isArray(data) ? data :
        data.productos || data.catalogo || data.data || data.resultados || [];
    return lista.map((p, index) => ({
        id_producto: Number(p.id_producto ?? p.id ?? p.producto_id ?? index + 1),
        sku_id: String(p.sku_id ?? p.sku ?? p.codigo ?? p.SKU ?? ''),
        nombre_pieza: p.nombre_pieza ?? p.nombre ?? p.descripcion ?? p.producto ?? 'Producto',
        marca: p.marca ?? p.fabricante ?? 'Matriz',
        precio_lista_sugerido: Number(p.precio_lista_sugerido ?? p.precio ?? p.precio_oficial ?? p.precio_base ?? 0),
        stock_minimo_alerta: Number(p.stock_minimo_alerta ?? p.stock_minimo ?? 1)
    })).filter(p => p.sku_id);
}

async function apiCatalogoMatriz(forzar = false) {
    // El catálogo casi no cambia: si se consultó hace menos de 60 s se reutiliza el guardado.
    // Así, al moverte entre pantallas no se le pega a la Matriz (ngrok compartido) en cada página.
    const guardado = _leer(DB.PRODUCTOS, []);
    const reciente = Date.now() - Number(_leer(DB.CATALOGO_TS, 0)) < 60000;
    if (!forzar && reciente && guardado.some(p => p.id_producto)) return guardado;

    const data = await _fetchMatriz('/api/catalogo');
    const productos = _normalizarCatalogoMatriz(data);
    if (productos.length) _guardar(DB.PRODUCTOS, productos);
    _guardar(DB.CATALOGO_TS, Date.now());
    MATRIZ_ULTIMA_SINCRONIZACION = new Date().toISOString();
    return productos;
}

async function apiInventarioGlobalMatriz(sku) {
    return await _fetchMatriz(`/api/inventario?sku=${encodeURIComponent(sku)}`);
}

// Nombres que el documento de la Matriz muestra de ejemplo (por si la respuesta no trae id numérico).
const _NOMBRES_SUCURSAL_CONOCIDOS = { 'almacen matriz': 4, 'matriz': 4, 'sucursal centro': 3, 'sucursal norte': 2 };

function _idSucursalFlexible(x) {
    for (const c of [x.id_sucursal, x.sucursal_id, x.idSucursal]) {
        if (c !== null && c !== undefined && c !== '' && Number.isFinite(Number(c))) return Number(c);
    }
    for (const c of [x.sucursal, x.nombre_sucursal, x.nombre]) {
        if (c === null || c === undefined || c === '') continue;
        const n = _idDesdeCampo(c);                       // 3, "3", "Sucursal 3", "Equipo 3", "Almacén Matriz"
        if (Number.isFinite(n)) return n;
        const k = String(c).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
        if (_NOMBRES_SUCURSAL_CONOCIDOS[k]) return _NOMBRES_SUCURSAL_CONOCIDOS[k];
    }
    return NaN;
}

// Saca la lista de sucursales de la respuesta, venga como venga:
// { disponibilidad: [...] }, un arreglo directo, { sucursales: [...] } o un mapa { "Sucursal 3": 5 }.
function _filasDisponibilidad(data) {
    if (Array.isArray(data)) return data;
    if (!data || typeof data !== 'object') return [];
    for (const k of ['disponibilidad', 'sucursales', 'inventario', 'existencias', 'resultados', 'data']) {
        if (Array.isArray(data[k])) return data[k];
    }
    const d = data.disponibilidad;
    if (d && typeof d === 'object') {
        return Object.entries(d).map(([k, v]) => (v && typeof v === 'object') ? { sucursal: k, ...v } : { sucursal: k, stock: v });
    }
    return [];
}

// ¿La respuesta trae una lista de disponibilidad (aunque esté vacía)? Si no, es un formato que no conozco.
function _disponibilidadReconocida(data) {
    if (Array.isArray(data)) return true;
    if (!data || typeof data !== 'object') return false;
    if (['disponibilidad', 'sucursales', 'inventario', 'existencias', 'resultados', 'data'].some(k => Array.isArray(data[k]))) return true;
    return !!(data.disponibilidad && typeof data.disponibilidad === 'object');
}

function _stockDesdeRespuestaMatriz(data, sku) {
    return _filasDisponibilidad(data)
        .map(x => {
            const nombreTexto = x.nombre_sucursal ?? (typeof x.sucursal === 'string' && !/^\d+$/.test(x.sucursal) ? x.sucursal : null);
            return {
                sku_id: sku,
                id_sucursal: _idSucursalFlexible(x),
                nombre_sucursal: nombreTexto,
                cantidad_actual: Number(x.stock ?? x.cantidad ?? x.cantidad_actual ?? x.existencia ?? x.disponible ?? 0)
            };
        })
        .filter(x => Number.isFinite(x.id_sucursal));
}

async function apiSincronizarMatriz() {
    const productos = await apiCatalogoMatriz(true);
    // Primero se reconcilian los préstamos (por si la Matriz ya autorizó alguno) y luego se baja el inventario real.
    try { await apiPrestamosRed(); } catch (e) { /* sin conexión: se sigue con el catálogo */ }
    const inventario = _leer(DB.INVENTARIO, []);

    // La API de inventario se consulta por SKU, tal como pide el documento.
    for (const p of productos) {
        try {
            const data = await apiInventarioGlobalMatriz(p.sku_id);
            const stocks = _stockDesdeRespuestaMatriz(data, p.sku_id);
            stocks.forEach(s => {
                const r = inventario.find(x => x.sku_id === s.sku_id && x.id_sucursal === s.id_sucursal);
                if (r) { r.cantidad_actual = s.cantidad_actual; delete r.demo; }
                else inventario.push({ sku_id: s.sku_id, id_sucursal: s.id_sucursal, cantidad_actual: s.cantidad_actual });
            });
        } catch (e) {
            console.warn(`No se pudo sincronizar inventario de ${p.sku_id}:`, e);
        }
    }
    _guardar(DB.INVENTARIO, inventario);
    MATRIZ_ULTIMA_SINCRONIZACION = new Date().toISOString();
    return { productos, inventario };
}

function _productoMatrizPorSku(sku) {
    return apiProductos().find(p => p.sku_id === sku);
}

// Acepta tanto un SKU ('ELC-001') como un id_producto numérico ya resuelto.
function _resolverIdProducto(skuOIdProducto) {
    if (typeof skuOIdProducto === 'number') return skuOIdProducto;
    const prod = _productoMatrizPorSku(skuOIdProducto);
    return prod?.id_producto ?? null;
}

// --- 3. Solicitar Traspaso de Mercancía --- POST /api/traslados
async function apiSolicitarTraspasoMatriz(idOrigen, idDestino, sku, cantidad) {
    const idProducto = _resolverIdProducto(sku);
    if (!idProducto) return { error: true, mensaje: `No se encontró el id_producto oficial de ${sku}. Sincroniza el catálogo.` };
    try {
        const data = await _fetchMatriz('/api/traslados', {
            method: 'POST',
            body: {
                id_sucursal_origen: Number(idOrigen),
                id_sucursal_destino: Number(idDestino),
                id_producto: Number(idProducto),
                cantidad: Number(cantidad)
            }
        });
        return { error: false, ...data };
    } catch (e) {
        MATRIZ_CONECTADA = false;
        return { error: true, mensaje: e.message };
    }
}

// --- 5. Reportar Venta al Público --- POST /api/ventas
async function apiReportarVentaMatriz(idSucursal, sku, cantidad, cliente = 'Público General') {
    const idProducto = _resolverIdProducto(sku);
    if (!idProducto) return { error: true, mensaje: `No existe id_producto oficial para ${sku}. Sincroniza el catálogo.` };
    try {
        const data = await _fetchMatriz('/api/ventas', {
            method: 'POST',
            body: {
                id_sucursal: Number(idSucursal),
                id_producto: Number(idProducto),
                cantidad: Number(cantidad),
                cliente: String(cliente)
            }
        });
        return { error: false, ...data };
    } catch (e) {
        MATRIZ_CONECTADA = false;
        return { error: true, mensaje: e.message };
    }
}

// --- 4. Historial de Traslados de mi sucursal --- GET /api/historial?sucursal=X
async function apiHistorialMatriz(idSucursal = SUCURSAL_ACTUAL.id) {
    try {
        return await _fetchMatriz(`/api/historial?sucursal=${Number(idSucursal)}`);
    } catch (e) {
        MATRIZ_CONECTADA = false;
        return { error: true, mensaje: e.message, historial: [] };
    }
}

// --- 6. Mis Ventas y Devoluciones --- GET /api/ventas?sucursal=X
async function apiMisVentasMatriz(idSucursal = SUCURSAL_ACTUAL.id) {
    try {
        return await _fetchMatriz(`/api/ventas?sucursal=${Number(idSucursal)}`);
    } catch (e) {
        MATRIZ_CONECTADA = false;
        return { error: true, mensaje: e.message };
    }
}

// --- 7. Reabastecer Inventario Local --- POST /api/entradas-inventario
async function apiEntradaInventarioMatriz(idSucursal, sku, cantidad, motivo = 'REABASTECIMIENTO LOCAL') {
    const idProducto = _resolverIdProducto(sku);
    if (!idProducto) return { error: true, mensaje: `No existe id_producto oficial para ${sku}. Sincroniza el catálogo.` };
    try {
        const data = await _fetchMatriz('/api/entradas-inventario', {
            method: 'POST',
            body: {
                id_sucursal: Number(idSucursal),
                id_producto: Number(idProducto),
                cantidad: Number(cantidad),
                motivo: String(motivo)
            }
        });
        return { error: false, ...data };
    } catch (e) {
        MATRIZ_CONECTADA = false;
        return { error: true, mensaje: e.message };
    }
}

// --- 8. Historial de Movimientos de Stock --- GET /api/movimientos?sucursal=X
async function apiMovimientosMatriz(idSucursal = SUCURSAL_ACTUAL.id) {
    try {
        return await _fetchMatriz(`/api/movimientos?sucursal=${Number(idSucursal)}`);
    } catch (e) {
        MATRIZ_CONECTADA = false;
        return { error: true, mensaje: e.message };
    }
}

// --- 9. Ganancias Globales --- GET /api/ganancias
async function apiGananciasMatriz() {
    try {
        return await _fetchMatriz('/api/ganancias');
    } catch (e) {
        MATRIZ_CONECTADA = false;
        return { error: true, mensaje: e.message };
    }
}

// --- 10. Registrar Préstamo entre Sucursales --- POST /api/prestamos
async function apiRegistrarPrestamoMatriz(idSucursalPresta, idSucursalRecibe, sku, cantidad) {
    const idProducto = _resolverIdProducto(sku);
    if (!idProducto) return { error: true, mensaje: `No existe id_producto oficial para ${sku}. Sincroniza el catálogo.` };
    try {
        const data = await _fetchMatriz('/api/prestamos', {
            method: 'POST',
            body: {
                id_sucursal_presta: Number(idSucursalPresta),
                id_sucursal_recibe: Number(idSucursalRecibe),
                id_producto: Number(idProducto),
                cantidad: Number(cantidad)
            }
        });
        return { error: false, ...data };
    } catch (e) {
        MATRIZ_CONECTADA = false;
        return { error: true, mensaje: e.message };
    }
}

// --- 11. Préstamos Activos (globales, según la Matriz) --- GET /api/prestamos/activos
async function apiPrestamosActivosMatriz() {
    try {
        return await _fetchMatriz('/api/prestamos/activos');
    } catch (e) {
        MATRIZ_CONECTADA = false;
        return { error: true, mensaje: e.message };
    }
}

// --- 12. Registrar Devolución de Material --- POST /api/devoluciones
async function apiDevolucionMatriz(idPrestamo) {
    try {
        const data = await _fetchMatriz('/api/devoluciones', {
            method: 'POST',
            body: { id_prestamo: Number(idPrestamo) }
        });
        return { error: false, ...data };
    } catch (e) {
        MATRIZ_CONECTADA = false;
        return { error: true, mensaje: e.message };
    }
}

// --- 13. Enviar Pago o Abono a la Matriz --- POST /api/pagos
async function apiEnviarPagoMatriz(idSucursal, monto, concepto = 'Abono general') {
    try {
        const data = await _fetchMatriz('/api/pagos', {
            method: 'POST',
            body: {
                id_sucursal: Number(idSucursal),
                monto: Number(monto),
                concepto: String(concepto)
            }
        });
        return { error: false, ...data };
    } catch (e) {
        MATRIZ_CONECTADA = false;
        return { error: true, mensaje: e.message };
    }
}

// --- 15. Confirmar Recepción de Envío --- POST /api/envios/actualizar
async function apiConfirmarEnvioMatriz(idEnvio, estado = 'ENTREGADO') {
    try {
        const data = await _fetchMatriz('/api/envios/actualizar', {
            method: 'POST',
            body: { id_envio: Number(idEnvio), estado: String(estado) }
        });
        return { error: false, ...data };
    } catch (e) {
        MATRIZ_CONECTADA = false;
        return { error: true, mensaje: e.message };
    }
}

function mostrarEstadoMatriz(elementId = 'estado-matriz') {
    const el = document.getElementById(elementId);
    if (!el) return;
    const fecha = MATRIZ_ULTIMA_SINCRONIZACION
        ? new Date(MATRIZ_ULTIMA_SINCRONIZACION).toLocaleTimeString('es-MX', {hour:'2-digit', minute:'2-digit'})
        : 'Sin sincronizar';
    el.innerHTML = MATRIZ_CONECTADA
        ? `<i class="fas fa-circle" style="color:var(--success);font-size:.55rem;"></i> Matriz conectada <small style="color:var(--text-muted);">(${fecha})</small>`
        : `<i class="fas fa-circle" style="color:var(--warning);font-size:.55rem;"></i> Matriz sin sincronizar`;
}

async function probarConexionMatriz() {
    try {
        await apiCatalogoMatriz(true);
        MATRIZ_CONECTADA = true;
        return { error: false };
    } catch (e) {
        MATRIZ_CONECTADA = false;
        return { error: true, mensaje: e.message };
    }
}

/* ---------------------------------------------------------------------
   Cola de reintentos: ventas que sí se cobraron y descontaron LOCALMENTE
   pero que no se pudieron avisar a la Matriz (sin internet, ngrok caído,
   etc.). Se guardan para reintentar sin perder la venta.
   --------------------------------------------------------------------- */
function _encolarVentaPendiente(idSucursal, sku, cantidad, folio) {
    const pendientes = _leer(DB.VENTAS_PENDIENTES_MATRIZ, []);
    pendientes.push({ idSucursal, sku, cantidad, folio, fecha: new Date().toISOString() });
    _guardar(DB.VENTAS_PENDIENTES_MATRIZ, pendientes);
}

async function apiReintentarVentasPendientesMatriz() {
    let pendientes = _leer(DB.VENTAS_PENDIENTES_MATRIZ, []);
    if (pendientes.length === 0) return { reintentadas: 0, restantes: 0 };

    const siguen = [];
    let ok = 0;
    for (const v of pendientes) {
        const r = await apiReportarVentaMatriz(v.idSucursal, v.sku, v.cantidad);
        if (!r.error) ok++;
        else siguen.push(v);
    }
    _guardar(DB.VENTAS_PENDIENTES_MATRIZ, siguen);
    return { reintentadas: ok, restantes: siguen.length };
}

/* Venta real: PRIMERO se descuenta el inventario LOCAL de tu tienda
   (esto es lo que el cajero necesita ver siempre, aunque la Matriz esté
   caída) y DESPUÉS, en segundo plano, se intenta avisar a la Matriz.
   Si el aviso a Matriz falla, la venta y el descuento de stock local
   NO se revierten: solo se guarda en una cola para reintentar después. */
const _apiProcesarVentaLocal = _apiProcesarVentaLocalImpl;
async function apiProcesarVenta(idSucursal, cajero, items) {
    const resultadoLocal = _apiProcesarVentaLocal(idSucursal, cajero, items);
    if (resultadoLocal.error) return resultadoLocal;

    let matriz = { ok: true };
    for (const item of items) {
        const r = await apiReportarVentaMatriz(idSucursal, item.sku, item.cantidad, cajero);
        if (r.error) {
            matriz = { ok: false, mensaje: r.mensaje };
            _encolarVentaPendiente(idSucursal, item.sku, item.cantidad, resultadoLocal.folio);
        }
    }

    return { ...resultadoLocal, matriz };
}

/* ---------------------------------------------------------------------
   COMPRA / REABASTECIMIENTO DIRECTO (entradas-inventario)
   Igual que la venta: primero se refleja en TU almacén local (es tu
   compra, tu tienda, no debe depender de la Matriz) y después se avisa
   a la Matriz en segundo plano, sin revertir el stock si eso falla.
   --------------------------------------------------------------------- */
function _apiReabastecerLocalImpl(idSucursal, items, motivo) {
    const folio = _folio('COMPRA');
    items.forEach(item => {
        if (Number(idSucursal) === Number(SUCURSAL_ACTUAL.id)) _asegurarFilaLocal(item.sku);
        _ajustarStock(idSucursal, item.sku, item.cantidad);
        _registrarMovimiento({
            id_sucursal: idSucursal, sku_id: item.sku, cantidad: item.cantidad,
            tipo_movimiento: 'ENTRADA', folio_referencia: folio,
            descripcion: motivo || 'Reabastecimiento / Compra directa'
        });
    });
    return { error: false, folio };
}

function _encolarEntradaPendiente(idSucursal, sku, cantidad, folio, motivo) {
    const pendientes = _leer(DB.ENTRADAS_PENDIENTES_MATRIZ, []);
    pendientes.push({ idSucursal, sku, cantidad, folio, motivo, fecha: new Date().toISOString() });
    _guardar(DB.ENTRADAS_PENDIENTES_MATRIZ, pendientes);
}

async function apiReintentarEntradasPendientesMatriz() {
    let pendientes = _leer(DB.ENTRADAS_PENDIENTES_MATRIZ, []);
    if (pendientes.length === 0) return { reintentadas: 0, restantes: 0 };

    const siguen = [];
    let ok = 0;
    for (const v of pendientes) {
        const r = await apiEntradaInventarioMatriz(v.idSucursal, v.sku, v.cantidad, v.motivo);
        if (!r.error) ok++;
        else siguen.push(v);
    }
    _guardar(DB.ENTRADAS_PENDIENTES_MATRIZ, siguen);
    return { reintentadas: ok, restantes: siguen.length };
}

/* Compra a Matriz = solicitud de traslado pendiente.
   Nunca se aumenta el inventario local hasta que Matriz autorice/surta y
   la sucursal confirme/descargue la recepción. */
async function apiComprarReabastecimiento(idSucursal, items, motivo = 'COMPRA A MATRIZ') {
    if (!Array.isArray(items) || !items.length) return { error: true, mensaje: 'Agrega al menos un producto a la solicitud.' };
    const resultados = [];
    for (const item of items) {
        const cantidad = Number(item.cantidad);
        if (!Number.isInteger(cantidad) || cantidad < 1) return { error: true, mensaje: 'Todas las cantidades deben ser números enteros mayores a cero.' };
        const r = await apiSolicitarTraspasoMatriz(4, idSucursal, item.sku, cantidad);
        if (r.error) return { error: true, mensaje: r.mensaje, resultados };
        resultados.push({ sku: item.sku, cantidad, ...r });
    }
    const local = apiProcesarPedido(idSucursal, items);
    // Complementa el registro local con el motivo elegido por el usuario.
    const movs = _leer(DB.MOVIMIENTOS, []);
    movs.filter(m => m.folio_referencia === local.folio).forEach(m => { m.descripcion = motivo || 'Solicitud de compra a Matriz'; });
    _guardar(DB.MOVIMIENTOS, movs);
    return { error: false, pendiente: true, folio: local.folio, resultados };
}
async function apiProcesarPedidoMatriz(idSucursal, items) {
    const resultados = [];
    for (const item of items) {
        const r = await apiSolicitarTraspasoMatriz(4, idSucursal, item.sku, item.cantidad);
        if (r.error) return { error: true, mensaje: r.mensaje, resultados };
        resultados.push({ sku: item.sku, cantidad: item.cantidad, ...r });
    }
    return { error: false, resultados };
}


/* =====================================================================
   CONSULTA DE RED + PRÉSTAMOS / DEVOLUCIONES REALES (vía Matriz)
   ---------------------------------------------------------------------
   - Inventario de Matriz y de otras sucursales: se arma consultando
     GET /api/inventario?sku=... por cada producto del catálogo.
   - Existencia de 1 o varios productos: recomienda la sucursal con más
     disponibilidad (sin contar la tuya ni la Matriz).
   - Préstamos: POST /api/prestamos, GET /api/prestamos/activos y
     POST /api/devoluciones.
   Si la Matriz no responde, se usan los últimos datos guardados (cache)
   o, en última instancia, los datos locales de demostración.
   ===================================================================== */

const MATRIZ_ID = 4;
const _redMemo = {};   // memoria de la sesión: evita saturar el ngrok (límite del plan gratis)

function _escHtml(t) {
    return String(t ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function _nombreNodo(id, nombreApi) {
    if (nombreApi) return String(nombreApi);
    return Number(id) === MATRIZ_ID ? 'Almacén Matriz' : `Sucursal ${id}`;
}

// ¿El error es de conexión (ngrok apagado / sin internet) o es una respuesta real de la Matriz?
function _esErrorDeRed(e) {
    const m = String(e && e.message || e || '');
    return (e instanceof TypeError) ||
        /ngrok|ERR_NGROK|<!DOCTYPE|<html|Failed to fetch|NetworkError|Load failed|HTTP (404|502|503|504)/i.test(m);
}

function _mensajeAmigable(e) {
    if (/ERR_NGROK_6024|página de aviso/i.test(String(e && e.message || e)))
        return 'ngrok bloqueó la consulta con su página de aviso. El equipo 4 debe permitir el header "ngrok-skip-browser-warning" en CORS (o iniciar ngrok con --request-header-add "ngrok-skip-browser-warning:1").';
    return _esErrorDeRed(e) ? 'La Matriz no responde (revisa que el servidor y el túnel ngrok del equipo 4 estén encendidos).'
                            : String(e && e.message || e);
}

async function _mapConLimite(lista, limite, fn) {
    const out = new Array(lista.length);
    let i = 0;
    const workers = Array.from({ length: Math.min(limite, lista.length) }, async () => {
        while (i < lista.length) { const k = i++; out[k] = await fn(lista[k]); }
    });
    await Promise.all(workers);
    return out;
}

function _filasLocalesSku(sku) {
    return _leer(DB.INVENTARIO, [])
        .filter(r => r.sku_id === sku)
        .map(r => ({ id_sucursal: Number(r.id_sucursal), nombre_sucursal: _nombreNodo(r.id_sucursal), stock: Number(r.cantidad_actual || 0) }));
}

/* Disponibilidad de UN producto en toda la red. */
async function apiRedDisponibilidadSku(sku, forzar = false) {
    const memo = _redMemo[sku];
    if (!forzar && memo && Date.now() - memo.t < 45000) return memo.res;

    let res;
    try {
        const data = await _fetchMatriz(`/api/inventario?sku=${encodeURIComponent(sku)}`);
        const filas = _stockDesdeRespuestaMatriz(data, sku).map(f => ({
            id_sucursal: f.id_sucursal,
            nombre_sucursal: _nombreNodo(f.id_sucursal, f.nombre_sucursal),
            stock: f.cantidad_actual
        }));
        res = { origen: 'matriz', sku, producto: data.producto || null, filas, actualizado: new Date().toISOString(), raw: data };
        MATRIZ_CONECTADA = true;
        MATRIZ_ULTIMA_SINCRONIZACION = res.actualizado;
        if (!filas.length && !_disponibilidadReconocida(data)) {
            res.sinLectura = true;               // respondió algo que no sé leer: se muestra tal cual
        } else {
            if (!filas.length) res.vacio = true; // formato válido, pero ninguna sucursal lo tiene registrado
            const cache = _leer(DB.RED_CACHE, {});
            cache[sku] = res;
            _guardar(DB.RED_CACHE, cache);
            _redMemo[sku] = { t: Date.now(), res };
        }
    } catch (e) {
        MATRIZ_CONECTADA = false;
        const cache = _leer(DB.RED_CACHE, {});
        if (cache[sku]) res = { ...cache[sku], origen: 'cache', errorRed: _mensajeAmigable(e) };
        else res = { origen: 'local', sku, producto: null, filas: _filasLocalesSku(sku), actualizado: null, errorRed: _mensajeAmigable(e) };
    }
    return res;
}

/* ---- Inventario de UNA sucursal o de la Matriz: GET /api/inventario?sucursal=ID (2ª etapa) ---- */
const _redNodosMemo = {};

function _leerInventarioSucursal(data) {
    let lista = null;
    if (Array.isArray(data)) lista = data;
    else if (data && typeof data === 'object') {
        for (const k of ['inventario', 'productos', 'items', 'data', 'resultados']) if (Array.isArray(data[k])) { lista = data[k]; break; }
    }
    if (!lista) return { reconocido: false, items: [], nombre: null };
    let nombre = null;
    const items = lista.map(x => {
        if (!nombre && x.nombre_sucursal) nombre = String(x.nombre_sucursal);
        return {
            sku_id: String(x.sku ?? x.sku_id ?? x.codigo ?? ''),
            nombre_pieza: x.producto ?? x.nombre ?? x.nombre_pieza ?? x.sku ?? '',
            marca: x.marca || '',
            precio: Number(x.precio_base ?? x.precio ?? x.precio_lista_sugerido ?? 0),
            stock: Number(x.stock ?? x.cantidad ?? x.cantidad_actual ?? 0),
            id_producto: x.id_producto ?? null
        };
    }).filter(i => i.sku_id);
    return { reconocido: true, items, nombre };
}

function _itemsLocalesNodo(id) {
    const prods = {}; apiProductos().forEach(p => { prods[p.sku_id] = p; });
    return _leer(DB.INVENTARIO, []).filter(r => r.id_sucursal === Number(id) && prods[r.sku_id]).map(r => ({
        sku_id: r.sku_id, nombre_pieza: prods[r.sku_id].nombre_pieza, marca: prods[r.sku_id].marca || '',
        precio: Number(prods[r.sku_id].precio_lista_sugerido || 0), stock: Number(r.cantidad_actual || 0)
    }));
}

async function apiRedInventarioSucursal(idSucursal, forzar = false) {
    const id = Number(idSucursal);
    const memo = _redNodosMemo[id];
    if (!forzar && memo && Date.now() - memo.t < 45000) return memo.res;

    const minimos = {}; apiProductos().forEach(p => { minimos[p.sku_id] = Number(p.stock_minimo_alerta || 0); });
    const conMinimo = items => items.map(i => ({ ...i, minimo: minimos[i.sku_id] ?? 0 }));
    let res;
    try {
        const data = await _fetchMatriz(`/api/inventario?sucursal=${id}`);
        const leido = _leerInventarioSucursal(data);
        const items = conMinimo(leido.items);
        res = { origen: 'matriz', id, nombre: _nombreNodo(id, leido.nombre), items, vacio: leido.reconocido && items.length === 0,
                sinLectura: !leido.reconocido, raw: data, actualizado: new Date().toISOString() };
        MATRIZ_CONECTADA = true;
        MATRIZ_ULTIMA_SINCRONIZACION = res.actualizado;
        if (leido.reconocido) {
            const cache = _leer(DB.RED_NODOS, {});
            cache[id] = res;
            _guardar(DB.RED_NODOS, cache);
            _redNodosMemo[id] = { t: Date.now(), res };
        }
    } catch (e) {
        if (_esErrorDeRed(e)) MATRIZ_CONECTADA = false;
        const cache = _leer(DB.RED_NODOS, {})[id];
        if (cache) res = { ...cache, origen: 'cache', errorRed: _mensajeAmigable(e) };
        else res = { origen: 'local', id, nombre: _nombreNodo(id), items: conMinimo(_itemsLocalesNodo(id)), actualizado: null, errorRed: _mensajeAmigable(e) };
    }
    return res;
}

/* ---- VARIOS productos en una sola petición: GET /api/inventario?skus=A,B,C (2ª etapa) ----
   Si el servidor no lo soporta, se consulta producto por producto.                          */
async function apiRedDisponibilidadVarios(skus, forzar = false) {
    const lista = [...new Set(skus)];
    const vigente = s => _redMemo[s] && Date.now() - _redMemo[s].t < 45000;
    const faltan = lista.filter(s => forzar || !vigente(s));
    let loteOk = false;

    if (faltan.length > 1) {
        try {
            const data = await _fetchMatriz(`/api/inventario?skus=${faltan.map(encodeURIComponent).join(',')}`);
            const arr = Array.isArray(data && data.productos) ? data.productos : null;
            if (arr) {
                const cache = _leer(DB.RED_CACHE, {});
                arr.forEach(p => {
                    const sku = String(p.sku ?? p.sku_id ?? '');
                    if (!sku) return;
                    const filas = _stockDesdeRespuestaMatriz({ disponibilidad: p.disponibilidad }, sku).map(f => ({
                        id_sucursal: f.id_sucursal, nombre_sucursal: _nombreNodo(f.id_sucursal, f.nombre_sucursal), stock: f.cantidad_actual
                    }));
                    const res = { origen: 'matriz', sku, producto: p.producto || null, filas, vacio: filas.length === 0, actualizado: new Date().toISOString(), raw: p };
                    cache[sku] = res;
                    _redMemo[sku] = { t: Date.now(), res };
                });
                _guardar(DB.RED_CACHE, cache);
                MATRIZ_CONECTADA = true;
                MATRIZ_ULTIMA_SINCRONIZACION = new Date().toISOString();
                loteOk = true;
            }
        } catch (e) { /* se usa el respaldo producto por producto */ }
    }
    return await _mapConLimite(lista, 3, s => apiRedDisponibilidadSku(s, loteOk ? false : forzar));
}

/* Aviso visible cuando la Matriz contestó pero la respuesta no se pudo leer (muestra lo que llegó). */
function redAvisoSinLectura(res) {
    if (!res || !res.sinLectura) return '';
    let crudo = '';
    try { crudo = JSON.stringify(res.raw, null, 2); } catch (e) { crudo = String(res.raw); }
    if (crudo.length > 1500) crudo = crudo.slice(0, 1500) + '\n...';
    return `<div class="reco-card aviso" style="display:block;">
        <small>La Matriz respondió, pero no encontré ${_escHtml(res.queBuscaba || 'sucursales')} en la respuesta (${_escHtml(res.sku || '')})</small>
        <details style="margin-top:6px;"><summary style="cursor:pointer;color:var(--accent);font-weight:bold;font-size:.85rem;">Ver lo que respondió la Matriz</summary>
        <pre style="white-space:pre-wrap;word-break:break-word;font-size:.75rem;color:var(--text-muted);margin:8px 0 0 0;">${_escHtml(crudo)}</pre></details></div>`;
}


/* ---- Recomendación para UN producto ---------------------------------
   filas: [{id_sucursal, nombre_sucursal, stock}]  faltante: piezas que necesito
   Regla: se excluyen mi sucursal y la Matriz; la recomendada es la que
   tiene MÁS stock y cubre el faltante.                                   */
function redRecomendarUno(filas, faltante, idPropio = SUCURSAL_ACTUAL.id) {
    const otras = filas
        .filter(f => f.id_sucursal !== Number(idPropio) && f.id_sucursal !== MATRIZ_ID)
        .sort((a, b) => b.stock - a.stock);
    const matriz = filas.find(f => f.id_sucursal === MATRIZ_ID) || null;
    const conStock = otras.filter(f => f.stock > 0);
    const cubren = conStock.filter(f => f.stock >= faltante);
    const mejor = cubren[0] || null;

    let combinacion = null;   // si ninguna alcanza sola, se juntan varias de mayor a menor
    if (!mejor && conStock.length) {
        let restante = faltante;
        const partes = [];
        for (const f of conStock) {
            if (restante <= 0) break;
            const toma = Math.min(f.stock, restante);
            partes.push({ ...f, toma });
            restante -= toma;
        }
        combinacion = { partes, faltaAun: Math.max(0, restante) };
    }
    return { otras, matriz, conStock, cubren, mejor, combinacion };
}

/* ---- Evaluación para VARIOS productos ---------------------------------
   reqs: [{sku, nombre, cant, miStock, faltante, filas}]                    */
function redEvaluarVarios(reqs, idPropio = SUCURSAL_ACTUAL.id) {
    const pendientes = reqs.filter(r => r.faltante > 0);
    const esCandidata = f => f.id_sucursal !== Number(idPropio) && f.id_sucursal !== MATRIZ_ID;

    const nombres = {};
    pendientes.forEach(r => r.filas.filter(esCandidata).forEach(f => { nombres[f.id_sucursal] = f.nombre_sucursal; }));

    const nodos = Object.keys(nombres).map(k => {
        const id = Number(k);
        let cubiertos = 0, sobrante = 0, piezas = 0;
        const detalle = pendientes.map(r => {
            const f = r.filas.find(x => x.id_sucursal === id);
            const tiene = f ? f.stock : 0;
            const cubre = tiene >= r.faltante;
            if (cubre) { cubiertos++; sobrante += tiene - r.faltante; }
            piezas += Math.min(tiene, r.faltante);
            return { sku: r.sku, nombre: r.nombre, necesita: r.faltante, tiene, cubre };
        });
        return { id, nombre: nombres[k], cubiertos, total: pendientes.length, sobrante, piezas, detalle };
    }).filter(n => n.piezas > 0)
      .sort((a, b) => b.cubiertos - a.cubiertos || b.sobrante - a.sobrante || b.piezas - a.piezas);

    const completos = nodos.filter(n => n.total > 0 && n.cubiertos === n.total);

    // Si nadie cubre todo: por cada producto, la sucursal con más stock que sí lo cubra.
    let plan = null;
    if (!completos.length && pendientes.length) {
        plan = pendientes.map(r => {
            const nodo = r.filas.filter(esCandidata).filter(f => f.stock >= r.faltante).sort((a, b) => b.stock - a.stock)[0] || null;
            return { sku: r.sku, nombre: r.nombre, necesita: r.faltante, nodo };
        });
    }

    const matrizCubre = pendientes.length > 0 && pendientes.every(r => {
        const m = r.filas.find(f => f.id_sucursal === MATRIZ_ID);
        return m && m.stock >= r.faltante;
    });
    return { pendientes, nodos, completos, plan, matrizCubre };
}

/* ---------------------------------------------------------------------
   PRÉSTAMOS Y DEVOLUCIONES (Matriz)
   Espejo local (DB.PRESTAMOS_RED): guarda lo que TÚ registras para poder
   mover tu almacén y reintentar si la Matriz no responde.
   --------------------------------------------------------------------- */
function _idDesdeCampo(v) {
    if (v === null || v === undefined || v === '') return NaN;
    if (typeof v === 'number') return v;
    const t = String(v);
    if (/^\d+$/.test(t.trim())) return Number(t);
    if (/matriz|almac[eé]n/i.test(t)) return MATRIZ_ID;
    const m = t.match(/(\d+)/);
    return m ? Number(m[1]) : NaN;
}

function _listaDesdeRespuesta(data) {
    // La API puede devolver el arreglo directamente o anidado en distintas
    // envolturas ({data:{prestamos:[]}}, {resultado:{items:[]}}, etc.).
    if (Array.isArray(data)) return data;
    if (!data || typeof data !== 'object') return null;
    const claves = ['prestamos', 'prestamos_activos', 'activos', 'solicitudes',
        'items', 'registros', 'resultados', 'data', 'resultado', 'datos'];
    for (const k of claves) {
        if (Array.isArray(data[k])) return data[k];
    }
    for (const k of claves) {
        if (data[k] && typeof data[k] === 'object') {
            const encontrada = _listaDesdeRespuesta(data[k]);
            if (encontrada !== null) return encontrada;
        }
    }
    return null;
}

function _normalizarPrestamoMatriz(p, estadoDef = 'ACTIVO') {
    const catalogo = apiProductos();
    const idProd = Number(p.id_producto ?? p.producto_id ?? NaN);
    const prodCat = catalogo.find(x => Number(x.id_producto) === idProd) || {};
    const sku = p.sku ?? p.sku_id ?? p.codigo ?? prodCat.sku_id ?? '';
    const prestaRaw = p.id_sucursal_presta ?? p.sucursal_presta_id ?? p.id_presta ?? p.sucursal_presta ?? p.presta ?? p.origen;
    const recibeRaw = p.id_sucursal_recibe ?? p.sucursal_recibe_id ?? p.id_recibe ?? p.sucursal_recibe ?? p.recibe ?? p.destino;
    const idPresta = _idDesdeCampo(prestaRaw), idRecibe = _idDesdeCampo(recibeRaw);
    return {
        id_prestamo: Number(p.id_prestamo ?? p.prestamo_id ?? p.id ?? NaN),
        id_presta: idPresta,
        id_recibe: idRecibe,
        nombre_presta: _nombreNodo(idPresta, p.nombre_sucursal_presta ?? p.nombre_presta ?? (typeof prestaRaw === 'string' && isNaN(Number(prestaRaw)) ? prestaRaw : null)),
        nombre_recibe: _nombreNodo(idRecibe, p.nombre_sucursal_recibe ?? p.nombre_recibe ?? (typeof recibeRaw === 'string' && isNaN(Number(recibeRaw)) ? recibeRaw : null)),
        sku,
        producto: p.producto ?? p.nombre_producto ?? p.nombre ?? prodCat.nombre_pieza ?? sku,
        cantidad: Number(p.cantidad ?? 0),
        estado: String(p.estado ?? estadoDef).toUpperCase(),
        fecha: p.fecha ?? p.fecha_prestamo ?? p.fecha_solicitud ?? p.created_at ?? null,
        folio: p.folio ?? p.folio_referencia ?? null,
        sincronizado: true,
        local_id: null
    };
}

function _espejoAFila(m) {
    const prod = _productoMatrizPorSku(m.sku) || {};
    return {
        id_prestamo: m.id_prestamo ?? NaN, id_presta: m.id_presta, id_recibe: m.id_recibe,
        nombre_presta: _nombreNodo(m.id_presta), nombre_recibe: _nombreNodo(m.id_recibe),
        sku: m.sku, producto: prod.nombre_pieza || m.sku, cantidad: m.cantidad,
        estado: m.sincronizado ? (m.estado || 'ACTIVO') : 'SIN REGISTRAR EN MATRIZ',
        fecha: m.fecha, folio: m.folio || null, sincronizado: !!m.sincronizado, local_id: m.local_id
    };
}

/* Si tu almacén local aún no tiene registro de este producto (nunca sincronizaste),
   se parte de lo que la Matriz reportó para tu sucursal, no de cero. */
function _asegurarFilaLocal(sku) {
    const yo = Number(SUCURSAL_ACTUAL.id);
    const inv = _leer(DB.INVENTARIO, []);
    const fila = inv.find(r => r.id_sucursal === yo && r.sku_id === sku);
    if (fila && !fila.demo) return;
    const cache = _leer(DB.RED_CACHE, {})[sku];
    const f = cache && cache.filas ? cache.filas.find(x => x.id_sucursal === yo) : null;
    if (fila) { if (f) fila.cantidad_actual = Number(f.stock || 0); delete fila.demo; }
    else inv.push({ sku_id: sku, id_sucursal: yo, cantidad_actual: f ? Number(f.stock || 0) : 0 });
    _guardar(DB.INVENTARIO, inv);
}

/* Registrar préstamo. Yo soy la sucursal que presta O la que recibe.
   FLUJO NUEVO (PDF punto 10): el POST deja la solicitud en "PENDIENTE" en la Matriz.
   El stock NO se mueve aquí: se mueve cuando la Matriz presiona "Aceptar y Transferir"
   (el préstamo pasa a ACTIVO). Esto se detecta en apiPrestamosRed(). */
async function apiRegistrarPrestamoRed(idPresta, idRecibe, sku, cantidad) {
    const yo = Number(SUCURSAL_ACTUAL.id);
    idPresta = Number(idPresta); idRecibe = Number(idRecibe); cantidad = parseInt(cantidad);

    if (!cantidad || cantidad < 1) return { error: true, mensaje: 'La cantidad debe ser mayor a 0.' };
    if (idPresta === idRecibe) return { error: true, mensaje: 'La sucursal que presta y la que recibe no pueden ser la misma.' };
    if (yo !== idPresta && yo !== idRecibe) return { error: true, mensaje: 'Solo puedes registrar préstamos donde tu sucursal participa.' };
    const idProducto = _resolverIdProducto(sku);
    if (!idProducto) return { error: true, mensaje: `No existe id_producto oficial para ${sku}. Sincroniza el catálogo.` };

    _asegurarFilaLocal(sku);
    if (yo === idPresta) {
        const reg = _leer(DB.INVENTARIO, []).find(r => r.id_sucursal === yo && r.sku_id === sku);
        if (!reg || reg.cantidad_actual < cantidad) return { error: true, mensaje: 'No tienes stock suficiente para prestar esa cantidad.' };
    }

    let sincronizado = true, idMatriz = null, mensajeMatriz = '';
    try {
        const data = await _fetchMatriz('/api/prestamos', {
            method: 'POST',
            body: { id_sucursal_presta: idPresta, id_sucursal_recibe: idRecibe, id_producto: Number(idProducto), cantidad }
        });
        const n = Number(data.id_prestamo ?? data.prestamo_id ?? data.id ?? data.insertId ?? NaN);
        idMatriz = Number.isFinite(n) ? n : null;
        mensajeMatriz = data.mensaje || '';
        MATRIZ_CONECTADA = true;
    } catch (e) {
        if (!_esErrorDeRed(e)) return { error: true, mensaje: String(e.message || e) };   // la Matriz lo rechazó: no se registra nada
        sincronizado = false;                                                         // sin conexión: queda por reenviar
        mensajeMatriz = _mensajeAmigable(e);
        MATRIZ_CONECTADA = false;
    }

    // Solo se guarda el espejo. El almacén local se mueve cuando la Matriz autorice (estado ACTIVO).
    const folio = _folio('PRE');
    const espejos = _leer(DB.PRESTAMOS_RED, []);
    espejos.push({
        local_id: _nuevoId(espejos, 'local_id'), id_prestamo: idMatriz, id_presta: idPresta, id_recibe: idRecibe,
        sku, cantidad, estado: 'PENDIENTE', sincronizado, ajustado_inicial: false, ajustado_devolucion: false,
        folio, fecha: new Date().toISOString()
    });
    _guardar(DB.PRESTAMOS_RED, espejos);
    return { error: false, pendiente: true, folio, sincronizado, id_prestamo: idMatriz, mensaje: mensajeMatriz };
}

/* La Matriz autorizó el préstamo (pasó a ACTIVO): ahora sí se mueve MI almacén, una sola vez. */
function _aplicarAjusteInicialLocal(m) {
    if (m.ajustado_inicial) return;
    const yo = Number(SUCURSAL_ACTUAL.id);
    if (yo === m.id_recibe) {
        _asegurarFilaLocal(m.sku);
        _ajustarStock(yo, m.sku, m.cantidad);
        _registrarMovimiento({
            id_sucursal: yo, sku_id: m.sku, cantidad: m.cantidad, tipo_movimiento: 'ENTRADA', folio_referencia: m.folio || 'PRE',
            descripcion: `Préstamo recibido de ${_nombreNodo(m.id_presta)} (autorizado por Matriz)`
        });
    } else if (yo === m.id_presta) {
        _asegurarFilaLocal(m.sku);
        _ajustarStock(yo, m.sku, -m.cantidad);
        _registrarMovimiento({
            id_sucursal: yo, sku_id: m.sku, cantidad: m.cantidad, tipo_movimiento: 'SALIDA', folio_referencia: m.folio || 'PRE',
            descripcion: `Préstamo entregado a ${_nombreNodo(m.id_recibe)} (autorizado por Matriz)`
        });
    }
    m.ajustado_inicial = true;
    m.estado = 'ACTIVO';
}

function _aplicarDevolucionLocal(m) {
    const yo = Number(SUCURSAL_ACTUAL.id);
    if (m.ajustado_devolucion) return;
    // Solo se revierte lo que realmente se movió en mi almacén al autorizarse.
    if (m.ajustado_inicial) {
        if (yo === m.id_recibe) _ajustarStock(yo, m.sku, -m.cantidad);   // devolví lo que debía
        else if (yo === m.id_presta) _ajustarStock(yo, m.sku, m.cantidad);   // me regresaron lo que presté
        _registrarMovimiento({
            id_sucursal: yo, sku_id: m.sku, cantidad: m.cantidad,
            tipo_movimiento: yo === m.id_recibe ? 'SALIDA' : 'ENTRADA', folio_referencia: m.folio || 'DEV',
            descripcion: yo === m.id_recibe ? 'Devolución de préstamo entregada' : 'Devolución de préstamo recibida'
        });
    }
    m.ajustado_devolucion = true;
    m.estado = 'DEVUELTO';
}

async function _sincronizarPrestamosPendientes() {
    const espejos = _leer(DB.PRESTAMOS_RED, []);
    let cambio = false;
    for (const m of espejos) {
        if (m.sincronizado || m.estado !== 'PENDIENTE') continue;
        const idProducto = _resolverIdProducto(m.sku);
        if (!idProducto) continue;
        try {
            const data = await _fetchMatriz('/api/prestamos', {
                method: 'POST',
                body: { id_sucursal_presta: m.id_presta, id_sucursal_recibe: m.id_recibe, id_producto: Number(idProducto), cantidad: m.cantidad }
            });
            const n = Number(data.id_prestamo ?? data.prestamo_id ?? data.id ?? data.insertId ?? NaN);
            m.id_prestamo = Number.isFinite(n) ? n : null;
            m.sincronizado = true; cambio = true;
        } catch (e) { if (_esErrorDeRed(e)) break; }
    }
    if (cambio) _guardar(DB.PRESTAMOS_RED, espejos);
}

/* GET /api/prestamos/solicitudes (PDF punto 11): solicitudes PENDIENTES por aceptar en la Matriz. */
async function apiSolicitudesPrestamoMatriz() {
    try {
        return await _fetchMatriz('/api/prestamos/solicitudes');
    } catch (e) {
        if (_esErrorDeRed(e)) MATRIZ_CONECTADA = false;
        return { error: true, mensaje: _mensajeAmigable(e) };
    }
}

/* Devuelve inmediatamente la última copia local disponible. Se usa para
   pintar las tablas al abrir la página, sin esperar la conexión con Matriz. */
function apiPrestamosRedLocal() {
    const yo = Number(SUCURSAL_ACTUAL.id);
    const cache = _leer(DB.PRESTAMOS_RED_CACHE || 'es_prestamos_red_cache', { activos: [], solicitudes: [] });
    const espejos = _leer(DB.PRESTAMOS_RED, []).map(_espejoAFila);
    const activos = [...(Array.isArray(cache.activos) ? cache.activos : [])];
    const solicitudes = [...(Array.isArray(cache.solicitudes) ? cache.solicitudes : [])];
    const combinar = (base, extra) => {
        const vistos = new Set(base.map(f => Number.isFinite(Number(f.id_prestamo)) ? `id:${Number(f.id_prestamo)}` : `${f.folio || ''}|${f.id_presta}|${f.id_recibe}|${f.sku}|${f.fecha || ''}`));
        extra.forEach(f => {
            const k = Number.isFinite(Number(f.id_prestamo)) ? `id:${Number(f.id_prestamo)}` : `${f.folio || ''}|${f.id_presta}|${f.id_recibe}|${f.sku}|${f.fecha || ''}`;
            if (!vistos.has(k)) { vistos.add(k); base.push(f); }
        });
        return base;
    };
    combinar(activos, espejos.filter(f => !String(f.estado).includes('PENDIENTE')));
    combinar(solicitudes, espejos.filter(f => String(f.estado).includes('PENDIENTE')));
    const mia = f => Number(f.id_recibe) === yo || Number(f.id_presta) === yo;
    const unicos = lista => combinar([], lista);
    const historial = unicos([...activos, ...solicitudes]).sort((a,b) => new Date(b.fecha || 0) - new Date(a.fecha || 0));
    return { origen: 'cache', errorRed: null, historial,
        mis_deudas: activos.filter(f => Number(f.id_recibe) === yo),
        me_deben: activos.filter(f => Number(f.id_presta) === yo),
        otros: activos.filter(f => !mia(f)),
        pendientes_mias: solicitudes.filter(mia),
        pendientes_otras: solicitudes.filter(f => !mia(f)) };
}

/* Lista los préstamos de la red y los separa en:
   - ACTIVOS: lo que debo, lo que me deben y el resto de la red.
   - PENDIENTES (solicitudes por autorizar en la Matriz): las mías y las de los demás. */
async function apiPrestamosRed() {
    const yo = Number(SUCURSAL_ACTUAL.id);
    let activos = [], solicitudes = [], origen = 'matriz', errorRed = null;
    const cacheKey = DB.PRESTAMOS_RED_CACHE || 'es_prestamos_red_cache';
    const cacheAnterior = _leer(cacheKey, { activos: [], solicitudes: [], fecha: null });
    let lecturaActivosValida = false, lecturaSolicitudesValida = false;

    try {
        await _sincronizarPrestamosPendientes();
        const dataAct = await _fetchMatriz('/api/prestamos/activos');
        const listaAct = _listaDesdeRespuesta(dataAct);
        if (listaAct === null) throw new Error('La Matriz respondió, pero el formato de /api/prestamos/activos no contiene una lista reconocible.');
        activos = listaAct.map(p => _normalizarPrestamoMatriz(p, 'ACTIVO'));
        lecturaActivosValida = true;

        // El endpoint de solicitudes puede no estar habilitado en algunas versiones.
        try {
            const dataSol = await _fetchMatriz('/api/prestamos/solicitudes');
            const listaSol = _listaDesdeRespuesta(dataSol);
            if (listaSol !== null) {
                solicitudes = listaSol.map(p => _normalizarPrestamoMatriz(p, 'PENDIENTE'));
                lecturaSolicitudesValida = true;
            }
        } catch (e) {
            if (_esErrorDeRed(e) && /Failed to fetch|NetworkError|Load failed|ngrok/i.test(String(e.message || e))) throw e;
            // Si el endpoint no existe, conservamos las solicitudes que ya estaban en caché.
            solicitudes = Array.isArray(cacheAnterior.solicitudes) ? cacheAnterior.solicitudes : [];
        }

        // Persistir los datos del servidor en una caché separada: no mezclarla con
        // los espejos locales, porque estos últimos controlan movimientos de stock.
        const cacheNueva = {
            activos: lecturaActivosValida ? activos : (cacheAnterior.activos || []),
            solicitudes: lecturaSolicitudesValida ? solicitudes : (cacheAnterior.solicitudes || []),
            fecha: new Date().toISOString()
        };
        _guardar(cacheKey, cacheNueva);

        // Reconciliar los registros creados en esta sucursal con el estado oficial.
        const idsAct = new Set(activos.map(f => Number(f.id_prestamo)).filter(Number.isFinite));
        const idsSol = new Set(solicitudes.map(f => Number(f.id_prestamo)).filter(Number.isFinite));
        const espejos = _leer(DB.PRESTAMOS_RED, []);
        let cambio = false;
        espejos.forEach(m => {
            if (!m.sincronizado || m.id_prestamo == null) return;
            const id = Number(m.id_prestamo);
            if (m.estado === 'PENDIENTE') {
                if (idsAct.has(id)) { _aplicarAjusteInicialLocal(m); cambio = true; }
                else if (lecturaActivosValida && lecturaSolicitudesValida && !idsSol.has(id)) { m.estado = 'CERRADO'; cambio = true; }
            } else if (m.estado === 'ACTIVO' && lecturaActivosValida && !idsAct.has(id)) {
                _aplicarDevolucionLocal(m); cambio = true;
            }
        });
        if (cambio) _guardar(DB.PRESTAMOS_RED, espejos);

        _leer(DB.PRESTAMOS_RED, []).filter(m => m.estado === 'PENDIENTE' && !m.sincronizado)
            .forEach(m => solicitudes.push(_espejoAFila(m)));
    } catch (e) {
        origen = 'cache';
        errorRed = _mensajeAmigable(e);
        MATRIZ_CONECTADA = false;
        activos = Array.isArray(cacheAnterior.activos) ? cacheAnterior.activos : [];
        solicitudes = Array.isArray(cacheAnterior.solicitudes) ? cacheAnterior.solicitudes : [];
        const espejos = _leer(DB.PRESTAMOS_RED, []);
        // Combinar también los registros locales todavía no sincronizados.
        activos = [...activos, ...espejos.filter(m => m.estado === 'ACTIVO').map(_espejoAFila)];
        solicitudes = [...solicitudes, ...espejos.filter(m => m.estado === 'PENDIENTE').map(_espejoAFila)];
    }

    const mia = f => Number(f.id_recibe) === yo || Number(f.id_presta) === yo;
    const espejos = _leer(DB.PRESTAMOS_RED, []).map(_espejoAFila);
    const historialBase = [...activos, ...solicitudes, ...espejos];
    const vistos = new Set();
    const historial = historialBase.filter(f => {
        const id = Number(f.id_prestamo);
        const clave = Number.isFinite(id) ? `id:${id}` :
            `${f.folio || f.local_id || ''}|${f.id_presta}|${f.id_recibe}|${f.sku}|${f.fecha || ''}`;
        if (vistos.has(clave)) return false;
        vistos.add(clave);
        return true;
    }).sort((a, b) => new Date(b.fecha || 0) - new Date(a.fecha || 0));

    // Evitar duplicados entre caché del servidor y espejo local.
    const unicos = lista => {
        const ids = new Set();
        return lista.filter(f => {
            const k = Number.isFinite(Number(f.id_prestamo)) ? `id:${Number(f.id_prestamo)}` : `${f.folio || ''}|${f.id_presta}|${f.id_recibe}|${f.sku}|${f.fecha || ''}`;
            if (ids.has(k)) return false;
            ids.add(k); return true;
        });
    };
    const activosUnicos = unicos(activos);
    const solicitudesUnicas = unicos(solicitudes);
    return {
        origen, errorRed, historial,
        mis_deudas: activosUnicos.filter(f => Number(f.id_recibe) === yo),
        me_deben: activosUnicos.filter(f => Number(f.id_presta) === yo),
        otros: activosUnicos.filter(f => !mia(f)),
        pendientes_mias: solicitudesUnicas.filter(mia),
        pendientes_otras: solicitudesUnicas.filter(f => !mia(f))
    };
}

/* Registrar devolución (necesita conexión con la Matriz). */
async function apiDevolverPrestamoRed(idPrestamo) {
    const yo = Number(SUCURSAL_ACTUAL.id);
    idPrestamo = Number(idPrestamo);
    if (!Number.isFinite(idPrestamo)) return { error: true, mensaje: 'Este préstamo aún no tiene folio en la Matriz. Actualiza la lista cuando haya conexión.' };

    const espejos = _leer(DB.PRESTAMOS_RED, []);
    const m = espejos.find(x => x.id_prestamo === idPrestamo);
    if (m && yo === m.id_recibe && m.estado === 'ACTIVO' && m.ajustado_inicial) {
        const reg = _leer(DB.INVENTARIO, []).find(r => r.id_sucursal === yo && r.sku_id === m.sku);
        if (!reg || reg.cantidad_actual < m.cantidad) return { error: true, mensaje: 'No tienes stock suficiente en tu almacén para devolver esta cantidad.' };
    }

    try {
        const data = await _fetchMatriz('/api/devoluciones', { method: 'POST', body: { id_prestamo: idPrestamo } });
        MATRIZ_CONECTADA = true;
        if (m) { _aplicarDevolucionLocal(m); _guardar(DB.PRESTAMOS_RED, espejos); }
        return { error: false, mensaje: data.mensaje || 'Devolución registrada.', ajustoAlmacen: !!(m && m.ajustado_inicial) };
    } catch (e) {
        if (_esErrorDeRed(e)) MATRIZ_CONECTADA = false;
        return { error: true, mensaje: _mensajeAmigable(e) };
    }
}


function redMiStock(sku, filas = []) {
    const yo = Number(SUCURSAL_ACTUAL.id);
    const reg = _leer(DB.INVENTARIO, []).find(r => r.id_sucursal === yo && r.sku_id === sku);
    if (reg && !reg.demo) return Number(reg.cantidad_actual || 0);
    const f = filas.find(x => x.id_sucursal === yo);
    return f ? Number(f.stock || 0) : 0;
}

const _TEMA_SWAL = { background: '#24262d', color: '#e5e7eb' };

function _mostrarResultadoPrestamo(out, cant) {
    if (out.error) return Swal.fire({ icon: 'error', title: 'No se pudo registrar', text: out.mensaje, ..._TEMA_SWAL });
    if (!out.sincronizado) {
        return Swal.fire({ icon: 'warning', title: 'Solicitud guardada (sin conexión a Matriz)', text: `Folio ${out.folio}. La solicitud se enviará a la Matriz cuando vuelva la conexión (entra a Préstamos y pulsa Actualizar).`, ..._TEMA_SWAL });
    }
    return Swal.fire({ icon: 'success', title: 'Solicitud enviada a la Matriz', text: (out.mensaje || 'Solicitud de préstamo recibida por la Matriz.') + ` Quedó PENDIENTE: tu almacén se actualizará cuando la Matriz presione "Aceptar y Transferir" (${cant} pz).`, ..._TEMA_SWAL });
}

/* Confirma y registra: recibo `cant` pz de UNA sucursal. */
async function redPrestarDe(idSuc, nombreSuc, sku, cant, onListo = null) {
    const prod = _productoMatrizPorSku(sku) || {};
    const c = await Swal.fire({
        title: 'Solicitar préstamo',
        html: `<div style="text-align:left;font-size:.9rem;">Recibes <b>${cant} pz</b> de <b>${_escHtml(prod.nombre_pieza || sku)}</b> de <b>${_escHtml(nombreSuc)}</b>.<br><br><span style="font-size:.78rem;color:#9ca3af;">Se envía la solicitud a la Matriz (queda PENDIENTE). Cuando la Matriz la acepte y transfiera, el stock se suma a tu almacén y el préstamo pasa a ACTIVO.</span></div>`,
        showCancelButton: true, confirmButtonText: 'Registrar', cancelButtonText: 'Cancelar', confirmButtonColor: '#7e3af2', ..._TEMA_SWAL
    });
    if (!c.isConfirmed) return;
    Swal.fire({ title: 'Registrando...', allowOutsideClick: false, didOpen: () => Swal.showLoading(), ..._TEMA_SWAL });
    const out = await apiRegistrarPrestamoRed(idSuc, SUCURSAL_ACTUAL.id, sku, cant);
    await _mostrarResultadoPrestamo(out, cant);
    if (!out.error && typeof onListo === 'function') onListo(out);
}

/* Registra varios préstamos seguidos. asign: [{idSuc, nombre, sku, nombreProd, cant}] */
async function redPrestarLote(asign, onListo = null) {
    if (!asign.length) return;
    const lista = asign.map(a => `<li style="margin-bottom:4px;"><b>${a.cant} pz</b> ${_escHtml(a.nombreProd || a.sku)} <span style="color:#9ca3af;">← ${_escHtml(a.nombre)}</span></li>`).join('');
    const c = await Swal.fire({
        title: 'Registrar préstamos',
        html: `<ul style="text-align:left;font-size:.88rem;padding-left:18px;margin:0 0 10px 0;">${lista}</ul><span style="font-size:.78rem;color:#9ca3af;">Cada solicitud queda PENDIENTE en la Matriz. El stock se suma a tu almacén cuando la Matriz acepte y transfiera.</span>`,
        showCancelButton: true, confirmButtonText: 'Registrar todo', cancelButtonText: 'Cancelar', confirmButtonColor: '#7e3af2', ..._TEMA_SWAL
    });
    if (!c.isConfirmed) return;
    Swal.fire({ title: 'Registrando...', allowOutsideClick: false, didOpen: () => Swal.showLoading(), ..._TEMA_SWAL });

    let ok = 0, pend = 0; const fallos = [];
    for (const a of asign) {
        const out = await apiRegistrarPrestamoRed(a.idSuc, SUCURSAL_ACTUAL.id, a.sku, a.cant);
        if (out.error) fallos.push(`${a.sku}: ${out.mensaje}`);
        else { ok++; if (!out.sincronizado) pend++; }
    }
    const icono = fallos.length ? (ok ? 'warning' : 'error') : (pend ? 'warning' : 'success');
    let texto = `${ok} solicitud(es) enviada(s) a la Matriz (PENDIENTE de autorización).`;
    if (pend) texto += ` ${pend} quedó(aron) pendiente(s) de enviar a la Matriz (sin conexión).`;
    if (fallos.length) texto += `\n\nNo se pudieron registrar:\n- ${fallos.join('\n- ')}`;
    await Swal.fire({ icon: icono, title: 'Listo', text: texto, ..._TEMA_SWAL });
    if (ok && typeof onListo === 'function') onListo();
}

/* ---------------------------------------------------------------------
   Ventana compartida: "Consultar red y registrar préstamo" de UN producto.
   La usan Venta (cuando falta stock) y Sucursales.
   --------------------------------------------------------------------- */
async function redModalPrestamo(sku, faltanteSugerido = 1, onListo = null) {
    const tema = { background: '#24262d', color: '#e5e7eb' };
    const prod = _productoMatrizPorSku(sku) || {};
    Swal.fire({ title: 'Consultando la red...', allowOutsideClick: false, didOpen: () => Swal.showLoading(), ...tema });
    const res = await apiRedDisponibilidadSku(sku, true);
    const rec = redRecomendarUno(res.filas, faltanteSugerido);

    if (!rec.conStock.length) {
        const extra = rec.matriz && rec.matriz.stock > 0 ? ` La Matriz sí tiene ${rec.matriz.stock} pz: pídelas desde la sección Pedidos.` : '';
        return Swal.fire({ icon: 'info', title: 'Sin disponibilidad', text: `Ninguna otra sucursal tiene piezas de ${prod.nombre_pieza || sku}.${extra}`, ...tema });
    }

    const mejor = rec.mejor || rec.conStock[0];
    const opciones = rec.conStock.map(f =>
        `<option value="${f.id_sucursal}" data-stock="${f.stock}" ${f.id_sucursal === mejor.id_sucursal ? 'selected' : ''}>${_escHtml(f.nombre_sucursal)} — ${f.stock} pz${f.stock >= faltanteSugerido ? '' : ' (no alcanza)'}</option>`).join('');
    const aviso = res.origen !== 'matriz'
        ? `<div style="font-size:.75rem;color:#e3a008;margin-bottom:10px;"><i class="fas fa-exclamation-triangle"></i> Sin conexión con Matriz: datos ${res.origen === 'cache' ? 'guardados' : 'locales de demostración'}.</div>` : '';

    const r = await Swal.fire({
        title: 'Registrar préstamo',
        html: `<div style="text-align:left;font-size:.9rem;">
                 ${aviso}
                 <div style="color:#9ca3af;margin-bottom:10px;">Producto: <b style="color:#e5e7eb;">${_escHtml(prod.nombre_pieza || sku)}</b> (${_escHtml(sku)})<br>Te faltan <b style="color:#e5e7eb;">${faltanteSugerido}</b> pz.</div>
                 <label style="font-size:.75rem;color:#9ca3af;">Sucursal que te presta (la de mayor disponibilidad ya viene elegida)</label>
                 <select id="red-suc" style="width:100%;padding:10px;background:#1a1c23;color:white;border:1px solid #374151;border-radius:6px;margin:4px 0 12px 0;">${opciones}</select>
                 <label style="font-size:.75rem;color:#9ca3af;">Cantidad</label>
                 <input id="red-cant" type="number" min="1" value="${faltanteSugerido}" style="width:100%;padding:10px;background:#1a1c23;color:white;border:1px solid #374151;border-radius:6px;box-sizing:border-box;">
                 <div style="font-size:.72rem;color:#9ca3af;margin-top:10px;">Se envía como solicitud a la Matriz. Cuando la acepte y transfiera, el stock se suma a tu almacén.</div>
               </div>`,
        showCancelButton: true, confirmButtonText: 'Registrar préstamo', cancelButtonText: 'Cancelar', confirmButtonColor: '#7e3af2', ...tema,
        preConfirm: () => {
            const sel = document.getElementById('red-suc');
            const cant = parseInt(document.getElementById('red-cant').value);
            const stock = Number(sel.options[sel.selectedIndex].dataset.stock);
            if (!cant || cant < 1) { Swal.showValidationMessage('Ingresa una cantidad válida'); return false; }
            if (cant > stock) { Swal.showValidationMessage(`Esa sucursal solo tiene ${stock} pz`); return false; }
            return { suc: Number(sel.value), cant };
        }
    });
    if (!r.isConfirmed) return;

    const out = await apiRegistrarPrestamoRed(r.value.suc, SUCURSAL_ACTUAL.id, sku, r.value.cant);
    await _mostrarResultadoPrestamo(out, r.value.cant);
    if (!out.error && typeof onListo === 'function') onListo(out);
}


/* =====================================================================
   ENVÍOS (LOGÍSTICA) — PDF puntos 14 y 15
   GET  /api/envios?sucursal=ID          -> paquetes en camino
   POST /api/envios/actualizar           -> { id_envio, estado: "ENTREGADO" }
   Al confirmar, la Matriz suma la mercancía al inventario de la sucursal;
   aquí se refleja también en el almacén local (una sola vez por envío).
   ===================================================================== */
const _ENVIOS_CONFIRMADOS_KEY = 'es_envios_confirmados';

function _normalizarEnvio(e) {
    const catalogo = apiProductos();
    const idProd = Number(e.id_producto ?? e.producto_id ?? NaN);
    const prod = catalogo.find(x => Number(x.id_producto) === idProd) || {};
    const sku = e.sku ?? e.sku_id ?? e.codigo ?? prod.sku_id ?? '';
    return {
        id_envio: Number(e.id_envio ?? e.id ?? NaN),
        sku: String(sku),
        producto: e.producto ?? e.nombre_producto ?? e.nombre ?? prod.nombre_pieza ?? (sku || '—'),
        cantidad: Number(e.cantidad ?? 0),
        estado: String(e.estado ?? e.status ?? 'EN CAMINO').toUpperCase(),
        origen: e.nombre_origen ?? e.origen ?? e.id_sucursal_origen ?? 'Matriz',
        fecha: e.fecha ?? e.fecha_envio ?? e.created_at ?? null
    };
}

async function apiEnviosMatriz(idSucursal = SUCURSAL_ACTUAL.id) {
    try {
        return await _fetchMatriz(`/api/envios?sucursal=${Number(idSucursal)}`);
    } catch (e) {
        if (_esErrorDeRed(e)) MATRIZ_CONECTADA = false;
        return { error: true, mensaje: _mensajeAmigable(e) };
    }
}

async function apiEnviosRed(idSucursal = SUCURSAL_ACTUAL.id) {
    const d = await apiEnviosMatriz(idSucursal);
    if (d && d.error) return { error: true, mensaje: d.mensaje, envios: [] };
    let lista = Array.isArray(d) ? d : null;
    if (!lista) for (const k of ['envios', 'paquetes', 'data', 'resultados']) if (Array.isArray(d?.[k])) { lista = d[k]; break; }
    return { error: false, envios: (lista || []).map(_normalizarEnvio), raw: d };
}

async function apiConfirmarEnvioRed(envio) {
    const r = await apiConfirmarEnvioMatriz(envio.id_envio, 'ENTREGADO');
    if (r.error) return r;
    const hechos = _leer(_ENVIOS_CONFIRMADOS_KEY, []);
    if (envio.sku && envio.cantidad > 0 && !hechos.includes(envio.id_envio)) {
        _asegurarFilaLocal(envio.sku);
        _ajustarStock(SUCURSAL_ACTUAL.id, envio.sku, envio.cantidad);
        _registrarMovimiento({
            id_sucursal: SUCURSAL_ACTUAL.id, sku_id: envio.sku, cantidad: envio.cantidad, tipo_movimiento: 'ENTRADA',
            folio_referencia: `ENV-${envio.id_envio}`, descripcion: 'Envío recibido de Matriz (logística)'
        });
        hechos.push(envio.id_envio);
        _guardar(_ENVIOS_CONFIRMADOS_KEY, hechos);
    }
    return r;
}

/* =====================================================================
   GEOLOCALIZACIÓN GPS Y DISTANCIAS — PDF puntos 16, 17 y 18
   GET  /api/sucursales/ubicaciones  (alias /api/geolocalizacion)
   POST /api/sucursales/ubicacion    { id_sucursal, latitud, longitud, direccion }
   GET  /mapa                        (HTML5 + Leaflet, para WebView / iframe)
   Todo es JSON REST estándar. Si la Matriz no responde, se usan las
   coordenadas precargadas (Anexo del PDF) y la distancia se calcula aquí
   con la Fórmula de Haversine.
   ===================================================================== */
const GEO_PRECARGADAS = [
    { id_sucursal: 1, nombre: 'Sucursal (Equipo 1)',        direccion: 'Calle Hidalgo #820, Zona Centro',                                   latitud: 23.7369,   longitud: -99.1411 },
    { id_sucursal: 2, nombre: 'Sucursal (Equipo 2)',        direccion: 'Blvd. Tamaulipas #2105, Fracc. Campestre',                          latitud: 23.7685,   longitud: -99.1462 },
    { id_sucursal: 3, nombre: 'Sucursal (Equipo 3)',        direccion: 'Av. Alberto Carrera Torres #1450',                                  latitud: 23.7438,   longitud: -99.1545 },
    { id_sucursal: 4, nombre: 'Matriz Central (Equipo 4)',  direccion: 'Laboratorio de Sistemas Computacionales - TecNM ITCV (Calle Manzano 2305)', latitud: 23.753005, longitud: -99.168591 },
    { id_sucursal: 5, nombre: 'Sucursal (Equipo 5)',        direccion: 'Calz. Gral. Luis Caballero #980, Tamatán',                          latitud: 23.7295,   longitud: -99.1765 },
    { id_sucursal: 6, nombre: 'Sucursal (Equipo 6)',        direccion: 'Eje Vial Lázaro Cárdenas #610',                                     latitud: 23.7482,   longitud: -99.1328 },
    { id_sucursal: 7, nombre: 'Sucursal (Equipo 7)',        direccion: 'Libramiento Naciones Unidas #1840',                                 latitud: 23.7790,   longitud: -99.1610 },
    { id_sucursal: 8, nombre: 'Sucursal (Equipo 8)',        direccion: 'Blvd. Praxedis Balboa #1720',                                       latitud: 23.7322,   longitud: -99.1285 },
    { id_sucursal: 9, nombre: 'Sucursal (Equipo 9)',        direccion: 'Av. Zeferino Fajardo #415',                                         latitud: 23.7568,   longitud: -99.1748 }
];
const GEO_KEY_CACHE = 'es_ubicaciones_cache';
const GEO_KEY_PROPIA = 'es_ubicacion_propia';

/* Distancia en km entre dos puntos GPS (Fórmula de Haversine). */
function geoHaversineKm(lat1, lon1, lat2, lon2) {
    const R = 6371, rad = x => x * Math.PI / 180;
    const dLat = rad(lat2 - lat1), dLon = rad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
/* La Matriz entrega la distancia Haversine corregida por calles (≈ ×1.22, comprobado contra su
   tabla: Eq.9 = 0.93 km, Eq.7 = 3.65 km, Eq.8 = 5.72 km). Si la Matriz no responde, se usa el mismo factor. */
const GEO_FACTOR_RUTA = 1.22;
function geoDistanciaKm(lat1, lon1, lat2, lon2) { return geoHaversineKm(lat1, lon1, lat2, lon2) * GEO_FACTOR_RUTA; }
// Tiempo estimado de traslado en auto (misma proporción que usa la Matriz: ~2.4 min por km).
function geoMinutosEstimados(km) { return Math.round(Number(km) * 2.4); }

function geoUrlGoogleMaps(origen, destino) {
    const o = `${Number(origen.latitud ?? origen.lat)},${Number(origen.longitud ?? origen.lon)}`;
    const d = `${Number(destino.latitud ?? destino.lat)},${Number(destino.longitud ?? destino.lon)}`;
    return `https://www.google.com/maps/dir/?api=1&origin=${o}&destination=${d}&travelmode=driving`;
}

/* Mi ubicación: la última que guardé; si no, la precargada de mi equipo. */
function geoMiUbicacion() {
    const propia = _leer(GEO_KEY_PROPIA, null);
    if (propia && Number(propia.id_sucursal) === Number(SUCURSAL_ACTUAL.id)) return propia;
    const pre = GEO_PRECARGADAS.find(s => s.id_sucursal === Number(SUCURSAL_ACTUAL.id));
    return pre ? { ...pre } : null;
}

function _normalizarUbicacion(x, matriz) {
    const id = Number(x.id_sucursal ?? x.sucursal_id ?? x.idSucursal ?? x.id);
    const pre = GEO_PRECARGADAS.find(s => s.id_sucursal === id) || {};
    const lat = Number(x.latitud ?? x.lat ?? pre.latitud);
    const lon = Number(x.longitud ?? x.lng ?? x.lon ?? pre.longitud);
    let km = Number(x.distancia_matriz_km);
    if (!Number.isFinite(km) && Number.isFinite(lat) && matriz) km = geoDistanciaKm(matriz.latitud, matriz.longitud, lat, lon);
    const min = Number.isFinite(Number(x.tiempo_estimado_min)) ? Number(x.tiempo_estimado_min) : geoMinutosEstimados(km || 0);
    const estadoRaw = x.estado_conexion ?? x.estado ?? x.status ?? '';
    const estadoTexto = String(estadoRaw).trim();
    const boolRaw = x.en_linea ?? x.online ?? x.conectada ?? x.conectado ?? x.activa ?? x.is_online;
    const boolTexto = typeof boolRaw === 'string' ? /^(true|1|si|sí|online|en linea|en línea|activa|activo)$/i.test(boolRaw.trim()) : null;
    const estadoIndicaLinea = /EN[ _-]?L[IÍ]NEA|CONECTAD|ONLINE|ACTIV[AO]/i.test(estadoTexto);
    const estadoIndicaFuera = /ESPERA|DESCONECT|OFFLINE|INACTIV|SIN CONEXI/i.test(estadoTexto);
    const ultimaActividad = x.ultima_conexion ?? x.ultimo_heartbeat ?? x.last_seen ?? x.last_seen_at ?? x.updated_at ?? x.fecha_ultima_conexion;
    const fechaActividad = typeof ultimaActividad === 'number'
        ? new Date(ultimaActividad < 1000000000000 ? ultimaActividad * 1000 : ultimaActividad)
        : new Date(ultimaActividad);
    const edadActividad = ultimaActividad ? (Date.now() - fechaActividad.getTime()) : Infinity;
    const actividadReciente = Number.isFinite(edadActividad) && edadActividad >= -60000 && edadActividad <= 120000;
    const banderaLinea = boolRaw !== undefined && boolRaw !== null
        ? (typeof boolRaw === 'boolean' ? boolRaw : (typeof boolRaw === 'number' ? boolRaw === 1 : boolTexto))
        : estadoIndicaLinea;
    // El heartbeat reciente prevalece sobre un booleano en caché que haya quedado en false.
    const enLinea = actividadReciente || (banderaLinea === true) || (banderaLinea === null && estadoIndicaLinea);
    const estado = enLinea && estadoIndicaFuera ? 'EN LÍNEA (actividad reciente)' : (estadoTexto || (enLinea ? 'EN LÍNEA' : 'En espera de conexión'));
    return {
        id_sucursal: id,
        nombre: x.nombre ?? pre.nombre ?? `Sucursal (Equipo ${id})`,
        zona: x.zona ?? '',
        direccion: x.direccion ?? pre.direccion ?? '',
        latitud: lat, longitud: lon,
        distancia_matriz_km: Number.isFinite(km) ? Math.round(km * 100) / 100 : null,
        tiempo_estimado_min: min,
        en_linea: !!enLinea,
        estado_conexion: String(estado),
        url_google_maps: x.url_google_maps || (matriz ? geoUrlGoogleMaps(matriz, { latitud: lat, longitud: lon }) : '')
    };
}

function _ubicacionesLocales() {
    const mp = GEO_PRECARGADAS.find(s => s.id_sucursal === MATRIZ_ID);
    const propia = _leer(GEO_KEY_PROPIA, null);
    const matriz = _normalizarUbicacion({ ...mp, distancia_matriz_km: 0, tiempo_estimado_min: 0, en_linea: true, estado_conexion: 'EN LÍNEA (Servidor Matriz)' }, null);
    const sucursales = GEO_PRECARGADAS.filter(s => s.id_sucursal !== MATRIZ_ID).map(s => {
        const base = (propia && Number(propia.id_sucursal) === s.id_sucursal) ? { ...s, ...propia } : s;
        return _normalizarUbicacion({ ...base, en_linea: false, estado_conexion: 'Sin conexión con la Matriz' }, matriz);
    });
    return { matriz, sucursales };
}

/* Ranking de la sucursal más cercana a la más lejana (se arma aquí si la Matriz no lo manda). */
function geoRanking(sucursales) {
    return sucursales.filter(s => s.id_sucursal !== MATRIZ_ID && Number.isFinite(s.distancia_matriz_km))
        .sort((a, b) => a.distancia_matriz_km - b.distancia_matriz_km)
        .map(s => ({ id_sucursal: s.id_sucursal, nombre: s.nombre, distancia_matriz_km: s.distancia_matriz_km, tiempo_estimado_min: s.tiempo_estimado_min }));
}

/* PDF punto 16 — GET /api/sucursales/ubicaciones (con alias /api/geolocalizacion). */
async function apiUbicacionesMatriz() {
    let data = null, ultimoError = null;
    for (const ruta of ['/api/sucursales/ubicaciones', '/api/geolocalizacion']) {
        try { data = await _fetchMatriz(ruta); break; } catch (e) { ultimoError = e; if (!/HTTP 404/.test(String(e.message))) break; }
    }

    if (data) {
        const m = data.matriz ? _normalizarUbicacion({ ...data.matriz, en_linea: data.matriz.en_linea ?? true }, null) : _ubicacionesLocales().matriz;
        let lista = Array.isArray(data.sucursales) ? data.sucursales : (Array.isArray(data) ? data : []);
        let sucursales = lista.map(x => _normalizarUbicacion(x, m)).filter(s => s.id_sucursal !== MATRIZ_ID && Number.isFinite(s.id_sucursal));
        // Si el servidor mandó solo algunas, completo con las precargadas (marcadas sin conexión).
        const presentes = new Set(sucursales.map(s => s.id_sucursal));
        _ubicacionesLocales().sucursales.forEach(s => { if (!presentes.has(s.id_sucursal)) sucursales.push(s); });
        sucursales.sort((a, b) => a.id_sucursal - b.id_sucursal);
        const ranking = Array.isArray(data.ranking_cercania) && data.ranking_cercania.length ? data.ranking_cercania : geoRanking(sucursales);
        const res = { origen: 'matriz', errorRed: null, matriz: m, sucursales, ranking, actualizado: new Date().toISOString(), raw: data };
        _guardar(GEO_KEY_CACHE, res);
        MATRIZ_CONECTADA = true;
        return res;
    }

    if (ultimoError && _esErrorDeRed(ultimoError)) MATRIZ_CONECTADA = false;
    const cache = _leer(GEO_KEY_CACHE, null);
    if (cache) return { ...cache, origen: 'cache', errorRed: _mensajeAmigable(ultimoError) };
    const loc = _ubicacionesLocales();
    return { origen: 'local', errorRed: _mensajeAmigable(ultimoError), matriz: loc.matriz, sucursales: loc.sucursales, ranking: geoRanking(loc.sucursales), actualizado: null, raw: null };
}

/* PDF punto 17 — POST /api/sucursales/ubicacion. Latitud/longitud van como decimales (float). */
async function apiActualizarUbicacionMatriz(idSucursal, latitud, longitud, direccion) {
    const lat = parseFloat(latitud), lon = parseFloat(longitud);
    if (!Number.isFinite(lat) || lat < -90 || lat > 90) return { error: true, mensaje: 'Latitud inválida (debe estar entre -90 y 90).' };
    if (!Number.isFinite(lon) || lon < -180 || lon > 180) return { error: true, mensaje: 'Longitud inválida (debe estar entre -180 y 180).' };
    if (!String(direccion || '').trim()) return { error: true, mensaje: 'Escribe la dirección o referencia de la sucursal.' };
    try {
        const data = await _fetchMatriz('/api/sucursales/ubicacion', {
            method: 'POST',
            body: { id_sucursal: Number(idSucursal), latitud: lat, longitud: lon, direccion: String(direccion).trim() }
        });
        MATRIZ_CONECTADA = true;
        if (Number(idSucursal) === Number(SUCURSAL_ACTUAL.id)) {
            _guardar(GEO_KEY_PROPIA, { id_sucursal: Number(idSucursal), latitud: lat, longitud: lon, direccion: String(direccion).trim() });
        }
        return { error: false, ...data };
    } catch (e) {
        if (_esErrorDeRed(e)) MATRIZ_CONECTADA = false;
        return { error: true, mensaje: _mensajeAmigable(e) };
    }
}

/* =====================================================================
   HEARTBEAT (PDF "Reglas Generales de Conexión")
   Cada petición con el id de mi sucursal me marca "EN LÍNEA" en el mapa
   de la Matriz. Mientras haya una pantalla abierta se hace una consulta
   ligera cada 45 s para seguir apareciendo en línea.
   ===================================================================== */
let _heartbeatTimer = null;
async function heartbeatMatriz() {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
    try {
        await _fetchMatriz(`/api/historial?sucursal=${Number(SUCURSAL_ACTUAL.id)}&_heartbeat=${Date.now()}`);
        MATRIZ_CONECTADA = true;
    } catch (e) {
        if (_esErrorDeRed(e)) MATRIZ_CONECTADA = false;
    }
}
function iniciarHeartbeatMatriz(ms = 45000) {
    if (_heartbeatTimer) return;
    heartbeatMatriz();
    _heartbeatTimer = setInterval(heartbeatMatriz, ms);
}
if (typeof window !== 'undefined' && typeof ES_MATRIZ !== 'undefined' && !ES_MATRIZ) iniciarHeartbeatMatriz();

/* =====================================================================
   SINCRONIZAR MI INVENTARIO CON LA MATRIZ
   Cuando la Matriz aprueba un traslado / envía mercancía / acepta un préstamo,
   ella actualiza SU base. Aquí se baja `GET /api/inventario?sucursal=ID` y se
   refleja en el almacén local (lo que subió se registra como ENTRADA).
   ===================================================================== */
async function apiSincronizarInventarioPropio() {
    const yo = Number(SUCURSAL_ACTUAL.id);
    try { await apiPrestamosRed(); } catch (e) { /* si falla, se sigue con el inventario */ }
    let data;
    try { data = await _fetchMatriz(`/api/inventario?sucursal=${yo}`); }
    catch (e) { if (_esErrorDeRed(e)) MATRIZ_CONECTADA = false; return { error: true, mensaje: _mensajeAmigable(e), cambios: [] }; }

    const leido = _leerInventarioSucursal(data);
    if (!leido.reconocido) return { error: true, mensaje: 'La Matriz respondió en un formato de inventario que no reconozco.', cambios: [] };

    const inv = _leer(DB.INVENTARIO, []);
    const cambios = [];
    leido.items.forEach(it => {
        const nuevo = Number(it.stock || 0);
        const r = inv.find(x => x.id_sucursal === yo && x.sku_id === it.sku_id);
        if (r) {
            const antes = Number(r.cantidad_actual || 0);
            if (!r.demo && nuevo > antes) cambios.push({ sku: it.sku_id, cantidad: nuevo - antes });
            r.cantidad_actual = nuevo; delete r.demo;
        } else {
            inv.push({ sku_id: it.sku_id, id_sucursal: yo, cantidad_actual: nuevo });
        }
    });
    _guardar(DB.INVENTARIO, inv);
    cambios.forEach(c => _registrarMovimiento({
        id_sucursal: yo, sku_id: c.sku, cantidad: c.cantidad, tipo_movimiento: 'ENTRADA',
        folio_referencia: _folio('SYNC'), descripcion: 'Mercancía recibida de Matriz (sincronización de inventario)'
    }));
    MATRIZ_CONECTADA = true;
    MATRIZ_ULTIMA_SINCRONIZACION = new Date().toISOString();
    return { error: false, cambios };
}
