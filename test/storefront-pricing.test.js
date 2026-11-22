const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('featured storefront cards use one configured product name for display and cart actions', () => {
    const root = path.join(__dirname, '..');
    const config = JSON.parse(fs.readFileSync(path.join(root, 'config.json'), 'utf8'));
    const storefront = fs.readFileSync(path.join(root, 'tienda.html'), 'utf8');
    const cards = [...storefront.matchAll(/data-product-name="([^"]+)"[\s\S]*?data-product-price="([^"]+)"[\s\S]*?agregarProductoDestacado\(this\)/g)];

    assert.equal(cards.length, 3);
    for (const [, cardName, displayedName] of cards) {
        assert.equal(displayedName, cardName);
        assert.ok(config.products[cardName], `Missing configured price for ${cardName}`);
    }
});
