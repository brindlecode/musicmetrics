'use strict';
/**
 * Shared helpers for the MusicMetrics data pipeline.
 * Zero dependencies — runs on plain Node 20+.
 */
const fs = require('fs');
const path = require('path');
const https = require('https');

const ROOT = path.join(__dirname, '..', '..');
const RAW_DIR = path.join(ROOT, 'store', 'raw');
const HISTORY_DIR = path.join(ROOT, 'store', 'history');
const CACHE_DIR = path.join(ROOT, 'store', 'cache');
const DATA_DIR = path.join(ROOT, 'data');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function httpGet(url, { headers = {}, timeout = 20000 } = {}) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      timeout,
      headers: { 'User-Agent': 'MusicMetricsBot/2.0 (+https://musicmetrics.net/about/)', Accept: 'application/json', ...headers },
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return resolve(httpGet(new URL(res.headers.location, url).toString(), { headers, timeout }));
      }
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (c) => (body += c));
      res.on('end', () => resolve({ status: res.statusCode, body }));
      res.on('error', reject);
    });
    req.on('timeout', () => req.destroy(new Error('Timeout')));
    req.on('error', reject);
  });
}

/** GET + JSON.parse with retries. Returns null on 404, throws after retries otherwise. */
async function fetchJSON(url, { retries = 3, headers, label } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const { status, body } = await httpGet(url, { headers });
      if (status === 404) return null;
      if (status === 429 || status >= 500) throw new Error(`HTTP ${status}`);
      if (status !== 200) {
        const err = new Error(`HTTP ${status}: ${body.slice(0, 200)}`);
        err.fatal = true;
        throw err;
      }
      return JSON.parse(body);
    } catch (e) {
      lastErr = e;
      if (e.fatal) break;
      await sleep(1000 * 2 ** attempt);
    }
  }
  throw new Error(`${label || url.replace(/(key|api_key)=[^&]+/g, '$1=***')}: ${lastErr.message}`);
}

/** Run async fn over items with limited concurrency. */
async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      try { out[idx] = await fn(items[idx], idx); } catch (e) { out[idx] = undefined; console.warn('  !', e.message); }
    }
  });
  await Promise.all(workers);
  return out;
}

/** Unicode-aware slug: keeps letters of every script, strips accents. */
function slugify(str) {
  return String(str || '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/ß/g, 'ss').replace(/ø/g, 'o').replace(/æ/g, 'ae').replace(/ı/g, 'i').replace(/ł/g, 'l').replace(/đ/g, 'd')
    .replace(/&/g, ' and ')
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/g, '');
}

const FEAT_RE = /\s*[\(\[]?\s*(?:feat\.?|ft\.?|featuring|with)\s+([^\)\]|]+?)(?=\s+[-–]|[\)\]|]|$)[\)\]]?/i;

/** Remove video-ish noise from a song title. */
function cleanTitle(title) {
  let t = String(title || '');
  t = t.replace(/\s*[\(\[\{【]([^\)\]\}】]*)(official|video|audio|lyric|lyrics|visuali[sz]er|music|m\/v|\bmv\b|clip|videoclip|video oficial|4k|hd|live|performance|teaser|prod\.?)([^\)\]\}】]*)[\)\]\}】]/gi, '');
  t = t.replace(/\s*(official\s*)?(music\s*)?(video|audio|mv|m\/v|lyric video|visualizer)\s*$/i, '');
  t = t.replace(/\s*\|.*$/, '');
  // Japanese-style suffixes: "-Music Video-", "-Dance Practice ver.-"
  t = t.replace(/\s*[-–]\s*[^-–]*(video|ver\.?|version|practice|mv|live|performance|lyric)[^-–]*[-–]?\s*$/i, '');
  t = t.replace(/\s*#\S+/g, '');
  // "Song" (feat. X)  ->  Song (feat. X)
  t = t.replace(/^\s*["“'‘]([^"”'’]+)["”'’]\s*/, '$1 ');
  t = t.replace(/\s{2,}/g, ' ').replace(/^[\s\-–—:"'“”‘’「」『』]+|[\s\-–—:"'“”‘’「」『』]+$/g, '');
  return t.trim() || String(title || '').trim();
}

/** Title without featured-artist credits, for matching. */
function baseTitle(title) {
  return cleanTitle(title).replace(FEAT_RE, '').replace(/\s*[\(\[][^\)\]]*[\)\]]\s*/g, ' ').trim();
}

/** Split an artist credit string into individual artists (primary first). */
function splitArtists(credit) {
  return String(credit || '')
    .split(/\s*(?:,|;|\s&\s|\s\+\s|\sx\s|\sX\s|\sfeat\.?\s|\sft\.?\s|\sfeaturing\s|\swith\s|\s×\s|\/)\s*/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function songKey(artist, title) {
  return `${slugify(splitArtists(artist)[0] || artist)}--${slugify(baseTitle(title))}`.slice(0, 120);
}

// MM_NOW lets tests simulate other days: MM_NOW=2026-01-02T10:00:00Z
function now() {
  return process.env.MM_NOW ? new Date(process.env.MM_NOW) : new Date();
}

function today() {
  return now().toISOString().slice(0, 10);
}

function readJSON(file, fallback = null) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}

/**
 * Write JSON with one top-level entry per line: compact, but still produces
 * small, readable git diffs.
 */
function writeJSON(file, obj, { pretty = false } = {}) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  let s;
  if (pretty) s = JSON.stringify(obj, null, 1);
  else if (Array.isArray(obj)) s = '[\n' + obj.map((v) => JSON.stringify(v)).join(',\n') + '\n]';
  else if (obj && typeof obj === 'object') {
    s = '{\n' + Object.entries(obj).filter(([, v]) => v !== undefined).map(([k, v]) => {
      if (Array.isArray(v) && v.length && typeof v[0] === 'object') {
        return `${JSON.stringify(k)}: [\n` + v.map((x) => JSON.stringify(x)).join(',\n') + '\n]';
      }
      if (v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length > 20) {
        const kv = Object.entries(v).filter(([, v2]) => v2 !== undefined);
        return `${JSON.stringify(k)}: {\n` + kv.map(([k2, v2]) => `${JSON.stringify(k2)}: ${JSON.stringify(v2)}`).join(',\n') + '\n}';
      }
      return `${JSON.stringify(k)}: ${JSON.stringify(v)}`;
    }).join(',\n') + '\n}';
  } else s = JSON.stringify(obj);
  fs.writeFileSync(file, s + '\n');
}

function formatNumber(n) {
  n = Number(n) || 0;
  if (n >= 1e9) return (n / 1e9).toFixed(n >= 1e10 ? 1 : 2).replace(/\.0+$/, '') + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'K';
  return String(n);
}

module.exports = {
  ROOT, RAW_DIR, HISTORY_DIR, CACHE_DIR, DATA_DIR,
  sleep, httpGet, fetchJSON, mapLimit, slugify, cleanTitle, baseTitle, splitArtists, songKey,
  now, today, FEAT_RE, readJSON, writeJSON, formatNumber,
};
