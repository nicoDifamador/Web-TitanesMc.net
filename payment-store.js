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
    const temporaryFile = `${file}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(temporaryFile, JSON.stringify(state, null, 2), { mode: 0o600 });
    fs.renameSync(temporaryFile, file);
}

function esperarSincronicamente(milisegundos) {
    const espera = new Int32Array(new SharedArrayBuffer(4));
    Atomics.wait(espera, 0, 0, milisegundos);
}

function conEstadoBloqueado(mutacion) {
    const file = stateFile();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const lockFile = `${file}.lock`;
    let descriptor;
    for (let intento = 0; intento < 200; intento += 1) {
        try {
            descriptor = fs.openSync(lockFile, 'wx', 0o600);
            break;
        } catch (error) {
            if (error.code !== 'EEXIST') throw error;
            esperarSincronicamente(10);
        }
    }
    if (descriptor === undefined) throw new Error('No se pudo bloquear el estado de pagos');

    try {
        const state = readState();
        const result = mutacion(state);
        writeState(state);
        return result;
    } finally {
        fs.closeSync(descriptor);
        fs.unlinkSync(lockFile);
    }
}

function guardarOrden(orderId, order) {
    if (!orderId) throw new Error('Falta el ID de la orden de PayPal');
    conEstadoBloqueado((state) => {
        state.orders[orderId] = {
            ...order,
            orderId,
            status: order.status || 'created',
            createdAt: order.createdAt || new Date().toISOString()
        };
    });
}

function obtenerOrden(orderId) {
    return readState().orders[orderId] || null;
}

function actualizarOrden(orderId, changes) {
    return conEstadoBloqueado((state) => {
        if (!state.orders[orderId]) throw new Error(`No existe la orden de PayPal ${orderId}`);
        state.orders[orderId] = { ...state.orders[orderId], ...changes, updatedAt: new Date().toISOString() };
        return state.orders[orderId];
    });
}

function iniciarEntrega({ eventId, captureId, orderId, player, productKey }) {
    const uniqueKeys = [eventId, captureId].filter(Boolean);
    if (uniqueKeys.length === 0) throw new Error('Falta un identificador único del evento de PayPal');

    return conEstadoBloqueado((state) => {
        const existingKey = Object.keys(state.events).find((key) => {
            const event = state.events[key];
            return uniqueKeys.includes(key) || uniqueKeys.includes(event.eventId) || uniqueKeys.includes(event.captureId);
        });
        if (existingKey) {
            const existing = state.events[existingKey];
            if (existing.status === 'completed' || existing.status === 'pending') {
                return { duplicate: true, eventKey: existingKey, event: existing };
            }
            existing.status = 'pending';
            existing.attempts += 1;
            existing.lastAttemptAt = new Date().toISOString();
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
        return { duplicate: false, eventKey, event };
    });
}

function obtenerEntrega(eventKey) {
    return readState().events[eventKey] || null;
}

function registrarComandoEntregado(eventKey, nextCommand) {
    conEstadoBloqueado((state) => {
        const event = state.events[eventKey];
        if (!event) throw new Error(`No existe el evento de pago ${eventKey}`);
        event.nextCommand = nextCommand;
        event.lastCommandAt = new Date().toISOString();
    });
}

function completarEntrega(eventKey) {
    conEstadoBloqueado((state) => {
        const event = state.events[eventKey];
        if (!event) throw new Error(`No existe el evento de pago ${eventKey}`);
        event.status = 'completed';
        event.completedAt = new Date().toISOString();
    });
}

function fallarEntrega(eventKey, error) {
    conEstadoBloqueado((state) => {
        const event = state.events[eventKey];
        if (!event) throw new Error(`No existe el evento de pago ${eventKey}`);
        event.status = 'failed';
        event.lastError = error instanceof Error ? error.message : String(error);
        event.failedAt = new Date().toISOString();
    });
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
