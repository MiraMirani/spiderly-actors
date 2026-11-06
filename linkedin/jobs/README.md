# LinkedIn Jobs Scraper - Fast, Multi-Keyword

<!-- actor-cover:start -->
<img src="https://raw.githubusercontent.com/MiraMirani/spiderly-actors/509b9791aaaf9222ecacb92759f1fde194c9d49e/assets/icons/spiderly-large/linkedin.png" alt="LinkedIn Jobs Scraper - Fast, Multi-Keyword — Spiderly" width="128" height="128">
<!-- actor-cover:end -->

Scrape **public LinkedIn job listings** by keyword, location and filters, with no login and no cookies. Search several keywords and several locations in one run, filter by date, job type, seniority, remote/hybrid and more, and get full descriptions, applicant counts, company IDs and apply links as clean JSON, CSV or Excel.

Built on plain HTTP (no browser), so it is light and fast.

## What can LinkedIn Jobs Scraper do?

| 📦 What you can extract | ⚙️ Features |
|---|---|
| 💼 Job title, company, company page and ID | 🔎 **Multiple keywords x multiple locations** in one run, duplicates removed |
| 📍 Location, posted date, posted-ago text | 🗓️ Filter by **date posted** (24 h, week, month) |
| 🧾 Employment type, seniority level, job function, industries | 🏷️ Filter by **job type**, **experience level**, **on-site / remote / hybrid** |
| 👥 Applicant count (when LinkedIn shows it) | ⚡ **Easy Apply** and **under 10 applicants** switches |
| 📝 Full description as **plain text and HTML** | 🎯 **Title include / exclude**, company name, company ID, skip job IDs |
| 🔗 Apply type (Easy Apply or external), direct apply link when available, logo | 🔗 Paste normal **LinkedIn search URLs** and reuse their filters |
| 🧮 Search rank, search keyword and location per job | ⬇️ Export to JSON, CSV, Excel, XML; API, webhooks, schedules |

Use it for market research, salary and skills trends, competitor hiring tracking, recruitment and B2B lead generation, or to feed your own job board.

## How do I use it?

1. Create a free Apify account and open the Actor.
2. Add **keywords** (for example `software engineer`, `data analyst`) and **locations** (for example `Norway`, `Oslo`).
3. Optionally pick filters: date posted, job type, experience level, workplace type.
4. Set **Maximum number of jobs** and keep **Apify Proxy** enabled.
5. Click **Start**, then download the dataset or read it through the API.

## Input

| Field | Type | What it does |
|---|---|---|
| `keywords` / `keyword` | list / text | Search terms. Each is searched separately. |
| `locations` / `location` | list / text | Places to search, such as `Norway` or `Oslo`. Combined with every keyword. |
| `geoId` | text | Exact LinkedIn location ID for precise targeting. |
| `datePosted` | choice | `any`, `r86400` (24 h), `r604800` (week), `r2592000` (month). |
| `jobType` | list | `fulltime`, `parttime`, `contract`, `temporary`, `internship`, `volunteer`, `other`. |
| `experienceLevel` | list | `internship`, `entry`, `associate`, `mid-senior`, `director`, `executive`. |
| `workType` | list | `onsite`, `remote`, `hybrid`. |
| `easyApply`, `under10Applicants` | true/false | Only Easy Apply jobs / only jobs with fewer than 10 applicants. |
| `companyId` | list | Exact company filter applied by LinkedIn. |
| `companyName` | list | Keep jobs whose company name contains any of these (applied after scraping). |
| `titleInclude`, `titleExclude` | list | Keep or drop jobs by title words (all words of one phrase must match, any order). |
| `skipJobId` | list | Job IDs to leave out, e.g. ones from a previous run. |
| `sortBy` | choice | `relevance` or `recent`. |
| `limit` | number | Total jobs to save (default 100, up to 5000). |
| `includeDetails` | true/false | Full description, seniority, industries, applicants, company ID, apply link. |
| `startUrls` | list of URLs | Normal LinkedIn job search URLs; their filters are reused. |
| `urlParam` | list | Advanced `key=value` parameters. |
| `maxRequestsPerMinute` | number | Speed limit to avoid blocking (default 240). |
| `proxyConfiguration` | object | Apify Proxy settings. Residential is recommended. |

**Example input**

```json
{
  "keywords": ["software engineer", "data engineer"],
  "locations": ["Norway", "Sweden"],
  "datePosted": "r604800",
  "jobType": ["fulltime"],
  "workType": ["remote", "hybrid"],
  "limit": 200,
  "proxyConfiguration": { "useApifyProxy": true, "apifyProxyGroups": ["RESIDENTIAL"] }
}
```

## Output

Every job is one dataset item. Example (shortened, illustrative):

```json
{
  "id": "4400000001",
  "url": "https://www.linkedin.com/jobs/view/4400000001",
  "title": "Backend Developer",
  "company": "ACME AS",
  "companyUrl": "https://no.linkedin.com/company/acme",
  "companyId": "12345678",
  "location": "Oslo, Norway",
  "postedDate": "2026-10-26",
  "postedAgo": "6 days ago",
  "applicants": "Be among the first 25 applicants",
  "employmentType": "Full-time",
  "seniorityLevel": "Mid-Senior level",
  "jobFunction": "Engineering and Information Technology",
  "industries": "IT Services and IT Consulting",
  "salary": "",
  "applyType": "EASY_APPLY",
  "applyUrl": "",
  "description": "We are looking for ...",
  "descriptionHtml": "<p>We are looking for ...</p>",
  "companyLogo": "https://media.licdn.com/...",
  "rank": 1,
  "searchKeywords": "backend developer",
  "searchLocation": "Norway",
  "scrapedAt": "2026-11-01T12:00:00.000Z"
}
```

Fields LinkedIn does not show publicly for a job (for example salary, apply link or job function) are empty.

## Tips

- **Use a proxy.** LinkedIn limits how fast one IP address can read pages. The Actor slows down and retries on its own, but residential Apify Proxy keeps runs fast and reliable.
- **About 1,000 results per search.** LinkedIn stops after roughly 1,000 results for one search. For more, add keywords, locations or filters.
- **Fresh jobs only:** schedule the Actor daily with `datePosted: r86400` and pass old IDs in `skipJobId`.
- **Exact company:** use `companyId` (LinkedIn applies it) instead of `companyName` (applied after scraping) when you can.

## FAQ

**Do I need a LinkedIn account or cookies?**
No. The Actor reads only the public, logged-out job pages.

**Is it legal to scrape LinkedIn?**
The Actor reads publicly visible job listings only. Public data can still contain personal data, and LinkedIn's terms of use restrict automated access, so make sure you have a legitimate reason, follow GDPR and the rules that apply to you, and use the data responsibly.

**Why are some jobs missing salary or apply link?**
LinkedIn shows these only on some public pages. The Actor returns what is public.

**Can I run it from code?**
Yes. Use the Apify API, the JavaScript or Python client, webhooks, or an MCP client.

**Something is wrong or missing.**
Open an issue on the Actor's Issues tab with a link to the failing run. LinkedIn changes its pages from time to time.

## Disclaimer

This Actor is not affiliated with or endorsed by LinkedIn. LinkedIn is a trademark of its owner and is used only to describe what the Actor works with.
