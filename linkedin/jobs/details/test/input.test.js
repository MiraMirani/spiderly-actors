import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeInput, buildSearches, classifyUrl, searchPageUrl } from '../src/input.js';

test('crosses titles with locations, maps filter aliases, and defaults to a bounded run', () => {
    const input = normalizeInput({ titles: ['Developer', 'Analyst'], locations: ['Oslo', 'Bergen'], workTypes: ['remote', '3'], contractTypes: ['full-time'], experienceLevels: ['mid-senior'], industry: ['4'], companyId: ['123'], rows: 7 });
    const searches = buildSearches(input, ['456']);
    assert.equal(searches.length, 4);
    assert.equal(input.maxItems, 100);
    const params = new URL(searchPageUrl(searches[0])).searchParams;
    assert.equal(params.get('f_WT'), '2,3');
    assert.equal(params.get('f_JT'), 'F');
    assert.equal(params.get('f_E'), '4');
    assert.equal(params.get('f_I'), '4');
    assert.equal(params.get('f_C'), '123,456');
    assert.equal(searches[0].cap, 7);
});

test('pasted search URLs preserve filters and override structured fields', () => {
    const input = normalizeInput({ titles: ['ignored'], companyName: ['ignored'], workTypes: ['2'], startUrls: [{ url: 'https://no.linkedin.com/jobs/search/?keywords=rust&f_WT=3&f_SB2=4&geoId=123&currentJobId=10' }], maxRowsPerUrl: 5 });
    const [search] = buildSearches(input);
    const u = new URL(searchPageUrl(search, 20));
    assert.equal(u.searchParams.get('f_WT'), '3');
    assert.equal(u.searchParams.get('f_SB2'), '4');
    assert.equal(u.searchParams.get('geoId'), '123');
    assert.equal(u.searchParams.get('currentJobId'), null);
    assert.equal(u.searchParams.get('start'), '20');
    assert.equal(search.cap, 5);
    assert.deepEqual(search.companyNames, []);
});

test('individual and company URLs are classified and unsafe hosts rejected', () => {
    assert.equal(classifyUrl('https://www.linkedin.com/jobs/view/developer-44556677?trk=x').id, '44556677');
    assert.equal(classifyUrl('https://www.linkedin.com/company/example/').slug, 'example');
    for (const url of ['https://linkedin.com.evil.org/jobs/search/', 'http://www.linkedin.com/jobs/search/', 'https://user:pass@www.linkedin.com/jobs/search/', 'https://www.linkedin.com/in/someone']) assert.throws(() => classifyUrl(url));
});

test('invalid inputs fail before network requests', () => {
    for (const raw of [{ rows: -1 }, { maxItems: 0 }, { titles: 'dev' }, { locations: [null] }, { easyApply: 'false' }, { industry: ['invalid'] }, { companyId: ['slug'] }, { workTypes: ['invalid'] }, { publishedAt: 'yesterday' }, { sortBy: 'invalid' }]) assert.throws(() => normalizeInput(raw));
    assert.equal(buildSearches(normalizeInput({})).length, 1);
});
