import assert from 'node:assert/strict';
import { normalizeInput } from '../src/input.js';
import { createFetcher } from '../src/http.js';
import { scrape } from '../src/scraper.js';

// Deliberately opt-in: this test contacts LinkedIn and is excluded from CI.
const rows = [];
const result = await scrape(normalizeInput({ titles: ['software engineer'], locations: ['Oslo'], rows: 2, maxItems: 2, companyProfile: false }), {
    fetchPage: createFetcher({ maxRetries: 1 }), pushData: async (row) => rows.push(row), warn: console.warn,
});
assert.equal(rows.length, 2, JSON.stringify(result.failures));
assert.equal(new Set(rows.map((row) => row.id)).size, rows.length);
assert.ok(rows.every((row) => row.detailsStatus === 'ok' && row.description?.length > 20));
console.log(JSON.stringify({ items: rows.length, jobs: rows.map(({ id, title, companyName, detailsStatus }) => ({ id, title, companyName, detailsStatus })), searchTotals: result.searchTotals }, null, 2));
