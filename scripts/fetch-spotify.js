#!/usr/bin/env node
/**
 * Fetch Spotify Data via Web API
 * Uses client credentials flow
 *
 * Required env vars: SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET
 * Note: Requires Spotify Premium on the developer account
 *
 * Output: data/charts/spotify_*.json
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const DATA_DIR = path.join(__dirname, '..', 'data', 'charts');

const PLAYLISTS = {
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

function request(url, opts = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.request({
      hostname: u.hostname,
      path: u.pathname + u.search,
      method: opts.method || 'GET',
      headers: opts.headers || {},
      timeout: 15000,
    }, (res) => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(body) });
        } catch (e) {
          reject(new Error(`Parse error: ${body.substring(0, 200)}`));
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
    if (opts.body) req.write(opts.body);
    req.end();
  });
}

function slugify(s) {
  return s.toLowerCase().replace(/[^\w\s-]/g, '').replace(/[\s_]+/g, '-').replace(/^-+|-+$/g, '');
}

async function main() {
  console.log('=== Spotify Fetcher ===');

  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    console.log('No SPOTIFY_CLIENT_ID/SECRET set. Skipping Spotify.');
    return;
  }

  fs.mkdirSync(DATA_DIR, { recursive: true });

  // Auth
  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const postData = 'grant_type=client_credentials';
  let token;
  try {
    const res = await request('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData),
      },
      body: postData,
    });
    if (res.status !== 200 || !res.data.access_token) {
      console.error(`Auth failed (${res.status}):`, JSON.stringify(res.data).substring(0, 200));
      console.error('NOTE: Spotify Web API requires Premium on the developer account.');
      return;
    }
    token = res.data.access_token;
    console.log('Auth OK');
  } catch (e) {
    console.error('Auth error:', e.message);
    return;
  }

  let count = 0;
  for (const [code, pid] of Object.entries(PLAYLISTS)) {
    console.log(`  Fetching ${code}...`);
    try {
      const res = await request(
        `https://api.spotify.com/v1/playlists/${pid}?fields=name,tracks.items(track(name,artists,album(name,images),popularity,id,external_urls))`,
        { headers: { 'Authorization': `Bearer ${token}` } }
      );
      if (res.status !== 200 || !res.data.tracks) {
        console.error(`  ${code}: HTTP ${res.status}`);
        continue;
      }
      const tracks = res.data.tracks.items
        .filter(i => i.track && i.track.name)
        .map((i, idx) => {
          const t = i.track;
          const imgs = t.album.images || [];
          return {
            rank: idx + 1,
            title: t.name,
            artist: t.artists.map(a => a.name).join(', '),
            artist_slug: slugify(t.artists[0].name),
            album: t.album.name,
            image: imgs.length > 0 ? imgs[imgs.length - 1].url : '',
            image_medium: imgs.length > 1 ? imgs[1].url : (imgs[0] ? imgs[0].url : ''),
            popularity: t.popularity,
            spotify_id: t.id,
            spotify_url: (t.external_urls || {}).spotify || '',
            streams_formatted: `Pop: ${t.popularity}`,
            change: 'new', change_num: 0, peak: idx + 1,
          };
        });

      fs.writeFileSync(
        path.join(DATA_DIR, `spotify_${code}.json`),
        JSON.stringify({ country: code, platform: 'spotify', updated: new Date().toISOString().split('T')[0], total: tracks.length, tracks }, null, 2)
      );
      console.log(`  ${code}: ${tracks.length} tracks`);
      count++;
      await new Promise(r => setTimeout(r, 300));
    } catch (e) {
      console.error(`  ${code}: ${e.message}`);
    }
  }
  console.log(`=== Spotify done: ${count}/${Object.keys(PLAYLISTS).length} ===`);
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
