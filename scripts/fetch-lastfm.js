#!/usr/bin/env node
'use strict';
/**
 * Last.fm — optional (free API key: https://www.last.fm/api/account/create).
 * Global + per-country top tracks, measured by listeners.
 *
 * Env: LASTFM_API_KEY
 * Output: store/raw/lastfm_<cc>.json
 */
const path = require('path');
const { RAW_DIR, fetchJSON, mapLimit, splitArtists, cleanTitle, writeJSON } = require('./lib/common');
const { YOUTUBE } = require('./lib/countries');

const KEY = process.env.LASTFM_API_KEY;
const API = 'https://ws.audioscrobbler.com/2.0/';
const enName = new Intl.DisplayNames(['en'], { type: 'region' });

async function fetchChart(cc) {
  const url = cc === 'global'
    ? `${API}?method=chart.gettoptracks&limit=100&api_key=${KEY}&format=json`
    : `${API}?method=geo.gettoptracks&country=${encodeURIComponent(enName.of(cc.toUpperCase()))}&limit=100&api_key=${KEY}&format=json`;
  let d;
  try { d = await fetchJSON(url, { retries: 2, label: `lastfm ${cc}` }); } catch (e) { console.warn('  ', e.message.slice(0, 120)); return null; }
  const list = d && d.tracks && d.tracks.track;
  if (!list || !list.length) return null;
  const items = list.map((t, i) => ({
    rank: i + 1,
    title: cleanTitle(t.name),
    artist: (t.artist || {}).name || '',
    artists: splitArtists((t.artist || {}).name || ''),
    listeners: Number(t.listeners) || 0,
    playcount: Number(t.playcount) || 0,
    url: t.url,
  }));
  return { id: `lastfm_${cc}`, platform: 'lastfm', type: 'songs', country: cc, fetched: new Date().toISOString(), items };
}

async function main() {
  console.log('=== Last.fm ===');
  if (!KEY) { console.log('LASTFM_API_KEY not set — skipping (optional).'); return; }
  const codes = ['global', ...YOUTUBE];
  const charts = (await mapLimit(codes, 4, fetchChart)).filter(Boolean);
  for (const c of charts) writeJSON(path.join(RAW_DIR, `${c.id}.json`), c);
  console.log(`  charts: ${charts.length}/${codes.length}`);
}

main().catch((e) => { console.error('FATAL', e); process.exitCode = 1; });
