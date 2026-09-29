#!/usr/bin/env node
'use strict';
/**
 * Apple — public feeds, no API key, no cost.
 *   - Apple Music "Most Played" songs + albums (rss.marketingtools.apple.com)
 *   - iTunes Store top-selling songs (legacy itunes.apple.com RSS)
 * for every storefront in lib/countries.js. Storefronts without a feed are skipped.
 *
 * Output: store/raw/apple_<cc>.json, apple-albums_<cc>.json, itunes_<cc>.json
 */
const path = require('path');
const { RAW_DIR, fetchJSON, mapLimit, splitArtists, cleanTitle, writeJSON } = require('./lib/common');
const { APPLE } = require('./lib/countries');

const art = (u, size) => (u || '').replace(/\/\d+x\d+(bb)?\./, `/${size}x${size}bb.`);
const list = (x) => (Array.isArray(x) ? x : x ? [x] : []);

async function fetchFeed(cc, kind) {
  const url = `https://rss.marketingtools.apple.com/api/v2/${cc}/music/most-played/100/${kind}.json`;
  let data;
  try {
    data = await fetchJSON(url, { retries: 1, label: `apple ${kind} ${cc}` });
  } catch (e) {
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

async function fetchItunes(cc) {
  let data;
  try {
    data = await fetchJSON(`https://itunes.apple.com/${cc}/rss/topsongs/limit=100/json`, { retries: 1, label: `itunes ${cc}` });
  } catch (e) {
    return null;
  }
  const entries = list(data && data.feed && data.feed.entry);
  if (!entries.length) return null;
  const items = entries.map((e, i) => {
    const imgs = list(e['im:image']);
    const img = (imgs[imgs.length - 1] || {}).label || '';
    const link = list(e.link).find((l) => l.attributes && l.attributes.rel === 'alternate') || list(e.link)[0] || {};
    const artist = (e['im:artist'] || {}).label || '';
    return {
      rank: i + 1,
      title: cleanTitle((e['im:name'] || {}).label || ''),
      artist,
      artists: splitArtists(artist),
      apple_id: ((e.id || {}).attributes || {})['im:id'] || '',
      image: art(img, 200),
      image_large: art(img, 600),
      url: (link.attributes || {}).href || '',
      artist_url: ((e['im:artist'] || {}).attributes || {}).href || '',
      release: ((e['im:releaseDate'] || {}).label || '').slice(0, 10),
      genre: (((e.category || {}).attributes) || {}).label || '',
    };
  }).filter((x) => x.title && x.artist);
  if (!items.length) return null;
  return { id: `itunes_${cc}`, platform: 'itunes', type: 'songs', country: cc, fetched: new Date().toISOString(), items };
}

async function main() {
  console.log('=== Apple Music + iTunes ===');
  const jobs = APPLE.flatMap((cc) => [[cc, 'songs'], [cc, 'albums'], [cc, 'itunes']]);
  const feeds = (await mapLimit(jobs, 10, ([cc, kind]) => (kind === 'itunes' ? fetchItunes(cc) : fetchFeed(cc, kind)))).filter(Boolean);
  for (const f of feeds) writeJSON(path.join(RAW_DIR, `${f.id}.json`), f);
  const by = (p) => feeds.filter((f) => f.platform === p).length;
  console.log(`  apple songs: ${by('apple')}, apple albums: ${by('apple-albums')}, itunes: ${by('itunes')} (of ${APPLE.length} storefronts)`);
}

main().catch((e) => { console.error('FATAL', e); process.exitCode = 1; });
