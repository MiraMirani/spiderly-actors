import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDetail, mapHit, htmlToText, flightPayload } from '../src/parse.js';

const text = '<p>Hei &amp; velkommen – søk nå!</p><ul><li>Én</li><li>To</li></ul>';
const bytes = Buffer.byteLength(text, 'utf8').toString(16);
const flight = `1b:["$","div",null,{"adData":{"id":"x","title":"T","adTextHtml":"$52","engagementType":"Fast","employer":{"name":"E","homepage":"e.no"},"application":{"applicationUrl":"a.no/x"}}}]\n52:T${bytes},${text}\n`;
const html = `<html><script>self.__next_f.push([1,${JSON.stringify(flight)}])</script></html>`;

test('flight payload + detail parse', () => {
    assert.ok(flightPayload(html).includes('adData'));
    const d = parseDetail(html);
    assert.equal(d.engagementType, 'Fast');
    assert.equal(d.employerHomepage, 'e.no');
    assert.equal(d.applicationUrl, 'https://a.no/x');
    assert.equal(d.descriptionHtml, text);
    assert.match(d.description, /Hei & velkommen – søk nå!/);
    assert.match(d.description, /• Én\n• To/);
});

test('mapHit', () => {
    const j = mapHit({ _id: 'u1', _source: { uuid: 'u1', title: 'A', employer: { name: '' }, businessName: 'B', locationList: [{ city: 'OSLO', county: 'OSLO' }], properties: { needDriversLicense: ['false'], jobtitle: 'J' } } });
    assert.equal(j.employer, 'B'); assert.equal(j.city, 'OSLO'); assert.equal(j.needsDriversLicense, false);
    assert.equal(j.url, 'https://arbeidsplassen.nav.no/stillinger/stilling/u1');
});

test('htmlToText', () => assert.equal(htmlToText('a<br>b'), 'a\nb'));
