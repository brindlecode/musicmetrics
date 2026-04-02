#!/usr/bin/env node
/**
 * Fetch Apple Music Charts via RSS Feed
 * Apple provides free RSS feeds for top charts (no auth required)
 *
 * Endpoint:
 *   https://rss.applemarketingtools.com/api/v2/{country}/music/most-played/{limit}/songs.json
 *   https://rss.applemarketingtools.com/api/v2/{country}/music/top/{limit}/albums.json
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
  'id', 'ph', 'th', 'ng', 'za', 'eg', 'sa', 'ae', 'at', 'be',
  'ch', 'dk', 'fi', 'ie', 'nz', 'ro', 'gr', 'il'
];

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        return fetchJSON(res.headers.location).then(resolve).catch(reject);
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
      res.on('error', reject);
    }).on('error', reject);
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

    if (!data.feed || !data.feed.results) {
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
      genre: song.genres ? song.genres[0].name : '',
      release_date: song.releaseDate,
      streams_formatted: `#${index + 1}`,
      change: 'new',
      change_num: 0,
      peak: index + 1
    }));

    return {
      country,
      platform: 'apple_music',
      updated: data.feed.updated || new Date().toISOString().split('T')[0],
      title: data.feed.title,
      total: tracks.length,
      tracks
    };
  } catch (error) {
    console.error(`  Error fetching ${country}: ${error.message}`);
    return null;
  }
}

async function fetchAppleMusicAlbums(country) {
  const url = `https://rss.applemarketingtools.com/api/v2/${country}/music/top/100/albums.json`;
  console.log(`  Fetching Apple Music albums for ${country}...`);

  try {
    const data = await fetchJSON(url);

    if (!data.feed || !data.feed.results) return null;

    const albums = data.feed.results.map((album, index) => ({
      rank: index + 1,
      title: album.name,
      artist: album.artistName,
      artist_slug: slugify(album.artistName),
      image: album.artworkUrl100,
      apple_id: album.id,
      apple_url: album.url,
      genre: album.genres ? album.genres[0].name : '',
      release_date: album.releaseDate
    }));

    return {
      country,
      platform: 'apple_music_albums',
      updated: data.feed.updated || new Date().toISOString().split('T')[0],
      total: albums.length,
      albums
    };
  } catch (error) {
    console.error(`  Error fetching albums ${country}: ${error.message}`);
    return null;
  }
}

async function main() {
  console.log('=== Apple Music RSS Fetcher ===');
  console.log(`Date: ${new Date().toISOString()}`);

  fs.mkdirSync(DATA_DIR, { recursive: true });

  // Fetch US as "global" reference
  const globalSongs = await fetchAppleMusicSongs('us');
  if (globalSongs) {
    // Save as both global and US
    const globalData = { ...globalSongs, country: 'global' };
    fs.writeFileSync(
      path.join(DATA_DIR, 'apple_global.json'),
      JSON.stringify(globalData, null, 2)
    );
    fs.writeFileSync(
      path.join(DATA_DIR, 'apple_us.json'),
      JSON.stringify(globalSongs, null, 2)
    );
    console.log(`  Saved apple_global.json & apple_us.json`);
  }

  // Fetch all countries (songs)
  for (const country of COUNTRIES) {
    if (country === 'us') continue;

    const songs = await fetchAppleMusicSongs(country);
    if (songs) {
      fs.writeFileSync(
        path.join(DATA_DIR, `apple_${country}.json`),
        JSON.stringify(songs, null, 2)
      );
    }
    await new Promise(r => setTimeout(r, 200));
  }

  // Fetch albums for major markets
  const majorMarkets = ['us', 'gb', 'de', 'fr', 'jp', 'br', 'mx', 'kr', 'es', 'it', 'tr'];
  for (const country of majorMarkets) {
    const albums = await fetchAppleMusicAlbums(country);
    if (albums) {
      fs.writeFileSync(
        path.join(DATA_DIR, `apple_albums_${country}.json`),
        JSON.stringify(albums, null, 2)
      );
    }
    await new Promise(r => setTimeout(r, 200));
  }

  console.log('\n=== Apple Music fetch complete ===');
}

main().catch(console.error);
