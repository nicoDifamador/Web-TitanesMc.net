require('dotenv').config();
const express = require('express');
const { leerConfiguracionTienda, calcularPrecioOrden } = require('./store-pricing');
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

// Diccionario unificado enfocado en las Protecciones VIP y Rangos por si acaso
const productosTienda = {
    // Rangos Supremos Permanentes
    "apolo": { tipo: "rango", formato: "&#FFD700&lAPOLO", ejecutar: (nick) => `lp user ${nick} parent add apolo` },
    "ares": { tipo: "rango", formato: "&#CD3434&lARES", ejecutar: (nick) => `lp user ${nick} parent add ares` },
    "atenea": { tipo: "rango", formato: "&#A441D5&lATENEA", ejecutar: (nick) => `lp user ${nick} parent add atenea` },
    "poseidon": { tipo: "rango", formato: "&#3A47B1&lPOSEIDON", ejecutar: (nick) => `lp user ${nick} parent add poseidon` },
    "hades": { tipo: "rango", formato: "&#CD7232&lHADES", ejecutar: (nick) => `lp user ${nick} parent add hades` },
    "zeus": { tipo: "rango", formato: "&#FFDA27&lZEUS", ejecutar: (nick) => `lp user ${nick} parent add zeus` },

    // Protecciones VIP (Entrega de menas físicas mediante el plugin de protecciones)
    "protección 125x125": { tipo: "proteccion", formato: "&#FFD700&lPROTECCIÓN ORO (125x125)", ejecutar: (nick) => `ps give ${nick} 125x125` },
    "protección 150x150": { tipo: "proteccion", formato: "&#B794F4&lPROTECCIÓN CUARZO (150x150)", ejecutar: (nick) => `ps give ${nick} 150x150` },
    "protección 200x200": { tipo: "proteccion", formato: "&#ED8936&lPROTECCIÓN ESCOMBRO (200x200)", ejecutar: (nick) => `ps give ${nick} 200x200` }
};

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
        let inputItem = (detallesPago.item_name || "protección 125x125").toLowerCase();

        let producto = productosTienda[inputItem] || productosTienda["protección 125x125"];

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
            // Ejecutar comando de entrega de la protección física
            if (estadoEntrega.nextCommand < 1) {
                await ejecutarComandoMinecraft(producto.ejecutar(nickJugador));
                registrarComandoEntregado(entrega.eventKey, 1);
            }

            // Enviar anuncio broadcast en el servidor específico para la protección adquirida
            if (estadoEntrega.nextCommand < 2) {
                if (producto.tipo === "rango") {
                    await ejecutarComandoMinecraft(`broadcast &e¡El jugador &6${nickJugador} &eha adquirido el rango permanente ${producto.formato} &een la tienda!`);
                } else {
                    await ejecutarComandoMinecraft(`broadcast &e¡El jugador &6${nickJugador} &eha adquirido la ${producto.formato} &een la tienda!`);
                }
                registrarComandoEntregado(entrega.eventKey, 2);
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
