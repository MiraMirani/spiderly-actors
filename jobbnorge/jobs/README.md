[![Spiderly Jobbnorge Jobs Scraper](https://raw.githubusercontent.com/MiraMirani/spiderly-actors/732476cc05276e0c13a0f17f5ed18292dfd2746d/assets/banners/jobbnorge-jobs.png)](https://apify.com/spiderly/jobbnorge-job-scraper-fast-multi-keyword)

# Jobbnorge Job Scraper - Fast, Multi-Keyword

<!-- actor-cover:start -->
<img src="https://raw.githubusercontent.com/MiraMirani/spiderly-actors/509b9791aaaf9222ecacb92759f1fde194c9d49e/assets/icons/spiderly-large/jobbnorge-stacked.png" alt="Jobbnorge Job Scraper - Fast, Multi-Keyword — Spiderly" width="128" height="128">
<!-- actor-cover:end -->

Scrapes [jobbnorge.no](https://www.jobbnorge.no) (academic, research and public-sector jobs in Norway) through the site's own public JSON endpoints. No browser, very fast, cheap.

## Features
- Multiple keywords in one run (e.g. `phd`, `stipendiat`, `doktorgrad`, `research fellow`), merged and de-duplicated
- Filters: county, municipality, employer, category, posted within last week/day, max age in days
- Optional full ad text (sections, plain text and HTML), reference number, contacts, apply link
- Norwegian or English listing language
- Start URLs: Jobbnorge search URLs or single ad URLs

## Example input
```json
{
  "searchQueries": ["phd", "stipendiat"],
  "period": "Week",
  "maxResults": 100,
  "includeDetails": true
}
```

## Output (per job)
`id, url, title, employer, employerId, department, location, municipality, county, zipCode, address, locations[], published, deadline, deadlineRaw, jobScope, jobDuration, positionCount, jobType, jobTypeGroup, summary, logo, source, scrapedAt`

With `includeDetails`: `reference, deadlineFromAd, employerWebsite, workPlaces[], contacts[], applyUrl, adLanguage, sections[], description, descriptionHtml`.

`deadline` is ISO (`YYYY-MM-DD`); it is `null` for "Continuously" ads (see `deadlineRaw`).

## Notes
- Data comes from publicly available job ads. Ads can contain contact persons' names and details: use them in line with GDPR.
- Run tests: `npm test`.
