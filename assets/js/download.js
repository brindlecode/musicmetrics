/* MusicMetrics — chart downloads (Excel / CSV), built in the browser from the
   chart rows on the page. ExcelJS (MIT) is self-hosted and loaded on first use. */
(function () {
  'use strict';
  var menus = document.querySelectorAll('.dl-menu');
  if (!menus.length) return;

  var BRAND = { ink: 'FF141412', paper: 'FFF4F2EC', rule: 'FFD9D4C8', accent: 'FF1F3DFF', muted: 'FF6B675E', up: 'FF0A8047', down: 'FFC42B2B' };
  var METRICS = {
    youtube: ['views', 'views_day'], musicmetrics: ['points', 'charts'], lastfm: ['listeners'],
    apple: ['genre'], 'apple-albums': ['genre'], deezer: ['album'], itunes: []
  };
  var NUMERIC = { views: 1, views_day: 1, points: 1, charts: 1, listeners: 1 };

  function txt(el) { return el ? el.textContent.replace(/\s+/g, ' ').trim() : ''; }
  function num(s) { var n = parseFloat(String(s).replace(/[^0-9.\-]/g, '')); return isFinite(n) ? n : null; }

  function parseRows(root, base) {
    return Array.prototype.map.call(root.querySelectorAll('ol.chart > li.row'), function (li) {
      var a = li.querySelector('a.row__title');
      return {
        rank: num(txt(li.querySelector('.row__rank'))),
        move: li.getAttribute('data-move') || '',
        title: txt(li.querySelector('.row__title')),
        href: a ? new URL(a.getAttribute('href'), base).href : '',
        artist: txt(li.querySelector('.row__artist')),
        peak: num(txt(li.querySelector('.row__peak'))),
        days: num(txt(li.querySelector('.row__days'))),
        m1: li.getAttribute('data-m1') || '', m2: li.getAttribute('data-m2') || ''
      };
    });
  }

  function moveLabel(m, L) {
    if (m === 'new') return L.new || 'NEW';
    if (m === 're') return 'RE';
    var n = parseInt(m, 10);
    if (!m || m === '<nil>' || isNaN(n)) return '';
    return n > 0 ? '▲' + n : n < 0 ? '▼' + (-n) : '=';
  }

  function fmtDate(iso, withTime) {
    var d = new Date(iso);
    if (isNaN(d)) return '';
    var p = function (n) { return (n < 10 ? '0' : '') + n; };
    return p(d.getDate()) + '.' + p(d.getMonth() + 1) + '.' + d.getFullYear() + (withTime ? ' ' + p(d.getHours()) + ':' + p(d.getMinutes()) : '');
  }
  function isoDay(iso) { var d = new Date(iso || Date.now()); return isNaN(d) ? '' : d.toISOString().slice(0, 10); }

  function save(blob, name) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
  }

  // Each chart: { title, source, platform, url, updated, rows }
  function loadCharts(cfg) {
    if (cfg.kind !== 'country') {
      return Promise.resolve([{ title: cfg.title, source: cfg.source, platform: cfg.platform, url: cfg.url, updated: cfg.updated, rows: parseRows(document, location.href) }]);
    }
    return Promise.all(cfg.charts.map(function (c) {
      var url = new URL(c.url, location.href).href;
      return fetch(url).then(function (r) { return r.text(); }).then(function (html) {
        var doc = new DOMParser().parseFromString(html, 'text/html');
        var t = doc.querySelector('time[datetime]');
        return { title: c.title, source: c.source, platform: c.platform, url: url, updated: t ? t.getAttribute('datetime') : cfg.updated, rows: parseRows(doc, url) };
      });
    }));
  }

  /* ------------------------------------------------------------- CSV --- */
  function toCSV(cfg, charts) {
    var L = cfg.labels;
    // Excel in these locales expects ";" as the list separator.
    var sep = /^(tr|de|fr|es|pt)$/.test(cfg.lang) ? ';' : ',';
    var esc = function (v) { v = v == null ? '' : String(v); return /[",;\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    var multi = charts.length > 1;
    var mk = charts.reduce(function (acc, c) { (METRICS[c.platform] || []).forEach(function (k) { if (acc.indexOf(k) < 0) acc.push(k); }); return acc; }, []);
    var head = (multi ? [L.chart] : []).concat([L.rank, L.change, L.title, L.artist, L.peak, L.days], mk.map(function (k) { return L[k] || k; }), [L.link, L.source, L.updated]);
    var lines = [head.map(esc).join(sep)];
    charts.forEach(function (c) {
      var own = METRICS[c.platform] || [];
      c.rows.forEach(function (r) {
        var mv = r.move === 'new' ? 'NEW' : r.move === 're' ? 'RE' : (r.move && r.move !== '<nil>' ? (parseInt(r.move, 10) > 0 ? '+' + parseInt(r.move, 10) : r.move) : '');
        var metrics = mk.map(function (k) { var i = own.indexOf(k); return i < 0 ? '' : (i === 0 ? r.m1 : r.m2); });
        var row = (multi ? [c.title] : []).concat([r.rank, mv, r.title, r.artist, r.peak, r.days], metrics, [r.href, 'MusicMetrics · ' + c.source, isoDay(c.updated)]);
        lines.push(row.map(esc).join(sep));
      });
    });
    return new Blob(['﻿' + lines.join('\r\n') + '\r\n'], { type: 'text/csv;charset=utf-8' });
  }

  /* ----------------------------------------------------------- Excel --- */
  var excelLoading = null;
  function loadExcel() {
    if (window.ExcelJS) return Promise.resolve(window.ExcelJS);
    if (excelLoading) return excelLoading;
    excelLoading = new Promise(function (ok, fail) {
      var s = document.createElement('script');
      s.src = '/vendor/exceljs-4.4.0.min.js';
      s.onload = function () { ok(window.ExcelJS); };
      s.onerror = fail;
      document.head.appendChild(s);
    });
    return excelLoading;
  }
  function loadLogo() {
    return fetch('/icon-192.png').then(function (r) { return r.arrayBuffer(); }).then(function (b) {
      var s = '', u = new Uint8Array(b);
      for (var i = 0; i < u.length; i++) s += String.fromCharCode(u[i]);
      return btoa(s);
    }).catch(function () { return null; });
  }

  function sheetName(name, used) {
    var n = name.replace(/[\[\]:*?\/\\]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 31) || 'Chart';
    var base = n, i = 2;
    while (used[n.toLowerCase()]) { n = base.slice(0, 28) + ' ' + i++; }
    used[n.toLowerCase()] = 1;
    return n;
  }

  function brandHeader(ws, wb, logoId, lastCol, title, sub, url) {
    ws.getRow(1).height = 30;
    ws.mergeCells(1, 2, 1, lastCol);
    for (var c = 1; c <= lastCol; c++) ws.getCell(1, c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND.ink } };
    var b = ws.getCell(1, 2);
    b.value = { richText: [
      { text: 'MUSIC', font: { name: 'Arial', size: 16, color: { argb: 'FFFFFFFF' } } },
      { text: 'METRICS', font: { name: 'Arial', size: 16, bold: true, color: { argb: 'FFFFFFFF' } } },
      { text: '   musicmetrics.net', font: { name: 'Arial', size: 10, color: { argb: 'FFB8B4AA' } } }
    ] };
    b.alignment = { vertical: 'middle' };
    if (logoId != null) ws.addImage(logoId, { tl: { col: 0.15, row: 0.12 }, ext: { width: 30, height: 30 } });
    ws.mergeCells(2, 1, 2, lastCol);
    var t = ws.getCell(2, 1);
    t.value = title; t.font = { name: 'Arial', size: 15, bold: true, color: { argb: BRAND.ink } };
    ws.getRow(2).height = 26;
    ws.mergeCells(3, 1, 3, lastCol);
    var s = ws.getCell(3, 1);
    s.value = sub; s.font = { name: 'Arial', size: 10, color: { argb: BRAND.muted } };
    ws.mergeCells(4, 1, 4, lastCol);
    var u = ws.getCell(4, 1);
    u.value = { text: url, hyperlink: url }; u.font = { name: 'Arial', size: 10, color: { argb: BRAND.accent }, underline: true };
    // accent rule
    for (c = 1; c <= lastCol; c++) ws.getCell(5, c).border = { bottom: { style: 'medium', color: { argb: BRAND.accent } } };
    ws.getRow(5).height = 6;
  }

  function headerRow(ws, rowIdx, values, centerCols) {
    var row = ws.getRow(rowIdx);
    row.values = values;
    row.height = 22;
    row.eachCell(function (cell, col) {
      cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND.accent } };
      cell.alignment = { vertical: 'middle', horizontal: centerCols[col] ? 'center' : 'left' };
    });
  }

  function addChartSheet(wb, used, logoId, c, L) {
    var mk = METRICS[c.platform] || [];
    var cols = [{ w: 6 }, { w: 8 }, { w: 44 }, { w: 34 }, { w: 7 }, { w: 7 }].concat(mk.map(function (k) { return { w: NUMERIC[k] ? 15 : 22 }; }), [{ w: 50 }]);
    var ws = wb.addWorksheet(sheetName(c.title, used), {
      views: [{ state: 'frozen', ySplit: 6, showGridLines: false }],
      pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.6, header: 0.2, footer: 0.3 } },
      headerFooter: { oddFooter: '&L&8MusicMetrics · musicmetrics.net&R&8&P / &N' }
    });
    ws.columns = cols.map(function (x) { return { width: x.w }; });
    var last = cols.length;
    brandHeader(ws, wb, logoId, last, c.title, L.updated + ': ' + fmtDate(c.updated, true) + '  ·  ' + L.source + ': ' + c.source, c.url);
    headerRow(ws, 6, [L.rank, L.change, L.title, L.artist, L.peak, L.days].concat(mk.map(function (k) { return L[k] || k; }), [L.link]), { 1: 1, 2: 1, 5: 1, 6: 1 });
    c.rows.forEach(function (r, i) {
      var vals = [r.rank, moveLabel(r.move, L), r.title, r.artist, r.peak, r.days];
      mk.forEach(function (k, j) { var v = j === 0 ? r.m1 : r.m2; vals.push(NUMERIC[k] ? num(v) : v); });
      vals.push(r.href ? { text: r.href.replace(/^https?:\/\//, ''), hyperlink: r.href } : '');
      var row = ws.getRow(7 + i);
      row.values = vals;
      row.height = 18;
      row.eachCell({ includeEmpty: true }, function (cell, col) {
        cell.font = { name: 'Arial', size: 10, color: { argb: BRAND.ink } };
        cell.alignment = { vertical: 'middle', horizontal: (col === 1 || col === 2 || col === 5 || col === 6) ? 'center' : 'left' };
        cell.border = { bottom: { style: 'thin', color: { argb: BRAND.rule } } };
        if (i % 2 === 1) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND.paper } };
      });
      row.getCell(1).font = { name: 'Arial', size: 11, bold: true, color: { argb: r.rank === 1 ? BRAND.accent : BRAND.ink } };
      row.getCell(3).font = { name: 'Arial', size: 10, bold: true, color: { argb: BRAND.ink } };
      var mv = row.getCell(2);
      mv.font = { name: 'Arial', size: 9, bold: true, color: { argb: /▲/.test(mv.value) ? BRAND.up : /▼/.test(mv.value) ? BRAND.down : (r.move === 'new' || r.move === 're') ? BRAND.accent : BRAND.muted } };
      mk.forEach(function (k, j) { if (NUMERIC[k]) ws.getCell(7 + i, 7 + j).numFmt = '#,##0'; });
      var link = row.getCell(last);
      if (r.href) link.font = { name: 'Arial', size: 9, color: { argb: BRAND.accent } };
    });
    ws.autoFilter = { from: { row: 6, column: 1 }, to: { row: 6 + c.rows.length, column: last } };
    var f = ws.getRow(8 + c.rows.length);
    ws.mergeCells(8 + c.rows.length, 1, 8 + c.rows.length, last);
    f.getCell(1).value = L.footer.replace('{source}', c.source);
    f.getCell(1).font = { name: 'Arial', size: 9, italic: true, color: { argb: BRAND.muted } };
    f.getCell(1).alignment = { wrapText: true, vertical: 'top' };
    f.height = 30;
    return ws;
  }

  function toXLSX(cfg, charts) {
    return Promise.all([loadExcel(), loadLogo()]).then(function (res) {
      var ExcelJS = res[0], logo = res[1], L = cfg.labels;
      var wb = new ExcelJS.Workbook();
      wb.creator = 'MusicMetrics'; wb.company = 'MusicMetrics'; wb.title = cfg.title;
      wb.created = new Date();
      var logoId = logo ? wb.addImage({ base64: logo, extension: 'png' }) : null;
      var used = {};
      if (charts.length > 1) {
        var ws = wb.addWorksheet(sheetName(L.summary, used), { views: [{ showGridLines: false }] });
        ws.columns = [{ width: 46 }, { width: 18 }, { width: 44 }, { width: 34 }];
        brandHeader(ws, wb, logoId, 4, cfg.title, L.updated + ': ' + fmtDate(cfg.updated, true), cfg.url);
        headerRow(ws, 6, [L.chart, L.source, '#1 ' + L.title, L.artist], {});
        var names = charts.map(function (c) { return c.title; });
        var sheetNames = [];
        var tmpUsed = JSON.parse(JSON.stringify(used));
        names.forEach(function (n) { sheetNames.push(sheetName(n, tmpUsed)); });
        charts.forEach(function (c, i) {
          var top = c.rows[0] || {};
          var row = ws.getRow(7 + i);
          row.values = [{ text: c.title, hyperlink: "#'" + sheetNames[i].replace(/'/g, "''") + "'!A1" }, c.source, top.title || '', top.artist || ''];
          row.height = 20;
          row.eachCell(function (cell, col) {
            cell.font = { name: 'Arial', size: 10, bold: col === 1 || col === 3, color: { argb: col === 1 ? BRAND.accent : BRAND.ink }, underline: col === 1 };
            cell.border = { bottom: { style: 'thin', color: { argb: BRAND.rule } } };
            cell.alignment = { vertical: 'middle' };
            if (i % 2 === 1) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND.paper } };
          });
        });
      }
      charts.forEach(function (c) { addChartSheet(wb, used, logoId, c, L); });
      return wb.xlsx.writeBuffer().then(function (buf) {
        return new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      });
    });
  }

  /* -------------------------------------------------------------- UI --- */
  menus.forEach(function (menu) {
    var cfg;
    try { cfg = JSON.parse(menu.getAttribute('data-dl')); } catch (e) { return; }
    document.addEventListener('click', function (e) { if (menu.open && !menu.contains(e.target)) menu.open = false; });
    menu.querySelectorAll('[data-dl-fmt]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var fmt = btn.getAttribute('data-dl-fmt');
        if (menu.classList.contains('is-busy')) return;
        menu.classList.add('is-busy');
        btn.setAttribute('aria-busy', 'true');
        loadCharts(cfg).then(function (charts) {
          charts = charts.filter(function (c) { return c.rows.length; });
          var name = cfg.file + '_' + isoDay(cfg.updated) + '.' + fmt;
          return (fmt === 'csv' ? Promise.resolve(toCSV(cfg, charts)) : toXLSX(cfg, charts)).then(function (blob) { save(blob, name); });
        }).catch(function (err) {
          console.error(err);
          alert(cfg.labels.error);
        }).then(function () {
          menu.classList.remove('is-busy');
          btn.removeAttribute('aria-busy');
          menu.open = false;
        });
      });
    });
  });
})();
