import { Resolver } from 'node:dns/promises';
import http from 'node:http';
import https from 'node:https';
import { isIP } from 'node:net';
import { setTimeout as pause } from 'node:timers/promises';
import { load } from 'cheerio';
import ipaddr from 'ipaddr.js';
import robotsParser from 'robots-parser';

const USER_AGENT = 'SpiderlySynthetic/1.0';
const MAX_BODY_BYTES = 256 * 1024;
const MAX_LINKS = 50;
const MAX_REDIRECTS = 3;
const LABELS = ['desktop', 'mobile', 'tablet'];
const REDIRECT_CODES = [301, 302, 303, 307, 308];

class VisitError extends Error {
    constructor(code) {
        super(code);
        this.code = code;
    }
}

export function normalizeUrl(value, base) {
    if (typeof value !== 'string' || !value.trim() || value.length > 2048) throw new VisitError('INVALID_URL');
    const url = new URL(value, base);
    const host = url.hostname;
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.port || url.search
        || !host.includes('.') || isIP(host) || host.endsWith('.local') || host.endsWith('.localhost')) {
        throw new VisitError('INVALID_URL');
    }
    url.hash = '';
    url.search = '';
    return url;
}

function boundedInteger(value, fallback, min, max, name) {
    const n = value === undefined ? fallback : value;
    if (!Number.isInteger(n) || n < min || n > max) {
        throw new Error(name + ' must be an integer between ' + min + ' and ' + max + '.');
    }
    return n;
}

export function readSettings(input) {
    if (!input || !Array.isArray(input.startUrls) || input.startUrls.length < 1 || input.startUrls.length > 10) {
        throw new Error('Provide one to ten website URLs in startUrls.');
    }
    const seeds = [...new Set(input.startUrls.map((item) => {
        if (item && typeof item === 'object' && item.requestsFromUrl !== undefined) {
            throw new Error('Supply direct website URLs.');
        }
        return normalizeUrl(typeof item === 'string' ? item : item?.url).href;
    }))].map((url) => new URL(url));
    const visitCount = boundedInteger(input.visitCount, Math.max(3, seeds.length), 1, 50, 'visitCount');
    if (visitCount < seeds.length) throw new Error('visitCount must cover every supplied website URL.');
    const requestLabels = input.requestLabels === undefined ? ['desktop'] : input.requestLabels;
    if (!Array.isArray(requestLabels) || requestLabels.length < 1
        || requestLabels.some((label) => !LABELS.includes(label)) || new Set(requestLabels).size !== requestLabels.length) {
        throw new Error('Choose distinct desktop, mobile or tablet request labels.');
    }
    if (input.discoverLinks !== undefined && typeof input.discoverLinks !== 'boolean') {
        throw new Error('discoverLinks must be a boolean.');
    }
    return {
        seeds, visitCount, requestLabels, discoverLinks: input.discoverLinks ?? false,
        concurrency: boundedInteger(input.concurrency, 2, 1, 5, 'concurrency'),
        intervalMs: boundedInteger(input.intervalMs, 500, 250, 5000, 'intervalMs'),
        timeoutMs: 1000 * boundedInteger(input.timeoutSecs, 15, 2, 45, 'timeoutSecs'),
    };
}

export function choosePublicAddress(addresses) {
    if (!addresses.length) throw new VisitError('NO_IPV4_ADDRESS');
    for (const address of addresses) {
        if (!ipaddr.IPv4.isValid(address) || ipaddr.parse(address).range() !== 'unicast') {
            throw new VisitError('NON_PUBLIC_ADDRESS');
        }
    }
    return addresses[0];
}

async function resolvePublicAddress(hostname, signal) {
    signal.throwIfAborted();
    const resolver = new Resolver({ timeout: 3000, tries: 1 });
    const cancel = () => resolver.cancel();
    signal.addEventListener('abort', cancel, { once: true });
    try {
        const addresses = await resolver.resolve4(hostname);
        return choosePublicAddress(addresses);
    } finally {
        signal.removeEventListener('abort', cancel);
    }
}

function createPacer(intervalMs) {
    let previous = Promise.resolve();
    let nextStart = 0;
    return (signal) => {
        const turn = previous.then(async () => {
            signal.throwIfAborted();
            const wait = nextStart - performance.now();
            if (wait > 0) await pause(Math.ceil(wait), undefined, { signal });
            nextStart = performance.now() + intervalMs;
        });
        previous = turn.catch(() => {});
        return turn;
    };
}

function requestPage(url, address, requestLabel, signal) {
    return new Promise((resolve, reject) => {
        const start = performance.now();
        const request = (url.protocol === 'https:' ? https : http).get(url, {
            agent: false,
            family: 4,
            signal,
            // Use the checked address for the socket while retaining Host and TLS hostname verification.
            lookup: (_host, options, done) => {
                if (options.all) done(null, [{ address, family: 4 }]);
                else done(null, address, 4);
            },
            headers: {
                'User-Agent': USER_AGENT,
                'X-Spiderly-Synthetic': requestLabel,
                Accept: 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
                'Accept-Encoding': 'identity',
            },
        }, async (response) => {
            const responseMs = Math.round(performance.now() - start);
            const statusCode = response.statusCode;
            const location = response.headers.location;
            const contentType = response.headers['content-type']?.split(';')[0]?.trim().slice(0, 100) || null;
            const chunks = [];
            let bytesRead = 0;
            let bodyTruncated = false;
            try {
                if (REDIRECT_CODES.includes(statusCode) && location) response.destroy();
                else {
                    for await (const chunk of response) {
                        const capacity = MAX_BODY_BYTES - bytesRead;
                        const kept = chunk.subarray(0, capacity);
                        chunks.push(kept);
                        bytesRead += kept.length;
                        if (chunk.length > capacity) {
                            bodyTruncated = true;
                            response.destroy();
                            break;
                        }
                    }
                }
                resolve({ statusCode, location, contentType, responseMs, bytesRead, bodyTruncated,
                    body: Buffer.concat(chunks, bytesRead).toString('utf8') });
            } catch (error) {
                reject(error);
            }
        });
        request.on('error', reject);
    });
}

export function sameOriginTarget(value, base, origin) {
    try {
        const target = normalizeUrl(value, base);
        return target.origin === origin ? target : null;
    } catch {
        return null;
    }
}

function extractLinks(html, page, robots) {
    const $ = load(html);
    const links = new Set();
    for (const node of $('a[href]')) {
        const target = sameOriginTarget($(node).attr('href'), page, page.origin);
        if (target && robots.isAllowed(target.href, USER_AGENT) === true) links.add(target.href);
        if (links.size >= MAX_LINKS) break;
    }
    return [...links].map((url) => new URL(url));
}

export function summarize(rows, requestedVisits) {
    const successes = rows.filter((row) => row.success);
    const times = successes.map((row) => row.responseMs).filter(Number.isInteger).sort((a, b) => a - b);
    const percentile = (p) => times.length ? times[Math.ceil(times.length * p) - 1] : null;
    return {
        requestedVisits,
        completedVisits: rows.length,
        successfulVisits: successes.length,
        failedVisits: rows.length - successes.length,
        statusCounts: rows.reduce((counts, row) => {
            const key = row.statusCode ?? 'NO_RESPONSE';
            counts[key] = (counts[key] ?? 0) + 1;
            return counts;
        }, {}),
        medianResponseMs: percentile(0.5),
        p95ResponseMs: percentile(0.95),
    };
}

export async function runVisits(settings, { signal, onRows }) {
    const pace = createPacer(settings.intervalMs);
    const rows = [];
    const visited = new Set(settings.seeds.map((url) => url.href));
    const discovered = [];
    const pendingSeeds = [...settings.seeds];
    const robotsByOrigin = new Map();
    let repeated = 0;

    const send = async (url, label, visitSignal) => {
        const address = await resolvePublicAddress(url.hostname, visitSignal);
        await pace(visitSignal);
        return requestPage(url, address, label, visitSignal);
    };

    if (settings.discoverLinks) {
        for (const { origin } of settings.seeds) {
            if (robotsByOrigin.has(origin) || signal.aborted) continue;
            const robotsUrl = new URL('/robots.txt', origin);
            try {
                const response = await send(robotsUrl, settings.requestLabels[0],
                    AbortSignal.any([signal, AbortSignal.timeout(settings.timeoutMs)]));
                if (response.statusCode === 404 || response.statusCode === 410) {
                    robotsByOrigin.set(origin, robotsParser(robotsUrl.href, ''));
                } else if (response.statusCode === 200 && !response.bodyTruncated) {
                    robotsByOrigin.set(origin, robotsParser(robotsUrl.href, response.body));
                } else robotsByOrigin.set(origin, null);
            } catch {
                robotsByOrigin.set(origin, null);
            }
        }
    }

    async function visit(seed, index) {
        const visitSignal = AbortSignal.any([signal, AbortSignal.timeout(settings.timeoutMs)]);
        const requestLabel = settings.requestLabels[(index - 1) % settings.requestLabels.length];
        const startedAt = new Date().toISOString();
        const start = performance.now();
        let current = seed;
        let redirects = 0;
        let response;
        let error = null;
        let links = [];
        try {
            while (true) {
                const robots = robotsByOrigin.get(seed.origin);
                if (robots?.isAllowed(current.href, USER_AGENT) === false) throw new VisitError('ROBOTS_DISALLOWED');
                response = await send(current, requestLabel, visitSignal);
                if (!REDIRECT_CODES.includes(response.statusCode) || !response.location) break;
                const next = sameOriginTarget(response.location, current, seed.origin);
                if (!next) throw new VisitError('REDIRECT_OUTSIDE_SCOPE');
                if (redirects === MAX_REDIRECTS) throw new VisitError('REDIRECT_LIMIT');
                current = next;
                response = undefined;
                redirects += 1;
            }
            if (response.statusCode < 200 || response.statusCode >= 300) error = 'HTTP_' + response.statusCode;
            else {
                const robots = robotsByOrigin.get(current.origin);
                if (robots && ['text/html', 'application/xhtml+xml'].includes(response.contentType)) {
                    links = extractLinks(response.body, current, robots);
                }
            }
        } catch (cause) {
            error = signal.aborted ? 'ABORTED'
                : visitSignal.aborted ? 'TIMEOUT'
                    : /^[A-Z0-9_]{1,48}$/.test(cause.code ?? '') ? cause.code : 'REQUEST_FAILED';
        }
        return {
            row: {
                visit: index, url: seed.href, finalUrl: current.href, requestLabel,
                success: error === null, statusCode: response?.statusCode ?? null,
                responseMs: response?.responseMs ?? null,
                durationMs: Math.round(performance.now() - start),
                redirects, bytesRead: response?.bytesRead ?? 0, bodyTruncated: response?.bodyTruncated ?? false,
                contentType: response?.contentType ?? null, startedAt, finishedAt: new Date().toISOString(), error,
            },
            links,
        };
    }

    while (rows.length < settings.visitCount && !signal.aborted) {
        const available = pendingSeeds.length || settings.visitCount - rows.length;
        const count = Math.min(settings.concurrency, settings.visitCount - rows.length, available);
        const targets = Array.from({ length: count }, () => pendingSeeds.shift() ?? discovered.shift()
            ?? settings.seeds[repeated++ % settings.seeds.length]);
        const results = await Promise.all(targets.map((url, offset) => visit(url, rows.length + offset + 1)));
        for (const { links } of results) {
            for (const link of links) {
                if (visited.has(link.href) || visited.size >= MAX_LINKS + settings.seeds.length) continue;
                visited.add(link.href);
                discovered.push(link);
            }
        }
        const batch = results.map(({ row }) => row);
        await onRows(batch);
        rows.push(...batch);
    }
    return summarize(rows, settings.visitCount);
}
