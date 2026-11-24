# Advertising security audit — Adsterra (bauval.org)

Date: 24 November 2026. Scope: the five ad units supplied from the Adsterra publisher dashboard for website 6226100.

## Summary

| Check | Result |
|---|---|
| Script origin | All five snippets load from `https://bauval.org/21/<key>` (native) and `https://bauval.org/22/<key>` (banners). Only HTTPS. |
| Relationship of bauval.org to Adsterra | **Not independently verified.** No public Adsterra page or third-party source found that names bauval.org. The only evidence is that the snippets came from the owner's Adsterra dashboard. Adsterra (like most such networks) rotates ad-serving domains to avoid ad blockers, so this is plausible but unconfirmed. → **Open item S1.** |
| TLS | Endpoint answers over HTTPS/HTTP-2 behind Cloudflare (`server: cloudflare`). The build machine sits behind a TLS-inspecting proxy, so the real certificate chain could **not** be inspected here. → check in a normal browser (padlock → certificate) during the owner check. |
| Script content | **Could not be reviewed.** Requests from the build machine (a datacenter IP) got `HTTP 200` with an **empty body** (`content-length: 0`) for both the banner and the native URL, with and without a browser user agent and referrer. The network evidently filters datacenter traffic. → **Open item S2.** |
| Cookies set by the script endpoint | Even the empty response set `co_<key>_223=1` (7 days, `SameSite=None; Secure`) and Cloudflare's `__cf_bm` (30 min, `HttpOnly; Partitioned`) on `bauval.org`. That means **the endpoint sets third-party cookies on the first request**, before any ad is shown. Our loader therefore never requests it without consent. |
| Client hints | The endpoint asks for many User-Agent client hints (`accept-ch`), i.e. fine-grained device data. Disclosed in the privacy policy as "browser and device information". |
| Redirect chain | None observed on the script URL (direct 200). Redirects inside ad creatives cannot be tested without real ads. |
| Content Security Policy | musicmetrics.net sends **no CSP** today (`static/_headers`), so nothing had to be weakened. No CSP was added in this change (an enforcing CSP would also have to cover GTM and Google Analytics and the ad network's rotating creative domains; recommended as a report-only follow-up). No `unsafe-eval`, no wildcard was introduced. |
| Other headers | `X-Frame-Options: SAMEORIGIN`, HSTS, `nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` (camera, mic, geolocation off) — unchanged. With this referrer policy, cross-origin requests (including the ad network) receive only the origin `https://musicmetrics.net/`, not the full page URL; the vendor script can still read `location` itself. |
| Credentials in client code | None. The ad keys are public placement keys meant for the page. No Adsterra login, API token, payout or personal data is in the repository or the HTML. |

## What our code does to contain the vendor script

- **Nothing loads without consent**, on an allowed host, on an eligible page, in a slot that fits (see `assets/js/advertising.js`).
- **No eval, no `innerHTML`, no `document.write`, no HTML injection.** The loader creates `<script src>` elements whose URLs come only from `hugo.toml` (build-time config), never from the page URL or user input.
- **No custom iframe wrappers** (Adsterra's rules exclude "traffic generated within iframes") and no change to the vendor parameters: `atOptions` gets exactly the dashboard values.
- **At most two units, one native**, no repeated initialisation (`data-started` guard; one `#container-<key>`).
- No popunder, social bar, smartlink, push, interstitial or anti-adblock code exists in the repository (all OFF in the dashboard as well).
- When consent is withdrawn the page reloads, which removes every vendor script from the page.

## Residual risks (cannot be fixed on our side)

1. **The vendor script runs with full access to our page.** It is a third-party first-party-context script: it could read the DOM, add elements, or navigate the page. This is inherent to every script-tag ad network. Mitigation: consent gate, few units, the monitoring checks below, and immediate shutdown (ADVERTISING_ROLLBACK.md).
2. **Creative quality.** Website JavaScript/CSS cannot reliably block gambling, crypto, dating, "download"/extension or misleading ads. Only Adsterra can. Actions for the owner, in the dashboard and by ticket:
   - confirm Adult = OFF on every unit (stated as OFF);
   - ask support which advertiser categories can be blocked for website 6226100 and request blocks for: adult/dating, gambling/casino/betting, crypto and "get rich quick"/high-risk finance, software downloads and browser extensions, VPN/cleaner/"your device is infected" utilities;
   - ask support whether banners can be limited to non-redirecting display creatives.
   Do not claim these blocks are active until Adsterra confirms them in writing.
3. **Domain rotation.** If Adsterra changes the serving domain, the dashboard snippets change; update `src` in `hugo.toml` only from the dashboard.

## Open items before enabling Adsterra for everyone

- **S1** — Ask Adsterra support (ticket) to confirm that `bauval.org` is an official Adsterra ad-serving domain for website 6226100. Keep the reply.
- **S2** — Owner check in a normal residential browser profile **without** any logged-in Google/Adsterra/bank sessions (use a fresh guest profile), see ADSTERRA_INTEGRATION.md §6: certificate, network requests, no new tabs, no navigation, no console errors, creatives acceptable.
- **S3** — Category blocking confirmation (residual risk 2).

Until S1 and S2 pass, `advertising.adsterra.enabled` stays `false` (owner preview only).

## Ongoing checks (weekly for the first month, then monthly)

- Open 3–4 ad pages in a clean profile on desktop and on a phone (do not click ads). Watch for: new tabs, redirects, "allow notifications" prompts, auto-playing sound, fake play/download buttons, adult or gambling creatives.
- Google Search Console → Security issues and Manual actions: must stay empty.
- Google Safe Browsing site status for musicmetrics.net.
- Any visitor complaint → disable the unit first, investigate after.
