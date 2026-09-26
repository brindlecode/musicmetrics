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
const C = require('./lib/countries');
const { LABEL_RE } = require('./lib/youtube-parse');

const OFFLINE = process.argv.includes('--offline');
const NOW = now();
const TODAY = today();
const STALE_DAYS = 5;
const MAX_SONG_PAGES = 2500;
const MAX_ARTIST_PAGES = 1500;

const PLATFORM_WEIGHT = { youtube: 1, apple: 1, deezer: 0.6, lastfm: 0.5 };
const PLATFORMS = ['youtube', 'apple', 'apple-albums', 'deezer', 'lastfm'];

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
  const chartsDir = path.join(DATA_DIR, 'charts');
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
  if (raw && raw.videos) {
    for (const [id, v] of Object.entries(raw.videos)) {
      const h = hist[id] || (hist[id] = { s: [] });
      h.t = v.title; h.c = v.channel; h.ci = v.channel_id; h.cat = v.category; h.pub = (v.published || '').slice(0, 10);
      if (meta[id]) { h.a = meta[id].artist; h.tt = meta[id].title; }
      h.v = v.views;
      h.s.push([ts.slice(0, 16), v.views]);
      // keep at most ~3 days of snapshots
      h.s = h.s.filter(([t]) => (NOW - Date.parse(t + 'Z')) < 80 * 36e5).slice(-14);
      h.seen = ts.slice(0, 10);
    }
  }
  // Drop videos not refreshed for 30 days and under 1B views.
  for (const [id, h] of Object.entries(hist)) {
    if (h.v < 1e9 && h.seen && daysBetween(h.seen, TODAY) > 30) delete hist[id];
  }
  writeJSON(file, hist);

  const daily = {};
  for (const [id, h] of Object.entries(hist)) {
    const s = h.s || [];
    if (s.length < 2) continue;
    const [lt, lv] = s[s.length - 1];
    let best = null;
    for (const [t, v] of s) {
      const age = (Date.parse(lt + 'Z') - Date.parse(t + 'Z')) / 36e5;
      if (age >= 12 && (!best || Math.abs(age - 24) < Math.abs(best.age - 24))) best = { age, v };
    }
    if (best && lv >= best.v) daily[id] = Math.round(((lv - best.v) / best.age) * 24);
  }
  return { hist, daily, channels: (raw && raw.channels) || readJSON(path.join(CACHE_DIR, 'youtube_channels.json'), {}) };
}

// ---------------------------------------------------------- enrichment ----

async function enrichArtists(artists) {
  const file = path.join(CACHE_DIR, 'deezer_artists.json');
  const cache = readJSON(file, {});
  if (OFFLINE) return cache;
  const todo = artists
    .filter((a) => !cache[a.slug] || daysBetween(cache[a.slug].ts, TODAY) > 14)
    .slice(0, 300);
  let n = 0;
  for (const a of todo) {
    try {
      const d = await fetchJSON(`https://api.deezer.com/search/artist?q=${encodeURIComponent(a.name)}&limit=5`, { retries: 1, label: 'deezer artist' });
      const hit = ((d && d.data) || []).find((x) => slugify(x.name) === a.slug);
      cache[a.slug] = hit
        ? { ts: TODAY, id: hit.id, img: hit.picture_medium, img_l: hit.picture_xl, fans: hit.nb_fan, albums: hit.nb_album, url: hit.link }
        : { ts: TODAY };
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
      const credits = (i.artists && i.artists.length ? i.artists : splitArtists(i.artist)).slice(0, 6);
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

  // ---- artists
  let artistList = Object.values(artists)
    .filter((a) => a.slug.length > 1 && !LABEL_RE.test(Object.keys(a.names)[0]))
    .map((a) => {
      a.name = Object.entries(a.names).sort((x, y) => y[1] - x[1])[0][0];
      return a;
    })
    .sort((a, b) => b.score - a.score);
  const deezerCache = await enrichArtists(artistList.slice(0, MAX_ARTIST_PAGES));
  const aStats = applyHistory('artists', artistList.slice(0, 500).map((a, i) => ({ key: a.slug, rank: i + 1 })));

  const songPages = new Set(songList.slice(0, MAX_SONG_PAGES).map((s) => s.key));
  // Every song that is #1–#3 anywhere gets a page too.
  for (const s of songList) if (s.positions.some((p) => p.r <= 3)) songPages.add(s.key);
  const artistPages = new Set(artistList.slice(0, MAX_ARTIST_PAGES).map((a) => a.slug));
  // Artists of song pages get pages as well.
  for (const k of songPages) for (const cr of songs[k].artists.slice(0, 1)) if (artists[cr.s]) artistPages.add(cr.s);

  const artistsOut = {};
  artistList.forEach((a, i) => {
    if (!artistPages.has(a.slug)) return;
    const dz = deezerCache[a.slug] || {};
    const ch = a.ext.yt_channel && yt.channels[a.ext.yt_channel];
    const st = aStats[a.slug];
    const aSongs = [...a.songs].map((k) => songs[k]).sort((x, y) => y.score - x.score);
    artistsOut[a.slug] = {
      slug: a.slug, name: a.name, rank: i + 1,
      change: st ? st.change : null, peak: st ? st.peak : null,
      image: dz.img || a.img.deezer || (ch && ch.image) || (aSongs[0] && aSongs[0].image) || '',
      image_large: dz.img_l || '',
      score: Math.round(a.score * 100) / 100,
      charts: a.charts.size, countries: [...a.countries].sort(), platforms: [...a.platforms],
      best: a.best ? { rank: a.best.r, chart: a.best.c, title: a.best.t } : null,
      fans: dz.fans || null, albums: dz.albums || null,
      subscribers: ch ? ch.subscribers : null, channel_views: ch ? ch.views : null,
      links: { deezer: dz.url || (a.ext.deezer_id ? `https://www.deezer.com/artist/${a.ext.deezer_id}` : ''), apple: a.ext.apple || '', youtube: a.ext.yt_channel ? `https://www.youtube.com/channel/${a.ext.yt_channel}` : '' },
      songs: aSongs.slice(0, 50).map((s) => ({
        k: s.key, t: s.title, a: s.artist, img: s.image, page: songPages.has(s.key),
        best: Math.min(...s.positions.map((p) => p.r)), n: s.positions.length, g: s.grank,
        v: s.views || null, vd: s.views_day || null, vid: s.video_id || null,
      })),
      top1: aSongs.filter((s) => s.positions.some((p) => p.r === 1)).length,
    };
  });

  // ---- related artists: overlap of the charts they appear in (Jaccard)
  const pageArtists = Object.values(artistsOut);
  const chartSets = Object.fromEntries(pageArtists.map((a) => [a.slug, artists[a.slug].charts]));
  for (const a of pageArtists) {
    const A = chartSets[a.slug];
    const scored = [];
    for (const b of pageArtists) {
      if (b.slug === a.slug) continue;
      const B = chartSets[b.slug];
      let inter = 0;
      for (const x of A) if (B.has(x)) inter++;
      if (inter < 2) continue;
      scored.push([inter / (A.size + B.size - inter) + b.score / 1e6, b.slug]);
    }
    a.related = scored.sort((x, y) => y[0] - x[0]).slice(0, 8).map((x) => x[1]);
  }

  // ---- songs
  const songsOut = {};
  for (const s of songList) {
    if (!songPages.has(s.key)) continue;
    songsOut[s.key] = {
      key: s.key, slug: s.key.replace(/--/g, '-'), title: s.title, artist: s.artist,
      artists: s.artists.map((x) => ({ ...x, page: artistPages.has(x.s) })),
      image: s.image, image_large: s.image_large || s.image, grank: s.grank,
      links: s.links, video_id: s.video_id || null, views: s.views || null, views_day: s.views_day || null,
      genre: s.genre || '', release: s.release || '', album: s.album || '', explicit: !!s.explicit,
      positions: s.positions.sort((x, y) => x.r - y.r || C.weight(y.cc) - C.weight(x.cc)),
      countries: s.countries.size, platforms: [...s.platforms],
    };
  }

  // Link chart rows to pages that exist.
  for (const ch of Object.values(out)) {
    for (const r of ch.items) {
      if (ch.type !== 'albums' && songsOut[r.key]) r.song = songsOut[r.key].slug;
      r.artists = r.artists.map((x) => ({ ...x, page: artistPages.has(x.s) }));
    }
  }

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
      top: top ? { title: top.title, artist: top.artist, song: top.song || '', image: top.image, chart: main.id } : null,
    };
  });

  // ---- YouTube most viewed / billion club
  const mostViewed = Object.entries(yt.hist)
    .filter(([, h]) => h.v >= 1e8 && (h.cat === '10' || h.v >= 1e9))
    .sort((a, b) => b[1].v - a[1].v)
    .slice(0, 250)
    .map(([id, h], i) => ({ rank: i + 1, video_id: id, title: h.tt || h.t, artist: h.a || (h.c || '').replace(/ - Topic$|VEVO$/g, ''), channel: h.c, views: h.v, views_day: yt.daily[id] || null, published: h.pub || '' }));

  // ---- albums (top 200)
  const albumList = Object.values(albums).sort((a, b) => b.score - a.score).slice(0, 200)
    .map((a, i) => ({ rank: i + 1, title: a.title, artist: a.artist, artists: a.artists.map((x) => ({ ...x, page: artistPages.has(x.s) })), image: a.image, url: a.url, charts: a.positions.length, best: Math.min(...a.positions.map((p) => p.r)) }));

  // ---- weekly recap (overwritten until the ISO week ends)
  const wk = isoWeek(NOW);
  const numberOnes = {};
  for (const ch of Object.values(out)) if (ch.items[0] && ch.id !== 'global') numberOnes[ch.id] = { t: ch.items[0].title, a: ch.items[0].artist, s: ch.items[0].song || '', img: ch.items[0].image };
  const weekly = {
    id: wk.id, year: wk.year, week: wk.week, start: wk.start, end: wk.end, updated: NOW.toISOString(),
    top: out.global.items.slice(0, 50).map((x) => ({ r: x.rank, t: x.title, a: x.artist, s: x.song || '', img: x.image, ch: x.change, pts: x.points })),
    artists: artistList.slice(0, 20).map((a, i) => ({ r: i + 1, n: a.name, s: artistPages.has(a.slug) ? a.slug : '', img: (artistsOut[a.slug] || {}).image || '' })),
    number_ones: numberOnes,
    videos: mostViewed.filter((v) => v.views_day).sort((a, b) => b.views_day - a.views_day).slice(0, 10),
  };

  // ---- write everything
  const chartsDir = path.join(DATA_DIR, 'charts');
  fs.rmSync(chartsDir, { recursive: true, force: true });
  for (const ch of Object.values(out)) writeJSON(path.join(chartsDir, `${ch.id}.json`), ch);
  writeJSON(path.join(DATA_DIR, 'artists.json'), artistsOut);
  writeJSON(path.join(DATA_DIR, 'songs.json'), songsOut);
  writeJSON(path.join(DATA_DIR, 'countries.json'), countriesOut);
  writeJSON(path.join(DATA_DIR, 'albums.json'), albumList);
  writeJSON(path.join(DATA_DIR, 'youtube_most_viewed.json'), mostViewed);
  writeJSON(path.join(DATA_DIR, 'weekly', `${wk.id}.json`), weekly);
  writeJSON(path.join(DATA_DIR, 'meta.json'), {
    updated: NOW.toISOString(),
    counts: {
      charts: Object.keys(out).length, songs: Object.keys(songs).length, artists: artistList.length,
      song_pages: Object.keys(songsOut).length, artist_pages: Object.keys(artistsOut).length,
      countries: Object.keys(countriesOut).length, videos: Object.keys(yt.hist).length,
    },
    platforms: Object.fromEntries(PLATFORMS.map((p) => [p, Object.values(out).filter((c) => c.platform === p).length])),
  }, { pretty: true });

  console.log(`  songs: ${Object.keys(songs).length} (${Object.keys(songsOut).length} pages), artists: ${artistList.length} (${Object.keys(artistsOut).length} pages), countries: ${Object.keys(countriesOut).length}, most viewed: ${mostViewed.length}`);
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
