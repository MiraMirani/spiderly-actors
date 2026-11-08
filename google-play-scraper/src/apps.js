import { load } from 'cheerio';

const origin = 'https://play.google.com';
export const sampleIds = ['com.spotify.music', 'com.duolingo', 'org.wikipedia'];
const clean = (value) => typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() || null : null;
const number = (value, max = Number.MAX_SAFE_INTEGER) => {
    const parsed = typeof value === 'number' || (typeof value === 'string' && value.trim()) ? Number(value) : NaN;
    return Number.isFinite(parsed) && parsed >= 0 && parsed <= max ? parsed : null;
};
function httpsUrl(value) {
    const url = typeof value === 'string' ? URL.parse(value) : null;
    return url?.protocol === 'https:' && !url.username && !url.password ? url.href : null;
}

export function appId(value) {
    if (typeof value !== 'string') throw new Error('Each app must be a package ID or a Google Play details URL.');
    const raw = value.trim();
    const url = URL.parse(raw);
    const id = url?.origin === origin && !url.username && !url.password
        && /^\/store\/apps\/details(?:\/[^/]+)?$/.test(url.pathname) ? url.searchParams.get('id') : raw;
    if (!id || id.length > 200 || !/^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+$/i.test(id)) {
        throw new Error('Invalid Google Play package ID or details URL.');
    }
    return id;
}

export function appUrl(id, language, country) {
    return origin + '/store/apps/details?' + new URLSearchParams({ id, hl: language, gl: country });
}

export function parseApp(html, id, language, country) {
    const $ = load(html);
    const data = $('script[type="application/ld+json"]').toArray().map((element) => {
        try { return JSON.parse($(element).text()); } catch { return null; }
    }).find((item) => item?.['@type'] === 'SoftwareApplication' && clean(item.name));
    if (!data) throw new Error('Google Play did not return a readable public app listing.');
    const offer = Array.isArray(data.offers) ? data.offers[0] : data.offers;
    const badges = $('[aria-label="Information badges"]');
    const downloads = badges.find('.g1rdde').filter((_, element) => $(element).text().trim() === 'Downloads')
        .first().prev().text().trim() || null;
    const updated = $('div.lXlx5').filter((_, element) => $(element).text().trim() === 'Updated on')
        .first().next().text().trim() || null;
    return {
        appId: id,
        url: appUrl(id, language, country),
        language,
        country,
        title: clean(data.name),
        developer: clean(data.author?.name),
        developerWebsite: httpsUrl(data.author?.url),
        category: clean(data.applicationCategory),
        contentRating: clean(data.contentRating),
        rating: number(data.aggregateRating?.ratingValue, 5),
        ratingCount: number(data.aggregateRating?.ratingCount),
        downloads,
        updated,
        price: number(offer?.price),
        currency: /^[A-Z]{3}$/.test(offer?.priceCurrency ?? '') ? offer.priceCurrency : null,
        iconUrl: httpsUrl(data.image),
        description: clean($('[data-g-id="description"]').first().find('br').replaceWith(' ').end().text()),
    };
}
