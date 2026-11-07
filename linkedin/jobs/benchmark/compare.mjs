import fs from 'node:fs';

const [ownPath, referencePath, reportPath] = process.argv.slice(2);
if (!ownPath || !referencePath || !reportPath) throw new Error('Usage: node compare.mjs spiderly.json bebity.json report.json');
const own = JSON.parse(fs.readFileSync(ownPath, 'utf8'));
const reference = JSON.parse(fs.readFileSync(referencePath, 'utf8'));
const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
const norm = (value) => String(value ?? '').normalize('NFKC').replace(/\s+/g, ' ').trim();
const withoutBullets = (value) => norm(String(value ?? '').replace(/^[\t ]*[*•-][\t ]+/gm, ''));
const descriptionsAgree = (a, b) => norm(a) === norm(b) || norm(a) === withoutBullets(b) || withoutBullets(a) === norm(b);
// Directly observed non-LinkedIn URLs, not a promise that the destination is a working form.
const external = (value) => {
    try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) && url.hostname !== 'linkedin.com' && !url.hostname.endsWith('.linkedin.com'); }
    catch { return false; }
};
const matched = own.filter((row) => reference.some((other) => String(other.id) === String(row.id)));
const counts = (rows) => ({ jobs: rows.length, parsedSalary: rows.filter((row) => row.salaryMin != null).length,
    recruiter: rows.filter((row) => row.posterFullName).length,
    nonLinkedInApplyUrls: rows.filter((row) => external(row.applyUrl)).length,
    emails: rows.filter((row) => row.contactEmails?.length).length, phones: rows.filter((row) => row.contactPhones?.length).length });
report.spiderly = { ...report.spiderly, ...counts(own) };
report.bebity = { ...report.bebity, ...counts(reference) };
report.perJob = matched.map((row) => {
    const other = reference.find((item) => String(item.id) === String(row.id));
    return { id: row.id, titleSame: norm(row.title) === norm(other.title), companySame: norm(row.company) === norm(other.companyName),
        locationSame: norm(row.location) === norm(other.location), applicantsSame: norm(row.applicants) === norm(other.applicationsCount),
        descriptionExactNormalized: norm(row.description) === norm(other.description), descriptionTextSame: descriptionsAgree(row.description, other.description),
        employmentTypeSame: norm(row.employmentType) === norm(other.contractType), senioritySame: norm(row.seniorityLevel) === norm(other.experienceLevel),
        applyTypeSame: row.applyType === other.applyType, spiderlyExternal: external(row.applyUrl), bebityExternal: external(other.applyUrl),
        emailCount: row.contactEmails?.length ?? 0, phoneCount: row.contactPhones?.length ?? 0 };
});
report.overlap = matched.length;
report.agreements = Object.fromEntries(Object.keys(report.perJob[0] ?? {}).filter((key) => key.endsWith('Same') || key === 'descriptionExactNormalized')
    .map((key) => [key, report.perJob.filter((row) => row[key]).length]));
report.descriptionNormalization = 'Unicode NFKC and whitespace; when not already equal, ignore line-leading list bullets in either source.';
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
process.stdout.write(JSON.stringify({ overlap: report.overlap, spiderly: report.spiderly, bebity: report.bebity, agreements: report.agreements }, null, 2) + '\n');
