#!/usr/bin/env node
'use strict';
/**
 * Turns raw platform fetches (store/raw) into everything the site renders
 * (data/*), and keeps the long-term history (store/history) that powers
 * change arrows, peaks, days-on-chart, daily YouTube views and weekly recaps.
 *
 *   node scripts/build-data.js            # normal run
 *   node scripts/build-data.js --offline  # skip network enrichment
 */
const fs = require('fs');
const path = require('path');
const {
  RAW_DIR, HISTORY_DIR, CACHE_DIR, DATA_DIR,
  fetchJSON, sleep, slugify, songKey, splitArtists, readJSON, writeJSON, today, now,
} = require('./lib/common');
const { loadSpotifyWeekly, annotate } = require('./lib/spotify-weekly');
const C = require('./lib/countries');
const { LABEL_RE, parseArtistAndTitle } = require('./lib/youtube-parse');

const OFFLINE = process.argv.includes('--offline');
const NOW = now();
const TODAY = today();
const STALE_DAYS = 5;
// Every song/artist seen on any chart in the last KEEP_DAYS keeps its page
// (the catalog only grows); the most popular ones are also translated.
const KEEP_DAYS = 180;
const LOC_SONGS = 1500;
const LOC_ARTISTS = 1500;
const ENRICH_PER_RUN = 1000;

const STORE_DIR = path.join(path.dirname(HISTORY_DIR));
const STORE_CHARTS = path.join(STORE_DIR, 'charts');
const CATALOG_DIR = path.join(STORE_DIR, 'catalog');
const WEEKLY_STORE = path.join(STORE_DIR, 'weekly');

const PLATFORM_WEIGHT = { youtube: 1, apple: 1, itunes: 0.6, deezer: 0.6, lastfm: 0.5 };
const PLATFORMS = ['youtube', 'apple', 'itunes', 'apple-albums', 'deezer', 'lastfm'];

const daysBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5);

// ---------------------------------------------------------------- history ---

/**
 * Updates a chart's history with today's ranking and returns per-item stats.
 * history = { dates: [...], items: { key: { f: first, l: last, r: {date: rank}, d0, p0, pd0 } } }
 * Ranks are kept for the last 14 chart-dates; older ones are folded into
 * d0 (days) / p0 (peak) so the file stays small. Re-running on the same day
 * simply overwrites today's ranks.
 */
function applyHistory(chartId, entries) {
  const file = path.join(HISTORY_DIR, `${chartId}.json`);
  const h = readJSON(file, { dates: [], items: {} });
  const prevDate = [...h.dates].reverse().find((d) => d < TODAY) || null;
  if (!h.dates.includes(TODAY)) h.dates.push(TODAY);
  h.dates = h.dates.slice(-60);
  const keep = new Set(h.dates.slice(-14));

  for (const [k, it] of Object.entries(h.items)) {
    delete it.r[TODAY];
    if (!Object.keys(it.r).length && !it.d0) delete h.items[k];
  }

  const stats = {};
  for (const { key, rank } of entries) {
    const it = h.items[key] || (h.items[key] = { f: TODAY, r: {} });
    const prev = prevDate ? it.r[prevDate] : undefined;
    it.r[TODAY] = rank;
    it.l = TODAY;
    let peak = it.p0 || 9999; let pd = it.pd0 || '';
    for (const [d, r] of Object.entries(it.r)) if (r < peak || (r === peak && d < pd)) { peak = r; pd = d; }
    let change;
    if (prev !== undefined) change = prev - rank;
    else change = it.f === TODAY ? 'new' : 're';
    stats[key] = { change, peak, peak_date: pd, days: (it.d0 || 0) + Object.keys(it.r).length, first: it.f };
  }

  for (const [k, it] of Object.entries(h.items)) {
    for (const [d, r] of Object.entries(it.r)) {
      if (keep.has(d)) continue;
      it.d0 = (it.d0 || 0) + 1;
      if (!it.p0 || r < it.p0) { it.p0 = r; it.pd0 = d; }
      delete it.r[d];
    }
    if (daysBetween(it.l || it.f, TODAY) > 90) delete h.items[k];
  }
  writeJSON(file, h);
  return stats;
}

// ------------------------------------------------------------- load raw ---

function loadCharts() {
  const charts = {};
  const fresh = new Set();
  if (fs.existsSync(RAW_DIR)) {
    for (const f of fs.readdirSync(RAW_DIR)) {
      if (!f.endsWith('.json') || f === 'youtube_videos.json') continue;
      const c = readJSON(path.join(RAW_DIR, f));
      if (c && c.items && c.items.length) { charts[c.id] = c; fresh.add(c.id); }
    }
  }
  // Keep last good data for sources that failed this run (unless stale).
  const legacy = path.join(DATA_DIR, 'charts');
  const chartsDir = fs.existsSync(STORE_CHARTS) ? STORE_CHARTS : legacy;
  if (fs.existsSync(chartsDir)) {
    for (const f of fs.readdirSync(chartsDir)) {
      const id = f.replace(/\.json$/, '');
      if (charts[id] || id === 'global') continue;
      const c = readJSON(path.join(chartsDir, f));
      if (!c || !c.items || !c.updated) continue;
      if (daysBetween(c.updated, NOW.toISOString()) > STALE_DAYS) continue;
      charts[id] = { ...c, _prev: true };
    }
  }
  return { charts, fresh };
}

// ------------------------------------------------------ youtube views -----

function updateYoutubeViews(charts) {
  const file = path.join(HISTORY_DIR, 'youtube_views.json');
  const hist = readJSON(file, {});
  const raw = readJSON(path.join(RAW_DIR, 'youtube_videos.json'), null);
  const ts = NOW.toISOString();
  const meta = {};
  for (const c of Object.values(charts)) {
    if (c.platform !== 'youtube') continue;
    for (const i of c.items) meta[i.video_id] = meta[i.video_id] || i;
  }
  // Channel -> artist, for videos found through an artist's own channel.
  const chanArtist = {};
  const wd = (readJSON(path.join(CACHE_DIR, 'wikidata_youtube.json'), {}) || {}).map || {};
  for (const [slug, a] of Object.entries(readJSON(path.join(CATALOG_DIR, 'artists.json'), {}))) {
    const ch = a.yc || wd[slug];
    if (ch) chanArtist[ch] = slug;
  }
  // Snapshots are [hours since epoch, views]; older runs stored ISO strings.
  const hrs = (t) => (typeof t === 'number' ? t : Math.round(Date.parse(t + 'Z') / 36e5));
  const nowH = Math.round(NOW.getTime() / 36e5);
  if (raw && raw.videos) {
    for (const [id, v] of Object.entries(raw.videos)) {
      const h = hist[id] || (hist[id] = { s: [] });
      h.t = v.title; h.c = v.channel; h.ci = v.channel_id; h.cat = v.category; h.pub = (v.published || '').slice(0, 10);
      if (v.artist) h.ar = v.artist;
      if (!h.ar && chanArtist[h.ci]) h.ar = chanArtist[h.ci];
      if (meta[id]) { h.a = meta[id].artist; h.tt = meta[id].title; }
      h.v = v.views;
      h.s = h.s.map(([t, x]) => [hrs(t), x]).filter(([t]) => t !== nowH);
      h.s.push([nowH, v.views]);
      // keep ~10 days of snapshots (one per run)
      h.s = h.s.filter(([t]) => nowH - t < 10.5 * 24).slice(-12);
      h.seen = TODAY;
    }
  }
  // Drop videos no longer refreshed for 60 days (unless in the Billion Views Club).
  for (const [id, h] of Object.entries(hist)) {
    if (h.v < 1e9 && h.seen && daysBetween(h.seen, TODAY) > 60) delete hist[id];
    else if (!h.ar && chanArtist[h.ci]) h.ar = chanArtist[h.ci];
  }
  writeJSON(file, hist);

  // Views gained per day (snapshot closest to 24h ago) and per week (closest to 7 days).
  const gain = (s, target, min) => {
    const [lt, lv] = s[s.length - 1];
    let best = null;
    for (const [t, v] of s) {
      const age = hrs(lt) - hrs(t);
      if (age >= min && (!best || Math.abs(age - target) < Math.abs(best.age - target))) best = { age, v };
    }
    return best && lv >= best.v ? Math.round(((lv - best.v) / best.age) * target) : undefined;
  };
  const daily = {};
  const weekly = {};
  for (const [id, h] of Object.entries(hist)) {
    const s = h.s || [];
    if (s.length < 2) continue;
    const d = gain(s, 24, 12);
    if (d !== undefined) daily[id] = d;
    const w = gain(s, 168, 120);
    if (w !== undefined) weekly[id] = w;
  }
  return { hist, daily, weekly, channels: (raw && raw.channels) || readJSON(path.join(CACHE_DIR, 'youtube_channels.json'), {}) };
}

// ---------------------------------------------------------- enrichment ----

async function enrichArtists(artists) {
  const file = path.join(CACHE_DIR, 'deezer_artists.json');
  const cache = readJSON(file, {});
  if (OFFLINE) return cache;
  const todo = artists
    .filter((a) => !cache[a.slug] || !cache[a.slug].v2 || daysBetween(cache[a.slug].ts, TODAY) > 14)
    .slice(0, OFFLINE ? 0 : ENRICH_PER_RUN);
  let n = 0;
  for (const a of todo) {
    try {
      const d = await fetchJSON(`https://api.deezer.com/search/artist?q=${encodeURIComponent(a.name)}&limit=10`, { retries: 1, label: 'deezer artist' });
      // Many fake profiles share famous names: take the exact-name match with the most fans.
      const hit = ((d && d.data) || []).filter((x) => slugify(x.name) === a.slug).sort((x, y) => (y.nb_fan || 0) - (x.nb_fan || 0))[0];
      cache[a.slug] = hit
        ? { ts: TODAY, v2: 1, id: hit.id, img: hit.picture_medium, img_l: hit.picture_xl, fans: hit.nb_fan, albums: hit.nb_album, url: hit.link }
        : { ts: TODAY, v2: 1 };
      n++;
    } catch (e) { console.warn('  ', e.message.slice(0, 100)); }
    await sleep(120);
  }
  writeJSON(file, cache);
  console.log(`  deezer artist lookups: ${n}`);
  return cache;
}

// --------------------------------------------------------------- main -----

async function main() {
  console.log('=== Build data ===');
  const { charts, fresh } = loadCharts();
  console.log(`  charts: ${Object.keys(charts).length} (${fresh.size} fresh)`);
  if (!Object.keys(charts).length) { console.error('No chart data at all.'); process.exitCode = 1; return; }

  const yt = updateYoutubeViews(charts);
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  if (Object.keys(yt.channels).length) {
    const prev = readJSON(path.join(CACHE_DIR, 'youtube_channels.json'), {});
    writeJSON(path.join(CACHE_DIR, 'youtube_channels.json'), { ...prev, ...yt.channels });
    yt.channels = { ...prev, ...yt.channels };
  }

  const songs = {};   // key -> song
  const artists = {}; // slug -> artist
  const albums = {};

  const artistRef = (name) => {
    const slug = slugify(name);
    if (!slug) return null;
    const a = artists[slug] || (artists[slug] = { slug, names: {}, score: 0, songs: new Set(), charts: new Set(), countries: new Set(), platforms: new Set(), best: null, img: {}, ext: {} });
    a.names[name] = (a.names[name] || 0) + 1;
    return a;
  };

  const out = {}; // normalized charts
  for (const c of Object.values(charts).sort((a, b) => a.id.localeCompare(b.id))) {
    const isAlbum = c.type === 'albums';
    const items = c._prev ? c.items : c.items.map((i) => ({ ...i, key: isAlbum ? `${slugify(i.artists[0] || i.artist)}--${slugify(i.title)}` : songKey(i.artist, i.title) }));
    // A song can appear twice in a YouTube chart (video + lyric video): keep best.
    const seen = new Set();
    const uniq = items.filter((i) => (seen.has(i.key) ? false : seen.add(i.key)));
    const stats = c._prev ? null : applyHistory(c.id, uniq.map((i) => ({ key: i.key, rank: i.rank })));

    const N = c.items.length;
    const pw = PLATFORM_WEIGHT[c.platform] || 0;
    const cw = c.country === 'global' ? 3 : C.weight(c.country);

    const norm = uniq.map((i) => {
      const st = stats ? stats[i.key] : { change: i.change, peak: i.peak, days: i.days, first: i.first };
      // Raw rows carry artist names; reused (previous) rows carry {n, s} objects.
      const credits = (i.artists && i.artists.length ? i.artists : splitArtists(i.artist)).slice(0, 6).map((x) => (typeof x === 'string' ? x : x.n));
      const row = {
        rank: i.rank, title: i.title, artist: i.artist, key: i.key,
        artists: credits.map((n) => ({ n, s: slugify(n) })).filter((x) => x.s),
        image: i.image || '', url: i.url || '',
        change: st.change, peak: st.peak, days: st.days,
      };
      for (const f of ['video_id', 'views', 'album', 'genre', 'release', 'listeners', 'apple_id', 'deezer_id', 'explicit', 'image_large', 'label']) {
        if (i[f] !== undefined && i[f] !== '' && i[f] !== false) row[f] = i[f];
      }
      if (row.video_id && yt.daily[row.video_id] !== undefined) row.views_day = yt.daily[row.video_id];
      if (row.video_id && yt.hist[row.video_id]) row.views = yt.hist[row.video_id].v || row.views;
      return row;
    });

    out[c.id] = {
      id: c.id, platform: c.platform, type: c.type, country: c.country,
      updated: c._prev ? c.updated : c.fetched, total: norm.length, items: norm,
    };

    // ---- aggregate
    for (const r of norm) {
      const pts = pw * cw * Math.pow((N + 1 - r.rank) / N, 1.5);
      if (isAlbum) {
        const al = albums[r.key] || (albums[r.key] = { key: r.key, title: r.title, artist: r.artist, artists: r.artists, image: r.image_large || r.image, url: r.url, positions: [], score: 0 });
        al.positions.push({ c: c.id, r: r.rank });
        al.score += cw * Math.pow((N + 1 - r.rank) / N, 1.5);
        continue;
      }
      const s = songs[r.key] || (songs[r.key] = {
        key: r.key, title: r.title, artist: r.artist, artists: r.artists, image: '', image_large: '',
        links: {}, positions: [], score: 0, platforms: new Set(), countries: new Set(),
      });
      // Prefer square artwork (Apple/Deezer) over video thumbnails.
      if (c.platform !== 'youtube' && r.image && (!s.image || s._ytimg)) { s.image = r.image; s.image_large = r.image_large || r.image; s._ytimg = false; }
      if (!s.image && r.image) { s.image = r.image; s._ytimg = true; }
      if (c.platform === 'apple' && !s._apple) { s.title = r.title; s.artist = r.artist; s.artists = r.artists; s._apple = true; }
      if (r.url && !s.links[c.platform]) s.links[c.platform] = r.url;
      if (r.video_id && (!s.video_id || (r.views || 0) > (s.views || 0))) { s.video_id = r.video_id; s.views = r.views; s.views_day = r.views_day; }
      if (r.genre && !s.genre) s.genre = r.genre;
      if (r.release && !s.release) s.release = r.release;
      if (r.album && !s.album) s.album = r.album;
      if (r.explicit) s.explicit = true;
      s.positions.push({ c: c.id, p: c.platform, cc: c.country, r: r.rank, ch: r.change, pk: r.peak, d: r.days });
      s.score += pts;
      s.platforms.add(c.platform);
      if (c.country !== 'global') s.countries.add(c.country);

      r.artists.forEach((cr, idx) => {
        if (c.platform === 'youtube' && r.label) return;
        const a = artistRef(cr.n);
        if (!a) return;
        a.score += idx === 0 ? pts : pts * 0.5;
        a.songs.add(r.key);
        a.charts.add(c.id);
        a.platforms.add(c.platform);
        if (c.country !== 'global') a.countries.add(c.country);
        if (!a.best || r.rank < a.best.r || (r.rank === a.best.r && cw > a.best.w)) a.best = { r: r.rank, c: c.id, w: cw, t: r.title };
        if (idx === 0) {
          const src = charts[c.id].items.find((x) => x.rank === r.rank) || {};
          if (src.artist_image) a.img.deezer = src.artist_image;
          if (src.apple_artist_id) a.ext.apple = src.artist_url;
          if (src.deezer_artist_id) a.ext.deezer_id = src.deezer_artist_id;
          if (src.channel_id && (/ - Topic$/.test(src.channel || '') || slugify((src.channel || '').replace(/VEVO$/i, '')) === a.slug)) a.ext.yt_channel = src.channel_id;
        }
      });
    }
  }

  // ---- MusicMetrics Global chart (cross-platform)
  const songList = Object.values(songs).sort((a, b) => b.score - a.score);
  const globalTop = songList.slice(0, 200);
  const gStats = applyHistory('global', globalTop.map((s, i) => ({ key: s.key, rank: i + 1 })));
  const maxScore = songList.length ? songList[0].score : 1;
  out.global = {
    id: 'global', platform: 'musicmetrics', type: 'songs', country: 'global', updated: NOW.toISOString(), total: globalTop.length,
    items: globalTop.map((s, i) => ({
      rank: i + 1, title: s.title, artist: s.artist, key: s.key, artists: s.artists, image: s.image,
      points: Math.round((s.score / maxScore) * 1000) / 10,
      charts: s.positions.length, countries: s.countries.size, platforms: [...s.platforms],
      video_id: s.video_id, change: gStats[s.key].change, peak: gStats[s.key].peak, days: gStats[s.key].days,
    })),
  };
  songList.forEach((s, i) => { s.grank = i + 1; });

  // ---- artists (currently charting)
  const artistList = Object.values(artists)
    .filter((a) => a.slug.length > 1 && !LABEL_RE.test(Object.keys(a.names)[0]))
    .map((a) => {
      a.name = Object.entries(a.names).sort((x, y) => y[1] - x[1])[0][0];
      return a;
    })
    .sort((a, b) => b.score - a.score);
  artistList.forEach((a, i) => { a.rank = i + 1; });
  const deezerCache = await enrichArtists(artistList);
  const aStats = applyHistory('artists', artistList.slice(0, 500).map((a, i) => ({ key: a.slug, rank: i + 1 })));

  // ---- catalog: everything that has ever charted (grows every day)
  const cat = updateCatalog(songList, artistList, deezerCache, yt);
  const cutoff = new Date(NOW.getTime() - KEEP_DAYS * 864e5).toISOString().slice(0, 10);

  const songPages = new Set(Object.entries(cat.songs).filter(([, x]) => x.ls >= cutoff).map(([k]) => k));
  const locSongs = new Set(songList.slice(0, LOC_SONGS).map((s) => s.key));
  for (const s of songList) if (s.positions.some((p) => p.r <= 3)) locSongs.add(s.key);

  const artistPages = new Set(Object.entries(cat.artists)
    .filter(([, x]) => x.ls >= cutoff && !LABEL_RE.test(x.n) && (x.s || []).some((k) => songPages.has(k)))
    .map(([k]) => k));
  const locArtists = new Set(artistList.slice(0, LOC_ARTISTS).map((a) => a.slug));
  for (const k of locSongs) for (const cr of songs[k].artists.slice(0, 1)) locArtists.add(cr.s);
  for (const k of [...locArtists]) if (!artistPages.has(k)) locArtists.delete(k);
  const songLoc = (k) => songPages.has(k) && locSongs.has(k);
  const credit = (x) => ({ n: x.n, s: x.s, page: artistPages.has(x.s), loc: locArtists.has(x.s) });
  const spotifyIds = (readJSON(path.join(CACHE_DIR, 'wikidata_spotify.json'), {}) || {}).map || {};
  const songSlug = (k) => k.replace(/--/g, '-');

  // ---- artist pages
  const artistsOut = {};
  const songRow = (k, cur) => {
    const c = cat.songs[k];
    const s = songs[k];
    return {
      k, t: (s || c).title || c.t, a: (s && s.artist) || c.a, img: (s && s.image) || c.img,
      page: songPages.has(k), loc: songLoc(k), on: !!s,
      best: s ? Math.min(...s.positions.map((p) => p.r)) : c.b.r,
      n: s ? s.positions.length : 0, g: s ? s.grank : 0,
      v: (s && s.views) || c.vw || null, vd: (s && s.views_day) || null, vid: (s && s.video_id) || c.v || null,
    };
  };
  for (const slug of artistPages) {
    const c = cat.artists[slug];
    const a = artists[slug];
    const dz = deezerCache[slug] || {};
    const current = a ? [...a.songs].filter((k) => songs[k]).sort((x, y) => songs[y].score - songs[x].score) : [];
    const past = (c.s || []).filter((k) => !current.includes(k) && songPages.has(k))
      .sort((x, y) => cat.songs[x].b.r - cat.songs[y].b.r);
    const ch = c.yc && yt.channels[c.yc];
    const st = aStats[slug];
    artistsOut[slug] = {
      slug, name: a ? a.name : c.n, rank: a ? a.rank : 0, on: !!a, loc: locArtists.has(slug),
      change: st ? st.change : null, peak: st ? st.peak : null,
      image: dz.img || c.img || (ch && ch.image) || '', image_large: dz.img_l || '',
      score: a ? Math.round(a.score * 100) / 100 : 0,
      charts: a ? a.charts.size : 0, countries: a ? [...a.countries].sort() : [], platforms: a ? [...a.platforms] : [],
      best: a && a.best ? { rank: a.best.r, chart: a.best.c, title: a.best.t } : null,
      hist: { first: c.f, last: c.ls, best: c.b, countries: (c.cc || []).length },
      fans: dz.fans || null, albums: dz.albums || null,
      subscribers: ch ? ch.subscribers : null, channel_views: ch ? ch.views : null,
      links: {
        deezer: dz.url || c.l.deezer || '', apple: c.l.apple || '', youtube: c.yc ? `https://www.youtube.com/channel/${c.yc}` : '',
        spotify: spotifyIds[slug] ? `https://open.spotify.com/artist/${spotifyIds[slug]}` : '',
      },
      sp: spotifyIds[slug] || undefined,
      songs: [...current.slice(0, 60), ...past.slice(0, 60)].map((k) => songRow(k)),
      top1: current.filter((k) => songs[k].positions.some((p) => p.r === 1)).length,
      related: [],
    };
  }

  // ---- YouTube: every tracked video grouped by artist (kworb-style artist pages)
  const vtitle = (h) => h.tt || parseArtistAndTitle(h.t || '', h.c || '').title || h.t;
  const byArtist = {};
  for (const [id, h] of Object.entries(yt.hist)) {
    if (!h.ar) continue;
    (byArtist[h.ar] = byArtist[h.ar] || []).push([id, h]);
  }
  const ytArtists = [];
  for (const [slug, vids] of Object.entries(byArtist)) {
    const total = vids.reduce((n, [, h]) => n + (h.v || 0), 0);
    const daily = vids.reduce((n, [id]) => n + (yt.daily[id] || 0), 0);
    const top = vids.sort((x, y) => (y[1].v || 0) - (x[1].v || 0));
    const entry = {
      total, daily, videos: vids.length,
      top: top.slice(0, 15).map(([id, h]) => ({ id, t: vtitle(h), v: h.v, vd: yt.daily[id] || null, pub: h.pub || '' })),
    };
    if (artistsOut[slug]) artistsOut[slug].yt = entry;
    const c = cat.artists[slug];
    if (c) ytArtists.push({ slug, name: c.n, total, daily, videos: vids.length, image: (artistsOut[slug] || {}).image || c.img || '', page: artistPages.has(slug), loc: locArtists.has(slug), top: entry.top[0] });
  }
  const ytArtistRank = ytArtists.sort((a, b) => b.total - a.total).slice(0, 1000).map((a, i) => ({ rank: i + 1, ...a }));
  const ytDaily = Object.entries(yt.daily)
    .filter(([id, d]) => d > 0 && yt.hist[id] && (yt.hist[id].cat === '10' || yt.hist[id].ar))
    .sort((a, b) => b[1] - a[1]).slice(0, 500)
    .map(([id, d], i) => {
      const h = yt.hist[id];
      const parsed = h.tt ? { title: h.tt, artist: h.a } : parseArtistAndTitle(h.t || '', h.c || '');
      const ar = h.ar && artistPages.has(h.ar) ? h.ar : '';
      return { rank: i + 1, video_id: id, title: parsed.title, artist: (h.ar && cat.artists[h.ar] && cat.artists[h.ar].n) || parsed.artist, a: ar, al: ar ? locArtists.has(ar) : false, views: h.v, views_day: d, views_week: yt.weekly[id] || null, published: h.pub || '' };
    });

  // ---- related artists: co-occurrence on the same charts (inverted index)
  const byChart = {};
  for (const a of artistList) if (artistPages.has(a.slug)) for (const c of a.charts) (byChart[c] = byChart[c] || []).push(a.slug);
  for (const a of artistList) {
    if (!artistsOut[a.slug]) continue;
    const co = {};
    for (const c of a.charts) for (const b of byChart[c] || []) if (b !== a.slug) co[b] = (co[b] || 0) + 1;
    artistsOut[a.slug].related = Object.entries(co)
      .filter(([, n]) => n >= 2)
      .map(([b, n]) => [n / (a.charts.size + artists[b].charts.size - n) + artists[b].score / 1e6, b])
      .sort((x, y) => y[0] - x[0]).slice(0, 8).map((x) => x[1]);
  }

  // ---- song pages
  const songsOut = {};
  for (const k of songPages) {
    const c = cat.songs[k];
    const s = songs[k];
    const base = {
      key: k, slug: songSlug(k), on: !!s, loc: songLoc(k),
      hist: { first: c.f, last: c.ls, best: c.b, charts: (c.cs || []).length },
    };
    if (s) {
      songsOut[k] = {
        ...base, title: s.title, artist: s.artist, artists: s.artists.map(credit),
        image: s.image, image_large: s.image_large || s.image, grank: s.grank,
        links: s.links, video_id: s.video_id || null, views: s.views || null, views_day: s.views_day || null,
        views_week: (s.video_id && yt.weekly[s.video_id]) || null,
        genre: s.genre || '', release: s.release || '', album: s.album || '', explicit: !!s.explicit,
        positions: s.positions.sort((x, y) => x.r - y.r || C.weight(y.cc) - C.weight(x.cc)),
        countries: s.countries.size, platforms: [...s.platforms],
      };
    } else {
      const vh = c.v && yt.hist[c.v];
      songsOut[k] = {
        ...base, title: c.t, artist: c.a, artists: (c.ar || []).map(credit),
        image: c.img, image_large: c.imgL || c.img, grank: 0,
        links: c.l || {}, video_id: c.v || null, views: (vh && vh.v) || c.vw || null,
        views_day: (c.v && yt.daily[c.v]) || null, views_week: (c.v && yt.weekly[c.v]) || null,
        genre: c.g || '', release: c.rd || '', album: c.al || '', explicit: false,
        positions: [], countries: 0, platforms: [],
      };
    }
  }

  // Link chart rows to pages that exist (and say whether they are translated).
  for (const ch of Object.values(out)) {
    for (const r of ch.items) {
      if (ch.type !== 'albums' && songsOut[r.key]) { r.song = songsOut[r.key].slug; r.sl = songsOut[r.key].loc; }
      r.artists = r.artists.map(credit);
    }
  }

  // ---- Spotify weekly (hand-downloaded CSVs in spotify/weekly/)
  const spotify = loadSpotifyWeekly();
  if (spotify) annotate(spotify, songsOut, artistsOut, credit);

  // ---- countries
  const byCountry = {};
  for (const ch of Object.values(out)) {
    if (ch.country === 'global') continue;
    (byCountry[ch.country] = byCountry[ch.country] || []).push(ch.id);
  }
  const countriesOut = {};
  Object.keys(byCountry).sort().forEach((cc) => {
    const ids = byCountry[cc].sort((a, b) => PLATFORMS.indexOf(a.split('_')[0]) - PLATFORMS.indexOf(b.split('_')[0]));
    const main = out[ids.find((i) => i.startsWith('apple_')) || ids.find((i) => i.startsWith('youtube_')) || ids[0]];
    const top = main && main.items[0];
    countriesOut[cc] = {
      code: cc, flag: C.flag(cc), names: C.names(cc), charts: ids, featured: C.FEATURED.includes(cc), weight: C.weight(cc),
      top: top ? { title: top.title, artist: top.artist, song: top.song || '', sl: !!top.sl, image: top.image, chart: main.id } : null,
    };
  });

  // ---- YouTube most viewed / billion club
  const mostViewed = Object.entries(yt.hist)
    .filter(([, h]) => h.v >= 1e8 && (h.cat === '10' || h.ar || h.v >= 1e9))
    .sort((a, b) => b[1].v - a[1].v)
    .slice(0, 1000)
    .map(([id, h], i) => {
      const parsed = h.tt ? { title: h.tt, artist: h.a } : parseArtistAndTitle(h.t || '', h.c || '');
      const ar = h.ar && artistPages.has(h.ar) ? h.ar : '';
      return { rank: i + 1, video_id: id, title: parsed.title, artist: (h.ar && cat.artists[h.ar] && cat.artists[h.ar].n) || parsed.artist, a: ar, al: ar ? locArtists.has(ar) : false, channel: h.c, views: h.v, views_day: yt.daily[id] || null, views_week: yt.weekly[id] || null, published: h.pub || '' };
    });

  // ---- albums (top 500)
  const albumList = Object.values(albums).sort((a, b) => b.score - a.score).slice(0, 500)
    .map((a, i) => ({ rank: i + 1, title: a.title, artist: a.artist, artists: a.artists.map(credit), image: a.image, url: a.url, charts: a.positions.length, best: Math.min(...a.positions.map((p) => p.r)) }));

  // ---- weekly recap (overwritten until the ISO week ends; archive lives in store/weekly)
  const wk = isoWeek(NOW);
  const numberOnes = {};
  for (const ch of Object.values(out)) if (ch.items[0] && ch.id !== 'global') numberOnes[ch.id] = { t: ch.items[0].title, a: ch.items[0].artist, s: ch.items[0].song || '', sl: !!ch.items[0].sl, img: ch.items[0].image };
  const weekly = {
    id: wk.id, year: wk.year, week: wk.week, start: wk.start, end: wk.end, updated: NOW.toISOString(),
    top: out.global.items.slice(0, 50).map((x) => ({ r: x.rank, t: x.title, a: x.artist, s: x.song || '', sl: !!x.sl, img: x.image, ch: x.change, pts: x.points })),
    artists: artistList.slice(0, 20).map((a, i) => ({ r: i + 1, n: a.name, s: artistPages.has(a.slug) ? a.slug : '', sl: locArtists.has(a.slug), img: (artistsOut[a.slug] || {}).image || '' })),
    number_ones: numberOnes,
    videos: mostViewed.filter((v) => v.views_day).sort((a, b) => b.views_day - a.views_day).slice(0, 10),
  };
  writeJSON(path.join(WEEKLY_STORE, `${wk.id}.json`), weekly);

  // ---- persist last good charts (fallback for failed sources)
  fs.rmSync(STORE_CHARTS, { recursive: true, force: true });
  for (const ch of Object.values(out)) if (ch.id !== 'global') writeJSON(path.join(STORE_CHARTS, `${ch.id}.json`), ch);

  // ---- write everything the site renders (data/ is generated, not committed)
  fs.rmSync(DATA_DIR, { recursive: true, force: true });
  for (const ch of Object.values(out)) writeJSON(path.join(DATA_DIR, 'charts', `${ch.id}.json`), ch);
  writeJSON(path.join(DATA_DIR, 'artists.json'), artistsOut);
  writeJSON(path.join(DATA_DIR, 'songs.json'), songsOut);
  writeJSON(path.join(DATA_DIR, 'countries.json'), countriesOut);
  writeJSON(path.join(DATA_DIR, 'albums.json'), albumList);
  writeJSON(path.join(DATA_DIR, 'youtube_most_viewed.json'), mostViewed);
  writeJSON(path.join(DATA_DIR, 'youtube_daily.json'), ytDaily);
  writeJSON(path.join(DATA_DIR, 'youtube_artists.json'), ytArtistRank);
  if (spotify) writeJSON(path.join(DATA_DIR, 'spotify.json'), spotify);
  if (fs.existsSync(WEEKLY_STORE)) for (const f of fs.readdirSync(WEEKLY_STORE)) fs.cpSync(path.join(WEEKLY_STORE, f), path.join(DATA_DIR, 'weekly', f));
  const counts = {
    charts: Object.keys(out).length, songs: Object.keys(cat.songs).length, artists: Object.keys(cat.artists).length,
    songs_now: Object.keys(songs).length, artists_now: artistList.length,
    song_pages: Object.keys(songsOut).length, artist_pages: Object.keys(artistsOut).length,
    countries: Object.keys(countriesOut).length, videos: Object.keys(yt.hist).length,
    yt_artists: ytArtists.length, yt_views: ytArtists.reduce((n, a) => n + a.total, 0),
    spotify_charts: spotify ? Object.keys(spotify.charts).length : 0,
    spotify_ids: Object.values(artistsOut).filter((a) => a.sp).length,
  };
  writeJSON(path.join(DATA_DIR, 'meta.json'), {
    updated: NOW.toISOString(), counts,
    platforms: Object.fromEntries(PLATFORMS.map((p) => [p, Object.values(out).filter((c) => c.platform === p).length])),
  }, { pretty: true });

  console.log(`  ${JSON.stringify(counts)}`);
}

// ------------------------------------------------------------- catalog ----

/**
 * Long-term memory of every song and artist that has ever charted.
 * songs:   { key: { t, a, ar, img, imgL, l, v, vw, g, rd, al, f, ls, b: {r, c, d}, cs } }
 * artists: { slug: { n, img, l, yc, f, ls, b: {r, c, d, t}, s: [song keys], cc: [countries] } }
 */
function updateCatalog(songList, artistList, deezerCache, yt) {
  const sFile = path.join(CATALOG_DIR, 'songs.json');
  const aFile = path.join(CATALOG_DIR, 'artists.json');
  const songsCat = readJSON(sFile, {});
  const artistsCat = readJSON(aFile, {});
  const wdYt = (readJSON(path.join(CACHE_DIR, 'wikidata_youtube.json'), {}) || {}).map || {};
  const cap = (arr, n) => arr.slice(-n);

  for (const s of songList) {
    const c = songsCat[s.key] || (songsCat[s.key] = { f: TODAY, b: { r: 9999, c: '', d: '' }, cs: [], l: {} });
    c.t = s.title; c.a = s.artist; c.ar = s.artists.map((x) => ({ n: x.n, s: x.s }));
    if (s.image && (!c.img || !s._ytimg)) { c.img = s.image; c.imgL = s.image_large || s.image; }
    c.l = { ...c.l, ...s.links };
    if (s.video_id) { c.v = s.video_id; c.vw = s.views || c.vw; }
    if (s.genre) c.g = s.genre;
    if (s.release) c.rd = s.release;
    if (s.album) c.al = s.album;
    c.ls = TODAY;
    for (const p of s.positions) {
      const r = Math.min(p.r, p.pk || p.r);
      if (r < c.b.r) c.b = { r, c: p.c, d: TODAY };
      if (!c.cs.includes(p.c)) c.cs.push(p.c);
    }
    c.cs = cap(c.cs, 60);
  }
  for (const a of artistList) {
    const c = artistsCat[a.slug] || (artistsCat[a.slug] = { f: TODAY, b: { r: 9999, c: '', d: '', t: '' }, s: [], cc: [], l: {} });
    const dz = deezerCache[a.slug] || {};
    c.n = a.name;
    c.img = dz.img || a.img.deezer || c.img || '';
    if (a.ext.apple) c.l.apple = a.ext.apple;
    if (a.ext.deezer_id) c.l.deezer = `https://www.deezer.com/artist/${a.ext.deezer_id}`;
    if (a.ext.yt_channel) c.yc = a.ext.yt_channel;
    if (!c.yc && wdYt[a.slug]) c.yc = wdYt[a.slug];
    c.ls = TODAY;
    if (a.best && a.best.r < c.b.r) c.b = { r: a.best.r, c: a.best.c, d: TODAY, t: a.best.t };
    for (const k of a.songs) if (!c.s.includes(k)) c.s.push(k);
    for (const cc of a.countries) if (!c.cc.includes(cc)) c.cc.push(cc);
    c.s = cap(c.s, 400);
    if (!c.img) {
      const first = [...a.songs][0];
      const song = songList.find((x) => x.key === first);
      if (song) c.img = song.image;
    }
  }
  writeJSON(sFile, songsCat);
  writeJSON(aFile, artistsCat);
  return { songs: songsCat, artists: artistsCat };
}

function isoWeek(d) {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const year = t.getUTCFullYear();
  const week = Math.ceil(((t - Date.UTC(year, 0, 1)) / 864e5 + 1) / 7);
  const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - (day - 1)));
  const end = new Date(start.getTime() + 6 * 864e5);
  return { id: `${year}-w${String(week).padStart(2, '0')}`, year, week, start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

main().catch((e) => { console.error('FATAL', e); process.exitCode = 1; });
