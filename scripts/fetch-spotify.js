#!/usr/bin/env node
/**
 * Fetch Spotify Data
 * Uses Spotify Web API with client credentials flow (free)
 *
 * Required env vars:
 *   SPOTIFY_CLIENT_ID
 *   SPOTIFY_CLIENT_SECRET
 *
 * Note: Spotify API doesn't provide chart data directly.
 * We use playlist endpoints for official Spotify playlists (Top 50, Viral 50)
 * and artist/search endpoints for metadata.
 *
 * Output: data/charts/spotify_*.json, data/artists/spotify_*.json
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const DATA_DIR = path.join(__dirname, '..', 'data', 'charts');
const ARTISTS_DIR = path.join(__dirname, '..', 'data', 'artists');

// Official Spotify playlist IDs for Top 50 charts
const SPOTIFY_PLAYLISTS = {
  global: '37i9dQZEVXbMDoHDwVN2tF',      // Top 50 - Global
  us: '37i9dQZEVXbLRQDuF5jeBp',          // Top 50 - USA
  gb: '37i9dQZEVXbLnolsZ8PSNw',          // Top 50 - UK
  br: '37i9dQZEVXbMXbN3EUUhlg',          // Top 50 - Brazil
  de: '37i9dQZEVXbJiZcmkrIHGU',          // Top 50 - Germany
  fr: '37i9dQZEVXbIPWwFssbupI',          // Top 50 - France
  jp: '37i9dQZEVXbKXQ4mDTEBXq',          // Top 50 - Japan
  mx: '37i9dQZEVXbO3qyFxbkOE1',          // Top 50 - Mexico
  tr: '37i9dQZEVXbIVYVBNw9D5K',          // Top 50 - Turkey
  es: '37i9dQZEVXbNFJfN1Vw8d9',          // Top 50 - Spain
  it: '37i9dQZEVXbIQnj7RRhdSX',          // Top 50 - Italy
  kr: '37i9dQZEVXbNxXF4SkHj9F',          // Top 50 - South Korea
  in: '37i9dQZEVXbLZ52XmnySJg',          // Top 50 - India
  ar: '37i9dQZEVXbMMy2roB9myp',          // Top 50 - Argentina
  co: '37i9dQZEVXbOa2lmxNORXQ',          // Top 50 - Colombia
  au: '37i9dQZEVXbJPcfkRz0wJ0',          // Top 50 - Australia
  ca: '37i9dQZEVXbKj23U1GF4IR',          // Top 50 - Canada
};

// Viral 50 playlists
const VIRAL_PLAYLISTS = {
  global: '37i9dQZEVXbLiRSasKsNU9',      // Viral 50 - Global
};

let accessToken = null;

function httpsRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch (e) {
          reject(new Error(`Parse error: ${e.message}`));
        }
      });
      res.on('error', reject);
    });
    req.on('error', reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

async function getSpotifyToken() {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    console.error('Missing SPOTIFY_CLIENT_ID or SPOTIFY_CLIENT_SECRET');
    process.exit(1);
  }

  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const body = 'grant_type=client_credentials';

  const url = new URL('https://accounts.spotify.com/api/token');
  const response = await httpsRequest(url, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': Buffer.byteLength(body),
    },
    body
  });

  if (response.status !== 200) {
    throw new Error(`Auth failed: ${JSON.stringify(response.data)}`);
  }

  accessToken = response.data.access_token;
  console.log('Spotify access token obtained');
}

async function spotifyGet(endpoint) {
  const url = new URL(`https://api.spotify.com/v1${endpoint}`);
  const response = await httpsRequest(url, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
    }
  });

  if (response.status === 429) {
    const retryAfter = 2;
    console.log(`  Rate limited, waiting ${retryAfter}s...`);
    await new Promise(r => setTimeout(r, retryAfter * 1000));
    return spotifyGet(endpoint);
  }

  return response.data;
}

function formatNumber(num) {
  if (!num) return '0';
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

async function fetchPlaylistChart(countryCode, playlistId) {
  console.log(`  Fetching Spotify chart for ${countryCode} (${playlistId})...`);

  try {
    const data = await spotifyGet(`/playlists/${playlistId}?fields=name,description,tracks.items(track(name,artists,album(name,images),popularity,id,duration_ms,external_urls))`);

    if (!data.tracks || !data.tracks.items) {
      console.warn(`  No tracks for ${countryCode}`);
      return null;
    }

    const tracks = data.tracks.items
      .filter(item => item.track)
      .map((item, index) => {
        const track = item.track;
        const artist = track.artists.map(a => a.name).join(', ');
        const image = track.album.images.length > 0 ? track.album.images[track.album.images.length - 1].url : '';

        return {
          rank: index + 1,
          title: track.name,
          artist,
          artist_slug: slugify(track.artists[0].name),
          artist_id: track.artists[0].id || '',
          album: track.album.name,
          image,
          image_medium: track.album.images.length > 1 ? track.album.images[1].url : image,
          popularity: track.popularity,
          spotify_id: track.id,
          spotify_url: track.external_urls.spotify || '',
          streams_formatted: `Pop: ${track.popularity}`,
          change: 'new',
          change_num: 0,
          peak: index + 1
        };
      });

    return {
      country: countryCode,
      platform: 'spotify',
      playlist_name: data.name,
      updated: new Date().toISOString().split('T')[0],
      total: tracks.length,
      tracks
    };
  } catch (error) {
    console.error(`  Error: ${error.message}`);
    return null;
  }
}

async function main() {
  console.log('=== Spotify Data Fetcher ===');
  console.log(`Date: ${new Date().toISOString()}`);

  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(ARTISTS_DIR, { recursive: true });

  // Get access token
  await getSpotifyToken();

  // Fetch Top 50 playlists
  for (const [code, playlistId] of Object.entries(SPOTIFY_PLAYLISTS)) {
    const chart = await fetchPlaylistChart(code, playlistId);
    if (chart) {
      fs.writeFileSync(
        path.join(DATA_DIR, `spotify_${code}.json`),
        JSON.stringify(chart, null, 2)
      );
      console.log(`  Saved spotify_${code}.json (${chart.total} tracks)`);
    }
    await new Promise(r => setTimeout(r, 300));
  }

  // Fetch Viral 50
  for (const [code, playlistId] of Object.entries(VIRAL_PLAYLISTS)) {
    const chart = await fetchPlaylistChart(`viral_${code}`, playlistId);
    if (chart) {
      fs.writeFileSync(
        path.join(DATA_DIR, `spotify_viral_${code}.json`),
        JSON.stringify(chart, null, 2)
      );
    }
    await new Promise(r => setTimeout(r, 300));
  }

  console.log('\n=== Spotify fetch complete ===');
}

main().catch(console.error);
