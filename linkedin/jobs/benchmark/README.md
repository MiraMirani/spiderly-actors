# Jobs comparison snapshot

7 November 2026 (Europe/Oslo): software engineer, Norway, past week, maximum ten jobs, company enrichment disabled. The JSON snapshot contains only job IDs, coverage counts, field-agreement flags and run metadata. Raw descriptions and public ad contacts are retained locally outside the repository and are not committed here.

The final dataset fetch contained ten jobs from each actor, with identical job IDs. The reference run metadata initially reported seven while its final dataset contained ten; counts are based on the rows themselves.

To recompute the field comparison from your own downloaded datasets:

```sh
node benchmark/compare.mjs spiderly.json bebity.json benchmark/2026-11-07.json
```

The JSON report must include run metadata before comparison; the script preserves it while recomputing row counts and field agreement. Unicode and whitespace are normalized. If description text does not already agree, line-leading list bullets in either source are ignored. External apply URLs are counted only when the output URL uses HTTP(S) on a non-LinkedIn host; their eventual destination and availability are not verified.

Company enrichment and the reference premium contact add-on were off. Both calls requested 512 MB; Console showed the reference actually used 1024 MB and Spiderly used 512 MB. Charges use different models, and the tiny Spiderly platform total is rounded. No broad price or speed guarantee follows from this snapshot.
