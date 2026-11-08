export const sampleIds = ['324684580', '570060128', '324715238'];
const text = (value) => typeof value === 'string' && value.trim() ? value.trim() : null;
const numeric = (value) => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
const strings = (value) => Array.isArray(value) ? value.filter((item) => typeof item === 'string') : [];
const httpsUrl = (value) => {
    const url = typeof value === 'string' ? URL.parse(value) : null;
    return url?.protocol === 'https:' && !url.username && !url.password ? url.href : null;
};

export function appId(value) {
    if (typeof value !== 'string') throw new Error('Enter app IDs or App Store URLs as strings.');
    const raw = value.trim();
    const url = URL.parse(raw);
    const id = url?.origin === 'https://apps.apple.com' && !url.username && !url.password
        && /^\/(?:[a-z]{2}\/)?app\//.test(url.pathname) ? url.pathname.match(/\/id(\d+)\/?$/)?.[1] : raw;
    if (!id || !/^[1-9]\d{0,14}$/.test(id)) throw new Error('Use a numeric App Store ID or apps.apple.com app URL.');
    return id;
}

export function appRow(value, country) {
    if (!Number.isSafeInteger(value?.trackId) || value.trackId <= 0 || value.kind !== 'software' || !text(value.trackName)) return null;
    return {
        appId: String(value.trackId),
        country,
        title: text(value.trackName),
        bundleId: text(value.bundleId),
        url: httpsUrl(value.trackViewUrl),
        developer: text(value.artistName),
        seller: text(value.sellerName),
        developerUrl: httpsUrl(value.artistViewUrl),
        category: text(value.primaryGenreName),
        genres: strings(value.genres),
        contentRating: text(value.contentAdvisoryRating),
        rating: numeric(value.averageUserRating),
        ratingCount: numeric(value.userRatingCount),
        price: numeric(value.price),
        currency: text(value.currency),
        version: text(value.version),
        releaseDate: text(value.releaseDate),
        updatedAt: text(value.currentVersionReleaseDate),
        minimumOsVersion: text(value.minimumOsVersion),
        description: text(value.description),
        releaseNotes: text(value.releaseNotes),
        iconUrl: httpsUrl(value.artworkUrl512) ?? httpsUrl(value.artworkUrl100),
        screenshotUrls: strings(value.screenshotUrls).map(httpsUrl).filter(Boolean),
    };
}
