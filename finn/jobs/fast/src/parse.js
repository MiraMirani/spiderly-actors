// Dependency-free parsers for finn.no job pages (fast + low memory).

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const decode = (s) => s.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') { const n = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return Number.isFinite(n) ? String.fromCodePoint(n) : m; }
    return ENT[e.toLowerCase()] ?? m;
});
const clean = (s) => (s ?? '').replace(/\s+/g, ' ').trim();
const iso = (ms) => (Number.isFinite(+ms) && +ms > 0 ? new Date(+ms).toISOString() : '');
const abs = (href) => new URL(href, 'https://www.finn.no').toString().split('?')[0];

export function htmlToText(html) {
    return clean(decode(String(html ?? '').replace(/<\s*(br|\/p|\/li|\/h\d|\/div|\/ul)\s*\/?>/gi, ' ').replace(/<[^>]+>/g, '')));
}

/** Search results are base64 JSON inside <script data-react-query-state>. */
function decodeState(raw) {
    const t = (raw ?? '').trim();
    if (!t) return null;
    try { return JSON.parse(t); } catch { /* not plain json */ }
    try { return JSON.parse(Buffer.from(t, 'base64').toString('utf8')); } catch { return null; }
}
const stateScripts = (html) => [...html.matchAll(/<script[^>]*data-react-query-state[^>]*>([\s\S]*?)<\/script>/g)].map((m) => decodeState(m[1]));

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
        latitude: doc.coordinates?.lat ?? null,
        longitude: doc.coordinates?.lon ?? null,
        coordinatesAccuracy: doc.coordinates?.accuracy ?? null,
        labels: (doc.labels ?? []).map((l) => clean(typeof l === 'string' ? l : (l?.text ?? l?.id))).filter(Boolean),
        logo: doc.logo?.url ?? '',
    };
}

/** Returns { ads, lastPage, total, perPage }. */
export function parseSearchPage(html) {
    const found = new Map();
    let lastPage = null; let total = null;
    for (const state of stateScripts(html)) {
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
    }
    if (!found.size) {
        for (const m of html.matchAll(/<a[^>]+href="([^"]*\/job\/ad\/(\d+)[^"]*)"[^>]*>([\s\S]*?)<\/a>/g)) {
            const title = htmlToText(m[3]);
            if (!title || found.has(m[2])) continue;
            found.set(m[2], { id: m[2], url: abs(m[1]), title, company: '', location: '', allLocations: [], published: '', deadline: '', positions: null, latitude: null, longitude: null, coordinatesAccuracy: null, labels: [], logo: '' });
        }
    }
    const ads = [...found.values()];
    return { ads, lastPage, total, perPage: ads.length };
}

/** Contact persons ("Spørsmål om stillingen" cards): name, optional title, phone, email (mailto only; Finn hides emails behind a form). */
export function parseContacts(html) {
    const sec = html.match(/<section[^>]*contact-card-section[\s\S]*?<\/section>/);
    if (!sec) return [];
    const cards = sec[0].split(/<div[^>]*class="contact-card\b(?![-_])/).slice(1);
    const out = [];
    for (const c of cards) {
        const text = (re) => { const m = c.match(re); return m ? htmlToText(m[1]) : ''; };
        const name = text(/class="[^"]*contact-card-name[^"]*"[^>]*>([\s\S]*?)<\/p>/);
        const title = text(/class="[^"]*contact-card-(?:title|role|subtitle)[^"]*"[^>]*>([\s\S]*?)<\/(?:p|span|div)>/);
        const phone = text(/slot="message"[^>]*>\s*<span[^>]*>([\s\S]*?)<\/span>/).replace(/[^\d+ ]/g, '').trim();
        const mail = c.match(/href="mailto:([^"?]+)/);
        const email = mail ? decodeURIComponent(mail[1]).trim() : '';
        if (name || phone || email) out.push({ name, title, phone, email });
    }
    return out;
}

/** Ad page: JSON-LD JobPosting (Finn wraps it as {"script:ld+json": {...}}). */
export function parseAdPage(html) {
    let jp = null;
    for (const m of html.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/g)) {
        try {
            const j = JSON.parse(m[1]);
            const inner = j['script:ld+json'] ?? j;
            const arr = Array.isArray(inner) ? inner : [inner, ...(inner['@graph'] ?? [])];
            jp = arr.find((x) => x && x['@type'] === 'JobPosting');
            if (jp) break;
        } catch { /* ignore */ }
    }
    if (!jp) return null;
    const contacts = parseContacts(html);
    const addr = [jp.jobLocation].flat().filter(Boolean).map((l) => l.address).filter(Boolean);
    return {
        title: clean(jp.title),
        company: clean(jp.hiringOrganization?.name),
        companyUrl: jp.hiringOrganization?.url ?? '',
        location: addr.map((a) => [a.streetAddress, a.postalCode, a.addressLocality].filter(Boolean).join(' ')).filter(Boolean).join('; '),
        published: jp.datePosted ?? '',
        deadline: jp.validThrough ?? '',
        employmentType: [jp.employmentType].flat().filter(Boolean).join(', '),
        descriptionHtml: jp.description ?? '',
        description: htmlToText(jp.description),
        contacts,
        contactName: contacts[0]?.name ?? '',
        contactPhone: contacts[0]?.phone ?? '',
        contactEmail: contacts[0]?.email ?? '',
    };
}

/** Location filter tree -> { 'rogaland': '1.20001.20012', ... } (counties + municipalities). */
export function extractLocationMap(html) {
    const map = {};
    const walk = (items) => {
        for (const it of items ?? []) {
            if (it.value && it.display_name && Number(String(it.value).split('.')[0]) <= 2) map[it.display_name.toLowerCase()] ??= it.value;
            walk(it.filter_items);
        }
    };
    for (const state of stateScripts(html)) {
        for (const q of state?.queries ?? []) for (const f of q?.state?.data?.filters ?? []) if (f?.name === 'location') walk(f.filter_items);
    }
    return map;
}

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
