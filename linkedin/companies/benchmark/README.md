# Reproduce the company comparison

Snapshot: 7 November 2026 (Europe/Oslo). `2026-11-07.json` contains factual field coverage and run identifiers for the matched four-company sample. Raw downloaded rows are retained locally outside the repository; the Store README includes shortened real output samples.

1. Run both actors with the same four company URLs from the snapshot. Spiderly uses `companies`; Bebity uses `action: get-companies` and `keywords`. Direct URLs ignore Bebity's search limit.
2. Download both datasets as JSON, preserving failure rows.
3. Save run metadata and the exact inputs in a manifest with `companyUrls`, `testedAt`, `spiderly`, `bebity` and `caveats`.
4. Run the local comparison:

```sh
node benchmark/compare.mjs --spiderly spiderly.json --reference bebity.json --manifest manifest.json --out summary.json
```

This script does not contact services or run paid actors. It treats zero numeric values as populated and counts successful profiles separately from dataset rows. It refuses to infer field-level equivalence when no successful matching reference profiles exist.

In this session, the reference returned four NOT_FOUND / UNREACHABLE rows. An additional `/company/microsoft` lookup also returned UNREACHABLE; a `Cognite` name search returned no company profile. This does not establish the service's general behavior or feature parity.
