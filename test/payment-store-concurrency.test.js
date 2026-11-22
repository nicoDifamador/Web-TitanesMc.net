const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

function runWorker(stateFile, eventId) {
    const modulePath = path.join(__dirname, '..', 'payment-store.js');
    const script = `const store = require(${JSON.stringify(modulePath)}); console.log(JSON.stringify(store.iniciarEntrega({ eventId: ${JSON.stringify(eventId)}, captureId: 'capture-shared', player: 'Jugador', productKey: 'sku' })));`;
    return new Promise((resolve, reject) => {
        const worker = spawn(process.execPath, ['-e', script], {
            env: { ...process.env, PAYMENT_STATE_FILE: stateFile },
            stdio: ['ignore', 'pipe', 'pipe']
        });
        let output = '';
        worker.stdout.on('data', (chunk) => { output += chunk; });
        worker.on('error', reject);
        worker.on('close', (code) => {
            if (code !== 0) return reject(new Error(`worker exited with ${code}`));
            resolve(JSON.parse(output));
        });
    });
}

test('concurrent webhook claims produce one owner and one duplicate', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'titanes-payments-concurrent-'));
    const stateFile = path.join(directory, 'state.json');
    const results = await Promise.all([
        runWorker(stateFile, 'event-a'),
        runWorker(stateFile, 'event-b')
    ]);
    assert.equal(results.filter((result) => result.duplicate === false).length, 1);
    assert.equal(results.filter((result) => result.duplicate === true).length, 1);
    assert.equal(Object.keys(JSON.parse(fs.readFileSync(stateFile, 'utf8')).events).length, 1);
});
