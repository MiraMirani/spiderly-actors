export const hostedPlaywrightActor = 'apify/playwright-scraper';

const pageFunction = String.raw`async ({page,request,log}) => {
 await page.locator('li[data-test="jobListing"][data-jobid]').first().waitFor({timeout:15000});
 const result=await page.evaluate(async ({keyword, city, maxItems, maxPages}) => {
  const jobs=new Map(), pages=[];
  let cursor='';
  for(let pageNumber=1;pageNumber<=maxPages&&jobs.size<maxItems;pageNumber++){
   const response=await fetch('/job-search-next/bff/jobSearchResultsQuery',{
    method:'POST',headers:{'content-type':'application/json','accept':'application/json'},
    body:JSON.stringify({excludeJobListingIds:[],filterParams:[],includeIndeedJobAttributes:true,keyword,locationId:city.id,locationType:'CITY',numJobsToShow:30,originalPageUrl:location.href,pageCursor:cursor,pageNumber,pageType:'SERP',parameterUrlInput:city.parameters,seoFriendlyUrlInput:city.slug,seoUrl:true})
   });
   const text=await response.text();
   pages.push({page:pageNumber,status:response.status,bodyBytes:new TextEncoder().encode(text).length});
   if(!response.ok) throw new Error('Search API HTTP '+response.status);
   const json=JSON.parse(text), search=json?.data?.jobListings;
   if(!Array.isArray(search?.jobListings)) throw new Error('Missing search rows');
   const before=jobs.size;
   for(const listing of search.jobListings){
    const v=listing.jobview, h=v?.header, job=v?.job;
    if(!job?.listingId||!job.jobTitleText) continue;
    if(jobs.size===maxItems) break;
    jobs.set(String(job.listingId),{jobId:String(job.listingId),title:job.jobTitleText,company:h?.employer?.name??h?.employerNameFromSearch,companyRating:h?.employer?.ratings?.overallRating??null,location:h?.locationName,jobUrl:h?.seoJobLink??null,ageInDays:h?.ageInDays??null,easyApply:h?.easyApply??null,salary:h?.payPeriodAdjustedPay??null,salaryCurrency:h?.payCurrency??null,salaryPeriod:h?.payPeriod??null,salarySource:h?.salarySource??null,logoUrl:v.overview?.squareLogoUrl??null,snippet:job.descriptionFragmentsText??[],searchPage:pageNumber});
   }
   cursor=search.paginationCursors?.find(c=>c.pageNumber===pageNumber+1)?.cursor;
   if(!cursor||jobs.size===before) break;
   if(jobs.size<maxItems) await new Promise(resolve=>setTimeout(resolve,750));
  }
  return {rows:[...jobs.values()],pages};
 }, request.userData);
 log.info('BATCH_DIAGNOSTIC '+JSON.stringify({jobs:result.rows.length,pages:result.pages}));
 return result.rows.map(row => ({ ...row, status: 'ok', url: row.jobUrl, searchUrl: request.url, salaryMin: row.salary?.p10, salaryMedian: row.salary?.p50, salaryMax: row.salary?.p90 }));
}`;

export function hostedPlaywrightInput(urls, keyword, maxItems, maxPages) {
    if (typeof keyword !== 'string' || !keyword.trim() || keyword.length > 200) {
        throw new Error('Enter the keyword used in the city search URL.');
    }
    if (!Number.isInteger(maxPages) || maxPages < 1 || maxPages > 5) {
        throw new Error('Set the batch limit between 1 and 5.');
    }
    const startUrls = urls.map((url) => {
        const parsed = new URL(url);
        const match = decodeURIComponent(parsed.pathname).match(/\/Job\/(.+)-SRCH_([^/]*_IC(\d+)[^/]*)\.htm$/i);
        if (!match || parsed.search) throw new Error('Enter an unfiltered Glassdoor city search URL.');
        return { url, userData: { keyword: keyword.trim(), city: { id: Number(match[3]), parameters: match[2], slug: match[1].toLowerCase() }, maxItems, maxPages } };
    });
    return {
        ...{
            "linkSelector": "",
            "globs": [],
            "maxPagesPerCrawl": 1,
            "maxConcurrency": 1,
            "maxRequestRetries": 0,
            "maxScrollHeightPixels": 0,
            "waitUntil": "domcontentloaded",
            "pageLoadTimeoutSecs": 30,
            "pageFunctionTimeoutSecs": 60,
            "proxyConfiguration": {
                "useApifyProxy": true,
                "apifyProxyGroups": [
                    "RESIDENTIAL"
                ],
                "apifyProxyCountry": "US"
            },
            "proxyRotation": "RECOMMENDED",
            "useChrome": true,
            "headless": false,
            "downloadMedia": false,
            "downloadCss": true
        },
        startUrls, pageFunction, maxPagesPerCrawl: startUrls.length, maxResultsPerCrawl: maxItems,
    };
}
