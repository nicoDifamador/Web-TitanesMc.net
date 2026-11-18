require('dotenv').config();
const express = require('express');

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

async function ejecutarComandoMinecraft(comando) {
    const url = `${panelConfig.host}/api/client/servers/${panelConfig.serverId}/command`;

    try {
        const respuesta = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${panelConfig.apiKey}`,
                'Accept': 'application/json'
            },
            body: JSON.stringify({ command: comando })
        });

        if (!respuesta.ok) {
            const errorText = await respuesta.text();
            throw new Error(`HTTP ${respuesta.status}: ${errorText}`);
        }

        console.log(`[PANEL API] Comando ejecutado en consola: "${comando}"`);
    } catch (error) {
        console.error('[PANEL ERROR] Falló la ejecución del comando:', error.message);
    }
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

// Ruta REST de prueba
app.get('/test-rest', async (req, res) => {
    const url = `${panelConfig.host}/api/client/servers/${panelConfig.serverId}/command`;
    try {
        const respuesta = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${panelConfig.apiKey}`,
                'Accept': 'application/json'
            },
            body: JSON.stringify({ command: 'say ¡Prueba de conexión exitosa!' })
        });

        if (!respuesta.ok) {
            const errorText = await respuesta.text();
            return res.status(500).send(`❌ Error de la API (HTTP ${respuesta.status}): ${errorText}`);
        }

        res.send(`✅ ¡Conexión exitosa con el servidor de Minecraft!`);
    } catch (error) {
        res.status(500).send(`❌ Error de red: ${error.message}`);
    }
});

// Webhook para procesar las compras de PayPal
app.post('/webhook/paypal', async (req, res) => {
    const evento = req.body;

    if (evento.event_type === 'CHECKOUT.ORDER.APPROVED' || evento.event_type === 'PAYMENT.CAPTURE.COMPLETED') {
        const detallesPago = evento.resource || {};
        
        let nickJugador = detallesPago.custom_id || "Mxpex_";
        let inputItem = (detallesPago.item_name || "protección 125x125").toLowerCase();

        let producto = productosTienda[inputItem] || productosTienda["protección 125x125"];

        console.log(`✅ Procesando compra de protección para ${nickJugador} -> Producto: ${inputItem}`);

        // Ejecutar comando de entrega de la protección física
        await ejecutarComandoMinecraft(producto.ejecutar(nickJugador));

        // Enviar anuncio broadcast en el servidor específico para la protección adquirida
        if (producto.tipo === "rango") {
            await ejecutarComandoMinecraft(`broadcast &e¡El jugador &6${nickJugador} &eha adquirido el rango permanente ${producto.formato} &een la tienda!`);
        } else {
            await ejecutarComandoMinecraft(`broadcast &e¡El jugador &6${nickJugador} &eha adquirido la ${producto.formato} &een la tienda!`);
        }
    }

    res.status(200).send('OK');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Servidor backend corriendo en puerto ${PORT}`);
});