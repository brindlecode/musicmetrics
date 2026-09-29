# MusicMetrics

> Live music charts & streaming statistics for every country — YouTube, Apple Music, Deezer (and optionally Last.fm) — plus the cross-platform **Global 200**. https://musicmetrics.net

## How it works

```
GitHub Actions (every 6h)                                   Netlify (static hosting)
  scripts/fetch-youtube.js  ─┐                                        ▲
  scripts/fetch-apple.js    ─┼─► store/raw ─► scripts/build-data.js ─┤  hugo --minify ─► public/ ─► netlify deploy
  scripts/fetch-deezer.js   ─┤              (history, Global 200,     │
  scripts/fetch-lastfm.js   ─┘               artists, songs, weekly)  └─► data/*.json (generated, not committed)
```

- **Static site generator:** Hugo extended 0.142 — pages for charts, countries, artists, songs and weekly recaps are generated from `data/*.json` by content adapters (`content/_gen/**/_content.gotmpl`), so no content files are committed per artist/song.
- **History:** `store/history/*.json` keeps every chart position for 14 days (older days are folded into peak/days counters) → movement arrows, NEW/RE, peak, days on chart, weekly recaps.
- **YouTube daily views:** view-count snapshots every day (`store/history/youtube_views.json`).
- **Languages:** English at `/`, plus `/tr/ /es/ /pt/ /de/ /fr/ /ja/` (UI strings in `i18n/`, static pages in `content/<lang>/`).
- **SEO/AEO/GEO:** localized titles & descriptions, hreflang, canonical, JSON-LD (Organization, WebSite+SearchAction, BreadcrumbList, ItemList, Dataset, MusicGroup, MusicRecording, Article, FAQPage), answer boxes, `llms.txt` with live data, sitemap per language, IndexNow ping, AI crawlers allowed in `robots.txt`.

- **Storage:** `store/` is committed: `history/` (positions), `catalog/` (every song & artist that ever charted — pages stay online for 180 days after they leave the charts), `charts/` (last good copy of every chart, used if a source fails), `weekly/` (weekly recap archive), `cache/`. `data/` is regenerated from it on every build (`node scripts/build-data.js --offline` needs no network).
- **Schedule:** once a day (05:17 UTC).

## Data sources (all free)

| Source | Key needed | Script |
|---|---|---|
| YouTube Data API v3 (trending music, views, channels) | `YOUTUBE_API_KEY` | `fetch-youtube.js` |
| Apple Music "Most Played" RSS (songs + albums) + iTunes top songs, ~170 storefronts | no | `fetch-apple.js` |
| Deezer API (Deezer Charts playlists, artist fans) | no | `fetch-deezer.js` |
| Last.fm API (optional) | `LASTFM_API_KEY` | `fetch-lastfm.js` |

## Repository secrets (Settings → Secrets and variables → Actions)

| Secret | Required | What |
|---|---|---|
| `YOUTUBE_API_KEY` | yes | Google Cloud → YouTube Data API v3 key |
| `NETLIFY_AUTH_TOKEN` | yes | https://app.netlify.com/user/applications → Personal access tokens |
| `NETLIFY_SITE_ID` | yes | `01306bca-34a8-4f76-996a-3f6c3e92b6b7` (musicmetrics-net) |
| `LASTFM_API_KEY` | optional | https://www.last.fm/api/account/create |

## Monetization & tracking settings (`hugo.toml` → `[params]`)

- `ads.adsenseClient` (+ optional `slotInline`, `slotSidebar`, `slotFooter`) — ads and `/ads.txt` appear automatically.
- `affiliate.appleToken`, `affiliate.amazonTag`, `affiliate.ticketsUrl` — added to every Listen/Buy button.
- `analytics.ga4`, `analytics.clarity`, `analytics.cloudflare`; `verify.google`, `verify.bing`, `verify.yandex`.

## Local development

```bash
node scripts/fetch-apple.js && node scripts/fetch-deezer.js        # no keys needed
YOUTUBE_API_KEY=xxx node scripts/fetch-youtube.js
node scripts/build-data.js            # add --offline to skip Deezer artist lookups
hugo server                           # http://localhost:1313
```

Simulate another day for history testing: `MM_NOW=2026-01-02T10:00:00Z node scripts/build-data.js --offline`.

## License

Code: MIT. Chart data belongs to the respective platforms; MusicMetrics is not affiliated with YouTube, Apple, Deezer, Spotify or Last.fm.
