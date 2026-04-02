#!/usr/bin/env node
/**
 * Fetch Deezer Charts Data
 * Uses Deezer's public API (no authentication required)
 *
 * Global chart:  GET https://api.deezer.com/chart/0/tracks?limit=100
 * Search:        GET https://api.deezer.com/search?q=...
 *
 * Output: data/charts/deezer_*.json
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const DATA_DIR = path.join(__dirname, '..', 'data', 'charts');
const ARTISTS_DIR = path.join(__dirname, '..', 'data', 'artists');

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'Accept': 'application/json' } }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`Failed to parse JSON from ${url}: ${e.message}\nBody: ${data.substring(0, 200)}`));
        }
      });
      res.on('error', reject);
    });
    req.on('error', reject);
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

function processTrackData(tracks) {
  return tracks.map((track, index) => ({
    rank: index + 1,
    title: track.title || track.title_short || '',
    artist: track.artist ? track.artist.name : '',
    artist_slug: track.artist ? slugify(track.artist.name) : '',
    artist_id: track.artist ? track.artist.id : 0,
    album: track.album ? track.album.title : '',
    image: track.album ? track.album.cover_small : '',
    image_medium: track.album ? track.album.cover_medium : '',
    duration: track.duration || 0,
    streams_formatted: formatNumber(track.position || index + 1),
    preview: track.preview || '',
    deezer_id: track.id,
    change: 'new',
    change_num: 0,
    peak: index + 1
  }));
}

async function fetchGlobalChart() {
  console.log('  Fetching Deezer global chart...');
  try {
    const data = await fetchJSON('https://api.deezer.com/chart/0/tracks?limit=100');
    if (!data.data || !Array.isArray(data.data) || data.data.length === 0) {
      console.warn('  Warning: No track data from /chart/0/tracks');
      console.log('  Response:', JSON.stringify(data).substring(0, 300));
      return null;
    }
    const tracks = processTrackData(data.data);
    console.log(`  Got ${tracks.length} global tracks`);
    return {
      country: 'global',
      updated: new Date().toISOString().split('T')[0],
      total: tracks.length,
      tracks
    };
  } catch (error) {
    console.error(`  Error fetching global chart: ${error.message}`);
    return null;
  }
}

async function fetchDeezerArtists() {
  console.log('Fetching Deezer top artists...');
  try {
    const data = await fetchJSON('https://api.deezer.com/chart/0/artists?limit=100');
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

  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(ARTISTS_DIR, { recursive: true });

  // Fetch global chart (this is the reliable endpoint)
  const globalChart = await fetchGlobalChart();
  if (globalChart) {
    fs.writeFileSync(
      path.join(DATA_DIR, 'deezer_global.json'),
      JSON.stringify(globalChart, null, 2)
    );
    console.log(`  Saved deezer_global.json (${globalChart.total} tracks)`);

    // Use global chart data for major countries too (Deezer doesn't have free country-specific chart API)
    // We save the same global data under each country key so pages aren't empty
    const countries = ['us','gb','br','de','fr','jp','mx','tr','es','it','kr','in','ar','co','au','ca','nl','se','pl','pt','id','ph','th','ng','za','eg','sa'];
    for (const code of countries) {
      const countryData = { ...globalChart, country: code };
      fs.writeFileSync(
        path.join(DATA_DIR, `deezer_${code}.json`),
        JSON.stringify(countryData, null, 2)
      );
    }
    console.log(`  Saved deezer charts for ${countries.length} countries`);
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
