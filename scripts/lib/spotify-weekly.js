'use strict';
/**
 * Spotify weekly charts, from CSV files downloaded by hand from
 * charts.spotify.com ("Download CSV") and committed to spotify/weekly/.
 * Nothing here talks to Spotify. Only rank, title, artist, peak, previous rank
 * and weeks on chart are published (top SONGS_SHOWN / ARTISTS_SHOWN); stream
 * counts are read but never written out.
 *
 * File names as Spotify serves them:
 *   regional-<cc|global>-weekly-<YYYY-MM-DD>.csv   (Weekly Top Songs)
 *   artist-<cc|global>-weekly-<YYYY-MM-DD>.csv     (Weekly Top Artists)
 */
const fs = require('fs');
const path = require('path');
const { ROOT, slugify, songKey } = require('./common');

const DIR = path.join(ROOT, 'spotify', 'weekly');
const SONGS_SHOWN = 20;
const ARTISTS_SHOWN = 10;
const FILE_RE = /^(regional|artist)-([a-z]{2}|global)-weekly-(\d{4}-\d{2}-\d{2})\.csv$/;

function parseCSV(text) {
  const rows = [];
  let row = [], field = '', q = false;
  text = text.replace(/^﻿/, '');
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; }
      else field += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else field += ch;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  const head = rows.shift() || [];
  return rows.map((r) => Object.fromEntries(head.map((h, i) => [h.trim(), (r[i] || '').trim()])));
}

const num = (v) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : null; };
const idOf = (uri) => (String(uri).match(/[0-9A-Za-z]{22}$/) || [''])[0];
const addDays = (d, n) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);

/** Reads every file; returns null when there is nothing to show. */
function loadSpotifyWeekly() {
  if (!fs.existsSync(DIR)) return null;
  const files = {}; // week -> cc -> { songs, artists }
  for (const f of fs.readdirSync(DIR)) {
    const m = f.match(FILE_RE);
    if (!m) continue;
    const [, kind, cc, week] = m;
    const rows = parseCSV(fs.readFileSync(path.join(DIR, f), 'utf8'));
    const slot = ((files[week] = files[week] || {})[cc] = files[week][cc] || {});
    slot[kind === 'regional' ? 'songs' : 'artists'] = rows;
  }
  const weeks = Object.keys(files).sort();
  if (!weeks.length) return null;
  const week = weeks[weeks.length - 1];

  const charts = {};
  for (const [cc, slot] of Object.entries(files[week])) {
    const move = (r) => {
      const prev = num(r.previous_rank);
      const pr = prev && prev > 0 ? prev : null;
      const w = num(r.weeks_on_chart) || 1;
      return { pr, w, ch: pr ? pr - num(r.rank) : (w > 1 ? 're' : 'new') };
    };
    const songs = (slot.songs || []).slice(0, SONGS_SHOWN).map((r) => {
      const names = r.artist_names.split(/,\s*/).filter(Boolean);
      return {
        r: num(r.rank), t: r.track_name, a: r.artist_names, id: idOf(r.uri), pk: num(r.peak_rank), ...move(r),
        k: songKey(r.artist_names, r.track_name),
        ar: names.map((n) => ({ n, s: slugify(n) })).filter((x) => x.s),
      };
    });
    const artists = (slot.artists || []).slice(0, ARTISTS_SHOWN).map((r) => ({
      r: num(r.rank), n: r.artist_name, s: slugify(r.artist_name), id: idOf(r.uri), pk: num(r.peak_rank), ...move(r),
    }));
    if (songs.length || artists.length) charts[cc] = { cc, songs, artists, total: (slot.songs || []).length };
  }
  return { week, start: addDays(week, -6), weeks, charts };
}

/**
 * Cross-links with the rest of the site: song/artist pages that exist get a
 * Spotify weekly position, and Spotify ids from the files give direct links.
 */
function annotate(sp, songsOut, artistsOut, credit) {
  for (const ch of Object.values(sp.charts)) {
    for (const s of ch.songs) {
      const page = songsOut[s.k];
      if (page) {
        s.song = page.slug; s.sl = page.loc; s.img = page.image || '';
        (page.spw = page.spw || []).push({ cc: ch.cc, r: s.r });
        if (s.id) page.links = { ...page.links, spotify: `https://open.spotify.com/track/${s.id}` };
      }
      s.ar = s.ar.map((x) => credit(x));
    }
    for (const a of ch.artists) {
      const page = artistsOut[a.s];
      a.page = !!page; a.loc = !!(page && page.loc); a.img = (page && page.image) || '';
      if (page) {
        (page.spw = page.spw || []).push({ cc: ch.cc, r: a.r });
        if (a.id && !page.sp) { page.sp = a.id; page.links = { ...page.links, spotify: `https://open.spotify.com/artist/${a.id}` }; }
      }
    }
  }
  const order = (x, y) => (x.cc === 'global' ? -1 : y.cc === 'global' ? 1 : x.r - y.r);
  for (const p of Object.values(songsOut)) if (p.spw) p.spw.sort(order);
  for (const p of Object.values(artistsOut)) if (p.spw) p.spw.sort(order);
}

module.exports = { loadSpotifyWeekly, annotate, parseCSV };
