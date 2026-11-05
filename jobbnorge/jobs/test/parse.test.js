import test from 'node:test';
import assert from 'node:assert/strict';
import { parseNoDate, parseApiDate, mapListing, mapDetail, buildQuery, parseStartUrl, htmlToText } from '../src/parse.js';

test('dates', () => {
    assert.equal(parseNoDate('26.11.2026'), '2026-11-26');
    assert.equal(parseNoDate('5.1.2027'), '2027-01-05');
    assert.equal(parseNoDate('Continuously'), null);
    assert.equal(parseApiDate("$date('2026-11-26 00:00:00')"), '2026-11-26');
});

test('mapListing', () => {
    const r = mapListing({
        id: 311283, title: 'PhD Candidate', employer: 'NTNU', employerID: 688, department: 'IMP', deadline: '26.11.2026', publicationDate: '05.11.2026',
        link: 'https://www.jobbnorge.no/ledige-stillinger/stilling/311283', jobScope: 'Heltid', jobDuration: 'Vikariat/Midlertidig', positionCount: 1,
        locations: [{ area: 'Trondheim', municipality: 'Trondheim', county: 'Trøndelag', isPrimary: true, zipCode: '7491' }],
        jobType: { id: 406, name: '1017 Stipendiat', jobTypeGroup: { name: 'Vitenskapelige' } },
    });
    assert.equal(r.location, 'Trondheim');
    assert.equal(r.county, 'Trøndelag');
    assert.equal(r.deadline, '2026-11-26');
    assert.equal(r.published, '2026-11-05');
    assert.equal(r.jobType, 'Stipendiat');
});

test('mapDetail', () => {
    const d = mapDetail(
        { components: [{ heading: 'About', text: '<p>Hello &amp; welcome</p><ul><li>One</li><li>Two</li></ul>' }, { heading: '', text: '' }], activeLanguages: [2], contacts: [] },
        { internalReference: '2026/1', deadlineOn: "$date('2026-11-26 00:00:00')", workPlace: [{ adress: 'X 1', area: 'Oslo', zip: '0001', municipality: 'Oslo' }], contacts: [] },
        311283,
    );
    assert.equal(d.reference, '2026/1');
    assert.equal(d.sections.length, 1);
    assert.match(d.description, /Hello & welcome/);
    assert.match(d.description, /- One/);
    assert.equal(d.deadlineFromAd, '2026-11-26');
});

test('query and start urls', () => {
    const q = buildQuery({ term: 'phd', counties: ['11'], employerIds: ['688'], period: 'Week' });
    assert.match(q, /term=phd/);
    assert.match(q, /county=11/);
    assert.match(q, /employer=688/);
    assert.match(q, /Period=Week/);
    assert.deepEqual(parseStartUrl('https://www.jobbnorge.no/ledige-stillinger/stilling/311283'), { jobId: 311283 });
    assert.equal(parseStartUrl('https://www.jobbnorge.no/search/en?q=helse&county=3').term, 'helse');
    assert.equal(htmlToText('<p>a</p><p>b</p>'), 'a\nb');
});
