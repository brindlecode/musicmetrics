#!/usr/bin/env node
'use strict';
/**
 * Spotify artist ids from Wikidata (property P1902), matched to our artists by
 * name. Wikidata is CC0; nothing is requested from Spotify itself. The ids only
 * power direct "Listen on Spotify" links and the click-to-load official embed.
 * Cached for a week in store/cache/wikidata_spotify.json.
 */
const path = require('path');
const { CACHE_DIR, fetchJSON, readJSON, writeJSON, slugify } = require('./lib/common');

const FILE = path.join(CACHE_DIR, 'wikidata_spotify.json');
const ID_RE = /^[0-9A-Za-z]{22}$/;

// Split by sitelink count so no single query hits the 60 s SPARQL limit.
const BANDS = [[20, 100000], [8, 19], [3, 7], [1, 2]];

function query([min, max]) {
  return `SELECT ?item ?name ?sp ?links WHERE {
    ?item wdt:P1902 ?sp ; wikibase:sitelinks ?links .
    FILTER(?links >= ${min} && ?links <= ${max})
    ?item rdfs:label ?name . FILTER(LANG(?name) = "en" || LANG(?name) = "mul")
  }`;
}

async function main() {
  const cache = readJSON(FILE, null);
  if (cache && cache.ts && (Date.now() - Date.parse(cache.ts)) / 864e5 < 7) {
    console.log(`  wikidata spotify: cached (${Object.keys(cache.map).length} artists)`);
    return;
  }
  const best = {};
  let ok = 0;
  for (const band of BANDS) {
    try {
      const d = await fetchJSON(`https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(query(band))}`, {
        retries: 1, label: `wikidata spotify ${band.join('-')}`, headers: { Accept: 'application/sparql-results+json' },
      });
      const rows = (d && d.results && d.results.bindings) || [];
      for (const b of rows) {
        const slug = slugify(b.name && b.name.value);
        const id = b.sp && b.sp.value;
        const links = Number(b.links && b.links.value) || 0;
        if (!slug || !ID_RE.test(id || '')) continue;
        if (!best[slug] || links > best[slug][1]) best[slug] = [id, links];
      }
      ok++;
      console.log(`  wikidata spotify ${band.join('-')} sitelinks: ${rows.length} rows`);
    } catch (e) {
      console.warn('  wikidata spotify:', e.message.slice(0, 160));
    }
  }
  if (!ok) return; // keep the previous cache
  const map = { ...((cache && cache.map) || {}), ...Object.fromEntries(Object.entries(best).map(([k, v]) => [k, v[0]])) };
  writeJSON(FILE, { ts: new Date().toISOString(), map });
  console.log(`  wikidata spotify: ${Object.keys(map).length} artists`);
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
