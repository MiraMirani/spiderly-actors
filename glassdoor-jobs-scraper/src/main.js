import { hostedPlaywrightActor, hostedPlaywrightInput } from './hosted-playwright.js';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { Actor, log } from 'apify';
import { chromium } from 'playwright';
import { cardSelector, parseCards, sampleSearch, searchUrl } from './cards.js';
import { adaptFastRows, fastProviderActor, liveProvider, providerInput, providerRows, providerRunOptions } from './provider.js';

const summary = { jobs: 0, searches: [] };
let browser;
let activeProviderRun;
await Actor.init();
Actor.on('aborting', async () => {
    await browser?.close();
    if (activeProviderRun) await Actor.abort(activeProviderRun).catch(() => log.warning('Could not stop the upstream run.'));
    await Actor.setValue('SUMMARY', summary);
    await Actor.exit();
});

try {
    const input = await Actor.getInput() ?? {};
    const {
        searchUrls, maxItems = 20, maxPages = 1, savedHtml,
        proxyConfiguration = { useApifyProxy: true, apifyProxyGroups: ['RESIDENTIAL'], apifyProxyCountry: 'US' },
    } = input;
    if (!Number.isInteger(maxItems) || maxItems < 1 || maxItems > 100) {
        throw new Error('Set the result limit to a whole number between 1 and 100.');
    }
    if (savedHtml !== undefined && typeof savedHtml !== 'string') {
        throw new Error('Saved search HTML must be a string.');
    }
    const mode = input.mode ?? (savedHtml?.trim() ? 'saved_html' : input.keyword ? 'keyword' : 'direct');
    if (!['keyword', 'url', 'saved_html', 'direct', 'browserless', 'hosted_playwright'].includes(mode)) throw new Error('Choose a valid search mode.');
    const urlInputs = searchUrls ?? (['direct', 'browserless', 'hosted_playwright'].includes(mode) ? [sampleSearch] : []);
    let urls = [];
    if (mode !== 'keyword') {
        if (!Array.isArray(urlInputs) || urlInputs.length < 1 || urlInputs.length > 5) {
            throw new Error('Enter 1–5 Glassdoor search URLs.');
        }
        urls = [...new Set(urlInputs.map(searchUrl))];
    }
    summary.mode = mode;
    if (mode === 'saved_html') {
        if (!savedHtml?.trim()) throw new Error('Paste the saved search HTML.');
        if (!input.searchUrls || urls.length !== 1 || Buffer.byteLength(savedHtml) > 8 * 1024 * 1024) {
            throw new Error('Import one saved search of up to 8 MB and provide its original Glassdoor search URL.');
        }
        const [url] = urls;
        const rows = parseCards(savedHtml, url).slice(0, maxItems);
        summary.searches.push({
            url, pages: 1, jobs: rows.length, status: rows.length ? 'ok' : 'unavailable',
        });
        if (!rows.length) throw new Error('The saved HTML contains no usable Glassdoor job cards. Save the rendered search results page.');
        await Actor.pushData(rows);
        summary.jobs = rows.length;
        log.info('Imported saved Glassdoor jobs', { jobs: rows.length });
    } else if (mode === 'browserless') {
        if (!Number.isInteger(maxPages) || maxPages < 1 || maxPages > 5) {
            throw new Error('Set the search batch limit to a whole number between 1 and 5.');
        }
        const keyword = input.keyword ?? (urls.every((url) => url === sampleSearch) ? 'software engineer' : '');
        if (typeof keyword !== 'string' || !keyword.trim() || keyword.length > 200) {
            throw new Error('Enter the keyword used in the Glassdoor search URLs.');
        }
        const seen = new Set();
        const script = fileURLToPath(new URL('./browserless.py', import.meta.url));
        const proxy = Actor.isAtHome()
            ? await Actor.createProxyConfiguration({ groups: ['RESIDENTIAL'], countryCode: 'US' })
            : undefined;
        for (const url of urls) {
            if (summary.jobs >= maxItems) break;
            const { stdout } = await promisify(execFile)('python3', [
                script, url, keyword.trim(), String(maxPages),
            ], {
                timeout: 85000,
                maxBuffer: 2 * 1024 * 1024,
                env: { ...process.env, GLASSDOOR_PROXY_URL: await proxy?.newUrl(randomUUID().replaceAll('-', '')) ?? '' },
            });
            const result = JSON.parse(stdout);
            const rows = result.rows.filter((row) => {
                if (seen.has(row.jobId)) return false;
                seen.add(row.jobId);
                return true;
            }).slice(0, maxItems - summary.jobs);
            if (rows.length) await Actor.pushData(rows);
            summary.jobs += rows.length;
            summary.searches.push({
                url, pages: result.pages, jobs: rows.length,
                status: result.error ? (rows.length ? 'partial' : 'unavailable') : 'ok',
                ...(result.error && { reason: result.error }),
            });
        }
        if (!summary.jobs && summary.searches.some((search) => search.reason)) {
            throw new Error(summary.searches.find((search) => search.reason).reason);
        }
    } else if (mode === 'direct') {
        if (!Number.isInteger(maxPages) || maxPages < 1 || maxPages > 5) {
            throw new Error('Set the direct search batch limit to a whole number between 1 and 5.');
        }
        await collectLive(urls, maxItems, maxPages, proxyConfiguration, input.keyword);
    } else {
        const hosted = mode === 'hosted_playwright';
        const upstreamInput = hosted
            ? hostedPlaywrightInput(urls, input.keyword ?? 'software engineer', maxItems, maxPages)
            : providerInput(input, mode, urls, maxItems);
        if (!Actor.isAtHome()) throw new Error('Run keyword and URL searches on Apify. Saved HTML is supported locally.');
        const { providerBudgetUsd = 0.30 } = input;
        if (!Number.isFinite(providerBudgetUsd) || providerBudgetUsd < 0.01 || providerBudgetUsd > 1) {
            throw new Error('Set the upstream budget between $0.01 and $1.');
        }
        const options = providerRunOptions(upstreamInput, providerBudgetUsd, Actor.getEnv().timeoutAt);
        const source = hosted ? { actor: hostedPlaywrightActor, input: upstreamInput } : liveProvider(input, mode, upstreamInput);
        if (hosted) options.memory = 1024;
        summary.providerActor = source.actor;
        summary.requestedJobs = maxItems;
        summary.providerTimeoutSecs = options.timeout;
        summary.providerMemoryMbytes = options.memory;
        const started = await Actor.apifyClient.actor(source.actor).start(source.input, options);
        activeProviderRun = started.id;
        summary.providerRunId = started.id;
        await Actor.setValue('SUMMARY', summary);
        const run = await Actor.apifyClient.run(started.id).waitForFinish();
        activeProviderRun = undefined;
        summary.providerStatus = run.status;
        if (Number.isFinite(run.usageTotalUsd)) summary.providerCostUsd = run.usageTotalUsd;
        if (!run.defaultDatasetId) throw new Error('The upstream search did not produce a dataset.');
        const { items } = await Actor.apifyClient.dataset(run.defaultDatasetId).listItems({ limit: maxItems + 10 });
        const phrase = mode === 'keyword' && input.titleMatch === 'phrase' ? upstreamInput.keywords[0] : null;
        const normalized = source.actor === fastProviderActor ? adaptFastRows(items, upstreamInput) : items;
        const rows = providerRows(normalized, urls, phrase, maxItems);
        if (rows.length) await Actor.pushData(rows);
        summary.jobs = rows.length;
        summary.upstreamRows = items.length;
        if (run.status !== 'SUCCEEDED') throw new Error('Upstream search ended with status ' + run.status + '. See SUMMARY.');
        if (hosted && !rows.length && items.some((item) => item['#error'])) {
            throw new Error('Playwright could not collect listings. See the upstream run in SUMMARY.');
        }
        if (!rows.length) log.info('No usable jobs matched this search. See SUMMARY.');
    }
} catch (error) {
    summary.error = error.message;
} finally {
    await browser?.close();
    await Actor.setValue('SUMMARY', summary);
}
if (summary.error) await Actor.fail(summary.error);
else await Actor.exit();

async function collectLive(urls, maxItems, maxPages, proxyConfiguration, keyword) {
    const seen = new Set();
    // Glassdoor blocks datacenter IPs (HTTP 403), so browse through a residential proxy.
    const proxyUrl = proxyConfiguration?.useApifyProxy || proxyConfiguration?.proxyUrls?.length
        ? await (await Actor.createProxyConfiguration(proxyConfiguration)).newUrl(randomUUID().replaceAll('-', '')) : undefined;
    const proxy = proxyUrl ? (({ protocol, host, username, password }) => ({
        server: `${protocol}//${host}`, username: decodeURIComponent(username), password: decodeURIComponent(password),
    }))(new URL(proxyUrl)) : undefined;
    browser = await chromium.launch({
        proxy, channel: 'chrome', headless: true,
    });
    const context = await browser.newContext({ locale: 'en-US' });
    await context.route('**/*', (route) => ['image', 'font', 'media'].includes(route.request().resourceType())
        ? route.abort() : route.continue());
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
            const parsedUrl = new URL(url);
            const city = !parsedUrl.search && decodeURIComponent(parsedUrl.pathname).match(/\/Job\/(.+)-SRCH_([^/]*_IC(\d+)[^/]*)\.htm$/i);
            const searchKeyword = url === sampleSearch ? (keyword || 'software engineer') : keyword;
            let cursor = '';
            for (let pageIndex = 0; pageIndex < maxPages; pageIndex += 1) {
                let batch;
                if (city && searchKeyword) {
                    const result = await searchJson(page, url, city, searchKeyword, cursor, pageIndex + 1);
                    batch = result.rows;
                    cursor = result.cursor;
                } else {
                    const html = await cards.evaluateAll((elements) => elements
                        .filter((element) => element.getClientRects().length > 0)
                        .map((element) => element.outerHTML).join(''));
                    batch = parseCards(html, url);
                }
                const rows = batch.filter((job) => !seen.has(job.jobId))
                    .slice(0, maxItems - summary.jobs);
                if (rows.length) {
                    await Actor.pushData(rows);
                    for (const row of rows) seen.add(row.jobId);
                    search.jobs += rows.length;
                    summary.jobs += rows.length;
                }
                search.pages += 1;
                if (city && searchKeyword) {
                    if (!cursor || summary.jobs >= maxItems) break;
                    continue;
                }
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

async function searchJson(page, url, city, keyword, cursor, pageNumber) {
    const payload = {
        excludeJobListingIds: [], filterParams: [], includeIndeedJobAttributes: true,
        keyword, locationId: Number(city[3]), locationType: 'CITY', numJobsToShow: 30,
        originalPageUrl: url, pageCursor: cursor, pageNumber, pageType: 'SERP',
        parameterUrlInput: city[2], seoFriendlyUrlInput: city[1].toLowerCase(), seoUrl: true,
    };
    const search = await page.evaluate(async (input) => {
        const response = await fetch('/job-search-next/bff/jobSearchResultsQuery', {
            method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' },
            body: JSON.stringify(input), signal: AbortSignal.timeout(12000),
        });
        if (!response.ok) throw new Error('Glassdoor search returned HTTP ' + response.status);
        return (await response.json()).data?.jobListings;
    }, payload);
    if (!Array.isArray(search?.jobListings)) throw new Error('Glassdoor search response is missing listings.');
    const rows = [];
    for (const { jobview } of search.jobListings) {
        const { job, header = {} } = jobview ?? {};
        if (!job?.listingId || !job.jobTitleText) continue;
        rows.push({
            jobId: String(job.listingId), title: job.jobTitleText,
            company: header.employer?.name ?? header.employerNameFromSearch ?? null,
            companyRating: header.employer?.ratings?.overallRating ?? null,
            location: header.locationName ?? null, jobUrl: header.seoJobLink ?? null,
            easyApplyBadge: header.easyApply ?? null,
            salaryMin: header.payPeriodAdjustedPay?.p10 ?? null,
            salaryMax: header.payPeriodAdjustedPay?.p90 ?? null,
            salaryCurrency: header.payCurrency ?? null, salaryPeriod: header.payPeriod?.toLowerCase() ?? null,
            snippet: job.descriptionFragmentsText?.join(' ') ?? null, sourceUrl: url,
        });
    }
    return { rows, cursor: search.paginationCursors?.find((entry) => entry.pageNumber === pageNumber + 1)?.cursor };
}
