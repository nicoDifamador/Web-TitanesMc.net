const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('all local HTML and CSS assets resolve to files', () => {
    const sources = fs.readdirSync(__dirname + '/..')
        .filter((file) => file.endsWith('.html'))
        .map((file) => path.join(__dirname, '..', file))
        .concat(path.join(__dirname, '..', 'css', 'estilo.css'));
    const missing = [];
    const attributePattern = /(?:src|href)=["']([^"']+)["']/g;
    const cssPattern = /url\(["']?([^)'"\s]+)["']?\)/g;

    for (const source of sources) {
        const contents = fs.readFileSync(source, 'utf8');
        const references = [
            ...contents.matchAll(attributePattern),
            ...contents.matchAll(cssPattern)
        ].map((match) => match[1]);
        for (const reference of references) {
            if (/^(?:https?:|data:|#|mailto:|javascript:)/i.test(reference)) continue;
            const target = path.resolve(path.dirname(source), reference);
            if (!fs.existsSync(target)) missing.push(`${path.relative(process.cwd(), source)} -> ${reference}`);
        }
    }

    assert.deepEqual(missing, []);
});
