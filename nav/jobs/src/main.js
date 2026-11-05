import { Actor, log } from 'apify';
import { gotScraping } from 'got-scraping';
import { mapHit, parseDetail } from './parse.js';

await Actor.init();
const input = (await Actor.getInput()) ?? {};
const {
    keyword, keywords = [], counties = [], municipalities = [], occupations = [], engagementTypes = [], extents = [],
    sector, remote, education = [], experience = [], workLanguages = [], needDriversLicense, publishedWithin,
    hasSuperraskSoknad, isSummerJob, isUnder18, sortBy = 'published', maxResults = 100, includeDetails = true, proxyConfiguration,
} = input;

const BASE = 'https://arbeidsplassen.nav.no';
const PAGE_SIZE = 100;
const DETAIL_CONCURRENCY = 6;
const limit = maxResults > 0 ? maxResults : Infinity;
const proxy = proxyConfiguration?.useApifyProxy || proxyConfiguration?.proxyUrls?.length ? await Actor.createProxyConfiguration(proxyConfiguration) : undefined;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const now = () => new Date().toISOString();

/** GET with polite retry/backoff on 429 and 5xx. */
async function get(url, { json = false } = {}) {
    for (let attempt = 1; attempt <= 8; attempt++) {
        try {
            const res = await gotScraping({
                url,
                proxyUrl: proxy ? await proxy.newUrl() : undefined,
                headers: json ? { accept: 'application/json' } : { accept: 'text/html' },
                throwHttpErrors: false,
                retry: { limit: 0 },
                timeout: { request: 30000 },
            });
            if (res.statusCode === 200) return json ? JSON.parse(res.body) : res.body;
            if (res.statusCode === 404 || res.statusCode === 410) return null;
            const retryAfter = Number(res.headers['retry-after']) || 0;
            const wait = Math.max(retryAfter * 1000, Math.min(2000 * 2 ** (attempt - 1), 30000));
            log.warning(`HTTP ${res.statusCode} (attempt ${attempt}) - waiting ${Math.round(wait / 1000)}s`);
            await sleep(wait);
        } catch (e) {
            log.warning(`Request error (attempt ${attempt}): ${e.message}`);
            await sleep(1500 * attempt);
        }
    }
    throw new Error(`Giving up on ${url}`);
}

function searchUrl(kw, from) {
    const p = new URLSearchParams();
    if (kw) p.set('q', kw);
    const add = (name, vals) => vals.filter(Boolean).forEach((v) => p.append(name, v));
    add('counties[]', counties);
    add('municipals[]', municipalities);
    add('occupationFirstLevels[]', occupations);
    add('engagementType[]', engagementTypes);
    add('extent[]', extents);
    add('education[]', education);
    add('experience[]', experience);
    add('workLanguage[]', workLanguages);
    if (sector) p.append('sector[]', sector);
    if (remote) p.append('remote[]', remote);
    if (needDriversLicense) p.append('needDriversLicense[]', needDriversLicense);
    if (publishedWithin) p.set('published', publishedWithin);
    if (hasSuperraskSoknad) p.set('hasSuperraskSoknad', 'true');
    if (isSummerJob) p.set('isSummerJob', 'summerJob');
    if (isUnder18) p.append('under18[]', 'true');
    if (sortBy && sortBy !== 'relevant') p.set('sort', sortBy);
    p.set('from', String(from));
    p.set('size', String(PAGE_SIZE));
    return `${BASE}/stillinger/api/search?${p}`;
}

const kws = [...new Set([keyword, ...keywords].map((k) => (k ?? '').trim()).filter(Boolean))];
const searches = kws.length ? kws : [''];
const seen = new Set();
let saved = 0;
const detailQueue = [];

async function enrich(job) {
    if (!includeDetails) return job;
    const html = await get(`${BASE}/stillinger/stilling/${job.id}`);
    const d = html ? parseDetail(html) : null;
    return d ? { ...job, ...d, shortSummary: d.shortSummary || job.shortSummary } : job;
}

// simple worker pool for detail pages
let active = 0;
const waiters = [];
async function acquire() { if (active < DETAIL_CONCURRENCY) { active++; return; } await new Promise((r) => waiters.push(r)); }
function release() { const w = waiters.shift(); if (w) w(); else active--; }
async function handleJob(job) {
    await acquire();
    try {
        const full = await enrich(job);
        await Actor.pushData({ ...full, scrapedAt: now() });
    } catch (e) {
        log.error(`Failed ad ${job.id}: ${e.message}`);
        await Actor.pushData({ ...job, scrapedAt: now() });
    } finally { release(); }
}

outer: for (const kw of searches) {
    let from = 0, total = null;
    log.info(`Searching "${kw || '(all jobs)'}"...`);
    while (saved < limit) {
        const data = await get(searchUrl(kw, from), { json: true });
        const hits = data?.hits?.hits ?? [];
        total = data?.hits?.total?.value ?? total;
        if (from === 0) log.info(`"${kw || '(all jobs)'}": ${total ?? '?'} matching jobs`);
        if (!hits.length) break;
        for (const [i, hit] of hits.entries()) {
            if (saved >= limit) break;
            const job = mapHit(hit);
            if (!job.id || seen.has(job.id)) continue;
            seen.add(job.id);
            saved++;
            detailQueue.push(handleJob({ ...job, searchKeyword: kw || null, rank: from + i + 1 }));
        }
        from += hits.length;
        if (from >= (total ?? 0)) break;
        if (from >= 10000) { log.warning('NAV search is limited to the first 10,000 results per search - narrow the filters.'); break; }
        await sleep(400);
    }
    if (saved >= limit) break outer;
}
await Promise.all(detailQueue);
log.info(`Done. Saved ${saved} jobs.`);
await Actor.exit();
