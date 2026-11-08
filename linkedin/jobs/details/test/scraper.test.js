import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeInput } from '../src/input.js';
import { scrape } from '../src/scraper.js';
import { card, simpleJob } from './helpers.js';

const company = readFileSync(new URL('fixtures/company.html', import.meta.url), 'utf8');
function network(pages, { failDetails = [], calls = [] } = {}) {
    return async (url) => {
        calls.push(url);
        const u = new URL(url);
        if (u.pathname.startsWith('/company/')) return company;
        if (u.pathname === '/jobs/search/') return '<span class="results-context-header__job-count">25</span>';
        if (u.pathname.includes('/jobPosting/')) {
            const id = u.pathname.split('/').pop();
            if (failDetails.includes(id)) throw new Error('HTTP 429');
            return simpleJob(id);
        }
        return pages[`${u.searchParams.get('keywords') ?? ''}:${u.searchParams.get('start') ?? '0'}`] ?? '';
    };
}

test('per-search quotas count delivered unique rows and a global cap bounds all searches', async () => {
    const pages = { 'dev:0': card('101') + card('102'), 'ops:0': card('102') + card('103') + card('104') };
    const rows = [];
    const result = await scrape(normalizeInput({ titles: ['dev', 'ops'], rows: 2, maxItems: 10, companyProfile: false }), { fetchPage: network(pages), pushData: async (row) => rows.push(row) });
    assert.deepEqual(rows.map((r) => r.id), ['101', '102', '103', '104']);
    assert.equal(result.totalItems, 4);
    assert.equal(rows[2].scrapingInfo.title, 'ops');
    assert.equal(rows[2].scrapingInfo.index, 2);
    const capped = [];
    await scrape(normalizeInput({ titles: ['dev', 'ops'], maxItems: 3, companyProfile: false }), { fetchPage: network(pages), pushData: async (row) => capped.push(row) });
    assert.equal(capped.length, 3);
});

test('pagination uses the actual number of cards returned and stops on an empty page', async () => {
    const calls = [], rows = [];
    await scrape(normalizeInput({ titles: ['dev'], companyProfile: false }), { fetchPage: network({ 'dev:0': card('101') + card('102'), 'dev:2': card('103') }, { calls }), pushData: async (row) => rows.push(row) });
    assert.equal(rows.length, 3);
    const offsets = calls.filter((url) => url.includes('seeMore')).map((url) => new URL(url).searchParams.get('start'));
    assert.deepEqual(offsets, ['0', '2', '3']);
    assert.equal(rows[2].scrapingInfo.page, 2);
    assert.equal(rows[2].scrapingInfo.rank, 3);
});

test('migration replays the current page without duplicate rows or exceeding per-search quota', async () => {
    const state = {}, rows = [];
    const fetchPage = network({ 'dev:0': card('101') + card('102') + card('103') });
    const input = normalizeInput({ titles: ['dev'], rows: 2, companyProfile: false });
    let stop = false;
    await scrape(input, { state, fetchPage, shouldStop: () => stop, pushData: async (row) => { rows.push(row); stop = true; } });
    assert.equal(state.positions['1'].start, 0);
    await scrape(input, { state, fetchPage, existingRows: [...rows], pushData: async (row) => rows.push(row) });
    assert.deepEqual(rows.map((r) => r.id), ['101', '102']);
});

test('stored rows reconcile a push made before a lost checkpoint', async () => {
    const rows = [];
    const input = normalizeInput({ titles: ['dev'], rows: 1, companyProfile: false });
    const fetchPage = network({ 'dev:0': card('101') + card('102') });
    await scrape(input, { fetchPage, existingRows: [{ id: '101', scrapingInfo: { searchId: '1' } }], pushData: async (row) => rows.push(row) });
    assert.equal(rows.length, 0);
});

test('detail failure saves a usable card, marks it partial, and records the request failure', async () => {
    const rows = [];
    const result = await scrape(normalizeInput({ titles: ['dev'], rows: 1, companyProfile: false }), { fetchPage: network({ 'dev:0': card('101') }, { failDetails: ['101'] }), pushData: async (row) => rows.push(row) });
    assert.equal(rows[0].detailsStatus, 'failed');
    assert.equal(rows[0].companyName, 'Example Nordic');
    assert.equal(rows[0].description, null);
    assert.equal(result.failures[0].kind, 'detail');
});

test('individual job URLs use the job ID rather than the internal search ID', async () => {
    const rows = [];
    await scrape(normalizeInput({ startUrls: ['https://www.linkedin.com/jobs/view/44556677'], companyProfile: false }), { fetchPage: network({}), pushData: async (row) => rows.push(row) });
    assert.equal(rows[0].id, '44556677');
    assert.equal(rows[0].title, 'Engineer 44556677');
});

test('company URLs resolve to numeric filters and profiles are fetched once per company', async () => {
    const calls = [], rows = [];
    await scrape(normalizeInput({ companyUrls: ['https://www.linkedin.com/company/example-nordic/'], titles: ['dev'], rows: 2 }), { fetchPage: network({ 'dev:0': card('101') + card('102') }, { calls }), pushData: async (row) => rows.push(row) });
    assert.equal(calls.filter((u) => u.includes('/company/')).length, 1);
    assert.ok(calls.some((u) => new URL(u).searchParams.get('f_C') === '123456'));
    assert.equal(rows[0].companyEmployeeCount, 240);
});

test('unresolved company filters fail without falling back to an unfiltered search', async () => {
    const calls = [];
    await assert.rejects(scrape(normalizeInput({ companyUrls: ['https://www.linkedin.com/company/missing/'] }), { fetchPage: async (url) => { calls.push(url); return '<h1>Sign in</h1>'; }, pushData: async () => {} }), /Could not resolve company ID/);
    assert.equal(calls.length, 1);
});

test('unexpected login HTML is a failed search, not a successful empty result', async () => {
    const result = await scrape(normalizeInput({ companyProfile: false }), { fetchPage: async () => `<html><h1>Sign in</h1>${' '.repeat(600)}</html>`, pushData: async () => assert.fail('No output expected') });
    assert.equal(result.failures.filter((f) => f.kind === 'search').length, 1);
});

test('storage write failure propagates and never advances the search', async () => {
    const state = {};
    await assert.rejects(scrape(normalizeInput({ titles: ['dev'], companyProfile: false }), { state, fetchPage: network({ 'dev:0': card('101') }), pushData: async () => { throw new Error('Storage offline'); } }), /Storage offline/);
    assert.equal(state.positions['1'].start, 0);
});

test('checkpoint failure stops the run and stored output reconciles on retry', async () => {
    const rows = [], state = {};
    const input = normalizeInput({ titles: ['dev'], rows: 1, companyProfile: false });
    const fetchPage = network({ 'dev:0': card('101') + card('102') });
    await assert.rejects(scrape(input, { state, fetchPage, pushData: async (row) => rows.push(row), checkpoint: async () => { throw new Error('Checkpoint offline'); } }), /Checkpoint offline/);
    assert.equal(rows.length, 1);
    await scrape(input, { state, fetchPage, existingRows: [...rows], pushData: async (row) => rows.push(row) });
    assert.equal(rows.length, 1);
});

test('a resumed run preserves failure records attached to already delivered rows', async () => {
    const rows = [], state = {};
    const input = normalizeInput({ titles: ['dev'], rows: 1, companyProfile: false });
    const fetchPage = network({ 'dev:0': card('101') }, { failDetails: ['101'] });
    await scrape(input, { state, fetchPage, pushData: async (row) => rows.push(row) });
    const result = await scrape(input, { state, fetchPage, existingRows: rows, pushData: async () => assert.fail('No duplicate writes') });
    assert.equal(result.failures[0].kind, 'detail');
});
