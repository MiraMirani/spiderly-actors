// Dependency-free parsers and URL builders for LinkedIn's public (logged-out) job pages.

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const decode = (s) => String(s ?? '').replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') { const n = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return Number.isFinite(n) ? String.fromCodePoint(n) : m; }
    return ENT[e.toLowerCase()] ?? m;
});
export const clean = (s) => decode(String(s ?? '').replace(/<!--[\s\S]*?-->/g, '')).replace(/\s+/g, ' ').trim();
const text = (html) => clean(String(html ?? '').replace(/<[^>]+>/g, ' '));
export const htmlToText = (html) => clean(String(html ?? '').replace(/<\s*(br|\/p|\/li|\/h\d|\/div|\/ul)\s*\/?>/gi, ' ').replace(/<[^>]+>/g, ''));
const first = (re, s) => (re.exec(s) ?? [])[1];
const stripQuery = (u) => decode(u ?? '').split('?')[0];

export const SEARCH_ENDPOINT = 'https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search';
export const DETAIL_ENDPOINT = 'https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/';
export const PAGE_SIZE = 10;
export const MAX_START = 990; // LinkedIn returns nothing beyond roughly 1,000 results per search

/** Parse one page of search results (a list of <li> job cards). */
export function parseSearchPage(html) {
    const jobs = [];
    for (const m of String(html).matchAll(/<li>\s*([\s\S]*?)(?=<li>|$)/g)) {
        const card = m[1];
        const id = first(/data-entity-urn="urn:li:jobPosting:(\d+)"/, card) ?? first(/\/jobs\/view\/[^"?]*?(\d{6,})/, card);
        if (!id) continue;
        const subtitle = /<h4[^>]*base-search-card__subtitle[^>]*>([\s\S]*?)<\/h4>/.exec(card)?.[1] ?? '';
        jobs.push({
            id,
            url: `https://www.linkedin.com/jobs/view/${id}`,
            title: text(first(/<h3[^>]*base-search-card__title[^>]*>([\s\S]*?)<\/h3>/, card)),
            company: text(subtitle),
            companyUrl: stripQuery(first(/<a[^>]+href="([^"]+)"/, subtitle)),
            location: text(first(/<span[^>]*job-search-card__location[^>]*>([\s\S]*?)<\/span>/, card)),
            postedDate: first(/<time[^>]*datetime="([^"]*)"/, card) ?? '',
            postedAgo: text(first(/<time[^>]*>([\s\S]*?)<\/time>/, card)),
            companyLogo: decode(first(/data-delayed-url="([^"]*(?:company-logo|logo)[^"]*)"/, card) ?? ''),
        });
    }
    return jobs;
}

/** Parse a job detail page (guest API). Returns null when it does not look like a job page. */
export function parseDetailPage(html) {
    const h = String(html);
    const title = text(first(/<h2[^>]*top-card-layout__title[^>]*>([\s\S]*?)<\/h2>/, h));
    if (!title) return null;
    const orgLink = /<a[^>]*topcard__org-name-link[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/.exec(h);
    const bullets = [...h.matchAll(/<span[^>]*topcard__flavor--bullet[^>]*>([\s\S]*?)<\/span>/g)].map((x) => text(x[1])).filter(Boolean);
    const criteria = {};
    for (const m of h.matchAll(/<li[^>]*description__job-criteria-item[^>]*>[\s\S]*?<h3[^>]*>([\s\S]*?)<\/h3>[\s\S]*?<span[^>]*>([\s\S]*?)<\/span>/g)) criteria[text(m[1]).toLowerCase()] = text(m[2]);
    const descHtml = first(/<div[^>]*show-more-less-html__markup[^>]*>([\s\S]*?)<\/div>/, h) ?? '';
    const applyRaw = first(/<code[^>]*id="applyUrl"[^>]*>\s*<!--\s*"?([^"\s>]+)"?\s*-->/, h);
    const applicantsText = text(first(/<(?:span|figcaption)[^>]*num-applicants__caption[^>]*>([\s\S]*?)<\/(?:span|figcaption)>/, h)) || text(first(/<span[^>]*num-applicants__caption[^>]*>([\s\S]*?)<\/span>/, h));
    const salary = text(first(/<div[^>]*compensation__salary[^>]*>([\s\S]*?)<\/div>/, h) ?? first(/<span[^>]*salary[^>]*>([\s\S]*?)<\/span>/, h));
    const applyType = /apply-link-onsite/.test(h) ? 'EASY_APPLY' : /apply-link-offsite|apply-button__offsite/.test(h) ? 'EXTERNAL' : '';
    return {
        title,
        company: clean(orgLink?.[2]?.replace(/<[^>]+>/g, ' ')),
        companyUrl: stripQuery(orgLink?.[1]),
        companyId: first(/facetCurrentCompany(?:%3D|=)(\d+)/, h) ?? '',
        location: bullets[0] ?? '',
        postedAgo: text(first(/<span[^>]*posted-time-ago__text[^>]*>([\s\S]*?)<\/span>/, h)),
        applicants: applicantsText,
        seniorityLevel: criteria['seniority level'] ?? '',
        employmentType: criteria['employment type'] ?? '',
        jobFunction: criteria['job function'] ?? '',
        industries: criteria.industries ?? '',
        salary: salary.replace(/^(base pay range|pay range)\s*/i, ''),
        applyType,
        applyUrl: applyRaw ? decode(applyRaw) : '',
        description: htmlToText(descHtml),
        descriptionHtml: clean(descHtml) ? descHtml.trim() : '',
    };
}

const ENUM_LISTS = {
    jobType: { fulltime: 'F', parttime: 'P', contract: 'C', temporary: 'T', internship: 'I', volunteer: 'V', other: 'O' },
    experienceLevel: { internship: '1', entry: '2', associate: '3', 'mid-senior': '4', director: '5', executive: '6' },
    workType: { onsite: '1', remote: '2', hybrid: '3' },
};
const mapList = (kind, list) => [...new Set((list ?? []).map((v) => ENUM_LISTS[kind][String(v).toLowerCase()] ?? String(v).toUpperCase()).filter(Boolean))].join(',');

/** Build the guest-API search URL for one keyword/location pair and one page. */
export function buildSearchUrl(o, start = 0) {
    const u = new URL(SEARCH_ENDPOINT);
    const set = (k, v) => { if (v !== undefined && v !== null && String(v) !== '') u.searchParams.set(k, String(v)); };
    set('keywords', o.keywords);
    set('location', o.location);
    set('geoId', o.geoId);
    set('f_TPR', o.datePosted);
    set('f_C', (o.companyId ?? []).join(','));
    if (o.easyApply) set('f_AL', 'true');
    if (o.under10Applicants) set('f_EA', 'true');
    set('f_JT', mapList('jobType', o.jobType));
    set('f_E', mapList('experienceLevel', o.experienceLevel));
    set('f_WT', mapList('workType', o.workType));
    if (o.sortBy === 'recent') set('sortBy', 'DD');
    for (const p of o.urlParam ?? []) { const [k, ...r] = String(p).replace(/^[?&]/, '').split('='); if (k) set(k.trim(), r.join('=').trim()); }
    set('start', start || '');
    return u.toString();
}

/** Turn a normal linkedin.com/jobs/search?... URL into search options (query parameters are preserved). */
export function optionsFromSearchUrl(url) {
    const u = new URL(url);
    const params = [...u.searchParams.entries()].filter(([k]) => !['start', 'currentJobId', 'position', 'pageNum', 'refId', 'trackingId', 'trk'].includes(k));
    const o = { keywords: u.searchParams.get('keywords') ?? '', location: u.searchParams.get('location') ?? '', urlParam: [] };
    for (const [k, v] of params) if (!['keywords', 'location'].includes(k)) o.urlParam.push(`${k}=${v}`);
    return o;
}

const words = (s) => String(s).toLowerCase().split(/\s+/).filter(Boolean);
/** True when the title contains all words of at least one phrase. */
export const titleMatches = (title, phrases) => { const t = String(title).toLowerCase(); return (phrases ?? []).some((p) => words(p).every((w) => t.includes(w))); };

export const cleanJobUrl = (id) => `https://www.linkedin.com/jobs/view/${id}`;
