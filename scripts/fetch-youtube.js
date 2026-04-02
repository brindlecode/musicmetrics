#!/usr/bin/env node
/**
 * Fetch YouTube Music Video Data
 * Uses YouTube Data API v3 (free tier: 10,000 units/day)
 *
 * Required env vars:
 *   YOUTUBE_API_KEY
 *
 * Strategy:
 *   - Fetch trending music videos by country
 *   - Fetch video statistics for popular music videos
 *
 * Output: data/charts/youtube_*.json
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const DATA_DIR = path.join(__dirname, '..', 'data', 'charts');

const COUNTRIES = [
  'US', 'GB', 'BR', 'DE', 'FR', 'JP', 'MX', 'TR', 'ES', 'IT',
  'KR', 'IN', 'AR', 'CO', 'AU', 'CA', 'NL', 'SE', 'PL', 'ID',
  'PH', 'TH', 'NG', 'ZA', 'EG', 'SA', 'AE'
];

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`Parse error: ${e.message}`));
        }
      });
      res.on('error', reject);
    }).on('error', reject);
  });
}

function formatNumber(num) {
  num = parseInt(num) || 0;
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

async function fetchTrendingMusic(regionCode) {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    console.error('Missing YOUTUBE_API_KEY');
    process.exit(1);
  }

  const url = `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics,contentDetails&chart=mostPopular&videoCategoryId=10&regionCode=${regionCode}&maxResults=50&key=${apiKey}`;

  console.log(`  Fetching YouTube trending music for ${regionCode}...`);

  try {
    const data = await fetchJSON(url);

    if (!data.items || data.items.length === 0) {
      console.warn(`  No trending data for ${regionCode}`);
      return null;
    }

    const tracks = data.items.map((video, index) => {
      const views = parseInt(video.statistics.viewCount) || 0;
      const likes = parseInt(video.statistics.likeCount) || 0;

      return {
        rank: index + 1,
        title: video.snippet.title,
        artist: video.snippet.channelTitle,
        artist_slug: slugify(video.snippet.channelTitle),
        image: video.snippet.thumbnails.default ? video.snippet.thumbnails.default.url : '',
        image_medium: video.snippet.thumbnails.medium ? video.snippet.thumbnails.medium.url : '',
        video_id: video.id,
        views,
        likes,
        streams_formatted: formatNumber(views),
        published: video.snippet.publishedAt,
        duration: video.contentDetails.duration,
        change: 'new',
        change_num: 0,
        peak: index + 1
      };
    });

    return {
      country: regionCode.toLowerCase(),
      platform: 'youtube',
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
  console.log('=== YouTube Data Fetcher ===');
  console.log(`Date: ${new Date().toISOString()}`);

  fs.mkdirSync(DATA_DIR, { recursive: true });

  // Fetch US as "global"
  const global = await fetchTrendingMusic('US');
  if (global) {
    const globalData = { ...global, country: 'global' };
    fs.writeFileSync(
      path.join(DATA_DIR, 'youtube_global.json'),
      JSON.stringify(globalData, null, 2)
    );
    fs.writeFileSync(
      path.join(DATA_DIR, 'youtube_us.json'),
      JSON.stringify(global, null, 2)
    );
    console.log('  Saved youtube_global.json & youtube_us.json');
  }

  // Fetch all countries (budget: ~50 units per request × 27 countries = 1350 units)
  for (const code of COUNTRIES) {
    if (code === 'US') continue;

    const chart = await fetchTrendingMusic(code);
    if (chart) {
      fs.writeFileSync(
        path.join(DATA_DIR, `youtube_${code.toLowerCase()}.json`),
        JSON.stringify(chart, null, 2)
      );
    }
    // Respect rate limits
    await new Promise(r => setTimeout(r, 200));
  }

  console.log('\n=== YouTube fetch complete ===');
}

main().catch(console.error);
