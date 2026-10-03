/* MusicMetrics — progressive enhancement only; every page works without JS. */
(function () {
  'use strict';
  var doc = document.documentElement;
  var lang = doc.lang || 'en';
  var prefix = doc.getAttribute('data-prefix') || '/';
  var I = window.MM_I18N || {};

  function store(k, v) {
    try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; }
  }

  /* ---------------------------------------------------------- theme --- */
  var tbtn = document.querySelector('.theme-toggle');
  if (tbtn) tbtn.addEventListener('click', function () {
    var cur = doc.getAttribute('data-theme');
    if (!cur) cur = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    var next = cur === 'dark' ? 'light' : 'dark';
    doc.setAttribute('data-theme', next);
    store('mm-theme', next);
  });

  /* -------------------------------------------------- relative times --- */
  var rtf = window.Intl && Intl.RelativeTimeFormat ? new Intl.RelativeTimeFormat(lang, { numeric: 'auto' }) : null;
  function rel(iso) {
    var diff = (Date.parse(iso) - Date.now()) / 1000;
    var a = Math.abs(diff);
    if (!rtf || isNaN(diff)) return null;
    if (a < 3600) return rtf.format(Math.round(diff / 60), 'minute');
    if (a < 86400) return rtf.format(Math.round(diff / 3600), 'hour');
    return rtf.format(Math.round(diff / 86400), 'day');
  }
  document.querySelectorAll('time[data-rel]').forEach(function (t) {
    var r = rel(t.getAttribute('datetime'));
    if (r) { t.title = t.textContent; t.textContent = r; }
  });

  /* --------------------------------------------------------- dialogs --- */
  function openDialog(d) { if (d && d.showModal) { d.showModal(); } }

  /* ---------------------------------------------------------- video --- */
  var vdlg = document.getElementById('video-dialog');
  function playVideo(id) {
    if (!vdlg) { window.open('https://www.youtube.com/watch?v=' + id, '_blank', 'noopener'); return; }
    vdlg.querySelector('.video-dialog__frame').innerHTML =
      '<iframe src="https://www.youtube-nocookie.com/embed/' + encodeURIComponent(id) + '?autoplay=1&rel=0" title="YouTube video" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe>';
    openDialog(vdlg);
  }
  if (vdlg) {
    vdlg.addEventListener('close', function () { vdlg.querySelector('.video-dialog__frame').innerHTML = ''; });
    vdlg.addEventListener('click', function (e) { if (e.target === vdlg) vdlg.close(); });
  }
  document.addEventListener('click', function (e) {
    var p = e.target.closest('[data-yt]');
    if (!p) return;
    e.preventDefault();
    if (p.classList.contains('embed')) {
      p.innerHTML = '<iframe src="https://www.youtube-nocookie.com/embed/' + encodeURIComponent(p.getAttribute('data-yt')) + '?autoplay=1&rel=0" title="YouTube video" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe>';
      return;
    }
    playVideo(p.getAttribute('data-yt'));
  });

  /* ---------------------------------------------------------- share --- */
  document.querySelectorAll('[data-share]').forEach(function (b) {
    b.addEventListener('click', function () {
      var data = { title: document.title, url: location.href };
      if (navigator.share) { navigator.share(data).catch(function () {}); return; }
      if (navigator.clipboard) navigator.clipboard.writeText(location.href).then(function () {
        var old = b.innerHTML; b.textContent = I.copied || 'Link copied'; setTimeout(function () { b.innerHTML = old; }, 1600);
      });
    });
  });

  /* ------------------------------------------------- select navigate --- */
  document.querySelectorAll('select[data-nav]').forEach(function (s) {
    s.addEventListener('change', function () { if (s.value) location.href = s.value; });
  });

  /* ---------------------------------------------------- chart filter --- */
  document.querySelectorAll('[data-filter-for]').forEach(function (bar) {
    var list = document.getElementById(bar.getAttribute('data-filter-for'));
    if (!list) return;
    var q = bar.querySelector('input[type=search]');
    var only = bar.querySelector('input[data-only]');
    var rows = Array.prototype.slice.call(list.children).filter(function (el) { return !el.classList.contains('row-ad'); });
    function apply() {
      var term = norm(q && q.value || '').trim();
      var mode = only && only.checked ? only.getAttribute('data-only') : '';
      rows.forEach(function (r) {
        var ok = !term || norm(r.getAttribute('data-f') || r.textContent).indexOf(term) > -1;
        if (ok && mode === 'new') ok = r.getAttribute('data-move') === 'new';
        if (ok && mode === 'up') ok = r.getAttribute('data-move') === 'new' || +r.getAttribute('data-move') > 0;
        r.hidden = !ok;
      });
      list.querySelectorAll('.row-ad').forEach(function (a) { a.hidden = !!(term || mode); });
    }
    if (q) q.addEventListener('input', apply);
    if (only) only.addEventListener('change', apply);
  });

  /* --------------------------------------------------------- search --- */
  var sdlg = document.getElementById('search-dialog');
  var index = null, loading = null;
  function norm(s) { return (s || '').toString().toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, ''); }
  function loadIndex() {
    if (index) return Promise.resolve(index);
    if (loading) return loading;
    loading = fetch('/search-index.json').then(function (r) { return r.json(); }).then(function (d) {
      index = d.map(function (x) { x._n = norm(x.n + ' ' + (x.a || '') + ' ' + (x.alt || '')); return x; });
      return index;
    });
    return loading;
  }
  function esc(s) { return String(s || '').replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function search(q) {
    q = norm(q).trim();
    if (!q) return [];
    var words = q.split(/\s+/);
    var out = [];
    for (var i = 0; i < index.length; i++) {
      var x = index[i], s = x._n, score = 0, ok = true;
      for (var w = 0; w < words.length; w++) { var p = s.indexOf(words[w]); if (p < 0) { ok = false; break; } score += p === 0 ? 3 : (s.charAt(p - 1) === ' ' ? 2 : 1); }
      if (!ok) continue;
      if (norm(x.n) === q) score += 10;
      score += (x.w || 0);
      out.push([score, x]);
    }
    out.sort(function (a, b) { return b[0] - a[0]; });
    return out.slice(0, 30).map(function (o) { return o[1]; });
  }
  function kindLabel(k) { return (I.kinds && I.kinds[k]) || k; }
  function render(list, q) {
    var ul = sdlg.querySelector('.search-results');
    if (!q) { ul.innerHTML = '<li class="search-empty">' + esc(I.searchHint || 'Search artists, songs and countries') + '</li>'; return; }
    if (!list.length) { ul.innerHTML = '<li class="search-empty">' + esc(I.noResults || 'No results') + '</li>'; return; }
    ul.innerHTML = list.map(function (x, i) {
      var img = x.i ? '<img src="' + esc(x.i) + '" alt="" loading="lazy" width="40" height="40"' + (x.fl ? ' class="is-flag"' : '') + '>' : '<span class="sr-ph">' + esc(x.f || '♪') + '</span>';
      var name = x.k === 'c' && x.l && x.l[lang] ? x.l[lang] : x.n;
      return '<li><a href="' + (x.e ? '/' : prefix) + esc(x.u) + '"' + (i === 0 ? ' aria-selected="true"' : '') + '>' + img +
        '<span><span class="t">' + esc(name) + '</span>' + (x.a ? '<span class="s">' + esc(x.a) + '</span>' : '') + '</span>' +
        '<span class="k">' + esc(kindLabel(x.k)) + '</span></a></li>';
    }).join('');
  }
  function openSearch() {
    if (!sdlg) return;
    openDialog(sdlg);
    var input = sdlg.querySelector('input');
    input.focus();
    input.select();
    loadIndex().then(function () { render(search(input.value), input.value); });
  }
  if (sdlg) {
    var input = sdlg.querySelector('input');
    input.addEventListener('input', function () { loadIndex().then(function () { render(search(input.value), input.value); }); });
    sdlg.querySelector('form').addEventListener('submit', function (e) {
      var first = sdlg.querySelector('.search-results a');
      if (first) { e.preventDefault(); location.href = first.href; }
    });
    sdlg.addEventListener('click', function (e) { if (e.target === sdlg) sdlg.close(); });
    sdlg.addEventListener('keydown', function (e) {
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      var links = Array.prototype.slice.call(sdlg.querySelectorAll('.search-results a'));
      if (!links.length) return;
      e.preventDefault();
      var cur = links.findIndex(function (a) { return a.getAttribute('aria-selected') === 'true'; });
      if (cur > -1) links[cur].removeAttribute('aria-selected');
      cur = (cur + (e.key === 'ArrowDown' ? 1 : -1) + links.length) % links.length;
      links[cur].setAttribute('aria-selected', 'true');
      links[cur].scrollIntoView({ block: 'nearest' });
      input.value = input.value; // keep focus in input
    });
    sdlg.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        var sel = sdlg.querySelector('.search-results a[aria-selected="true"]');
        if (sel) { e.preventDefault(); location.href = sel.href; }
      }
    });
  }
  // Spotify: load the official embed only when asked (no Spotify requests before a click).
  document.querySelectorAll('[data-sp] button').forEach(function (b) {
    b.addEventListener('click', function () {
      var box = b.parentNode;
      var f = document.createElement('iframe');
      f.src = 'https://open.spotify.com/embed/' + box.getAttribute('data-sp') + '?utm_source=generator';
      f.title = 'Spotify';
      f.allow = 'autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture';
      box.innerHTML = '';
      box.appendChild(f);
    });
  });
  // Language menu: close on outside click and Escape.
  var lm = document.querySelector('.lang-menu');
  if (lm) {
    document.addEventListener('click', function (e) { if (lm.open && !lm.contains(e.target)) lm.open = false; });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && lm.open) { lm.open = false; lm.querySelector('summary').focus(); }
    });
  }
  document.querySelectorAll('[data-open-search]').forEach(function (b) {
    b.addEventListener('click', function (e) { e.preventDefault(); openSearch(); });
  });
  document.addEventListener('keydown', function (e) {
    var tag = (e.target.tagName || '').toLowerCase();
    if ((e.key === '/' && tag !== 'input' && tag !== 'textarea') || ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k')) {
      e.preventDefault();
      openSearch();
    }
  });
  // Search page: /search/?q=
  var sp = document.getElementById('search-page');
  if (sp) {
    var q = new URLSearchParams(location.search).get('q') || '';
    var box = sp.querySelector('input');
    box.value = q;
    var target = sp.querySelector('.search-results');
    function run() {
      loadIndex().then(function () {
        var list = search(box.value);
        target.innerHTML = list.length ? list.map(function (x) {
          var name = x.k === 'c' && x.l && x.l[lang] ? x.l[lang] : x.n;
          var img = x.i ? '<img src="' + esc(x.i) + '" alt="" loading="lazy" width="40" height="40"' + (x.fl ? ' class="is-flag"' : '') + '>' : '<span class="sr-ph">' + esc(x.f || '♪') + '</span>';
          return '<li><a href="' + (x.e ? '/' : prefix) + esc(x.u) + '">' + img + '<span><span class="t">' + esc(name) + '</span>' + (x.a ? '<span class="s">' + esc(x.a) + '</span>' : '') + '</span><span class="k">' + esc(kindLabel(x.k)) + '</span></a></li>';
        }).join('') : (box.value ? '<li class="search-empty">' + esc(I.noResults || 'No results') + '</li>' : '');
      });
    }
    box.addEventListener('input', run);
    if (q) run();
  }

  /* ------------------------------------------- language suggestion --- */
  // Suggest the visitor's language once, never redirect (good for SEO).
  var bar = document.getElementById('lang-suggest');
  if (bar && !store('mm-lang-dismissed')) {
    var pref = (navigator.language || '').slice(0, 2);
    var link = bar.querySelector('a[hreflang="' + pref + '"]');
    if (pref && pref !== lang && link) {
      bar.querySelectorAll('a[hreflang]').forEach(function (a) { if (a !== link) a.remove(); });
      bar.hidden = false;
      bar.querySelector('button').addEventListener('click', function () { bar.hidden = true; store('mm-lang-dismissed', '1'); });
    }
  }
})();
