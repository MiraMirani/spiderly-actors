import { Actor, log } from 'apify';
import { readSettings, runVisits } from './visits.js';

await Actor.main(async () => {
    const settings = readSettings(await Actor.getInput());
    const stop = new AbortController();
    Actor.on('aborting', () => stop.abort());
    log.info('Starting synthetic website visits.', {
        targetCount: settings.seeds.length,
        visitCount: settings.visitCount,
        concurrency: settings.concurrency,
    });
    const summary = await runVisits(settings, {
        signal: stop.signal,
        onRows: (batch) => Actor.pushData(batch),
    });
    await Actor.setValue('SUMMARY', summary);
    log.info('Website visit run finished.', summary);
});
