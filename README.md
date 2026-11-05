# Spiderly Actors

All Apify Actors published under the **Spiderly** account, in one repository.

Layout: `site/type/version`

| Folder | Actor |
|---|---|
| `finn/jobs/details` | Finn.no Job Scraper (v1, Cheerio, full detail pages) |
| `finn/jobs/fast` | Finn.no Job Scraper - Fast, Multi-Keyword (v2) |
| `linkedin/jobs` | LinkedIn Jobs Scraper - Fast, Multi-Keyword |
| `linkedin/jobs/details` | LinkedIn Jobs Scraper — Detailed Jobs & Companies |
| `nav/jobs` | NAV Arbeidsplassen Job Scraper - Fast, Multi-Keyword |
| `jobbnorge/jobs` | Jobbnorge Job Scraper - Fast, Multi-Keyword |

Each folder is a self-contained Actor (`.actor/`, `Dockerfile`, `package.json`, `src/`, `test/`).
Run tests inside a folder with `npm test`; deploy with `apify push` from that folder.

## Actor images

Every Actor README includes an image. `assets/actor-media.json` selects a dedicated cover by Actor name, with `assets/spiderly-icon.png` as the default for future Actors. LinkedIn Actors use the original cover in `assets/actors/linkedin-jobs.png`.

After creating an Actor or changing its title or image, run:

```sh
node scripts/actor-images.mjs --apply
node scripts/actor-images.mjs --check
```

CI discovers Actor folders and checks their README images, including new folders. To use a new image, commit it first, update `assetRevision` to the full commit SHA containing it, and add its Actor-name override. The immutable GitHub image URLs survive branch renames.

`node scripts/actor-images.mjs --list` lists the cover files and URLs for upload in Apify Console. README covers and store avatars are separate: upload the selected image in each Actor's publication settings. Deploying source does not automatically update an existing Actor's avatar.
