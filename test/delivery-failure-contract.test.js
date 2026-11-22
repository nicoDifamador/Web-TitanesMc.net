const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('panel delivery errors propagate to the recoverable webhook state', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
    assert.match(source, /AbortSignal\.timeout\(timeoutMs\)/);
    assert.match(source, /throw new Error\(`No se pudo entregar el comando al panel/);
    assert.match(source, /fallarEntrega\(entrega\.eventKey, error\)/);
    assert.match(source, /res\.status\(503\)\.json\(\{ error: 'La entrega está pendiente de reintento' \}\)/);
});
