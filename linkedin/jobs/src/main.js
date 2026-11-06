import { Actor, log } from 'apify';
import { HttpCrawler } from 'crawlee';
import { gotScraping } from 'got-scraping';
import { parseSearchPage, parseDetailPage, parseCompanyPage, buildSearchUrl, optionsFromSearchUrl, titleMatches, DETAIL_ENDPOINT, PAGE_SIZE, MAX_START } from './parse.js';

await Actor.init();
const input = (await Actor.getInput()) ?? {};
const {
    keywords = [], keyword, locations = [], location, geoId, datePosted, companyName = [], companyId = [], easyApply = false,
    under10Applicants = false, jobType = [], experienceLevel = [], workType = [], sortBy = 'relevance', limit = 100, maxPages = 100,
    includeDetails = true, includeCompanyProfile = false, debugSaveHtml = 0, maxRequestsPerMinute = 240, titleInclude = [], titleExclude = [], skipJobId = [], urlParam = [], startUrls = [], proxyConfiguration,
} = input;

// ---- build the list of searches: every keyword x every location, plus any pasted LinkedIn search URLs ----
const kws = [...new Set([keyword, ...keywords].map((k) => (k ?? '').trim()).filter(Boolean))];
const locs = [...new Set([location, ...locations].map((l) => (l ?? '').trim()).filter(Boolean))];
const common = { geoId, datePosted: datePosted === 'any' ? '' : datePosted, companyId, easyApply, under10Applicants, jobType, experienceLevel, workType, sortBy, urlParam };
const searches = [];
for (const k of kws.length ? kws : ['']) for (const l of locs.length ? locs : ['']) if (k || l) searches.push({ ...common, keywords: k, location: l });
for (const s of startUrls) {
    const url = typeof s === 'string' ? s : s.url;
    if (!url) continue;
    try { searches.push({ ...common, ...optionsFromSearchUrl(url), urlParam: [...urlParam, ...optionsFromSearchUrl(url).urlParam] }); } catch { log.warning(`Ignoring invalid URL: ${url}`); }
}
if (!searches.length) { await Actor.fail('Provide at least one keyword, location or LinkedIn search URL.'); }

const proxy = proxyConfiguration?.useApifyProxy || proxyConfiguration?.proxyUrls?.length ? await Actor.createProxyConfiguration(proxyConfiguration) : undefined;
const wantCompanies = companyName.map((c) => c.toLowerCase().trim()).filter(Boolean);
const skip = new Set(skipJobId.map(String));
const hasClientFilters = titleInclude.length > 0 || titleExclude.length > 0 || wantCompanies.length > 0;
const seen = new Set();
let queued = 0;
const now = () => new Date().toISOString();

const passes = (job) => {
    if (skip.has(job.id)) return false;
    if (titleInclude.length && !titleMatches(job.title, titleInclude)) return false;
    if (titleExclude.length && titleMatches(job.title, titleExclude)) return false;
    if (wantCompanies.length && !wantCompanies.some((c) => job.company.toLowerCase().includes(c))) return false;
    return true;
};

const companyCache = new Map();
let debugSaved = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const RATE_LIMITED = new Set([401, 403, 429, 999]);

const crawler = new HttpCrawler({
    proxyConfiguration: proxy,
    minConcurrency: 3,
    maxConcurrency: 10,
    maxRequestsPerMinute,
    maxRequestRetries: 6,
    requestHandlerTimeoutSecs: 120,
    useSessionPool: true,
    persistCookiesPerSession: false,
    // Let 429 reach our handler so we can back off before the retry instead of retrying instantly.
    sessionPoolOptions: { blockedStatusCodes: [] },
    additionalMimeTypes: ['text/html', 'application/octet-stream', 'text/plain', 'application/json'],
    async requestHandler({ request, body, response, session }) {
        if (RATE_LIMITED.has(response.statusCode)) {
            session?.retire();
            await sleep(Math.min(10000, 1500 * 2 ** request.retryCount) + Math.random() * 1000);
            throw new Error(`LinkedIn rate limit (HTTP ${response.statusCode})`);
        }
        const html = body.toString();

        if (request.label === 'DETAIL') {
            const base = request.userData.job;
            const d = parseDetailPage(html);
            if (debugSaveHtml > debugSaved) { debugSaved++; await Actor.setValue(`debug-detail-${base.id}`, html, { contentType: 'text/html' }); }
            let company = {};
            if (d && includeCompanyProfile && d.companyUrl) {
                if (!companyCache.has(d.companyUrl)) {
                    try { const r = await gotScraping({ url: d.companyUrl, proxyUrl: proxy ? await proxy.newUrl() : undefined, timeout: { request: 20000 }, throwHttpErrors: false }); companyCache.set(d.companyUrl, r.statusCode === 200 ? parseCompanyPage(r.body) : {}); } catch { companyCache.set(d.companyUrl, {}); }
                }
                company = companyCache.get(d.companyUrl);
            }
            await Actor.pushData(d ? {
                ...base,
                title: d.title || base.title,
                company: d.company || base.company,
                companyUrl: d.companyUrl || base.companyUrl,
                companyId: d.companyId,
                location: d.location || base.location,
                postedAgo: d.postedAgo || base.postedAgo,
                applicants: d.applicants,
                seniorityLevel: d.seniorityLevel,
                employmentType: d.employmentType,
                jobFunction: d.jobFunction,
                industries: d.industries,
                salary: d.salary,
                applyType: d.applyType,
                applyUrl: d.applyUrl || base.url,
                contactEmails: d.contactEmails, contactPhones: d.contactPhones,
                salaryMin: d.salaryMin, salaryMax: d.salaryMax, salaryCurrency: d.salaryCurrency, salaryPeriod: d.salaryPeriod,
                posterFullName: d.posterFullName, posterTitle: d.posterTitle, posterProfileUrl: d.posterProfileUrl, posterPhoto: d.posterPhoto,
                ...company,
                description: d.description,
                descriptionHtml: d.descriptionHtml,
                scrapedAt: now(),
            } : { ...base, scrapedAt: now() });
            return;
        }

        const { search, start } = request.userData;
        const jobs = parseSearchPage(html);
        for (const [i, job] of jobs.entries()) {
            if (queued >= limit) break;
            if (seen.has(job.id) || !passes(job)) continue;
            seen.add(job.id); queued++;
            const row = { ...job, rank: start + i + 1, searchKeywords: search.keywords, searchLocation: search.location };
            if (includeDetails) await crawler.addRequests([{ url: `${DETAIL_ENDPOINT}${job.id}`, label: 'DETAIL', uniqueKey: `d-${job.id}`, userData: { job: row } }]);
            else await Actor.pushData({ ...row, scrapedAt: now() });
        }
        // Request the next page only while more jobs are still needed, so no pages are wasted.
        const nextStart = start + PAGE_SIZE;
        if (jobs.length && queued < limit && nextStart <= MAX_START && nextStart / PAGE_SIZE < maxPages) {
            const url = buildSearchUrl(search, nextStart);
            await crawler.addRequests([{ url, uniqueKey: `s-${url}`, userData: { search, start: nextStart } }]);
        }
    },
    async failedRequestHandler({ request }, error) {
        if (request.label === 'DETAIL') { await Actor.pushData({ ...request.userData.job, detailsFailed: true, scrapedAt: now() }); return; }
        log.error(`Failed: ${request.url} - ${error.message}. LinkedIn may be rate limiting this IP; enable Apify Proxy (residential works best).`);
    },
});

// Start with the first page of every search; further pages are chained as needed (see the search handler).
const requests = searches.map((search) => { const url = buildSearchUrl(search, 0); return { url, uniqueKey: `s-${url}`, userData: { search, start: 0 } }; });
log.info(`${searches.length} search(es), limit ${limit}`);
await crawler.run(requests);
log.info(`Done. ${queued} jobs.`);
await Actor.exit();
