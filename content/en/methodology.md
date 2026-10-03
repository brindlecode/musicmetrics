---
title: "Methodology: how MusicMetrics charts are calculated"
description: "Data sources, update schedule and the exact formula behind the MusicMetrics Global 200, movement arrows, peaks and days on chart."
schemaType: "WebPage"
---

This page explains exactly where our numbers come from and how they are calculated, so that anyone can verify or cite them.

## Data sources

| Platform | What we collect | Coverage |
|---|---|---|
| YouTube | Trending music videos (official YouTube Data API), view counts, channel statistics | ~110 countries, top 50 |
| Apple Music | "Most Played" songs and albums (official Apple Marketing Tools RSS) | ~170 storefronts, top 100 |
| iTunes | Top-selling songs (official iTunes Store RSS) | ~170 storefronts, top 100 |
| Deezer | Official "Top &lt;Country&gt;" playlists published by Deezer Charts (public Deezer API) | Worldwide + country charts, top 100 |
| Last.fm | Top tracks by listeners (official Last.fm API), when enabled | Worldwide + countries |

All data is collected automatically **every day**. If a source is temporarily unavailable, the last successful version is kept for up to 5 days and is clearly timestamped.

## Movement, peak and days on chart

- **Movement (▲ ▼ =)** compares a song's position today with its position on the previous day the chart was collected.
- **NEW** marks a song that has never appeared on that chart since tracking began. **RE** marks a re-entry.
- **Peak** is the best position ever reached on that chart since tracking began.
- **Days** counts the distinct days the song appeared on that chart.

## The MusicMetrics Global 200

Every position on every song chart earns points:

`points = platform weight × market weight × ((N + 1 − rank) / N) ^ 1.5`

where *N* is the length of the chart (50 or 100). The exponent rewards top positions more than a straight line would.

- **Platform weight:** YouTube 1.0, Apple Music 1.0, iTunes 0.6, Deezer 0.6, Last.fm 0.5.
- **Market weight:** based on the size of each recorded-music market — United States 3.0; Japan, United Kingdom, Germany 2.5; France, South Korea, Brazil, Canada, Australia 2.0; Mexico, Italy, Spain, India 1.6; Netherlands 1.5; Sweden, Indonesia, Türkiye 1.4; Philippines, Poland 1.3; all other countries 1.0. Worldwide charts count as 3.0.

A song's points are summed across all charts and the 200 highest totals form the Global 200. The **points** column is shown relative to the No. 1 song (= 100).

Songs are matched across platforms by their primary artist and title (ignoring "feat." credits, video suffixes such as "Official Video", accents and letter case).

## Artist ranking

Artists earn the points of their songs — full points as the primary artist, half points as a featured artist — summed across all charts.

## YouTube daily views

We store a view-count snapshot for each tracked video every day. Daily views are the difference between the latest snapshot and the one closest to 24 hours earlier, scaled to exactly 24 hours.

## Limitations

- Platforms publish rankings, not stream counts, for most charts; we do not estimate streams we cannot measure.
- YouTube "trending" is YouTube's own selection of popular music videos in a country, not a pure view ranking.
- Artist names are normalized automatically; if you spot a mistake, please [let us know](/contact/).
- **Spotify:** Spotify does not offer its charts through a public API and its terms do not allow collecting them automatically. Each week we download Spotify's official weekly charts (Top Songs and Top Artists) by hand from charts.spotify.com and publish the top 20 songs and top 10 artists with attribution and a link to the [full chart](https://charts.spotify.com/); stream counts are not republished, and Spotify is not part of the Global 200 score. Artist pages also link to the artist on Spotify (IDs from Wikidata, CC0).
