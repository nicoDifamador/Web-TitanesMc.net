function anuncio(formato, tipo, jugador, temporal = false) {
    const articulo = tipo === 'rango'
        ? `el rango ${temporal ? 'mensual' : 'permanente'} ${formato}`
        : `la ${formato}`;
    return `broadcast &e¡El jugador &6${jugador} &eha adquirido ${articulo} &een la tienda!`;
}

function rango(nombre, formato, temporal) {
    return {
        tipo: 'rango',
        formato,
        comandos: (jugador) => [
            temporal
                ? `lp user ${jugador} parent addtemp ${nombre} 30d`
                : `lp user ${jugador} parent add ${nombre}`,
            anuncio(formato, 'rango', jugador, temporal)
        ]
    };
}

function proteccion(nombre, formato) {
    return {
        tipo: 'proteccion',
        formato,
        comandos: (jugador) => [
            `ps give ${jugador} ${nombre}`,
            anuncio(formato, 'proteccion', jugador)
        ]
    };
}

function item(comando, formato) {
    return {
        tipo: 'item',
        formato,
        comandos: (jugador) => [
            comando(jugador),
            anuncio(formato, 'item', jugador)
        ]
    };
}

const productosTienda = Object.freeze({
    'rango zeus': rango('zeus', '&#FFDA27&lZEUS', false),
    'rango zeus (mensual)': rango('zeus', '&#FFDA27&lZEUS', true),
    'rango zeus (permanente)': rango('zeus', '&#FFDA27&lZEUS', false),
    'rango poseidón': rango('poseidon', '&#3A47B1&lPOSEIDON', false),
    'rango poseidón (mensual)': rango('poseidon', '&#3A47B1&lPOSEIDON', true),
    'rango poseidón (permanente)': rango('poseidon', '&#3A47B1&lPOSEIDON', false),
    'rango hades': rango('hades', '&#CD7232&lHADES', false),
    'rango hades (mensual)': rango('hades', '&#CD7232&lHADES', true),
    'rango hades (permanente)': rango('hades', '&#CD7232&lHADES', false),
    'rango atenea (mensual)': rango('atenea', '&#A441D5&lATENEA', true),
    'rango atenea (permanente)': rango('atenea', '&#A441D5&lATENEA', false),
    'rango ares (mensual)': rango('ares', '&#CD3434&lARES', true),
    'rango ares (permanente)': rango('ares', '&#CD3434&lARES', false),
    'rango apolo (mensual)': rango('apolo', '&#FFD700&lAPOLO', true),
    'rango apolo (permanente)': rango('apolo', '&#FFD700&lAPOLO', false),
    'protección 125x125': proteccion('125x125', '&#FFD700&lPROTECCIÓN ORO (125x125)'),
    'protección 150x150': proteccion('150x150', '&#B794F4&lPROTECCIÓN CUARZO (150x150)'),
    'protección 200x200': proteccion('200x200', '&#ED8936&lPROTECCIÓN ESCOMBRO (200x200)'),
    'baúl de monedas': item((jugador) => `give ${jugador} chest 1`, 'BAÚL DE MONEDAS'),
    'kit de supervivencia': item((jugador) => `kit give ${jugador} supervivencia`, 'KIT DE SUPERVIVENCIA'),
    'llave zeus (x1)': item((jugador) => `crate key give ${jugador} zeus 1`, 'LLAVE ZEUS (x1)'),
    'llave poseidón (x1)': item((jugador) => `crate key give ${jugador} poseidon 1`, 'LLAVE POSEIDÓN (x1)'),
    'llave hades (x1)': item((jugador) => `crate key give ${jugador} hades 1`, 'LLAVE HADES (x1)'),
    'llave mitológica (x1)': item((jugador) => `crate key give ${jugador} mitologica 1`, 'LLAVE MITOLÓGICA (x1)')
});

function normalizarSku(sku) {
    return typeof sku === 'string' ? sku.trim().toLowerCase() : '';
}

function obtenerProducto(sku) {
    return productosTienda[normalizarSku(sku)] || null;
}

module.exports = { productosTienda, normalizarSku, obtenerProducto };
