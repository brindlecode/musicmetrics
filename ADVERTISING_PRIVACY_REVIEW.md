# Advertising privacy and consent review

Date: 24 November 2026. This is an engineering review, not legal advice. Have the policy text and the consent design checked by a lawyer for the EU/UK/CH, Türkiye and US markets you target.

## What existed before this change

- Google Consent Mode defaults: everything **denied** in the EEA, UK and Switzerland, everything **granted** elsewhere (`tracking-head.html`).
- **No consent banner or CMP of any kind.** EEA/UK/CH visitors could never grant consent, so GA4 ran in cookieless Consent Mode there.
- `adsbygoogle.js` (AdSense) loaded on content pages for every visitor, although the site is not approved.
- The privacy policy said EEA/UK/CH visitors "are asked for consent through a Google-certified consent management platform". **That was not true** and has been removed.

## What exists now

### Consent banner and settings (`layouts/partials/consent/`, `assets/js/consent.js`)

- Shown to **every** visitor on first visit, in all 7 site languages (en, tr, es, pt, de, fr, ja).
- Buttons: **Accept all**, **Reject all** (same visual weight), **Manage preferences**.
- Preferences dialog: Necessary (always on, not optional), Analytics (Google Analytics via GTM), Advertising (Adsterra). Save / Reject all / Accept all.
- **Withdraw / change at any time:** "Cookie settings" link in the footer of every page. Withdrawing advertising consent reloads the page so every ad script is gone.
- Stored only in the visitor's browser: `localStorage["mm-consent"] = {v, ads, analytics, ts}`. Nothing is sent to our servers. `advertising.consent.version` re-asks everyone after material changes.
- Non-modal, does not block reading; sits above the mobile bottom navigation; no pre-ticked boxes.

### Default: deny

- **Advertising: opt-in everywhere** (`consent.mode = "global"`). The Adsterra endpoint sets cookies on the very first script request (see security audit), so no request is made before an explicit "Accept all" or "Advertising" switch. With no choice, Reject, or an old consent version, there is **no request to bauval.org at all** — verified by the automated tests.
- **Analytics:** Google Consent Mode regional defaults are unchanged (denied in EEA/UK/CH until consent, granted elsewhere — the previous behaviour; US and most other regimes are opt-out). New: the banner choice now updates Consent Mode (`gtag('consent','update', …)`) before GTM loads on later pages, so EEA visitors can now actually grant analytics, and anyone who rejects gets `analytics_storage` and all `ad_*` signals denied everywhere.
- Google Consent Mode does **not** control Adsterra; our own loader gate does.

### Regional mode (optional, not enabled)

`consent.mode = "regional"` makes advertising opt-in only for browsers whose time zone is in Europe (covers EEA, UK, Switzerland and Türkiye, and is deliberately broader) or unknown; elsewhere ads load unless the visitor rejects. Time zone is a heuristic, not geolocation. Not recommended without legal sign-off.

## Requirement check

| Requirement | Status |
|---|---|
| GDPR / ePrivacy (EEA), UK GDPR + PECR | Prior opt-in for ad cookies: yes. Granular choices, reject as easy as accept, withdrawal at any time: yes. Policy discloses provider, data, purposes, link to Adsterra policy: yes. **Not done:** no IAB TCF string — Adsterra did not document TCF support; ads are gated by not loading at all. A records-of-processing entry and a data processing agreement / joint-controller assessment with Adsterra are owner tasks. |
| Switzerland (revFADP) | Covered by the same opt-in. |
| Türkiye (KVKK) | Opt-in (explicit consent) for ad cookies and the related cross-border transfer; Turkish policy text states this. Owner task: check whether VERBİS registration / a separate KVKK "aydınlatma metni" is needed for your situation. |
| Brazil (LGPD) | Opt-in; mentioned in the Portuguese policy. |
| US state laws (CCPA/CPRA etc.) | We do not sell data for money; ad cookies may be "sharing". Opt-out = Reject / Advertising off (stricter: opt-in is required anyway in global mode). A Global Privacy Control (GPC) signal counts as "no advertising" when the visitor has made no choice (relevant in regional mode; in global mode ads are opt-in anyway). |
| Adsterra publisher terms | Their help centre asks publishers to disclose third-party vendor cookies in the privacy policy: done. |
| Google AdSense (future) | AdSense in the EEA/UK/CH requires a **Google-certified CMP with TCF v2.2**. Our banner is not one. Before `adsense.enabled = true`, replace or wrap the banner with a certified CMP (e.g. Google Privacy & messaging, or another certified CMP) and keep `MMConsent.set()` as the bridge so the Adsterra gate keeps working. |
| Children | Unchanged: general audience; adult ads off. |

## Files changed

- `content/{en,tr,es,pt,de,fr,ja}/privacy.md` — new "Cookies, local storage and your consent" (anchor `#cookies`) and "Advertising" sections, false CMP claim removed, date 24 November 2026. No separate cookie policy page existed; the cookie policy is the `#cookies` section of the privacy policy, linked from the banner and from the footer "Cookie settings".
- `i18n/*.toml` — banner strings.

## Open items

- **P1** — Legal review of the policy texts (no legal entity name or postal address was added because none was given; do not invent one. EU visitors are entitled to the controller's identity and contact; the policy currently points to the contact page).
- **P3** — Ask Adsterra for its DPA / data-processing terms and whether it supports IAB TCF; store the answer.
- **P4** — Before AdSense: Google-certified CMP.
