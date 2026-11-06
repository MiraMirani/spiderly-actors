import { Actor, log } from 'apify';
import { gotScraping } from 'got-scraping';
import { normalizeCompanyUrl, parseCompanyPage, classifyResponse } from './parse.js';

await Actor.init();
const input = (await Actor.getInput()) ?? {};
const { companies = [], startUrls = [], maxConcurrency = 3, maxRequestsPerMinute = 60, maxRetries = 2, requestTimeoutSecs = 30, proxyConfiguration = { useApifyProxy: false } } = input;
const integer = (n, min, max, name) => { if (!Number.isInteger(n) || n < min || n > max) throw new Error(`${name} must be an integer between ${min} and ${max}.`); };
integer(maxConcurrency, 1, 10, 'maxConcurrency'); integer(maxRequestsPerMinute, 1, 300, 'maxRequestsPerMinute'); integer(maxRetries, 0, 5, 'maxRetries'); integer(requestTimeoutSecs, 5, 120, 'requestTimeoutSecs');
if (!Array.isArray(companies) || !Array.isArray(startUrls)) await Actor.fail('companies and startUrls must be lists.');
const entries = [...companies, ...startUrls.map((v) => typeof v === 'string' ? v : v?.url)];
if (!entries.length || entries.length > 5000) await Actor.fail('Provide 1–5,000 company URLs, slugs or numeric IDs.');
const unique = new Map();
try { for (const value of entries) { const url = normalizeCompanyUrl(value); if (!unique.has(url)) unique.set(url, value); } } catch (error) { await Actor.fail(error.message); }
const proxy = proxyConfiguration.useApifyProxy || proxyConfiguration.proxyUrls?.length ? await Actor.createProxyConfiguration(proxyConfiguration) : undefined;
const queue = await Actor.openRequestQueue();
await queue.addRequests([...unique].map(([url, value]) => ({ url, uniqueKey: url, userData: { input: value } })));
const state = await Actor.useState('PROGRESS', { found: 0, notFound: 0, blocked: 0, errors: 0 });
let stopping = false;
let nextRequestAt = 0;
const summary = async () => Actor.setValue('SUMMARY', { ...state, requested: entries.length, uniqueCompanies: unique.size, scrapedAt: new Date().toISOString() });
Actor.on('aborting', async () => { stopping = true; await summary(); await Actor.exit(); });
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchCompany(url) {
    let target = url;
    for (let redirects = 0; redirects <= 5; redirects++) {
        const slot = Math.max(Date.now(), nextRequestAt); nextRequestAt = slot + 60000 / maxRequestsPerMinute;
        await wait(Math.max(0, slot - Date.now()));
        if (stopping) throw new Error('Run stopping');
        const response = await gotScraping({
            url: target, proxyUrl: proxy ? await proxy.newUrl() : undefined,
            timeout: { request: requestTimeoutSecs * 1000 }, retry: { limit: 0 }, throwHttpErrors: false,
            followRedirect: false, headers: { 'accept-language': 'en-US,en;q=0.9' },
        });
        if ([301, 302, 303, 307, 308].includes(response.statusCode) && response.headers.location) {
            const next = new URL(response.headers.location, target);
            if (!['http:', 'https:'].includes(next.protocol) || next.username || next.password || next.port || !(next.hostname === 'linkedin.com' || next.hostname.endsWith('.linkedin.com'))) return { failure: { status: 'ERROR', reason: 'Company page redirected outside LinkedIn', retryable: false } };
            if (/^\/(?:authwall|login|signup|checkpoint|uas\/login)(?:\/|$)/i.test(next.pathname)) return { failure: { status: 'BLOCKED', reason: 'LinkedIn requires sign-in or verification', retryable: true } };
            try { target = normalizeCompanyUrl(next.href); } catch { return { failure: { status: 'ERROR', reason: 'Unexpected company redirect', retryable: false } }; }
            continue;
        }
        const failure = classifyResponse(response.statusCode, target, response.body);
        if (failure) return { failure, httpStatus: response.statusCode };
        const company = parseCompanyPage(response.body, target);
        return company ? { company, httpStatus: response.statusCode } : { failure: { status: 'ERROR', reason: 'Response did not contain a public company overview', retryable: false }, httpStatus: response.statusCode };
    }
    return { failure: { status: 'ERROR', reason: 'Too many company redirects', retryable: false } };
}

async function worker() {
    while (!stopping) {
        const request = await queue.fetchNextRequest();
        if (!request) return;
        let result;
        let attempts = 0;
        for (let retry = 0; retry <= maxRetries && !stopping; retry++) {
            attempts++;
            try { result = await fetchCompany(request.url); }
            catch { result = { failure: { status: 'ERROR', reason: 'Network or proxy request failed', retryable: true } }; }
            if (!result.failure?.retryable || retry === maxRetries) break;
            log.warning(`Company request restricted or unavailable; retry ${retry + 1}/${maxRetries}.`);
            await wait(Math.min(10000, 1000 * 2 ** retry));
        }
        if (stopping) { await queue.reclaimRequest(request); return; }
        const status = result.failure?.status ?? 'FOUND';
        await Actor.pushData({ input: request.userData.input, requestedUrl: request.url, status, reason: result.failure?.reason ?? null, ...result.company, httpStatus: result.httpStatus ?? null, attempts, scrapedAt: new Date().toISOString() });
        state[{ FOUND: 'found', NOT_FOUND: 'notFound', BLOCKED: 'blocked', ERROR: 'errors' }[status]]++;
        await queue.markRequestHandled(request);
        log.info(`Company processed: ${status}.`);
    }
}

log.info(`Collecting ${unique.size} unique public company pages.`);
await Promise.all(Array.from({ length: maxConcurrency }, worker));
await summary();
if (!state.found) await Actor.fail('No company profiles collected. Check dataset status/reason fields and proxy configuration.');
log.info(`Finished: ${state.found} found, ${state.notFound} not found, ${state.blocked} blocked, ${state.errors} errors.`);
await Actor.exit();
