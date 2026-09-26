#!/usr/bin/env node
'use strict';
/**
 * Notifies IndexNow-compatible search engines (Bing, Yandex, Seznam, Naver…)
 * that the most important pages changed. Google does not use IndexNow; it
 * reads the sitemap submitted in Search Console.
 */
const https = require('https');
const { DATA_DIR, readJSON } = require('./lib/common');
const path = require('path');

const HOST = 'musicmetrics.net';
const KEY = '7c1f3a9e5b2d4e8f9a6c0b1d2e3f4a5b';
const LANGS = ['', 'tr/', 'es/', 'pt/', 'de/', 'fr/', 'ja/'];

const countries = Object.keys(readJSON(path.join(DATA_DIR, 'countries.json'), {}));
const charts = readJSON(path.join(DATA_DIR, 'meta.json'), {});
const paths = ['', 'charts/', 'charts/global/', 'artists/', 'countries/', 'charts/youtube/most-viewed/', 'weekly/'];
for (const cc of countries) paths.push(`countries/${cc}/`);
const urls = [];
for (const l of LANGS) for (const p of paths) urls.push(`https://${HOST}/${l}${p}`);

const body = JSON.stringify({ host: HOST, key: KEY, keyLocation: `https://${HOST}/${KEY}.txt`, urlList: urls.slice(0, 9999) });
const req = https.request({ hostname: 'api.indexnow.org', path: '/indexnow', method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body) } }, (res) => {
  console.log(`IndexNow: HTTP ${res.statusCode} for ${urls.length} URLs (updated ${charts.updated || '?'})`);
  res.resume();
});
req.on('error', (e) => console.warn('IndexNow error:', e.message));
req.end(body);
