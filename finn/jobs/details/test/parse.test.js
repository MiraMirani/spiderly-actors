import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSearchPage, parseAdPage, withPage, buildSearchUrl, resolveLocation, extractLocationMap } from '../src/parse.js';

const doc = { type: 'job', ad_id: 478710684, id: '478710684', heading: 'Software Developer', job_title: 'Software Developer', company_name: 'SmartDok AS', location: 'Oslo - Ullern', published: 1791976463000, deadline: 1794005999999, canonical_url: 'https://www.finn.no/job/ad/478710684', no_of_positions: 1, work_locations: [['Norge', 'Troms', 'Tromsø', 'Tromsø'], ['Norge', 'Oslo', 'Ullern', 'Oslo']] };
const state = { queries: [{ state: { data: { docs: [doc], metadata: { paging: { current: 1, last: 24 }, result_size: { match_count: 2319 } } } } }] };
const b64 = Buffer.from(JSON.stringify(state)).toString('base64');
const searchHtml = `<script type="application/json" data-react-query-state>${b64}</script>`;
const adHtml = `<script type="application/ld+json">${JSON.stringify({ 'script:ld+json': { '@type': 'JobPosting', title: 'Dev', description: '<p>Build</p><p><b>stuff</b></p>', datePosted: '2026-10-14', validThrough: '2026-11-06', employmentType: ['FULL_TIME'], hiringOrganization: { name: 'ACME', url: 'https://acme.no' }, jobLocation: { address: { postalCode: '9008', addressLocality: 'Tromsø' } } } })}</script>`;

test('search page: embedded base64 state', () => {
    const { ads, lastPage, total } = parseSearchPage(searchHtml);
    assert.equal(ads.length, 1);
    assert.deepEqual([ads[0].id, ads[0].title, ads[0].company, ads[0].location], ['478710684', 'Software Developer', 'SmartDok AS', 'Oslo - Ullern']);
    assert.equal(ads[0].deadline, '2026-11-06T22:59:59.999Z');
    assert.deepEqual(ads[0].allLocations, ['Oslo', 'Oslo'].map((_, i) => ['Tromsø', 'Oslo'][i]));
    assert.equal(lastPage, 24); assert.equal(total, 2319);
});
test('search page: link fallback', () => {
    const { ads } = parseSearchPage('<a href="/job/ad/479000001?x=1">Backend</a>');
    assert.equal(ads[0].url, 'https://www.finn.no/job/ad/479000001');
});
test('ad page json-ld (wrapped)', () => {
    const d = parseAdPage(adHtml);
    assert.deepEqual([d.company, d.deadline, d.location, d.employmentType, d.companyUrl], ['ACME', '2026-11-06', '9008 Tromsø', 'FULL_TIME', 'https://acme.no']);
    assert.equal(d.description, 'Build stuff');
});
test('urls + locations', () => {
    const st = { queries: [{ state: { data: { filters: [{ name: 'location', filter_items: [{ display_name: 'Norge', value: '0.20001', filter_items: [{ display_name: 'Rogaland', value: '1.20001.20012', filter_items: [{ display_name: 'Haugesund', value: '2.20001.20012.20197', filter_items: [] }] }] }] }] } } }] };
    const map = extractLocationMap(`<script data-react-query-state>${Buffer.from(JSON.stringify(st)).toString('base64')}</script>`);
    assert.equal(withPage('https://www.finn.no/job/search?q=a', 3), 'https://www.finn.no/job/search?q=a&page=3');
    assert.equal(resolveLocation('Rogaland', map), '1.20001.20012');
    assert.equal(resolveLocation('1.20001.20061'), '1.20001.20061');
    assert.equal(buildSearchUrl({ keyword: 'utvikler', location: 'Haugesund' }, map), 'https://www.finn.no/job/search?q=utvikler&location=2.20001.20012.20197');
});
