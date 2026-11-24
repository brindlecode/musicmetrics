# Advertising configuration

All advertising is controlled from **`hugo.toml` → `[params.advertising]`**. Templates contain no vendor code; changing these values and rebuilding is the only way ads change.

## Switches

| Setting | Current | Effect |
|---|---|---|
| `advertising.enabled` | `true` | **Master switch / emergency shutdown.** `false` removes every ad slot, the ad config, the loader and every ad script (Adsterra and AdSense) from the next build. ads.txt and the AdSense verification meta tag stay. |
| `advertising.provider` | `"adsterra"` | The one provider allowed to fill slots: `adsterra`, `adsense` or `none`. Only one provider can be active, so two networks never compete for a slot. |
| `advertising.maxAdsPerPage` | `2` | Hard limit of units started per page view (enforced in `advertising.js`). The build **fails** if a page type lists more slots per device than this (`advertising/state.html`). |
| `advertising.respectConsent` | `true` | Documentation flag: the loader always requires `MMConsent.adsAllowed()`; there is no code path without consent. |
| `advertising.antiAdblock` / `allowAdultAds` | `false` | Documentation flags. No adblock detection exists in the code; adult ads are OFF in the Adsterra dashboard. |
| `advertising.desktopMinWidth` | `1024` | Viewports this wide or wider use the `desktop` placement lists, narrower ones the `mobile` lists. On top of that, a unit is only used if the slot's **real width** fits it. |
| `advertising.allowedHosts` | `musicmetrics.net`, `www.musicmetrics.net` | Vendor scripts never load on any other host (Netlify deploy previews, branch deploys, localhost). |
| `advertising.environments` | `["production"]` | Hugo environments that emit ad code. `hugo server` (development) emits none. |
| `advertising.ga4Events` | `true` | Sends `ad_slot` events (unit, slot, page type, device, state) to the existing Google tag. They obey Google Consent Mode. |
| `advertising.consent.mode` | `"global"` | `global`: everyone must click Accept before ads load. `regional`: opt-in only where the browser time zone is in Europe (EEA/UK/CH/TR and the rest of Europe) or unknown; elsewhere ads load unless the visitor rejects. **Ask legal counsel before switching to `regional`.** |
| `advertising.consent.version` | `1` | Increase to show the banner to everyone again (e.g. after adding a new ad partner). |
| `advertising.adsterra.enabled` | **`false`** | Adsterra for all visitors. Off until the live check in `ADSTERRA_INTEGRATION.md` §6 passes. |
| `advertising.adsterra.ownerPreview` | `true` | While Adsterra is off, a browser that opens any page with `?mm-ads-preview=on` gets real ads (after consent). `?mm-ads-preview=off` ends it. |
| `advertising.adsterra.units.<name>.enabled` | see below | Per-unit switch. A disabled unit is never rendered or requested. |
| `advertising.adsense.enabled` | `false` | AdSense ad script (`adsbygoogle.js`). Needs `provider = "adsense"` as well. Keep off until AdSense approves the site. |
| `advertising.sponsorship.enabled` | `false` | Reserved; nothing renders yet. |
| `advertising.adsTxt.extra` | `[]` | Extra ads.txt lines. Only lines copied from a provider dashboard or confirmed by the provider in writing. |

## Units (Adsterra website 6226100)

| Name | Format | Ad unit ID | Key | Script | Enabled |
|---|---|---|---|---|---|
| `nativeBanner` | Native Banner (4:1, font/colour inherit) | 32459340 | c7dd716ce6f6c63289752773346124cb | `https://bauval.org/21/…` (async) | yes |
| `mobileBanner` | 320×50 | 32459341 | 29f652a74a0dcb4863974b3a3295c845 | `https://bauval.org/22/…` | yes |
| `mediumRectangle` | 300×250 | 32459342 | 3d5a3cce6a4902147f0630529efadbc7 | `https://bauval.org/22/…` | yes |
| `wideSkyscraper` | 160×600 | 32459343 | 899922d170840173a62ac9d2bd1077eb | `https://bauval.org/22/…` | **no** — the only sidebar (`.aside`) is sticky; sticky ads are not allowed |
| `leaderboard` | 728×90 | 32459344 | cc214508ace844d55261ffecb39dab1c | `https://bauval.org/22/…` | yes |

The keys are public, client-side placement keys (they are visible in every page that shows the ad). They are not API credentials. No Adsterra login, API token or payment data is stored in this repository.

## Placement inventory (`[params.advertising.pages.<type>.<slot>]`)

Page types come from `layouts/partials/advertising/eligibility.html`:

| Page type | Pages | Slot | Desktop (≥1024 px) | Mobile / tablet |
|---|---|---|---|---|
| `home` | `/`, `/tr/` … | `top` (after key numbers) | 728×90 | 320×50 |
| | | `mid` (after Movers) | Native | 300×250 |
| `global200` | `/charts/global/` | `top` (before filter bar) | 728×90 | 320×50 |
| | | `list` (after row 10) | 300×250 | 300×250 |
| `country` | `/countries/<cc>/` | `top` (after chart chips) | 728×90 | 320×50 |
| | | `mid` (after chart panels) | Native | 300×250 |
| `platform` | Apple Music, iTunes, Deezer, Last.fm chart pages, top albums | `top` | 728×90 | 320×50 |
| | | `list` (after row 10) | 300×250 | 300×250 |
| `artist` | qualified artist pages | `mid` (after YouTube section) | 300×250 | 300×250 |
| | | `end` (after FAQ) | Native | — |
| `song` | qualified song pages | `mid` (after video) | 300×250 | 300×250 |
| `research` | weekly recaps `/weekly/<week>/` | `top` (after header) | 728×90 | 320×50 |
| | | `mid` (after weekly top 50) | Native | 300×250 |

A slot is skipped (no request, no reserved space) when its real width is smaller than the unit: 728×90 needs 728 px of column, 320×50 needs 320 px, 300×250 needs 300 px. With the 16 px page gutter, a 320 px phone therefore gets **no** ads (288 px column) and a 360 px phone gets 320×50 + 300×250. At viewports of 1100–1115 px the aside column narrows the main column below 728 px and the desktop `top` slot is skipped.

To add or move a placement: put `{{ partial "advertising/slot.html" (dict "page" . "slot" "<name>") }}` in the template and add `[params.advertising.pages.<type>.<name>]`. Lists are tried in order; the reserved-space CSS uses the first entry, so keep one unit per list unless you also extend `assets/css/advertising.css`.

### Changing density later

- Fewer ads: remove a slot table, or set a page type's `desktop`/`mobile` list to `[]`, or lower `maxAdsPerPage` to `1`.
- More ads: raise `maxAdsPerPage` only after `MONETIZATION_MONITORING.md` shows the page speed and engagement targets still hold; the build refuses page types with more slots than the limit.
- Disable a misbehaving unit: `units.<name>.enabled = false`.

## Eligibility rules (no ads on)

404, search, admin, privacy, terms, contact, about, methodology, every list index (`/charts/`, `/countries/`, `/artists/`, `/songs/`, `/weekly/`, platform hubs), every YouTube chart and YouTube page, Spotify pages, any page with `noindex` or `noads: true` front matter, and:

- chart pages with fewer than 20 entries; country pages with fewer than 2 charts; weekly recaps with fewer than 10 entries; the home page if the Global 200 has fewer than 50 entries;
- artist pages unless the artist is charting now on 3+ charts, has 2+ songs and is charting on a platform other than YouTube;
- song pages unless the song is charting now on 3+ charts (at least one non-YouTube), with title and artist.

At the time of writing that qualifies 1,770 of 72,729 artist pages and 2,224 of 166,300 song pages (English); the rest keep their indexing and SEO unchanged and simply carry no ads.

## Environments

| Where | Ads |
|---|---|
| `hugo server` | none (development environment) |
| CI build (`.github/workflows/ci.yml`) | built, never deployed |
| Netlify deploy previews / branch deploys | slots in HTML, loader refuses to run (host not allowed) |
| musicmetrics.net | after consent, if Adsterra is enabled or owner preview is on in that browser |
