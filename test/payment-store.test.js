const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

test('payment events remain unique and completed deliveries survive a process reload', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'titanes-payments-'));
    const stateFile = path.join(directory, 'state.json');
    const previousStateFile = process.env.PAYMENT_STATE_FILE;
    process.env.PAYMENT_STATE_FILE = stateFile;
    try {
        const store = require('../payment-store');
        store.guardarOrden('order-1', { player: 'Jugador', total: '4.99', currency: 'USD' });
        const first = store.iniciarEntrega({
            eventId: 'event-1', captureId: 'capture-1', orderId: 'order-1',
            player: 'Jugador', productKey: 'baul'
        });
        assert.equal(first.duplicate, false);
        store.registrarComandoEntregado(first.eventKey, 1);
        store.completarEntrega(first.eventKey);

        const duplicateByEvent = store.iniciarEntrega({ eventId: 'event-1', captureId: 'capture-2' });
        const duplicateByCapture = store.iniciarEntrega({ eventId: 'event-2', captureId: 'capture-1' });
        assert.equal(duplicateByEvent.duplicate, true);
        assert.equal(duplicateByCapture.duplicate, true);
        assert.equal(store.obtenerOrden('order-1').total, '4.99');
        assert.equal(store.obtenerEntrega(first.eventKey).status, 'completed');
        assert.ok(JSON.parse(fs.readFileSync(stateFile, 'utf8')).events['event-1']);

        const failed = store.iniciarEntrega({ eventId: 'event-2', captureId: 'capture-3', player: 'Jugador', productKey: 'baul' });
        store.registrarComandoEntregado(failed.eventKey, 1);
        store.fallarEntrega(failed.eventKey, new Error('panel timeout'));
        const retry = store.iniciarEntrega({ eventId: 'event-2', captureId: 'capture-3' });
        assert.equal(retry.duplicate, false);
        assert.equal(retry.event.nextCommand, 1);
        assert.equal(retry.event.attempts, 2);
    } finally {
        if (previousStateFile === undefined) delete process.env.PAYMENT_STATE_FILE;
        else process.env.PAYMENT_STATE_FILE = previousStateFile;
    }
});
