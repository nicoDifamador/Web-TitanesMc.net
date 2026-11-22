const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('the payment contract sends catalog items and recalculates the amount on the server', () => {
    const root = path.join(__dirname, '..');
    const browserCode = fs.readFileSync(path.join(root, 'java', 'main.js'), 'utf8');
    const serverCode = fs.readFileSync(path.join(root, 'server.js'), 'utf8');

    assert.match(browserCode, /items:\s*carrito\.map\(item => \(\{ name: item\.name, quantity: item\.cantidad \}\)\)/);
    assert.doesNotMatch(browserCode, /total\s*:\s*totalFinal/);
    assert.match(serverCode, /total = calcularPrecioOrden\(configuracion, req\.body\.items, coupon\)/);
    assert.doesNotMatch(serverCode, /req\.body\.total/);
});
