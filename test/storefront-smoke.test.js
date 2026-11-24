const assert = require('node:assert/strict');
const { once } = require('node:events');
const test = require('node:test');

const app = require('../server');

test('production storefront smoke audit serves every public page and asset', async (t) => {
    const server = app.listen(0, '127.0.0.1');
    t.after(() => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));
    await once(server, 'listening');
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const routes = [
        '/', '/tienda.html', '/rangos-supremos.html', '/protecciones.html', '/llaves.html', '/items.html',
        '/css/estilo.css', '/java/main.js', '/java/landing.js', '/config.json'
    ];

    for (const route of routes) {
        const response = await fetch(`${baseUrl}${route}`);
        assert.equal(response.status, 200, route);
        assert.ok((await response.arrayBuffer()).byteLength > 0, `${route} is empty`);
    }

    for (const route of ['/server.js', '/package.json', '/data/payment-state.json', '/.env']) {
        const response = await fetch(`${baseUrl}${route}`);
        assert.equal(response.status, 404, route);
    }
});

test('storefront pages publish canonical metadata for indexing', async () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const root = path.join(__dirname, '..');
    for (const page of ['index.html', 'tienda.html', 'items.html', 'llaves.html', 'protecciones.html', 'rangos-supremos.html']) {
        const html = fs.readFileSync(path.join(root, page), 'utf8');
        assert.match(html, /<meta name="description" content="[^"]+">/);
        assert.match(html, /<link rel="canonical" href="https:\/\/titanesmc\.net\//);
        assert.match(html, /property="og:title"/);
    }
});
