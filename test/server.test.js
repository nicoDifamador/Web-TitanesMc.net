const assert = require('node:assert/strict');
const { once } = require('node:events');
const test = require('node:test');

test('the public test route is unavailable', async (t) => {
    process.env.PANEL_API_KEY = 'local-test-key';
    const server = require('../server').listen(0, '127.0.0.1');
    t.after(() => new Promise((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
    }));
    await once(server, 'listening');

    const response = await fetch(`http://127.0.0.1:${server.address().port}/test-rest`);
    assert.equal(response.status, 404);
});
