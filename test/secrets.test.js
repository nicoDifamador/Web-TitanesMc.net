const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('panel credentials are environment-only and placeholders are rejected', () => {
    const root = path.join(__dirname, '..');
    const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
    const gitignore = fs.readFileSync(path.join(root, '.gitignore'), 'utf8');
    assert.match(server, /leerSecretoObligatorio\('PANEL_API_KEY'\)/);
    assert.doesNotMatch(server, /PANEL_API_KEY\s*=/);
    assert.match(gitignore, /^\.env$/m);
});
