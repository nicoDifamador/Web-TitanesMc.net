const fs = require('node:fs');
const path = require('node:path');

const defaultStateFile = path.join(__dirname, 'data', 'payment-state.json');

function stateFile() {
    return process.env.PAYMENT_STATE_FILE || defaultStateFile;
}

function readState() {
    try {
        return JSON.parse(fs.readFileSync(stateFile(), 'utf8'));
    } catch (error) {
        if (error.code === 'ENOENT') return { orders: {}, events: {} };
        throw new Error(`No se pudo leer el estado de pagos: ${error.message}`);
    }
}

function writeState(state) {
    const file = stateFile();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const temporaryFile = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(temporaryFile, JSON.stringify(state, null, 2), { mode: 0o600 });
    fs.renameSync(temporaryFile, file);
}

function guardarOrden(orderId, order) {
    if (!orderId) throw new Error('Falta el ID de la orden de PayPal');
    const state = readState();
    state.orders[orderId] = {
        ...order,
        orderId,
        status: order.status || 'created',
        createdAt: order.createdAt || new Date().toISOString()
    };
    writeState(state);
}

function obtenerOrden(orderId) {
    return readState().orders[orderId] || null;
}

function actualizarOrden(orderId, changes) {
    const state = readState();
    if (!state.orders[orderId]) throw new Error(`No existe la orden de PayPal ${orderId}`);
    state.orders[orderId] = { ...state.orders[orderId], ...changes, updatedAt: new Date().toISOString() };
    writeState(state);
    return state.orders[orderId];
}

function iniciarEntrega({ eventId, captureId, orderId, player, productKey }) {
    const uniqueKeys = [eventId, captureId].filter(Boolean);
    if (uniqueKeys.length === 0) throw new Error('Falta un identificador único del evento de PayPal');

    const state = readState();
    const existingKey = Object.keys(state.events).find((key) => {
        const event = state.events[key];
        return uniqueKeys.includes(key) || uniqueKeys.includes(event.eventId) || uniqueKeys.includes(event.captureId);
    });
    if (existingKey) {
        const existing = state.events[existingKey];
        if (existing.status === 'completed') return { duplicate: true, eventKey: existingKey, event: existing };
        if (existing.status === 'pending') return { duplicate: true, eventKey: existingKey, event: existing };
        existing.status = 'pending';
        existing.attempts += 1;
        existing.lastAttemptAt = new Date().toISOString();
        writeState(state);
        return { duplicate: false, eventKey: existingKey, event: existing };
    }

    const eventKey = uniqueKeys[0];
    const event = {
        eventId: eventId || null,
        captureId: captureId || null,
        orderId: orderId || null,
        player,
        productKey,
        status: 'pending',
        nextCommand: 0,
        attempts: 1,
        createdAt: new Date().toISOString(),
        lastAttemptAt: new Date().toISOString()
    };
    state.events[eventKey] = event;
    writeState(state);
    return { duplicate: false, eventKey, event };
}

function obtenerEntrega(eventKey) {
    return readState().events[eventKey] || null;
}

function registrarComandoEntregado(eventKey, nextCommand) {
    const state = readState();
    const event = state.events[eventKey];
    if (!event) throw new Error(`No existe el evento de pago ${eventKey}`);
    event.nextCommand = nextCommand;
    event.lastCommandAt = new Date().toISOString();
    writeState(state);
}

function completarEntrega(eventKey) {
    const state = readState();
    const event = state.events[eventKey];
    if (!event) throw new Error(`No existe el evento de pago ${eventKey}`);
    event.status = 'completed';
    event.completedAt = new Date().toISOString();
    writeState(state);
}

function fallarEntrega(eventKey, error) {
    const state = readState();
    const event = state.events[eventKey];
    if (!event) throw new Error(`No existe el evento de pago ${eventKey}`);
    event.status = 'failed';
    event.lastError = error instanceof Error ? error.message : String(error);
    event.failedAt = new Date().toISOString();
    writeState(state);
}

module.exports = {
    guardarOrden,
    obtenerOrden,
    actualizarOrden,
    iniciarEntrega,
    obtenerEntrega,
    registrarComandoEntregado,
    completarEntrega,
    fallarEntrega
};
