#!/usr/bin/env node
'use strict';
/**
 * YouTube Data API v3 — trending music videos per country, channel avatars
 * and view-count snapshots (used for "daily views" and the Billion Views Club).
 *
 * Quota cost per run: ~1 unit per region + 1 per 50 channels + 1 per 50
 * tracked videos  ->  well under 400 units (free tier: 10,000/day).
 *
 * Env: YOUTUBE_API_KEY
 * Output: store/raw/youtube_<cc>.json, store/raw/youtube_videos.json
 */
const path = require('path');
const { RAW_DIR, HISTORY_DIR, fetchJSON, mapLimit, splitArtists, writeJSON, readJSON, FEAT_RE } = require('./lib/common');
const { YOUTUBE } = require('./lib/countries');
const { parseArtistAndTitle } = require('./lib/youtube-parse');

const KEY = process.env.YOUTUBE_API_KEY;
const API = 'https://www.googleapis.com/youtube/v3';

// Well-known billion-view music videos. The API response is the source of
// truth: anything under 1B views (or not music) is filtered out later.
const SEED_VIDEOS = [
  'kJQP7kiw5Fk', 'XqZsoesa55w', 'JGwWNGJdvx8', 'RgKAFK5djSk', '9bZkp7q19f0', 'OPf0YbXqDm0', 'CevxZvSJLk8',
  'hT_nvWreIhg', 'fRh_vgS2dFE', 'YQHsXMglC9A', 'nfWlot6h_JM', 'e-ORhEE9VVg', '09R8_2nJtjg', 'pRpeEdMmmQ0',
  'kffacxfA7G4', '60ItHLz5WEA', 'lp-EO5I60KA', 'RBumgq5yVrA', '2Vv-BfVoq4g', '7PCkvCPvDXk', 'uelHwf8o7_U',
  'QcIy9NiNbmo', '0KSOMA3QBU0', '450p7goxZqg', 'lWA2pjMjpBs', 'DyDfgMOUjCI', 'gdZLi9oWNZg', 'IHNzOHi8sJs',
  '2S24-y0Ij3Y', 'ioNng23DkIM', '4NRXx6U8ABQ', 'H5v3kku4y6Q', 'ekr2nIex040', 'IcrbM1l_BoI', 'vx2u5uUu3DE',
  'fJ9rUzIMcZQ', 'hTWKbfoikeg', '1w7OgIMMRc4', 'djV11Xbc914', 'rYEDA3JcQqw', 'hLQl3WQQoQ0', '8UVNT4wvIGY',
  'ktvTqknDobU', '7wtfhZwyrcc', 'mWRsgZuwf_8', 'pXRviuL6vMY', 'PT2_F-1esPk', '34Na4j8AVgA', 'kXYiU_JCYtU',
  'eVTXPUF4Oz4', 'ZbZSe6N_BXs', 'LjhCEhWiKXk', 'aJOTlE1K90k', '3AtDnEC4zak', 'nYh-n7EOtMA', 'K4DyBUG242c',
  'hHUbLv4ThOo', 'lDK9QqIzhwk', 'TUVcZfQe-Kw', 'ApXoWvfEYVU', '1G4isv_Fylg', 'YykjpeuMNEk', 'papuvlVeZg8',
  'y6Sxv-sUYtM', 'UtF6Jej8yb4', 'SlPhMPnQ58k', 'lY2yjAdbvdQ', 'bo_efYhYU2A', 'YR5ApYxkU-U', 'ru0K8uYEZWw',
];

async function fetchRegion(cc) {
  const url = `${API}/videos?part=snippet,statistics,contentDetails&chart=mostPopular&videoCategoryId=10&regionCode=${cc.toUpperCase()}&maxResults=50&key=${KEY}`;
  let data;
  try {
    data = await fetchJSON(url, { retries: 2, label: `youtube ${cc}` });
  } catch (e) {
    console.warn(`  youtube ${cc}: ${e.message.slice(0, 160)}`);
    return null;
  }
  if (!data || !data.items || !data.items.length) return null;
  const items = data.items.map((v, i) => {
    const sn = v.snippet || {};
    const { artist, title, label } = parseArtistAndTitle(sn.title || '', sn.channelTitle || '');
    return {
      rank: i + 1,
      title,
      raw_title: sn.title,
      artist,
      artists: [...new Set([...splitArtists(artist), ...splitArtists((title.match(FEAT_RE) || [])[1] || '')])],
      label: !!label,
      channel: sn.channelTitle,
      channel_id: sn.channelId,
      video_id: v.id,
      image: `https://i.ytimg.com/vi/${v.id}/mqdefault.jpg`,
      url: `https://www.youtube.com/watch?v=${v.id}`,
      views: Number(v.statistics && v.statistics.viewCount) || 0,
      likes: Number(v.statistics && v.statistics.likeCount) || 0,
      published: sn.publishedAt,
      duration: v.contentDetails && v.contentDetails.duration,
    };
  });
  return { id: `youtube_${cc}`, platform: 'youtube', type: 'videos', country: cc, fetched: new Date().toISOString(), items };
}

async function fetchVideoStats(ids) {
  const out = {};
  for (let i = 0; i < ids.length; i += 50) {
    const batch = ids.slice(i, i + 50);
    try {
      const d = await fetchJSON(`${API}/videos?part=snippet,statistics&id=${batch.join(',')}&key=${KEY}`, { retries: 2, label: 'youtube videos' });
      for (const v of (d && d.items) || []) {
        out[v.id] = {
          views: Number(v.statistics.viewCount) || 0,
          title: v.snippet.title,
          channel: v.snippet.channelTitle,
          channel_id: v.snippet.channelId,
          category: v.snippet.categoryId,
          published: v.snippet.publishedAt,
        };
      }
    } catch (e) { console.warn('  ', e.message.slice(0, 160)); }
  }
  return out;
}

async function fetchChannels(ids) {
  const out = {};
  for (let i = 0; i < ids.length; i += 50) {
    const batch = ids.slice(i, i + 50);
    try {
      const d = await fetchJSON(`${API}/channels?part=snippet,statistics&id=${batch.join(',')}&key=${KEY}`, { retries: 2, label: 'youtube channels' });
      for (const c of (d && d.items) || []) {
        const th = c.snippet.thumbnails || {};
        out[c.id] = {
          title: c.snippet.title,
          image: (th.medium || th.default || {}).url || '',
          subscribers: Number(c.statistics.subscriberCount) || 0,
          views: Number(c.statistics.viewCount) || 0,
          videos: Number(c.statistics.videoCount) || 0,
        };
      }
    } catch (e) { console.warn('  ', e.message.slice(0, 160)); }
  }
  return out;
}

async function main() {
  console.log('=== YouTube ===');
  if (!KEY) { console.log('YOUTUBE_API_KEY not set — skipping.'); return; }

  const charts = (await mapLimit(YOUTUBE, 6, fetchRegion)).filter(Boolean);
  for (const c of charts) writeJSON(path.join(RAW_DIR, `${c.id}.json`), c);
  console.log(`  charts: ${charts.length}/${YOUTUBE.length} regions`);
  if (!charts.length) { console.error('No YouTube charts fetched.'); process.exitCode = 1; return; }

  // View snapshots: every video currently charting + everything we tracked
  // recently + seeds. Only the top ~1500 by views are refreshed to cap quota.
  const views = readJSON(path.join(HISTORY_DIR, 'youtube_views.json'), {});
  const tracked = Object.entries(views).sort((a, b) => (b[1].v || 0) - (a[1].v || 0)).slice(0, 1500).map(([id]) => id);
  const current = charts.flatMap((c) => c.items.map((i) => i.video_id));
  const ids = [...new Set([...current, ...tracked, ...SEED_VIDEOS])];
  const stats = await fetchVideoStats(ids);
  console.log(`  video stats: ${Object.keys(stats).length}/${ids.length}`);

  const channelIds = [...new Set([...charts.flatMap((c) => c.items.map((i) => i.channel_id)), ...Object.values(stats).map((s) => s.channel_id)])];
  const channels = await fetchChannels(channelIds);
  console.log(`  channels: ${Object.keys(channels).length}`);

  writeJSON(path.join(RAW_DIR, 'youtube_videos.json'), { fetched: new Date().toISOString(), videos: stats, channels });
}

main().catch((e) => { console.error('FATAL', e); process.exitCode = 1; });

