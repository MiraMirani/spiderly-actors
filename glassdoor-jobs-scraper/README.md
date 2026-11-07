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

Open **SUMMARY** in the key-value store for counts by search and any errors. The Actor stops collecting from a search if Glassdoor restricts access. Direct and saved-page runs fail if they collect zero rows. An upstream search that completes successfully can return an empty dataset. Results are limited to public search cards and contain short previews when available.
