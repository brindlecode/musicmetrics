#!/usr/bin/env node
/**
 * Generate Artist Content Pages
 * Reads chart data from all platforms and creates Hugo content files for each artist
 *
 * Output: content/{lang}/artists/{slug}.md for each language
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data', 'charts');
const ARTISTS_DIR = path.join(__dirname, '..', 'data', 'artists');
const CONTENT_DIR = path.join(__dirname, '..', 'content');

const LANGUAGES = ['en', 'tr', 'es', 'pt', 'de', 'fr', 'ja'];

function slugify(str) {
  return str.toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function collectArtists() {
  const artists = new Map();

  // Read all chart JSON files
  if (!fs.existsSync(DATA_DIR)) {
    console.log('No chart data found. Run fetch scripts first.');
    return artists;
  }

  const files = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.json'));

  for (const file of files) {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), 'utf-8'));
      const platform = file.split('_')[0]; // spotify, apple, deezer, youtube
      const tracks = data.tracks || [];

      for (const track of tracks) {
        const name = track.artist;
        const slug = track.artist_slug || slugify(name);

        if (!artists.has(slug)) {
          artists.set(slug, {
            name,
            slug,
            platforms: {},
            songs: [],
            image: track.image_medium || track.image || ''
          });
        }

        const artist = artists.get(slug);

        // Track platform presence
        if (!artist.platforms[platform]) {
          artist.platforms[platform] = { best_rank: track.rank, countries: [] };
        }
        if (track.rank < artist.platforms[platform].best_rank) {
          artist.platforms[platform].best_rank = track.rank;
        }

        const country = data.country || 'global';
        if (!artist.platforms[platform].countries.includes(country)) {
          artist.platforms[platform].countries.push(country);
        }

        // Collect unique songs
        if (!artist.songs.find(s => s.title === track.title)) {
          artist.songs.push({
            title: track.title,
            platform,
            rank: track.rank,
            country
          });
        }
      }
    } catch (e) {
      // Skip invalid files
    }
  }

  return artists;
}

function generateArtistContent(artist) {
  const platforms = Object.keys(artist.platforms);
  const platformStr = platforms.join(', ');

  return `---
title: "${artist.name.replace(/"/g, '\\"')}"
slug: "${artist.slug}"
type: "artists"
image: "${artist.image}"
platforms: [${platforms.map(p => `"${p}"`).join(', ')}]
spotify_streams: "${artist.platforms.spotify ? 'Charting' : '--'}"
youtube_views: "${artist.platforms.youtube ? 'Charting' : '--'}"
apple_rank: "${artist.platforms.apple ? '#' + artist.platforms.apple.best_rank : '--'}"
monthly_listeners: "--"
description: "${artist.name} streaming statistics, chart positions and analytics across ${platformStr}"
---
`;
}

function main() {
  console.log('=== Artist Page Generator ===');

  const artists = collectArtists();
  console.log(`Found ${artists.size} unique artists`);

  // Generate global ranking
  const ranking = Array.from(artists.values())
    .map(a => ({
      rank: 0,
      name: a.name,
      slug: a.slug,
      spotify_streams: a.platforms.spotify ? `#${a.platforms.spotify.best_rank}` : '--',
      youtube_views: a.platforms.youtube ? `#${a.platforms.youtube.best_rank}` : '--',
      monthly_listeners: '--',
      change: 0
    }))
    .slice(0, 500);

  // Sort by number of platform appearances
  ranking.sort((a, b) => {
    const aPlats = artists.get(a.slug) ? Object.keys(artists.get(a.slug).platforms).length : 0;
    const bPlats = artists.get(b.slug) ? Object.keys(artists.get(b.slug).platforms).length : 0;
    return bPlats - aPlats;
  });
  ranking.forEach((a, i) => a.rank = i + 1);

  // Save global ranking
  fs.mkdirSync(ARTISTS_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(ARTISTS_DIR, 'global_ranking.json'),
    JSON.stringify({ updated: new Date().toISOString().split('T')[0], artists: ranking }, null, 2)
  );
  console.log(`Saved global_ranking.json (${ranking.length} artists)`);

  // Generate content pages for each language
  for (const lang of LANGUAGES) {
    const langDir = path.join(CONTENT_DIR, lang, 'artists');
    fs.mkdirSync(langDir, { recursive: true });

    let count = 0;
    for (const artist of artists.values()) {
      const filePath = path.join(langDir, `${artist.slug}.md`);
      // Always update artist pages with fresh chart data
      fs.writeFileSync(filePath, generateArtistContent(artist));
      count++;
    }
    console.log(`Generated ${count} new artist pages for ${lang}`);
  }

  console.log('\n=== Artist generation complete ===');
}

main();
