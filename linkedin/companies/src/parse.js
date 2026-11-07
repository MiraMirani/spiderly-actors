import { load } from 'cheerio';

export const clean = (value) => typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
const number = (value) => ['string', 'number'].includes(typeof value) && Number.isFinite(Number(value)) && value !== '' && value != null ? Number(value) : null;

/** Accept only company identities. Never fetch arbitrary user-supplied hosts or people pages. */
export function normalizeCompanyUrl(value) {
    if (typeof value !== 'string' || !value.trim()) throw new Error('Provide a company URL, /company/slug, slug or numeric company ID.');
    let raw = value.trim();
    if (/^[\p{L}\p{N}_-]+$/u.test(raw)) raw = `https://www.linkedin.com/company/${raw}`;
    else if (raw.startsWith('/company/')) raw = `https://www.linkedin.com${raw}`;
    else if (/^(?:[a-z]+\.)?linkedin\.com\//i.test(raw)) raw = `https://${raw}`;
    const u = new URL(raw);
    if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password || u.port || !(u.hostname === 'linkedin.com' || u.hostname.endsWith('.linkedin.com'))) throw new Error('Only LinkedIn company URLs are supported.');
    const match = /^\/company\/([^/]+)\/?$/.exec(u.pathname);
    if (!match) throw new Error('Use the company overview URL: https://www.linkedin.com/company/company-slug/');
    const slug = decodeURIComponent(match[1]).toLowerCase();
    if (!/^[\p{L}\p{N}_-]+$/u.test(slug)) throw new Error('Invalid company slug.');
    return `https://www.linkedin.com/company/${encodeURIComponent(slug)}/`;
}

export function externalUrl(value, base = 'https://www.linkedin.com') {
    if (typeof value !== 'string') return null;
    try {
        let u = new URL(value, base);
        if (u.hostname === 'linkedin.com' || u.hostname.endsWith('.linkedin.com')) {
            if (u.pathname === '/redir/redirect' && u.searchParams.has('url')) u = new URL(u.searchParams.get('url'));
            else return null;
        }
        return ['http:', 'https:'].includes(u.protocol) && !u.username && !u.password ? u.href : null;
    } catch { return null; }
}

export function employeeRange(value) {
    const nums = clean(value).replace(/,/g, '').match(/\d+/g)?.map(Number) ?? [];
    if (!nums.length) return null;
    return { start: nums[0], end: /\+/.test(value) ? null : nums[1] ?? nums[0] };
}

/** Public English follower labels; compact counts reflect LinkedIn's rounded display. */
export function parseFollowerCount(value) {
    const match = clean(value).match(/([\d][\d,.\s]*?)\s*([KMB])?\s+followers\b/i);
    if (!match) return null;
    const count = Number(match[1].replace(/[,\s]/g, ''));
    if (!Number.isFinite(count)) return null;
    return Math.round(count * ({ K: 1000, M: 1000000, B: 1000000000 }[match[2]?.toUpperCase()] ?? 1));
}

function organizationData($) {
    const nodes = [];
    const visit = (v) => {
        if (!v || typeof v !== 'object') return;
        if (Array.isArray(v)) { v.forEach(visit); return; }
        nodes.push(v);
        if (v['@graph']) visit(v['@graph']);
        if (v.mainEntity) visit(v.mainEntity);
    };
    $('script[type="application/ld+json"]').each((i, el) => { try { visit(JSON.parse($(el).text())); } catch { /* A malformed script must not discard other scripts. */ } });
    return nodes.find((v) => [v['@type']].flat().some((t) => ['Organization', 'Corporation', 'LocalBusiness'].includes(t))) ?? {};
}

/** Reads only the company's own overview, not related-company cards, posts or employee profiles. */
export function parseCompanyPage(html, requestedUrl) {
    const $ = load(String(html));
    const org = organizationData($);
    const name = clean(org.name) || clean($('h1.top-card-layout__title').first().text());
    if (!name || (!org.name && !$('[data-test-id="about-us"]').length)) return null;
    const facts = {};
    $('[data-test-id="about-us"] dt').each((i, el) => { facts[clean($(el).text()).toLowerCase()] = clean($(el).next('dd').text()); });
    // Some pages render the fact list alongside, rather than inside, the About section.
    $('dl dt').each((i, el) => { const key = clean($(el).text()).toLowerCase(); if (!(key in facts)) facts[key] = clean($(el).next('dd').text()); });
    let linkedinUrl = requestedUrl;
    for (const candidate of [org.url, $('link[rel="canonical"]').attr('href')]) {
        try { if (candidate) { linkedinUrl = normalizeCompanyUrl(candidate); break; } } catch { /* Keep validated request URL. */ }
    }
    const factNode = (id) => $(`[data-test-id="about-us__${id}"] dd`).first();
    const imageUrl = (v) => { try { const u = new URL(v); return ['https:', 'http:'].includes(u.protocol) ? u.href : null; } catch { return null; } };
    const logo = typeof org.logo === 'string' ? org.logo : org.logo?.contentUrl ?? org.logo?.url;
    const phone = clean(org.telephone) || clean(factNode('phone').text());
    const address = org.address && typeof org.address === 'object' && !Array.isArray(org.address) ? org.address : null;
    const headquarter = address ? {
        street: clean(address.streetAddress) || null, city: clean(address.addressLocality) || null,
        geographicArea: clean(address.addressRegion) || null, postalCode: clean(address.postalCode) || null,
        country: clean(typeof address.addressCountry === 'string' ? address.addressCountry : address.addressCountry?.name) || null,
    } : null;
    const locations = [];
    $('section.locations li').each((i, el) => {
        const lines = $(el).find('[id^="address-"] p').map((j, p) => clean($(p).text())).get().filter(Boolean);
        if (lines.length) locations.push({ address: lines.join(', '), addressLines: lines, headquarter: /primary/i.test($(el).find('.tag-sm').text()), mapUrl: imageUrl($(el).find('a[data-tracking-control-name="org-locations_url"]').attr('href')) });
    });
    const followersCount = parseFollowerCount($('.top-card-layout__first-subline').first().text())
        ?? parseFollowerCount($('meta[name="description"]').attr('content'))
        ?? parseFollowerCount($('meta[property="og:description"]').attr('content'));
    const ownUrn = $('[data-semaphore-content-type="COMPANY"]').first().attr('data-semaphore-content-urn')
        ?? $('.top-card-layout [data-entity-urn]').first().attr('data-entity-urn');
    const companyId = ownUrn?.match(/^urn:li:organization:(\d+)$/)?.[1] ?? null;
    const jobLink = $('.top-card-layout__cta').filter((i, el) => /see jobs/i.test($(el).text())).first().attr('href');
    let jobSearchUrl = null;
    try { const u = new URL(jobLink); if (u.hostname.endsWith('.linkedin.com') && u.pathname.startsWith('/jobs/')) { u.searchParams.delete('trk'); jobSearchUrl = u.href; } } catch { /* Not exposed. */ }
    const sameAs = [org.sameAs].flat().find((v) => externalUrl(v));
    const founded = facts.founded?.match(/\b\d{4}\b/)?.[0] ?? String(org.foundingDate ?? '').match(/^\d{4}/)?.[0];
    return {
        vanityName: decodeURIComponent(new URL(linkedinUrl).pathname.split('/')[2]), linkedinUrl, companyId, name,
        tagline: clean($('.top-card-layout__tagline').first().text())
            || clean($('.top-card-layout__second-subline').first().text()) || null,
        description: clean(org.description) || clean($('[data-test-id="about-us__description"]').first().text()) || null,
        websiteUrl: externalUrl(sameAs) || externalUrl(factNode('website').find('a').attr('href')),
        phone: phone ? { number: phone } : null,
        industry: facts.industry || null, industryId: null,
        employeeCount: number(typeof org.numberOfEmployees === 'object' ? org.numberOfEmployees?.value : org.numberOfEmployees),
        employeeCountRange: employeeRange(facts['company size']), companySize: facts['company size'] || null,
        followersCount,
        foundedYear: founded ? Number(founded) : null,
        specialities: (facts.specialties ?? facts.specialities ?? '').split(/,\s*(?:and\s+)?/).map(clean).filter(Boolean),
        headquarters: facts.headquarters || null, headquarter, locations,
        logoUrl: imageUrl(logo) || imageUrl($('.top-card-layout__entity-image').first().attr('data-delayed-url')),
        coverImageUrl: imageUrl($('.cover-img__image').first().attr('src') || $('.cover-img__image').first().attr('data-delayed-url')),
        organizationType: facts.type || null, pageType: 'COMPANY', jobSearchUrl,
    };
}

export function classifyResponse(statusCode, finalUrl, html) {
    if ([404, 410].includes(statusCode)) return { status: 'NOT_FOUND', reason: `HTTP ${statusCode}`, retryable: false };
    if ([401, 403, 429, 999].includes(statusCode)) return { status: 'BLOCKED', reason: `HTTP ${statusCode}: access restricted`, retryable: true };
    if (statusCode >= 500 || [408, 425].includes(statusCode)) return { status: 'ERROR', reason: `HTTP ${statusCode}`, retryable: true };
    if (statusCode !== 200) return { status: 'ERROR', reason: `HTTP ${statusCode}`, retryable: false };
    let path = '';
    try { path = new URL(finalUrl).pathname; } catch { /* Parse will reject the body. */ }
    if (/^\/(?:authwall|login|signup|checkpoint|uas\/login)(?:\/|$)/i.test(path) || /<title>[^<]*(?:sign in|security verification)/i.test(html)) return { status: 'BLOCKED', reason: 'LinkedIn returned a sign-in or verification page', retryable: true };
    return null;
}
