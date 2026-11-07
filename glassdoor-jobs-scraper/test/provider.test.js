import assert from 'node:assert/strict';
import test from 'node:test';
import { adaptFastRows, fastProviderActor, liveProvider, providerActor, providerInput, providerRows, providerRunOptions } from '../src/provider.js';

test('uses the faster keyword source without adding a date filter', () => {
    const upstream = providerInput({ jobType: 'fulltime', includeDescription: true }, 'keyword', [], 20);
    const source = liveProvider({}, 'keyword', upstream);
    assert.equal(source.actor, fastProviderActor);
    assert.equal(source.input.postedWithin, 'any');
    assert.equal(source.input.jobType, 'fullTime');
    assert.equal(source.input.maxResults, 20);
    assert.equal(liveProvider({}, 'url', upstream).actor, providerActor);
    assert.equal(liveProvider({}, 'keyword', { ...upstream, companySize: '5001+' }).actor, providerActor);
});

test('keeps verified posting and location fields from fast results', () => {
    const items = adaptFastRows([{
        jobId: '123', jobUrl: 'https://www.glassdoor.com/job-listing/example.htm',
        title: 'Engineer', postedAt: '2026-11-07', locationId: '1132348',
        latitude: 40.7, longitude: -74.0, isSalaryEstimate: false, salaryMin: 90000,
        applyUrl: 'https://www.glassdoor.com/partner/jobListing.htm?jobListingId=123',
        description: 'Complete details', benefits: ['Paid time off'],
    }], { includeDescription: false });
    const [row] = providerRows(items, [], null, 20);
    assert.equal(row.description, null);
    assert.equal(row.postedAt, '2026-11-07');
    assert.equal(row.longitude, -74.0);
    assert.equal(row.locationId, 1132348);
    assert.equal(row.salarySource, 'employer');
    assert.ok(row.applyUrl.includes('jobListingId=123'));
    assert.deepEqual(row.benefits, ['Paid time off']);
});

test('gives enriched runs more resources while reserving time for dataset import', () => {
    const now = 1000;
    assert.deepEqual(providerRunOptions({ includeDescription: true }, 0.15, new Date(now + 180000), now), {
        memory: 1024, timeout: 160, maxTotalChargeUsd: 0.15,
    });
    assert.equal(providerRunOptions({ includeEmployerStats: true }, 0.15, null, now).timeout, 240);
    assert.equal(providerRunOptions({}, 0.08, null, now).memory, 512);
    assert.throws(() => providerRunOptions({}, 0.08, new Date(now + 30000), now));
});

test('passes only supported keyword search parameters to the provider', () => {
    const input = providerInput({
        keyword: ' software engineer ', location: ' New York ',
        datePosted: '7', remoteOnly: true, savedHtml: '<private>', titleMatch: 'phrase',
        includeDescription: true, includeEmployerStats: true,
    }, 'keyword', [], 5);
    assert.deepEqual(input.keywords, ['software engineer']);
    assert.equal(input.location, 'New York');
    assert.equal(input.datePosted, '7');
    assert.equal(input.remoteOnly, true);
    assert.equal(input.includeDescription, true);
    assert.equal(input.includeDescriptionHtml, true);
    assert.equal(input.includeEmployerStats, true);
    assert.equal(Object.hasOwn(input, 'savedHtml'), false);
    assert.throws(() => providerInput({ jobType: 'invalid' }, 'keyword', [], 5));
});

test('maps valid listings and filters titles without accepting third-party links or duplicate IDs', () => {
    const job = {
        jobId: '123', url: 'https://www.glassdoor.com/job-listing/example.htm?utm_source=test',
        title: 'Senior Software Engineer', status: 'ok', salaryMin: 100000,
        salaryMedian: 125000, salaryIsEstimate: false, easyApply: true,
        description: 'Full description', companyCultureRating: 4.2,
        descriptionHtml: '<p onclick="alert(1)">Full <b>description</b><script>alert(1)</script></p>',
        locationId: 1132348, sponsored: false, tags: ['Health insurance'],
    };
    const rows = providerRows([
        { ...job, url: 'https://example.org/job-listing/example.htm' },
        { ...job, title: 'Product manager' },
        job, job,
    ], [], 'software engineer', 5);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].jobUrl, 'https://www.glassdoor.com/job-listing/example.htm?jl=123');
    assert.equal(rows[0].salarySource, 'employer');
    assert.equal(rows[0].salaryMedian, 125000);
    assert.equal(rows[0].description, 'Full description');
    assert.equal(rows[0].descriptionHtml, '<p>Full <b>description</b></p>');
    assert.equal(rows[0].locationId, 1132348);
    assert.equal(rows[0].sponsored, false);
    assert.deepEqual(rows[0].tags, ['Health insurance']);
    assert.equal(rows[0].companyProfile.cultureRating, 4.2);
    assert.equal(rows[0].easyApplyBadge, true);
    assert.equal(rows[0].sourceUrl, null);
    const url = 'https://www.glassdoor.com/Job/jobs.htm';
    assert.deepEqual(providerInput({}, 'url', [url], 5).keywords, []);
    assert.deepEqual(providerRows([job], [url], null, 5), []);
    assert.equal(providerRows([{ ...job, searchUrl: url }], [url], null, 5)[0].sourceUrl, url);
});
