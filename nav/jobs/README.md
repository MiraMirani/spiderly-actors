[![Spiderly NAV Arbeidsplassen Jobs Scraper](https://raw.githubusercontent.com/MiraMirani/spiderly-actors/732476cc05276e0c13a0f17f5ed18292dfd2746d/assets/banners/nav-jobs.png)](https://apify.com/spiderly/nav-arbeidsplassen-job-scraper-fast-multi-keyword)

# NAV Arbeidsplassen Job Scraper - Fast, Multi-Keyword

<!-- actor-cover:start -->
<img src="https://raw.githubusercontent.com/MiraMirani/spiderly-actors/509b9791aaaf9222ecacb92759f1fde194c9d49e/assets/icons/spiderly-large/nav.png" alt="NAV Arbeidsplassen Job Scraper - Fast, Multi-Keyword — Spiderly" width="128" height="128">
<!-- actor-cover:end -->

Scrapes job ads from [arbeidsplassen.nav.no](https://arbeidsplassen.nav.no/stillinger), Norway's official public job board (NAV). Fast, no browser: it reads NAV's own search data and the ad pages.

## What you get

- **Multiple keywords in one run** - duplicates between keywords are removed
- **Filters** - county, municipality, occupation category, engagement type, full/part-time, sector, home office, education, experience, work language, driver's licence, published date, quick apply, summer jobs, under 18
- **Rich data per job** - title, employer, city/municipality/county, address, published and expiry dates, application deadline, occupation, categories, work languages, education and experience requirements
- **NAV AI fields** - short summary, search tags and competences
- **Full ad details (optional)** - full description (text and HTML), engagement type, job percentage, position count, start date, work days/hours, application link or email, employer homepage, organisation details

## Input

| Field | Description |
|---|---|
| `keywords` / `keyword` | Search terms. Leave empty to list all jobs. |
| `counties`, `municipalities` | Location filters. Municipality format: `ROGALAND.HAUGESUND`. |
| `occupations`, `engagementTypes`, `extents`, `sector`, `remote`, `education`, `experience`, `workLanguages`, `needDriversLicense` | Category filters. |
| `publishedWithin` | `now/d` (today), `now-3d`, `now-7d`. |
| `sortBy` | `published` (default), `relevant`, `expires`. |
| `maxResults` | Total jobs to save (0 = all). Default 100. |
| `includeDetails` | Fetch full ad details. Default on. Turn off for the fastest listing. |

## Example output (shortened)

```json
{
  "id": "aed44969-da81-4659-b2a8-4ef3566fbe1e",
  "url": "https://arbeidsplassen.nav.no/stillinger/stilling/aed44969-da81-4659-b2a8-4ef3566fbe1e",
  "title": "Backend utvikler",
  "employer": "Statsbygg",
  "city": "OSLO",
  "county": "OSLO",
  "published": "2026-11-04T00:00:00+01:00",
  "applicationDue": "2026-11-22T00:00:00",
  "engagementType": "Fast",
  "searchTags": ["Azure", "C#", "DevOps"],
  "shortSummary": "...",
  "description": "..."
}
```

## Notes

- NAV limits any single search to its first 10,000 results; use filters or several keywords to go deeper.
- The Actor paces its requests and retries politely when NAV asks it to slow down.
- Job ads are public data published by NAV. If you store personal data from ads (for example contact persons), you are responsible for handling it in line with GDPR.
