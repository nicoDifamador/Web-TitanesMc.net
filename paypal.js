function paypalBaseUrl(mode) {
    return mode === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';
}

async function jsonResponse(response, description) {
    const body = await response.json();
    if (!response.ok) throw new Error(`${description} respondió HTTP ${response.status}`);
    return body;
}

async function obtenerTokenPayPal(configuracion, fetcher = fetch) {
    const clientId = configuracion.paypal?.clientId;
    const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
        throw new Error('Falta configurar paypal.clientId o PAYPAL_CLIENT_SECRET');
    }

    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const response = await fetcher(`${paypalBaseUrl(process.env.PAYPAL_MODE)}/v1/oauth2/token`, {
        method: 'POST',
        headers: {
            Authorization: `Basic ${credentials}`,
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: 'grant_type=client_credentials'
    });
    const result = await jsonResponse(response, 'PayPal OAuth');
    if (!result.access_token) throw new Error('PayPal OAuth no devolvió un token');
    return result.access_token;
}

async function verificarFirmaWebhookPayPal(req, configuracion, fetcher = fetch) {
    const webhookId = process.env.PAYPAL_WEBHOOK_ID;
    const transmissionId = req.get('paypal-transmission-id');
    const transmissionTime = req.get('paypal-transmission-time');
    const certUrl = req.get('paypal-cert-url');
    const authAlgo = req.get('paypal-auth-algo');
    const transmissionSignature = req.get('paypal-transmission-sig');
    if (!webhookId || !transmissionId || !transmissionTime || !certUrl || !authAlgo || !transmissionSignature) {
        throw new Error('Faltan datos para verificar la firma del webhook de PayPal');
    }

    const token = await obtenerTokenPayPal(configuracion, fetcher);
    const response = await fetcher(`${paypalBaseUrl(process.env.PAYPAL_MODE)}/v1/notifications/verify-webhook-signature`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
            auth_algo: authAlgo,
            cert_url: certUrl,
            transmission_id: transmissionId,
            transmission_sig: transmissionSignature,
            transmission_time: transmissionTime,
            webhook_id: webhookId,
            webhook_event: req.body
        })
    });
    const result = await jsonResponse(response, 'PayPal firma');
    return result.verification_status === 'SUCCESS';
}

async function verificarCapturaPayPal(configuracion, captureId, orderId, esperado, fetcher = fetch) {
    const token = await obtenerTokenPayPal(configuracion, fetcher);
    const headers = { Authorization: `Bearer ${token}`, Accept: 'application/json' };
    const baseUrl = paypalBaseUrl(process.env.PAYPAL_MODE);
    const captureResponse = await fetcher(`${baseUrl}/v2/payments/captures/${encodeURIComponent(captureId)}`, { headers });
    const capture = await jsonResponse(captureResponse, 'PayPal captura');
    if (capture.status !== 'COMPLETED') throw new Error('La captura de PayPal no está completada');

    const capturedAmount = capture.amount;
    if (!capturedAmount || capturedAmount.currency_code !== esperado.currency || capturedAmount.value !== esperado.total) {
        throw new Error('El importe o la moneda de la captura no coincide con la orden');
    }

    const orderResponse = await fetcher(`${baseUrl}/v2/checkout/orders/${encodeURIComponent(orderId)}`, { headers });
    const order = await jsonResponse(orderResponse, 'PayPal orden');
    const unit = order.purchase_units?.[0];
    const expectedMerchant = process.env.PAYPAL_MERCHANT_ID;
    const merchantId = unit?.payee?.merchant_id;
    const merchantEmail = unit?.payee?.email_address;
    if (!expectedMerchant || (merchantId !== expectedMerchant && merchantEmail !== expectedMerchant)) {
        throw new Error('La orden de PayPal no pertenece al receptor configurado');
    }
    if (unit.amount?.currency_code !== esperado.currency || unit.amount?.value !== esperado.total) {
        throw new Error('El importe de la orden de PayPal no coincide con el catálogo');
    }
    return { capture, order };
}

module.exports = {
    paypalBaseUrl,
    obtenerTokenPayPal,
    verificarFirmaWebhookPayPal,
    verificarCapturaPayPal
};
