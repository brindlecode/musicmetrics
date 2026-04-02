#!/usr/bin/env node
/**
 * Fetch Spotify Charts Data via Public Charts API
 *
 * Uses Spotify's public charts endpoint (same as charts.spotify.com)
 * NO authentication required - completely free
 *
 * Endpoint: https://charts-spotify-com-service.spotify.com/public/v0/charts
 *
 * Output: data/charts/spotify_*.json
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const DATA_DIR = path.join(__dirname, '..', 'data', 'charts');

// Country codes supported by Spotify Charts
const COUNTRIES = {
  global: 'global',
  us: 'us',
  gb: 'gb',
  br: 'br',
  de: 'de',
  fr: 'fr',
  jp: 'jp',
  mx: 'mx',
  tr: 'tr',
  es: 'es',
  it: 'it',
  kr: 'kr',
  in: 'in',
  ar: 'ar',
  co: 'co',
  au: 'au',
  ca: 'ca',
  nl: 'nl',
  se: 'se',
  pl: 'pl',
  id: 'id',
  ph: 'ph',
  th: 'th',
  ng: 'ng',
  za: 'za',
  eg: 'eg',
  sa: 'sa',
  ae: 'ae',
};

// Fallback: Official Spotify Top 50 playlist IDs (used if Charts API fails)
const SPOTIFY_PLAYLISTS = {
  global: '37i9dQZEVXbMDoHDwVN2tF',
  us: '37i9dQZEVXbLRQDuF5jeBp',
  gb: '37i9dQZEVXbLnolsZ8PSNw',
  br: '37i9dQZEVXbMXbN3EUUhlg',
  de: '37i9dQZEVXbJiZcmkrIHGU',
  fr: '37i9dQZEVXbIPWwFssbupI',
  jp: '37i9dQZEVXbKXQ4mDTEBXq',
  mx: '37i9dQZEVXbO3qyFxbkOE1',
  tr: '37i9dQZEVXbIVYVBNw9D5K',
  es: '37i9dQZEVXbNFJfN1Vw8d9',
  it: '37i9dQZEVXbIQnj7RRhdSX',
  kr: '37i9dQZEVXbNxXF4SkHj9F',
  in: '37i9dQZEVXbLZ52XmnySJg',
  ar: '37i9dQZEVXbMMy2roB9myp',
  co: '37i9dQZEVXbOa2lmxNORXQ',
  au: '37i9dQZEVXbJPcfkRz0wJ0',
  ca: '37i9dQZEVXbKj23U1GF4IR',
};

function httpsRequest(url, options = {}, retries = 3) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const reqOptions = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: options.method || 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        ...options.headers,
      },
      timeout: 20000,
    };

    console.log(`    ${reqOptions.method} ${url}`);

    const req = https.request(reqOptions, (res) => {
      // Follow redirects
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        console.log(`    Redirect -> ${res.headers.location}`);
        return httpsRequest(res.headers.location, options, retries).then(resolve).catch(reject);
      }

      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        console.log(`    Status: ${res.statusCode} (${data.length} bytes)`);

        if (res.statusCode === 429) {
          const retryAfter = parseInt(res.headers['retry-after'] || '5');
          console.log(`    Rate limited, waiting ${retryAfter}s...`);
          if (retries > 0) {
            setTimeout(() => httpsRequest(url, options, retries - 1).then(resolve).catch(reject), retryAfter * 1000);
          } else {
            reject(new Error(`Rate limited after all retries: ${url}`));
          }
          return;
        }

        if (res.statusCode !== 200) {
          console.error(`    HTTP ${res.statusCode}: ${data.substring(0, 300)}`);
          if (retries > 0) {
            console.log(`    Retrying... (${retries} left)`);
            setTimeout(() => httpsRequest(url, options, retries - 1).then(resolve).catch(reject), 2000);
          } else {
            reject(new Error(`HTTP ${res.statusCode} from ${url}`));
          }
          return;
        }

        try {
          resolve(JSON.parse(data));
        } catch (e) {
          console.error(`    Parse error: ${e.message}`);
          console.error(`    Body preview: ${data.substring(0, 300)}`);
          if (retries > 0) {
            console.log(`    Retrying... (${retries} left)`);
            setTimeout(() => httpsRequest(url, options, retries - 1).then(resolve).catch(reject), 2000);
          } else {
            reject(new Error(`Parse error from ${url}`));
          }
        }
      });
    });

    req.on('timeout', () => {
      req.destroy();
      if (retries > 0) {
        console.log(`    Timeout, retrying... (${retries} left)`);
        setTimeout(() => httpsRequest(url, options, retries - 1).then(resolve).catch(reject), 2000);
      } else {
        reject(new Error(`Timeout: ${url}`));
      }
    });

    req.on('error', (err) => {
      console.error(`    Request error: ${err.message}`);
      if (retries > 0) {
        console.log(`    Retrying... (${retries} left)`);
        setTimeout(() => httpsRequest(url, options, retries - 1).then(resolve).catch(reject), 3000);
      } else {
        reject(err);
      }
    });

    if (options.body) req.write(options.body);
    req.end();
  });
}

function slugify(str) {
  return str.toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function formatNumber(num) {
  if (!num || isNaN(num)) return '--';
  num = parseInt(num);
  if (num >= 1e9) return (num / 1e9).toFixed(1) + 'B';
  if (num >= 1e6) return (num / 1e6).toFixed(1) + 'M';
  if (num >= 1e3) return (num / 1e3).toFixed(1) + 'K';
  return num.toString();
}

/**
 * Strategy 1: Spotify Public Charts API
 * This is the same API that charts.spotify.com uses - no auth needed
 */
async function fetchFromChartsAPI(countryCode) {
  const region = countryCode === 'global' ? 'global' : countryCode;
  const url = `https://charts-spotify-com-service.spotify.com/public/v0/charts?offset=0&limit=200&type=regional&country=${region}&recurrence=daily&date=latest`;

  console.log(`\n  [Charts API] Fetching Spotify chart for ${countryCode.toUpperCase()}...`);

  try {
    const data = await httpsRequest(url);

    if (!data.entries && !data.chartEntryViewResponses) {
      console.warn(`    Unexpected response structure. Keys: ${Object.keys(data).join(', ')}`);
      return null;
    }

    const entries = data.entries || data.chartEntryViewResponses || [];
    if (entries.length === 0) {
      console.warn(`    No entries for ${countryCode}`);
      return null;
    }

    const tracks = entries.map((entry, index) => {
      const meta = entry.trackMetadata || entry.track || {};
      const chartData = entry.chartEntryData || entry.chartEntry || {};
      const artists = meta.artists || [];
      const artistName = artists.map(a => a.name).join(', ') || meta.artistName || '';
      const firstArtist = artists[0] ? artists[0].name : artistName.split(',')[0].trim();

      return {
        rank: chartData.currentRank || index + 1,
        title: meta.trackName || meta.name || '',
        artist: artistName,
        artist_slug: slugify(firstArtist),
        album: meta.albumName || meta.album || '',
        image: meta.displayImageUri || meta.imageUrl || '',
        image_medium: meta.displayImageUri || meta.imageUrl || '',
        spotify_id: meta.trackUri ? meta.trackUri.replace('spotify:track:', '') : '',
        spotify_url: meta.trackUri ? `https://open.spotify.com/track/${meta.trackUri.replace('spotify:track:', '')}` : '',
        streams_formatted: formatNumber(chartData.totalStreams || chartData.streams),
        streams: chartData.totalStreams || chartData.streams || 0,
        change: chartData.entryStatus === 'NEW' ? 'new' : (chartData.rankingMetric || 'same'),
        change_num: chartData.previousRank ? (chartData.previousRank - (chartData.currentRank || index + 1)) : 0,
        peak: chartData.peakRank || chartData.currentRank || index + 1
      };
    });

    console.log(`    Got ${tracks.length} tracks for ${countryCode} via Charts API`);

    return {
      country: countryCode,
      platform: 'spotify',
      updated: new Date().toISOString().split('T')[0],
      total: tracks.length,
      tracks
    };
  } catch (error) {
    console.error(`    Charts API error for ${countryCode}: ${error.message}`);
    return null;
  }
}

/**
 * Strategy 2: Get anonymous access token from Spotify web player
 * Then use regular Web API with that token (no Premium needed)
 */
async function getAnonymousToken() {
  console.log('  Attempting to get anonymous Spotify token...');
  try {
    const data = await httpsRequest('https://open.spotify.com/get_access_token?reason=transport&productType=web_player');
    if (data.accessToken) {
      console.log(`  Got anonymous token: ${data.accessToken.substring(0, 12)}...`);
      return data.accessToken;
    }
    console.warn('  No accessToken in response');
    return null;
  } catch (error) {
    console.error(`  Anonymous token error: ${error.message}`);
    return null;
  }
}

/**
 * Strategy 3: Client Credentials flow (only works if user has Premium)
 */
async function getClientCredentialsToken() {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    console.log('  No Spotify client credentials available');
    return null;
  }

  console.log('  Attempting client credentials auth...');
  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const postData = 'grant_type=client_credentials';

  try {
    const data = await httpsRequest('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData),
      },
      body: postData,
    });

    if (data.access_token) {
      console.log(`  Got client token: ${data.access_token.substring(0, 12)}...`);
      return data.access_token;
    }
    console.warn(`  Auth response: ${JSON.stringify(data).substring(0, 200)}`);
    return null;
  } catch (error) {
    console.error(`  Client credentials error: ${error.message}`);
    return null;
  }
}

async function fetchFromWebAPI(countryCode, playlistId, token) {
  console.log(`\n  [Web API] Fetching playlist for ${countryCode.toUpperCase()} (${playlistId})...`);

  try {
    const data = await httpsRequest(
      `https://api.spotify.com/v1/playlists/${playlistId}?fields=name,tracks.items(track(name,artists,album(name,images),popularity,id,external_urls))`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      }
    );

    if (!data.tracks || !data.tracks.items) {
      console.warn(`    No tracks in response for ${countryCode}`);
      return null;
    }

    const tracks = data.tracks.items
      .filter(item => item.track && item.track.name)
      .map((item, index) => {
        const track = item.track;
        const artist = track.artists.map(a => a.name).join(', ');
        const images = track.album.images || [];
        const image = images.length > 0 ? images[images.length - 1].url : '';
        const imageMed = images.length > 1 ? images[1].url : image;

        return {
          rank: index + 1,
          title: track.name,
          artist,
          artist_slug: slugify(track.artists[0].name),
          album: track.album.name,
          image,
          image_medium: imageMed,
          popularity: track.popularity,
          spotify_id: track.id,
          spotify_url: (track.external_urls || {}).spotify || '',
          streams_formatted: `Pop: ${track.popularity}`,
          streams: 0,
          change: 'new',
          change_num: 0,
          peak: index + 1
        };
      });

    console.log(`    Got ${tracks.length} tracks for ${countryCode} via Web API`);

    return {
      country: countryCode,
      platform: 'spotify',
      playlist_name: data.name || `Top 50 - ${countryCode.toUpperCase()}`,
      updated: new Date().toISOString().split('T')[0],
      total: tracks.length,
      tracks
    };
  } catch (error) {
    console.error(`    Web API error: ${error.message}`);
    return null;
  }
}

async function main() {
  console.log('=== Spotify Data Fetcher (Multi-Strategy) ===');
  console.log(`Date: ${new Date().toISOString()}`);
  console.log(`Node: ${process.version}`);

  fs.mkdirSync(DATA_DIR, { recursive: true });

  let successCount = 0;
  let strategy = 'none';

  // ===== STRATEGY 1: Public Charts API (preferred - has actual stream counts) =====
  console.log('\n--- Strategy 1: Spotify Public Charts API ---');
  const globalChart = await fetchFromChartsAPI('global');

  if (globalChart && globalChart.tracks.length > 0) {
    strategy = 'charts_api';
    console.log('  Charts API works! Using it for all countries.');

    fs.writeFileSync(
      path.join(DATA_DIR, 'spotify_global.json'),
      JSON.stringify(globalChart, null, 2)
    );
    successCount++;

    for (const code of Object.keys(COUNTRIES)) {
      if (code === 'global') continue;

      const chart = await fetchFromChartsAPI(code);
      if (chart && chart.tracks.length > 0) {
        fs.writeFileSync(
          path.join(DATA_DIR, `spotify_${code}.json`),
          JSON.stringify(chart, null, 2)
        );
        successCount++;
      }
      await new Promise(r => setTimeout(r, 300));
    }
  }

  // ===== STRATEGY 2: Anonymous Token + Web API =====
  if (strategy === 'none') {
    console.log('\n--- Strategy 2: Anonymous Token ---');
    const anonToken = await getAnonymousToken();

    if (anonToken) {
      // Test with global playlist
      const testChart = await fetchFromWebAPI('global', SPOTIFY_PLAYLISTS.global, anonToken);
      if (testChart && testChart.tracks.length > 0) {
        strategy = 'anonymous_token';
        console.log('  Anonymous token works! Using it for all countries.');

        fs.writeFileSync(
          path.join(DATA_DIR, 'spotify_global.json'),
          JSON.stringify(testChart, null, 2)
        );
        successCount++;

        for (const [code, playlistId] of Object.entries(SPOTIFY_PLAYLISTS)) {
          if (code === 'global') continue;
          const chart = await fetchFromWebAPI(code, playlistId, anonToken);
          if (chart) {
            fs.writeFileSync(
              path.join(DATA_DIR, `spotify_${code}.json`),
              JSON.stringify(chart, null, 2)
            );
            successCount++;
          }
          await new Promise(r => setTimeout(r, 500));
        }
      }
    }
  }

  // ===== STRATEGY 3: Client Credentials (requires Premium) =====
  if (strategy === 'none') {
    console.log('\n--- Strategy 3: Client Credentials ---');
    const clientToken = await getClientCredentialsToken();

    if (clientToken) {
      const testChart = await fetchFromWebAPI('global', SPOTIFY_PLAYLISTS.global, clientToken);
      if (testChart && testChart.tracks.length > 0) {
        strategy = 'client_credentials';
        console.log('  Client credentials work! Using for all countries.');

        fs.writeFileSync(
          path.join(DATA_DIR, 'spotify_global.json'),
          JSON.stringify(testChart, null, 2)
        );
        successCount++;

        for (const [code, playlistId] of Object.entries(SPOTIFY_PLAYLISTS)) {
          if (code === 'global') continue;
          const chart = await fetchFromWebAPI(code, playlistId, clientToken);
          if (chart) {
            fs.writeFileSync(
              path.join(DATA_DIR, `spotify_${code}.json`),
              JSON.stringify(chart, null, 2)
            );
            successCount++;
          }
          await new Promise(r => setTimeout(r, 500));
        }
      }
    }
  }

  if (strategy === 'none') {
    console.error('\n=== FAILED: All Spotify strategies failed ===');
    console.error('Possible solutions:');
    console.error('  1. Check if charts-spotify-com-service.spotify.com is accessible');
    console.error('  2. Get a Spotify Premium subscription for Web API access');
    console.error('  3. Check open.spotify.com anonymous token availability');
    process.exit(1);
  }

  console.log(`\n=== Spotify fetch complete (strategy: ${strategy}): ${successCount} charts saved ===`);
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
