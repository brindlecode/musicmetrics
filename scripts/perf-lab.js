#!/usr/bin/env node
/* Lab performance snapshot of a built site (Playwright, local files only).
 *   node scripts/perf-lab.js <publicDir> <urls.json> [--consent] [--mock-ads] [--live]
 * Serves <publicDir> as https://musicmetrics.net/, blocks every third-party
 * request (Google tag, images, ad network) unless --mock-ads (bauval.org gets
 * a local mock), throttles CPU 4x on the mobile run, and prints LCP, CLS,
 * long-task total (TBT-like, main thread blocking > 50 ms), JS errors and the
 * requests per page. LAB data only: no network latency, no real ads, no field data.
 */
'use strict';
const fs = require('fs'), path = require('path');
const { chromium, devices } = require('playwright');
const [PUB, LIST] = process.argv.slice(2);
const FLAGS = new Set(process.argv.slice(4));
const ORIGIN = 'https://musicmetrics.net';
const urls = JSON.parse(fs.readFileSync(LIST, 'utf8'));
const MOCK = `(function(){var o=window.atOptions,s=document.currentScript;setTimeout(function(){var f=document.createElement('iframe');f.width=o.width;f.height=o.height;f.style.border=0;s.parentNode.insertBefore(f,s.nextSibling)},300)})();`;
function file(p) { p = decodeURIComponent(p.split('?')[0]); if (p.endsWith('/')) p += 'index.html'; const f = path.join(PUB, p); return fs.existsSync(f) && fs.statSync(f).isFile() ? f : null; }
(async () => {
  const browser = await chromium.launch();
  const out = [];
  for (const profile of ['desktop', 'mobile']) {
    for (const u of urls) {
      const ctx = await browser.newContext(profile === 'mobile' ? { ...devices['Pixel 7'] } : { viewport: { width: 1440, height: 900 } });
      if (FLAGS.has('--consent')) await ctx.addInitScript(() => localStorage.setItem('mm-consent', JSON.stringify({ v: 1, ads: true, analytics: true })));
      const req = { first: 0, vendor: 0, blocked: 0 };
      await ctx.route('**/*', async (r) => {
        const url = new URL(r.request().url());
        if (url.origin === ORIGIN) {
          const f = file(url.pathname); if (!f) return r.fulfill({ status: 404, body: '' });
          req.first++;
          let body = fs.readFileSync(f);
          if (FLAGS.has('--live') && f.endsWith('.html')) body = body.toString().replace('"live":false', '"live":true');
          return r.fulfill({ status: 200, body, contentType: { '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png' }[path.extname(f)] || 'application/octet-stream' });
        }
        if (url.hostname === 'bauval.org' && FLAGS.has('--mock-ads')) { req.vendor++; return r.fulfill({ status: 200, contentType: 'application/javascript', body: url.pathname.startsWith('/22/') ? MOCK : '' }); }
        req.blocked++; return r.abort();
      });
      const page = await ctx.newPage();
      const errors = []; page.on('pageerror', (e) => errors.push(String(e)));
      if (profile === 'mobile') { const cdp = await ctx.newCDPSession(page); await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 }); }
      await page.addInitScript(() => {
        window.__m = { lcp: 0, cls: 0, lt: 0 };
        new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__m.lcp = e.startTime; }).observe({ type: 'largest-contentful-paint', buffered: true });
        new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__m.cls += e.value; }).observe({ type: 'layout-shift', buffered: true });
        new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__m.lt += Math.max(0, e.duration - 50); }).observe({ type: 'longtask', buffered: true });
      });
      await page.goto(ORIGIN + u, { waitUntil: 'load' });
      await page.waitForTimeout(3000);
      const m = await page.evaluate(() => ({ ...window.__m, overflow: document.documentElement.scrollWidth - window.innerWidth }));
      out.push({ profile, url: u, lcp_ms: Math.round(m.lcp), cls: +m.cls.toFixed(3), tbt_ms: Math.round(m.lt), overflow_px: m.overflow, js_errors: errors.length, first_party_req: req.first, ad_req: req.vendor, third_party_blocked: req.blocked });
      await ctx.close();
    }
  }
  await browser.close();
  console.log(JSON.stringify(out, null, 1));
})();
