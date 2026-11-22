const assert = require('node:assert/strict');
const test = require('node:test');
const config = require('../config.json');
const { obtenerProducto, productosTienda } = require('../delivery-catalog');

test('every published SKU has an explicit delivery mapping', () => {
    for (const sku of Object.keys(config.products)) {
        const producto = obtenerProducto(sku);
        assert.ok(producto, `Missing delivery mapping for ${sku}`);
        const commands = producto.comandos('Jugador_1');
        assert.equal(commands.length, 2);
        assert.ok(commands.every((command) => command.includes('Jugador_1')));
    }

    assert.equal(obtenerProducto('producto desconocido'), null);
    assert.equal(Object.keys(productosTienda).length, Object.keys(config.products).length);
    assert.match(obtenerProducto('Rango Zeus (Mensual)').comandos('Jugador_1')[0], /addtemp zeus 30d/);
    assert.match(obtenerProducto('Rango Zeus (Permanente)').comandos('Jugador_1')[0], /parent add zeus$/);
});
