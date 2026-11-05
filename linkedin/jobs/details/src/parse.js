import { load } from 'cheerio';

export const clean = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();
const nullable = (v) => clean(v) || null;
const text = ($, selector) => nullable($(selector).first().text());
const attr = ($, selector, name) => nullable($(selector).first().attr(name));
const imageUrl = ($, selector) => attr($, selector, 'data-delayed-url') || attr($, selector, 'src');

export function publicUrl(value, base = 'https://www.linkedin.com', stripQuery = false) {
    if (!value) return null;
    try {
        const u = new URL(value, base);
        if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password) return null;
        if (stripQuery) { u.search = ''; u.hash = ''; }
        return u.toString();
    } catch { return null; }
}

export function htmlToText(html) {
    const $ = load(String(html ?? ''));
    $('script, style').remove();
    $('br').replaceWith('\n');
    $('p, div, li, h1, h2, h3, h4, ul, ol').append('\n');
    return $.text().replace(/[\t\r ]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

function jsonLd($, type) {
    const matches = [];
    function visit(value) {
        if (Array.isArray(value)) return value.forEach(visit);
        if (!value || typeof value !== 'object') return;
        if ([value['@type']].flat().includes(type)) matches.push(value);
        if (value['@graph']) visit(value['@graph']);
    }
    $('script[type="application/ld+json"]').each((_, el) => {
        try { visit(JSON.parse($(el).html())); } catch { /* Invalid JSON-LD is ignored; DOM selectors still apply. */ }
    });
    return matches[0] ?? {};
}

function numeric(value) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    const s = clean(value).replace(/\s/g, '');
    if (!s) return null;
    const n = Number(s.replace(/[,.](?=\d{3}(?:\D|$))/g, '').replace(',', '.'));
    return Number.isFinite(n) ? n : null;
}

export function parseSalary(value, structured) {
    const raw = clean(value);
    const result = { salaryMin: null, salaryMax: null, salaryCurrency: null, salaryPeriod: null };
    const currency = /\b(USD|EUR|GBP|NOK|SEK|DKK|CAD|AUD|INR|CHF|PLN|JPY|SGD)\b/i.exec(raw)?.[1]?.toUpperCase();
    result.salaryCurrency = currency ?? (/€/.test(raw) ? 'EUR' : /£/.test(raw) ? 'GBP' : /\$/.test(raw) ? 'USD' : null);
    const periods = { hour: /\b(hour|hourly|hr)\b|\/h\b/i, day: /\b(daily|day)\b/i, week: /\b(weekly|week|wk)\b/i, month: /\b(monthly|month|mo)\b/i, year: /\b(annually|annual|year|yearly|yr|annum)\b/i };
    for (const [name, re] of Object.entries(periods)) if (re.test(raw)) result.salaryPeriod = name;
    const amounts = [...raw.matchAll(/\d+(?:[,.\u00a0 ]\d+)*(?:\s*[kK]\b)?/g)].slice(0, 2).map(([amount]) => {
        const multiplier = /k\s*$/i.test(amount) ? 1000 : 1;
        const n = numeric(amount.replace(/k\s*$/i, ''));
        return n === null ? null : n * multiplier;
    });
    if (raw && amounts.length) {
        if (/\b(up to|maximum|max)\b/i.test(raw)) result.salaryMax = amounts[0];
        else if (/\b(from|minimum|min|starting)\b/i.test(raw) || /\+\s*(?:\/|per|$)/i.test(raw)) result.salaryMin = amounts[0];
        else { result.salaryMin = amounts[0]; result.salaryMax = amounts[1] ?? amounts[0]; }
    }
    if (structured && typeof structured === 'object') {
        const v = structured.value;
        const fixed = typeof v === 'number' ? v : typeof v?.value === 'number' ? v.value : null;
        result.salaryMin = numeric(v?.minValue) ?? fixed ?? result.salaryMin;
        result.salaryMax = numeric(v?.maxValue) ?? fixed ?? result.salaryMax;
        result.salaryCurrency = nullable(structured.currency)?.toUpperCase() ?? result.salaryCurrency;
        const unit = clean(v?.unitText).toLowerCase();
        if (Object.hasOwn(periods, unit)) result.salaryPeriod = unit;
    }
    return result;
}

export function parseSearchPage(html) {
    const $ = load(html);
    const jobs = [];
    $('.base-search-card, [data-entity-urn*="urn:li:jobPosting:"]').each((_, el) => {
        const c = $(el);
        const id = /urn:li:jobPosting:(\d+)/.exec(c.attr('data-entity-urn') ?? '')?.[1]
            ?? /\/jobs\/view\/(?:[^/?]*-)?(\d+)/.exec(c.find('.base-card__full-link').attr('href') ?? '')?.[1];
        const title = nullable(c.find('.base-search-card__title').text());
        if (!id || !title || jobs.some((j) => j.id === id)) return;
        jobs.push({
            id, title, jobUrl: `https://www.linkedin.com/jobs/view/${id}`,
            companyName: nullable(c.find('.base-search-card__subtitle').text()),
            companyUrl: publicUrl(c.find('.base-search-card__subtitle a').attr('href'), undefined, true),
            companyLogo: publicUrl(c.find('img').attr('data-delayed-url') || c.find('img').attr('src')),
            location: nullable(c.find('.job-search-card__location').text()),
            publishedAt: nullable(c.find('time').attr('datetime')),
            postedTime: nullable(c.find('time').text()),
            listingBadge: nullable(c.find('.job-posting-benefits__text').text()),
        });
    });
    return jobs;
}

export function parseSearchTotal(html) {
    const $ = load(html);
    const raw = text($, '.results-context-header__job-count');
    return { total: raw ? Number(raw.replace(/\D/g, '')) : null, isLowerBound: raw?.includes('+') ?? false };
}

function codeValue($, id) {
    const node = $(`code[id="${id}"]`).first();
    const raw = clean((node.html() ?? '').replace(/^<!--\s*|\s*-->$/g, ''));
    if (!raw) return null;
    const decoded = load(`<p>${raw}</p>`)('p').text();
    try { return JSON.parse(decoded); } catch { return decoded; }
}

export function parseJobPage(html, id, enrich = false) {
    const $ = load(html);
    const ld = jsonLd($, 'JobPosting');
    const title = text($, '.top-card-layout__title, .topcard__title, h1.top-card-layout__title') || nullable(ld.title);
    if (!title) return null;
    const criteria = {};
    $('.description__job-criteria-item').each((_, el) => {
        criteria[clean($(el).find('h3').text()).toLowerCase()] = nullable($(el).find('.description__job-criteria-text, span').first().text());
    });
    const company = ld.hiringOrganization ?? {};
    const descHtml = $('.show-more-less-html__markup').first().html() || ld.description || null;
    const salary = text($, '.compensation__salary, .salary, .salary-main-rail__data-amount')?.replace(/^(base pay range|pay range)\s*/i, '') || null;
    const orgUrl = publicUrl(attr($, '.topcard__org-name-link', 'href') || company.sameAs, undefined, true);
    const rawApply = codeValue($, 'applyUrl') || attr($, 'a.apply-button, a[data-tracking-control-name*="apply-link-offsite"]', 'href');
    let applyUrl = publicUrl(rawApply);
    if (applyUrl) {
        const wrapped = new URL(applyUrl);
        if (wrapped.hostname.endsWith('linkedin.com') && wrapped.searchParams.has('url')) applyUrl = publicUrl(wrapped.searchParams.get('url'));
        if (applyUrl && new URL(applyUrl).hostname.endsWith('linkedin.com') && /^\/(?:signup|login|uas|authwall|checkpoint)(?:\/|$)/.test(new URL(applyUrl).pathname)) applyUrl = null;
    }
    const applicationsCount = text($, '.num-applicants__caption, .topcard__flavor--metadata .num-applicants__caption');
    const numericCompanyUrl = orgUrl ? /\/company\/(\d+)\/?$/.exec(new URL(orgUrl).pathname)?.[1] : null;
    const companyId = /(?:facetCurrentCompany(?:%3D|=|%253D)|currentCompany=)(\d+)/i.exec(html)?.[1]
        || /urn:li:(?:company|organization):(\d+)/.exec(html)?.[1] || numericCompanyUrl || null;
    const location = [ld.jobLocation].flat().find((v) => v?.address)?.address;
    const locationDetails = location ? {
        streetAddress: nullable(location.streetAddress), city: nullable(location.addressLocality),
        region: nullable(location.addressRegion), country: nullable(typeof location.addressCountry === 'object' ? location.addressCountry.name : location.addressCountry),
        postalCode: nullable(location.postalCode),
    } : null;
    const posted = text($, '.posted-time-ago__text');
    const closed = text($, '.closed-job__flavor, .closed-job__text');
    const workplaceText = text($, '.workplace-type, [data-workplace-type]');
    return {
        id, title, jobUrl: `https://www.linkedin.com/jobs/view/${id}`,
        companyName: text($, '.topcard__org-name-link') || nullable(company.name), companyUrl: orgUrl,
        companyId, companyLogo: publicUrl(imageUrl($, '.top-card-layout__entity-image, .artdeco-entity-image') || (typeof company.logo === 'object' ? company.logo.url : company.logo)),
        location: text($, '.topcard__flavor--bullet') || (locationDetails ? [locationDetails.city, locationDetails.country].filter(Boolean).join(', ') : null),
        contractType: criteria['employment type'] || nullable([ld.employmentType].flat().filter(Boolean).join(', ')),
        experienceLevel: criteria['seniority level'] ?? null, jobFunction: criteria['job function'] ?? null,
        sector: criteria.industries ?? null, applicationsCount, postedTime: posted,
        publishedAt: nullable(ld.datePosted), salary, ...parseSalary(salary, ld.baseSalary),
        benefits: text($, '.job-posting-benefits__text') || nullable(ld.jobBenefits),
        applyType: /apply-link-onsite|apply-button__onsite/.test(html) ? 'EASY_APPLY' : applyUrl || /apply-link-offsite|apply-button__offsite/.test(html) ? 'EXTERNAL' : null,
        applyUrl, description: descHtml ? htmlToText(descHtml) : null, descriptionHtml: descHtml?.trim() || null,
        posterFullName: text($, '.message-the-recruiter .base-main-card__title, .message-the-recruiter .base-main-card__title--link, .hiring-team__title'),
        posterProfileUrl: publicUrl(attr($, '.message-the-recruiter a[href*="/in/"], .hiring-team a[href*="/in/"]', 'href'), undefined, true),
        posterHeadline: enrich ? text($, '.message-the-recruiter .base-main-card__subtitle, .hiring-team__subtitle') : null,
        posterPhoto: enrich ? publicUrl(imageUrl($, '.message-the-recruiter img, .hiring-team img')) : null,
        workType: ld.jobLocationType === 'TELECOMMUTE' ? 'Remote' : workplaceText,
        locationDetails: enrich ? locationDetails : null,
        publishedTimestamp: enrich && /T\d\d:/.test(ld.datePosted ?? '') ? ld.datePosted : null,
        jobStatus: enrich && closed ? 'CLOSED' : null,
        isReposted: enrich && /\breposted\b/i.test(posted ?? '') ? true : null,
        isVerified: enrich && $('.job-details-jobs-unified-top-card__job-insight--verified, [data-test-id="verified-hiring"]').length ? true : null,
        salarySource: enrich ? text($, '.compensation__salary-source, .salary-main-rail__data-source') : null,
        detailsStatus: 'ok',
    };
}

export function parseCompanyPage(html) {
    const $ = load(html);
    const ld = jsonLd($, 'Organization');
    const name = text($, 'h1') || nullable(ld.name);
    const hasProfile = Object.keys(ld).length || $('dl, [data-test-id="about-us"]').length;
    if (!name || !hasProfile) return null;
    const fields = {};
    $('dt').each((_, el) => { fields[clean($(el).text()).toLowerCase()] = nullable($(el).next('dd').text()); });
    const employeeRaw = text($, 'a[data-tracking-control-name*="employees"]') || fields['company size'];
    const followers = /([\d,. ]+)\s+followers/i.exec($.text())?.[1];
    const foundingYear = /\b(\d{4})\b/.exec(fields.founded ?? ld.foundingDate ?? '')?.[1];
    let companyWebsite = ld.url;
    $('dt').each((_, el) => {
        if (clean($(el).text()).toLowerCase() === 'website') companyWebsite = $(el).next('dd').find('a').attr('href') || fields.website;
    });
    const website = publicUrl(companyWebsite);
    const wrapped = website ? new URL(website) : null;
    if (wrapped?.hostname.endsWith('linkedin.com') && wrapped.searchParams.has('url')) companyWebsite = wrapped.searchParams.get('url');
    else companyWebsite = website;
    const address = ld.address ?? ld.location?.address;
    return {
        companyId: /urn:li:(?:organization|company):(\d+)/.exec(html)?.[1]
            || /(?:currentCompany|facetCurrentCompany)(?:=|%3D)(?:%5B|\[|%22|")*(\d+)/i.exec(html)?.[1] || null,
        companyName: name,
        companyWebsite: publicUrl(companyWebsite),
        companyDescription: text($, '[data-test-id="about-us__description"], .core-section-container__content p') || nullable(ld.description),
        companyTagline: text($, '.top-card-layout__headline'),
        companyEmployeeCount: employeeRaw && !/\d\s*[-–]\s*\d/.test(employeeRaw) ? numeric(/\d[\d,. ]*/.exec(employeeRaw)?.[0]) : null,
        companyEmployeeRange: fields['company size'] ?? null,
        companyFollowerCount: numeric(followers),
        companyIndustries: fields.industry || fields.industries || null,
        companyHeadquarters: address ? {
            streetAddress: nullable(address.streetAddress), city: nullable(address.addressLocality), region: nullable(address.addressRegion),
            country: nullable(typeof address.addressCountry === 'object' ? address.addressCountry.name : address.addressCountry), postalCode: nullable(address.postalCode),
        } : fields.headquarters ? { text: fields.headquarters } : null,
        companyType: fields.type ?? null,
        companyFounded: foundingYear ? Number(foundingYear) : null,
        companySpecialties: fields.specialties || fields.specialities || null,
        companyProfileStatus: 'ok',
    };
}

export function makeRow(card, detail, profile, scrapingInfo) {
    const row = {
        companyId: null, companyWebsite: null, companyDescription: null, companyTagline: null,
        companyEmployeeCount: null, companyEmployeeRange: null, companyFollowerCount: null,
        companyIndustries: null, companyHeadquarters: null, companyType: null, companyFounded: null, companySpecialties: null,
        contractType: null, experienceLevel: null, jobFunction: null, sector: null,
        salary: null, ...parseSalary(null), applicationsCount: null, benefits: null,
        applyType: null, applyUrl: null, description: null, descriptionHtml: null,
        posterFullName: null, posterProfileUrl: null, posterHeadline: null, posterPhoto: null,
        workType: null, locationDetails: null, publishedTimestamp: null, jobStatus: null,
        isReposted: null, isVerified: null, salarySource: null,
        detailsStatus: 'failed', companyProfileStatus: 'skipped',
        ...card,
    };
    // Missing optional detail fields must not erase values found on the listing card.
    for (const extra of [detail, profile]) for (const [key, value] of Object.entries(extra ?? {})) if (value !== null && value !== undefined) row[key] = value;
    return { ...row, scrapingInfo, scrapedAt: new Date().toISOString() };
}
