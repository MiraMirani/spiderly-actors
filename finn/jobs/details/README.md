# Finn.no Job Scraper v1

<!-- actor-cover:start -->
<img src="https://raw.githubusercontent.com/MiraMirani/spiderly-actors/33eb5bcb56cf2a23d0b9b9f9c415a499279d0751/assets/icons/spiderly-large/finn.png" alt="Finn.no Job Scraper — Spiderly" width="128" height="128">
<!-- actor-cover:end -->

Scrape job ads from **Finn.no**, Norway's largest job board, by keyword, location or search URL. Get titles, employers, locations, deadlines and full descriptions as JSON, CSV or Excel.

This is **v1**, the original single-keyword version. Need several keywords in one run, HTML descriptions, coordinates and much faster runs? Use **Finn.no Job Scraper v2** from the same developer.

## v1 or v2? What is the difference?

Both versions scrape the same Finn.no job ads and cost the same: **$0.50 per 1,000 jobs**. Pick the one that fits.

| | **v1** (original) | **v2** (recommended) |
|---|---|---|
| Keywords | One keyword per run | **Several keywords per run**, duplicates removed |
| Speed, 200 jobs with full descriptions | about 5 minutes | **about 16 seconds** |
| Description | Plain text | Plain text **and HTML** |
| Coordinates (latitude, longitude) | No | **Yes** |
| Search rank of each job | No | **Yes** |
| Default memory | 512 MB | 4 GB (faster, same per-result price) |
| Location by name, Finn search URLs, employer website, deadline, employment type | Yes | Yes |

**Choose v2** for almost everything: it is faster, handles several keywords and returns more fields. **Choose v1** only if you already use it and want the output and behaviour to stay exactly as they are.

## What can v1 do?

| 📦 What you can extract | ⚙️ Features |
|---|---|
| 💼 Job title, employer, employer website | 🔎 Search by keyword |
| 📍 Location and all work locations | 🗺️ Location by **name** (Rogaland, Haugesund, Oslo…) or Finn code |
| 📅 Published date and application deadline | 🔗 Or paste any **Finn search URL** with your own filters |
| 🧾 Employment type | 📄 Optional full ad details (description, deadline, type) |
| 📝 Full description (plain text) | ⬇️ Export to JSON, CSV, Excel, XML; API, webhooks, schedules |

## How much will it cost?

Pay per result: **$0.50 per 1,000 jobs** ($0.0005 per job) plus a tiny start fee of $0.00005 per GB of memory.

## Speed

- **Basic listing** (`includeDetails` off): about 16 seconds for 200 jobs.
- **With full details** (default): every ad page is opened, so 200 jobs take several minutes. For faster detail runs use v2.

## How do I use it?

1. Create a free Apify account and open the Actor.
2. Enter a **keyword** (for example `utvikler`) and optionally a **location** such as `Rogaland`.
3. Set **Maximum number of jobs** and click **Start**.
4. Download the dataset as JSON, CSV, Excel or XML, or read it through the API.

## Input

| Field | Type | What it does |
|---|---|---|
| `keyword` | text | Search text. |
| `location` | text | County or municipality name, or a Finn code like `1.20001.20012`. |
| `startUrls` | list of URLs | Any Finn job search URL. If set, keyword and location are ignored. |
| `maxJobs` | number | Total jobs to save (default 50, up to 5000). |
| `maxPages` | number | Safety limit on result pages. |
| `includeDetails` | true/false | Adds description, employer website, employment type and exact deadline. |
| `proxyConfiguration` | object | Optional. Works without a proxy. |

**Example input**

```json
{ "keyword": "utvikler", "location": "Rogaland", "maxJobs": 100, "includeDetails": true }
```

## Output

```json
{
  "id": "478710684",
  "url": "https://www.finn.no/job/ad/478710684",
  "title": "Software Developer",
  "company": "SmartDok AS",
  "companyUrl": "https://smartdok.no/",
  "location": "Oslo - Ullern",
  "allLocations": ["Tromsø", "Oslo", "Alta"],
  "published": "2026-10-14T11:14:23.000Z",
  "deadline": "2026-11-06",
  "employmentType": "FULL_TIME",
  "positions": 1,
  "description": "Vi søker en erfaren og teknisk sterk seniorutvikler ...",
  "logo": "https://images.finncdn.no/dynamic/default/item/478710684/...",
  "searchUrl": "https://www.finn.no/job/search?q=utvikler&location=1.20001.20061",
  "scrapedAt": "2026-11-01T10:51:38.100Z"
}
```

Some fields are empty when the employer did not provide them (for example `deadline`).

## FAQ

**Is it legal to scrape Finn.no?**
The Actor collects publicly visible job ads only. Public data can still contain personal data, so make sure you have a legitimate reason, follow GDPR, and respect Finn.no's terms of use.

**Can I search several keywords at once?**
Not in v1. Add one Start URL per keyword, or use v2.

**Do I need a proxy?**
Not normally. Enable Apify Proxy only if Finn starts blocking requests.

**Something is wrong or missing.**
Open an issue on the Actor's Issues tab with a link to the failing run.

## Disclaimer

This Actor is not affiliated with or endorsed by FINN.no.
