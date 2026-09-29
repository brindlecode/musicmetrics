#!/usr/bin/env node
'use strict';
/**
 * YouTube Data API v3 — trending music videos per country, channel avatars
 * and view-count snapshots (used for "daily views" and the Billion Views Club).
 *
 * Cost: FREE. The YouTube Data API has a free daily quota of 10,000 units and
 * never bills: when the quota is used up, requests simply fail until the next
 * day. This script also enforces its own budget (UNIT_BUDGET, default 5,000)
 * so a daily run uses at most half of the free quota:
 *   ~1 unit per region (~110) + 1 per 50 tracked videos (≤ 60,000 → 1,200)
 *   + 1 per 50 channels + artist-channel discovery (the rest of the budget,
 *   minus a safety reserve): 1 unit per 50 uploads listed + 1 per 50 checked.
 *
 * Env: YOUTUBE_API_KEY
 * Output: store/raw/youtube_<cc>.json, store/raw/youtube_videos.json
 */
const path = require('path');
const { RAW_DIR, HISTORY_DIR, fetchJSON, mapLimit, splitArtists, writeJSON, readJSON, FEAT_RE, today } = require('./lib/common');
const { YOUTUBE } = require('./lib/countries');
const { parseArtistAndTitle } = require('./lib/youtube-parse');

const KEY = process.env.YOUTUBE_API_KEY;
const API = 'https://www.googleapis.com/youtube/v3';
const UNIT_BUDGET = Number(process.env.UNIT_BUDGET || 5000);
const MAX_TRACKED = 60000;
const RESERVE = 300;              // never spend the last units of the budget on discovery
const MAX_PAGES_PER_CHANNEL = 20; // up to 1,000 uploads per artist channel
const RESCAN_DAYS = 7;            // look for new uploads of fully scanned channels weekly
const MIN_SECONDS = 61;           // skip Shorts
let units = 0;

// Every API call below costs exactly 1 unit; stop before exceeding the budget.
async function yt(url, label) {
  if (units >= UNIT_BUDGET) throw new Error(`unit budget ${UNIT_BUDGET} reached`);
  units++;
  return fetchJSON(url, { retries: 2, label });
}

async function regions() {
  try {
    const d = await yt(`${API}/i18nRegions?part=snippet&hl=en&key=${KEY}`, 'youtube regions');
    const all = ((d && d.items) || []).map((r) => r.snippet.gl.toLowerCase());
    return [...new Set([...YOUTUBE, ...all])];
  } catch (e) {
    console.warn('  regions:', e.message.slice(0, 120));
    return YOUTUBE;
  }
}

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
    data = await yt(url, `youtube ${cc}`);
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

const seconds = (iso) => {
  const m = String(iso || '').match(/P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  return m ? (+m[1] || 0) * 86400 + (+m[2] || 0) * 3600 + (+m[3] || 0) * 60 + (+m[4] || 0) : 0;
};

async function fetchVideoStats(ids) {
  const out = {};
  for (let i = 0; i < ids.length; i += 50) {
    if (units >= UNIT_BUDGET) break;
    const batch = ids.slice(i, i + 50);
    try {
      const d = await yt(`${API}/videos?part=snippet,statistics,contentDetails&id=${batch.join(',')}&key=${KEY}`, 'youtube videos');
      for (const v of (d && d.items) || []) {
        out[v.id] = {
          views: Number(v.statistics.viewCount) || 0,
          title: v.snippet.title,
          channel: v.snippet.channelTitle,
          channel_id: v.snippet.channelId,
          category: v.snippet.categoryId,
          published: v.snippet.publishedAt,
          seconds: seconds(v.contentDetails && v.contentDetails.duration),
        };
      }
    } catch (e) { console.warn('  ', e.message.slice(0, 160)); }
  }
  return out;
}

/**
 * Walks the uploads playlist of every artist channel we know (from the
 * catalog), a few pages per channel per run, and returns newly found music
 * videos (category Music, longer than a Short). Scan progress is kept in
 * store/history/youtube_scan.json so the crawl resumes the next day.
 */
async function discover(known) {
  const file = path.join(HISTORY_DIR, 'youtube_scan.json');
  const scan = readJSON(file, {});
  const catalog = readJSON(path.join(HISTORY_DIR, '..', 'catalog', 'artists.json'), {});
  const channels = Object.entries(catalog)
    .filter(([, a]) => a.yc)
    .sort((x, y) => (y[1].ls || '').localeCompare(x[1].ls || '') || (x[1].b ? x[1].b.r : 999) - (y[1].b ? y[1].b.r : 999))
    .map(([slug, a]) => ({ slug, ch: a.yc }));
  const day = today();
  const due = channels.filter(({ ch }) => {
    const st = scan[ch];
    if (!st) return true;
    if (!st.done) return true;
    return !st.last || (Date.parse(day) - Date.parse(st.last)) / 864e5 >= RESCAN_DAYS;
  });
  const found = new Map(); // videoId -> artist slug
  let pages = 0;
  for (let round = 0; round < 5; round++) {
    let progressed = false;
    for (const { slug, ch } of due) {
      if (units >= UNIT_BUDGET - RESERVE - Math.ceil(found.size / 50) - 1) break;
      const st = scan[ch] || (scan[ch] = { a: slug, pages: 0, done: false });
      if (st.last === day && st.done) continue;
      if (st.done && round > 0) continue; // fully scanned: first page only
      if (!st.done && st.pages >= MAX_PAGES_PER_CHANNEL) { st.done = true; st.next = null; continue; }
      const token = st.done ? '' : (st.next || '');
      const uploads = 'UU' + ch.slice(2);
      try {
        const d = await yt(`${API}/playlistItems?part=contentDetails&maxResults=50&playlistId=${uploads}${token ? `&pageToken=${token}` : ''}&key=${KEY}`, 'youtube uploads');
        pages++;
        progressed = true;
        for (const it of (d && d.items) || []) {
          const id = it.contentDetails && it.contentDetails.videoId;
          if (id && !known.has(id)) found.set(id, slug);
        }
        st.a = slug;
        if (!st.done) {
          st.pages++;
          st.next = (d && d.nextPageToken) || null;
          if (!st.next) st.done = true;
        }
        if (st.done) st.last = day;
      } catch (e) {
        // Playlist missing (channel deleted / no uploads): don't retry every day.
        st.done = true; st.last = day; st.next = null;
      }
    }
    if (!progressed) break;
  }
  const stats = await fetchVideoStats([...found.keys()]);
  const kept = {};
  for (const [id, v] of Object.entries(stats)) {
    if (v.category !== '10' || v.seconds < MIN_SECONDS) continue;
    kept[id] = { ...v, artist: found.get(id) };
  }
  writeJSON(file, scan);
  const scanned = Object.values(scan).filter((x) => x.done).length;
  console.log(`  discovery: ${pages} upload pages, ${found.size} new ids, ${Object.keys(kept).length} music videos kept; channels fully scanned ${scanned}/${channels.length}`);
  return kept;
}

async function fetchChannels(ids) {
  const out = {};
  for (let i = 0; i < ids.length; i += 50) {
    const batch = ids.slice(i, i + 50);
    try {
      const d = await yt(`${API}/channels?part=snippet,statistics&id=${batch.join(',')}&key=${KEY}`, 'youtube channels');
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

  const codes = await regions();
  const charts = (await mapLimit(codes, 6, fetchRegion)).filter(Boolean);
  for (const c of charts) writeJSON(path.join(RAW_DIR, `${c.id}.json`), c);
  console.log(`  charts: ${charts.length}/${codes.length} regions`);
  if (!charts.length) { console.error('No YouTube charts fetched.'); process.exitCode = 1; return; }

  // View snapshots: every video currently charting + everything we have ever
  // tracked (biggest first) + seeds, capped at MAX_TRACKED videos.
  const views = readJSON(path.join(HISTORY_DIR, 'youtube_views.json'), {});
  const tracked = Object.entries(views).sort((a, b) => (b[1].v || 0) - (a[1].v || 0)).slice(0, MAX_TRACKED).map(([id]) => id);
  const current = charts.flatMap((c) => c.items.map((i) => i.video_id));
  const ids = [...new Set([...current, ...SEED_VIDEOS, ...tracked])].slice(0, MAX_TRACKED);
  const stats = await fetchVideoStats(ids);
  console.log(`  video stats: ${Object.keys(stats).length}/${ids.length}`);

  const channelIds = [...new Set([...charts.flatMap((c) => c.items.map((i) => i.channel_id)), ...Object.values(stats).map((s) => s.channel_id)])];
  const channels = await fetchChannels(channelIds.slice(0, 2000));
  console.log(`  channels: ${Object.keys(channels).length}`);

  // Artist-channel discovery with whatever budget is left.
  const room = MAX_TRACKED - Object.keys(views).length;
  const fresh = room > 0 ? await discover(new Set([...Object.keys(views), ...ids])) : {};
  Object.assign(stats, fresh);
  console.log(`  quota used: ${units} of 10,000 free units (budget ${UNIT_BUDGET})`);

  writeJSON(path.join(RAW_DIR, 'youtube_videos.json'), { fetched: new Date().toISOString(), videos: stats, channels });
}

main().catch((e) => { console.error('FATAL', e); process.exitCode = 1; });

