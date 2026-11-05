import { createHash } from 'node:crypto';
import { buildSearches, classifyUrl, DETAIL_ENDPOINT, searchPageUrl } from './input.js';
import { makeRow, parseCompanyPage, parseJobPage, parseSearchPage, parseSearchTotal } from './parse.js';

export function inputFingerprint(input) {
    const { proxyConfiguration, requestDelayMillis, maxRetries, ...stable } = input;
    return createHash('sha256').update(JSON.stringify(stable)).digest('hex');
}

/** Reconcile against stored rows, including writes made just before a process interruption. */
export function deliveredFromRows(rows) {
    const delivered = new Set();
    const counts = {};
    for (const row of rows) {
        if (!row.id || delivered.has(row.id)) continue;
        delivered.add(row.id);
        const searchId = row.scrapingInfo?.searchId;
        if (searchId) counts[searchId] = (counts[searchId] ?? 0) + 1;
    }
    return { delivered, counts };
}

export async function scrape(input, {
    fetchPage, pushData, state = {}, existingRows = [], checkpoint = async () => {},
    warn = () => {}, shouldStop = () => false,
}) {
    const signature = inputFingerprint(input);
    if (state.signature && state.signature !== signature) throw new Error('Stored state belongs to different input. Use a fresh run or clear local storage.');
    state.signature = signature;
    state.positions ??= {};
    state.searchTotals ??= {};
    // Retrying a resumed run replaces old transient failures with the current outcome.
    const failures = (state.failures ?? []).filter((failure) => failure.kind !== 'search');
    state.failures = failures;
    const { delivered, counts } = deliveredFromRows(existingRows);
    async function save(row) {
        try { await pushData(row); } catch (error) { error.storageFailure = true; throw error; }
    }
    async function persist() {
        try { await checkpoint(state); } catch (error) { error.storageFailure = true; throw error; }
    }
    const companyCache = new Map();
    async function company(url) {
        const normalized = classifyUrl(url);
        const key = normalized.inputUrl;
        if (!companyCache.has(key)) companyCache.set(key, (async () => {
            try {
                const parsed = parseCompanyPage(await fetchPage(key));
                if (!parsed) throw new Error('Company profile was not present in the public response.');
                return parsed;
            } catch (error) {
                failures.push({ kind: 'company', url: key, message: error.message });
                warn(`Company profile unavailable: ${key}`);
                return { companyProfileStatus: 'failed' };
            }
        })());
        return companyCache.get(key);
    }
    async function resolveCompany(url) {
        const value = classifyUrl(url);
        if (/^\d+$/.test(value.slug)) return value.slug;
        const result = await company(url);
        if (!result.companyId) throw new Error(`Could not resolve company ID for ${value.inputUrl}. Supply its numeric company ID instead.`);
        return result.companyId;
    }
    const ids = [];
    // Pasted start URLs define independent searches and ignore the structured company filter.
    if (!input.urls.length) for (const url of input.companyUrls) ids.push(await resolveCompany(url));
    const searches = buildSearches(input, ids);
    let stopped = false;
    for (let search of searches) {
        if (shouldStop() || delivered.size >= input.maxItems) { stopped = true; break; }
        const pos = state.positions[search.id] ??= { start: 0, pages: 0, done: false };
        if (pos.done) continue;
        try {
            if (search.kind === 'company') {
                const id = await resolveCompany(search.inputUrl);
                search = { ...search, kind: 'search', params: new URLSearchParams({ f_C: id }).toString(), title: '', location: '' };
            }
            if (search.kind === 'job') {
                const jobId = classifyUrl(search.inputUrl).id;
                if (!delivered.has(jobId)) {
                    const detail = parseJobPage(await fetchPage(`${DETAIL_ENDPOINT}${jobId}`), jobId, input.enrichCompany);
                    if (!detail) throw new Error('Job detail page was unavailable.');
                    const profile = input.companyProfile && detail.companyUrl ? await company(detail.companyUrl) : null;
                    await save(makeRow({ id: jobId }, detail, profile, { searchId: search.id, page: 1, index: 1, inputUrl: search.inputUrl, title: '', location: '' }));
                    delivered.add(jobId);
                    counts[search.id] = (counts[search.id] ?? 0) + 1;
                }
                pos.done = true;
                await persist();
                continue;
            }
            if (!state.searchTotals[search.id]) {
                try {
                    state.searchTotals[search.id] = { ...parseSearchTotal(await fetchPage(searchPageUrl(search, 0, true))), inputUrl: search.inputUrl, title: search.title, location: search.location };
                } catch {
                    state.searchTotals[search.id] = { total: null, isLowerBound: false, inputUrl: search.inputUrl, title: search.title, location: search.location };
                    warn(`Search total unavailable for search ${search.id}.`);
                }
            }
            while (!pos.done && delivered.size < input.maxItems && (counts[search.id] ?? 0) < search.cap) {
                if (shouldStop()) { stopped = true; break; }
                if (pos.start >= 1000 || pos.pages >= input.maxPages) { pos.done = true; break; }
                const pageUrl = searchPageUrl(search, pos.start);
                const html = await fetchPage(pageUrl);
                const jobs = parseSearchPage(html);
                if (!jobs.length && html.trim().length > 500 && !/no (?:matching |more )?(?:jobs|results|job postings)/i.test(html)) {
                    throw new Error('Search returned an unexpected page instead of job listings.');
                }
                if (!jobs.length) { pos.done = true; await persist(); break; }
                for (const [index, card] of jobs.entries()) {
                    if (shouldStop()) { stopped = true; break; }
                    if (delivered.size >= input.maxItems || (counts[search.id] ?? 0) >= search.cap) break;
                    if (delivered.has(card.id)) continue;
                    if (search.companyNames.length && !search.companyNames.some((name) => name.toLowerCase() === card.companyName?.toLowerCase())) continue;
                    let detail;
                    try {
                        detail = parseJobPage(await fetchPage(`${DETAIL_ENDPOINT}${card.id}`), card.id, input.enrichCompany);
                        if (!detail) throw new Error('Job detail page was unavailable.');
                    } catch (error) {
                        failures.push({ kind: 'detail', url: card.jobUrl, message: error.message });
                        warn(`Saving listing without full details: ${card.jobUrl}`);
                    }
                    const profileUrl = detail?.companyUrl || card.companyUrl;
                    const profile = input.companyProfile && profileUrl ? await company(profileUrl) : null;
                    const row = makeRow(card, detail, profile, {
                        searchId: search.id, page: pos.pages + 1, index: index + 1, rank: pos.start + index + 1,
                        inputUrl: search.inputUrl, title: search.title, location: search.location,
                    });
                    // A write error must propagate. Marking a failed write as delivered loses data.
                    await save(row);
                    delivered.add(card.id);
                    counts[search.id] = (counts[search.id] ?? 0) + 1;
                    await persist();
                }
                // On migration, replay this page; stored dataset IDs make the replay idempotent.
                if (stopped) break;
                pos.start += jobs.length;
                pos.pages++;
                if ((counts[search.id] ?? 0) >= search.cap) pos.done = true;
                await persist();
            }
        } catch (error) {
            // Storage failures are fatal: continuing could violate limits and duplicate data.
            if (error.storageFailure) throw error;
            failures.push({ kind: 'search', searchId: search.id, url: search.inputUrl || searchPageUrl(search), message: error.message });
            warn(`Search ${search.id} failed: ${error.message}`);
        }
    }
    state.failures = failures;
    await persist();
    return { totalItems: delivered.size, searches: searches.length, searchTotals: state.searchTotals, failures, stopped };
}
