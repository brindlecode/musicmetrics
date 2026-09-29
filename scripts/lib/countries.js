'use strict';
/**
 * Country configuration. Names are generated for every site language with
 * Intl.DisplayNames, so nothing needs to be translated by hand.
 */

// Market weight used by the MusicMetrics Global score (roughly: size of the
// recorded-music market). 3 = largest markets, 1 = everything else.
const WEIGHTS = {
  us: 3, jp: 2.5, gb: 2.5, de: 2.5, fr: 2, kr: 2, cn: 2, br: 2, ca: 2, au: 2,
  mx: 1.6, it: 1.6, es: 1.6, nl: 1.5, se: 1.4, in: 1.6, id: 1.4, ph: 1.3, tr: 1.4, pl: 1.3,
};

// YouTube Data API: regions queried for trending music (1 quota unit each).
const YOUTUBE = [
  'us', 'gb', 'br', 'de', 'fr', 'jp', 'mx', 'tr', 'es', 'it', 'kr', 'in', 'ar', 'co', 'au', 'ca',
  'nl', 'se', 'pl', 'id', 'ph', 'th', 'ng', 'za', 'eg', 'sa', 'ae', 'at', 'ch', 'dk', 'fi', 'gr',
  'ie', 'il', 'no', 'nz', 'ro', 'cl', 'hu', 'cz', 'bg', 'hr', 'sk', 'rs', 'ua', 'pe', 'ec', 'sg',
  'my', 'tw', 'hk', 'vn', 'pt', 'be', 'ke', 'ma', 'pk', 'bd', 'dz', 'gt', 'do', 'bo', 'py', 'uy',
  'cr', 'pa', 'sv', 'hn', 'ni', 'lt', 'lv', 'ee', 'si', 'is', 'lu', 'jo', 'lb', 'kw', 'qa', 'om',
  'bh', 'tn', 'gh', 'tz', 'ug', 'lk', 'np', 'kz', 'az', 'ge', 'by',
];

// Apple Music / iTunes storefronts (public RSS feeds). Storefronts without a
// feed simply return nothing and are skipped.
const APPLE = [
  'ae', 'ag', 'ai', 'am', 'ao', 'ar', 'at', 'au', 'az', 'ba', 'bb', 'be', 'bf', 'bg', 'bh', 'bj', 'bm', 'bn', 'bo', 'br',
  'bs', 'bt', 'bw', 'by', 'bz', 'ca', 'cd', 'cg', 'ch', 'ci', 'cl', 'cm', 'cn', 'co', 'cr', 'cv', 'cy', 'cz', 'de', 'dk',
  'dm', 'do', 'dz', 'ec', 'ee', 'eg', 'es', 'fi', 'fj', 'fm', 'fr', 'ga', 'gb', 'gd', 'ge', 'gh', 'gm', 'gr', 'gt', 'gw',
  'gy', 'hk', 'hn', 'hr', 'hu', 'id', 'ie', 'il', 'in', 'iq', 'is', 'it', 'jm', 'jo', 'jp', 'ke', 'kg', 'kh', 'kn', 'kr',
  'kw', 'ky', 'kz', 'la', 'lb', 'lc', 'lk', 'lr', 'lt', 'lu', 'lv', 'ly', 'ma', 'md', 'me', 'mg', 'mk', 'ml', 'mm', 'mn',
  'mo', 'mr', 'ms', 'mt', 'mu', 'mv', 'mw', 'mx', 'my', 'mz', 'na', 'ne', 'ng', 'ni', 'nl', 'no', 'np', 'nz', 'om', 'pa',
  'pe', 'pg', 'ph', 'pk', 'pl', 'pt', 'pw', 'py', 'qa', 'ro', 'rs', 'ru', 'rw', 'sa', 'sb', 'sc', 'se', 'sg', 'si', 'sk',
  'sl', 'sn', 'sr', 'sv', 'sz', 'tc', 'td', 'th', 'tj', 'tm', 'tn', 'to', 'tr', 'tt', 'tw', 'tz', 'ua', 'ug', 'us', 'uy',
  'uz', 'vc', 've', 'vg', 'vn', 'vu', 'xk', 'ye', 'za', 'zm', 'zw',
];

// Featured on the home page country grid.
const FEATURED = ['us', 'gb', 'tr', 'de', 'fr', 'br', 'mx', 'es', 'it', 'jp', 'kr', 'in', 'id', 'ph', 'ca', 'au'];

const LANGS = ['en', 'tr', 'es', 'pt', 'de', 'fr', 'ja'];

function flag(cc) {
  if (!/^[a-z]{2}$/.test(cc)) return '🌐';
  return String.fromCodePoint(...cc.toUpperCase().split('').map((c) => 0x1f1a5 + c.charCodeAt(0)));
}

const displayNames = Object.fromEntries(LANGS.map((l) => [l, new Intl.DisplayNames([l], { type: 'region' })]));

function names(cc) {
  const out = {};
  for (const l of LANGS) {
    try { out[l] = displayNames[l].of(cc.toUpperCase()); } catch { out[l] = cc.toUpperCase(); }
  }
  return out;
}

function weight(cc) {
  return WEIGHTS[cc] || 1;
}

// English country name -> code (used to map Deezer "Top <Country>" playlists).
const EN_NAME_TO_CC = (() => {
  const map = {};
  const dn = new Intl.DisplayNames(['en'], { type: 'region' });
  // Deprecated / pseudo codes that Intl still names (e.g. DD = East Germany would shadow DE).
  const skip = new Set(['AN', 'BU', 'CS', 'DD', 'EU', 'EZ', 'FX', 'NT', 'QO', 'SU', 'TP', 'UN', 'XA', 'XB', 'YU', 'ZR', 'ZZ', 'UK']);
  for (let a = 65; a <= 90; a++) for (let b = 65; b <= 90; b++) {
    const code = String.fromCharCode(a, b);
    if (skip.has(code)) continue;
    try {
      const n = dn.of(code);
      if (n && n !== code && !map[n.toLowerCase()]) map[n.toLowerCase()] = code.toLowerCase();
    } catch { /* invalid code */ }
  }
  Object.assign(map, {
    usa: 'us', 'united states of america': 'us', uk: 'gb', 'great britain': 'gb', 'south korea': 'kr', korea: 'kr',
    'czech republic': 'cz', czechia: 'cz', 'ivory coast': 'ci', "côte d'ivoire": 'ci', turkey: 'tr', 'türkiye': 'tr',
    'hong kong': 'hk', 'the netherlands': 'nl', holland: 'nl', 'uae': 'ae', 'drc': 'cd', russia: 'ru', vietnam: 'vn',
  });
  return map;
})();

module.exports = { WEIGHTS, YOUTUBE, APPLE, FEATURED, LANGS, flag, names, weight, EN_NAME_TO_CC };
