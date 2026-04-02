#!/usr/bin/env node
/**
 * Fetch Apple Music Charts via RSS Feed
 * Apple provides free RSS feeds for top charts (no auth required)
 *
 * Endpoint:
 *   https://rss.applemarketingtools.com/api/v2/{country}/music/most-played/{limit}/songs.json
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

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'MusicMetrics/1.0'
      }
    };

    const req = https.request(options, (res) => {
      // Handle redirects
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchJSON(res.headers.location).then(resolve).catch(reject);
      }

      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode} from ${url}`));
      }

      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`Parse error from ${url}: ${e.message}`));
        }
      });
    });
    req.on('error', reject);
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
  console.log(`  Fetching Apple Music songs for ${country}...`);

  try {
    const data = await fetchJSON(url);

    if (!data.feed || !data.feed.results || data.feed.results.length === 0) {
      console.warn(`  Warning: No data for ${country}`);
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

    console.log(`  Got ${tracks.length} tracks for ${country}`);

    return {
      country,
      platform: 'apple_music',
      updated: new Date().toISOString().split('T')[0],
      title: data.feed.title || `Apple Music Top Songs - ${country.toUpperCase()}`,
      total: tracks.length,
      tracks
    };
  } catch (error) {
    console.error(`  Error fetching ${country}: ${error.message}`);
    return null;
  }
}

async function main() {
  console.log('=== Apple Music RSS Fetcher ===');
  console.log(`Date: ${new Date().toISOString()}`);

  fs.mkdirSync(DATA_DIR, { recursive: true });

  // Fetch US as global
  const usSongs = await fetchAppleMusicSongs('us');
  if (usSongs) {
    const globalData = { ...usSongs, country: 'global' };
    fs.writeFileSync(path.join(DATA_DIR, 'apple_global.json'), JSON.stringify(globalData, null, 2));
    fs.writeFileSync(path.join(DATA_DIR, 'apple_us.json'), JSON.stringify(usSongs, null, 2));
    console.log('  Saved apple_global.json & apple_us.json');
  }

  // Fetch all countries
  for (const country of COUNTRIES) {
    if (country === 'us') continue;
    const songs = await fetchAppleMusicSongs(country);
    if (songs) {
      fs.writeFileSync(path.join(DATA_DIR, `apple_${country}.json`), JSON.stringify(songs, null, 2));
    }
    await new Promise(r => setTimeout(r, 300));
  }

  console.log('\n=== Apple Music fetch complete ===');
}

main().catch(console.error);
