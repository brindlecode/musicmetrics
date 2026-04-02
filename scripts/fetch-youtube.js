#!/usr/bin/env node
/**
 * Fetch YouTube Music Video Data
 * Uses YouTube Data API v3 (free tier: 10,000 units/day)
 *
 * Required env vars:
 *   YOUTUBE_API_KEY
 *
 * Improvements:
 *   - Better artist name extraction (from video title, not just channel name)
 *   - Handles VEVO channels properly
 *   - Fetches 50 results per country
 *   - Better error handling with retries
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
  'PH', 'TH', 'NG', 'ZA', 'EG', 'SA', 'AE',
  'AT', 'CH', 'DK', 'FI', 'GR', 'IE', 'IL', 'NO', 'NZ', 'RO',
  'CL', 'HU', 'CZ', 'BG', 'HR', 'SK', 'RS', 'UA', 'PE', 'EC',
  'SG', 'MY', 'TW', 'HK', 'VN'
];

function fetchJSON(url, retries = 3) {
  return new Promise((resolve, reject) => {
    console.log(`    GET ${url.replace(/key=[^&]+/, 'key=***')}`);
    https.get(url, { timeout: 20000 }, (res) => {
      console.log(`    Status: ${res.statusCode}`);

      if (res.statusCode !== 200) {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          console.error(`    HTTP ${res.statusCode}: ${body.substring(0, 300)}`);
          if (retries > 0) {
            console.log(`    Retrying in 2s... (${retries} left)`);
            setTimeout(() => fetchJSON(url, retries - 1).then(resolve).catch(reject), 2000);
          } else {
            reject(new Error(`HTTP ${res.statusCode}`));
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
          if (retries > 0) {
            setTimeout(() => fetchJSON(url, retries - 1).then(resolve).catch(reject), 2000);
          } else {
            reject(new Error(`Parse error: ${e.message}`));
          }
        }
      });
      res.on('error', (err) => {
        if (retries > 0) {
          setTimeout(() => fetchJSON(url, retries - 1).then(resolve).catch(reject), 2000);
        } else {
          reject(err);
        }
      });
    }).on('error', (err) => {
      console.error(`    Request error: ${err.message}`);
      if (retries > 0) {
        console.log(`    Retrying in 2s... (${retries} left)`);
        setTimeout(() => fetchJSON(url, retries - 1).then(resolve).catch(reject), 2000);
      } else {
        reject(err);
      }
    }).on('timeout', function() {
      this.destroy();
      if (retries > 0) {
        console.log(`    Timeout, retrying... (${retries} left)`);
        setTimeout(() => fetchJSON(url, retries - 1).then(resolve).catch(reject), 2000);
      } else {
        reject(new Error('Timeout'));
      }
    });
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

/**
 * Extract the real artist name from YouTube video title and channel name.
 *
 * YouTube music videos typically follow patterns like:
 *   "Artist - Song Title (Official Video)"
 *   "Artist Name ft. Other - Song (Official Music Video)"
 *   "HYBE LABELS" channel with "BTS (방탄소년단) 'Song' Official MV"
 *
 * We try to extract the real artist from the title first,
 * falling back to cleaning up the channel name.
 */
function extractArtist(title, channelTitle) {
  // Common label/network channel names that should NOT be used as artist
  const labelChannels = [
    'hybe labels', 'hybe', 'big hit', 'bighit',
    'yg entertainment', 'sm entertainment', 'jyp entertainment',
    'starship entertainment', 'pledis entertainment',
    'universal music', 'sony music', 'warner music', 'warner records',
    'republic records', 'interscope records', 'atlantic records',
    'columbia records', 'def jam', 'capitol records', 'rca records',
    'epic records', 'island records', 'geffen records',
    'world music', 'ultra music', 'spinnin records',
    'tseries', 't-series', 'zee music', 'speed records', 'tips official',
    'yrf', 'saregama', 'eros now', 'sony music india', 'aditya music',
    'mango music', 'lahari music', 'sun tv', 'sun music',
    'colors tv', 'set india',
    'on the radar radio', 'genius',
    'worldstarhiphop', 'lyrical lemonade',
  ];

  const channelLower = channelTitle.toLowerCase().trim();
  const isLabelChannel = labelChannels.some(label => channelLower.includes(label));

  // Clean VEVO suffix from channel names
  let cleanChannel = channelTitle
    .replace(/VEVO$/i, '')
    .replace(/Official$/i, '')
    .replace(/ - Topic$/i, '')
    .trim();

  // If it's not a label channel, the channel name is likely the artist (or VEVO channel)
  if (!isLabelChannel && cleanChannel.length > 0) {
    return cleanChannel;
  }

  // Try to extract artist from video title
  // Pattern 1: "Artist - Song Title"
  const dashMatch = title.match(/^([^-–—]+?)[\s]*[-–—][\s]*/);
  if (dashMatch) {
    let artist = dashMatch[1].trim();
    // Remove common prefixes/suffixes
    artist = artist.replace(/\s*\(.*?\)\s*$/, '').trim();
    if (artist.length > 0 && artist.length < 60) {
      return artist;
    }
  }

  // Pattern 2: "Artist Name 'Song Title' Official MV"
  const quoteMatch = title.match(/^(.+?)[\s]+[''"「『【].*?[''"」』】]/);
  if (quoteMatch) {
    let artist = quoteMatch[1].trim();
    artist = artist.replace(/\s*\(.*?\)\s*$/, '').trim();
    if (artist.length > 0 && artist.length < 60) {
      return artist;
    }
  }

  // Pattern 3: For Korean/Japanese content: "GROUP (한글) 'Song' Official MV"
  const kpopMatch = title.match(/^([A-Za-z0-9\s]+?)[\s]*[\(（]/);
  if (kpopMatch) {
    let artist = kpopMatch[1].trim();
    if (artist.length > 1 && artist.length < 40) {
      return artist;
    }
  }

  // Pattern 4: "Song Title by Artist" or "Song Title | Artist"
  const byMatch = title.match(/(?:by|ft\.?|feat\.?|featuring)\s+(.+?)(?:\s*[\(\[]|$)/i);
  if (byMatch) {
    return byMatch[1].trim();
  }

  // Fallback: use cleaned channel name even if it's a label
  return cleanChannel || channelTitle;
}

/**
 * Extract a cleaner song title from the video title
 */
function extractSongTitle(title) {
  return title
    // Remove common suffixes
    .replace(/\s*[\(\[]?\s*(Official\s*)?(Music\s*)?(Video|MV|M\/V|Lyric|Audio|Visualizer|Live|Performance|Clip\s*Officiel)\s*[\)\]]?\s*/gi, '')
    .replace(/\s*[\(\[]?\s*(Official)\s*[\)\]]?\s*/gi, '')
    .replace(/\s*\|\s*Official.*$/i, '')
    .replace(/\s*#\w+/g, '')
    // Remove trailing parenthetical info
    .replace(/\s*[\(\[]\s*[\)\]]\s*$/, '')
    .trim();
}

async function fetchTrendingMusic(regionCode) {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    console.error('Missing YOUTUBE_API_KEY');
    process.exit(1);
  }

  const url = `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics,contentDetails&chart=mostPopular&videoCategoryId=10&regionCode=${regionCode}&maxResults=50&key=${apiKey}`;

  console.log(`\n  Fetching YouTube trending music for ${regionCode}...`);

  try {
    const data = await fetchJSON(url);

    if (data.error) {
      console.error(`  YouTube API error: ${JSON.stringify(data.error.errors ? data.error.errors[0] : data.error)}`);
      return null;
    }

    if (!data.items || data.items.length === 0) {
      console.warn(`  No trending data for ${regionCode}`);
      return null;
    }

    const tracks = data.items.map((video, index) => {
      const views = parseInt(video.statistics.viewCount) || 0;
      const likes = parseInt(video.statistics.likeCount) || 0;
      const channelTitle = video.snippet.channelTitle || '';

      // Extract real artist name
      const artist = extractArtist(video.snippet.title, channelTitle);
      const songTitle = extractSongTitle(video.snippet.title);

      return {
        rank: index + 1,
        title: songTitle || video.snippet.title,
        original_title: video.snippet.title,
        artist,
        artist_slug: slugify(artist),
        channel: channelTitle,
        image: video.snippet.thumbnails.default ? video.snippet.thumbnails.default.url : '',
        image_medium: video.snippet.thumbnails.medium ? video.snippet.thumbnails.medium.url : '',
        image_high: video.snippet.thumbnails.high ? video.snippet.thumbnails.high.url : '',
        video_id: video.id,
        youtube_url: `https://www.youtube.com/watch?v=${video.id}`,
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

    console.log(`  Got ${tracks.length} tracks for ${regionCode}`);

    return {
      country: regionCode.toLowerCase(),
      platform: 'youtube',
      updated: new Date().toISOString().split('T')[0],
      total: tracks.length,
      tracks
    };
  } catch (error) {
    console.error(`  Error for ${regionCode}: ${error.message}`);
    return null;
  }
}

async function main() {
  console.log('=== YouTube Data Fetcher (Enhanced) ===');
  console.log(`Date: ${new Date().toISOString()}`);
  console.log(`Node: ${process.version}`);

  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    console.error('ERROR: YOUTUBE_API_KEY not set');
    process.exit(1);
  }
  console.log(`API Key: ${apiKey.substring(0, 6)}...${apiKey.substring(apiKey.length - 4)}`);

  fs.mkdirSync(DATA_DIR, { recursive: true });

  let successCount = 0;

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
    successCount += 2;
  }

  // Fetch all countries (budget: ~50 units per request x 27 countries = 1350 units)
  for (const code of COUNTRIES) {
    if (code === 'US') continue;

    const chart = await fetchTrendingMusic(code);
    if (chart) {
      fs.writeFileSync(
        path.join(DATA_DIR, `youtube_${code.toLowerCase()}.json`),
        JSON.stringify(chart, null, 2)
      );
      successCount++;
    }
    // Respect rate limits
    await new Promise(r => setTimeout(r, 200));
  }

  console.log(`\n=== YouTube fetch complete: ${successCount} charts saved ===`);

  if (successCount === 0) {
    console.error('WARNING: No YouTube data was fetched successfully');
    process.exit(1);
  }
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
