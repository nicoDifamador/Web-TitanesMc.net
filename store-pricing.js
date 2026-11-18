const fs = require('node:fs');
const path = require('node:path');

const configPath = path.join(__dirname, 'config.json');

function leerConfiguracionTienda() {
    let configuracion;
    try {
        configuracion = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    } catch (error) {
        throw new Error(`No se pudo leer config.json: ${error.message}`);
    }

    if (!configuracion.products || !configuracion.discounts || !/^[A-Z]{3}$/.test(configuracion.currency)) {
        throw new Error('config.json no contiene un catálogo, descuentos y moneda válidos');
    }
    return configuracion;
}

function calcularPrecioOrden(configuracion, items, codigoCupon) {
    if (!Array.isArray(items) || items.length === 0 || items.length > 50) {
        throw new Error('La orden debe incluir entre 1 y 50 productos');
    }

    const descuentoGlobal = configuracion.discounts.globalPercent;
    if (!Number.isFinite(descuentoGlobal) || descuentoGlobal < 0 || descuentoGlobal > 100) {
        throw new Error('El descuento global de config.json debe estar entre 0 y 100');
    }

    let subtotal = 0;
    for (const item of items) {
        const producto = configuracion.products[item.name];
        if (!producto || !Number.isFinite(producto.price) || producto.price < 0) {
            throw new Error(`Producto no válido: ${item.name}`);
        }
        if (!Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 99) {
            throw new Error(`Cantidad no válida para ${item.name}`);
        }

        const descuentosProducto = configuracion.discounts.products || {};
        const porcentaje = Object.prototype.hasOwnProperty.call(descuentosProducto, item.name)
            ? descuentosProducto[item.name]
            : descuentoGlobal;
        if (!Number.isFinite(porcentaje) || porcentaje < 0 || porcentaje > 100) {
            throw new Error(`Descuento no válido para ${item.name}`);
        }

        const precioUnitario = Math.round(producto.price * (1 - porcentaje / 100) * 100) / 100;
        subtotal += precioUnitario * item.quantity;
    }

    let total = Math.round(subtotal * 100) / 100;
    if (codigoCupon) {
        const cupon = configuracion.discounts.coupons?.[codigoCupon];
        if (!cupon || !cupon.enabled || !Number.isFinite(cupon.percent) || cupon.percent < 0 || cupon.percent > 100) {
            throw new Error('Cupón inválido o expirado');
        }
        total = Math.round(total * (1 - cupon.percent / 100) * 100) / 100;
    }
    if (total <= 0) {
        throw new Error('El total de la orden debe ser mayor a cero');
    }

    return total;
}

module.exports = { leerConfiguracionTienda, calcularPrecioOrden };
