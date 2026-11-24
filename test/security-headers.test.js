const assert = require('node:assert/strict');
const { once } = require('node:events');
const test = require('node:test');

const app = require('../server');

test('public responses expose defensive security headers and external-script CSP', async (t) => {
    const server = app.listen(0, '127.0.0.1');
    t.after(() => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));
    await once(server, 'listening');
    const baseUrl = `http://127.0.0.1:${server.address().port}`;

    const response = await fetch(`${baseUrl}/tienda.html`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(response.headers.get('referrer-policy'), 'strict-origin-when-cross-origin');
    assert.match(response.headers.get('permissions-policy'), /camera=\(\)/);
    const csp = response.headers.get('content-security-policy');
    assert.match(csp, /script-src 'self'/);
    assert.match(csp, /https:\/\/www\.paypal\.com/);
    assert.doesNotMatch(csp, /script-src[^;]*unsafe-inline/);
    assert.equal(response.headers.get('strict-transport-security'), null);
});

test('proxy HTTPS receives HSTS while local HTTP does not', async (t) => {
    const server = app.listen(0, '127.0.0.1');
    t.after(() => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));
    await once(server, 'listening');
    const url = `http://127.0.0.1:${server.address().port}/healthz`;
    const response = await fetch(url, { headers: { 'x-forwarded-proto': 'https' } });
    assert.equal(response.status, 200);
    assert.match(response.headers.get('strict-transport-security'), /max-age=31536000/);
});
