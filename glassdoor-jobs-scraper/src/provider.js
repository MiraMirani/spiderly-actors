import { origin } from './cards.js';

export const providerActor = 'glasswing/glassdoor-jobs-scraper';
export const defaultKeyword = 'software engineer';
export const defaultLocation = 'New York, NY';

export const filterChoices = {
    datePosted: ['any', '1', '3', '7', '14', '30'],
    jobType: ['any', 'fulltime', 'parttime', 'contract', 'internship', 'temporary'],
    minRating: ['any', '1', '2', '3', '4'],
    seniorityLevel: ['any', 'internship', 'entrylevel', 'midseniorlevel', 'director', 'executive'],
    companySize: ['any', '1-200', '201-500', '501-1000', '1001-5000', '5001+'],
};
const booleanFilters = ['remoteOnly', 'easyApplyOnly'];
const text = (value) => typeof value === 'string' ? value.trim() || null : null;
const number = (value, max = Number.MAX_SAFE_INTEGER) => typeof value === 'number'
    && Number.isFinite(value) && value >= 0 && value <= max ? value : null;

export function providerInput(input, mode, urls, maxItems) {
    const base = { maxItems, includeDescription: false, includeEmployerStats: false };
    if (mode === 'url') return { ...base, keywords: [], startUrls: urls };

    const { keyword = defaultKeyword, location = defaultLocation, titleMatch = 'any', minSalary } = input;
    if (!text(keyword) || keyword.length > 200 || typeof location !== 'string' || location.length > 150) {
        throw new Error('Enter a keyword of up to 200 characters and a location of up to 150 characters.');
    }
    if (!['any', 'phrase'].includes(titleMatch)) throw new Error('Choose a valid title match option.');
    if (minSalary !== undefined && (!Number.isSafeInteger(minSalary) || minSalary < 0)) {
        throw new Error('Minimum yearly salary must be a nonnegative whole number.');
    }
    const filters = {};
    for (const [key, options] of Object.entries(filterChoices)) {
        if (input[key] === undefined) continue;
        if (!options.includes(input[key])) throw new Error('Invalid filter value for ' + key);
        filters[key] = input[key];
    }
    for (const key of booleanFilters) {
        if (input[key] === undefined) continue;
        if (typeof input[key] !== 'boolean') throw new Error(key + ' must be true or false.');
        filters[key] = input[key];
    }
    return { ...base, ...filters, keywords: [keyword.trim()], location: location.trim(), minSalary };
}

export function providerRows(items, urls, phrase, maxItems) {
    const rows = new Map();
    const match = phrase?.toLowerCase();
    for (const item of items) {
        if (item?.status !== 'ok') continue;
        const sourceUrl = urls.length ? urls.find((url) => url === item.searchUrl) : null;
        if (urls.length && !sourceUrl) continue;
        const jobId = text(item.jobId);
        const title = text(item.title);
        const jobUrl = URL.parse(text(item.url) ?? '');
        if (!jobId || !/^\d+$/.test(jobId) || !title || jobUrl?.origin !== origin
            || jobUrl.username || jobUrl.password || !jobUrl.pathname.startsWith('/job-listing/')
            || rows.has(jobId) || (match && !title.toLowerCase().includes(match))) continue;
        jobUrl.search = '';
        jobUrl.searchParams.set('jl', jobId);
        jobUrl.hash = '';
        const companyRating = number(item.companyRating, 5);
        rows.set(jobId, {
            jobId, title, jobUrl: jobUrl.href, sourceUrl,
            company: text(item.company),
            companyRating: companyRating > 0 ? companyRating : null,
            location: text(item.location),
            easyApplyBadge: item.easyApply === true,
            salaryRaw: null,
            salaryMin: number(item.salaryMin),
            salaryMax: number(item.salaryMax),
            salaryCurrency: text(item.salaryCurrency),
            salaryPeriod: text(item.salaryPeriod),
            salarySource: item.salaryIsEstimate === true ? 'glassdoor_estimate'
                : item.salaryIsEstimate === false && (item.salaryMin != null || item.salaryMax != null) ? 'employer' : null,
            snippet: text(item.snippet),
        });
        if (rows.size >= maxItems) break;
    }
    return [...rows.values()];
}
