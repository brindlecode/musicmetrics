#!/usr/bin/env node
/**
 * Fetch Deezer Charts Data
 * Uses Deezer's public API (no authentication required)
 *
 * Endpoints:
 *   GET https://api.deezer.com/chart/0/tracks  - Global top tracks
 *   GET https://api.deezer.com/chart/0/artists - Global top artists
 *   GET https://api.deezer.com/chart/0/albums  - Global top albums
 *   GET https://api.deezer.com/editorial/{id}/charts - Editorial charts (by country)
 *
 * Output: data/charts/deezer_*.json
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const DATA_DIR = path.join(__dirname, '..', 'data', 'charts');
const ARTISTS_DIR = path.join(__dirname, '..', 'data', 'artists');

// Deezer editorial IDs for countries
const COUNTRY_EDITORIALS = {
  global: 0,
  us: 484572581, gb: 1996916462, br: 2528039982, de: 1111886062,
  fr: 1362508455, jp: 3224961922, mx: 1116186742, tr: 1362511115,
  es: 1362510455, it: 1362509555, kr: 2810609102, in: 4606498442,
  ar: 4454197202, co: 1116189782, au: 2528035402, ca: 1652248171,
  nl: 1362512015, se: 1362512815, pl: 1116191002, pt: 1362513715,
  id: 3155778062, ph: 4489576722, th: 4489576182, ng: 4606501262,
  za: 4606499462, eg: 4606497162, sa: 4606500102
};

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`Failed to parse JSON from ${url}: ${e.message}`));
        }
      });
      res.on('error', reject);
    }).on('error', reject);
  });
}

function formatNumber(num) {
  if (num >= 1e9) return (num / 1e9).toFixed(1) + 'B';
  if (num >= 1e6) return (num / 1e6).toFixed(1) + 'M';
  if (num >= 1e3) return (num / 1e3).toFixed(1) + 'K';
  return num.toString();
}

function slugify(str) {
  return str.toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

async function fetchDeezerChart(countryCode, editorialId) {
  const url = `https://api.deezer.com/chart/${editorialId}/tracks?limit=100`;
  console.log(`  Fetching Deezer chart for ${countryCode}...`);

  try {
    const data = await fetchJSON(url);

    if (!data.data || !Array.isArray(data.data)) {
      console.warn(`  Warning: No track data for ${countryCode}`);
      return null;
    }

    const tracks = data.data.map((track, index) => ({
      rank: index + 1,
      title: track.title,
      artist: track.artist.name,
      artist_slug: slugify(track.artist.name),
      artist_id: track.artist.id,
      album: track.album.title,
      image: track.album.cover_small,
      image_medium: track.album.cover_medium,
      duration: track.duration,
      streams_formatted: formatNumber(track.rank || 0),
      preview: track.preview,
      deezer_id: track.id,
      change: 'new',
      change_num: 0,
      peak: index + 1
    }));

    return {
      country: countryCode,
      updated: new Date().toISOString().split('T')[0],
      total: tracks.length,
      tracks
    };
  } catch (error) {
    console.error(`  Error fetching ${countryCode}: ${error.message}`);
    return null;
  }
}

async function fetchDeezerArtists() {
  const url = 'https://api.deezer.com/chart/0/artists?limit=100';
  console.log('Fetching Deezer top artists...');

  try {
    const data = await fetchJSON(url);

    if (!data.data) return null;

    return data.data.map((artist, index) => ({
      rank: index + 1,
      name: artist.name,
      slug: slugify(artist.name),
      deezer_id: artist.id,
      image: artist.picture_medium,
      fans: artist.nb_fan
    }));
  } catch (error) {
    console.error(`Error fetching artists: ${error.message}`);
    return null;
  }
}

async function main() {
  console.log('=== Deezer Data Fetcher ===');
  console.log(`Date: ${new Date().toISOString()}`);

  // Ensure directories exist
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(ARTISTS_DIR, { recursive: true });

  // Fetch global chart first
  const globalChart = await fetchDeezerChart('global', 0);
  if (globalChart) {
    fs.writeFileSync(
      path.join(DATA_DIR, 'deezer_global.json'),
      JSON.stringify(globalChart, null, 2)
    );
    console.log(`  Saved deezer_global.json (${globalChart.total} tracks)`);
  }

  // Fetch country charts (with rate limiting)
  for (const [code, editorialId] of Object.entries(COUNTRY_EDITORIALS)) {
    if (code === 'global') continue;

    const chart = await fetchDeezerChart(code, editorialId);
    if (chart) {
      fs.writeFileSync(
        path.join(DATA_DIR, `deezer_${code}.json`),
        JSON.stringify(chart, null, 2)
      );
    }

    // Rate limit: 50 requests per 5 seconds for Deezer
    await new Promise(r => setTimeout(r, 150));
  }

  // Fetch top artists
  const artists = await fetchDeezerArtists();
  if (artists) {
    fs.writeFileSync(
      path.join(ARTISTS_DIR, 'deezer_top.json'),
      JSON.stringify({ updated: new Date().toISOString().split('T')[0], artists }, null, 2)
    );
    console.log(`Saved deezer_top.json (${artists.length} artists)`);
  }

  console.log('\n=== Deezer fetch complete ===');
}

main().catch(console.error);
