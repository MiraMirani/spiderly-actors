import test from 'node:test';
import assert from 'node:assert/strict';
import { choosePublicAddress, normalizeUrl, readSettings, sameOriginTarget, summarize } from '../src/visits.js';

test('rejects private, loopback, carrier NAT and mixed DNS responses', () => {
    for (const address of ['127.0.0.1', '10.0.0.1', '100.64.1.2', '169.254.169.254', '192.168.0.1',
        '172.16.0.1', '192.0.2.1', '198.18.1.2', '224.0.0.1', '0.0.0.0']) {
        assert.throws(() => choosePublicAddress(['8.8.8.8', address]), /NON_PUBLIC_ADDRESS/);
    }
    assert.equal(choosePublicAddress(['8.8.8.8']), '8.8.8.8');
    assert.throws(() => choosePublicAddress([]), /NO_IPV4_ADDRESS/);
});

test('rejects credentials, query tokens, custom ports, and IP literals', () => {
    for (const url of ['https://user:pass@example.com/', 'https://example.com/?key=token',
        'http://example.com:8080/', 'http://127.0.0.1/', 'http://0x7f000001/',
        'http://[::1]/', 'http://server.local/', 'file:///etc/passwd']) {
        assert.throws(() => normalizeUrl(url), /INVALID_URL/);
    }
});

test('blocks off-origin, non-HTTP and query-bearing redirect or discovery targets', () => {
    const base = new URL('https://example.com/folder/');
    assert.equal(sameOriginTarget('/help#intro', base, base.origin).href, 'https://example.com/help');
    for (const link of ['//other.example.org/', 'http://example.com/', '/action?delete=true',
        'https://example.com.other.org/', 'javascript:alert(1)']) {
        assert.equal(sameOriginTarget(link, base, base.origin), null);
    }
});

test('deduplicates seeds and enforces the visit budget and input bounds', () => {
    const urls = ['https://example.com/', { url: 'https://example.com/#fragment' }, 'https://example.org/'];
    assert.equal(readSettings({ startUrls: urls, visitCount: 2 }).seeds.length, 2);
    assert.throws(() => readSettings({ startUrls: urls, visitCount: 1 }), /cover every/);
    assert.throws(() => readSettings({ startUrls: urls, visitCount: 51 }), /between 1 and 50/);
    assert.throws(() => readSettings({ startUrls: urls, requestLabels: ['mobile', 'mobile'] }), /distinct/);
});

test('success timings exclude failures and no-response rows remain counted', () => {
    const summary = summarize([
        { success: true, statusCode: 200, responseMs: 10 },
        { success: false, statusCode: 503, responseMs: 999 },
        { success: true, statusCode: 204, responseMs: 30 },
        { success: false, statusCode: null, responseMs: null },
    ], 4);
    assert.deepEqual(summary, {
        requestedVisits: 4, completedVisits: 4, successfulVisits: 2, failedVisits: 2,
        statusCounts: { 200: 1, 204: 1, 503: 1, NO_RESPONSE: 1 },
        medianResponseMs: 10, p95ResponseMs: 30,
    });
});
