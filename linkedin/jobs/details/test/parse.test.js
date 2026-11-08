import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseSearchPage, parseJobPage, parseCompanyPage, parseSalary, parseSearchTotal, makeRow } from '../src/parse.js';
import { card } from './helpers.js';

const fixture = (name) => readFileSync(new URL(`fixtures/${name}.html`, import.meta.url), 'utf8');

test('cards decode image URLs and discard malformed cards', () => {
    const rows = parseSearchPage(card('101') + card('102') + card('101') + '<li><h3>Unrelated</h3></li>');
    assert.equal(rows.length, 2);
    assert.equal(rows[0].companyUrl, 'https://www.linkedin.com/company/example-nordic');
    assert.equal(rows[0].companyLogo, 'https://media.licdn.com/example.png?a=1&b=2');
});

test('job details preserve nested description content and structured salary', () => {
    const job = parseJobPage(fixture('job'), '101', true);
    assert.equal(job.companyId, '123456');
    assert.equal(job.salaryMin, 700000);
    assert.equal(job.salaryMax, 900000);
    assert.equal(job.salaryCurrency, 'NOK');
    assert.equal(job.salaryPeriod, 'year');
    assert.match(job.description, /JavaScript/);
    assert.match(job.descriptionHtml, /<ul>/);
    assert.equal(job.applyUrl, 'https://careers.example.org/apply?a=1&b=2');
    assert.equal(job.experienceLevel, 'Mid-Senior level');
    assert.equal(job.applicationsCount, 'Over 200 applicants');
    assert.equal(job.workType, 'Remote');
    assert.equal(job.posterFullName, 'Example Recruiter');
    assert.equal(job.posterHeadline, 'Talent Partner');
    assert.equal(job.locationDetails.city, 'Oslo');
    assert.equal(job.isReposted, true);
    assert.equal(job.isVerified, null);
    assert.equal(parseJobPage('<h1>Sign in</h1>', '101'), null);
});

test('optional signals stay null when disabled or not explicitly published', () => {
    const job = parseJobPage(fixture('job'), '101', false);
    assert.equal(job.posterHeadline, null);
    assert.equal(job.locationDetails, null);
    assert.equal(job.isReposted, null);
    assert.equal(job.jobStatus, null);
});

test('registration links are never emitted as direct application links', () => {
    const html = '<h2 class="topcard__title">Engineer</h2><a data-tracking-control-name="public_jobs_apply-link-offsite" href="https://www.linkedin.com/signup/cold-join?x=1">Apply</a>';
    assert.equal(parseJobPage(html, '101').applyUrl, null);
});

test('company parsing keeps employee range separate from exact employee count', () => {
    const company = parseCompanyPage(fixture('company'));
    assert.equal(company.companyId, '123456');
    assert.equal(company.companyEmployeeCount, 240);
    assert.equal(company.companyEmployeeRange, '201-500 employees');
    assert.equal(company.companyFollowerCount, 12345);
    assert.equal(company.companyWebsite, 'https://example.org/');
    assert.equal(company.companyFounded, 2015);
    assert.equal(company.companyHeadquarters.city, 'Oslo');
    const rangeOnly = fixture('company').replace(/<a data-tracking-control-name="about_employees">.*?<\/a>/, '');
    assert.equal(parseCompanyPage(rangeOnly).companyEmployeeCount, null);
    assert.equal(parseCompanyPage('<h1>Sign in</h1><script type="application/ld+json">{"@type":"WebSite"}</script>'), null);
});

test('salary parsing handles separators, currency, shorthand and one-sided bounds', () => {
    for (const [raw, min, max, currency, period] of [
        ['$90k - $120k per year', 90000, 120000, 'USD', 'year'],
        ['€70.000 - €90.000 per year', 70000, 90000, 'EUR', 'year'],
        ['£40.50 - £60.75 per hour', 40.5, 60.75, 'GBP', 'hour'],
        ['NOK 700 000–900 000 / year', 700000, 900000, 'NOK', 'year'],
        ['Up to USD 100,000/year', null, 100000, 'USD', 'year'],
        ['From $45/hour', 45, null, 'USD', 'hour'],
    ]) assert.deepEqual(parseSalary(raw), { salaryMin: min, salaryMax: max, salaryCurrency: currency, salaryPeriod: period }, raw);
    assert.equal(parseSalary('Competitive').salaryMin, null);
});

test('missing detail values do not erase card values or invent unknown fields', () => {
    const base = parseSearchPage(card('101'))[0];
    const row = makeRow(base, { publishedAt: null, companyLogo: null }, null, { searchId: '1' });
    assert.equal(row.publishedAt, '2026-11-04');
    assert.ok(row.companyLogo);
    assert.equal(row.detailsStatus, 'failed');
    assert.equal(row.salaryMin, null);
    assert.equal(row.companyEmployeeCount, null);
});

test('search totals preserve lower-bound semantics', () => {
    assert.deepEqual(parseSearchTotal('<span class="results-context-header__job-count">1,000+</span>'), { total: 1000, isLowerBound: true });
    assert.deepEqual(parseSearchTotal(''), { total: null, isLowerBound: false });
});
