# Spiderly Actors

All Apify Actors published under the **Spiderly** account, in one repository.

Layout: `site/type/version`

| Folder | Actor |
|---|---|
| `finn/jobs/details` | Finn.no Job Scraper (v1, Cheerio, full detail pages) |
| `finn/jobs/fast` | Finn.no Job Scraper - Fast, Multi-Keyword (v2) |
| `linkedin/jobs` | LinkedIn Jobs Scraper - Fast, Multi-Keyword |
| `nav/jobs` | NAV Arbeidsplassen Job Scraper - Fast, Multi-Keyword |
| `jobbnorge/jobs` | Jobbnorge scraper (in progress) |

Each folder is a self-contained Actor (`.actor/`, `Dockerfile`, `package.json`, `src/`, `test/`).
Run tests inside a folder with `npm test`; deploy with `apify push` from that folder.
