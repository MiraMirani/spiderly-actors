import { Actor, log } from 'apify';
import { chromium } from 'playwright';
import { cardSelector, origin, parseCards, sampleSearch, searchUrl } from './cards.js';

const summary = { jobs: 0, searches: [] };
let browser;
await Actor.init();
Actor.on('aborting', async () => {
    await browser?.close();
    await Actor.setValue('SUMMARY', summary);
    await Actor.exit();
});

try {
    const input = await Actor.getInput() ?? {};
    const {
        searchUrls = [sampleSearch], maxItems = 20, maxPages = 1, savedHtml,
        proxyConfiguration = { useApifyProxy: true, apifyProxyGroups: ['RESIDENTIAL'] },
    } = input;
    if (!Array.isArray(searchUrls) || searchUrls.length < 1 || searchUrls.length > 5
        || !Number.isInteger(maxItems) || maxItems < 1 || maxItems > 100
        || !Number.isInteger(maxPages) || maxPages < 1 || maxPages > 5) {
        throw new Error('Use 1–5 search URLs, a result limit of 1–100, and a page limit of 1–5.');
    }
    const urls = [...new Set(searchUrls.map(searchUrl))];
    if (savedHtml !== undefined && typeof savedHtml !== 'string') {
        throw new Error('Saved search HTML must be a string.');
    }
    if (savedHtml?.trim()) {
        if (!input.searchUrls || urls.length !== 1 || Buffer.byteLength(savedHtml) > 8 * 1024 * 1024) {
            throw new Error('Import one saved search of up to 8 MB and provide its original Glassdoor search URL.');
        }
        const [url] = urls;
        const rows = parseCards(savedHtml, url).slice(0, maxItems);
        summary.mode = 'saved_html';
        summary.searches.push({
            url, pages: 1, jobs: rows.length, status: rows.length ? 'ok' : 'unavailable',
        });
        if (!rows.length) throw new Error('The saved HTML contains no usable Glassdoor job cards. Save the rendered search results page.');
        await Actor.pushData(rows);
        summary.jobs = rows.length;
        log.info('Imported saved Glassdoor jobs', { jobs: rows.length });
    } else {
        summary.mode = 'live';
        await collectLive(urls, maxItems, maxPages, proxyConfiguration);
    }
} catch (error) {
    summary.error = error.message;
} finally {
    await browser?.close();
    await Actor.setValue('SUMMARY', summary);
}
if (summary.error) await Actor.fail(summary.error);
else await Actor.exit();

async function collectLive(urls, maxItems, maxPages, proxyConfiguration) {
    const seen = new Set();
    // Glassdoor blocks datacenter IPs (HTTP 403), so browse through a residential proxy.
    const proxyUrl = proxyConfiguration?.useApifyProxy || proxyConfiguration?.proxyUrls?.length
        ? await (await Actor.createProxyConfiguration(proxyConfiguration)).newUrl() : undefined;
    const proxy = proxyUrl ? (({ protocol, host, username, password }) => ({
        server: `${protocol}//${host}`, username: decodeURIComponent(username), password: decodeURIComponent(password),
    }))(new URL(proxyUrl)) : undefined;
    browser = await chromium.launch({ proxy });
    const context = await browser.newContext({ serviceWorkers: 'block', locale: 'en-US' });
    await context.route('**/*', (route) => {
        const request = route.request();
        return new URL(request.url()).origin === origin
            && !['image', 'font', 'media'].includes(request.resourceType())
            ? route.continue() : route.abort();
    });
    await context.routeWebSocket('**/*', (socket) => socket.close());
    const page = await context.newPage();
    for (const url of urls) {
        if (summary.jobs >= maxItems) break;
        const search = { url, pages: 0, jobs: 0, status: 'ok' };
        summary.searches.push(search);
        try {
            const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25000 });
            const httpStatus = response?.status();
            if (httpStatus >= 400) throw new Error('Glassdoor returned HTTP ' + httpStatus);
            if (/security|access denied|just a moment/i.test(await page.title())) {
                throw new Error('Glassdoor presented an access challenge.');
            }
            const cards = page.locator(cardSelector);
            await cards.first().waitFor({ timeout: 12000 });
            for (let pageIndex = 0; pageIndex < maxPages; pageIndex += 1) {
                const html = await cards.evaluateAll((elements) => elements
                    .filter((element) => element.getClientRects().length > 0)
                    .map((element) => element.outerHTML).join(''));
                const rows = parseCards(html, url).filter((job) => !seen.has(job.jobId))
                    .slice(0, maxItems - summary.jobs);
                if (rows.length) {
                    await Actor.pushData(rows);
                    for (const row of rows) seen.add(row.jobId);
                    search.jobs += rows.length;
                    summary.jobs += rows.length;
                }
                search.pages += 1;
                const more = page.getByRole('button', { name: 'Show more jobs' });
                if (summary.jobs >= maxItems || pageIndex + 1 >= maxPages || !await more.isVisible()) break;
                const previousCount = await cards.count();
                await more.click({ timeout: 5000 });
                await cards.nth(previousCount).waitFor({ timeout: 10000 });
            }
        } catch (error) {
            search.status = search.jobs ? 'partial' : 'unavailable';
            search.reason = error.message.split('\n')[0];
            log.warning(search.reason);
        }
    }
    if (!summary.jobs) throw new Error('No public Glassdoor job cards were collected. See SUMMARY for the search status.');
    log.info('Collected Glassdoor jobs', { jobs: summary.jobs });
}
