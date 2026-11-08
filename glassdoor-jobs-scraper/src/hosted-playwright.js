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
 const rows = result.rows.map(row => ({
    ...row, status: 'ok', url: row.jobUrl, searchUrl: request.url,
    salaryMin: row.salary?.p10, salaryMedian: row.salary?.p50, salaryMax: row.salary?.p90,
    postedDaysAgo: row.ageInDays,
    snippet: row.snippet.join(' ').trim() || null,
 }));
 if (!request.userData.includeDescription) return rows;
 for (let index = 0; index < rows.length; index += 4) {
    await Promise.all(rows.slice(index, index + 4).map(async (row) => {
        try {
            const details = await page.evaluate(async (jobUrl) => {
                const url = new URL(jobUrl);
                if (url.origin !== location.origin || !url.pathname.startsWith('/job-listing/')) return {};
                const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(7000) });
                if (!response.ok) return { descriptionError: 'Detail page HTTP ' + response.status };
                const document = new DOMParser().parseFromString(await response.text(), 'text/html');
                const description = document.querySelector('[data-test="jobDescription"], [class*="JobDetails_jobDescription"]');
                let descriptionHtml = description?.innerHTML;
                for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
                    try {
                        const data = JSON.parse(script.textContent);
                        const entries = Array.isArray(data) ? data : (data['@graph'] ?? [data]);
                        const posting = entries.find(entry => entry?.['@type'] === 'JobPosting');
                        if (typeof posting?.description === 'string') {
                            descriptionHtml = posting.description;
                            break;
                        }
                    } catch {}
                }
                const plain = descriptionHtml
                    ? new DOMParser().parseFromString(descriptionHtml, 'text/html').body.textContent.trim() : null;
                const apply = document.querySelector('a[data-test="applyButton"][href], a[data-test="apply-button"][href]');
                const applyUrl = apply ? new URL(apply.getAttribute('href'), url) : null;
                const external = applyUrl?.protocol === 'https:' && !applyUrl.username && !applyUrl.password
                    && !/(^|[.])glassdoor[.]/i.test(applyUrl.hostname);
                return {
                    description: plain || null, descriptionHtml: descriptionHtml || null,
                    externalApplyUrl: external ? applyUrl.href : null,
                    descriptionError: plain ? null : 'Full description unavailable on the detail page.',
                };
            }, row.jobUrl);
            Object.assign(row, details);
        } catch {
            row.descriptionError = 'Could not load the detail page.';
        }
    }));
 }
 return rows;
}`;

export function hostedPlaywrightInput(urls, keyword, maxItems, maxPages, includeDescription = false) {
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
        return { url, userData: { keyword: keyword.trim(), city: { id: Number(match[3]), parameters: match[2], slug: match[1].toLowerCase() }, maxItems, maxPages, includeDescription } };
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
        startUrls, pageFunction, pageFunctionTimeoutSecs: includeDescription ? 240 : 60, maxPagesPerCrawl: startUrls.length, maxResultsPerCrawl: maxItems,
    };
}
