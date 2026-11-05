import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSearchPage, parseDetailPage, buildSearchUrl, optionsFromSearchUrl, titleMatches, htmlToText } from '../src/parse.js';

const card = (id, title, company) => `<li>
  <div class="base-card base-search-card" data-entity-urn="urn:li:jobPosting:${id}">
    <a class="base-card__full-link" href="https://no.linkedin.com/jobs/view/x-${id}?position=1&amp;pageNum=0"><span class="sr-only">${title}</span></a>
    <img data-delayed-url="https://media.licdn.com/company-logo_100_100/abc?e=1&amp;v=beta">
    <div class="base-search-card__info">
      <h3 class="base-search-card__title">  ${title} </h3>
      <h4 class="base-search-card__subtitle"><a class="hidden-nested-link" href="https://no.linkedin.com/company/acme?trk=x"> ${company} </a></h4>
      <div class="base-search-card__metadata"><span class="job-search-card__location"> Oslo, Norway </span>
        <time class="job-search-card__listdate" datetime="2026-10-26"> 6 days ago </time></div>
    </div></div></li>`;
const detail = `<h2 class="top-card-layout__title topcard__title">Dev</h2>
<a class="topcard__org-name-link" href="https://no.linkedin.com/company/acme?trk=a"> ACME </a>
<span class="topcard__flavor topcard__flavor--bullet"> Oslo, Norway </span>
<span class="posted-time-ago__text topcard__flavor--metadata"> 2 days ago </span>
<figcaption class="num-applicants__caption"> Over 200 applicants </figcaption>
<a href="https://www.linkedin.com/search/results/people/?facetCurrentCompany%3D51685213&amp;x=1">people</a>
<ul><li class="description__job-criteria-item"><h3 class="description__job-criteria-subheader"> Seniority level </h3><span class="description__job-criteria-text"> Mid-Senior level </span></li>
<li class="description__job-criteria-item"><h3 class="description__job-criteria-subheader"> Employment type </h3><span class="description__job-criteria-text"> Full-time </span></li></ul>
<div class="show-more-less-html__markup relative"><p>Build <b>things</b> &amp; more</p><ul><li>Rust</li></ul></div>
<code id="applyUrl"><!--"https://acme.example/apply?a=1&amp;b=2"--></code>`;

test('search cards', () => {
    const jobs = parseSearchPage(card('111111', 'Dev', 'ACME') + card('222222', 'Ops', 'Beta'));
    assert.equal(jobs.length, 2);
    assert.deepEqual([jobs[0].id, jobs[0].title, jobs[0].company, jobs[0].location, jobs[0].postedDate], ['111111', 'Dev', 'ACME', 'Oslo, Norway', '2026-10-26']);
    assert.equal(jobs[0].companyUrl, 'https://no.linkedin.com/company/acme');
    assert.equal(jobs[0].url, 'https://www.linkedin.com/jobs/view/111111');
    assert.ok(jobs[0].companyLogo.includes('company-logo'));
});
test('detail page', () => {
    const d = parseDetailPage(detail + '<div class="compensation__salary">Base pay range $100/yr - $200/yr</div><button data-tracking-control-name="public_jobs_apply-link-onsite"></button>');
    assert.equal(d.applyType, 'EASY_APPLY');
    assert.equal(d.salary, '$100/yr - $200/yr');
    assert.equal(parseDetailPage(detail + '<icon class="apply-button__offsite-apply-icon-svg"></icon>').applyType, 'EXTERNAL');
    assert.deepEqual([d.title, d.company, d.companyId, d.applicants, d.seniorityLevel, d.employmentType], ['Dev', 'ACME', '51685213', 'Over 200 applicants', 'Mid-Senior level', 'Full-time']);
    assert.equal(d.description, 'Build things & more Rust');
    assert.equal(d.applyUrl, 'https://acme.example/apply?a=1&b=2');
    assert.equal(parseDetailPage('<html></html>'), null);
});
test('search url', () => {
    const u = new URL(buildSearchUrl({ keywords: 'dev', location: 'Norway', datePosted: 'r86400', jobType: ['fulltime', 'C'], workType: ['remote'], easyApply: true, sortBy: 'recent', urlParam: ['f_SB2=4'] }, 20));
    assert.equal(u.searchParams.get('f_JT'), 'F,C');
    assert.equal(u.searchParams.get('f_WT'), '2');
    assert.equal(u.searchParams.get('f_AL'), 'true');
    assert.equal(u.searchParams.get('sortBy'), 'DD');
    assert.equal(u.searchParams.get('f_SB2'), '4');
    assert.equal(u.searchParams.get('start'), '20');
});
test('search url from linkedin url + title filters', () => {
    const o = optionsFromSearchUrl('https://www.linkedin.com/jobs/search/?keywords=java&location=Oslo&f_TPR=r604800&currentJobId=1');
    assert.deepEqual([o.keywords, o.location, o.urlParam], ['java', 'Oslo', ['f_TPR=r604800']]);
    assert.ok(titleMatches('Senior Backend Developer', ['developer backend', 'x']));
    assert.ok(!titleMatches('Designer', ['developer']));
    assert.equal(htmlToText('<p>A</p><p>B&nbsp;C</p>'), 'A B C');
});
