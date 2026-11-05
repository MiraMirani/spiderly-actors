// Parsing helpers for arbeidsplassen.nav.no

const ENT = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", aring: 'å', Aring: 'Å', oslash: 'ø', Oslash: 'Ø', aelig: 'æ', AElig: 'Æ', ndash: '-', mdash: '-', hellip: '...', bull: '•' };

export function decodeEntities(s) {
    return String(s)
        .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
        .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
        .replace(/&([a-zA-Z]+);/g, (m, n) => (n in ENT ? ENT[n] : m));
}

export function htmlToText(html) {
    if (!html) return '';
    return decodeEntities(
        String(html)
            .replace(/<\s*br\s*\/?>/gi, '\n')
            .replace(/<\/(p|div|h[1-6]|ul|ol|tr)>/gi, '\n')
            .replace(/<li[^>]*>/gi, '\n• ')
            .replace(/<[^>]+>/g, ''),
    )
        .replace(/[ \t ]+/g, ' ')
        .replace(/ *\n */g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

/** Concatenate the Next.js RSC flight payload of a page into one string. */
export function flightPayload(html) {
    let payload = '';
    const re = /self\.__next_f\.push\(\[1,"((?:[^"\\]|\\.)*)"\]\)/g;
    let m;
    while ((m = re.exec(html))) {
        try { payload += JSON.parse(`"${m[1]}"`); } catch { /* skip chunk */ }
    }
    return payload;
}

/** Extract the balanced JSON object that follows `marker` in `text`. */
export function extractObject(text, marker) {
    const s = text.indexOf(marker);
    if (s < 0) return null;
    const start = text.indexOf('{', s + marker.length - 1);
    if (start < 0) return null;
    let depth = 0, inStr = false, esc = false;
    for (let p = start; p < text.length; p++) {
        const c = text[p];
        if (inStr) {
            if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inStr = false;
        } else if (c === '"') inStr = true;
        else if (c === '{') depth++;
        else if (c === '}') { depth--; if (depth === 0) { try { return JSON.parse(text.slice(start, p + 1)); } catch { return null; } } }
    }
    return null;
}

/** Resolve a flight text reference like "$52" -> the text chunk `52:T<hexlen>,<text>`. */
export function resolveRef(payload, ref) {
    if (typeof ref !== 'string' || !/^\$[0-9a-f]+$/i.test(ref)) return ref ?? null;
    const id = ref.slice(1);
    const re = new RegExp(`(?:^|\\n)${id}:T([0-9a-f]+),`);
    const m = re.exec(payload);
    if (!m) return null;
    const bytes = Buffer.from(payload.slice(m.index + m[0].length), 'utf8');
    return bytes.subarray(0, parseInt(m[1], 16)).toString('utf8');
}

/** Parse the detail page of one ad. Returns null if no ad data found. */
export function parseDetail(html) {
    const payload = flightPayload(html);
    const ad = extractObject(payload, '"adData":');
    if (!ad) return null;
    const descriptionHtml = resolveRef(payload, ad.adTextHtml) ?? resolveRef(payload, ad.adText) ?? null;
    const e = ad.employer ?? {};
    return {
        shortSummary: ad.shortSummary ?? null,
        updated: ad.updated ?? null,
        engagementType: ad.engagementType ?? null,
        jobArrangement: ad.jobArrangement ?? null,
        positionCount: ad.positionCount ?? null,
        remoteOptions: ad.remoteOptions ?? ad.aiRemoteOptions ?? null,
        startDate: ad.startDate ?? ad.startDateLabel ?? null,
        workDays: ad.workDays ?? null,
        workHours: ad.workHours ?? null,
        extent: ad.extent ?? null,
        jobPercentage: ad.jobPercentage ?? null,
        workLanguages: ad.workLanguages ?? null,
        competences: ad.aiCompetences ?? null,
        aiWorkExperience: ad.aiWorkExperience ?? null,
        applicationUrl: ad.application?.applicationUrl ? (/^https?:/.test(ad.application.applicationUrl) ? ad.application.applicationUrl : `https://${ad.application.applicationUrl}`) : null,
        applicationEmail: ad.application?.applicationEmail ?? null,
        hasSuperraskSoknad: ad.application?.hasSuperraskSoknad ?? null,
        sourceUrl: ad.sourceUrl ?? null,
        employerOrgNr: e.orgnr || null,
        employerSector: e.sector ?? null,
        employerHomepage: e.homepage ?? null,
        employerLinkedin: e.linkedinPage ?? null,
        employerDescription: e.descriptionHtml ? htmlToText(e.descriptionHtml) : null,
        descriptionHtml,
        description: descriptionHtml ? htmlToText(descriptionHtml) : null,
    };
}

/** Map one Elasticsearch hit from /stillinger/api/search to a flat job record. */
export function mapHit(hit) {
    const s = hit._source ?? {};
    const p = s.properties ?? {};
    const loc = (s.locationList ?? [])[0] ?? {};
    const occ = (s.occupationList ?? [])[0] ?? {};
    const cats = s.categoryList ?? [];
    return {
        id: s.uuid ?? hit._id,
        url: `https://arbeidsplassen.nav.no/stillinger/stilling/${s.uuid ?? hit._id}`,
        title: s.title ?? p.jobtitle ?? null,
        jobTitle: p.jobtitle ?? null,
        employer: s.employer?.name || s.businessName || null,
        city: loc.city ?? null,
        municipality: loc.municipal ?? null,
        county: loc.county ?? null,
        postalCode: loc.postalCode ?? null,
        address: loc.address ?? null,
        country: loc.country ?? null,
        locations: s.locationList ?? [],
        published: s.published ?? null,
        expires: s.expires ?? null,
        applicationDue: p.applicationdue ?? null,
        status: s.status ?? null,
        source: s.source ?? null,
        reference: s.reference ?? null,
        occupationLevel1: occ.level1 ?? null,
        occupationLevel2: occ.level2 ?? null,
        categories: cats.map((c) => c.name),
        workLanguages: p.workLanguage ?? null,
        education: p.education ?? null,
        experience: p.experience ?? null,
        needsDriversLicense: p.needDriversLicense?.[0] === 'true' ? true : p.needDriversLicense?.[0] === 'false' ? false : null,
        searchTags: p.searchtagsai ?? [],
        shortSummary: s.generatedSearchMetadata?.shortSummary ?? null,
        isUnder18: s.generatedSearchMetadata?.isUnder18 ?? null,
    };
}
