![Apple App Store Lookup](https://raw.githubusercontent.com/MiraMirani/spiderly-actors/81de404da53381dc120c3626688772387767468d/assets/banners/apple-app-store.png)

# Apple App Store Lookup

Look up public iPhone and iPad listings by numeric App Store ID or app URL. The Actor uses Apple's public lookup endpoint and saves one dataset row per available app.

## Quick start

Enter up to 50 app IDs or URLs and choose a two-letter storefront code. Duplicate IDs are looked up once. The default sample checks Spotify, Duolingo, and Wikipedia in the US storefront.

```json
{
  "apps": ["324684580", "570060128", "https://apps.apple.com/us/app/wikipedia/id324715238"],
  "country": "US"
}
```

## Sample output

Selected fields from the Spotify listing in a verified US lookup.

```json
{
  "appId": "324684580",
  "country": "US",
  "title": "Spotify: Music and Podcasts",
  "bundleId": "com.spotify.client",
  "developer": "Spotify",
  "category": "Music",
  "version": "9.1.94",
  "price": 0,
  "currency": "USD"
}
```

Rows can also include seller, ratings, release dates, minimum OS version, descriptions, release notes, artwork URLs, and iPhone screenshot URLs. Export results as JSON, CSV, or Excel. Fields such as price, version, and ratings can change by storefront and date.

## Missing apps

Open **SUMMARY** in the run's key-value store for the list of unavailable IDs and any request error. The Actor keeps successful rows when some IDs are missing. A lookup with no successful rows fails.
