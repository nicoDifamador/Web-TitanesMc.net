const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('every storefront catalog page includes the shared checkout contract', () => {
    const root = path.join(__dirname, '..');
    for (const page of ['tienda.html', 'items.html', 'llaves.html', 'protecciones.html', 'rangos-supremos.html']) {
        const html = fs.readFileSync(path.join(root, page), 'utf8');
        assert.match(html, /id="checkout-modal"/, `${page} has no checkout modal`);
        assert.match(html, /id="checkout-user"/, `${page} has no checkout player field`);
        assert.match(html, /id="paypal-button-container"/, `${page} has no PayPal container`);
        assert.match(html, /<script src="java\/main\.js"><\/script>/, `${page} does not load the shared checkout code`);
    }

    const checkout = fs.readFileSync(path.join(root, 'java', 'main.js'), 'utf8');
    assert.match(checkout, /cargarSdkPayPal/);
    assert.match(checkout, /\/api\/paypal\/orders/);
});
