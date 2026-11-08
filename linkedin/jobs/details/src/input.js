export const SEARCH_ENDPOINT = 'https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search';
export const DETAIL_ENDPOINT = 'https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/';
export const MAX_RESULTS_PER_SEARCH = 1000;

const FILTERS = {
    workTypes: { onsite: '1', remote: '2', hybrid: '3' },
    contractTypes: { fulltime: 'F', parttime: 'P', contract: 'C', temporary: 'T', volunteer: 'V', internship: 'I', other: 'O' },
    experienceLevels: { internship: '1', entry: '2', entrylevel: '2', associate: '3', midsenior: '4', midseniorlevel: '4', director: '5', executive: '6' },
};
const compact = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');

function strings(value, field) {
    if (value === undefined) return [];
    if (!Array.isArray(value) || value.some((v) => typeof v !== 'string' || !v.trim())) {
        throw new Error(`${field} must be an array of non-empty strings.`);
    }
    return [...new Set(value.map((v) => v.trim()))];
}

function number(value, fallback, field, min, max) {
    const n = value ?? fallback;
    if (!Number.isInteger(n) || n < min || n > max) throw new Error(`${field} must be an integer from ${min} to ${max}.`);
    return n;
}

function boolean(value, fallback, field) {
    if (value !== undefined && typeof value !== 'boolean') throw new Error(`${field} must be true or false.`);
    return value ?? fallback;
}

function choices(value, field) {
    return [...new Set(strings(value, field).map((v) => {
        const mapped = FILTERS[field][compact(v)] ?? v.toUpperCase();
        if (!Object.values(FILTERS[field]).includes(mapped)) throw new Error(`Unsupported ${field} value: ${v}`);
        return mapped;
    }))];
}

export function linkedinUrl(value) {
    let u;
    try { u = new URL(value); } catch { throw new Error(`Invalid LinkedIn URL: ${value}`); }
    if (u.protocol !== 'https:' || !(u.hostname === 'linkedin.com' || u.hostname.endsWith('.linkedin.com')) || u.username || u.password || u.port) {
        throw new Error('Only HTTPS URLs on linkedin.com are supported.');
    }
    return u;
}

export function classifyUrl(value) {
    const u = linkedinUrl(value);
    const job = /^\/jobs\/view\/(?:[^/]*-)?(\d+)\/?$/.exec(u.pathname);
    if (job) return { kind: 'job', id: job[1], inputUrl: u.toString() };
    const company = /^\/company\/([a-z0-9_-]+)\/?$/i.exec(u.pathname);
    if (company) return { kind: 'company', slug: company[1], inputUrl: `https://www.linkedin.com/company/${company[1]}/` };
    if (/^\/jobs\/search\/?$/.test(u.pathname) || u.pathname === new URL(SEARCH_ENDPOINT).pathname) {
        const params = new URLSearchParams(u.search);
        for (const k of ['start', 'currentJobId', 'position', 'pageNum', 'refId', 'trackingId', 'trk']) params.delete(k);
        return { kind: 'search', params: params.toString(), inputUrl: u.toString(), title: params.get('keywords') ?? '', location: params.get('location') ?? '' };
    }
    throw new Error('Use a LinkedIn jobs/search, jobs/view, or company URL.');
}

export function searchPageUrl(search, start = 0, fullPage = false) {
    const u = new URL(fullPage ? 'https://www.linkedin.com/jobs/search/' : SEARCH_ENDPOINT);
    u.search = search.params;
    u.searchParams.set('start', String(start));
    return u.toString();
}

export function normalizeInput(raw = {}) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Input must be a JSON object.');
    const aliases = (plural, ...singulars) => {
        const list = strings(raw[plural], plural);
        for (const name of singulars) {
            if (raw[name] !== undefined) {
                if (typeof raw[name] !== 'string') throw new Error(`${name} must be a string.`);
                if (raw[name].trim()) list.push(raw[name].trim());
            }
        }
        return [...new Set(list)];
    };
    const titles = aliases('titles', 'title');
    const locations = aliases('locations', 'location');
    const publishedAt = raw.publishedAt ?? '';
    if (!['', 'r86400', 'r604800', 'r2592000'].includes(publishedAt)) throw new Error('Unsupported publishedAt value.');
    const companyId = strings(raw.companyId, 'companyId');
    if (companyId.some((v) => !/^\d+$/.test(v))) throw new Error('companyId must contain numeric LinkedIn company IDs.');
    const industry = strings(raw.industry, 'industry');
    if (industry.some((v) => !/^\d+$/.test(v))) throw new Error('industry must contain LinkedIn numeric industry codes.');
    const companyUrls = strings(raw.companyUrls, 'companyUrls');
    for (const url of companyUrls) if (classifyUrl(url).kind !== 'company') throw new Error('companyUrls must contain company page URLs.');
    const listAlias = (plural, singular) => raw[plural] ?? (raw[singular] === undefined ? undefined : [raw[singular]]);
    const filters = {
        publishedAt,
        workTypes: choices(listAlias('workTypes', 'workType'), 'workTypes'),
        contractTypes: choices(listAlias('contractTypes', 'contractType'), 'contractTypes'),
        experienceLevels: choices(listAlias('experienceLevels', 'experienceLevel'), 'experienceLevels'),
        industry, companyId,
        easyApply: boolean(raw.easyApply, false, 'easyApply'),
        under10Applicants: boolean(raw.under10Applicants, false, 'under10Applicants'),
    };
    if (raw.startUrls !== undefined && !Array.isArray(raw.startUrls)) throw new Error('startUrls must be an array.');
    const urls = (raw.startUrls ?? []).map((v) => {
        const value = typeof v === 'string' ? v : v?.url;
        if (typeof value !== 'string') throw new Error('Each startUrls entry must be a URL string or an object with a url.');
        return classifyUrl(value);
    });
    const sortBy = raw.sortBy ?? 'relevance';
    if (!['relevance', 'recent'].includes(sortBy)) throw new Error('sortBy must be relevance or recent.');
    return {
        titles, locations, filters, urls, companyUrls,
        companyName: strings(raw.companyName, 'companyName'),
        rows: number(raw.rows, 0, 'rows', 0, 1000),
        maxRowsPerUrl: number(raw.maxRowsPerUrl, 0, 'maxRowsPerUrl', 0, 1000),
        maxItems: number(raw.maxItems, 100, 'maxItems', 1, 100000),
        maxPages: number(raw.maxPages, 100, 'maxPages', 1, 100),
        requestDelayMillis: number(raw.requestDelayMillis, 1000, 'requestDelayMillis', 0, 60000),
        maxRetries: number(raw.maxRetries, 3, 'maxRetries', 0, 6),
        companyProfile: boolean(raw.companyProfile, true, 'companyProfile'),
        enrichCompany: boolean(raw.enrichCompany, false, 'enrichCompany'),
        sortBy,
        proxyConfiguration: raw.proxyConfiguration,
    };
}

export function buildSearches(input, resolvedCompanyIds = []) {
    let searches;
    if (input.urls.length) {
        searches = input.urls.map((u) => ({ ...u, cap: input.maxRowsPerUrl || MAX_RESULTS_PER_SEARCH, companyNames: [] }));
    } else {
        searches = [];
        for (const title of input.titles.length ? input.titles : ['']) {
            for (const location of input.locations.length ? input.locations : ['']) {
                const p = new URLSearchParams();
                if (title) p.set('keywords', title);
                if (location) p.set('location', location);
                const f = input.filters;
                for (const [name, value] of Object.entries({
                    f_TPR: f.publishedAt, f_C: [...new Set([...f.companyId, ...resolvedCompanyIds])].join(','),
                    f_WT: f.workTypes.join(','), f_JT: f.contractTypes.join(','),
                    f_E: f.experienceLevels.join(','), f_I: f.industry.join(','),
                    f_AL: f.easyApply ? 'true' : '', f_EA: f.under10Applicants ? 'true' : '',
                    sortBy: input.sortBy === 'recent' ? 'DD' : '',
                })) if (value) p.set(name, value);
                searches.push({ kind: 'search', params: p.toString(), title, location, inputUrl: '', cap: input.rows || MAX_RESULTS_PER_SEARCH, companyNames: input.companyName });
            }
        }
    }
    const seen = new Set();
    return searches.filter((s) => {
        const key = s.kind === 'search' ? `${s.kind}:${s.params}` : `${s.kind}:${s.inputUrl}`;
        if (seen.has(key)) return false;
        seen.add(key);
        s.id = String(seen.size);
        return true;
    });
}
