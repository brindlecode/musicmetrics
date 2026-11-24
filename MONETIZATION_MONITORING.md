# Monetization monitoring

No revenue figures are estimated here: every number must come from the Adsterra dashboard or GA4. Never click our own ads, never reload pages to "test" fill, never use bots or paid traffic to raise impressions.

## Data sources

| Source | What it gives |
|---|---|
| **Adsterra dashboard → Statistics** (website 6226100; filter by ad unit, country, device/OS, date) | Impressions, clicks, CTR, CPM, revenue per unit, per country, per device. The only source of revenue. Export CSV weekly. |
| **GA4** (stream behind `GTM-TFX57NZ5`) | Page views by page path, country and device category — denominators for RPM. |
| **GA4 event `ad_slot`** (new, sent by `assets/js/advertising.js` when `ga4Events = true`) | Parameters: `ad_provider`, `ad_unit` (leaderboard / mobileBanner / mediumRectangle / nativeBanner), `ad_slot` (top/mid/list/end), `ad_state` (`filled`, `empty`, `error`, `timeout`, `skipped`, `halted` = not started because an earlier banner timed out), `ad_page_type`, `ad_device`, `ad_preview` (1 = owner preview, exclude). Only sent after consent; obeys Consent Mode. Register `ad_unit`, `ad_state`, `ad_page_type`, `ad_device` as event-scoped custom dimensions in GA4 (Admin → Custom definitions) to report on them. |
| **Search Console → Core Web Vitals** and **PageSpeed Insights / CrUX** | Field data (real users, 28-day rolling). Lab numbers in ADVERTISING_TEST_REPORT.md are not field data. |

No Adsterra API token is used or stored. If one is added later for automated reporting, keep it in a GitHub Actions secret and only ever use it server-side (in a workflow), never in the static site.

## Weekly sheet (one row per week × unit × device)

| Column | Formula / source |
|---|---|
| Impressions, Clicks, Revenue | Adsterra export |
| CPM | Revenue ÷ Impressions × 1000 (Adsterra shows it too) |
| Ad page views | GA4 page views of pages whose type is ad-eligible (filter: event `ad_slot` with `ad_state = filled` or the eligible paths) |
| Page RPM | Revenue ÷ all GA4 page views × 1000 |
| Ad-page RPM | Revenue ÷ ad page views × 1000 |
| Fill rate (our side) | `ad_slot` events `filled` ÷ (`filled` + `empty` + `error` + `timeout`); many `timeout`/`halted` means the network is slow for those visitors |
| Consent rate | (sessions with any `ad_slot` event) ÷ sessions on eligible pages — lower bound, as GA itself needs analytics consent |
| Country split | Adsterra statistics by country (top 10) next to GA4 users by country |
| Desktop vs mobile | Adsterra by device + `ad_device` |

## Page speed before/after

Track monthly in Search Console (Core Web Vitals report, mobile and desktop) and for 5 fixed URLs in PageSpeed Insights: `/`, `/charts/global/`, `/countries/us/`, one qualified artist, one qualified song. Targets: LCP ≤ 2.5 s, CLS ≤ 0.1, INP ≤ 200 ms (field, 75th percentile). The lab baseline is in ADVERTISING_TEST_REPORT.md. Re-run the lab script after any placement change:

```bash
node scripts/perf-lab.js public scripts/perf-lab.urls.json --consent --live --mock-ads
```

## Decision rules (review after 4 full weeks of live data)

- A unit with fill rate < 30 % or eCPM far below the others for 4 weeks → disable it (less script, same revenue).
- Field CLS > 0.1 or LCP > 2.5 s on ad page types that were fine before → remove the `top` slot of that type first.
- Bounce/engagement on ad pages clearly worse than the 4 weeks before → reduce density (`maxAdsPerPage = 1`).
- Only consider a third slot (raising `maxAdsPerPage`) when all three Web Vitals stay green for 8 weeks and complaints are zero.
- Any report of redirects, pop-ups or unsafe creatives → disable first (ADVERTISING_ROLLBACK.md), then investigate.
