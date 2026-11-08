# LinkedIn Jobs Scraper — Detailed Jobs & Companies

<!-- actor-cover:start -->
<img src="https://raw.githubusercontent.com/MiraMirani/spiderly-actors/33eb5bcb56cf2a23d0b9b9f9c415a499279d0751/assets/icons/spiderly-large/linkedin.png" alt="LinkedIn Jobs Scraper — Detailed Jobs &amp; Companies | Spiderly — Spiderly" width="128" height="128">
<!-- actor-cover:end -->

Collect public LinkedIn job listings, their descriptions and optional employer profiles. Search several job titles across several locations, or provide search, job and company URLs. Results are deduplicated across the run and can be exported from Apify as JSON, CSV or Excel.

This is a separate Spiderly Actor. The existing `linkedin/jobs` fast Actor keeps its existing inputs and output format.

## Quick start

```json
{
  "titles": ["software engineer", "data engineer"],
  "locations": ["Oslo", "Bergen"],
  "publishedAt": "r604800",
  "workTypes": ["2", "3"],
  "rows": 25,
  "maxItems": 100,
  "companyProfile": true,
  "proxyConfiguration": {
    "useApifyProxy": true,
    "apifyProxyGroups": ["RESIDENTIAL"]
  }
}
```

`rows` limits each title/location pair; `maxItems` limits the entire run. The default global limit is 100. Set `rows` to 0 to continue each search until its page limit, the end of public results, or the global cap. Every job is returned only once, so a job found by several searches belongs to the first search that delivers it.

Alternatively, pass `startUrls` containing LinkedIn `/jobs/search/`, `/jobs/view/{id}` or `/company/{slug}/` URLs. String entries and `{ "url": "..." }` entries both work. These URLs take precedence over structured search filters. `maxRowsPerUrl` sets their individual limits. Company URLs require a publicly discoverable company ID; supplying a numeric `/company/{id}/` URL avoids that lookup.

## Filters

- `workTypes`: `1` on-site, `2` remote, `3` hybrid.
- `contractTypes`: `F` full-time, `P` part-time, `C` contract, `T` temporary, `I` internship, `V` volunteer, `O` other.
- `experienceLevels`: `1` internship through `6` executive.
- `publishedAt`: empty, `r86400`, `r604800` or `r2592000`.
- `industry`: numeric industry codes, or preserve your chosen filter by pasting a search URL.
- `companyId` and `companyUrls`: company filters passed to LinkedIn.
- `companyName`: exact company-name matching after listing retrieval, ignoring case.
- `easyApply`, `under10Applicants` and `sortBy`: public LinkedIn search filters.

Readable API values such as `remote`, `full-time` and `mid-senior` also work. The singular `title`, `location`, `workType`, `contractType` and `experienceLevel` aliases are accepted. The input form documents every setting.

## Output

Each dataset row includes `id`, `title`, `jobUrl`, `companyName`, `companyUrl`, `companyId`, `companyLogo`, `location`, `publishedAt` and `postedTime` where available. Job details add `contractType`, `experienceLevel`, `jobFunction`, `sector`, `applicationsCount`, `description`, `descriptionHtml`, `applyType`, `applyUrl`, `benefits` and salary fields: `salary`, `salaryMin`, `salaryMax`, `salaryCurrency`, `salaryPeriod`.

Recruiter name and profile URL are included if shown. `enrichCompany: true` also exposes published recruiter headline/photo and structured job signals. `companyProfile: true` adds the employer's public website, description, tagline, industry, employee count/range, follower count, headquarters, company type, founding year and specialties. A company-size range is never converted to an exact employee count.

`scrapingInfo` identifies the source search, query, location, page, index and rank. Missing data is `null`. `detailsStatus` is `ok` or `failed`; `companyProfileStatus` is `ok`, `failed` or `skipped`. A listing can still be delivered if its detail page fails.

The run also stores `SEARCH_TOTALS`, `FAILED_REQUESTS` and `RUN_SUMMARY` in its default key-value store. Counts such as “1,000+” are marked as lower bounds. Missing counts are `null`. A failed search makes the run fail visibly while preserving collected rows.

## Limits and availability

This implementation reads public pages without a LinkedIn account. LinkedIn can limit requests or hide details, employer pages and recruiter information. Proxies may improve availability but do not guarantee access. Search filters are forwarded to LinkedIn; their behavior is controlled by LinkedIn. No premium endpoint or guaranteed signal coverage is claimed.

Public search pagination is bounded at 1,000 positions and `maxPages` (default 100). Requests run sequentially with a configurable delay and bounded retries. This favors predictable limits over maximum throughput. Prices are not configured by this repository; the owner chooses monetization in Apify.

Run state and dataset IDs are reconciled after restart or migration to avoid writing delivered jobs again. Company profiles are cached within one process. Use fresh local storage when changing input.

## Develop and deploy

Use Node.js 22 or later. From this folder:

```sh
npm ci
npm test
npm run test:live
apify push
```

The live test contacts LinkedIn and collects two jobs; ordinary tests use local fixtures. To select a local input, create `storage/key_value_stores/default/INPUT.json` and run `npm start`. The Docker build installs locked dependencies with `npm ci`.

For GitHub deployment, select this repository and set the Actor source directory to `linkedin/jobs/details`. Its Apify name is `linkedin-jobs-scraper-details`. After deploying, upload the cover in Console; the repository's `scripts/actor-images.mjs --list` command shows its file and URL. A README image does not itself change the store avatar.

Spiderly is independent of LinkedIn. LinkedIn is named only to describe the source supported by this Actor.
