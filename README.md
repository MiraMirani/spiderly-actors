# Spiderly Actors

All Apify Actors published under the **Spiderly** account, in one repository.

Layout: `site/type/version`

| Folder | Actor |
|---|---|
| `finn/jobs/details` | Finn.no Job Scraper (v1, Cheerio, full detail pages) |
| `finn/jobs/fast` | Finn.no Job Scraper - Fast, Multi-Keyword (v2) |
| `linkedin/jobs` | LinkedIn Jobs Scraper - Fast, Multi-Keyword |
| `nav/jobs` | NAV Arbeidsplassen Job Scraper - Fast, Multi-Keyword |
| `jobbnorge/jobs` | Jobbnorge Job Scraper - Fast, Multi-Keyword |

Each folder is a self-contained Actor (`.actor/`, `Dockerfile`, `package.json`, `src/`, `test/`).
Run tests inside a folder with `npm test`; deploy with `apify push` from that folder.

## Actor icons

Each Actor uses a compact icon for its source platform. Both FINN versions share the FINN icon; LinkedIn, NAV and Jobbnorge have their own. The PNG files are 512 × 512 and their editable SVGs live in `assets/icons/`. The Spiderly mascot remains available for account branding.

`assets/actor-media.json` maps each site folder to its icon. Future Actors under the same site inherit that icon. New sites use the purple briefcase fallback until a dedicated icon is added. An entry under `actors` can override one Actor by name.

After adding an Actor or changing its icon, run:

```sh
node scripts/actor-images.mjs --apply
node scripts/actor-images.mjs --check
```

The helper inserts a small icon into every Actor README; CI detects missing or outdated icons. `node scripts/actor-images.mjs --list` shows the PNG and image URL for each Actor. If a new image is added, commit it first and set `assetRevision` to that full commit SHA before refreshing READMEs.

README images and Apify avatars are separate. Upload the selected PNG in Apify Console under **Publishing → Display information → Icon**, then save. This only updates the Actor's image and does not require publishing or rebuilding the Actor.
