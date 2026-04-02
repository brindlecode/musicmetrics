#!/usr/bin/env node
/**
 * Fetch Deezer Charts Data
 * Uses Deezer's public API (no authentication required)
 *
 * Multiple endpoints tried:
 *   1. GET https://api.deezer.com/chart/0/tracks?limit=100
 *   2. GET https://api.deezer.com/chart (fallback)
 *   3. GET https://api.deezer.com/playlist/PLAYLIST_ID (country-specific editorial playlists)
 *
 * Output: data/charts/deezer_*.json, data/artists/deezer_top.json
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const DATA_DIR = path.join(__dirname, '..', 'data', 'charts');
const ARTISTS_DIR = path.join(__dirname, '..', 'data', 'artists');

// Deezer editorial/chart playlist IDs per country
// These are Deezer's official "Top [Country]" playlists
const DEEZER_PLAYLISTS = {
  global: null, // use /chart endpoint
  us: '1313621735',
  gb: '1313623125',
  br: '1111143121',
  de: '1116190041',
  fr: '1109890291',
  jp: '1279119721',
  mx: '1116187241',
  tr: '1116189381',
  es: '1116188681',
  it: '1116189161',
  kr: '1362510315',
  in: '1362516455',
  ar: '1116185541',
  co: '1116186481',
  au: '1313622565',
  ca: '1313622025',
  nl: '1116190451',
  se: '1116190861',
  pl: '1116190651',
  pt: '1116190751',
  id: '1362508755',
  ph: '1362512985',
  th: '1362514615',
  ng: '1362519225',
  za: '1362520845',
  eg: '1362521775',
  sa: '1362523265',
  ae: '1362524165',
};

function fetchURL(url, retries = 3) {
  return new Promise((resolve, reject) => {
    console.log(`    GET ${url}`);
    const urlObj = new URL(url);
    const protocol = urlObj.protocol === 'https:' ? https : http;
    const options = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      timeout: 20000,
    };

    const req = protocol.request(options, (res) => {
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
            console.log(`    Retrying in 3s... (${retries} left)`);
            setTimeout(() => fetchURL(url, retries - 1).then(resolve).catch(reject), 3000);
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
          // Check for Deezer API error response
          if (parsed.error) {
            console.error(`    Deezer API error: ${JSON.stringify(parsed.error)}`);
            if (retries > 0) {
              console.log(`    Retrying in 3s... (${retries} left)`);
              setTimeout(() => fetchURL(url, retries - 1).then(resolve).catch(reject), 3000);
            } else {
              reject(new Error(`Deezer API error: ${parsed.error.message || JSON.stringify(parsed.error)}`));
            }
            return;
          }
          resolve(parsed);
        } catch (e) {
          console.error(`    Parse error: ${e.message}`);
          console.error(`    Body preview: ${data.substring(0, 300)}`);
          if (retries > 0) {
            setTimeout(() => fetchURL(url, retries - 1).then(resolve).catch(reject), 3000);
          } else {
            reject(new Error(`Failed to parse JSON from ${url}`));
          }
        }
      });
    });

    req.on('timeout', () => {
      req.destroy();
      if (retries > 0) {
        console.log(`    Timeout, retrying in 3s... (${retries} left)`);
        setTimeout(() => fetchURL(url, retries - 1).then(resolve).catch(reject), 3000);
      } else {
        reject(new Error(`Timeout fetching ${url}`));
      }
    });

    req.on('error', (err) => {
      console.error(`    Request error: ${err.message}`);
      if (retries > 0) {
        console.log(`    Retrying in 3s... (${retries} left)`);
        setTimeout(() => fetchURL(url, retries - 1).then(resolve).catch(reject), 3000);
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

function processChartTracks(tracks) {
  return tracks.map((track, index) => ({
    rank: index + 1,
    title: track.title || track.title_short || '',
    artist: track.artist ? track.artist.name : '',
    artist_slug: track.artist ? slugify(track.artist.name) : '',
    artist_id: track.artist ? track.artist.id : 0,
    album: track.album ? track.album.title : '',
    image: track.album ? (track.album.cover_small || track.album.cover || '') : '',
    image_medium: track.album ? (track.album.cover_medium || track.album.cover || '') : '',
    duration: track.duration || 0,
    streams_formatted: track.rank ? formatNumber(track.rank) : `#${index + 1}`,
    preview: track.preview || '',
    deezer_id: track.id,
    deezer_url: track.link || `https://www.deezer.com/track/${track.id}`,
    change: 'new',
    change_num: 0,
    peak: index + 1
  }));
}

function processPlaylistTracks(tracks) {
  return tracks.map((item, index) => {
    // Playlist tracks may be wrapped in a data property
    const track = item.track || item;
    return {
      rank: index + 1,
      title: track.title || track.title_short || '',
      artist: track.artist ? track.artist.name : '',
      artist_slug: track.artist ? slugify(track.artist.name) : '',
      artist_id: track.artist ? track.artist.id : 0,
      album: track.album ? track.album.title : '',
      image: track.album ? (track.album.cover_small || track.album.cover || '') : '',
      image_medium: track.album ? (track.album.cover_medium || track.album.cover || '') : '',
      duration: track.duration || 0,
      streams_formatted: `#${index + 1}`,
      preview: track.preview || '',
      deezer_id: track.id,
      deezer_url: track.link || `https://www.deezer.com/track/${track.id}`,
      change: 'new',
      change_num: 0,
      peak: index + 1
    };
  });
}

async function fetchGlobalChart() {
  console.log('\n  === Fetching Deezer Global Chart ===');

  // Try endpoint 1: /chart/0/tracks
  try {
    console.log('  Trying: /chart/0/tracks?limit=100');
    const data = await fetchURL('https://api.deezer.com/chart/0/tracks?limit=100');

    if (data.data && Array.isArray(data.data) && data.data.length > 0) {
      const tracks = processChartTracks(data.data);
      console.log(`  Success! Got ${tracks.length} tracks from /chart/0/tracks`);
      return tracks;
    }
    console.warn(`  /chart/0/tracks: data.data has ${data.data ? data.data.length : 0} items`);
  } catch (error) {
    console.error(`  /chart/0/tracks failed: ${error.message}`);
  }

  // Try endpoint 2: /chart
  try {
    console.log('  Trying: /chart');
    const data = await fetchURL('https://api.deezer.com/chart');

    if (data.tracks && data.tracks.data && data.tracks.data.length > 0) {
      const tracks = processChartTracks(data.tracks.data);
      console.log(`  Success! Got ${tracks.length} tracks from /chart`);
      return tracks;
    }
    console.warn(`  /chart: tracks.data has ${data.tracks ? (data.tracks.data ? data.tracks.data.length : 'no data') : 'no tracks'} items`);
  } catch (error) {
    console.error(`  /chart failed: ${error.message}`);
  }

  // Try endpoint 3: /editorial/0/charts (editorial charts)
  try {
    console.log('  Trying: /editorial/0/charts');
    const data = await fetchURL('https://api.deezer.com/editorial/0/charts');

    if (data.tracks && data.tracks.data && data.tracks.data.length > 0) {
      const tracks = processChartTracks(data.tracks.data);
      console.log(`  Success! Got ${tracks.length} tracks from /editorial/0/charts`);
      return tracks;
    }
  } catch (error) {
    console.error(`  /editorial/0/charts failed: ${error.message}`);
  }

  // Try endpoint 4: /playlist/3155776842 (Deezer Global Top 100)
  try {
    console.log('  Trying: Deezer Global Top 100 playlist');
    const data = await fetchURL('https://api.deezer.com/playlist/3155776842/tracks?limit=100');

    if (data.data && Array.isArray(data.data) && data.data.length > 0) {
      const tracks = processPlaylistTracks(data.data);
      console.log(`  Success! Got ${tracks.length} tracks from Global Top 100 playlist`);
      return tracks;
    }
  } catch (error) {
    console.error(`  Global Top 100 playlist failed: ${error.message}`);
  }

  return null;
}

async function fetchCountryChart(countryCode, playlistId) {
  if (!playlistId) return null;

  console.log(`\n  Fetching Deezer chart for ${countryCode.toUpperCase()} (playlist: ${playlistId})...`);

  try {
    const data = await fetchURL(`https://api.deezer.com/playlist/${playlistId}/tracks?limit=100`);

    if (data.data && Array.isArray(data.data) && data.data.length > 0) {
      const tracks = processPlaylistTracks(data.data);
      console.log(`    Got ${tracks.length} tracks for ${countryCode}`);
      return tracks;
    }
    console.warn(`    No tracks in playlist ${playlistId} for ${countryCode}`);
    return null;
  } catch (error) {
    console.error(`    Error for ${countryCode}: ${error.message}`);
    return null;
  }
}

async function main() {
  console.log('=== Deezer Data Fetcher (Enhanced) ===');
  console.log(`Date: ${new Date().toISOString()}`);
  console.log(`Node: ${process.version}`);

  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(ARTISTS_DIR, { recursive: true });

  let successCount = 0;

  // Fetch global chart
  const globalTracks = await fetchGlobalChart();

  if (globalTracks && globalTracks.length > 0) {
    const globalChart = {
      country: 'global',
      platform: 'deezer',
      updated: new Date().toISOString().split('T')[0],
      total: globalTracks.length,
      tracks: globalTracks
    };

    fs.writeFileSync(
      path.join(DATA_DIR, 'deezer_global.json'),
      JSON.stringify(globalChart, null, 2)
    );
    console.log(`\n  Saved deezer_global.json (${globalTracks.length} tracks)`);
    successCount++;

    // For countries without specific playlists, use global data
    const countriesWithoutPlaylists = Object.entries(DEEZER_PLAYLISTS)
      .filter(([code, id]) => !id && code !== 'global')
      .map(([code]) => code);

    for (const code of countriesWithoutPlaylists) {
      const countryData = { ...globalChart, country: code };
      fs.writeFileSync(
        path.join(DATA_DIR, `deezer_${code}.json`),
        JSON.stringify(countryData, null, 2)
      );
    }
  } else {
    console.error('\n  FAILED: Could not get global chart data');
  }

  // Fetch country-specific charts via playlists
  for (const [code, playlistId] of Object.entries(DEEZER_PLAYLISTS)) {
    if (code === 'global' || !playlistId) continue;

    const tracks = await fetchCountryChart(code, playlistId);
    if (tracks && tracks.length > 0) {
      const chartData = {
        country: code,
        platform: 'deezer',
        updated: new Date().toISOString().split('T')[0],
        total: tracks.length,
        tracks
      };
      fs.writeFileSync(
        path.join(DATA_DIR, `deezer_${code}.json`),
        JSON.stringify(chartData, null, 2)
      );
      successCount++;
    }
    // Respect rate limit: 50 requests per 5 seconds
    await new Promise(r => setTimeout(r, 200));
  }

  // Fetch top artists
  console.log('\n  === Fetching Deezer Top Artists ===');
  try {
    const data = await fetchURL('https://api.deezer.com/chart/0/artists?limit=100');
    if (data.data && data.data.length > 0) {
      const artists = data.data.map((artist, index) => ({
        rank: index + 1,
        name: artist.name,
        slug: slugify(artist.name),
        deezer_id: artist.id,
        image: artist.picture_medium || artist.picture || '',
        fans: artist.nb_fan || 0
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

  console.log(`\n=== Deezer fetch complete: ${successCount} charts saved ===`);

  if (successCount === 0) {
    console.error('WARNING: No Deezer data was fetched successfully');
    process.exit(1);
  }
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
