import assert from 'node:assert/strict';
import test from 'node:test';
import { appId, appRow } from '../src/apps.js';

test('uses the numeric App Store ID from supported listing links', () => {
    assert.equal(appId('https://apps.apple.com/no/app/example/id324684580?pt=1'), '324684580');
    assert.throws(() => appId('https://example.org/no/app/example/id324684580'));
});

test('keeps a free software offer and ignores non-app entries', () => {
    const input = { trackId: 123, kind: 'software', trackName: 'Example', price: 0, screenshotUrls: ['javascript:alert(1)'] };
    const row = appRow(input, 'US');
    assert.equal(row.appId, '123');
    assert.equal(row.price, 0);
    assert.deepEqual(row.screenshotUrls, []);
    assert.equal(row.rating, null);
    assert.equal(appRow({ ...input, kind: 'song' }, 'US'), null);
});
