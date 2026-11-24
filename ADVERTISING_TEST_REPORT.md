# Advertising test report

Date: 24 November 2026. Branch `claude/ecstatic-keller-i4yien`. All automated tests used **mocked** ad scripts; no real Adsterra ad was requested, displayed or clicked by any test.

## Builds

| Build | Result | Pages | Time |
|---|---|---|---|
| Before (commit 9468851), `hugo --gc --minify`, Hugo 0.142.0 extended | OK | 270,221 (en 239,955 + 6 × 5,211) | 19 min 30 s |
| After (this change), same command and data | OK | 270,221 | 20 min 19 s / 21 min 01 s (second run at lower priority while tests ran) |
| After, `advertising.enabled = false` (emergency switch), reduced data set | OK | — | 2 min 52 s |

Data: `node scripts/build-data.js --offline` from the `store` branch of 24 November 2026 (640 charts, 166,300 songs, 72,729 artists).

## Output comparison, before vs after (full build)

| Check | Result |
|---|---|
| `/ads.txt` | byte-identical (`google.com, pub-9110547384071189, DIRECT, f08c47fec0942fa0`) |
| `robots.txt`, `sitemap.xml`, `en/sitemap.xml`, `tr/sitemap.xml`, RSS | byte-identical |
| File set | identical except new fingerprinted CSS/JS bundles and `advertising.min.*.js` |
| Head SEO/tracking elements on 3,005 pages (3,000 random + key pages): `<title>`, description, robots, canonical, hreflang/alternate, JSON-LD, Open Graph, H1, GTM tag, Mitgo verification | **0 differences** (privacy pages excluded: their content changed on purpose) |
| Affiliate links (`rel="sponsored"`) on the same pages | 8,793 before, 8,793 after |
| Pages loading `adsbygoogle.js` | 269,759 before → **0** after |
| `google-adsense-account` meta | on every page |
| Pages carrying the ad config (eligible) | 20,833 of 271,189 HTML files: home 7, Global 200 7, country 1,190, platform 3,703, artist 8,100, song 7,756, weekly 70 |
| Duplicate native container ids in HTML | 0 (container is created at run time, once) |
| Emergency switch build | 0 pages with ad config, 0 slots, 0 ad scripts; `bauval` only appears in privacy-policy text; ads.txt, consent banner and GTM still present |

## Automated browser tests — `node scripts/test-advertising.js <public>`

Chromium (Playwright), site served as `https://musicmetrics.net/` from the built files, bauval.org replaced by local mocks that read `window.atOptions` like the real snippet, every other third-party host blocked.

**Result on the full production build: 3,898 checks, 0 failed.** (Same result on the reduced build.)

Covered:

- 13 eligible pages — home, Global 200, country, platform chart, qualified artist, qualified song, weekly, plus `/tr/`, `/de/charts/global/`, `/ja/countries/jp/`, `/fr/artists/…`, `/es/charts/deezer/es/`, `/pt/weekly/…` — at **320, 360, 375, 390, 768, 1024, 1440, 1920 px**, each with no consent / rejected / accepted:
  - no consent or rejected → **0 requests to the ad network**, slots invisible, banner shown only without a choice;
  - accepted → at most 2 units, requests = started units, no duplicate request, no 728×90/160×600/native below 1024 px, no 320×50 at ≥1024 px, never 160×600, each banner iframe carries **its own** key (no `atOptions` collision), exactly one native container, expected units per page type at ≥390 px;
  - no JS errors; no duplicate DOM ids; GTM tag present; no AdSense ad script; ads/banner add no horizontal overflow.
- Not live: consent alone → no requests; `?mm-ads-preview=on` → ads; `?mm-ads-preview=off` → stops.
- 20 ineligible pages (privacy ×2, contact, terms, about, methodology, search, admin, 404, list indexes, platform hub, YouTube chart/most-viewed/daily, Spotify, a non-charting artist and song): no slots, no config, no requests, no JS errors.
- Real banner flow: first visit shows banner, nothing loads; **Accept** starts ads without reload; footer **Cookie settings** opens the dialog with the stored state; **Reject** there reloads with no new ad request; **Manage** → analytics only saved; banner **Reject** on mobile → no request.

At 320 px no unit fits the 288 px column, so no ad loads (by design).

### Pre-existing issue found (not caused by ads)

Horizontal overflow already in the old site, with ads and banner hidden: at 320 px on almost every page (header theme button, ~23–25 px; home 82 px), at 360–390 px on the home page (12–42 px), and the download-menu note on one chart page. Same numbers in the "before" build. Logged as a separate task; not changed here to keep this change focused.

## Layout stability (CLS, lab, mocked ads, stored consent)

Measured per page at 390 and 1440 px with ads accepted and with ads rejected. Reserved slot space matched the rendered units in every case (e.g. 320×50 box 116 px incl. margins before and after fill). Shifts > 0 that occurred were traced with the Layout Instability API to existing page elements — the language-suggestion bar on translated pages (browser language ≠ page language) and the Download button row — not to ad slots; they appear with and without ads and vary between runs. Native Banner height is estimated (240 px reserved): with real creatives this may shift slightly.

## Lab performance — `node scripts/perf-lab.js`

Local files only, all third-party requests blocked (so images and GTM do not load; LCP is therefore far lower than in the field), mobile = Pixel 7 emulation with 4× CPU throttling, single run per page, numbers are noisy (±100 ms between identical runs). "after+ads" = consent stored, Adsterra simulated live, mocked ad scripts. **These are laboratory numbers, not field Core Web Vitals; INP was not measured** (needs real interaction / field data — use Search Console after launch).

| Profile | Page | LCP ms (before / after / after+ads) | CLS | TBT-like ms | Ad requests | JS errors |
|---|---|---|---|---|---|---|
| desktop | / | 572 / 168 / 136 | 0 / 0 / 0 | 339 / 23 / 30 | 1 | 0 |
| desktop | /charts/global/ | 184 / 156 / 144 | 0 / 0 / 0 | 31 / 19 / 14 | 1 | 0 |
| desktop | /countries/us/ | 136 / 112 / 100 | 0 / 0 / 0 | 5 / 0 / 0 | 1 | 0 |
| desktop | /artists/olivia-rodrigo/ | 136 / 132 / 136 | 0 / 0 / 0 | 0 / 0 / 3 | 0 | 0 |
| desktop | /songs/justice-flower-in-a-hurricane/ | 140 / 124 / 120 | 0 / 0 / 0 | 0 / 0 / 13 | 0 | 0 |
| mobile | / | 456 / 228 / 300 | 0 / 0 / 0 | 294 / 90 / 165 | 0 | 0 |
| mobile | /charts/global/ | 332 / 320 / 348 | 0 / 0 / 0 | 161 / 142 / 46 | 1 | 0 |
| mobile | /countries/us/ | 240 / 468 / 288 | 0 / 0 / 0 | 111 / 184 / 140 | 1 | 0 |
| mobile | /artists/olivia-rodrigo/ | 360 / 352 / 296 | 0 / 0 / 0 | 207 / 146 / 151 | 0 | 0 |
| mobile | /songs/justice-flower-in-a-hurricane/ | 208 / 224 / 316 | 0 / 0 / 0 | 100 / 97 / 179 | 0 | 0 |

Ad requests in the table are only the slots that entered the viewport during the 3 s load window (lazy loading); the rest load on scroll.

Reading: no regression attributable to the change outside run-to-run noise; CLS 0 in every run; no JS errors. Real ad creatives add network and script cost that mocks cannot show — measure with PageSpeed Insights and Search Console after enabling (MONETIZATION_MONITORING.md).

## Not tested / still open

- **Real Adsterra scripts:** not executed anywhere (endpoint returns empty bodies to this build machine; and test traffic would be invalid traffic). Whether the vendor loader works when inserted after consent is the owner check in ADSTERRA_INTEGRATION.md §6.
- Real creatives: redirects, pop-ups, category quality — owner check + Adsterra support.
- Field CWV (LCP/CLS/INP) — after launch.
- Safari/Firefox — tests ran in Chromium only.

## Live verification

Not done yet. Production deploy status: see the summary in ADSTERRA_INTEGRATION.md. Record the owner preview check here (date, devices, pages, units seen, issues).
