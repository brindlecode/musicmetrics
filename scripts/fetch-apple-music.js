#!/usr/bin/env node
/**
 * Fetch Apple Music Charts via RSS Feed
 * Apple provides free RSS feeds for top charts (no auth required)
 *
 * Endpoint:
 *   https://rss.applemarketingtools.com/api/v2/{country}/music/most-played/100/songs.json
 *
 * Output: data/charts/apple_*.json
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const DATA_DIR = path.join(__dirname, '..', 'data', 'charts');

const COUNTRIES = [
  'us', 'gb', 'br', 'de', 'fr', 'jp', 'mx', 'tr', 'es', 'it',
  'kr', 'in', 'ar', 'co', 'au', 'ca', 'nl', 'se', 'pl', 'pt',
  'id', 'ph', 'th', 'ng', 'za', 'eg', 'sa', 'ae'
];

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
        'User-Agent': 'Mozilla/5.0 (compatible; MusicMetrics/1.0)'
      },
      timeout: 15000
    };

    const req = https.request(options, (res) => {
      console.log(`    Status: ${res.statusCode}`);

      // Handle redirects (Apple often redirects)
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        console.log(`    Redirect -> ${res.headers.location}`);
        return fetchURL(res.headers.location, retries).then(resolve).catch(reject);
      }

      if (res.statusCode !== 200) {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          console.error(`    HTTP ${res.statusCode}: ${body.substring(0, 200)}`);
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
          resolve(JSON.parse(data));
        } catch (e) {
          console.error(`    Parse error: ${e.message}`);
          console.error(`    Body preview: ${data.substring(0, 200)}`);
          reject(new Error(`Parse error from ${url}`));
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

function slugify(str) {
  return str.toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

async function fetchAppleMusicSongs(country) {
  const url = `https://rss.applemarketingtools.com/api/v2/${country}/music/most-played/100/songs.json`;
  console.log(`\n  Fetching Apple Music songs for ${country.toUpperCase()}...`);

  try {
    const data = await fetchURL(url);

    if (!data.feed || !data.feed.results || data.feed.results.length === 0) {
      console.warn(`    Warning: No results in feed for ${country}`);
      console.log(`    Feed keys: ${data.feed ? Object.keys(data.feed).join(', ') : 'no feed'}`);
      return null;
    }

    const tracks = data.feed.results.map((song, index) => ({
      rank: index + 1,
      title: song.name,
      artist: song.artistName,
      artist_slug: slugify(song.artistName),
      album: song.name,
      image: song.artworkUrl100,
      apple_id: song.id,
      apple_url: song.url,
      genre: (song.genres && song.genres.length > 0) ? song.genres[0].name : '',
      release_date: song.releaseDate || '',
      streams_formatted: `#${index + 1}`,
      change: 'new',
      change_num: 0,
      peak: index + 1
    }));

    console.log(`    Got ${tracks.length} tracks for ${country}`);

    return {
      country,
      platform: 'apple_music',
      updated: new Date().toISOString().split('T')[0],
      title: data.feed.title || `Apple Music Top Songs - ${country.toUpperCase()}`,
      total: tracks.length,
      tracks
    };
  } catch (error) {
    console.error(`    Error fetching ${country}: ${error.message}`);
    return null;
  }
}

async function main() {
  console.log('=== Apple Music RSS Fetcher ===');
  console.log(`Date: ${new Date().toISOString()}`);

  fs.mkdirSync(DATA_DIR, { recursive: true });

  let successCount = 0;

  // Fetch US as global
  const usSongs = await fetchAppleMusicSongs('us');
  if (usSongs) {
    const globalData = { ...usSongs, country: 'global' };
    fs.writeFileSync(path.join(DATA_DIR, 'apple_global.json'), JSON.stringify(globalData, null, 2));
    fs.writeFileSync(path.join(DATA_DIR, 'apple_us.json'), JSON.stringify(usSongs, null, 2));
    console.log('  Saved apple_global.json & apple_us.json');
    successCount += 2;
  }

  // Fetch all countries
  for (const country of COUNTRIES) {
    if (country === 'us') continue;
    const songs = await fetchAppleMusicSongs(country);
    if (songs) {
      fs.writeFileSync(path.join(DATA_DIR, `apple_${country}.json`), JSON.stringify(songs, null, 2));
      successCount++;
    }
    // Small delay between requests
    await new Promise(r => setTimeout(r, 500));
  }

  console.log(`\n=== Apple Music fetch complete: ${successCount} files saved ===`);
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
