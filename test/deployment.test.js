const assert = require('node:assert/strict');
const { once } = require('node:events');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const test = require('node:test');

const root = path.join(__dirname, '..');

function iniciarProceso() {
    const stateDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'titanes-deployment-'));
    const child = spawn(process.execPath, ['server.js'], {
        cwd: root,
        env: {
            ...process.env,
            HOST: '0.0.0.0',
            SERVER_PORT: '0',
            AUTO_DELIVERY_ENABLED: 'false',
            PANEL_HOST: 'https://control.titanesmc.net',
            PANEL_API_KEY: 'local-test-key',
            PAYPAL_CLIENT_SECRET: 'local-paypal-secret',
            PAYPAL_WEBHOOK_ID: 'local-webhook-id',
            PAYPAL_MERCHANT_ID: 'local-merchant-id',
            TRUST_PROXY: 'loopback',
            SITE_ORIGIN: 'https://titanesmc.net',
            SITE_ORIGINS: 'https://titanesmc.net,https://www.titanesmc.net',
            PAYMENT_STATE_FILE: path.join(stateDirectory, 'state.json')
        },
        stdio: ['ignore', 'pipe', 'pipe']
    });

    return new Promise((resolve, reject) => {
        let output = '';
        const onData = (chunk) => {
            output += chunk.toString();
            const match = output.match(/escuchando en 0\.0\.0\.0:(\d+)/);
            if (match) {
                child.stdout.off('data', onData);
                resolve({ child, port: Number(match[1]) });
            }
        };
        child.stdout.on('data', onData);
        child.once('error', reject);
        child.once('exit', (code) => {
            if (code !== null && !output.includes('escuchando en')) {
                reject(new Error(`server.js terminó antes de escuchar (exit ${code}): ${output}`));
            }
        });
    });
}

test('node server.js sirve la aplicación en 0.0.0.0 y apaga con SIGTERM', async (t) => {
    const { child, port } = await iniciarProceso();
    t.after(async () => {
        if (child.exitCode === null) child.kill('SIGTERM');
        if (child.exitCode === null) await once(child, 'exit');
    });

    const health = await fetch(`http://127.0.0.1:${port}/healthz`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });

    const home = await fetch(`http://127.0.0.1:${port}/`);
    assert.equal(home.status, 200);
    assert.match(await home.text(), /TITANES/i);

    const config = await fetch(`http://127.0.0.1:${port}/config.json`);
    assert.equal(config.status, 200);
    assert.equal((await config.json()).currency, 'USD');

    const preflight = await fetch(`http://127.0.0.1:${port}/api/paypal/orders`, {
        method: 'OPTIONS',
        headers: {
            Origin: 'https://www.titanesmc.net',
            'X-Forwarded-Proto': 'https',
            'X-Forwarded-Host': 'titanesmc.net'
        }
    });
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get('access-control-allow-origin'), 'https://www.titanesmc.net');

    const blockedOrigin = await fetch(`http://127.0.0.1:${port}/api/paypal/orders`, {
        method: 'OPTIONS',
        headers: { Origin: 'https://untrusted.example' }
    });
    assert.equal(blockedOrigin.status, 403);

    assert.equal((await fetch(`http://127.0.0.1:${port}/server.js`)).status, 404);
    assert.equal((await fetch(`http://127.0.0.1:${port}/.env.example`)).status, 404);
    assert.equal((await fetch(`http://127.0.0.1:${port}/SEGURIDAD.md`)).status, 404);

    child.kill('SIGTERM');
    const [code, signal] = await once(child, 'exit');
    assert.equal(code, 0);
    assert.equal(signal, null);
});

test('deployment artifacts keep server.js at the archive root', () => {
    const dockerfile = fs.readFileSync(path.join(root, 'Dockerfile'), 'utf8');
    const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
    const envExample = fs.readFileSync(path.join(root, '.env.example'), 'utf8');

    assert.match(dockerfile, /FROM node:25-bookworm-slim/);
    assert.match(dockerfile, /CMD \["node", "server\.js"\]/);
    assert.match(readme, /MAIN_FILE=server\.js/);
    assert.match(readme, /\/home\/container\/server\.js/);
    assert.match(envExample, /^HOST=0\.0\.0\.0$/m);
});
