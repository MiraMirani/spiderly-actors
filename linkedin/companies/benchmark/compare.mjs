import fs from 'node:fs';

// Compare downloaded datasets without contacting either service or exposing credentials.
const options = Object.fromEntries(process.argv.slice(2).reduce((pairs, value, index, args) => {
    if (index % 2 === 0) pairs.push([value.replace(/^--/, ''), args[index + 1]]);
    return pairs;
}, []));
for (const key of ['spiderly', 'reference', 'manifest', 'out']) {
    if (!options[key]) throw new Error(`Missing --${key} path`);
}
const read = (path) => JSON.parse(fs.readFileSync(path, 'utf8'));
const spiderly = read(options.spiderly);
const reference = read(options.reference);
const manifest = read(options.manifest);
if (![spiderly, reference].every((rows) => Array.isArray(rows) && rows.every((row) => row && typeof row === 'object'))) throw new Error('Datasets must be arrays of objects.');
const present = (value) => value !== null && value !== undefined && value !== ''
    && (!Array.isArray(value) || value.length > 0)
    && (typeof value !== 'object' || Object.values(value).some((v) => v !== null && v !== ''));
const fields = ['companyId', 'name', 'description', 'tagline', 'websiteUrl', 'industry', 'industryId', 'employeeCount', 'employeeCountRange', 'followersCount', 'foundedYear', 'headquarter', 'locations', 'specialities', 'logoUrl', 'coverImageUrl', 'phone', 'jobSearchUrl'];
const summarize = (rows) => {
    const found = rows.filter((row) => row.status === 'FOUND' && present(row.name));
    return {
        rowCount: rows.length,
        foundProfiles: found.length,
        statusCounts: rows.reduce((counts, row) => ({ ...counts, [row.status ?? 'UNKNOWN']: (counts[row.status ?? 'UNKNOWN'] ?? 0) + 1 }), {}),
        populatedFields: Object.fromEntries(fields.map((field) => [field, found.filter((row) => present(row[field])).length])),
        companies: rows.map((row) => ({ input: row.input, status: row.status, reason: row.reason ?? null,
            ...(row.status === 'FOUND' ? { name: row.name, companyId: row.companyId, industry: row.industry,
                websiteUrl: row.websiteUrl, employeeCount: row.employeeCount, employeeCountRange: row.employeeCountRange,
                followersCount: row.followersCount, foundedYear: row.foundedYear, locationsCount: row.locations?.length ?? 0 } : {}),
        })),
    };
};
const left = summarize(spiderly);
const right = summarize(reference);
const comparablePairs = left.companies.filter((company) => company.status === 'FOUND'
    && right.companies.some((other) => other.input === company.input && other.status === 'FOUND')).length;
const summary = {
    testedAt: manifest.testedAt, inputUrls: manifest.companyUrls,
    spiderly: { ...left, runId: manifest.spiderly.runId, runTimeSecs: manifest.spiderly.stats?.runTimeSecs, computeUnits: manifest.spiderly.stats?.computeUnits, costUsd: manifest.spiderly.costUsd, costDisplayUsd: manifest.spiderly.costDisplayUsd, costUpperBoundUsd: manifest.spiderly.costUpperBoundUsd, costSource: manifest.spiderly.costSource },
    bebity: { ...right, runId: manifest.bebity.runId, runTimeSecs: manifest.bebity.stats?.runTimeSecs, computeUnits: manifest.bebity.stats?.computeUnits, costUsd: manifest.bebity.costUsd, costSource: manifest.bebity.costSource },
    comparableProfiles: comparablePairs,
    interpretation: comparablePairs === 0 ? 'No successful reference profiles are available for field-level accuracy or feature-parity comparison.' : 'Inspect matched company fields; numeric values can change between requests.',
    limitations: manifest.caveats,
};
fs.writeFileSync(options.out, `${JSON.stringify(summary, null, 2)}\n`);
process.stdout.write(`${left.foundProfiles}/${manifest.companyUrls.length} Spiderly profiles; ${right.foundProfiles}/${manifest.companyUrls.length} reference profiles; ${comparablePairs} comparable pairs.\n`);
