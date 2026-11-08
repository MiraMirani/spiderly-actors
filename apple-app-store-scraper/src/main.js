import { Actor } from 'apify';
import { appId, appRow, sampleIds } from './apps.js';

await Actor.init();
const summary = { requested: 0, apps: 0, missingAppIds: [], error: null };
const controller = new AbortController();
Actor.on('aborting', async () => {
    controller.abort();
    await Actor.setValue('SUMMARY', summary);
    await Actor.exit();
});

try {
    const { apps = sampleIds, country = 'US' } = await Actor.getInput() ?? {};
    if (!Array.isArray(apps) || apps.length < 1 || apps.length > 50
        || typeof country !== 'string' || !/^[a-z]{2}$/i.test(country)) {
        throw new Error('Provide 1–50 apps and a two-letter country code.');
    }
    const ids = [...new Set(apps.map(appId))];
    summary.requested = ids.length;
    const storefront = country.toUpperCase();
    const url = 'https://itunes.apple.com/lookup?' + new URLSearchParams({
        id: ids.join(','), country: storefront.toLowerCase(), entity: 'software',
    });
    const response = await fetch(url, {
        redirect: 'error',
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(20000)]),
    });
    if (!response.ok) {
        await response.body?.cancel();
        throw new Error('Apple lookup returned HTTP ' + response.status);
    }
    const { results } = await response.json();
    if (!Array.isArray(results)) throw new Error('Apple returned an unexpected lookup response.');
    const byId = new Map(results.map((item) => appRow(item, storefront)).filter(Boolean)
        .map((row) => [row.appId, row]));
    const rows = ids.map((id) => byId.get(id)).filter(Boolean);
    summary.missingAppIds = ids.filter((id) => !byId.has(id));
    if (!rows.length) throw new Error('No app listings were found for the requested storefront.');
    await Actor.pushData(rows);
    summary.apps = rows.length;
} catch (error) {
    summary.error = error.message;
    await Actor.setValue('SUMMARY', summary);
    await Actor.fail(error.message);
}
await Actor.setValue('SUMMARY', summary);
await Actor.exit();
