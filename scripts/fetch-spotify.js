#!/usr/bin/env node
/**
 * Fetch Spotify Data via Web API
 * Uses client credentials flow (free)
 *
 * Required env vars: SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET
 *
 * Output: data/charts/spotify_*.json
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const querystring = require('querystring');

const DATA_DIR = path.join(__dirname, '..', 'data', 'charts');

// Official Spotify Top 50 playlist IDs
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

let accessToken = null;

function httpsRequest(options, postData) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch (e) {
          reject(new Error(`Parse error: ${e.message}\nBody: ${data.substring(0, 200)}`));
        }
      });
    });
    req.on('error', reject);
    if (postData) req.write(postData);
    req.end();
  });
}

async function getSpotifyToken() {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    console.error('Missing SPOTIFY_CLIENT_ID or SPOTIFY_CLIENT_SECRET');
    return false;
  }

  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const postData = 'grant_type=client_credentials';

  try {
    const response = await httpsRequest({
      hostname: 'accounts.spotify.com',
      path: '/api/token',
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData),
      }
    }, postData);

    if (response.status !== 200) {
      console.error(`Auth failed: ${JSON.stringify(response.data)}`);
      return false;
    }

    accessToken = response.data.access_token;
    console.log('Spotify access token obtained');
    return true;
  } catch (error) {
    console.error(`Auth error: ${error.message}`);
    return false;
  }
}

function spotifyGet(endpoint) {
  return new Promise((resolve, reject) => {
    const req = https.get({
      hostname: 'api.spotify.com',
      path: `/v1${endpoint}`,
      headers: { 'Authorization': `Bearer ${accessToken}` }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode === 429) {
            const retryAfter = parseInt(res.headers['retry-after'] || '2');
            console.log(`  Rate limited, waiting ${retryAfter}s...`);
            setTimeout(() => spotifyGet(endpoint).then(resolve).catch(reject), retryAfter * 1000);
            return;
          }
          resolve(parsed);
        } catch (e) {
          reject(new Error(`Parse error: ${e.message}`));
        }
      });
    });
    req.on('error', reject);
  });
}

function slugify(str) {
  return str.toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

async function fetchPlaylistChart(countryCode, playlistId) {
  console.log(`  Fetching Spotify chart for ${countryCode}...`);

  try {
    const data = await spotifyGet(`/playlists/${playlistId}?fields=name,tracks.items(track(name,artists,album(name,images),popularity,id,external_urls))`);

    if (!data.tracks || !data.tracks.items) {
      console.warn(`  No tracks for ${countryCode}: ${JSON.stringify(data).substring(0, 200)}`);
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
          change: 'new',
          change_num: 0,
          peak: index + 1
        };
      });

    console.log(`  Got ${tracks.length} tracks for ${countryCode}`);

    return {
      country: countryCode,
      platform: 'spotify',
      playlist_name: data.name || `Top 50 - ${countryCode.toUpperCase()}`,
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

  const authed = await getSpotifyToken();
  if (!authed) {
    console.error('Failed to authenticate with Spotify. Skipping.');
    return;
  }

  for (const [code, playlistId] of Object.entries(SPOTIFY_PLAYLISTS)) {
    const chart = await fetchPlaylistChart(code, playlistId);
    if (chart) {
      fs.writeFileSync(
        path.join(DATA_DIR, `spotify_${code}.json`),
        JSON.stringify(chart, null, 2)
      );
      console.log(`  Saved spotify_${code}.json`);
    }
    await new Promise(r => setTimeout(r, 500));
  }

  console.log('\n=== Spotify fetch complete ===');
}

main().catch(console.error);
