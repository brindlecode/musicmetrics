#!/usr/bin/env node
/**
 * Fetch Shazam Charts Data
 * Uses Shazam's public discovery API (no authentication required)
 *
 * Endpoint:
 *   https://www.shazam.com/services/amapi/v1/catalog/{country}/charts
 *     ?types=songs&chart=most-shazamed-songs&limit=100
 *
 * Fallback:
 *   https://www.shazam.com/shazam/v3/en/US/web/-/tracks/world-chart-web
 *
 * Output: data/charts/shazam_*.json
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const DATA_DIR = path.join(__dirname, '..', 'data', 'charts');

const COUNTRIES = {
  global: 'US',
  us: 'US', gb: 'GB', br: 'BR', de: 'DE', fr: 'FR', jp: 'JP',
  mx: 'MX', tr: 'TR', es: 'ES', it: 'IT', kr: 'KR', in: 'IN',
  ar: 'AR', co: 'CO', au: 'AU', ca: 'CA', nl: 'NL', se: 'SE',
  pl: 'PL', pt: 'PT', id: 'ID', ph: 'PH', th: 'TH', ng: 'NG',
  za: 'ZA', eg: 'EG', sa: 'SA', ae: 'AE',
  at: 'AT', ch: 'CH', dk: 'DK', fi: 'FI', gr: 'GR', ie: 'IE',
  il: 'IL', no: 'NO', nz: 'NZ', ro: 'RO',
};

function httpsRequest(url, retries = 3) {
  return new Promise((resolve, reject) => {
    console.log(`    GET ${url}`);
    const urlObj = new URL(url);
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

    const req = https.request(options, (res) => {
      // Follow redirects
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        console.log(`    Redirect -> ${res.headers.location}`);
        return httpsRequest(res.headers.location, retries).then(resolve).catch(reject);
      }

      if (res.statusCode !== 200) {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          console.error(`    HTTP ${res.statusCode}: ${body.substring(0, 300)}`);
          if (retries > 0) {
            console.log(`    Retrying in 3s... (${retries} left)`);
            setTimeout(() => httpsRequest(url, retries - 1).then(resolve).catch(reject), 3000);
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
          resolve(JSON.parse(data));
        } catch (e) {
          console.error(`    Parse error: ${e.message}`);
          console.error(`    Body preview: ${data.substring(0, 300)}`);
          if (retries > 0) {
            setTimeout(() => httpsRequest(url, retries - 1).then(resolve).catch(reject), 3000);
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
        setTimeout(() => httpsRequest(url, retries - 1).then(resolve).catch(reject), 3000);
      } else {
        reject(new Error(`Timeout: ${url}`));
      }
    });

    req.on('error', (err) => {
      console.error(`    Request error: ${err.message}`);
      if (retries > 0) {
        console.log(`    Retrying in 3s... (${retries} left)`);
        setTimeout(() => httpsRequest(url, retries - 1).then(resolve).catch(reject), 3000);
      } else {
        reject(err);
      }
    });

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
 * Strategy 1: Shazam Discovery API (Apple Music catalog endpoint)
 */
async function fetchFromDiscoveryAPI(countryCode) {
  const url = `https://www.shazam.com/services/amapi/v1/catalog/${countryCode}/charts?types=songs&chart=most-shazamed-songs&limit=200`;

  try {
    const data = await httpsRequest(url);

    // Response has results array with chart data
    if (data.results && data.results.length > 0) {
      const chartResult = data.results[0];
      if (chartResult.data && chartResult.data.length > 0) {
        return chartResult.data.map((item, index) => {
          const attrs = item.attributes || {};
          return {
            rank: index + 1,
            title: attrs.name || '',
            artist: attrs.artistName || '',
            artist_slug: slugify(attrs.artistName || ''),
            album: attrs.albumName || '',
            image: attrs.artwork ? attrs.artwork.url.replace('{w}', '100').replace('{h}', '100') : '',
            image_medium: attrs.artwork ? attrs.artwork.url.replace('{w}', '300').replace('{h}', '300') : '',
            shazam_count: attrs.shazamCount || 0,
            streams_formatted: attrs.shazamCount ? formatNumber(attrs.shazamCount) : `#${index + 1}`,
            apple_url: attrs.url || '',
            genre: (attrs.genreNames && attrs.genreNames.length > 0) ? attrs.genreNames[0] : '',
            change: 'new',
            change_num: 0,
            peak: index + 1,
          };
        });
      }
    }

    // Alternative response format
    if (data.chart && data.chart.data) {
      return data.chart.data.map((item, index) => ({
        rank: index + 1,
        title: item.heading ? item.heading.title : (item.attributes ? item.attributes.name : ''),
        artist: item.heading ? item.heading.subtitle : (item.attributes ? item.attributes.artistName : ''),
        artist_slug: slugify(item.heading ? item.heading.subtitle : (item.attributes ? item.attributes.artistName : '')),
        image: item.images ? item.images.default : '',
        streams_formatted: `#${index + 1}`,
        change: 'new',
        change_num: 0,
        peak: index + 1,
      }));
    }

    return null;
  } catch (error) {
    console.error(`    Discovery API error: ${error.message}`);
    return null;
  }
}

/**
 * Strategy 2: Shazam Web Charts API
 */
async function fetchFromWebAPI(countryCode) {
  // Country-specific chart URL
  const countryParam = countryCode === 'US' ? 'world' : countryCode.toLowerCase();
  const url = `https://www.shazam.com/shazam/v3/en/${countryCode}/web/-/tracks/${countryParam}-chart-web?pageSize=100&startFrom=0`;

  try {
    const data = await httpsRequest(url);

    if (data.tracks && data.tracks.length > 0) {
      return data.tracks.map((track, index) => ({
        rank: index + 1,
        title: track.heading ? track.heading.title : (track.title || ''),
        artist: track.heading ? track.heading.subtitle : (track.subtitle || ''),
        artist_slug: slugify(track.heading ? track.heading.subtitle : (track.subtitle || '')),
        image: track.images ? (track.images.coverart || track.images.default || '') : '',
        image_medium: track.images ? (track.images.coverarthq || track.images.coverart || '') : '',
        shazam_key: track.key || '',
        shazam_url: track.url || '',
        streams_formatted: `#${index + 1}`,
        change: 'new',
        change_num: 0,
        peak: index + 1,
      }));
    }

    return null;
  } catch (error) {
    console.error(`    Web API error: ${error.message}`);
    return null;
  }
}

/**
 * Strategy 3: Shazam v1 Charts endpoint
 */
async function fetchFromV1API(countryCode) {
  const url = `https://www.shazam.com/services/charts/v2/en/${countryCode}/songs/top-200`;

  try {
    const data = await httpsRequest(url);

    if (data.chart && Array.isArray(data.chart)) {
      return data.chart.map((item, index) => ({
        rank: index + 1,
        title: item.title || '',
        artist: item.subtitle || item.artist || '',
        artist_slug: slugify(item.subtitle || item.artist || ''),
        image: item.images ? (item.images.coverart || '') : '',
        image_medium: item.images ? (item.images.coverarthq || '') : '',
        shazam_key: item.key || '',
        streams_formatted: `#${index + 1}`,
        change: 'new',
        change_num: 0,
        peak: index + 1,
      }));
    }

    // Another format
    if (Array.isArray(data)) {
      return data.map((item, index) => ({
        rank: index + 1,
        title: item.title || item.name || '',
        artist: item.subtitle || item.artistName || '',
        artist_slug: slugify(item.subtitle || item.artistName || ''),
        image: item.images ? item.images.coverart : '',
        streams_formatted: `#${index + 1}`,
        change: 'new',
        change_num: 0,
        peak: index + 1,
      }));
    }

    return null;
  } catch (error) {
    console.error(`    V1 API error: ${error.message}`);
    return null;
  }
}

async function fetchShazamChart(countryCode, regionCode) {
  console.log(`\n  Fetching Shazam chart for ${countryCode.toUpperCase()}...`);

  // Try Strategy 1: Discovery API
  let tracks = await fetchFromDiscoveryAPI(regionCode);
  if (tracks && tracks.length > 0) {
    console.log(`    Got ${tracks.length} tracks via Discovery API`);
    return tracks;
  }

  // Try Strategy 2: Web Charts
  tracks = await fetchFromWebAPI(regionCode);
  if (tracks && tracks.length > 0) {
    console.log(`    Got ${tracks.length} tracks via Web API`);
    return tracks;
  }

  // Try Strategy 3: V1 API
  tracks = await fetchFromV1API(regionCode);
  if (tracks && tracks.length > 0) {
    console.log(`    Got ${tracks.length} tracks via V1 API`);
    return tracks;
  }

  console.warn(`    No Shazam data obtained for ${countryCode}`);
  return null;
}

async function main() {
  console.log('=== Shazam Data Fetcher (Multi-Strategy) ===');
  console.log(`Date: ${new Date().toISOString()}`);
  console.log(`Node: ${process.version}`);

  fs.mkdirSync(DATA_DIR, { recursive: true });

  let successCount = 0;

  // Fetch global first
  const globalTracks = await fetchShazamChart('global', 'US');
  if (globalTracks) {
    const globalData = {
      country: 'global',
      platform: 'shazam',
      updated: new Date().toISOString().split('T')[0],
      total: globalTracks.length,
      tracks: globalTracks,
    };
    fs.writeFileSync(
      path.join(DATA_DIR, 'shazam_global.json'),
      JSON.stringify(globalData, null, 2)
    );
    console.log(`  Saved shazam_global.json (${globalTracks.length} tracks)`);
    successCount++;
  }

  // Fetch all countries
  for (const [code, regionCode] of Object.entries(COUNTRIES)) {
    if (code === 'global') continue;

    const tracks = await fetchShazamChart(code, regionCode);
    if (tracks) {
      const chartData = {
        country: code,
        platform: 'shazam',
        updated: new Date().toISOString().split('T')[0],
        total: tracks.length,
        tracks,
      };
      fs.writeFileSync(
        path.join(DATA_DIR, `shazam_${code}.json`),
        JSON.stringify(chartData, null, 2)
      );
      successCount++;
    } else if (globalTracks) {
      // Fallback: use global data for countries without specific data
      const fallbackData = {
        country: code,
        platform: 'shazam',
        updated: new Date().toISOString().split('T')[0],
        total: globalTracks.length,
        tracks: globalTracks,
      };
      fs.writeFileSync(
        path.join(DATA_DIR, `shazam_${code}.json`),
        JSON.stringify(fallbackData, null, 2)
      );
    }
    await new Promise(r => setTimeout(r, 300));
  }

  console.log(`\n=== Shazam fetch complete: ${successCount} charts saved ===`);

  if (successCount === 0) {
    console.error('WARNING: No Shazam data was fetched');
    // Don't exit with error - other platforms may still have data
  }
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
