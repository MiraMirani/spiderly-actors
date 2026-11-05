/** Pure helpers for Jobbnorge JSON. */

export function decodeEntities(s) {
    return String(s ?? '')
        .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
        .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
        .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
}

export function htmlToText(html) {
    if (!html) return '';
    return decodeEntities(
        String(html)
            .replace(/<\s*br\s*\/?>/gi, '\n')
            .replace(/<\/(p|div|h[1-6]|ul|ol|tr)>/gi, '\n')
            .replace(/<li[^>]*>/gi, '- ')
            .replace(/<\/li>/gi, '\n')
            .replace(/<[^>]+>/g, ''),
    ).replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

/** "26.11.2026" -> "2026-11-26"; anything else (e.g. "Continuously") -> null. */
export function parseNoDate(s) {
    const m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(String(s ?? '').trim());
    if (!m) return null;
    return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
}

/** "$date('2026-11-26 00:00:00')" -> "2026-11-26" */
export function parseApiDate(s) {
    const m = /(\d{4}-\d{2}-\d{2})/.exec(String(s ?? ''));
    return m ? m[1] : null;
}

/** Map one item of publicapi /v3/jobs to our output record. */
export function mapListing(j) {
    const locs = j.locations ?? [];
    const p = locs.find((l) => l.isPrimary) ?? locs[0] ?? {};
    return {
        id: j.id,
        url: j.link ?? `https://www.jobbnorge.no/ledige-stillinger/stilling/${j.id}`,
        title: j.title ?? null,
        employer: j.employer ?? null,
        employerId: j.employerID ?? null,
        department: j.department ?? null,
        departmentId: j.departmentID ?? null,
        location: p.area ?? null,
        municipality: p.municipality ?? null,
        county: p.county ?? null,
        zipCode: p.zipCode ?? null,
        address: p.address ?? null,
        isDomestic: p.isDomestic ?? null,
        locations: locs.map((l) => ({ area: l.area, municipality: l.municipality, county: l.county, zipCode: l.zipCode, address: l.address })),
        published: parseNoDate(j.publicationDate),
        publishedRaw: j.publicationDate ?? null,
        deadline: parseNoDate(j.deadline),
        deadlineRaw: j.deadline ?? null,
        jobScope: j.jobScope ?? null,
        jobDuration: j.jobDuration ?? null,
        positionCount: j.positionCount ?? null,
        jobType: j.jobType?.name?.replace(/^\d+\s+/, '') ?? null,
        jobTypeGroup: j.jobType?.jobTypeGroup?.name ?? null,
        promoted: !!j.promoted,
        summary: j.summary ?? null,
        logo: j.logo ?? null,
    };
}

/** Merge /joblisting (components) and /joblisting/job-info into extra fields. */
export function mapDetail(listing, info, jobId) {
    const comps = (listing?.components ?? []).filter((c) => c.text || c.heading);
    const sections = comps
        .filter((c) => c.text)
        .map((c) => ({ heading: decodeEntities(c.heading ?? '').trim(), text: htmlToText(c.text) }))
        .filter((s) => s.text);
    const descriptionHtml = comps.filter((c) => c.text).map((c) => `${c.heading ? `<h3>${c.heading}</h3>` : ''}${c.text}`).join('\n');
    const description = sections.map((s) => (s.heading ? `${s.heading}\n${s.text}` : s.text)).join('\n\n');
    const contacts = [...(listing?.contacts ?? []), ...(info?.contacts ?? [])];
    return {
        reference: info?.internalReference ?? null,
        deadlineFromAd: parseApiDate(info?.deadlineOn),
        employerWebsite: info?.web ?? null,
        workPlaces: (info?.workPlace ?? []).map((w) => ({ address: w.adress ?? w.address ?? null, area: w.area ?? null, zip: w.zip ?? null, municipality: w.municipality ?? null })),
        contacts,
        applyUrl: `https://jobseeker.jobbnorge.no/client/apply/${jobId}`,
        adLanguages: listing?.activeLanguages ?? [],
        sections,
        description,
        descriptionHtml,
    };
}

/** Build the /v3/jobs query string. */
export function buildQuery({ term, counties = [], municipalities = [], employerIds = [], categories = [], period = 'All', sortBy = 'Published', language = 1 }) {
    const q = new URLSearchParams();
    if (term) q.append('term', term);
    for (const c of counties) q.append('county', c);
    for (const m of municipalities) q.append('municipality', m);
    for (const e of employerIds) q.append('employer', e);
    for (const c of categories) q.append('category', c);
    q.set('OrderBy', sortBy);
    q.set('Period', period);
    q.set('language', String(language));
    return q.toString();
}

/** Extract a search definition or ad id from a start URL. */
export function parseStartUrl(url) {
    let u;
    try { u = new URL(url); } catch { return null; }
    const ad = /\/(?:stilling|job)\/(\d+)/.exec(u.pathname);
    if (ad) return { jobId: Number(ad[1]) };
    const p = u.searchParams;
    return {
        term: p.get('term') || p.get('q') || p.get('searchString') || undefined,
        counties: [...p.getAll('county')],
        municipalities: [...p.getAll('municipality')],
        employerIds: [...p.getAll('employer')],
        categories: [...p.getAll('category')],
        period: p.get('Period') || undefined,
        sortBy: p.get('OrderBy') || undefined,
    };
}
