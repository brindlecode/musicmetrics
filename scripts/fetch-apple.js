#!/usr/bin/env node
'use strict';
/**
 * Apple Music — public "Most Played" RSS feeds (no API key needed).
 * Songs and albums, top 100, for every storefront in lib/countries.js.
 *
 * Output: store/raw/apple_<cc>.json, store/raw/apple-albums_<cc>.json
 */
const path = require('path');
const { RAW_DIR, fetchJSON, mapLimit, splitArtists, cleanTitle, writeJSON } = require('./lib/common');
const { APPLE } = require('./lib/countries');

const art = (u, size) => (u || '').replace(/\/\d+x\d+bb\./, `/${size}x${size}bb.`);

async function fetchFeed(cc, kind) {
  const url = `https://rss.marketingtools.apple.com/api/v2/${cc}/music/most-played/100/${kind}.json`;
  let data;
  try {
    data = await fetchJSON(url, { retries: 2, label: `apple ${kind} ${cc}` });
  } catch (e) {
    console.warn(`  apple ${kind} ${cc}: ${e.message.slice(0, 120)}`);
    return null;
  }
  const results = data && data.feed && data.feed.results;
  if (!results || !results.length) return null;
  const items = results.map((r, i) => ({
    rank: i + 1,
    title: cleanTitle(r.name),
    artist: r.artistName,
    artists: splitArtists(r.artistName),
    apple_id: r.id,
    apple_artist_id: r.artistId,
    image: art(r.artworkUrl100, 200),
    image_large: art(r.artworkUrl100, 600),
    url: r.url,
    artist_url: r.artistUrl,
    release: r.releaseDate,
    genre: ((r.genres || []).find((g) => g.name !== 'Music') || {}).name || '',
    explicit: r.contentAdvisoryRating === 'Explict' || r.contentAdvisoryRating === 'Explicit',
  }));
  const platform = kind === 'songs' ? 'apple' : 'apple-albums';
  return { id: `${platform}_${cc}`, platform, type: kind, country: cc, fetched: new Date().toISOString(), items };
}

async function main() {
  console.log('=== Apple Music ===');
  const jobs = APPLE.flatMap((cc) => [[cc, 'songs'], [cc, 'albums']]);
  const feeds = (await mapLimit(jobs, 6, ([cc, kind]) => fetchFeed(cc, kind))).filter(Boolean);
  for (const f of feeds) writeJSON(path.join(RAW_DIR, `${f.id}.json`), f);
  console.log(`  feeds: ${feeds.length}/${jobs.length}`);
}

main().catch((e) => { console.error('FATAL', e); process.exitCode = 1; });
