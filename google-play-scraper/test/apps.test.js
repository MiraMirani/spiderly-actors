import assert from 'node:assert/strict';
import test from 'node:test';
import { appId, parseApp } from '../src/apps.js';

test('accepts IDs and Google Play detail URLs only', () => {
    assert.equal(appId(' org.wikipedia '), 'org.wikipedia');
    assert.equal(appId('https://play.google.com/store/apps/details/Wikipedia?id=org.wikipedia&hl=en'), 'org.wikipedia');
    assert.throws(() => appId('https://example.org/store/apps/details?id=org.wikipedia'));
});

test('extracts public listing fields without changing free price or missing rating', () => {
    const html = `<script type="application/ld+json">{"@type":"SoftwareApplication",
      "name":"Example", "offers":[{"price":"0","priceCurrency":"USD"}]}</script>
      <div data-g-id="description">One<br>two</div>`;
    const row = parseApp(html, 'org.example', 'en', 'US');
    assert.equal(row.price, 0);
    assert.equal(row.rating, null);
    assert.equal(row.description, 'One two');
    assert.throws(() => parseApp('<title>Not found</title>', 'org.example', 'en', 'US'));
});
