# Validation

Checked on 7 November 2026 (Europe/Oslo).

- Eight parser tests pass, including company identity selection, URL validation, website redirect extraction, missing fields and blocked/not-found classification.
- Apify CLI validates input, dataset and output schemas.
- A Node 22 local Actor run collected Microsoft and Cognite. Three inputs containing a duplicate locale URL produced two rows. Both rows have the correct company IDs, company websites and industry. Dataset rows pass the declared JSON Schema.
- A nonexistent company returned NOT_FOUND (HTTP 404). Numeric company ID 1035 redirected to LinkedIn's /uas/login page; this is classified BLOCKED. Prefer known company slugs or full company URLs for public lookups.
- Apify deployment: build 0.0.3 succeeded. The cloud test collected Microsoft and Cognite in four seconds, both FOUND. The Console dataset table displays correctly after removing query parameters from the output template. Actor: https://console.apify.com/actors/WONMTG9IP8KU9eOwS (private).
- Company data is read from the public overview only. Keyword discovery and people/profile scraping are not part of this version.

These checks are examples, not a guarantee of access, freshness or coverage on other company pages. Review the platform run for deployment validation.
