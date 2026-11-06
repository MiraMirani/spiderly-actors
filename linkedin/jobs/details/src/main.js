import { Actor, log } from 'apify';
import { normalizeInput } from './input.js';
import { createFetcher } from './http.js';
import { scrape } from './scraper.js';

await Actor.main(async () => {
    const input = normalizeInput((await Actor.getInput()) ?? {});
    const runMaxItems = Number(process.env.ACTOR_MAX_PAID_DATASET_ITEMS);
    if (Number.isInteger(runMaxItems) && runMaxItems > 0) input.maxItems = Math.min(input.maxItems, runMaxItems);
    const state = await Actor.useState('STATE', {});
    const dataset = await Actor.openDataset();
    const existingRows = [];
    for (let offset = 0; ; offset += 1000) {
        const { items } = await dataset.getData({ offset, limit: 1000, fields: ['id', 'scrapingInfo'] });
        existingRows.push(...items);
        if (items.length < 1000) break;
    }
    const config = input.proxyConfiguration;
    const proxy = config?.useApifyProxy || config?.proxyUrls?.length ? await Actor.createProxyConfiguration(config) : undefined;
    let stopping = false;
    Actor.on('migrating', () => { stopping = true; });
    Actor.on('aborting', () => { stopping = true; });
    log.info(`Starting public LinkedIn job collection. Global limit: ${input.maxItems}.`);
    const result = await scrape(input, {
        state, existingRows,
        fetchPage: createFetcher({ proxy, requestDelayMillis: input.requestDelayMillis, maxRetries: input.maxRetries, warn: log.warning.bind(log) }),
        pushData: async (row) => {
            try { await Actor.pushData(row); } catch (error) { error.storageFailure = true; throw error; }
        },
        checkpoint: async () => {
            try { await Actor.setValue('STATE', state); } catch (error) { error.storageFailure = true; throw error; }
        },
        warn: log.warning.bind(log), shouldStop: () => stopping,
    });
    await Actor.setValue('SEARCH_TOTALS', result.searchTotals);
    await Actor.setValue('FAILED_REQUESTS', result.failures);
    await Actor.setValue('RUN_SUMMARY', {
        ...result, searchTotals: undefined, failures: result.failures.length,
        partial: result.failures.length > 0, finishedAt: new Date().toISOString(),
    });
    log.info(`Stored ${result.totalItems} unique jobs. Failed requests: ${result.failures.length}.`);
    if (result.failures.some((f) => f.kind === 'search')) throw new Error('One or more searches failed. See FAILED_REQUESTS; any collected jobs remain in the dataset.');
});
