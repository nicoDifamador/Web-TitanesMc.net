const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('responsive CSS covers the fixed navigation and mobile catalog layout', () => {
    const css = fs.readFileSync(path.join(__dirname, '..', 'css', 'estilo.css'), 'utf8');
    for (const breakpoint of ['max-width: 900px', 'max-width: 560px', 'max-width: 360px']) {
        assert.match(css, new RegExp(`@media \\(\\s*${breakpoint}\\s*\\)`));
    }
    assert.match(css, /\.main-layout\s*\{[\s\S]*?flex-direction:\s*column\s*!important/);
    assert.match(css, /\.categories-nav\s*\{[\s\S]*?width:\s*100%\s*!important/);
    assert.match(css, /\.items-grid,\s*\.items-grid-keys\s*\{[\s\S]*?grid-template-columns:\s*1fr\s*!important/);
    assert.match(css, /\.cart-item-info\s*\{[\s\S]*?overflow-wrap:\s*anywhere/);
});
