[![Spiderly LinkedIn Jobs Scraper: search, extract and build](https://raw.githubusercontent.com/MiraMirani/spiderly-actors/d9f7263990e3aca20051c36f2e179acc9bd92696/assets/banners/linkedin-jobs.png)](https://apify.com/spiderly/linkedin-jobs-scraper-fast-multi-keyword)

## What does LinkedIn Jobs Scraper do?

Turn public [LinkedIn job listings](https://www.linkedin.com/jobs/) into structured data for recruiting, job alerts and hiring research. Search multiple keywords and locations in one run, collect full descriptions and applicant information, and export your results as JSON, CSV or Excel. **No LinkedIn account, login or cookies required.**

When the public ad includes them, Spiderly also extracts **recruiter details, salary ranges, contact emails and Norwegian phone numbers**. Optional company enrichment adds public company information.

## What can you collect?

- **Job information:** job ID, title, LinkedIn URL, location, posting date, company page and logo.
- **Full descriptions:** plain text and HTML, employment type, seniority, job function and industries.
- **Applicants:** the text shown by LinkedIn, including phrases such as “Be among the first 25 applicants.”
- **Salary:** original salary text plus parsed minimum, maximum, currency and period when a recognizable range is present.
- **Recruiter:** job poster name, headline, public profile URL and photo when displayed.
- **Ad contacts:** email addresses and Norwegian-style phone numbers written in the job description.
- **Apply information:** Easy Apply or external classification, plus a public apply URL when exposed; otherwise the LinkedIn job URL.
- **Company information:** company ID; optional website, description, industry, size, followers, headquarters, founding year and employees on LinkedIn.

Availability varies by job. Missing values are left empty rather than invented. The banner uses illustrative data.

## Get started in five steps

1. Enter **keywords**, such as `software engineer` or `data analyst`.
2. Add **locations**, such as `Norway`, `Oslo` or `Sweden`.
3. Choose filters and set the **maximum number of jobs**.
4. Keep **Fetch full job details** enabled for descriptions, salary, applicants and contacts. Configure a proxy suited to your access and budget.
5. Click **Start**, inspect the dataset, then export it or use the Apify API.

Every keyword is combined with every location. Two keywords and three locations create six searches. Duplicate job IDs are removed across searches and the job limit applies to the whole run. When a job matches several searches, the first one that collects it supplies its search metadata.

### Example input

```json
{
  "keywords": ["software engineer", "data engineer"],
  "locations": ["Norway"],
  "datePosted": "r604800",
  "jobType": ["fulltime"],
  "workType": ["remote", "hybrid"],
  "sortBy": "recent",
  "limit": 100,
  "includeDetails": true,
  "includeCompanyProfile": false,
  "proxyConfiguration": {
    "useApifyProxy": true,
    "apifyProxyGroups": ["RESIDENTIAL"]
  }
}
```

The residential proxy setting is an example. Proxy availability and usage costs depend on your Apify account.

### Use a LinkedIn search URL

Paste normal LinkedIn Jobs search URLs into `startUrls` to reuse their search parameters and filters.

```json
{
  "startUrls": [
    { "url": "https://www.linkedin.com/jobs/search/?keywords=data%20engineer&location=Norway&f_TPR=r604800" }
  ],
  "limit": 50,
  "includeDetails": true
}
```

Pasted URLs add searches alongside any keyword/location searches you enter.

## Search filters

| Input | Purpose |
| --- | --- |
| `keywords`, `locations` | Lists of terms and locations. `keyword` and `location` are optional single-value shortcuts. |
| `geoId` | An exact LinkedIn location ID. |
| `datePosted` | `any`, `r86400` (24 hours), `r604800` (week), `r2592000` (month). |
| `jobType` | `fulltime`, `parttime`, `contract`, `temporary`, `internship`, `volunteer`, `other`. |
| `experienceLevel` | `internship`, `entry`, `associate`, `mid-senior`, `director`, `executive`. |
| `workType` | `onsite`, `remote`, `hybrid`. |
| `easyApply`, `under10Applicants` | Request the corresponding LinkedIn search filters. Counts follow LinkedIn's public results. |
| `companyId` | Exact company IDs sent to LinkedIn as a search filter. |
| `companyName` | Keep company names containing any supplied text, ignoring case. Applied after collection. |
| `titleInclude`, `titleExclude` | Keep or remove titles containing every word of at least one supplied phrase; word order does not matter. |
| `skipJobId` | Exclude jobs collected in previous runs. |
| `sortBy` | `relevance` or `recent`. |
| `limit` | Total unique jobs; default 100, maximum 5,000. |
| `maxPages` | Pages per search; default 100. LinkedIn typically exposes only about 1,000 results per search. |
| `includeDetails` | Default `true`. Turn off for basic search-card data only. |
| `includeCompanyProfile` | Default `false`. Additional company information when accessible. Requires job details. |
| `maxRequestsPerMinute` | Request rate; default 240. Lower it if access is limited. |
| `proxyConfiguration` | Apify Proxy or custom proxy configuration. |
| `urlParam` | Advanced search parameters in `key=value` form. |
| `debugSaveHtml` | Save the first N detail pages to the run's key-value store for troubleshooting; default 0. |

A maximum is a cap, not a promise of that many results. Narrow searches, filtering, duplicates, LinkedIn limits and failed requests can reduce the total. Completion order is not search order; use `rank`, `searchKeywords` and `searchLocation` to order results.

## Output example

Each dataset item represents one job. These shortened records are from the live 7 November 2026 sample, not invented examples. The full dataset also includes descriptions, recruiter fields, ad contact arrays and search metadata. Personal contact details are omitted from these public examples. You can download the dataset as JSON, HTML, CSV or Excel.

```json
[
  {
    "id": "4478550557",
    "url": "https://www.linkedin.com/jobs/view/4478550557",
    "title": "Software Engineer",
    "company": "Cisco",
    "location": "Norway",
    "postedDate": "2026-11-02",
    "applicants": "163 applicants",
    "employmentType": "Full-time",
    "seniorityLevel": "Not Applicable",
    "salary": "",
    "salaryMin": null,
    "salaryMax": null,
    "salaryCurrency": "",
    "salaryPeriod": "",
    "applyType": "EXTERNAL",
    "applyUrl": "https://www.linkedin.com/jobs/view/4478550557"
  },
  {
    "id": "4486993384",
    "url": "https://www.linkedin.com/jobs/view/4486993384",
    "title": "Senior Software Engineer | Platform Engineering | Kubernetes",
    "company": "Opus Resourcing Ltd",
    "location": "Oslo, Norway",
    "postedDate": "2026-11-06",
    "applicants": "Be among the first 25 applicants",
    "employmentType": "Full-time",
    "seniorityLevel": "Mid-Senior level",
    "salary": "NOK 900,000.00/yr - NOK 1,100,000.00/yr",
    "salaryMin": 900000,
    "salaryMax": 1100000,
    "salaryCurrency": "NOK",
    "salaryPeriod": "YEAR",
    "applyType": "EASY_APPLY",
    "applyUrl": "https://www.linkedin.com/jobs/view/4486993384"
  }
]
```

`applicants` is text, not an exact integer. Salary numbers are parsed from the advertised text, not estimated or currency-converted. Missing salary numbers are `null`; missing text is usually an empty string. Contact arrays are empty when there is no match. Norwegian-style phone extraction can include false matches; review results before use.

With `includeDetails: false`, detail-only fields are omitted. If a detail request exhausts retries, the basic item is retained with `detailsFailed: true`.

## Company enrichment

Set `includeCompanyProfile: true` with job details enabled to request each company's public LinkedIn page. Accessible pages can add:

`companyWebsite`, `companyDescription`, `companyIndustry`, `companySize`, `companyFollowers`, `companyHeadquarters`, `companyFounded`, `companyEmployeesOnLinkedIn`.

This adds requests. LinkedIn may block a company page even when its jobs are public. The job remains in your dataset and enrichment fields may be absent or empty. Employees on LinkedIn and company-size ranges are different measures.

## Apply links: what the field means

**`applyType: "EXTERNAL"` does not guarantee that `applyUrl` leads to the employer's careers site.** LinkedIn often hides the actual destination from logged-out visitors.

The Actor returns an apply URL when it appears in the public response. If none is exposed, it falls back to the LinkedIn job URL. This also provides a usable job link for Easy Apply listings. A LinkedIn fallback is not a resolved external application link. Full coverage of employer application pages is not supported by this version.

## API and automation

Use Apify schedules, webhooks and integrations, or call the Actor from your own application. Keep your API token private and read it from an environment variable.

Example using Apify's JavaScript client:

```js
import { ApifyClient } from 'apify-client';

const client = new ApifyClient({ token: process.env.APIFY_TOKEN });
const run = await client.actor('spiderly/linkedin-jobs-scraper-fast-multi-keyword').call({
  keywords: ['software engineer'],
  locations: ['Norway'],
  datePosted: 'r604800',
  limit: 50,
  includeDetails: true
});
const { items } = await client.dataset(run.defaultDatasetId).listItems();
```

For recurring alerts, schedule a recent-date search and pass previously collected IDs in `skipJobId`. Deduplication within a run is automatic; deduplication between runs requires saved IDs or downstream storage.

## Cost and performance

The Actor uses HTTP requests rather than a full browser. Basic listings need fewer requests than full details, and company enrichment adds more. Cost and run time depend on results, retries, proxy use and your Apify plan. See the current Actor pricing and your run's usage details for actual charges; there is no fixed cost or speed guarantee.

Start with 10–50 jobs to check your search and output, then increase the limit. If LinkedIn rate-limits requests, reduce the request rate or adjust your proxy configuration. Split larger searches by location, keyword or date to work within LinkedIn's result limits.

## FAQ

**Do I need a LinkedIn subscription?**  
No. This Actor uses publicly accessible, logged-out pages.

**Does it find private emails or phone numbers?**  
No. It extracts contact text already written in the public job description. Recruiter details depend on what the public page displays.

**Why are there fewer jobs than LinkedIn's displayed count?**  
Its displayed count can differ from accessible result pages. Duplicate removal, filters and access limits also affect the dataset.

**Can I export to Excel or connect another tool?**  
Yes. Export the Apify dataset or use the API and integrations.

**How do I report a problem?**  
Open an issue on the Actor's Issues tab with a run link, the affected job URL and the field you expected. Avoid including credentials.

---

Built by **Spiderly**. Independently developed; not affiliated with or endorsed by LinkedIn. LinkedIn names and marks belong to their owner. Use collected data in accordance with applicable rules and the source site's terms.
