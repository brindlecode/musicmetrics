# MusicMetrics

> Real-time music charts, streaming stats & analytics from Spotify, YouTube, Apple Music, Deezer & Shazam.

## Architecture

- **Static Site Generator:** [Hugo](https://gohugo.io/) (extended)
- **Hosting:** [Netlify](https://netlify.com/) (free tier)
- **Data Collection:** GitHub Actions (cron every 6 hours)
- **Data Sources:** Deezer API, Apple Music RSS, Spotify API, YouTube Data API

## Features

- Multi-platform chart tracking (Spotify, YouTube, Apple Music, Deezer, Shazam)
- 40+ country charts
- Global artist rankings
- 7 languages (EN, TR, ES, PT, DE, FR, JA)
- Dark/light mode
- Mobile-first responsive design
- Schema.org structured data for SEO
- AdSense & Amazon Affiliate ready

## Development

```bash
# Install Hugo (https://gohugo.io/installation/)
hugo server -D

# Fetch data manually
node scripts/fetch-deezer.js
node scripts/fetch-apple-music.js
SPOTIFY_CLIENT_ID=xxx SPOTIFY_CLIENT_SECRET=xxx node scripts/fetch-spotify.js
YOUTUBE_API_KEY=xxx node scripts/fetch-youtube.js

# Generate artist pages from chart data
node scripts/generate-artist-pages.js

# Build for production
hugo --minify
```

## Required Secrets (GitHub)

| Secret | Description |
|--------|-------------|
| `SPOTIFY_CLIENT_ID` | Spotify Developer App Client ID |
| `SPOTIFY_CLIENT_SECRET` | Spotify Developer App Client Secret |
| `YOUTUBE_API_KEY` | YouTube Data API v3 Key |
| `NETLIFY_AUTH_TOKEN` | Netlify Personal Access Token |
| `NETLIFY_SITE_ID` | Netlify Site ID |

## Data Sources

| Platform | API | Auth Required |
|----------|-----|---------------|
| Deezer | Public API | No |
| Apple Music | RSS Feed | No |
| Spotify | Web API | Yes (free) |
| YouTube | Data API v3 | Yes (free) |

## License

MIT
