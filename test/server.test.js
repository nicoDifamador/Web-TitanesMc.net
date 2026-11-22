const assert = require('node:assert/strict');
const { once } = require('node:events');
const test = require('node:test');

test('the public test route is unavailable', async (t) => {
    process.env.PANEL_API_KEY = 'local-test-key';
    const server = require('../server').listen(0, '127.0.0.1');
    t.after(() => new Promise((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
    }));
    await once(server, 'listening');

    const response = await fetch(`http://127.0.0.1:${server.address().port}/test-rest`);
    assert.equal(response.status, 404);
});

test('rejects invalid player names before contacting payment or the panel', async (t) => {
    const panel = require('node:http').createServer((_req, res) => res.writeHead(204).end());
    panel.listen(0, '127.0.0.1');
    t.after(() => new Promise((resolve, reject) => {
        panel.close((error) => error ? reject(error) : resolve());
    }));
    await once(panel, 'listening');

    process.env.PANEL_HOST = `http://127.0.0.1:${panel.address().port}`;
    const server = require('../server').listen(0, '127.0.0.1');
    t.after(() => new Promise((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
    }));
    await once(server, 'listening');
    const baseUrl = `http://127.0.0.1:${server.address().port}`;

    for (const player of [undefined, 'ab', 'a'.repeat(17), 'dos palabras', 'nick-', 'Nick\n']) {
        for (const [path, body] of [
            ['/api/paypal/orders', { player }],
            ['/webhook/paypal', {
                event_type: 'PAYMENT.CAPTURE.COMPLETED',
                resource: { custom_id: player }
            }]
        ]) {
            const response = await fetch(`${baseUrl}${path}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            assert.equal(response.status, 400);
            const result = await response.json();
            if (path === '/api/paypal/orders' || player !== undefined) {
                assert.deepEqual(result, { error: 'El nombre del jugador no es válido' });
            }
        }
    }
});
