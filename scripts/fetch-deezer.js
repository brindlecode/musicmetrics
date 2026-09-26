#!/usr/bin/env node
'use strict';
/**
 * Deezer — public API (no key). Country charts are the official
 * "Top <Country>" playlists published by the "Deezer Charts" account.
 *
 * Output: store/raw/deezer_<cc>.json (cc = "global" for Top Worldwide)
 */
const path = require('path');
const { RAW_DIR, fetchJSON, mapLimit, splitArtists, cleanTitle, writeJSON, sleep } = require('./lib/common');
const { EN_NAME_TO_CC } = require('./lib/countries');

const API = 'https://api.deezer.com';
const DEEZER_CHARTS_USER = 637006841;

function ccFromTitle(title) {
  const m = String(title).match(/^Top\s+(.+?)(?:\s*[-–(].*)?$/i);
  if (!m) return null;
  const name = m[1].trim().toLowerCase();
  if (name === 'worldwide' || name === 'world' || name === 'global') return 'global';
  return EN_NAME_TO_CC[name] || null;
}

async function discoverPlaylists() {
  const found = {};
  let url = `${API}/user/${DEEZER_CHARTS_USER}/playlists?limit=100`;
  for (let page = 0; url && page < 5; page++) {
    let d;
    try { d = await fetchJSON(url, { label: 'deezer playlists' }); } catch (e) { console.warn('  ', e.message); break; }
    if (!d || d.error) break;
    for (const p of d.data || []) {
      const cc = ccFromTitle(p.title);
      if (cc && !found[cc]) found[cc] = p.id;
    }
    url = d.next;
  }
  if (!found.global) {
    // Fallback: search for the worldwide playlist.
    try {
      const d = await fetchJSON(`${API}/search/playlist?q=${encodeURIComponent('Top Worldwide')}&limit=25`, { label: 'deezer search' });
      const hit = ((d && d.data) || []).find((p) => /deezer charts/i.test((p.user || {}).name || '') && /top worldwide/i.test(p.title));
      if (hit) found.global = hit.id;
    } catch (e) { console.warn('  ', e.message); }
  }
  return found;
}

async function fetchPlaylist(cc, id) {
  let d;
  const url = id === 'chart' ? `${API}/chart/0/tracks?limit=100` : `${API}/playlist/${id}/tracks?limit=100`;
  try { d = await fetchJSON(url, { label: `deezer ${cc}` }); } catch (e) { console.warn('  ', e.message); return null; }
  if (!d || !d.data || !d.data.length) return null;
  const items = d.data.map((t, i) => ({
    rank: i + 1,
    title: cleanTitle(t.title_short || t.title),
    artist: (t.artist || {}).name || '',
    artists: splitArtists((t.artist || {}).name || ''),
    deezer_id: t.id,
    deezer_artist_id: (t.artist || {}).id,
    image: (t.album || {}).cover_medium || '',
    image_large: (t.album || {}).cover_xl || '',
    artist_image: (t.artist || {}).picture_medium || '',
    url: t.link,
    album: (t.album || {}).title || '',
    duration: t.duration,
    explicit: !!t.explicit_lyrics,
    deezer_rank: t.rank,
  }));
  await sleep(150);
  return { id: `deezer_${cc}`, platform: 'deezer', type: 'songs', country: cc, playlist_id: id, fetched: new Date().toISOString(), items };
}

async function main() {
  console.log('=== Deezer ===');
  const lists = await discoverPlaylists();
  console.log(`  playlists found: ${Object.keys(lists).length}`);
  // Last resort for the worldwide chart: the editorial "all genres" chart.
  if (!lists.global) lists.global = 'chart';
  const entries = Object.entries(lists);
  const charts = (await mapLimit(entries, 3, ([cc, id]) => fetchPlaylist(cc, id))).filter(Boolean);
  for (const c of charts) writeJSON(path.join(RAW_DIR, `${c.id}.json`), c);
  console.log(`  charts: ${charts.length}`);
}

main().catch((e) => { console.error('FATAL', e); process.exitCode = 1; });
