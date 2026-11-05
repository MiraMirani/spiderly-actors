import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSearchPage, parseAdPage, htmlToText, withPage, buildSearchUrl, resolveLocation, extractLocationMap } from '../src/parse.js';

const doc = { type: 'job', ad_id: 478710684, heading: 'Software Developer', job_title: 'Software Developer', company_name: 'SmartDok AS', location: 'Oslo - Ullern', published: 1791976463000, deadline: 1794005999999, canonical_url: 'https://www.finn.no/job/ad/478710684', no_of_positions: 1, coordinates: { lat: 69.6, lon: 18.9 }, work_locations: [['Norge', 'Troms', 'Tromsø', 'Tromsø'], ['Norge', 'Oslo', 'Ullern', 'Oslo']] };
const filters = [{ name: 'location', filter_items: [{ display_name: 'Norge', value: '0.20001', filter_items: [{ display_name: 'Rogaland', value: '1.20001.20012', filter_items: [{ display_name: 'Haugesund', value: '2.20001.20012.20197', filter_items: [] }] }] }] }];
const state = { queries: [{ state: { data: { docs: [doc], filters, metadata: { paging: { current: 1, last: 24 }, result_size: { match_count: 2319 } } } } }] };
const wrap = (o) => `<script type="application/json" data-react-query-state>${Buffer.from(JSON.stringify(o)).toString('base64')}</script>`;
const adHtml = `<script type="application/ld+json">${JSON.stringify({ 'script:ld+json': { '@type': 'JobPosting', title: 'Dev', description: '<p>Build</p><p><b>stuff</b> &amp; more&#64;x</p>', datePosted: '2026-10-14', validThrough: '2026-11-06', employmentType: ['FULL_TIME'], hiringOrganization: { name: 'ACME', url: 'https://acme.no' }, jobLocation: { address: { postalCode: '9008', addressLocality: 'Tromsø' } } } })}</script>`;

test('search page', () => {
    const { ads, lastPage, total, perPage } = parseSearchPage(wrap(state));
    assert.deepEqual([ads[0].id, ads[0].title, ads[0].company, ads[0].latitude, ads[0].deadline], ['478710684', 'Software Developer', 'SmartDok AS', 69.6, '2026-11-06T22:59:59.999Z']);
    assert.deepEqual(ads[0].allLocations, ['Tromsø', 'Oslo']);
    assert.deepEqual([lastPage, total, perPage], [24, 2319, 1]);
});
test('search page link fallback', () => {
    assert.equal(parseSearchPage('<a href="/job/ad/479000001?x=1">Backend</a>').ads[0].url, 'https://www.finn.no/job/ad/479000001');
});
test('ad page', () => {
    const d = parseAdPage(adHtml);
    assert.deepEqual([d.company, d.deadline, d.location, d.employmentType, d.companyUrl], ['ACME', '2026-11-06', '9008 Tromsø', 'FULL_TIME', 'https://acme.no']);
    assert.equal(d.description, 'Build stuff & more@x');
    assert.ok(d.descriptionHtml.includes('<b>stuff</b>'));
    assert.equal(parseAdPage('<html></html>'), null);
});
test('text + urls + locations', () => {
    assert.equal(htmlToText('<h1>A</h1><p>B&nbsp;C</p>'), 'A B C');
    const map = extractLocationMap(wrap(state));
    assert.equal(resolveLocation('Rogaland', map), '1.20001.20012');
    assert.equal(buildSearchUrl({ keyword: 'x', location: 'Haugesund' }, map), 'https://www.finn.no/job/search?q=x&location=2.20001.20012.20197');
    assert.equal(withPage('https://www.finn.no/job/search?q=a', 3), 'https://www.finn.no/job/search?q=a&page=3');
});
