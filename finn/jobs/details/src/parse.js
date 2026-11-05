import * as cheerio from 'cheerio';

const clean = (s) => (s ?? '').replace(/\s+/g, ' ').trim();
const iso = (ms) => (Number.isFinite(+ms) && +ms > 0 ? new Date(+ms).toISOString() : '');
const abs = (href) => new URL(href, 'https://www.finn.no').toString().split('?')[0];

/** Finn embeds the search results as base64 JSON in <script data-react-query-state>. */
function decodeState(raw) {
    const t = (raw ?? '').trim();
    if (!t) return null;
    try { return JSON.parse(t); } catch { /* not plain json */ }
    try { return JSON.parse(Buffer.from(t, 'base64').toString('utf8')); } catch { return null; }
}

function docToJob(doc) {
    const id = String(doc.ad_id ?? doc.id);
    return {
        id,
        url: abs(doc.canonical_url ?? `/job/ad/${id}`),
        title: clean(doc.job_title ?? doc.heading),
        company: clean(doc.company_name),
        location: clean(doc.location),
        allLocations: (doc.work_locations ?? []).map((w) => clean([...w].reverse().find(Boolean))).filter(Boolean),
        published: iso(doc.published ?? doc.timestamp),
        deadline: iso(doc.deadline),
        positions: doc.no_of_positions ?? null,
        logo: doc.logo?.url ?? '',
    };
}

/**
 * Parse a search result page.
 * Returns { ads, lastPage, total }. Primary: embedded JSON state. Fallback: ad links in HTML.
 */
export function parseSearchPage(html) {
    const $ = cheerio.load(html);
    const found = new Map();
    let lastPage = null;
    let total = null;

    $('script[data-react-query-state]').each((_, el) => {
        const state = decodeState($(el).html());
        for (const q of state?.queries ?? []) {
            const data = q?.state?.data;
            if (!Array.isArray(data?.docs)) continue;
            for (const d of data.docs) {
                if (d?.type && d.type !== 'job') continue;
                if (d?.ad_id ?? d?.id) found.set(String(d.ad_id ?? d.id), docToJob(d));
            }
            lastPage ??= data.metadata?.paging?.last ?? null;
            total ??= data.metadata?.result_size?.match_count ?? null;
        }
    });

    if (!found.size) {
        // Fallback: plain links (less precise)
        $('a[href*="/job/ad/"]').each((_, a) => {
            const m = ($(a).attr('href') || '').match(/\/job\/ad\/(\d+)/);
            const title = clean($(a).text());
            if (!m || !title || found.has(m[1])) return;
            found.set(m[1], { id: m[1], url: abs($(a).attr('href')), title, company: '', location: '', allLocations: [], published: '', deadline: '', positions: null, logo: '' });
        });
    }
    return { ads: [...found.values()], lastPage, total };
}

/** Parse a single ad page: JSON-LD JobPosting (Finn wraps it as {"script:ld+json": {...}}). */
export function parseAdPage(html) {
    const $ = cheerio.load(html);
    let jp = null;
    $('script[type="application/ld+json"]').each((_, el) => {
        if (jp) return;
        try {
            const j = JSON.parse($(el).html());
            const inner = j['script:ld+json'] ?? j;
            const arr = Array.isArray(inner) ? inner : [inner, ...(inner['@graph'] ?? [])];
            jp = arr.find((x) => x && x['@type'] === 'JobPosting') ?? null;
        } catch { /* ignore */ }
    });
    const addr = [jp?.jobLocation].flat().filter(Boolean).map((l) => l.address).filter(Boolean);
    const location = addr.map((a) => [a.streetAddress, a.postalCode, a.addressLocality].filter(Boolean).join(' ')).filter(Boolean).join('; ');
    const descHtml = jp?.description ?? '';
    const description = descHtml
        ? clean(cheerio.load(`<div>${descHtml.replace(/<(br|\/p|\/li|\/h\d)\s*\/?>/gi, '$&\n')}</div>`)('div').text().replace(/\n/g, ' '))
        : clean($('meta[property="og:description"]').attr('content'));
    return {
        title: clean(jp?.title ?? $('h1').first().text()),
        company: clean(jp?.hiringOrganization?.name),
        companyUrl: jp?.hiringOrganization?.url ?? '',
        location,
        published: jp?.datePosted ?? '',
        deadline: jp?.validThrough ?? '',
        employmentType: [jp?.employmentType].flat().filter(Boolean).join(', '),
        description,
    };
}

/** Build a {lowercased place name: code} map from the location filter tree embedded in any Finn job search page. */
export function extractLocationMap(html) {
    const map = {};
    const $ = cheerio.load(html);
    const walk = (items) => {
        for (const it of items ?? []) {
            if (it.value && it.display_name && Number(String(it.value).split('.')[0]) <= 2) map[it.display_name.toLowerCase()] ??= it.value;
            walk(it.filter_items);
        }
    };
    $('script[data-react-query-state]').each((_, el) => {
        for (const q of decodeState($(el).html())?.queries ?? []) {
            for (const f of q?.state?.data?.filters ?? []) if (f?.name === 'location') walk(f.filter_items);
        }
    });
    return map;
}

/** Accepts a Finn code ("1.20001.20012") or a place name ("Rogaland", "Haugesund"); names need the map from extractLocationMap. */
export function resolveLocation(loc, map = {}) {
    const v = clean(loc);
    if (!v) return '';
    if (/^\d\.\d+/.test(v)) return v;
    return map[v.toLowerCase()] ?? '';
}

export function buildSearchUrl({ keyword, location }, map = {}) {
    const u = new URL('https://www.finn.no/job/search');
    if (keyword) u.searchParams.set('q', keyword);
    const code = resolveLocation(location, map);
    if (code) u.searchParams.set('location', code);
    return u.toString();
}

export function withPage(url, page) {
    const u = new URL(url);
    if (page > 1) u.searchParams.set('page', String(page)); else u.searchParams.delete('page');
    return u.toString();
}
