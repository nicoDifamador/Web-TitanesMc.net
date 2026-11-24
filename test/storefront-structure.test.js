const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const pages = ['index.html', 'tienda.html', 'items.html', 'llaves.html', 'protecciones.html', 'rangos-supremos.html'];

test('storefront pages keep behavior in external scripts', () => {
    for (const page of pages) {
        const html = fs.readFileSync(path.join(root, page), 'utf8');
        assert.doesNotMatch(html, /\son(?:click|submit|mouseover|mouseout|error)\s*=/i, `${page} has inline event handlers`);
        assert.doesNotMatch(html, /<script\s*>/i, `${page} has an inline script`);
    }

    const main = fs.readFileSync(path.join(root, 'java', 'main.js'), 'utf8');
    assert.match(main, /manejarAccionInterfaz/);
    assert.match(main, /add-product/);
    assert.match(main, /remove-cart-item/);
    assert.match(fs.readFileSync(path.join(root, 'java', 'landing.js'), 'utf8'), /window\.setTimeout/);
});

test('storefront modals expose dialog semantics and keyboard focus management', () => {
    for (const page of pages.slice(1)) {
        const html = fs.readFileSync(path.join(root, page), 'utf8');
        const overlays = html.match(/<div class="(?:modal-overlay|rank-modal-overlay)"[^>]*>/g) || [];
        assert.ok(overlays.length, `${page} has no modal overlays`);
        for (const overlay of overlays) {
            assert.match(overlay, /role="dialog"/);
            assert.match(overlay, /aria-modal="true"/);
            assert.match(overlay, /aria-hidden="true"/);
            assert.match(overlay, /hidden/);
        }
        assert.doesNotMatch(html, /<span[^>]*data-action="close-modal"/);
        assert.match(html, /<button[^>]*class="close-modal"[^>]*aria-label=/);
    }

    const main = fs.readFileSync(path.join(root, 'java', 'main.js'), 'utf8');
    assert.match(main, /event\.key === 'Escape'/);
    assert.match(main, /event\.key !== 'Tab'/);
    assert.match(main, /modalAnterior/);
});
