import { setTimeout as delay } from 'node:timers/promises';
import { gotScraping } from 'got-scraping';
import { linkedinUrl } from './input.js';

/** One shared request pace, bounded retries, and a fresh proxy session on retry. */
export function createFetcher({ proxy, requestDelayMillis = 1000, maxRetries = 3, warn = () => {} }) {
    let lastRequestAt = 0;
    return async function fetchPage(url) {
        linkedinUrl(url);
        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            const remaining = requestDelayMillis - (Date.now() - lastRequestAt);
            if (remaining > 0) await delay(remaining);
            lastRequestAt = Date.now();
            try {
                const response = await gotScraping({
                    url,
                    proxyUrl: proxy ? await proxy.newUrl() : undefined,
                    timeout: { request: 30000 }, retry: { limit: 0 }, throwHttpErrors: false,
                    headerGeneratorOptions: { browsers: [{ name: 'chrome' }], devices: ['desktop'], operatingSystems: ['windows'], locales: ['en-US'] },
                    headers: { 'accept-language': 'en-US,en;q=0.9' },
                    hooks: { beforeRedirect: [(options) => linkedinUrl(options.url.toString())] },
                });
                if (response.statusCode === 404 || response.statusCode === 410) {
                    const error = new Error(`LinkedIn returned HTTP ${response.statusCode}.`);
                    error.noRetry = true;
                    throw error;
                }
                if (response.statusCode >= 400) throw new Error(`LinkedIn returned HTTP ${response.statusCode}.`);
                if (/\/(?:authwall|checkpoint|login|uas\/login)(?:[/?]|$)/i.test(new URL(response.url).pathname)) throw new Error('LinkedIn returned a login or challenge page.');
                return response.body;
            } catch (error) {
                if (error.noRetry || attempt === maxRetries) throw error;
                warn(`Retrying LinkedIn request (${attempt + 1}/${maxRetries}).`);
                await delay(Math.min(30000, 2000 * 2 ** attempt) + Math.floor(Math.random() * 500));
            }
        }
    };
}
