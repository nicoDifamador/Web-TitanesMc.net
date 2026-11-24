require('dotenv').config();
const express = require('express');
const path = require('node:path');
const { leerConfiguracionTienda, calcularPrecioOrden } = require('./store-pricing');
const { obtenerProducto, normalizarSku } = require('./delivery-catalog');
const {
    obtenerTokenPayPal,
    verificarFirmaWebhookPayPal,
    verificarCapturaPayPal
} = require('./paypal');
const {
    guardarOrden,
    obtenerOrden,
    actualizarOrden,
    iniciarEntrega,
    obtenerEntrega,
    registrarComandoEntregado,
    completarEntrega,
    fallarEntrega
} = require('./payment-store');

const ROOT_DIR = __dirname;
const DEFAULT_HOST = '0.0.0.0';
const DEFAULT_PORT = 3000;

const app = express();
app.disable('x-powered-by');
// Nginx runs next to the process, so only loopback proxy headers are trusted by
// default. This keeps X-Forwarded-* useful without trusting arbitrary clients.
app.set('trust proxy', process.env.TRUST_PROXY || 'loopback');
app.use(express.json({ limit: '32kb' }));

function leerPuerto() {
    const valor = process.env.SERVER_PORT || process.env.PORT || String(DEFAULT_PORT);
    const puerto = Number.parseInt(valor, 10);
    if (!Number.isInteger(puerto) || puerto < 0 || puerto > 65535) {
        throw new Error(`Puerto inválido: ${valor}`);
    }
    return puerto;
}

function obtenerOrigenesPermitidos() {
    return [process.env.SITE_ORIGIN, process.env.SITE_ORIGINS]
        .filter(Boolean)
        .flatMap((valor) => valor.split(','))
        .map((valor) => valor.trim().replace(/\/$/, ''))
        .filter(Boolean);
}

app.get('/healthz', (_req, res) => {
    res.status(200).json({ status: 'ok' });
});

const rutasPrivadas = new Set([
    '/server.js',
    '/package.json',
    '/package-lock.json',
    '/payment-store.js',
    '/paypal.js',
    '/store-pricing.js',
    '/delivery-catalog.js',
    '/README.md',
    '/CONFIGURACION.md',
    '/SEGURIDAD.md',
    '/CHANGELOG.md',
    '/.env',
    '/.env.example',
    '/.gitignore',
    '/Dockerfile'
]);
app.use((req, res, next) => {
    if (rutasPrivadas.has(req.path) || req.path === '/test' || req.path.startsWith('/test/')) {
        return res.sendStatus(404);
    }
    next();
});

const publicRoot = ROOT_DIR;
const publicPages = [
    'tienda.html',
    'protecciones.html',
    'rangos-supremos.html',
    'llaves.html',
    'items.html'
];

function configuracionPublica() {
    const configuracion = leerConfiguracionTienda();
    return {
        currency: configuracion.currency,
        apiBaseUrl: configuracion.apiBaseUrl || '',
        paypal: { clientId: configuracion.paypal?.clientId || '' },
        discounts: configuracion.discounts,
        products: configuracion.products,
        site: configuracion.site,
        design: configuracion.design
    };
}

app.get('/', (_req, res) => res.sendFile(path.join(publicRoot, 'index.html')));
for (const page of publicPages) {
    app.get(`/${page}`, (_req, res) => res.sendFile(path.join(publicRoot, page)));
}
app.get('/config.json', (_req, res) => {
    try {
        res.setHeader('Cache-Control', 'no-store');
        return res.json(configuracionPublica());
    } catch (error) {
        console.error('[PUBLIC CONFIG ERROR]', error.message);
        return res.status(500).json({ error: 'No se pudo cargar la configuración pública' });
    }
});
for (const directory of ['css', 'img', 'java']) {
    app.use(`/${directory}`, express.static(path.join(publicRoot, directory), {
        dotfiles: 'deny',
        fallthrough: true,
        index: false
    }));
}

function leerSecretoObligatorio(nombre) {
    const valor = process.env[nombre];
    if (!valor || /^replace_with_/i.test(valor)) {
        throw new Error(`${nombre} environment variable is required and cannot use a placeholder`);
    }
    return valor;
}

function entregaAutomaticaHabilitada() {
    return /^(1|true|yes|on)$/i.test(process.env.AUTO_DELIVERY_ENABLED || 'false');
}

function leerConfiguracionPanel() {
    const host = process.env.PANEL_HOST;
    const serverId = process.env.SERVER_ID;
    if (!host || !/^https:\/\//i.test(host)) {
        throw new Error('PANEL_HOST debe ser una URL HTTPS cuando la entrega automática está activada');
    }
    if (!serverId || /^replace_with_/i.test(serverId)) {
        throw new Error('SERVER_ID es obligatorio cuando la entrega automática está activada');
    }
    return {
        host: host.replace(/\/$/, ''),
        apiKey: leerSecretoObligatorio('PANEL_API_KEY'),
        serverId
    };
}

const autoDeliveryEnabled = entregaAutomaticaHabilitada();
const panelConfig = autoDeliveryEnabled ? leerConfiguracionPanel() : null;

function registrarCorsTienda(req, res, next) {
    const origin = req.get('Origin');
    if (!origin) return next();

    const origenServidor = `${req.protocol}://${req.get('host')}`;
    const origenesPermitidos = obtenerOrigenesPermitidos();
    if (origin !== origenServidor && !origenesPermitidos.includes(origin)) {
        return res.status(403).json({ error: 'Origen no autorizado' });
    }
    if (origin !== origenServidor) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Vary', 'Origin');
    }
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
}

async function crearOrdenPayPal(configuracion, total, jugador, items, coupon, fetcher = fetch) {
    const token = await obtenerTokenPayPal(configuracion, fetcher);
    const baseUrl = process.env.PAYPAL_MODE === 'live'
        ? 'https://api-m.paypal.com'
        : 'https://api-m.sandbox.paypal.com';
    const orderResponse = await fetcher(`${baseUrl}/v2/checkout/orders`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            intent: 'CAPTURE',
            purchase_units: [{
                custom_id: jugador,
                description: 'Compra en la tienda de TITANES MC',
                amount: {
                    currency_code: configuracion.currency,
                    value: total.toFixed(2)
                }
            }]
        })
    });
    const orderResult = await orderResponse.json();
    if (!orderResponse.ok || !orderResult.id) {
        throw new Error(`PayPal no pudo crear la orden (HTTP ${orderResponse.status})`);
    }

    guardarOrden(orderResult.id, {
        player: jugador,
        items: items.map((item) => ({ name: item.name, quantity: item.quantity })),
        coupon,
        total: total.toFixed(2),
        currency: configuracion.currency,
        status: 'created'
    });
    return orderResult.id;
}

async function ejecutarComandoMinecraft(comando, fetcher = fetch) {
    const url = `${panelConfig.host}/api/client/servers/${panelConfig.serverId}/command`;

    const maxIntentos = Number.parseInt(process.env.PANEL_RETRY_ATTEMPTS || '3', 10);
    const timeoutMs = Number.parseInt(process.env.PANEL_REQUEST_TIMEOUT_MS || '10000', 10);
    let ultimoError;
    for (let intento = 1; intento <= Math.max(1, maxIntentos); intento += 1) {
        try {
            const respuesta = await fetcher(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${panelConfig.apiKey}`,
                    'Accept': 'application/json'
                },
                body: JSON.stringify({ command: comando }),
                signal: AbortSignal.timeout(timeoutMs)
            });

            if (!respuesta.ok) {
                const errorText = await respuesta.text();
                throw new Error(`HTTP ${respuesta.status}: ${errorText}`);
            }

            console.log(`[PANEL API] Comando ejecutado en consola: "${comando}"`);
            return;
        } catch (error) {
            ultimoError = error;
            console.error(`[PANEL ERROR] Intento ${intento}/${maxIntentos}:`, error.message);
            if (intento < Math.max(1, maxIntentos)) {
                await new Promise((resolve) => setTimeout(resolve, Math.min(250 * intento, 1000)));
            }
        }
    }

    throw new Error(`No se pudo entregar el comando al panel: ${ultimoError.message}`);
}

function esNombreJugadorValido(nombre) {
    return typeof nombre === 'string' && nombre.length >= 3 &&
        nombre.length <= 16 && /^[A-Za-z0-9_]+$/.test(nombre);
}

app.options('/api/paypal/orders', registrarCorsTienda);
app.post('/api/paypal/orders', registrarCorsTienda, async (req, res) => {
    let configuracion;
    let total;
    let coupon;
    try {
        configuracion = leerConfiguracionTienda();
        const jugador = req.body.player;
        if (!esNombreJugadorValido(jugador)) {
            return res.status(400).json({ error: 'El nombre del jugador no es válido' });
        }
        coupon = typeof req.body.coupon === 'string' ? req.body.coupon.trim().toUpperCase() : '';
        total = calcularPrecioOrden(configuracion, req.body.items, coupon);
    } catch (error) {
        return res.status(400).json({ error: error.message });
    }

    try {
        const id = await crearOrdenPayPal(
            configuracion,
            total,
            req.body.player,
            req.body.items,
            coupon,
            app.locals.fetcher || fetch
        );
        return res.json({ id, total: total.toFixed(2), currency: configuracion.currency });
    } catch (error) {
        console.error('[PAYPAL ORDER ERROR]', error.message);
        return res.status(502).json({ error: 'No se pudo crear la orden de PayPal' });
    }
});

// Webhook para procesar las compras de PayPal
app.post('/webhook/paypal', async (req, res) => {
    const evento = req.body;
    const detallesPago = evento.resource || {};
    const jugadorReportado = detallesPago.custom_id;
    if (jugadorReportado !== undefined && !esNombreJugadorValido(jugadorReportado)) {
        return res.status(400).json({ error: 'El nombre del jugador no es válido' });
    }

    if (evento.event_type === 'CHECKOUT.ORDER.APPROVED') {
        const orderId = detallesPago.id;
        if (!orderId || !obtenerOrden(orderId)) {
            return res.status(400).json({ error: 'Orden de PayPal desconocida' });
        }
        try {
            const configuracion = leerConfiguracionTienda();
            if (!await verificarFirmaWebhookPayPal(req, configuracion, app.locals.fetcher || fetch)) {
                return res.status(400).json({ error: 'Firma de PayPal inválida' });
            }
            actualizarOrden(orderId, { status: 'approved' });
            return res.status(200).send('OK');
        } catch (error) {
            console.error('[PAYPAL WEBHOOK ERROR]', error.message);
            return res.status(400).json({ error: 'No se pudo verificar el webhook de PayPal' });
        }
    }

    if (evento.event_type !== 'PAYMENT.CAPTURE.COMPLETED') return res.status(200).send('IGNORED');

    const captureId = detallesPago.id;
    const orderId = detallesPago.supplementary_data?.related_ids?.order_id;
    const eventId = evento.id || captureId;
    const order = orderId ? obtenerOrden(orderId) : null;
    if (!captureId || !orderId || !order) {
        return res.status(400).json({ error: 'La captura de PayPal no está vinculada a una orden válida' });
    }
    if (!esNombreJugadorValido(order.player)) {
        return res.status(400).json({ error: 'El nombre del jugador no es válido' });
    }

    let configuracion;
    try {
        configuracion = leerConfiguracionTienda();
        if (!await verificarFirmaWebhookPayPal(req, configuracion, app.locals.fetcher || fetch)) {
            return res.status(400).json({ error: 'Firma de PayPal inválida' });
        }
        await verificarCapturaPayPal(configuracion, captureId, orderId, {
            total: order.total,
            currency: order.currency
        }, app.locals.fetcher || fetch);
    } catch (error) {
        console.error('[PAYPAL VERIFICATION ERROR]', error.message);
        return res.status(400).json({ error: 'El pago de PayPal no pudo verificarse' });
    }

    if (!autoDeliveryEnabled) {
        actualizarOrden(orderId, {
            status: 'paid_delivery_disabled',
            captureId,
            paidAt: new Date().toISOString()
        });
        console.log(`[DELIVERY DISABLED] Pago verificado para la orden ${orderId}; no se ejecutaron comandos`);
        return res.status(200).send('DELIVERY_DISABLED');
    }

    const comandos = [];
    const productos = [];
    for (const item of order.items || []) {
        const sku = normalizarSku(item.name);
        const producto = obtenerProducto(sku);
        if (!producto || !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 99) {
            return res.status(400).json({ error: 'SKU o cantidad de producto no válidos' });
        }
        productos.push(sku);
        for (let cantidad = 0; cantidad < item.quantity; cantidad += 1) {
            comandos.push(...producto.comandos(order.player));
        }
    }
    if (comandos.length === 0) return res.status(400).json({ error: 'La orden no contiene productos' });

    let entrega;
    try {
        entrega = iniciarEntrega({
            eventId,
            captureId,
            orderId,
            player: order.player,
            productKey: productos.join(',')
        });
    } catch (error) {
        console.error('[PAYMENT STATE ERROR]', error.message);
        return res.status(500).json({ error: 'No se pudo registrar el evento de pago' });
    }
    if (entrega.duplicate) return res.status(200).send('DUPLICATE');

    const estadoEntrega = obtenerEntrega(entrega.eventKey);
    try {
        let siguienteComando = estadoEntrega.nextCommand;
        for (; siguienteComando < comandos.length; siguienteComando += 1) {
            await ejecutarComandoMinecraft(comandos[siguienteComando], app.locals.fetcher || fetch);
            registrarComandoEntregado(entrega.eventKey, siguienteComando + 1);
        }
        completarEntrega(entrega.eventKey);
        actualizarOrden(orderId, { status: 'delivered', captureId });
    } catch (error) {
        fallarEntrega(entrega.eventKey, error);
        actualizarOrden(orderId, { status: 'delivery_failed', captureId, deliveryError: error.message });
        return res.status(503).json({ error: 'La entrega está pendiente de reintento' });
    }

    return res.status(200).send('OK');
});

function iniciarServidor() {
    const host = process.env.HOST || DEFAULT_HOST;
    const port = leerPuerto();
    const server = app.listen(port, host, () => {
        const direccion = server.address();
        const puertoReal = typeof direccion === 'object' && direccion ? direccion.port : port;
        console.log(`🚀 Servidor TITANES MC escuchando en ${host}:${puertoReal}`);
        console.log(`[DELIVERY] Entrega automática ${autoDeliveryEnabled ? 'activada' : 'desactivada'}`);
    });
    server.once('error', (error) => {
        console.error(`[SERVER] Error de escucha en ${host}:${port}: ${error.message}`);
        process.exitCode = 1;
    });

    let apagando = false;
    const apagar = (signal) => {
        if (apagando) return;
        apagando = true;
        console.log(`[SERVER] Recibido ${signal}; iniciando apagado ordenado`);
        const timeout = setTimeout(() => {
            console.error('[SERVER] Tiempo de apagado agotado; cerrando conexiones');
            server.closeAllConnections?.();
            process.exitCode = 1;
        }, 10000);
        timeout.unref();
        server.close((error) => {
            clearTimeout(timeout);
            if (error) {
                console.error('[SERVER] Error durante el apagado:', error.message);
                process.exitCode = 1;
                return;
            }
            console.log('[SERVER] Servidor detenido correctamente');
        });
    };

    process.once('SIGTERM', () => apagar('SIGTERM'));
    process.once('SIGINT', () => apagar('SIGINT'));
    return server;
}

if (require.main === module) {
    try {
        iniciarServidor();
    } catch (error) {
        console.error(`[SERVER] No se pudo iniciar: ${error.message}`);
        process.exitCode = 1;
    }
}

module.exports = app;
module.exports.iniciarServidor = iniciarServidor;
module.exports.leerPuerto = leerPuerto;
