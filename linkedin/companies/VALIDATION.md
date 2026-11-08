# Release validation

Checked on 7 November 2026 (Europe/Oslo).

- Ten parser tests pass. These cover URL validation, company identity selection, missing fields, website redirects, size ranges, blocked/not-found responses, header taglines and follower metadata fallback.
- Apify CLI validates the input, dataset and output schemas.
- Local full-Actor test used `apify run --user-agent apify-codex-plugin/apify-actor-development` against Microsoft, Cognite, Apify and Cisco. All four returned FOUND with company IDs and follower counts.
- Exact cloud build 0.0.4 was verified through Apify MCP: run r1m1E9StcBvdfwWlo returned four FOUND profiles in 6.556 seconds. All returned rows pass the declared dataset schema. A prior cloud smoke test and duplicate locale-URL test also passed.
- A nonexistent company returned NOT_FOUND (404). Numeric company ID 1035 redirected to /uas/login; the classifier now reports BLOCKED for that path. Prefer company slugs or full URLs.
- Company data is read from public company pages only. Keyword discovery, people profiles, coordinates, industry IDs and verification state are not implemented or inferred.
- The example input uses two company slugs and is suitable for Apify's daily prefill-based smoke test. No LinkedIn account or private session cookies are used.
