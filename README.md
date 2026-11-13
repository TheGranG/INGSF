# ElectroStock — Versión DEMO (sin login, sin base de datos)

## Qué cambié y por qué

Tu sistema original (**SealAuto**) ya traía todo el flujo funcionando: venta,
inventario, sucursales, pedidos a matriz, préstamos, usuarios y reportes.
Lo que hice fue:

1. **Rebranding a electrónica/refacciones (tipo Steren):**
   El catálogo de ejemplo en `db.js` ahora tiene productos como cables HDMI,
   multímetros, cautines, cargadores, routers, memorias USB, etc. Los textos
   "SealAuto" y "pieza automotriz" se cambiaron por "ElectroStock" y lenguaje
   de electrónica. El diseño (colores morado/oscuro) se dejó igual porque
   funciona perfectamente para cualquier giro.

2. **Se quitó el login por completo:**
   Ya no existe la pantalla de usuario/contraseña ni `sessionStorage`.
   En su lugar, cada copia del sistema sabe "quién es" por el archivo
   `config.js` (ver abajo). Esto es más simple para que cada uno de los 9
   equipos corra su propia copia sin necesitar un servidor de autenticación.

3. **Se quitó la base de datos (Supabase + PHP):**
   Ya no hay ningún `fetch('api_algo.php')` ni llamadas directas a Supabase
   (incluyendo una **API key que estaba expuesta en el código fuente** — ya
   no existe, era buena práctica quitarla de todas formas). Todo el "backend"
   ahora es el archivo `db.js`, que simula la base de datos completa
   (productos, inventario por sucursal, ventas, préstamos, pedidos,
   usuarios, movimientos) usando `localStorage` del navegador. Los datos
   persisten al recargar la página, pero solo en esa máquina/navegador.

4. **No se rompió ninguna función:** cada botón, modal, cotizador,
   validación y flujo de negocio que ya tenías (viabilidad de surtido,
   preéstamos con contraoferta, pedidos a matriz, etc.) sigue funcionando
   igual, solo que contra datos locales en vez del backend real.

## Archivos

```
config.js       <- CADA equipo edita SOLO este archivo (su número de sucursal)
db.js           <- "Base de datos" simulada (léelo, tiene comentarios de cómo
                    migrar cada función a tu backend real cuando lo tengan)
venta.html
inventario.html
sucursales.html
pedidos.html
prestamos.html
usuarios.html
reportes.html
```

### `config.js` — lo único que cada equipo debe tocar

```js
const SUCURSAL_ACTUAL = { id: 6, nombre: 'Sucursal Oriente' };
const ES_MATRIZ = false; // true solo para el equipo 4
```

- Equipos 1, 2, 3, 5, 6, 7, 8, 9 → una copia cada uno, cambiando `id`/`nombre`.
- Equipo 4 (Central) → `id: 4`, `ES_MATRIZ: true`. Ojo: las pantallas de
  aprobación de pedidos del lado Central (para pasar un pedido de
  `PENDIENTE` a `SALIDA`) no venían en los archivos originales — dejé lista
  la función `apiAprobarPedidoMatriz()` en `db.js` para que el equipo 4
  arme su propia pantalla de "Central" sobre esa base.

### Cuando tengan su backend real

`db.js` está separado justamente para que la migración sea sencilla: cada
función (`apiInventarioLocal`, `apiProcesarVenta`, `apiSolicitarPrestamo`,
etc.) tiene una entrada y una salida ya definidas. Cuando tengan su API
real, solo reemplazan el contenido de esas funciones por un `fetch(...)`
a su endpoint — los 7 HTML no necesitan tocarse.

## Cómo correr la versión de escritorio (con VS Code)

Estos archivos son HTML/CSS/JS puro, así que tienes dos caminos:

**Opción rápida (para probar ya):**
1. Abre la carpeta en VS Code.
2. Instala la extensión **"Live Server"** (Ritwick Dey).
3. Click derecho sobre `venta.html` → "Open with Live Server".
4. Navega entre las páginas con el menú lateral igual que antes.

**Opción "app de escritorio" real (recomendada para la entrega):**
Empaca estos mismos archivos con **Electron**:
```bash
npm init -y
npm install --save-dev electron
```
Crea un `main.js` mínimo que abra una `BrowserWindow` cargando `venta.html`,
agrega `"start": "electron ."` a tu `package.json`, y listo: tienes un
`.exe`/`.app` de escritorio sin cambiar nada del HTML. Cuando quieras
distribuirlo, `electron-builder` genera el instalador.

## Cómo correr la versión "app" (móvil)

Como también es HTML/CSS/JS, la ruta más directa (sin reescribir nada) es
envolver estos archivos con **Capacitor**:
```bash
npm install @capacitor/core @capacitor/cli
npx cap init
npx cap add android
npx cap add ios
npx cap open android   # o ios
```
Eso te da un proyecto Android/iOS nativo que carga tus HTML tal cual, y
desde ahí lo compilas en Android Studio / Xcode. Alternativa más simple
(sin instalar SDKs): convertir esto en una **PWA** (agregar `manifest.json`
+ `service-worker.js`) para que se pueda "instalar" desde Chrome en
Android — no da un `.apk`, pero es funcional como app en el celular.

## Nota sobre la red real entre sucursales

Con `localStorage` cada copia vive aislada en su propio navegador/máquina —
es perfecto para desarrollar y probar cada pantalla, pero **no sincroniza
entre equipos**. Para que las 8 sucursales y la Central compartan
inventario/préstamos/pedidos de verdad, van a necesitar sí o sí un backend
central (puede ser el mismo Supabase que tenían, o cualquier otro: Firebase,
un servidor Node/Express con Postgres, etc.) — este demo les deja la
interfaz y la lógica de negocio ya resueltas, solo falta conectar `db.js`
a ese servicio cuando lo tengan listo.


## Conexión con Matriz — Equipo 7

Se integró la API proporcionada para la práctica:
- Base: `https://delicate-uphold-consumer.ngrok-free.dev`
- Sucursal actual: **7**
- Catálogo oficial: `GET /api/catalogo`
- Disponibilidad global: `GET /api/inventario?sku=...`
- Traspasos: `POST /api/traslados`
- Historial: `GET /api/historial?sucursal=7`
- Ventas: `POST /api/ventas`
- Ganancias: `GET /api/ganancias`

Se agregó `matriz.html` para probar conexión, sincronizar catálogo/inventario, consultar stock global, consultar historial y mostrar ganancias.

La pantalla **Pedidos** ahora envía solicitudes reales de traspaso desde Matriz (ID 4) hacia Sucursal 7. **Venta** reporta cada línea de venta a la Matriz antes de registrar el descuento local.

Importante: el servidor debe permitir CORS desde el navegador. Si Ngrok/API no responde, la aplicación conserva sus datos locales, pero las operaciones que requieren confirmación de Matriz mostrarán el error de conexión.

---

## Etapa 2 — Consulta de red y préstamos (Equipo 7)

**Sucursales** (`sucursales.html`) ahora tiene 4 pestañas:
1. **Inventario Matriz** — stock de todos los productos en el Almacén Matriz.
2. **Otras Sucursales** — mismo listado para cualquier sucursal (selector).
3. **Un Producto** — escribes el producto y cuántas piezas pide el cliente. Compara contra tu stock,
   calcula cuántas te faltan y te muestra directo la sucursal con MÁS disponibilidad que las cubre
   (no cuenta la tuya ni la Matriz; la Matriz aparece aparte con enlace a Pedidos). Si ninguna alcanza sola,
   sugiere una combinación de varias.
4. **Varios Productos** — igual, con una lista. Recomienda la sucursal que surte todo en un solo viaje
   (la de mayor sobrante) o, si no hay, un plan alterno por producto.

**Préstamos** (`prestamos.html`) usa la Matriz: `POST /api/prestamos`, `GET /api/prestamos/activos`
y `POST /api/devoluciones`. Botón **Nuevo Préstamo** (me prestaron / presté) y **Registrar Devolución**.

**Venta**: cuando falta stock, "Consultar Red" abre la misma consulta en vivo, ya con la sucursal de
mayor disponibilidad elegida; al registrar el préstamo tu almacén sube y puedes seguir vendiendo.

### Reglas importantes
- Los datos de red son EN VIVO (`GET /api/inventario?sku=`). Se guardan en caché por si la Matriz se cae
  (la pantalla indica "SIN CONEXIÓN · datos guardados").
- Registrar un préstamo mueve **tu** almacén al momento (recibes: +; entregas: −). Si la Matriz no responde,
  queda "SIN REGISTRAR EN MATRIZ" y se reenvía al actualizar Préstamos. Si la Matriz lo **rechaza**
  (ej. stock insuficiente) no se registra nada.
- La devolución requiere conexión con la Matriz. Si la otra sucursal registra la devolución, tu almacén se
  ajusta una sola vez al actualizar.
- Si "Otras Sucursales" o la búsqueda salen vacías: abre Matriz → Consultar un SKU → "Ver respuesta de la Matriz" (o el aviso de la propia pantalla) para ver qué responde el servidor.
- Pendiente de confirmar con el equipo 4: si la Matriz mueve el stock por sí sola al registrar un préstamo.

### Android (assets)
Reemplaza en `app/src/main/assets/`: `db.js`, `sucursales.html`, `prestamos.html`, `venta.html`,
`inventario.html`, `pedidos.html`, `reportes.html`, `usuarios.html`.

### Actualización: endpoints de la 2ª etapa
- **Inventario Matriz / Otras Sucursales** usan `GET /api/inventario?sucursal=ID` (1 petición por consulta).
- **Un Producto** usa `GET /api/inventario?sku=`; **Varios Productos** usa `GET /api/inventario?skus=A,B` (si el servidor no lo soporta, cae a producto por producto).
- Si la Matriz contesta pero una sucursal no tiene inventario registrado, la pantalla lo dice ("Sin inventario registrado") en vez de mostrar ceros.
- Cada resultado trae "Ver lo que respondió la Matriz" para comprobar qué devuelve el servidor.

---

## Etapa final — Documentación actualizada de la Matriz (préstamos con autorización + geolocalización)

Se integró todo el PDF "Documentación Oficial de la API — Sistema Matriz ITCV (Actualizada con Geolocalización)".

### Cobertura de endpoints (18 puntos del PDF)
| # | Endpoint | Dónde se usa |
|---|----------|--------------|
| 1 | `GET /api/catalogo` | Matriz, Venta, Inventario |
| 2 | `GET /api/inventario?sku=` / `?skus=` / `?sucursal=` | Sucursales (4 pestañas) |
| 3 | `POST /api/traslados` | Pedidos |
| 4 | `GET /api/historial?sucursal=` | Matriz (también es el *heartbeat*) |
| 5 / 6 | `POST` / `GET /api/ventas` | Venta · Matriz → "Mis ventas y devoluciones" |
| 7 | `POST /api/entradas-inventario` | Inventario (reabastecimiento) |
| 8 | `GET /api/movimientos?sucursal=` | Matriz → "Movimientos de stock" |
| 9 | `GET /api/ganancias` | Matriz → ranking |
| 10 | `POST /api/prestamos` | Préstamos (flujo nuevo, abajo) |
| 11 | `GET /api/prestamos/activos` y `/solicitudes` | Préstamos |
| 12 | `POST /api/devoluciones` | Préstamos |
| 13 | `POST /api/pagos` | Matriz → "Enviar pago o abono" |
| 14 / 15 | `GET /api/envios?sucursal=` / `POST /api/envios/actualizar` | Matriz → "Paquetes en camino" |
| 16 | `GET /api/sucursales/ubicaciones` (alias `/api/geolocalizacion`) | **Mapa** |
| 17 | `POST /api/sucursales/ubicacion` | **Mapa** → "Actualizar GPS de mi sucursal" |
| 18 | `GET /mapa` | **Mapa** → pestaña "Torre de Control" (iframe) + botón para abrir en navegador |

### Préstamos: flujo nuevo (PENDIENTE → ACTIVO)
1. Al pedir/ofrecer un préstamo se hace el mismo `POST /api/prestamos` y la Matriz responde `PENDIENTE`.
2. **El stock local NO se mueve en ese momento.** La solicitud aparece en la tabla *Solicitudes pendientes* de **Préstamos**.
3. Cuando la Matriz presiona **"✔ Aceptar y Transferir"**, el préstamo pasa a `ACTIVO` y entonces (al abrir/actualizar Préstamos o sincronizar con Matriz) tu almacén sube o baja, **una sola vez**.
4. Si la solicitud desaparece sin activarse (rechazada), no se mueve nada.
5. Si no hay conexión al crearla, queda como `SIN REGISTRAR EN MATRIZ` y se reenvía sola al actualizar.

### Mapa y geolocalización (`mapa.html`, nuevo)
- Tarjetas: sedes geolocalizadas, equipos activos, sucursal más cercana, radio de cobertura.
- Mapa Leaflet con las 9 sedes (verde = en línea, azul = en espera, morado = mi sucursal), círculo de cobertura, líneas a la Matriz, popups con distancia/tiempo y botón **Trazar ruta en Google Maps** (`https://www.google.com/maps/dir/?api=1&origin=…&destination=…&travelmode=driving`).
- Tabla de coordenadas + ranking de cercanía + exportar a CSV.
- Formulario para **actualizar el GPS de tu sucursal** (puedes usar el GPS del dispositivo).
- Pestaña **Torre de Control** que incrusta `/mapa` de la Matriz.
- Si la Matriz no responde se usan las coordenadas precargadas del Anexo y la distancia se calcula localmente (Haversine × 1.22, el mismo ajuste que muestra la Matriz).
- **Heartbeat:** mientras haya una pantalla abierta se hace una consulta ligera (`/api/historial?sucursal=7`) cada 45 s para aparecer *EN LÍNEA* en el mapa de la Matriz.

### Android (assets)
Además de los archivos de la etapa anterior, copia `mapa.html` y `matriz.html`, y agrega `ACCESS_FINE_LOCATION` al manifiesto si quieres usar el botón "GPS de este dispositivo".

### Corrección: página de aviso de ngrok y pedidos a Matriz
- Los GET llegaban como HTML (`ERR_NGROK_6024`), no como JSON. Ahora todas las peticiones llevan `ngrok-skip-browser-warning: true` y una respuesta HTML se trata como error de conexión (ya no como "sin sucursales").
- **Pedidos**: el rastreo ahora lee en vivo `GET /api/historial?sucursal=7` (PENDIENTE / APROBADO / DENEGADO) y `GET /api/envios?sucursal=7` (con botón *Confirmar recepción*), y cada 30 s baja `GET /api/inventario?sucursal=7` para reflejar en tu almacén lo que la Matriz aprobó o envió.
- Si el servidor de la Matriz no permite ese header en CORS, el equipo 4 debe agregarlo a `Access-Control-Allow-Headers` (Flask-CORS lo permite por defecto) o iniciar ngrok con `--request-header-add "ngrok-skip-browser-warning:1"`.
