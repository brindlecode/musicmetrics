/* MusicMetrics advertising loader (Adsterra).
 *
 * Runs only on pages that carry #mm-ads-config (eligible pages, see
 * layouts/partials/advertising/). Nothing is requested from the ad network
 * unless ALL of these hold:
 *   - the provider is live, or this browser opted into owner preview;
 *   - the page is served from an allowed host (never previews/localhost);
 *   - the visitor accepted advertising cookies (window.MMConsent);
 *   - the slot is visible for this viewport and wide enough for the unit;
 *   - fewer than cfg.max units were started on this page.
 *
 * Banners use Adsterra's own snippet values (atOptions + script URL). Because
 * atOptions is one global, banners are started strictly one at a time: the
 * next banner only starts after the previous script has loaded AND produced
 * its iframe (or timed out). The Native Banner does not use atOptions and is
 * started at most once per page (its container id must be unique).
 * No eval, no innerHTML, no custom iframes, no adblock detection.
 */
(function () {
  'use strict';
  var el = document.getElementById('mm-ads-config');
  if (!el) return;
  var cfg;
  try { cfg = JSON.parse(el.textContent); } catch (e) { return; }
  var root = document.documentElement;
  var started = false, used = 0, busy = false, queue = [], nativeDone = false;
  // Set when a banner script timed out: it may still run later and read
  // window.atOptions, so no other banner may touch atOptions on this page.
  var bannersHalted = false;

  function previewOn() { try { return localStorage.getItem('mm-ads-preview') === 'on'; } catch (e) { return false; } }
  function permitted() {
    return (cfg.live || (cfg.preview && previewOn())) &&
      (cfg.hosts || []).indexOf(location.hostname) > -1 &&
      !!window.MMConsent && window.MMConsent.adsAllowed();
  }
  function track(slot, state) {
    slot.setAttribute('data-state', state);
    if (cfg.ga4 && typeof window.gtag === 'function' && state !== 'reserved') {
      window.gtag('event', 'ad_slot', {
        ad_provider: cfg.provider, ad_unit: slot.getAttribute('data-unit') || '',
        ad_slot: slot.getAttribute('data-adslot'), ad_state: state,
        ad_page_type: cfg.pageType, ad_device: cfg._desktop ? 'desktop' : 'mobile',
        ad_preview: cfg.live ? 0 : 1, non_interaction: true
      });
    }
  }
  // Resolves once an iframe (or any element) appears in the unit box, or after `ms`.
  function waitForFill(box, ms, cb) {
    var finished = false, mo, t;
    function end(ok) { if (finished) return; finished = true; if (mo) mo.disconnect(); clearTimeout(t); cb(ok); }
    if (box.querySelector('iframe')) return end(true);
    if (window.MutationObserver) {
      mo = new MutationObserver(function () { if (box.querySelector('iframe')) end(true); });
      mo.observe(box, { childList: true, subtree: true });
    }
    t = setTimeout(function () { end(!!box.querySelector('iframe,img,a')); }, ms);
  }

  function isDesktop() { return window.matchMedia('(min-width: ' + cfg.desktopMin + 'px)').matches; }
  // Does `name` still belong to this slot's list for the current viewport, and fit its current width?
  function stillFits(slot, name) {
    var list = (slot.getAttribute(isDesktop() ? 'data-d' : 'data-m') || '').split(' ');
    var u = cfg.units[name];
    return !!u && list.indexOf(name) > -1 && slot.offsetParent !== null && u.w <= slot.clientWidth;
  }

  function next() {
    if (busy || !queue.length) return;
    var job = queue.shift(), slot = job.slot, u = cfg.units[job.name];
    if (slot.getAttribute('data-started')) return next();
    // The viewport may have changed (rotation, resize) since the unit was picked.
    if (!stillFits(slot, job.name)) { track(slot, 'skipped'); return next(); }
    if (u.type !== 'native' && bannersHalted) { track(slot, 'halted'); return next(); } // keeps its reserved space: no layout shift
    slot.setAttribute('data-started', '1');
    var box = slot.querySelector('.adslot__unit');
    var s = document.createElement('script');
    s.setAttribute('data-cfasync', 'false');
    s.src = u.src;

    if (u.type === 'native') {
      var id = 'container-' + u.key;
      if (document.getElementById(id)) { track(slot, 'skipped'); return next(); }
      var c = document.createElement('div');
      c.id = id;
      box.appendChild(c);
      s.async = true;
      s.onerror = function () { track(slot, 'error'); };
      box.appendChild(s);
      waitForFill(c, 6000, function (ok) { track(slot, ok ? 'filled' : 'empty'); });
      return next(); // independent of atOptions: no need to wait
    }

    busy = true;
    var released = false;
    function release(state) {
      if (released) return; released = true;
      // A script that is still pending can execute later against window.atOptions:
      // stop starting banners on this page (natives do not use atOptions).
      if (state === 'timeout') bannersHalted = true;
      track(slot, state);
      busy = false;
      next();
    }
    // Exactly the values of the dashboard snippet for this unit.
    window.atOptions = { 'key': u.key, 'format': 'iframe', 'height': u.h, 'width': u.w, 'params': {} };
    s.onload = function () { waitForFill(box, 2500, function (ok) { release(ok ? 'filled' : 'empty'); }); };
    s.onerror = function () { release('error'); };
    setTimeout(function () { release('timeout'); }, 10000);
    box.appendChild(s);
  }

  function enqueue(slot, name) { queue.push({ slot: slot, name: name }); next(); }

  function start() {
    if (started || !permitted()) return;
    started = true;
    root.setAttribute('data-ads', '1');
    cfg._desktop = isDesktop();
    var slots = Array.prototype.slice.call(document.querySelectorAll('[data-adslot]'));
    var io = 'IntersectionObserver' in window ? new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { io.unobserve(en.target); enqueue(en.target, en.target.getAttribute('data-unit')); }
      });
    }, { rootMargin: '400px 0px' }) : null;

    slots.forEach(function (slot) {
      var list = (slot.getAttribute(cfg._desktop ? 'data-d' : 'data-m') || '').split(' ').filter(Boolean);
      var width = slot.clientWidth, name = null;
      if (used < cfg.max && width > 0) {
        for (var i = 0; i < list.length; i++) {
          var u = cfg.units[list[i]];
          if (!u || (u.type === 'native' && nativeDone)) continue;
          if (u.w <= width) { name = list[i]; break; }
        }
      }
      if (!name) { slot.setAttribute('data-state', 'skipped'); return; }
      if (cfg.units[name].type === 'native') nativeDone = true;
      used++;
      slot.setAttribute('data-unit', name);
      track(slot, 'reserved');
      if (io) io.observe(slot); else enqueue(slot, name);
    });
  }

  // Consent given or withdrawn in the banner / "Cookie settings".
  document.addEventListener('mm:consent', function (ev) {
    if (ev.detail && ev.detail.ads) start();
    else if (started) location.reload(); // drops every ad script from the page
    else root.removeAttribute('data-ads');
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
