/* ============================================
   MusicMetrics - Main JavaScript
   Theme toggle, mobile menu, language switcher
   ============================================ */

(function () {
  'use strict';

  // --- Theme Toggle ---
  const themeToggle = document.getElementById('themeToggle');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)');

  function setTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('mm-theme', theme);
  }

  function getTheme() {
    return localStorage.getItem('mm-theme') || (prefersDark.matches ? 'dark' : 'light');
  }

  // Apply saved theme on load
  setTheme(getTheme());

  if (themeToggle) {
    themeToggle.addEventListener('click', function () {
      const current = document.documentElement.getAttribute('data-theme');
      setTheme(current === 'dark' ? 'light' : 'dark');
    });
  }

  prefersDark.addEventListener('change', function (e) {
    if (!localStorage.getItem('mm-theme')) {
      setTheme(e.matches ? 'dark' : 'light');
    }
  });

  // --- Mobile Menu Toggle ---
  const menuToggle = document.getElementById('menuToggle');
  const nav = document.getElementById('nav');

  if (menuToggle && nav) {
    menuToggle.addEventListener('click', function () {
      const expanded = this.getAttribute('aria-expanded') === 'true';
      this.setAttribute('aria-expanded', !expanded);
      nav.classList.toggle('open');
    });

    // Close menu on link click
    nav.querySelectorAll('a').forEach(function (link) {
      link.addEventListener('click', function () {
        menuToggle.setAttribute('aria-expanded', 'false');
        nav.classList.remove('open');
      });
    });
  }

  // --- Language Switcher ---
  const langSwitcher = document.getElementById('langSwitcher');
  if (langSwitcher) {
    const btn = langSwitcher.querySelector('.lang-switcher__btn');
    const list = langSwitcher.querySelector('.lang-switcher__list');

    btn.addEventListener('click', function () {
      const expanded = this.getAttribute('aria-expanded') === 'true';
      this.setAttribute('aria-expanded', !expanded);
      list.classList.toggle('open');
    });

    // Close on outside click
    document.addEventListener('click', function (e) {
      if (!langSwitcher.contains(e.target)) {
        btn.setAttribute('aria-expanded', 'false');
        list.classList.remove('open');
      }
    });
  }

  // --- Number Formatting ---
  window.mmFormatNumber = function (num) {
    if (num >= 1e9) return (num / 1e9).toFixed(1) + 'B';
    if (num >= 1e6) return (num / 1e6).toFixed(1) + 'M';
    if (num >= 1e3) return (num / 1e3).toFixed(1) + 'K';
    return num.toString();
  };

  // --- Table Sort ---
  document.querySelectorAll('.chart-table th[data-sort]').forEach(function (th) {
    th.style.cursor = 'pointer';
    th.addEventListener('click', function () {
      var table = this.closest('table');
      var tbody = table.querySelector('tbody');
      var rows = Array.from(tbody.querySelectorAll('tr'));
      var col = Array.from(this.parentNode.children).indexOf(this);
      var dir = this.dataset.sortDir === 'asc' ? 'desc' : 'asc';

      // Reset all headers
      this.parentNode.querySelectorAll('th').forEach(function (h) { h.dataset.sortDir = ''; });
      this.dataset.sortDir = dir;

      rows.sort(function (a, b) {
        var aVal = a.children[col].textContent.trim();
        var bVal = b.children[col].textContent.trim();
        var aNum = parseFloat(aVal.replace(/[^0-9.-]/g, ''));
        var bNum = parseFloat(bVal.replace(/[^0-9.-]/g, ''));

        if (!isNaN(aNum) && !isNaN(bNum)) {
          return dir === 'asc' ? aNum - bNum : bNum - aNum;
        }
        return dir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      });

      rows.forEach(function (row) { tbody.appendChild(row); });
    });
  });
})();
