import { Actor, log } from 'apify';
import { gotScraping } from 'got-scraping';
import { buildQuery, mapListing, mapDetail, parseStartUrl, parseApiDate } from './parse.js';

await Actor.init();
const input = (await Actor.getInput()) ?? {};
const {
    searchQueries = [], counties = [], municipalities = [], employerIds = [], categories = [],
    period = 'All', daysOld = 0, language = 1, sortBy = 'Published', maxResults = 100,
    includeDetails = false, startUrls = [], proxyConfiguration,
} = input;

const SEARCH_API = 'https://publicapi.jobbnorge.no/v3/jobs';
const AD_API = 'https://id.jobbnorge.no/api/joblisting';
const DETAIL_CONCURRENCY = 5;
const limit = maxResults > 0 ? maxResults : Infinity;
const proxy = proxyConfiguration?.useApifyProxy || proxyConfiguration?.proxyUrls?.length ? await Actor.createProxyConfiguration(proxyConfiguration) : undefined;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const cutoff = daysOld > 0 ? new Date(Date.now() - daysOld * 86400000).toISOString().slice(0, 10) : null;

/** GET JSON with retry/backoff on 429/5xx. Returns null on 404. */
async function getJson(url) {
    for (let attempt = 1; attempt <= 6; attempt++) {
        try {
            const res = await gotScraping({
                url,
                proxyUrl: proxy ? await proxy.newUrl() : undefined,
                headers: { accept: 'application/json' },
                throwHttpErrors: false,
                retry: { limit: 0 },
                timeout: { request: 30000 },
            });
            if (res.statusCode === 404) return null;
            if (res.statusCode === 429 || res.statusCode >= 500) {
                const wait = Math.min(30000, 1000 * 2 ** attempt);
                log.warning(`HTTP ${res.statusCode} for ${url.split('?')[0]}, retry in ${wait}ms`);
                await sleep(wait);
                continue;
            }
            if (res.statusCode !== 200) throw new Error(`HTTP ${res.statusCode}`);
            return JSON.parse(res.body);
        } catch (e) {
            if (attempt === 6) throw e;
            await sleep(1000 * attempt);
        }
    }
    return null;
}

async function fetchDetail(jobId) {
    const tryLangs = [language, language === 1 ? 2 : 1];
    let listing = null;
    let used = null;
    for (const l of tryLangs) {
        const r = await getJson(`${AD_API}?jobId=${jobId}&languageId=${l}`);
        if (r && (r.components?.length || r.activeLanguages?.length)) {
            listing = r; used = l;
            if (r.activeLanguages?.length && !r.activeLanguages.includes(l)) {
                const alt = await getJson(`${AD_API}?jobId=${jobId}&languageId=${r.activeLanguages[0]}`);
                if (alt?.components?.length) { listing = alt; used = r.activeLanguages[0]; }
            }
            if (listing.components?.length) break;
        }
    }
    const info = await getJson(`${AD_API}/job-info?jobId=${jobId}&languageId=${used ?? language}`);
    return { ...mapDetail(listing, info, jobId), adLanguage: used, _title: listing?.components?.[0]?.heading, _employer: info?.employerName };
}

const seen = new Set();
let pushed = 0;
const queue = [];
const scrapedAt = () => new Date().toISOString();

async function handle(rec) {
    if (includeDetails) {
        try {
            const { _title, _employer, ...d } = await fetchDetail(rec.id);
            Object.assign(rec, d);
            rec.title ??= _title ?? null;
            rec.employer ??= _employer ?? null;
            rec.deadline ??= d.deadlineFromAd ?? null;
        } catch (e) {
            log.warning(`Detail failed for ${rec.id}: ${e.message}`);
        }
    }
    rec.source = 'jobbnorge.no';
    rec.scrapedAt = scrapedAt();
    await Actor.pushData(rec);
}

async function drain() {
    const workers = Array.from({ length: DETAIL_CONCURRENCY }, async () => {
        while (queue.length) await handle(queue.shift());
    });
    await Promise.all(workers);
}

// Build the list of searches.
const searches = [];
const adIds = [];
for (const s of startUrls) {
    const p = parseStartUrl(s.url ?? s);
    if (!p) continue;
    if (p.jobId) adIds.push(p.jobId);
    else searches.push({ counties, municipalities, employerIds, categories, period, sortBy, ...Object.fromEntries(Object.entries(p).filter(([, v]) => v && (!Array.isArray(v) || v.length))) });
}
const terms = searchQueries.filter(Boolean);
if (terms.length || (!searches.length && !adIds.length)) {
    for (const term of terms.length ? terms : [undefined]) {
        searches.push({ term, counties, municipalities, employerIds, categories, period, sortBy });
    }
}

for (const s of searches) {
    if (pushed + queue.length >= limit) break;
    const url = `${SEARCH_API}?${buildQuery({ ...s, language })}`;
    const data = await getJson(url);
    const jobs = data?.jobs ?? [];
    let added = 0;
    for (const j of jobs) {
        if (seen.has(j.id)) continue;
        const rec = mapListing(j);
        if (cutoff && rec.published && rec.published < cutoff) continue;
        seen.add(j.id);
        queue.push(rec);
        added++;
        if (seen.size >= limit) break;
    }
    log.info(`Search "${s.term ?? '(all)'}": ${jobs.length} hits, ${added} new`);
    await drain();
    pushed = seen.size;
}

for (const id of adIds) {
    if (seen.has(id) || seen.size >= limit) continue;
    seen.add(id);
    const d = await fetchDetail(id).catch(() => null);
    if (!d) continue;
    const { _title, _employer, ...rest } = d;
    await Actor.pushData({
        id, url: `https://www.jobbnorge.no/ledige-stillinger/stilling/${id}`,
        title: _title ?? null, employer: _employer ?? null,
        deadline: rest.deadlineFromAd ?? null, ...rest,
        source: 'jobbnorge.no', scrapedAt: scrapedAt(),
    });
}

log.info(`Done. ${seen.size} jobs.`);
await Actor.exit();
