import { load } from 'cheerio';
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
const flag = (value) => typeof value === 'boolean' ? value : null;
const strings = (value) => Array.isArray(value) ? value.map(text).filter(Boolean) : [];

export function providerRunOptions(input, budget, parentDeadline, now = Date.now()) {
    // Leave time to read and save the upstream dataset before the parent expires.
    const remainingSeconds = parentDeadline ? Math.floor((parentDeadline.getTime() - now) / 1000) - 20 : 240;
    if (remainingSeconds < 15) throw new Error('Increase the Actor timeout to allow time for the upstream search.');
    const rich = input.includeDescription || input.includeEmployerStats;
    return {
        memory: rich ? 1024 : 512,
        timeout: Math.min(remainingSeconds, rich ? 240 : 120),
        maxTotalChargeUsd: budget,
    };
}
const glassdoorUrl = (value, host, prefix) => {
    const url = URL.parse(text(value) ?? '');
    return url?.origin === host && !url.username && !url.password && url.pathname.startsWith(prefix)
        ? url.href : null;
};

function employerProfile(item) {
    const website = URL.parse(text(item.companyWebsite) ?? '');
    const profile = {
        id: number(item.companyId),
        url: glassdoorUrl(item.companyGlassdoorUrl, origin, '/Overview/'),
        logoUrl: glassdoorUrl(item.companyLogo, 'https://media.glassdoor.com', '/sql/'),
        size: text(item.companySize),
        industry: text(item.companyIndustry),
        sector: text(item.companySector),
        headquarters: text(item.companyHeadquarters),
        foundedYear: number(item.companyFounded, new Date().getUTCFullYear()),
        website: website?.protocol === 'https:' && !website.username && !website.password ? website.href : null,
        revenue: text(item.companyRevenue),
        ownershipType: text(item.companyType),
        reviewCount: number(item.companyReviewCount),
        ratingCount: number(item.companyRatingCount),
        ceoApprovalPercent: number(item.companyCeoApprovalPct, 100),
        recommendPercent: number(item.companyRecommendPct, 100),
        businessOutlookPercent: number(item.companyBusinessOutlookPct, 100),
        careerOpportunitiesRating: number(item.companyCareerOpportunitiesRating, 5),
        compensationRating: number(item.companyCompensationRating, 5),
        cultureRating: number(item.companyCultureRating, 5),
        diversityRating: number(item.companyDiversityRating, 5),
        seniorManagementRating: number(item.companySeniorManagementRating, 5),
        workLifeBalanceRating: number(item.companyWorkLifeBalanceRating, 5),
        statsDate: text(item.companyStatsDate),
    };
    return Object.values(profile).some((value) => value !== null) ? profile : null;
}

export function providerInput(input, mode, urls, maxItems) {
    const { includeDescription = false, includeEmployerStats = false } = input;
    if (typeof includeDescription !== 'boolean' || typeof includeEmployerStats !== 'boolean') {
        throw new Error('Description and employer profile options must be true or false.');
    }
    const base = { maxItems, includeDescription, includeDescriptionHtml: includeDescription, includeEmployerStats };
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
            locationId: number(item.locationId),
            locationType: text(item.locationType),
            easyApplyBadge: item.easyApply === true,
            sponsored: flag(item.sponsored),
            salaryRaw: null,
            salaryMin: number(item.salaryMin),
            salaryMedian: number(item.salaryMedian),
            salaryMax: number(item.salaryMax),
            salaryCurrency: text(item.salaryCurrency),
            salaryPeriod: text(item.salaryPeriod),
            salaryIsEstimate: flag(item.salaryIsEstimate),
            salarySource: item.salaryIsEstimate === true ? 'glassdoor_estimate'
                : item.salaryIsEstimate === false && (item.salaryMin != null || item.salaryMax != null) ? 'employer' : null,
            snippet: text(item.snippet),
            description: text(item.description),
            descriptionHtml: descriptionHtml(item.descriptionHtml),
            descriptionError: text(item.descriptionError),
            postedDaysAgo: number(item.postedDaysAgo),
            jobTypes: strings(item.jobTypes),
            skills: strings(item.skills),
            tags: strings(item.tags),
            remote: flag(item.remote),
            workplaceType: text(item.workplaceType),
            occupation: text(item.occupation),
            companyProfile: employerProfile(item),
            companyStatsError: text(item.companyStatsError),
            scrapedAt: text(item.scrapedAt),
        });
        if (rows.size >= maxItems) break;
    }
    return [...rows.values()];
}

const descriptionTags = new Set(['p', 'div', 'span', 'br', 'ul', 'ol', 'li', 'strong', 'b', 'em', 'i',
    'u', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'hr']);

function descriptionHtml(value) {
    if (!text(value)) return null;
    const $ = load(value, {}, false);
    $('script, style, iframe, object, embed, template, svg, math').remove();
    $('*').each((_, element) => {
        if (!descriptionTags.has(element.name)) {
            $(element).replaceWith($(element).contents());
            return;
        }
        for (const name of Object.keys(element.attribs)) $(element).removeAttr(name);
    });
    return $.root().text().trim() ? $.html() : null;
}
