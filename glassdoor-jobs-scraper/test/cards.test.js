import assert from 'node:assert/strict';
import test from 'node:test';
import { parseCards, sampleSearch, searchUrl } from '../src/cards.js';

test('normalizes public salary and job links and deduplicates by listing ID', () => {
    const card = `<li data-test="jobListing" data-jobid="123">
      <a data-test="job-title" href="/job-listing/example.htm?utm_source=test">Engineer</a>
      <span class="EmployerProfile_compactEmployerName__test">Example Co</span>
      <span role="meter" aria-valuenow="4.2"></span>
      <span data-test="emp-location">New York, NY</span>
      <span data-test="detailSalary">$40.50 – $52 Per Hour (Employer provided)</span>
      <span aria-label="Easy Apply"></span>
    </li>`;
    const [job, duplicate] = parseCards(card + card, sampleSearch);
    assert.equal(duplicate, undefined);
    assert.equal(job.jobUrl, 'https://www.glassdoor.com/job-listing/example.htm?jl=123');
    assert.equal(job.company, 'Example Co');
    assert.equal(job.companyRating, 4.2);
    assert.equal(job.easyApplyBadge, true);
    assert.equal(job.salaryMin, 40.5);
    assert.equal(job.salaryMax, 52);
    assert.equal(job.salaryPeriod, 'hour');
    assert.equal(job.salarySource, 'employer');
    assert.equal(job.snippet, null);
});

test('accepts only Glassdoor search pages and drops fragments', () => {
    assert.equal(searchUrl({ url: sampleSearch + '#top' }), sampleSearch);
    assert.throws(() => searchUrl('https://www.glassdoor.com.example.org/Job/jobs.htm'));
    assert.throws(() => searchUrl('https://www.glassdoor.com/partner/jobListing.htm'));
});
