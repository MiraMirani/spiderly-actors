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
    const applyRaw = first(/<code[^>]*id="applyUrl"[^>]*>\s*<!--\s*"?([^"\s>]+)"?\s*-->/, h)
        ?? first(/href="(https?:\/\/[^"]*\/jobs\/view\/externalApply\/[^"]+)"/, h)
        ?? first(/data-apply-url="([^"]+)"/, h);
    const applicantsText = text(first(/<(?:span|figcaption)[^>]*num-applicants__caption[^>]*>([\s\S]*?)<\/(?:span|figcaption)>/, h)) || text(first(/<span[^>]*num-applicants__caption[^>]*>([\s\S]*?)<\/span>/, h));
    const salary = text(first(/<div[^>]*compensation__salary[^>]*>([\s\S]*?)<\/div>/, h) ?? first(/<span[^>]*salary[^>]*>([\s\S]*?)<\/span>/, h));
    const rec = parseRecruiter(h);
    const sal = parseSalary(salary);
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
        ...sal,
        ...rec,
        ...extractContacts(htmlToText(descHtml)),
        description: htmlToText(descHtml),
        descriptionHtml: clean(descHtml) ? descHtml.trim() : '',
    };
}

/** The "Direct message the job poster" block: recruiter / hiring contact name, headline and profile link. */
export function parseRecruiter(html) {
    const h = String(html);
    const i = h.search(/message-the-recruiter|hirer-card|job-poster/i);
    if (i < 0) return { posterFullName: '', posterTitle: '', posterProfileUrl: '', posterPhoto: '' };
    const block = h.slice(i, i + 6000);
    const link = first(/<a[^>]+class="[^"]*base-card__full-link[^"]*"[^>]+href="([^"]+)"/, block) ?? first(/<a[^>]+href="(https?:\/\/[^"]*linkedin\.com\/in\/[^"]+)"/, block);
    const name = text(first(/<h3[^>]*base-main-card__title[^>]*>([\s\S]*?)<\/h3>/, block)) || text(first(/aria-label="Message ([^"]+)"/, block));
    return {
        posterFullName: name,
        posterTitle: text(first(/<h4[^>]*base-main-card__subtitle[^>]*>([\s\S]*?)<\/h4>/, block)),
        posterProfileUrl: stripQuery(link),
        posterPhoto: decode(first(/data-delayed-url="([^"]*profile-displayphoto[^"]*)"/, block) ?? ''),
    };
}

/** "NOK 900,000.00/yr - NOK 1,100,000.00/yr" -> { salaryMin, salaryMax, salaryCurrency, salaryPeriod } */
export function parseSalary(s) {
    const empty = { salaryMin: null, salaryMax: null, salaryCurrency: '', salaryPeriod: '' };
    const str = String(s ?? '');
    const nums = [...str.matchAll(/(\d[\d,]*(?:\.\d+)?)/g)].map((m) => Number(m[1].replace(/,/g, '')));
    if (!nums.length) return empty;
    const cur = first(/([A-Z]{3}|[$€£])/, str) ?? '';
    const per = (first(/\/\s*(yr|year|mo|month|hr|hour|wk|week|day)/i, str) ?? '').toLowerCase();
    const period = { yr: 'YEAR', year: 'YEAR', mo: 'MONTH', month: 'MONTH', hr: 'HOUR', hour: 'HOUR', wk: 'WEEK', week: 'WEEK', day: 'DAY' }[per] ?? '';
    return { salaryMin: Math.min(...nums), salaryMax: Math.max(...nums), salaryCurrency: cur, salaryPeriod: period };
}

/** Best-effort company profile from a public company page (JSON-LD plus visible facts). */
export function parseCompanyPage(html) {
    const h = String(html);
    const out = { companyWebsite: '', companyDescription: '', companyIndustry: '', companySize: '', companyFollowers: null, companyHeadquarters: '', companyFounded: '', companyEmployeesOnLinkedIn: null };
    const ld = first(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/, h);
    if (ld) {
        try {
            const d = JSON.parse(ld);
            const o = (d['@graph'] ?? [d]).find((x) => /Organization|Corporation/i.test(x['@type'] ?? '')) ?? d;
            out.companyWebsite = o.sameAs ?? o.url ?? '';
            out.companyDescription = clean(o.description ?? '');
            out.companyFollowers = o.interactionStatistic?.userInteractionCount ?? null;
            out.companyEmployeesOnLinkedIn = o.numberOfEmployees?.value ?? null;
            const a = o.address;
            if (a) out.companyHeadquarters = [a.addressLocality, a.addressRegion, a.addressCountry].filter(Boolean).join(', ');
        } catch { /* ignore malformed JSON-LD */ }
    }
    const fact = (label) => text(first(new RegExp(`<dt[^>]*>\\s*${label}\\s*<\\/dt>\\s*<dd[^>]*>([\\s\\S]*?)<\\/dd>`, 'i'), h));
    out.companyIndustry = fact('Industry');
    out.companySize = fact('Company size');
    out.companyFounded = fact('Founded');
    if (!out.companyHeadquarters) out.companyHeadquarters = fact('Headquarters');
    if (!out.companyWebsite) out.companyWebsite = decode(first(/<dt[^>]*>\s*Website\s*<\/dt>\s*<dd[^>]*>\s*<a[^>]+href="([^"]+)"/i, h) ?? '');
    return out;
}

/** Emails and Norwegian-style phone numbers written in the ad text (often the real contact person). */
export function extractContacts(desc) {
    const s = String(desc ?? '');
    const emails = [...new Set((s.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? []).map((e) => e.toLowerCase()))];
    const phones = [...new Set((s.match(/(?:\+47[\s-]?)?(?<![\d.-])(?:\d{3} ?\d{2} ?\d{3}|\d{2} ?\d{2} ?\d{2} ?\d{2})(?![\d.-])/g) ?? []).map((x) => x.trim()))];
    return { contactEmails: emails, contactPhones: phones };
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
