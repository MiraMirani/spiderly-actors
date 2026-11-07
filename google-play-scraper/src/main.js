import { Actor, log } from 'apify';
import { appId, appUrl, parseApp, sampleIds } from './apps.js';

await Actor.init();
const summary = { requested: 0, apps: 0, errors: [] };
const controller = new AbortController();
Actor.on('aborting', async () => {
    controller.abort();
    await Actor.setValue('SUMMARY', summary);
    await Actor.exit();
});

try {
    const { apps = sampleIds, language = 'en', country = 'US' } = await Actor.getInput() ?? {};
    if (!Array.isArray(apps) || !apps.length || apps.length > 50 || typeof language !== 'string'
        || !/^[a-z]{2,3}(?:[-_][A-Z]{2})?$/.test(language) || typeof country !== 'string' || !/^[a-z]{2}$/i.test(country)) {
        throw new Error('Provide 1–50 apps, a language such as en, and a country such as US.');
    }
    const ids = [...new Set(apps.map(appId))];
    summary.requested = ids.length;
    for (const id of ids) {
        if (controller.signal.aborted) break;
        try {
            const region = country.toUpperCase();
            const response = await fetch(appUrl(id, language, region), {
                redirect: 'error',
                signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10000)]),
            });
            if (!response.ok) {
                await response.body?.cancel();
                throw new Error('Google Play returned HTTP ' + response.status);
            }
            const row = parseApp(await response.text(), id, language, region);
            await Actor.pushData(row);
            summary.apps += 1;
        } catch (error) {
            summary.errors.push({ appId: id, reason: error.message });
            log.warning('App lookup failed', { appId: id, reason: error.message });
        }
        await Actor.setValue('SUMMARY', summary);
    }
    if (!summary.apps) throw new Error('No app listings were collected. See SUMMARY for details.');
} catch (error) {
    await Actor.setValue('SUMMARY', summary);
    await Actor.fail(error.message);
}
await Actor.exit();
