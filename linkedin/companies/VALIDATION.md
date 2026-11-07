# Release validation

Checked on 7 November 2026 (Europe/Oslo).

- Ten parser tests pass. These cover URL validation, company identity selection, missing fields, website redirects, size ranges, blocked/not-found responses, header taglines and follower metadata fallback.
- Apify CLI validates the input, dataset and output schemas.
- Local full-Actor test used `apify run --user-agent apify-codex-plugin/apify-actor-development` against Microsoft, Cognite, Apify and Cisco. All four returned FOUND with company IDs and follower counts.
- Exact cloud build 0.0.4 was verified through Apify MCP: run r1m1E9StcBvdfwWlo returned four FOUND profiles in 6.556 seconds. All returned rows pass the declared dataset schema. A prior cloud smoke test and duplicate locale-URL test also passed.
- Same-input reference run i2Sn0aoIuKCWL20BX returned four NOT_FOUND / UNREACHABLE rows in 18.498 seconds. The alternate input check WYERQ1URVSWpgHu6Q returned one failed direct lookup and no search profile. The comparison does not establish field-level accuracy or full feature parity.
- A nonexistent company returned NOT_FOUND (404). Numeric company ID 1035 redirected to /uas/login; the classifier now reports BLOCKED for that path. Prefer company slugs or full URLs.
- Company data is read from public company pages only. Keyword discovery, people profiles, coordinates, industry IDs and verification state are not implemented or inferred.
- The example input uses two company slugs and is suitable for Apify's daily prefill-based smoke test. No LinkedIn account or private session cookies are used.

Final README and benchmark snapshot document the exact input sample, observed coverage, actual displayed charge limitations and runtime caveats. These checks are examples, not guarantees of future access or coverage.
