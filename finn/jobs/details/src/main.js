import { Actor, log } from 'apify';
import { CheerioCrawler } from 'crawlee';
import { gotScraping } from 'got-scraping';
import { parseSearchPage, parseAdPage, buildSearchUrl, withPage, resolveLocation, extractLocationMap } from './parse.js';

await Actor.init();
const input = (await Actor.getInput()) ?? {};
const { keyword, location, maxJobs = 50, maxPages = 5, includeDetails = true, proxyConfiguration } = input;

let startUrls = (input.startUrls ?? []).map((s) => s.url).filter(Boolean);
if (!startUrls.length) {
    let map = {};
    if (location && !/^\d\.\d+/.test(location)) {
        try { map = extractLocationMap((await gotScraping({ url: 'https://www.finn.no/job/search' })).body); } catch (e) { log.warning(`Could not load location list: ${e.message}`); }
        if (!resolveLocation(location, map)) log.warning(`Unknown location "${location}" - ignoring it. Use a Finn code (e.g. 1.20001.20012) or a county/municipality name.`);
    }
    startUrls = [buildSearchUrl({ keyword: keyword ?? 'utvikler', location }, map)];
}

const proxy = proxyConfiguration?.useApifyProxy || proxyConfiguration?.proxyUrls?.length
    ? await Actor.createProxyConfiguration(proxyConfiguration)
    : undefined;

const seen = new Set();
let queued = 0;
const now = () => new Date().toISOString();

const crawler = new CheerioCrawler({
    proxyConfiguration: proxy,
    maxConcurrency: 5,
    maxRequestRetries: 3,
    requestHandlerTimeoutSecs: 60,
    additionalMimeTypes: ['text/html'],
    async requestHandler({ request, body, crawler: c }) {
        const html = body.toString();

        if (request.label === 'DETAIL') {
            const d = parseAdPage(html);
            const base = request.userData.job;
            await Actor.pushData({
                ...base,
                title: d.title || base.title,
                company: d.company || base.company,
                companyUrl: d.companyUrl,
                location: base.location || d.location,
                published: base.published || d.published,
                deadline: d.deadline || base.deadline,
                employmentType: d.employmentType,
                description: d.description,
                scrapedAt: now(),
            });
            return;
        }

        const { root, page = 1 } = request.userData;
        const { ads, lastPage, total } = parseSearchPage(html);
        if (page === 1) log.info(`${root}: ${total ?? '?'} results, ${lastPage ?? '?'} pages`);
        log.info(`Page ${page}: ${ads.length} ads`);

        let fresh = 0;
        for (const ad of ads) {
            if (queued >= maxJobs) break;
            if (seen.has(ad.id)) continue;
            seen.add(ad.id); queued++; fresh++;
            const job = { ...ad, searchUrl: root };
            if (includeDetails) {
                await c.addRequests([{ url: ad.url, label: 'DETAIL', uniqueKey: `d-${ad.id}`, userData: { job } }]);
            } else {
                await Actor.pushData({ ...job, scrapedAt: now() });
            }
        }

        const more = fresh > 0 && queued < maxJobs && page < maxPages && (lastPage == null || page < lastPage);
        if (more) {
            const next = withPage(root, page + 1);
            await c.addRequests([{ url: next, uniqueKey: `s-${next}`, userData: { page: page + 1, root } }]);
        }
    },
    failedRequestHandler({ request }) { log.error(`Failed: ${request.url}`); },
});

await crawler.run(startUrls.map((url) => ({ url, uniqueKey: `s-${url}`, userData: { page: 1, root: url } })));
log.info(`Done. ${queued} jobs.`);
await Actor.exit();
