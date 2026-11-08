"""Fetch public Glassdoor search results through a browserless HTTP session."""

import json
import re
import sys
import time
from urllib.parse import unquote, urlsplit

from curl_cffi import requests

ORIGIN = "https://www.glassdoor.com"


def collect(url, keyword, max_pages):
    path = unquote(urlsplit(url).path)
    match = re.fullmatch(r"/Job/(.+)-SRCH_([^/]+)\.htm", path, re.I)
    city = re.search(r"_IC(\d+)(?:_|$)", match[2]) if match else None
    result = {"rows": [], "pages": 0}
    if not city:
        return {**result, "error": "Browserless search requires a Glassdoor city search URL."}

    cursor = ""
    with requests.Session(impersonate="chrome136", timeout=12) as session:
        for page in range(1, max_pages + 1):
            try:
                response = session.post(
                    ORIGIN + "/job-search-next/bff/jobSearchResultsQuery",
                    headers={
                        "origin": ORIGIN,
                        "referer": url,
                        "accept": "application/json",
                        "sec-fetch-site": "same-origin",
                        "sec-fetch-mode": "cors",
                        "sec-fetch-dest": "empty",
                    },
                    json={
                        "excludeJobListingIds": [],
                        "filterParams": [],
                        "includeIndeedJobAttributes": True,
                        "keyword": keyword,
                        "locationId": int(city[1]),
                        "locationType": "CITY",
                        "numJobsToShow": 30,
                        "originalPageUrl": url,
                        "pageCursor": cursor,
                        "pageNumber": page,
                        "pageType": "SERP",
                        "parameterUrlInput": match[2],
                        "seoFriendlyUrlInput": match[1].lower(),
                        "seoUrl": True,
                    },
                    allow_redirects=False,
                )
                if response.status_code != 200:
                    raise ValueError(f"Glassdoor returned HTTP {response.status_code}")
                search = response.json()["data"]["jobListings"]
                listings = search["jobListings"]
            except (requests.RequestsError, ValueError, KeyError, TypeError) as error:
                result["error"] = str(error)
                break

            result["pages"] += 1
            for listing in listings:
                view = listing.get("jobview") or {}
                job = view.get("job") or {}
                header = view.get("header") or {}
                if not job.get("listingId") or not job.get("jobTitleText"):
                    continue
                employer = header.get("employer") or {}
                pay = header.get("payPeriodAdjustedPay") or {}
                result["rows"].append({
                    "jobId": str(job["listingId"]),
                    "title": job["jobTitleText"],
                    "company": employer.get("name") or header.get("employerNameFromSearch"),
                    "companyRating": (employer.get("ratings") or {}).get("overallRating"),
                    "location": header.get("locationName"),
                    "jobUrl": header.get("seoJobLink"),
                    "easyApplyBadge": header.get("easyApply"),
                    "salaryMin": pay.get("p10"),
                    "salaryMax": pay.get("p90"),
                    "salaryCurrency": header.get("payCurrency"),
                    "salaryPeriod": (header.get("payPeriod") or "").lower() or None,
                    "snippet": " ".join(job.get("descriptionFragmentsText") or []),
                    "sourceUrl": url,
                })

            cursor = next(
                (entry["cursor"] for entry in search.get("paginationCursors") or []
                 if entry["pageNumber"] == page + 1),
                "",
            )
            if not cursor:
                break
            if page < max_pages:
                time.sleep(0.75)
    return result


if __name__ == "__main__":
    print(json.dumps(collect(sys.argv[1], sys.argv[2], int(sys.argv[3]))))
