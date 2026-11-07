import assert from 'node:assert/strict';
import test from 'node:test';
import { providerInput, providerRows } from '../src/provider.js';

test('passes only supported keyword search parameters to the provider', () => {
    const input = providerInput({
        keyword: ' software engineer ', location: ' New York ',
        datePosted: '7', remoteOnly: true, savedHtml: '<private>', titleMatch: 'phrase',
    }, 'keyword', [], 5);
    assert.deepEqual(input.keywords, ['software engineer']);
    assert.equal(input.location, 'New York');
    assert.equal(input.datePosted, '7');
    assert.equal(input.remoteOnly, true);
    assert.equal(Object.hasOwn(input, 'savedHtml'), false);
    assert.throws(() => providerInput({ jobType: 'invalid' }, 'keyword', [], 5));
});

test('maps valid listings and filters titles without accepting third-party links or duplicate IDs', () => {
    const job = {
        jobId: '123', url: 'https://www.glassdoor.com/job-listing/example.htm?utm_source=test',
        title: 'Senior Software Engineer', status: 'ok', salaryMin: 100000,
        salaryIsEstimate: false, easyApply: true,
    };
    const rows = providerRows([
        { ...job, url: 'https://example.org/job-listing/example.htm' },
        { ...job, title: 'Product manager' },
        job, job,
    ], null, 'software engineer', 5);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].jobUrl, 'https://www.glassdoor.com/job-listing/example.htm?jl=123');
    assert.equal(rows[0].salarySource, 'employer');
    assert.equal(rows[0].easyApplyBadge, true);
    assert.equal(rows[0].sourceUrl, null);
});
