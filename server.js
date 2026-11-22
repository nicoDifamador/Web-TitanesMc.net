require('dotenv').config();
const express = require('express');
const { leerConfiguracionTienda, calcularPrecioOrden } = require('./store-pricing');
const { obtenerProducto, normalizarSku } = require('./delivery-catalog');
const {
    iniciarEntrega,
    obtenerEntrega,
    registrarComandoEntregado,
    completarEntrega,
    fallarEntrega
} = require('./payment-store');

const app = express();
app.use(express.json());

const panelConfig = {
    host: process.env.PANEL_HOST || 'http://2.26.161.71',
    apiKey: process.env.PANEL_API_KEY,
    serverId: process.env.SERVER_ID || '4b02f2cb'
};
if (!panelConfig.apiKey) {
    throw new Error('PANEL_API_KEY environment variable is required');
}

function registrarCorsTienda(req, res, next) {
    const origin = req.get('Origin');
    if (!origin) return next();

    const origenServidor = `${req.protocol}://${req.get('host')}`;
    if (origin !== origenServidor && origin !== process.env.SITE_ORIGIN) {
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

async function crearOrdenPayPal(configuracion, total, jugador) {
    const clientId = configuracion.paypal?.clientId;
    const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
        throw new Error('Falta configurar paypal.clientId o PAYPAL_CLIENT_SECRET');
    }

    const baseUrl = process.env.PAYPAL_MODE === 'live'
        ? 'https://api-m.paypal.com'
        : 'https://api-m.sandbox.paypal.com';
    const credenciales = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const tokenResponse = await fetch(`${baseUrl}/v1/oauth2/token`, {
        method: 'POST',
        headers: {
            'Authorization': `Basic ${credenciales}`,
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: 'grant_type=client_credentials'
    });
    const tokenResult = await tokenResponse.json();
    if (!tokenResponse.ok || !tokenResult.access_token) {
        throw new Error(`PayPal OAuth respondió HTTP ${tokenResponse.status}`);
    }

    const orderResponse = await fetch(`${baseUrl}/v2/checkout/orders`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${tokenResult.access_token}`,
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

    return orderResult.id;
}

async function ejecutarComandoMinecraft(comando) {
    const url = `${panelConfig.host}/api/client/servers/${panelConfig.serverId}/command`;

    const maxIntentos = Number.parseInt(process.env.PANEL_RETRY_ATTEMPTS || '3', 10);
    const timeoutMs = Number.parseInt(process.env.PANEL_REQUEST_TIMEOUT_MS || '10000', 10);
    let ultimoError;
    for (let intento = 1; intento <= Math.max(1, maxIntentos); intento += 1) {
        try {
            const respuesta = await fetch(url, {
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
    try {
        configuracion = leerConfiguracionTienda();
        const jugador = req.body.player;
        if (!esNombreJugadorValido(jugador)) {
            return res.status(400).json({ error: 'El nombre del jugador no es válido' });
        }
        const coupon = typeof req.body.coupon === 'string' ? req.body.coupon.trim().toUpperCase() : '';
        total = calcularPrecioOrden(configuracion, req.body.items, coupon);
    } catch (error) {
        return res.status(400).json({ error: error.message });
    }

    try {
        const id = await crearOrdenPayPal(configuracion, total, req.body.player);
        return res.json({ id, total: total.toFixed(2), currency: configuracion.currency });
    } catch (error) {
        console.error('[PAYPAL ORDER ERROR]', error.message);
        return res.status(502).json({ error: 'No se pudo crear la orden de PayPal' });
    }
});

// Webhook para procesar las compras de PayPal
app.post('/webhook/paypal', async (req, res) => {
    const evento = req.body;

    if (evento.event_type === 'CHECKOUT.ORDER.APPROVED' || evento.event_type === 'PAYMENT.CAPTURE.COMPLETED') {
        const detallesPago = evento.resource || {};
        
        const nickJugador = detallesPago.custom_id;
        if (!esNombreJugadorValido(nickJugador)) {
            return res.status(400).json({ error: 'El nombre del jugador no es válido' });
        }
        const inputItem = normalizarSku(detallesPago.item_name);
        const producto = obtenerProducto(inputItem);
        if (!producto) {
            return res.status(400).json({ error: 'SKU de producto no reconocido' });
        }

        console.log(`✅ Procesando compra de protección para ${nickJugador} -> Producto: ${inputItem}`);

        const eventId = evento.id || detallesPago.id;
        let entrega;
        try {
            entrega = iniciarEntrega({
                eventId,
                captureId: detallesPago.id,
                orderId: detallesPago.supplementary_data?.related_ids?.order_id,
                player: nickJugador,
                productKey: inputItem
            });
        } catch (error) {
            console.error('[PAYMENT STATE ERROR]', error.message);
            return res.status(500).json({ error: 'No se pudo registrar el evento de pago' });
        }
        if (entrega.duplicate) return res.status(200).send('DUPLICATE');

        const estadoEntrega = obtenerEntrega(entrega.eventKey);
        try {
            let siguienteComando = estadoEntrega.nextCommand;
            const comandos = producto.comandos(nickJugador);
            for (; siguienteComando < comandos.length; siguienteComando += 1) {
                await ejecutarComandoMinecraft(comandos[siguienteComando]);
                registrarComandoEntregado(entrega.eventKey, siguienteComando + 1);
            }
            completarEntrega(entrega.eventKey);
        } catch (error) {
            fallarEntrega(entrega.eventKey, error);
            return res.status(503).json({ error: 'La entrega está pendiente de reintento' });
        }
    }

    res.status(200).send('OK');
});

if (require.main === module) {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
        console.log(`🚀 Servidor backend corriendo en puerto ${PORT}`);
    });
}

module.exports = app;
