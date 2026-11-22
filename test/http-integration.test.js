const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { once } = require('node:events');
const test = require('node:test');

process.env.AUTO_DELIVERY_ENABLED = 'false';
process.env.PAYPAL_CLIENT_SECRET = 'sandbox-secret';
process.env.PAYPAL_WEBHOOK_ID = 'sandbox-webhook';
process.env.PAYPAL_MERCHANT_ID = 'sandbox-merchant';
const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'titanesmc-http-'));
process.env.PAYMENT_STATE_FILE = path.join(temporaryDirectory, 'payment-state.json');

const app = require('../server');

function json(body, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' }
    });
}

test('serves only the storefront public surface', async (t) => {
    const server = app.listen(0, '127.0.0.1');
    t.after(() => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));
    await once(server, 'listening');
    const baseUrl = `http://127.0.0.1:${server.address().port}`;

    for (const route of ['/', '/tienda.html', '/config.json', '/css/estilo.css', '/java/main.js']) {
        const response = await fetch(`${baseUrl}${route}`);
        assert.equal(response.status, 200, route);
    }

    const publicConfig = await (await fetch(`${baseUrl}/config.json`)).json();
    assert.ok(publicConfig.paypal.clientId);
    assert.ok(publicConfig.products);
    assert.equal(publicConfig.PAYPAL_CLIENT_SECRET, undefined);

    for (const route of ['/.env', '/.git/config', '/data/payment-state.json', '/server.js', '/package.json']) {
        const response = await fetch(`${baseUrl}${route}`);
        assert.equal(response.status, 404, route);
    }
});

test('creates mocked orders and never runs panel commands when delivery is disabled', async (t) => {
    let panelCalls = 0;
    app.locals.fetcher = async (url, options = {}) => {
        if (url.includes('/api/client/')) {
            panelCalls += 1;
            return json({});
        }
        if (url.endsWith('/v1/oauth2/token')) return json({ access_token: 'sandbox-token' });
        if (url.endsWith('/v1/notifications/verify-webhook-signature')) {
            return json({ verification_status: 'SUCCESS' });
        }
        if (url.endsWith('/v2/checkout/orders') && options.method === 'POST') {
            return json({ id: 'ORDER-MOCK-1' });
        }
        if (url.endsWith('/v2/payments/captures/CAPTURE-MOCK-1')) {
            return json({ status: 'COMPLETED', amount: { currency_code: 'USD', value: '4.99' } });
        }
        if (url.endsWith('/v2/checkout/orders/ORDER-MOCK-1')) {
            return json({
                purchase_units: [{
                    amount: { currency_code: 'USD', value: '4.99' },
                    payee: { merchant_id: 'sandbox-merchant' }
                }]
            });
        }
        throw new Error(`Solicitud mock inesperada: ${url}`);
    };
    t.after(() => { delete app.locals.fetcher; });

    const server = app.listen(0, '127.0.0.1');
    t.after(() => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));
    await once(server, 'listening');
    const baseUrl = `http://127.0.0.1:${server.address().port}`;

    const orderResponse = await fetch(`${baseUrl}/api/paypal/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            player: 'Steve_Test',
            items: [{ name: 'Baúl de Monedas', quantity: 1 }]
        })
    });
    assert.equal(orderResponse.status, 200);
    assert.equal((await orderResponse.json()).id, 'ORDER-MOCK-1');

    const invalidWebhook = await fetch(`${baseUrl}/webhook/paypal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            id: 'EVENT-INVALID',
            event_type: 'PAYMENT.CAPTURE.COMPLETED',
            resource: {
                id: 'CAPTURE-MOCK-1',
                supplementary_data: { related_ids: { order_id: 'ORDER-MOCK-1' } }
            }
        })
    });
    assert.equal(invalidWebhook.status, 400);
    assert.equal(panelCalls, 0);

    const webhookResponse = await fetch(`${baseUrl}/webhook/paypal`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'paypal-transmission-id': 'transmission-id',
            'paypal-transmission-time': '2026-11-22T12:00:00Z',
            'paypal-cert-url': 'https://api.paypal.com/cert',
            'paypal-auth-algo': 'SHA256withRSA',
            'paypal-transmission-sig': 'signature'
        },
        body: JSON.stringify({
            id: 'EVENT-MOCK-1',
            event_type: 'PAYMENT.CAPTURE.COMPLETED',
            resource: {
                id: 'CAPTURE-MOCK-1',
                supplementary_data: { related_ids: { order_id: 'ORDER-MOCK-1' } }
            }
        })
    });
    assert.equal(webhookResponse.status, 200);
    assert.equal(await webhookResponse.text(), 'DELIVERY_DISABLED');
    assert.equal(panelCalls, 0);
});
