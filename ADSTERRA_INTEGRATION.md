# Adsterra integration — MusicMetrics.net

Adsterra website **6226100** (musicmetrics.net), approved 24 November 2026. Units active in the dashboard: Native Banner 32459340, 320×50 32459341, 300×250 32459342, 160×600 32459343, 728×90 32459344. Dashboard: Adult ads OFF; Popunder, Smartlink, Social Bar, Interstitial, Push OFF; Anti-Adblock not used.

**Status of this change: the integration is built and tested with mocked ad scripts. Adsterra is switched OFF for visitors (`advertising.adsterra.enabled = false`) until the open security items are closed (section 6). The owner can see real ads in their own browser with `?mm-ads-preview=on`.**

Related documents: ADVERTISING_CONFIGURATION.md (all switches, placements), ADVERTISING_SECURITY_AUDIT.md, ADVERTISING_PRIVACY_REVIEW.md, ADVERTISING_TEST_REPORT.md, ADVERTISING_ROLLBACK.md, MONETIZATION_MONITORING.md.

## 1. Repository findings (before the change)

- Hugo extended **0.142.0**, 7 languages (en at `/`, tr, es, pt, de, fr, ja), ~240,000 pages generated from `data/*.json` (built from the `store` branch by `scripts/build-data.js`).
- Deployment: only GitHub Actions (`.github/workflows/fetch-data.yml`, daily 19:03 UTC from the default branch) builds and runs `netlify deploy --prod`; Netlify Git builds are stopped on purpose; `site-watch.yml` re-publishes the latest "Charts update" deploy. `ci.yml` builds every pushed branch.
- Ads: Google AdSense `ca-pub-9110547384071189` — `adsbygoogle.js` was loading on content pages (home, song, artist, country, weekly, album, non-YouTube chart pages; `func/ads-on.html`) although the site is not approved. No AdSense slot ids set, so no manual units rendered. `/ads.txt` generated from the publisher id.
- Analytics: Google tag `GTM-TFX57NZ5` (GA4 `G-4DK7E6SQDV`) with Consent Mode defaults (denied in EEA/UK/CH). Clarity / Cloudflare analytics configured but empty.
- Affiliate: Apple (token empty), Amazon (tag empty), tickets URL empty; Mitgo/Admitad verification meta tag `mitgo-verification`. All untouched.
- No consent banner / CMP; no Content Security Policy.

## 2. Architecture

```
hugo.toml [params.advertising]            single source of truth (switches, units, placements)
layouts/partials/advertising/
  state.html          build-wide state: master/env/provider/unit switches; build fails if a page
                      type has more slots per device than maxAdsPerPage
  eligibility.html    page → placement type (home, global200, country, platform, artist, song,
                      research) or "" (no ads); whitelist, default no
  slot.html           empty, labelled placeholder for a named slot (no vendor code)
  manager.html        <head>: JSON config + early "data-ads" flag + deferred advertising.js,
                      only on eligible pages
layouts/partials/consent/
  head.html           window.MMConsent (state, Consent Mode update)
  banner.html         banner + preferences dialog
assets/js/advertising.js   loader: consent/host/width/limit checks, sequential atOptions,
                           lazy start (IntersectionObserver), GA4 ad_slot events
assets/js/consent.js       banner UI (bundled into main.js)
assets/css/advertising.css slot reservation (container queries), labels, banner
```

The suggested per-unit partials (`adsterra/banner-728x90.html` …) were **not** created: the five units are data (`[params.advertising.adsterra.units.*]`) used by one loader, so the snippets exist exactly once. The `adsense/` and `sponsorship/` providers are switches (`advertising.adsense`, `advertising.sponsorship`); the existing AdSense partial `layouts/partials/ad.html` now only renders when AdSense is the active provider.

### Load sequence on an eligible page

1. `<head>`: `MMConsent` is defined; Consent Mode defaults run, then the stored choice is applied; if Adsterra may run in this browser (live, or owner preview), the host is allowed and advertising consent is stored, `<html data-ads="1">` is set **before first paint**, so slot space is reserved from the start.
2. `advertising.js` (deferred) picks the device list (`desktopMinWidth` 1024 px), then for each slot in page order: first unit whose width fits the slot's measured width, at most `maxAdsPerPage` (2), at most one native. Slots that do not fit are marked `skipped` and never requested.
3. A slot's script is injected when it comes within 400 px of the viewport. Banners run strictly one at a time: `window.atOptions` is set to that unit's dashboard values, its script is appended inside the slot, and the next banner waits until the script has loaded **and** produced an iframe (2.5 s) or failed (10 s timeout). This prevents one banner from overwriting another's `atOptions`. If a banner script times out it might still run later, so no further banner is started on that page (state `halted`, space kept); a script that failed to load cannot run, so the queue continues. When a lazy slot comes into view, the unit is re-checked against the current viewport and slot width (rotation/resize) and skipped if it no longer fits.
4. The Native Banner: `<div id="container-<key>">` is created once inside its slot and the async script appended.
5. Consent given later in the banner → step 2 starts immediately (no reload). Consent withdrawn → page reloads without ads.

Hidden alternatives are **not** loaded and hidden with CSS (Adsterra's own mobile/desktop article uses CSS hiding; that loads both units, which the brief forbids).

## 3. Deviation from the dashboard snippets — and why it is the open technical item

The dashboard snippets are written for a static, synchronous `<script>` in the page body (Adsterra help centre: "just place the code snippet anywhere in the page body"). Synchronous snippets cannot wait for consent. Our loader uses the **same values and URLs**, but inserts the `<script src>` from JavaScript after consent, which makes it asynchronous.

- If the vendor script places its iframe via DOM methods next to `document.currentScript` (as most current loaders do), this works and is equivalent.
- If it uses `document.write`, browsers ignore that call for inserted scripts: **the slot stays empty, nothing breaks** (no page wipe). The slot then reports `ad_state = empty` / `timeout`.

The script source could not be inspected (the endpoint returns an empty body to datacenter IPs), and Adsterra's help centre has no article on consent-aware or delayed loading. Hence the owner check below and a support ticket (question 1 in §6).

## 4. Placement rules actually implemented

See ADVERTISING_CONFIGURATION.md (table "Placement inventory"). Summary: max 2 units per page; desktop gets 728×90 + (Native or 300×250); mobile/tablet gets 320×50 + 300×250 where the column is wide enough; artist mobile and song pages get a single 300×250; 160×600 is off (only sidebar is sticky). No sticky, fixed, floating or bottom-anchored ads anywhere. Every unit carries a localized label: Advertisement / Reklam / Publicidad / Publicidade / Anzeige / Publicité / 広告 (existing `advertisement` i18n key; German uses the legally established "Anzeige").

Existing affiliate density: song and artist pages already carry Listen/Buy buttons (Apple, Amazon, Deezer, Spotify links), so they get fewer ads (song: 1).

## 5. AdSense and ads.txt

- `adsbygoogle.js` **no longer loads** (`advertising.adsense.enabled = false`), so no Google ad requests are sent while the site is unapproved, and AdSense Auto ads cannot compete with Adsterra.
- Ownership verification is preserved: `/ads.txt` still contains `google.com, pub-9110547384071189, DIRECT, f08c47fec0942fa0` (byte-identical to before), and every page now carries `<meta name="google-adsense-account" content="ca-pub-9110547384071189">`, Google's documented verification tag that loads no ad code.
- Adsterra: its help centre says "we do not provide ads.txt files, as our advertisers do not require them" (Adding Ads to a Static HTML Site). Nothing was added. If Adsterra support ever supplies exact lines, put them in `advertising.adsTxt.extra`.
- Do not request a new AdSense review automatically. Before switching to AdSense: certified CMP (privacy review P4), `provider = "adsense"`, `adsense.enabled = true`.

## 6. Before enabling Adsterra for all visitors (owner checklist)

1. **Support ticket to Adsterra** (website 6226100):
   1. Is `bauval.org` an official Adsterra serving domain for our account? (security S1)
   2. Our banners are inserted with `document.createElement('script')` after the visitor consents, with `window.atOptions` set immediately before each one and one banner at a time. Is that supported, or is there an official asynchronous / consent-aware banner code?
   3. Which advertiser categories can be blocked for our site? Please block adult/dating, gambling, crypto & high-risk finance, software downloads, browser extensions and "cleaner/VPN/virus" utilities.
   4. Do you support IAB TCF consent strings? Do you offer a DPA?
2. **Owner preview check** in a fresh browser profile (no logged-in accounts), on a desktop and on a phone, on `/`, `/charts/global/`, `/countries/us/`, one artist, one song page:
   - open `https://musicmetrics.net/?mm-ads-preview=on`, click **Accept all**;
   - confirm each expected unit appears inside its "Advertisement" box (see placement table) and the layout does not jump;
   - DevTools → Network: only `bauval.org` and the creative domains, at most 2 ad scripts per page; Console: no errors from our code;
   - no new tab, no redirect, no notification prompt, no sound; creatives acceptable;
   - padlock → certificate for bauval.org valid;
   - **do not click any ad**; a few page views only;
   - finish with `?mm-ads-preview=off`.
3. If everything passes and support confirms 1.1: set `[params.advertising.adsterra] enabled = true`, commit to the default branch, run the deploy workflow, then repeat step 2 without the preview flag. If 1.2 says "not supported", keep it off and use their recommended code.
4. Record the outcome in ADVERTISING_TEST_REPORT.md ("Live verification").

## 7. Known limitations

- Native Banner height is unknown before it renders; 240 px is reserved, so a small layout shift is possible if the widget is taller or shorter.
- Ad slots stay reserved but empty for visitors with ad blockers or when no ad is filled (no collapse, to avoid layout shift). No adblock detection.
- At viewports 1100–1115 px the desktop leaderboard does not fit next to the sidebar and is skipped.
- 320 px-wide phones get no ads (the 288 px column is narrower than every unit).
- Country-level, regional consent is a browser time-zone heuristic, and only applies in `regional` mode (off).
- Emergency shutdown through the site needs a full deploy (45–90 min); the instant stop is in the Adsterra dashboard (ADVERTISING_ROLLBACK.md).

## 8. Deployment status (24 November 2026)

- Implemented, built and tested on branch `claude/ecstatic-keller-i4yien` (full production build OK, 3,898 automated checks passed — ADVERTISING_TEST_REPORT.md).
- **Not merged and not deployed.** Production deploys come from the default branch (`claude/analyze-kworb-metrics-2mIwb`) through the daily "Update charts & deploy" workflow, so merging the pull request deploys it at the next run. It is left for the owner's review because it changes every page (consent banner, AdSense script removed) and because Adsterra must stay off until §6 is done.
- After merge and deploy, verify on musicmetrics.net: consent banner appears; `/ads.txt` unchanged; no request to bauval.org without `?mm-ads-preview=on` + Accept; GA4 real-time still receives page views after Accept; footer "Cookie settings" works.

## 9. Files changed

New: `layouts/partials/advertising/{state,eligibility,slot,manager}.html`, `layouts/partials/consent/{head,banner}.html`, `assets/js/advertising.js`, `assets/js/consent.js`, `assets/css/advertising.css`, `scripts/test-advertising.js`, `scripts/test-advertising.pages.json`, `scripts/perf-lab.js`, `scripts/perf-lab.urls.json`, the seven `*.md` documents.

Changed: `hugo.toml` (`[params.advertising]`, AdSense comment), `layouts/_default/baseof.html` (consent + manager partials, CSS/JS bundles, AdSense verification meta), `layouts/partials/tracking-head.html` (AdSense script gated, Consent Mode update), `layouts/partials/ad.html`, `layouts/partials/chart-list.html`, `layouts/partials/footer.html` (Cookie settings), `layouts/index.html`, `layouts/chart/single.html`, `layouts/chart-albums/single.html`, `layouts/country/single.html`, `layouts/artist/single.html`, `layouts/song/single.html`, `layouts/weekly/single.html` (slots), `layouts/index.ads.txt` (same output, optional verified extra lines), `layouts/_default/admin.html` (status rows), `i18n/*.toml` (banner strings), `content/*/privacy.md` (7 languages), `README.md`.

Not touched: data scripts (`scripts/fetch-*.js`, `scripts/build-data.js`, `scripts/lib/`), the Global 200 algorithm, the `store` branch, workflows, `static/_headers`, `robots.txt`, sitemaps, hreflang/canonical/SEO partials, affiliate code, GTM/GA ids.
