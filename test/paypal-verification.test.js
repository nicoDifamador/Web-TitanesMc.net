const assert = require('node:assert/strict');
const test = require('node:test');
const {
    verificarFirmaWebhookPayPal,
    verificarCapturaPayPal
} = require('../paypal');

process.env.PAYPAL_WEBHOOK_ID = 'webhook-id';
process.env.PAYPAL_CLIENT_SECRET = 'client-secret';
process.env.PAYPAL_MERCHANT_ID = 'merchant-id';

function response(body, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' }
    });
}

const configuracion = {
    currency: 'USD',
    paypal: { clientId: 'client-id' }
};

test('rejects a webhook without PayPal signature metadata', async () => {
    await assert.rejects(
        verificarFirmaWebhookPayPal({ body: {}, get: () => undefined }, configuracion, async () => response({})),
        /Faltan datos/
    );
});

test('accepts only a completed capture with the expected amount and receiver', async () => {
    const verifiedRequest = {
            body: { id: 'event-id' },
            get: (name) => ({
                'paypal-transmission-id': 'transmission-id',
                'paypal-transmission-time': '2026-11-22T12:00:00Z',
                'paypal-cert-url': 'https://api.paypal.com/cert',
                'paypal-auth-algo': 'SHA256withRSA',
                'paypal-transmission-sig': 'signature'
            })[name]
        };
        let call = 0;
        const validWebhook = await verificarFirmaWebhookPayPal(verifiedRequest, configuracion, async () => {
            call += 1;
            return call === 1 ? response({ access_token: 'token' }) : response({ verification_status: 'SUCCESS' });
        });
        assert.equal(validWebhook, true);

        let captureCall = 0;
        const verifiedCapture = await verificarCapturaPayPal(
            configuracion,
            'capture-id',
            'order-id',
            { total: '4.99', currency: 'USD' },
            async (url) => {
                captureCall += 1;
                if (captureCall === 1) return response({ access_token: 'token' });
                if (captureCall === 2) return response({
                    status: 'COMPLETED',
                    amount: { currency_code: 'USD', value: '4.99' }
                });
                return response({
                    status: 'COMPLETED',
                    purchase_units: [{
                        amount: { currency_code: 'USD', value: '4.99' },
                        payee: { merchant_id: 'merchant-id' }
                    }]
                });
            }
        );
        assert.equal(verifiedCapture.capture.status, 'COMPLETED');

        await assert.rejects(
            verificarCapturaPayPal(
                configuracion,
                'capture-id',
                'order-id',
                { total: '5.00', currency: 'USD' },
                async (url) => url.includes('/oauth2/')
                    ? response({ access_token: 'token' })
                    : response({ status: 'COMPLETED', amount: { currency_code: 'USD', value: '4.99' } })
            ),
            /importe o la moneda/
        );
});
