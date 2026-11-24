const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const source = fs.readFileSync(path.join(__dirname, '..', 'java', 'main.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '..', 'css', 'estilo.css'), 'utf8');

test('cart rendering does not interpolate persisted values into HTML', () => {
    assert.doesNotMatch(source, /innerHTML/);
    assert.match(source, /normalizarCarrito/);
    assert.match(source, /NOMBRE_JUGADOR/);
    assert.match(source, /textContent = `\$\{item\.name\}/);
    assert.match(source, /dataset\.productName = item\.name/);
});

test('storefront has fallback styles for safely-created cart and toast nodes', () => {
    for (const selector of ['.cart-item-row', '.cart-empty', '.toast-notification', '.session-avatar']) {
        assert.match(css, new RegExp(selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    }
    assert.match(css, /prefers-reduced-motion/);
});
