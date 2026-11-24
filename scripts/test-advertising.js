#!/usr/bin/env node
/* Advertising + consent browser tests (Playwright, MOCKED ad network).
 *
 *   node scripts/test-advertising.js [publicDir]      (default ./public)
 *
 * Serves the built site as https://musicmetrics.net/ from disk through
 * Playwright request routing, replaces every bauval.org script with a local
 * mock that imitates the vendor snippet (reads window.atOptions, adds an
 * iframe; the native mock fills #container-<key>), and blocks every other
 * third-party request. No real ad request, impression or click is ever made.
 * "Live" mode (adsterra.enabled = true) is simulated by flipping the two
 * build-time flags in the HTML response; preview mode uses ?mm-ads-preview=on.
 * Exit code 1 on any failed check.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const PUB = path.resolve(process.argv[2] || 'public');
const ORIGIN = 'https://musicmetrics.net';
const WIDTHS = [320, 360, 375, 390, 768, 1024, 1440, 1920];
const results = [];
let failed = 0;
const preexisting = [];
function check(name, ok, info) {
  results.push({ name, ok: !!ok, info: info || '' });
  if (!ok) { failed++; console.log('FAIL', name, info || ''); }
}

const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'application/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.txt': 'text/plain', '.xml': 'application/xml', '.webmanifest': 'application/manifest+json' };
function fileFor(urlPath) {
  let p = decodeURIComponent(urlPath.split('?')[0]);
  if (p.endsWith('/')) p += 'index.html';
  let f = path.join(PUB, p);
  if (!f.startsWith(PUB)) return null;
  if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
  return fs.existsSync(f) ? f : null;
}

// Vendor mocks. Banner: consume atOptions like the real snippet, insert an iframe after the script.
const BANNER_MOCK = `(function(){var o=window.atOptions,s=document.currentScript;window.__mmMock=(window.__mmMock||0)+1;
setTimeout(function(){var f=document.createElement('iframe');f.width=o.width;f.height=o.height;f.setAttribute('data-mock-key',o.key);f.style.cssText='width:'+o.width+'px;height:'+o.height+'px;border:0;background:#ccc';s.parentNode.insertBefore(f,s.nextSibling);},120);})();`;
const NATIVE_MOCK = (key) => `(function(){var c=document.getElementById('container-${key}');if(!c)return;var d=document.createElement('div');d.style.height='220px';d.textContent='native mock';c.appendChild(d);})();`;

async function newPage(browser, opts) {
  const ctx = await browser.newContext({ viewport: { width: opts.width, height: 900 }, deviceScaleFactor: 1 });
  const log = { vendor: [], third: [], errors: [] };
  if (opts.consent) {
    await ctx.addInitScript((c) => { try { localStorage.setItem('mm-consent', JSON.stringify(c)); } catch (e) {} }, opts.consent);
  }
  if (opts.preview) await ctx.addInitScript(() => { try { localStorage.setItem('mm-ads-preview', 'on'); } catch (e) {} });
  if (opts.tz) { /* timezone handled via context option below */ }
  await ctx.route('**/*', async (route) => {
    const u = new URL(route.request().url());
    if (u.origin === ORIGIN) {
      const f = fileFor(u.pathname);
      if (!f) return route.fulfill({ status: 404, body: fs.readFileSync(path.join(PUB, '404.html')), contentType: MIME['.html'] });
      let body = fs.readFileSync(f);
      const ext = path.extname(f);
      if (ext === '.html' && opts.live) {
        body = body.toString().replace('"live":false', '"live":true');
      }
      return route.fulfill({ status: 200, body, contentType: MIME[ext] || 'application/octet-stream' });
    }
    if (u.hostname === 'bauval.org') {
      log.vendor.push(u.pathname);
      const m = u.pathname.match(/^\/(21|22)\/([0-9a-f]{32})$/);
      if (!m) return route.abort();
      if (opts.delay && opts.delay[m[2]]) await new Promise((r) => setTimeout(r, opts.delay[m[2]]));
      return route.fulfill({ status: 200, contentType: 'application/javascript', body: m[1] === '22' ? BANNER_MOCK : NATIVE_MOCK(m[2]) });
    }
    log.third.push(u.hostname);
    return route.abort();
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => log.errors.push(String(e)));
  return { ctx, page, log };
}

async function inspect(page) {
  return page.evaluate(() => {
    const slots = Array.from(document.querySelectorAll('[data-adslot]')).map((s) => ({
      slot: s.dataset.adslot, unit: s.dataset.unit || null, state: s.dataset.state || null,
      visible: s.offsetParent !== null && s.getBoundingClientRect().height > 0,
      iframes: Array.from(s.querySelectorAll('iframe')).map((f) => f.getAttribute('data-mock-key')),
      nativeIds: Array.from(s.querySelectorAll('[id^="container-"]')).map((d) => d.id),
    }));
    const ids = Array.from(document.querySelectorAll('[id]')).map((e) => e.id);
    const dup = ids.filter((id, i) => ids.indexOf(id) !== i);
    let cfg = null; try { cfg = JSON.parse(document.getElementById('mm-ads-config').textContent); } catch (e) {}
    return {
      slots, dup, cfg,
      overflow: document.documentElement.scrollWidth - window.innerWidth,
      // Same page with every ad slot and the consent banner removed: overflow the layout already has.
      baseOverflow: (function () { const st = document.createElement('style'); st.textContent = '.adslot,#mm-consent{display:none!important}'; document.head.appendChild(st); const o = document.documentElement.scrollWidth - window.innerWidth; st.remove(); return o; })(),
      dataAds: document.documentElement.getAttribute('data-ads'),
      banner: !document.getElementById('mm-consent')?.hidden,
      adsense: !!document.querySelector('script[src*="adsbygoogle"]'),
      adsenseMeta: document.querySelector('meta[name="google-adsense-account"]')?.content || '',
      gtm: !!document.querySelector('script[src*="googletagmanager.com/gtm.js?id=GTM-TFX57NZ5"]'),
      canonical: !!document.querySelector('link[rel=canonical]'),
      hreflang: document.querySelectorAll('link[rel=alternate][hreflang]').length,
    };
  });
}
// Scroll through the page like a reader (lazy slots start near the viewport), then wait for mocks.
async function settle(page) {
  await page.waitForTimeout(600);
  await page.evaluate(async () => {
    const step = Math.round(window.innerHeight * 0.8);
    for (let y = 0; y < document.documentElement.scrollHeight; y += step) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 60)); }
  });
  await page.waitForTimeout(3200); // banner queue: load + iframe wait per banner
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(200);
}

function readJSON(f) { return JSON.parse(fs.readFileSync(f, 'utf8')); }
const ACCEPT = { v: 1, ads: true, analytics: true, ts: '2026-11-24T00:00:00Z' };
const REJECT = { v: 1, ads: false, analytics: false, ts: '2026-11-24T00:00:00Z' };

(async () => {
  const pages = readJSON(path.join(__dirname, 'test-advertising.pages.json'));
  const browser = await chromium.launch();
  const units = {}; // name -> key, from the first page config we see

  // 1. Eligible pages, every width: no consent / rejected / accepted (live) / preview / no preview.
  for (const p of pages.eligible) {
    for (const w of WIDTHS) {
      const label = `${p.url} @${w}`;
      for (const mode of ['none', 'reject', 'accept']) {
        const { ctx, page, log } = await newPage(browser, { width: w, live: true, consent: mode === 'none' ? null : mode === 'accept' ? ACCEPT : REJECT });
        await page.goto(ORIGIN + p.url, { waitUntil: 'load' });
        await settle(page);
        const r = await inspect(page);
        if (r.cfg) Object.assign(units, Object.fromEntries(Object.entries(r.cfg.units).map(([k, v]) => [k, v])));
        check(`${label} [${mode}] no JS errors`, !log.errors.length, log.errors.join(' | '));
        check(`${label} [${mode}] ads/banner add no horizontal overflow`, r.overflow <= Math.max(0, r.baseOverflow), `overflow ${r.overflow}px, without ads ${r.baseOverflow}px`);
        if (r.baseOverflow > 0 && mode === 'none') preexisting.push(`${label}: ${r.baseOverflow}px`);
        check(`${label} [${mode}] no duplicate ids`, !r.dup.length, r.dup.join(','));
        check(`${label} [${mode}] page type ${p.type}`, r.cfg && r.cfg.pageType === p.type, r.cfg && r.cfg.pageType);
        check(`${label} [${mode}] no AdSense ad script`, !r.adsense);
        check(`${label} [${mode}] GTM tag present`, r.gtm);
        check(`${label} [${mode}] adsense verification meta`, r.adsenseMeta === 'ca-pub-9110547384071189');
        if (mode !== 'accept') {
          check(`${label} [${mode}] no vendor request`, log.vendor.length === 0, log.vendor.join(','));
          check(`${label} [${mode}] slots hidden`, r.slots.every((s) => !s.visible));
          check(`${label} [${mode}] banner ${mode === 'none' ? 'shown' : 'hidden'}`, r.banner === (mode === 'none'));
        } else {
          const desktop = w >= 1024;
          const started = r.slots.filter((s) => s.unit);
          check(`${label} [accept] at most 2 units`, started.length <= 2 && log.vendor.length <= 2, `${started.length} units, ${log.vendor.length} requests`);
          check(`${label} [accept] requests == started units`, log.vendor.length === started.length, `${log.vendor.join(',')} vs ${started.map((s) => s.unit)}`);
          check(`${label} [accept] no duplicate vendor request`, new Set(log.vendor).size === log.vendor.length);
          if (!desktop) check(`${label} [accept] no desktop-only units on mobile`, started.every((s) => !['leaderboard', 'wideskyscraper', 'nativebanner'].includes(s.unit)), started.map((s) => s.unit).join(','));
          if (desktop) check(`${label} [accept] no 320x50 on desktop`, started.every((s) => s.unit !== 'mobilebanner'));
          check(`${label} [accept] never 160x600`, started.every((s) => s.unit !== 'wideskyscraper'));
          for (const s of started) {
            const u = r.cfg.units[s.unit];
            if (u.type === 'banner') check(`${label} [accept] ${s.slot}=${s.unit} got its own atOptions`, s.iframes.length === 1 && s.iframes[0] === u.key, JSON.stringify(s.iframes));
            else check(`${label} [accept] ${s.slot}=native single container`, s.nativeIds.length === 1, JSON.stringify(s.nativeIds));
            check(`${label} [accept] ${s.slot} fits`, s.visible);
          }
          const expected = p.expect[desktop ? 'desktop' : 'mobile'];
          if (expected && w >= 390) check(`${label} [accept] expected units`, JSON.stringify(started.map((s) => s.unit).sort()) === JSON.stringify(expected.slice().sort()), `${started.map((s) => s.unit)} vs ${expected}`);
          check(`${label} [accept] no non-vendor third-party besides Google tag`, log.third.every((h) => /googletagmanager|google-analytics|i\.ytimg|mzstatic|dzcdn|deezer|lastfm|scdn|googleusercontent|ggpht/.test(h)), [...new Set(log.third)].join(','));
        }
        await ctx.close();
      }
    }
  }

  // 2. Not live: consent alone loads nothing; owner preview loads.
  for (const p of pages.eligible.slice(0, 2)) {
    let t = await newPage(browser, { width: 1440, live: false, consent: ACCEPT });
    await t.page.goto(ORIGIN + p.url); await settle(t.page);
    check(`${p.url} not live + consent: no vendor request`, t.log.vendor.length === 0, t.log.vendor.join(','));
    await t.ctx.close();
    t = await newPage(browser, { width: 1440, live: false, consent: ACCEPT });
    await t.page.goto(ORIGIN + p.url + '?mm-ads-preview=on'); await settle(t.page);
    check(`${p.url} owner preview + consent: ads load`, t.log.vendor.length > 0 && t.log.vendor.length <= 2, t.log.vendor.join(','));
    await t.page.goto(ORIGIN + p.url + '?mm-ads-preview=off'); await settle(t.page);
    const n = t.log.vendor.length;
    await t.page.goto(ORIGIN + p.url); await settle(t.page);
    check(`${p.url} preview off: no more requests`, t.log.vendor.length === n);
    await t.ctx.close();
  }

  // 3. Ineligible pages: no slots, no loader, no vendor requests, even with consent + live.
  for (const url of pages.ineligible) {
    const { ctx, page, log } = await newPage(browser, { width: 1440, live: true, consent: ACCEPT });
    await page.goto(ORIGIN + url); await settle(page);
    const r = await inspect(page);
    check(`${url} ineligible: no slots`, r.slots.length === 0, r.slots.length);
    check(`${url} ineligible: no ad config`, !r.cfg);
    check(`${url} ineligible: no vendor request`, log.vendor.length === 0);
    check(`${url} ineligible: no JS errors`, !log.errors.length, log.errors.join(' | '));
    await ctx.close();
  }

  // 4. Consent flow through the real banner: Accept -> ads; Cookie settings -> withdraw -> reload, no ads.
  {
    const url = pages.eligible[0].url;
    const { ctx, page, log } = await newPage(browser, { width: 1440, live: true });
    await page.goto(ORIGIN + url); await page.waitForTimeout(500);
    check('banner visible on first visit', await page.isVisible('#mm-consent'));
    check('no vendor request before choice', log.vendor.length === 0);
    await page.click('#mm-consent [data-consent="accept"]'); await settle(page);
    check('accept: ads start without reload', log.vendor.length > 0 && log.vendor.length <= 2, log.vendor.join(','));
    check('accept: banner hidden', !(await page.isVisible('#mm-consent')));
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('mm-consent')));
    check('accept: stored', stored && stored.ads === true && stored.analytics === true);
    await page.click('.site-footer [data-consent="open"]');
    check('cookie settings dialog opens', await page.isVisible('#consent-dialog'));
    check('dialog reflects stored choice', await page.isChecked('#consent-dialog [name=ads]'));
    const before = log.vendor.length;
    await Promise.all([page.waitForNavigation(), page.click('#consent-dialog [data-consent="reject"]')]);
    await settle(page);
    check('withdraw: page reloaded without new vendor requests', log.vendor.length === before, `${before} -> ${log.vendor.length}`);
    const r = await inspect(page);
    check('withdraw: slots hidden', r.slots.every((s) => !s.visible) && r.dataAds === null);
    // Manage: analytics only.
    await page.click('.site-footer [data-consent="open"]');
    await page.check('#consent-dialog [name=analytics]');
    await page.uncheck('#consent-dialog [name=ads]');
    await page.click('#consent-dialog [data-consent="save"]');
    const s2 = await page.evaluate(() => JSON.parse(localStorage.getItem('mm-consent')));
    check('manage: analytics only saved', s2.analytics === true && s2.ads === false);
    await ctx.close();
  }
  // Reject via banner.
  {
    const { ctx, page, log } = await newPage(browser, { width: 390, live: true });
    await page.goto(ORIGIN + pages.eligible[0].url); await page.waitForTimeout(400);
    await page.click('#mm-consent [data-consent="reject"]'); await settle(page);
    check('reject via banner: no vendor request', log.vendor.length === 0);
    await ctx.close();
  }

  // 6. atOptions isolation when a banner script times out: no other banner may start.
  {
    const { ctx, page, log } = await newPage(browser, { width: 1440, live: true, consent: ACCEPT, delay: { [units.leaderboard.key]: 12500 } });
    await page.goto(ORIGIN + '/charts/global/'); await settle(page); await page.waitForTimeout(10500);
    const r = await inspect(page);
    const list = r.slots.find((s) => s.slot === 'list'), top = r.slots.find((s) => s.slot === 'top');
    check('timeout: slow banner marked timeout', top && top.state === 'timeout', top && top.state);
    check('timeout: next banner not started (halted, space kept)', list && list.state === 'halted' && list.iframes.length === 0 && list.visible, JSON.stringify(list));
    check('timeout: only the slow banner was requested', log.vendor.length === 1, log.vendor.join(','));
    await page.waitForTimeout(3000);
    const r2 = await inspect(page);
    const top2 = r2.slots.find((s) => s.slot === 'top');
    check('timeout: late script still used its own atOptions', top2.iframes.length === 1 && top2.iframes[0] === units.leaderboard.key, JSON.stringify(top2.iframes));
    await ctx.close();
  }
  // 7. Rotation/resize after consent: a lazy slot is re-checked before it loads.
  {
    const { ctx, page, log } = await newPage(browser, { width: 1440, live: true, consent: ACCEPT });
    await page.goto(ORIGIN + '/'); await page.waitForTimeout(800);
    await page.setViewportSize({ width: 390, height: 900 }); await page.waitForTimeout(300);
    await settle(page);
    const r = await inspect(page);
    const mid = r.slots.find((s) => s.slot === 'mid');
    check('resize: desktop native not loaded after switching to mobile width', mid && mid.state === 'skipped' && !log.vendor.some((v) => v.startsWith('/21/')), JSON.stringify(mid) + ' ' + log.vendor.join(','));
    check('resize: no JS errors', !log.errors.length, log.errors.join(' | '));
    await ctx.close();
  }

  // 5. Layout shift with stored consent and (mocked) ads.
  const cls = {};
  for (const p of pages.eligible) {
    for (const w of [390, 1440]) for (const withAds of [false, true]) {
      const { ctx, page } = await newPage(browser, { width: w, live: true, consent: withAds ? ACCEPT : REJECT });
      await page.addInitScript(() => { window.__cls = 0; new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; }).observe({ type: 'layout-shift', buffered: true }); });
      await page.goto(ORIGIN + p.url); await page.waitForTimeout(2500);
      cls[`${p.url} @${w} ${withAds ? 'ads' : 'no-ads'}`] = await page.evaluate(() => Math.round(window.__cls * 1000) / 1000);
      await ctx.close();
    }
  }
  await browser.close();

  const summary = { total: results.length, failed, cls, preexistingOverflow: preexisting };
  fs.writeFileSync(path.join(process.env.TEST_OUT || '.', 'advertising-test-results.json'), JSON.stringify({ summary, results }, null, 1));
  console.log(JSON.stringify(summary, null, 1));
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
