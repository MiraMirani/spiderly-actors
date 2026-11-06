import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCompanyUrl, employeeRange, externalUrl, parseCompanyPage, classifyResponse } from '../src/parse.js';
const url = 'https://www.linkedin.com/company/example/';
const fixture = `<script type="application/ld+json">invalid</script><script type="application/ld+json">${JSON.stringify({ '@graph': [
    { '@type': 'SocialMediaPosting', author: { '@type': 'Organization', name: 'Other Company' } },
    { '@type': 'Organization', name: 'Example & Co', url, sameAs: 'https://example.com/', description: 'Software for teams.', numberOfEmployees: { value: 125 }, logo: { contentUrl: 'https://media.licdn.com/example.png' }, address: { addressLocality: 'Oslo', addressCountry: 'NO' } }
] })}</script>
<h1 class="top-card-layout__title">Example &amp; Co</h1><div data-semaphore-content-type="COMPANY" data-semaphore-content-urn="urn:li:organization:12345"></div>
<h3 class="top-card-layout__first-subline">Oslo, Norway · 12,345 followers</h3>
<a class="top-card-layout__cta" href="https://www.linkedin.com/jobs/search/?f_C=12345&amp;trk=test">See jobs</a>
<section data-test-id="about-us"><dl><dt>Industry</dt><dd>Software Development</dd><dt>Company size</dt><dd>51-200 employees</dd><dt>Founded</dt><dd>2015</dd><dt>Specialties</dt><dd>Data, APIs, and Software</dd></dl></section>
<section class="locations"><li><span class="tag-sm">Primary</span><div id="address-0"><p>Example street 1</p><p>Oslo, NO</p></div></li></section>
<section data-test-id="similar-pages"><div data-entity-urn="urn:li:organization:99999"></div></section>`;

test('normalizes company URLs, locale URLs, paths, slugs and IDs without tracking', () => {
    for (const input of ['EXAMPLE', '/company/example', 'https://no.linkedin.com/company/example/?trk=x', 'linkedin.com/company/example']) assert.equal(normalizeCompanyUrl(input), url);
    assert.equal(normalizeCompanyUrl('1234'), 'https://www.linkedin.com/company/1234/');
});
test('rejects arbitrary hosts, credentials, people pages and nested paths', () => {
    for (const input of ['https://evil.com/company/example','https://linkedin.com.evil.com/company/example', 'https://user:password@linkedin.com/company/example','https://www.linkedin.com/in/person', '/company/example/posts', 'software companies', 'javascript:alert(1)', null, {}]) assert.throws(() => normalizeCompanyUrl(input));
});
test('reads own organization in JSON-LD graph, facts and locations, ignoring post authors', () => {
    const row = parseCompanyPage(fixture,url);
    assert.equal(row.name,'Example & Co'); assert.equal(row.companyId,'12345'); assert.equal(row.industry,'Software Development');
    assert.equal(row.websiteUrl,'https://example.com/'); assert.equal(row.employeeCount,125); assert.equal(row.followersCount,12345);
    assert.deepEqual(row.employeeCountRange,{start:51,end:200}); assert.equal(row.foundedYear,2015);
    assert.deepEqual(row.specialities,['Data','APIs','Software']); assert.equal(row.headquarter.city,'Oslo');
    assert.equal(row.locations[0].headquarter,true); assert.equal(row.locations[0].address,'Example street 1, Oslo, NO');
    assert.equal(row.jobSearchUrl,'https://www.linkedin.com/jobs/search/?f_C=12345');
});
test('does not invent numbers, verification state, coordinates or missing fields', () => {
    const row = parseCompanyPage('<h1 class="top-card-layout__title">Tiny</h1><section data-test-id="about-us"><p>Public overview</p></section>',url);
    assert.equal(row.followersCount,null); assert.equal(row.employeeCount,null); assert.equal(row.industryId,null); assert.deepEqual(row.specialities,[]);
    assert.equal(row.tagline,null); assert.equal(row.websiteUrl,null); assert.equal(row.verified,undefined);
});
test('does not treat a login wall or generic error as a company', () => {
    assert.equal(parseCompanyPage('<h1>Sign in</h1>',url),null);
    assert.equal(parseCompanyPage('<h1>Page not found</h1>',url),null);
});
test('unwraps public website redirect and rejects unsafe or LinkedIn URLs', () => {
    assert.equal(externalUrl('https://www.linkedin.com/redir/redirect?url=https%3A%2F%2Fexample.com%2F'),'https://example.com/');
    assert.equal(externalUrl('javascript:alert(1)'),null); assert.equal(externalUrl(url),null);
});
test('distinguishes open-ended company ranges from employee counts', () => {
    assert.deepEqual(employeeRange('10,001+ employees'),{start:10001,end:null}); assert.deepEqual(employeeRange('2-10 employees'),{start:2,end:10}); assert.equal(employeeRange(''),null);
});
test('separates missing pages, restrictions, server errors and successful HTTP responses', () => {
    assert.equal(classifyResponse(404,url,'').status,'NOT_FOUND'); assert.equal(classifyResponse(404,url,'').retryable,false);
    assert.equal(classifyResponse(429,url,'').status,'BLOCKED'); assert.equal(classifyResponse(503,url,'').retryable,true);
    assert.equal(classifyResponse(200,'https://www.linkedin.com/authwall','').status,'BLOCKED'); assert.equal(classifyResponse(200,'https://www.linkedin.com/uas/login','').status,'BLOCKED'); assert.equal(classifyResponse(200,url,fixture),null);
});
