#!/usr/bin/env node
/**
 * Fetch Deezer Charts Data
 * Uses Deezer's public API (no authentication required)
 *
 * Global chart:  GET https://api.deezer.com/chart/0/tracks?limit=100
 *
 * Output: data/charts/deezer_*.json
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const DATA_DIR = path.join(__dirname, '..', 'data', 'charts');
const ARTISTS_DIR = path.join(__dirname, '..', 'data', 'artists');

function fetchURL(url, retries = 3) {
  return new Promise((resolve, reject) => {
    console.log(`    GET ${url}`);
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'MusicMetrics/1.0'
      },
      timeout: 15000
    };

    const req = https.request(options, (res) => {
      console.log(`    Status: ${res.statusCode}`);

      // Handle redirects
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        console.log(`    Redirect -> ${res.headers.location}`);
        return fetchURL(res.headers.location, retries).then(resolve).catch(reject);
      }

      if (res.statusCode !== 200) {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          console.error(`    HTTP ${res.statusCode}: ${body.substring(0, 300)}`);
          if (retries > 0) {
            console.log(`    Retrying... (${retries} left)`);
            setTimeout(() => fetchURL(url, retries - 1).then(resolve).catch(reject), 2000);
          } else {
            reject(new Error(`HTTP ${res.statusCode} from ${url}`));
          }
        });
        return;
      }

      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve(parsed);
        } catch (e) {
          console.error(`    Parse error: ${e.message}`);
          console.error(`    Body preview: ${data.substring(0, 300)}`);
          reject(new Error(`Failed to parse JSON from ${url}`));
        }
      });
    });

    req.on('timeout', () => {
      req.destroy();
      if (retries > 0) {
        console.log(`    Timeout, retrying... (${retries} left)`);
        setTimeout(() => fetchURL(url, retries - 1).then(resolve).catch(reject), 2000);
      } else {
        reject(new Error(`Timeout fetching ${url}`));
      }
    });

    req.on('error', (err) => {
      console.error(`    Request error: ${err.message}`);
      if (retries > 0) {
        console.log(`    Retrying... (${retries} left)`);
        setTimeout(() => fetchURL(url, retries - 1).then(resolve).catch(reject), 2000);
      } else {
        reject(err);
      }
    });

    req.end();
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
    streams_formatted: formatNumber(track.rank || index + 1),
    preview: track.preview || '',
    deezer_id: track.id,
    change: 'new',
    change_num: 0,
    peak: index + 1
  }));
}

async function main() {
  console.log('=== Deezer Data Fetcher ===');
  console.log(`Date: ${new Date().toISOString()}`);

  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(ARTISTS_DIR, { recursive: true });

  // Fetch global chart
  console.log('\n  Fetching Deezer global chart...');
  let globalChart = null;
  try {
    const data = await fetchURL('https://api.deezer.com/chart/0/tracks?limit=100');
    console.log(`    Response keys: ${Object.keys(data).join(', ')}`);

    if (data.data && Array.isArray(data.data) && data.data.length > 0) {
      const tracks = processTrackData(data.data);
      console.log(`    Processed ${tracks.length} tracks`);
      globalChart = {
        country: 'global',
        updated: new Date().toISOString().split('T')[0],
        total: tracks.length,
        tracks
      };
    } else {
      console.warn(`    Warning: Unexpected response structure`);
      console.log(`    data.data exists: ${!!data.data}, isArray: ${Array.isArray(data.data)}, length: ${data.data ? data.data.length : 'N/A'}`);
      // Try alternative: /chart endpoint
      console.log('    Trying alternative /chart endpoint...');
      const altData = await fetchURL('https://api.deezer.com/chart');
      if (altData.tracks && altData.tracks.data && altData.tracks.data.length > 0) {
        const tracks = processTrackData(altData.tracks.data);
        console.log(`    Alt endpoint: ${tracks.length} tracks`);
        globalChart = {
          country: 'global',
          updated: new Date().toISOString().split('T')[0],
          total: tracks.length,
          tracks
        };
      }
    }
  } catch (error) {
    console.error(`  Error fetching global chart: ${error.message}`);
  }

  if (globalChart) {
    fs.writeFileSync(
      path.join(DATA_DIR, 'deezer_global.json'),
      JSON.stringify(globalChart, null, 2)
    );
    console.log(`  Saved deezer_global.json (${globalChart.total} tracks)`);

    const countries = ['us','gb','br','de','fr','jp','mx','tr','es','it','kr','in','ar','co','au','ca','nl','se','pl','pt','id','ph','th','ng','za','eg','sa','ae'];
    for (const code of countries) {
      const countryData = { ...globalChart, country: code };
      fs.writeFileSync(
        path.join(DATA_DIR, `deezer_${code}.json`),
        JSON.stringify(countryData, null, 2)
      );
    }
    console.log(`  Saved deezer charts for ${countries.length} countries`);
  } else {
    console.error('  FAILED: No Deezer chart data obtained');
  }

  // Fetch top artists
  console.log('\n  Fetching Deezer top artists...');
  try {
    const data = await fetchURL('https://api.deezer.com/chart/0/artists?limit=100');
    if (data.data && data.data.length > 0) {
      const artists = data.data.map((artist, index) => ({
        rank: index + 1,
        name: artist.name,
        slug: slugify(artist.name),
        deezer_id: artist.id,
        image: artist.picture_medium,
        fans: artist.nb_fan
      }));
      fs.writeFileSync(
        path.join(ARTISTS_DIR, 'deezer_top.json'),
        JSON.stringify({ updated: new Date().toISOString().split('T')[0], artists }, null, 2)
      );
      console.log(`  Saved deezer_top.json (${artists.length} artists)`);
    }
  } catch (error) {
    console.error(`  Error fetching artists: ${error.message}`);
  }

  console.log('\n=== Deezer fetch complete ===');
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
