const assert = require('node:assert/strict');
const test = require('node:test');
const { calcularPrecioOrden, leerConfiguracionTienda } = require('../store-pricing');

test('calculates the order from configured prices and global discounts', () => {
    const config = leerConfiguracionTienda();
    config.discounts.globalPercent = 10;

    assert.equal(calcularPrecioOrden(config, [{ name: 'Rango Zeus', quantity: 2 }], ''), 134.98);
});

test('a product discount overrides the global discount and coupon codes are configurable', () => {
    const config = leerConfiguracionTienda();
    config.discounts.globalPercent = 20;
    config.discounts.products['Rango Zeus'] = 5;

    assert.equal(calcularPrecioOrden(config, [{ name: 'Rango Zeus', quantity: 1 }], 'TITANES10'), 64.12);
});

test('rejects unknown products, invalid quantities, and disabled coupons', () => {
    const config = leerConfiguracionTienda();

    assert.throws(() => calcularPrecioOrden(config, [{ name: 'Producto desconocido', quantity: 1 }], ''), /Producto no válido/);
    assert.throws(() => calcularPrecioOrden(config, [{ name: 'Rango Zeus', quantity: 0 }], ''), /Cantidad no válida/);
    assert.throws(() => calcularPrecioOrden(config, [{ name: 'Rango Zeus', quantity: 1 }], 'TITANES100'), /Cupón inválido/);
});
