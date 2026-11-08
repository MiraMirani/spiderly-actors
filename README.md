# Spiderly Actors

The **Spiderly** Apify Actor source lives in this repository. Use `main` for the complete project. Each Actor has its own folder.

| Folder | Actor |
|---|---|
| `finn/jobs/details` | Finn.no Job Scraper (v1, Cheerio, full detail pages) |
| `finn/jobs/fast` | Finn.no Job Scraper - Fast, Multi-Keyword (v2) |
| `linkedin/jobs` | LinkedIn Jobs Scraper - Fast, Multi-Keyword |
| `linkedin/jobs/details` | LinkedIn Jobs Scraper - Detailed Jobs & Companies |
| `linkedin/companies` | LinkedIn Companies Scraper - Bulk Company Profiles |
| `nav/jobs` | NAV Arbeidsplassen Job Scraper - Fast, Multi-Keyword |
| `jobbnorge/jobs` | Jobbnorge Job Scraper - Fast, Multi-Keyword |
| `web-traffic-generator` | Web Traffic Generator for Website Testing |
| `glassdoor-jobs-scraper` | Glassdoor Jobs Scraper |
| `google-play-scraper` | Google Play App Details Scraper |
| `apple-app-store-scraper` | Apple App Store Lookup |

Each folder is a self-contained Actor (`.actor/`, `Dockerfile`, `package.json`, `src/`, `test/`).
Run tests inside a folder with `npm test`; deploy with `apify push` from that folder.

## Actor icons

Each Actor uses its platform mark together with the larger, complete Spiderly mascot and its visible legs. Both FINN versions share the FINN + Spiderly icon; LinkedIn, NAV and Jobbnorge have their own. The upload-ready PNG files are 512 × 512 and live in `assets/icons/spiderly-large/`. The original mascot, plain platform icons and previous compositions remain available separately.

`assets/actor-media.json` maps each site folder to its icon. Future Actors under the same site inherit that icon. New sites use the general-jobs version with a briefcase and the same larger Spiderly mascot until a dedicated icon is added. An entry under `actors` can override one Actor by name.

After adding an Actor or changing its icon, run:

```sh
node scripts/actor-images.mjs --apply
node scripts/actor-images.mjs --check
```

The helper preserves existing branded README banners and inserts a small icon when a banner is absent. CI checks the README images and icon files. `node scripts/actor-images.mjs --list` shows the PNG and image URL for each Actor. If a new image is added, commit it first and set `assetRevision` to that full commit SHA before refreshing READMEs.

README images and Apify avatars are separate. Upload the selected PNG in Apify Console under **Publishing → Display information → Icon**, then save. This only updates the Actor's image and does not require publishing or rebuilding the Actor.
