const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

test('panel credentials are environment-only and placeholders are rejected', () => {
    const root = path.join(__dirname, '..');
    const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
    const gitignore = fs.readFileSync(path.join(root, '.gitignore'), 'utf8');
    assert.match(server, /leerSecretoObligatorio\('PANEL_API_KEY'\)/);
    assert.doesNotMatch(server, /PANEL_API_KEY\s*=/);
    assert.match(gitignore, /^\.env$/m);
});

test('automatic delivery requires complete panel credentials only when enabled', () => {
    const root = path.join(__dirname, '..');
    const env = {
        ...process.env,
        AUTO_DELIVERY_ENABLED: 'true',
        PANEL_HOST: 'https://control.titanesmc.net',
        PANEL_API_KEY: '',
        SERVER_ID: 'server-id'
    };
    const result = spawnSync(process.execPath, ['-e', "require('./server')"], {
        cwd: root,
        env,
        encoding: 'utf8'
    });
    assert.notEqual(result.status, 0);
    assert.match(`${result.stdout}${result.stderr}`, /PANEL_API_KEY environment variable is required/);
});
