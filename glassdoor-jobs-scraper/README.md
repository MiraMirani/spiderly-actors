![Spiderly Glassdoor Jobs Scraper](https://raw.githubusercontent.com/MiraMirani/spiderly-actors/20aef612cd901fdedc814f1029a12efbc77ba44d/assets/banners/glassdoor-jobs.png)

*The banner shows illustrative data.*

# Glassdoor Jobs Scraper

Search Glassdoor job listings by keyword and location, paste a search URL, or import a saved public results page. Export job titles, employers, locations, listing URLs, salary ranges and company ratings.

## Search by keyword

Choose **Keyword and location**, enter the role and location, then set a result limit. Optional filters include posting date, employment type, remote work, Easy Apply, company rating, minimum annual salary, seniority and company size.

```json
{
  "mode": "keyword",
  "keyword": "software engineer",
  "location": "New York, NY",
  "maxItems": 5,
  "providerBudgetUsd": 0.05
}
```

Keyword and URL modes run an upstream Apify Actor with a separate charge cap. The search term, location, filters or search URLs for the selected mode are sent to that Actor. Spiderly's own platform usage is separate. Title phrase matching happens after the upstream search and can return fewer rows than the requested limit.

## Browserless city search

Choose **Browserless search by city URL**. Enter the keyword and a Glassdoor city search URL that contains a city ID (`IC` followed by digits). This mode sends HTTP requests directly to Glassdoor using Python and `curl_cffi`.

```json
{
  "mode": "browserless",
  "keyword": "software engineer",
  "searchUrls": [
    { "url": "https://www.glassdoor.com/Job/Software-Engineer-New-York-SRCH_KO0%2C17_IL.18%2C26_IC1132348.htm" }
  ],
  "maxItems": 100,
  "maxPages": 4
}
```

The local live test returned 100 distinct listings across four pages. Here is a shortened row from that run.

```json
{
  "jobId": "1009026513713",
  "title": "Software Engineers",
  "company": "Econtenti Inc",
  "location": "Edison, NJ",
  "companyRating": 3,
  "salaryMin": null
}
```

Browserless mode returns search summaries and available salary fields. Full descriptions, external application URLs, employer enrichment, and keyword-mode filters are outside the scope of browserless search. Glassdoor may block requests, and the run summary records failed or partial searches.

## Job and employer details

Live searches include median pay, posting age, job types, skills, and work arrangement when the source supplies them. Turn on **Include full job descriptions** to fetch the full text and formatted HTML, and **Include employer profiles** to fetch company size, industry, headquarters, and rating breakdowns. The upstream run can charge extra for full descriptions. Use the **Jobs**, **Job details**, **Companies**, and **Salaries** output views to browse the data. The full dataset also includes location IDs, sponsored flags, listing tags, and collection timestamps when supplied. Missing details remain empty. Existing API calls can set both detail options explicitly. Saved-page imports continue to use the fields visible on each card.

## Live search source

Keyword searches use the fast source by default. It can provide posting dates, geographic coordinates, benefits and Glassdoor application links when present. Choose **Original source** for the original keyword dataset, including its listing tags and employer ratings where available. URL searches and the 5,001+ employee filter use the original source. Results and field availability can differ between sources.

## Search by URL

Choose **Glassdoor search URL** and paste up to five supported US results page URLs. URL searches use the filters in those URLs. If a URL is rejected, enter the role and location in keyword mode or import the saved page.

Existing API inputs containing only `searchUrls` retain the original direct browser behavior. Glassdoor can deny those requests with HTTP 403.

## Import results from your browser

If the live run reports an access block, open the public search in your browser. Load the job cards you want, then use **Save page as** and choose **HTML only**. Open the HTML file in a text editor and paste its contents into **Saved search HTML**. Choose **Saved browser page**, enter the original search URL in **Glassdoor search URLs**, and run the Actor.

Import mode reads the cards present in the saved file. It makes no requests to Glassdoor, ignores the batch limit, and applies the same unique job limit as a live run. Save a public results page from a signed-out browser so the Actor input contains only public page content.

## Sample output

Selected fields from a public New York search card. Job listings and their displayed data change over time.

```json
{
  "jobId": "1010219783710",
  "title": "Junior Software Engineer",
  "company": "SOCOTEC Group",
  "companyRating": 3.2,
  "location": "New York, NY",
  "jobUrl": "https://www.glassdoor.com/job-listing/junior-software-engineer-socotec-group-JV_IC1132348_KO0,24_KE25,38.htm?jl=1010219783710",
  "easyApplyBadge": true,
  "salaryRaw": "$110K - $140K (Employer provided)",
  "salaryMin": 110000,
  "salaryMax": 140000,
  "salaryCurrency": "USD",
  "salaryPeriod": null,
  "salarySource": "employer"
}
```

The dataset also includes `snippet` and `sourceUrl`. Missing optional fields use `null`. The pay period is filled when the source supplies it. Keyword results can have structured salary fields even when `salaryRaw` is empty. A single advertised salary uses the same value for both bounds. `easyApplyBadge` records whether the card shows that badge, and `jobUrl` opens the Glassdoor listing.

## Run summary

Live runs report the upstream run ID, timeout, and memory in **SUMMARY**, plus the upstream charge when Apify supplies it. That charge excludes the parent Actor's platform usage. Enriched searches get more memory and time, subject to the parent run deadline. If the upstream run times out, Spiderly saves any available results and reports the failure.

Open **SUMMARY** in the key-value store for counts by search and any errors. The Actor stops collecting from a search if Glassdoor restricts access. Direct and saved-page runs fail if they collect zero rows. An upstream search that completes successfully can return an empty dataset. Results are limited to public search cards and contain short previews when available.
