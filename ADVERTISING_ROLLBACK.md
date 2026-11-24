# Advertising emergency shutdown and rollback

## Fastest: stop serving at the source (minutes, no deploy)

1. Adsterra dashboard → **Websites → musicmetrics.net (6226100)** → pause/disable the affected ad unit(s), or the whole website.
2. If an ad is malicious, redirects or opens tabs: also report it to Adsterra support with the page URL, time (UTC), country and a screenshot. Adsterra says it checks creatives for malware; ask them to block the advertiser.

Our loader still asks for the script, but a paused unit serves nothing. Nothing on our side breaks: the reserved slot simply stays empty.

## Turn ads off in the site (next deploy)

In `hugo.toml`:

- one unit: `[params.advertising.adsterra.units.<name>] enabled = false`
- all Adsterra: `[params.advertising.adsterra] enabled = false` and `ownerPreview = false`
- **everything** (all providers, all slots, all ad scripts): `[params.advertising] enabled = false`

Commit to the default branch, then run **Actions → "Update charts & deploy" → Run workflow** (deploy = true). Upload of the ~200,000 changed files takes 45–90 minutes. The site keeps working without ads (verified: slots render nothing when disabled; see ADVERTISING_TEST_REPORT.md).

## Instant site rollback (seconds)

Netlify → site `musicmetrics-net` → **Deploys** → pick the last deploy from before ads were enabled → **Publish deploy**. Chart data will be that deploy's, until the next scheduled run. Note `.github/workflows/site-watch.yml` re-publishes the latest "Charts update" deploy every 3 hours if anything else is live; after a manual rollback, disable that workflow temporarily (Actions → Site watch → Disable) and re-enable it after the fixed deploy is live.

## Code rollback

The last commit before this work is `9468851` (Merge pull request #46). To remove the integration completely:

```bash
git revert <merge-commit-of-this-change>
```

That restores the previous behaviour, including AdSense's `adsbygoogle.js` loading on content pages and the old privacy policy text. Prefer the config switches above.

## Things that are not undone by a rollback

- Cookies Adsterra or its advertisers already set in visitors' browsers stay until they expire.
- Consent choices are stored in each visitor's browser (`mm-consent`); bump `advertising.consent.version` to ask everyone again.
