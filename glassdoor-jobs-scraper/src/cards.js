import { load } from 'cheerio';

export const origin = 'https://www.glassdoor.com';
export const cardSelector = 'li[data-test="jobListing"][data-jobid]';
export const sampleSearch = origin + '/Job/Software-Engineer-New-York-SRCH_KO0%2C17_IL.18%2C26_IC1132348.htm';

export function searchUrl(value) {
    const url = new URL(typeof value === 'string' ? value : value?.url);
    if (url.origin !== origin || url.username || url.password
        || !/^\/Job\/(?:jobs|[^/]+-SRCH_[^/]+)\.htm$/i.test(url.pathname)) {
        throw new Error('Use a public www.glassdoor.com job search URL.');
    }
    url.hash = '';
    return url.href;
}

function parseSalary(salaryRaw) {
    const amounts = [...(salaryRaw ?? '').matchAll(/(?:US)?\$\s*([\d,]+(?:\.\d+)?)\s*([kKmM])?/g)]
        .map(([, value, scale]) => Number(value.replaceAll(',', '')) * ({ k: 1e3, m: 1e6 }[scale?.toLowerCase()] ?? 1));
    const period = (salaryRaw ?? '').match(/(?:per\s+|\/\s*)(hour|hr|year|yr|month|mo|week|wk)\b/i)?.[1].toLowerCase();
    return {
        salaryRaw,
        salaryMin: amounts[0] ?? null,
        salaryMax: amounts[1] ?? amounts[0] ?? null,
        salaryCurrency: amounts.length ? 'USD' : null,
        salaryPeriod: ({ hr: 'hour', yr: 'year', mo: 'month', wk: 'week' })[period] ?? period ?? null,
        salarySource: /employer provided/i.test(salaryRaw ?? '') ? 'employer'
            : /glassdoor est/i.test(salaryRaw ?? '') ? 'glassdoor_estimate' : null,
    };
}

export function parseCards(html, sourceUrl) {
    const $ = load(html);
    const rows = new Map();
    $(cardSelector).each((_, element) => {
        const card = $(element);
        const jobId = card.attr('data-jobid');
        const titleLink = card.find('a[data-test="job-title"]').first();
        const title = titleLink.text().trim();
        const href = titleLink.attr('href');
        if (!/^\d+$/.test(jobId) || !title || !href || rows.has(jobId)) return;

        const url = URL.parse(href, origin);
        if (url?.origin !== origin || !url.pathname.startsWith('/job-listing/')) return;
        url.search = '';
        url.searchParams.set('jl', jobId);
        url.hash = '';
        const rating = Number(card.find('[role="meter"]').first().attr('aria-valuenow'));
        const read = (selector) => card.find(selector).first().text().replace(/\s+/g, ' ').trim() || null;
        rows.set(jobId, {
            jobId,
            title,
            company: read('[class*="EmployerProfile_compactEmployerName"]'),
            companyRating: rating >= 1 && rating <= 5 ? rating : null,
            location: read('[data-test="emp-location"]'),
            jobUrl: url.href,
            easyApplyBadge: card.find('[aria-label="Easy Apply"]').length > 0,
            ...parseSalary(read('[data-test="detailSalary"]')),
            snippet: read('[data-test="descSnippet"] > div:first-child'),
            sourceUrl,
        });
    });
    return [...rows.values()];
}
