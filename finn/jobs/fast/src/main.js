import { Actor, log } from 'apify';
import { HttpCrawler } from 'crawlee';
import { gotScraping } from 'got-scraping';
import { parseSearchPage, parseAdPage, buildSearchUrl, withPage, resolveLocation, extractLocationMap } from './parse.js';

await Actor.init();
const input = (await Actor.getInput()) ?? {};
const { keyword, keywords = [], location, maxJobs = 50, maxPages = 20, includeDetails = true, proxyConfiguration } = input;

// ---- build start URLs: explicit URLs + every keyword (single or list) ----
const startUrls = (input.startUrls ?? []).map((s) => s.url).filter(Boolean);
const kws = [...new Set([keyword, ...keywords].map((k) => (k ?? '').trim()).filter(Boolean))];
if (kws.length || !startUrls.length) {
    let map = {};
    if (location && !/^\d\.\d+/.test(location)) {
        try { map = extractLocationMap((await gotScraping({ url: 'https://www.finn.no/job/search' })).body); } catch (e) { log.warning(`Could not load location list: ${e.message}`); }
        if (!resolveLocation(location, map)) log.warning(`Unknown location "${location}" - ignoring it. Use a county/municipality name or a Finn code like 1.20001.20012.`);
    }
    for (const k of kws.length ? kws : ['utvikler']) startUrls.push(buildSearchUrl({ keyword: k, location }, map));
}
const roots = [...new Set(startUrls)];

const proxy = proxyConfiguration?.useApifyProxy || proxyConfiguration?.proxyUrls?.length ? await Actor.createProxyConfiguration(proxyConfiguration) : undefined;
const seen = new Set();
let queued = 0;
const now = () => new Date().toISOString();

const crawler = new HttpCrawler({
    proxyConfiguration: proxy,
    minConcurrency: 15,
    maxConcurrency: 40,
    maxRequestRetries: 4,
    requestHandlerTimeoutSecs: 60,
    useSessionPool: true,
    async requestHandler({ request, body }) {
        const html = body.toString();

        if (request.label === 'DETAIL') {
            const base = request.userData.job;
            const d = parseAdPage(html);
            await Actor.pushData(d ? {
                ...base,
                title: d.title || base.title,
                company: d.company || base.company,
                companyUrl: d.companyUrl,
                location: base.location || d.location,
                published: base.published || d.published,
                deadline: d.deadline || base.deadline,
                employmentType: d.employmentType,
                description: d.description,
                descriptionHtml: d.descriptionHtml,
                scrapedAt: now(),
            } : { ...base, scrapedAt: now() });
            return;
        }

        const { root, page } = request.userData;
        const { ads, lastPage, total, perPage } = parseSearchPage(html);
        if (!ads.length) throw new Error(`No ads parsed on ${request.url} (blocked or layout changed)`);

        // First page of a search: fan out all remaining pages at once.
        if (page === 1) {
            log.info(`${root}: ${total ?? '?'} results, ${lastPage ?? '?'} pages`);
            const need = Math.ceil(maxJobs / Math.max(perPage, 1)) + (roots.length > 1 ? 1 : 0);
            const last = Math.min(maxPages, lastPage ?? maxPages, need);
            const more = [];
            for (let p = 2; p <= last; p++) { const url = withPage(root, p); more.push({ url, uniqueKey: `s-${url}`, userData: { page: p, root } }); }
            if (more.length) await crawler.addRequests(more);
        }

        for (const [i, ad] of ads.entries()) {
            if (queued >= maxJobs) break;
            if (seen.has(ad.id)) continue;
            seen.add(ad.id); queued++;
            const job = { ...ad, rank: (page - 1) * perPage + i + 1, searchUrl: root };
            if (includeDetails) await crawler.addRequests([{ url: ad.url, label: 'DETAIL', uniqueKey: `d-${ad.id}`, userData: { job } }]);
            else await Actor.pushData({ ...job, scrapedAt: now() });
        }
    },
    failedRequestHandler({ request }, error) { log.error(`Failed: ${request.url} - ${error.message}`); },
});

await crawler.run(roots.map((url) => ({ url, uniqueKey: `s-${url}`, userData: { page: 1, root: url } })));
log.info(`Done. ${queued} jobs.`);
await Actor.exit();
