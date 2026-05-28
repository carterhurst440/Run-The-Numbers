/*!
 * bloom-weather-cards.js — full-bleed 5:7 weather cards.
 *
 * Vanilla port of the source weather-card HTML mockups. Each card is a
 * 100×140 viewBox SVG with:
 *   - sky gradient + halftone dither
 *   - one of 5 scene archetypes (cold_wind / humid_breeze / morning_dew
 *     / heavy_rain / heat_wave)
 *   - riso misregistration + ink-edge displacement + light-leak / grain
 *   - top: title + tag (white, drop-shadow)
 *   - bottom white panel with per-flower effects (numeric delta colored
 *     gain / loss + a flower-accent dot)
 *
 * Our DB has 15 cards mapped onto the 5 scene archetypes via the
 * CARD_VARIANT table at the bottom — each card carries its own
 * palette / accent / tag but shares one of the 5 scene draw fns.
 *
 * API:
 *   window.BloomWeatherCards = {
 *     renderCard(cardSlug, displayName, effects, container, opts) → void,
 *     buildCardHTML(cardSlug, displayName, effects, opts)         → string
 *   };
 *
 *   effects is { flower_slug: numeric_delta } (e.g. { hibiscus: 14, ... })
 *   opts:
 *     - mode:  'deck' | 'draw' | 'history'   (default 'draw')
 *     - count: number (deck preview only)
 *     - candidates: [{flower, accent_color}] — used to dot the effect rows
 */
(function (global) {
  'use strict';

  // ── Color helpers ───────────────────────────────────────────────
  function hexToRgb(h) {
    var s = h.replace('#', '');
    return [parseInt(s.slice(0,2),16), parseInt(s.slice(2,4),16), parseInt(s.slice(4,6),16)];
  }
  function rgbToHex(r,g,b) {
    var to = function (v) { return Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0'); };
    return '#' + to(r) + to(g) + to(b);
  }
  function mixHex(a, b, t) {
    var A = hexToRgb(a), B = hexToRgb(b);
    return rgbToHex(A[0]+(B[0]-A[0])*t, A[1]+(B[1]-A[1])*t, A[2]+(B[2]-A[2])*t);
  }
  function shade(h, t) {
    return t < 0 ? mixHex(h, '#000000', -t) : mixHex(h, '#ffffff', t);
  }

  // ── Shared scene helpers ────────────────────────────────────────
  function weatherSkyGradient(r) {
    var mid = mixHex(r.palette[0], r.palette[1], 0.55);
    return '<defs><linearGradient id="bwc-sky-' + r.uid + '" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="' + r.palette[0] + '"/>' +
      '<stop offset="0.55" stop-color="' + mid + '"/>' +
      '<stop offset="1" stop-color="' + r.palette[1] + '"/>' +
      '</linearGradient></defs>' +
      '<rect width="100" height="140" fill="url(#bwc-sky-' + r.uid + ')"/>';
  }

  function weatherHalftone(r) {
    return '<defs>' +
      '<pattern id="bwc-ht-a-' + r.uid + '" width="2.4" height="2.4" patternUnits="userSpaceOnUse">' +
        '<circle cx="1.2" cy="1.2" r="0.42" fill="' + r.accent + '"/></pattern>' +
      '<pattern id="bwc-ht-b-' + r.uid + '" width="1.6" height="1.6" patternUnits="userSpaceOnUse" patternTransform="translate(0.8,0.8)">' +
        '<circle cx="0.8" cy="0.8" r="0.22" fill="' + r.accent + '"/></pattern>' +
      '<linearGradient id="bwc-ht-fade-' + r.uid + '" x1="0" y1="0" x2="0" y2="1">' +
        '<stop offset="0" stop-color="#fff" stop-opacity="0"/>' +
        '<stop offset="0.30" stop-color="#fff" stop-opacity="0.45"/>' +
        '<stop offset="0.65" stop-color="#fff" stop-opacity="0.18"/>' +
        '<stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>' +
      '<mask id="bwc-ht-mask-' + r.uid + '"><rect width="100" height="100" fill="url(#bwc-ht-fade-' + r.uid + ')"/></mask>' +
      '</defs>' +
      '<g mask="url(#bwc-ht-mask-' + r.uid + ')" style="mix-blend-mode: multiply;">' +
      '<rect x="0" y="5" width="100" height="50" fill="url(#bwc-ht-a-' + r.uid + ')" opacity="0.55"/>' +
      '<rect x="0" y="40" width="100" height="55" fill="url(#bwc-ht-b-' + r.uid + ')" opacity="0.40"/></g>';
  }

  function weatherSun(r, sx, sy, sr, fill) {
    return '<defs><radialGradient id="bwc-halo-' + r.uid + '" cx="50%" cy="50%" r="50%">' +
      '<stop offset="0" stop-color="' + fill + '" stop-opacity="0.55"/>' +
      '<stop offset="0.45" stop-color="' + fill + '" stop-opacity="0.18"/>' +
      '<stop offset="1" stop-color="' + fill + '" stop-opacity="0"/></radialGradient></defs>' +
      '<circle cx="' + sx + '" cy="' + sy + '" r="' + (sr * 3.6).toFixed(2) + '" fill="url(#bwc-halo-' + r.uid + ')"/>' +
      '<circle cx="' + sx + '" cy="' + sy + '" r="' + sr + '" fill="' + fill + '"/>' +
      '<circle cx="' + (sx - sr * 0.30).toFixed(2) + '" cy="' + (sy - sr * 0.30).toFixed(2) +
      '" r="' + (sr * 0.55).toFixed(2) + '" fill="' + shade(fill, 0.18) + '" opacity="0.55"/>';
  }

  // ── 5 scene archetypes ─────────────────────────────────────────
  function sceneColdWind(r) {
    var s = '';
    s += weatherSun(r, 76, 24, 7, '#f0eadf');
    s += '<g opacity="0.85">';
    for (var i = 0; i < 32; i++) {
      var x = (i * 17.3 + 7) % 100;
      var y = ((i * 11) % 56) + 4;
      var r2 = 0.25 + ((i * 5) % 4) * 0.10;
      s += '<circle cx="' + x.toFixed(2) + '" cy="' + y.toFixed(2) + '" r="' + r2.toFixed(2) + '" fill="#f0eadf"/>';
    }
    s += '</g><g stroke="#f0eadf" stroke-width="0.35" stroke-linecap="round" opacity="0.55">';
    for (var j = 0; j < 16; j++) {
      var x1 = (j * 14 - 12) % 110;
      var y1 = ((j * 7) % 55) + 8;
      var len = 8 + (j % 5) * 4;
      s += '<line x1="' + x1.toFixed(2) + '" y1="' + y1.toFixed(2) + '" x2="' + (x1 + len * 0.92).toFixed(2) + '" y2="' + (y1 + len * 0.30).toFixed(2) + '"/>';
    }
    s += '</g><g stroke="#f0eadf" stroke-width="0.65" stroke-linecap="round" opacity="0.75">';
    s += '<path d="M 5 38 Q 28 32 55 36 Q 78 40 95 32" fill="none"/>';
    s += '<path d="M 0 56 Q 30 50 60 56 Q 82 62 100 54" fill="none"/></g>';
    s += '<rect x="0" y="66" width="100" height="4" fill="#aab6c8" opacity="0.85"/>';
    return s;
  }

  function sceneHumidBreeze(r) {
    function cloud(x, y, w, col, shadeCol) {
      var h = w * 0.20;
      var c = '<g opacity="0.95">';
      c += '<ellipse cx="' + (x - w*0.10) + '" cy="' + (y + h*0.30) + '" rx="' + (w*0.60) + '" ry="' + (h*0.95) + '" fill="' + shadeCol + '" opacity="0.55"/>';
      c += '<ellipse cx="' + (x - w*0.35) + '" cy="' + (y + h*0.05) + '" rx="' + (w*0.28) + '" ry="' + (h*0.95) + '" fill="' + col + '"/>';
      c += '<ellipse cx="' + (x - w*0.10) + '" cy="' + (y - h*0.20) + '" rx="' + (w*0.42) + '" ry="' + (h*1.10) + '" fill="' + col + '"/>';
      c += '<ellipse cx="' + (x + w*0.18) + '" cy="' + (y - h*0.05) + '" rx="' + (w*0.32) + '" ry="' + (h*1.00) + '" fill="' + col + '"/>';
      c += '<ellipse cx="' + (x + w*0.40) + '" cy="' + (y + h*0.10) + '" rx="' + (w*0.22) + '" ry="' + (h*0.80) + '" fill="' + col + '"/></g>';
      return c;
    }
    var s = weatherSun(r, 78, 18, 7, '#f4e6c2');
    s += cloud(22, 12, 18, '#fffdf2', '#c8a07c');
    s += cloud(60, 30, 22, '#fffdf2', '#c8a07c');
    s += cloud(18, 48, 16, '#fffdf2', '#c8a07c');
    s += '<rect x="0" y="42" width="100" height="8" fill="#f4e6c2" opacity="0.32"/>';
    s += '<path d="M 5 60 Q 30 56 55 60 Q 80 64 98 58" stroke="' + r.accent + '" stroke-width="0.30" fill="none" opacity="0.5"/>';
    s += '<rect x="0" y="66" width="100" height="4" fill="' + r.palette[0] + '"/>';
    s += '<path d="M 0 67 Q 30 68 60 67 Q 80 66 100 67" stroke="#fff" stroke-width="0.30" fill="none" opacity="0.65"/>';
    return s;
  }

  function sceneMorningDew(r) {
    var s = '<rect x="0" y="36" width="100" height="14" fill="#f0e0c0" opacity="0.50"/>';
    s += weatherSun(r, 50, 22, 10, '#f0d68a');
    s += '<path d="M 0 50 Q 20 44 40 48 Q 60 52 80 46 Q 95 42 100 46 L 100 54 L 0 54 Z" fill="#5e7038" opacity="0.40"/>';
    s += '<rect x="0" y="48" width="100" height="8" fill="#dde6c0" opacity="0.65"/>';
    s += '<g>';
    var dewSpots = [[12,60,1.6],[25,64,2.0],[38,60,1.5],[50,65,2.1],[62,62,1.7],[74,65,1.9],[85,61,1.6],[92,64,1.4]];
    dewSpots.forEach(function (d) {
      var x = d[0], y = d[1], r2 = d[2];
      s += '<ellipse cx="' + x + '" cy="' + y + '" rx="' + r2 + '" ry="' + (r2 * 1.1).toFixed(2) + '" fill="#a8c8b0" opacity="0.85" stroke="#3a5040" stroke-width="0.15"/>';
      s += '<ellipse cx="' + (x - r2 * 0.35).toFixed(2) + '" cy="' + (y - r2 * 0.45).toFixed(2) + '" rx="' + (r2 * 0.30).toFixed(2) + '" ry="' + (r2 * 0.40).toFixed(2) + '" fill="#fff" opacity="0.85"/>';
    });
    s += '</g><g stroke="#5e7038" stroke-width="0.30" stroke-linecap="round" opacity="0.65" fill="none">';
    for (var i = 0; i < 22; i++) {
      var x = (i * 4.7 + 2) % 100;
      var baseY = 70;
      var tipY = baseY - (3 + (i % 4) * 1.4);
      var tipX = x + ((i % 2 ? 1 : -1) * 0.6);
      s += '<path d="M ' + x + ' ' + baseY + ' Q ' + ((x + tipX) / 2) + ' ' + ((baseY + tipY) / 2) + ' ' + tipX + ' ' + tipY + '"/>';
    }
    s += '</g>';
    return s;
  }

  function sceneHeavyRain(r) {
    var s = '<rect x="0" y="2" width="100" height="18" fill="#1a2840" opacity="0.70"/>';
    s += '<g fill="#1a2840" opacity="0.92">';
    s += '<ellipse cx="15" cy="14" rx="20" ry="9"/>';
    s += '<ellipse cx="40" cy="10" rx="18" ry="8"/>';
    s += '<ellipse cx="62" cy="12" rx="22" ry="10"/>';
    s += '<ellipse cx="85" cy="14" rx="16" ry="8"/></g>';
    s += '<g fill="#3a4e68" opacity="0.7">';
    s += '<ellipse cx="22" cy="22" rx="16" ry="5"/>';
    s += '<ellipse cx="58" cy="22" rx="20" ry="5"/>';
    s += '<ellipse cx="88" cy="22" rx="12" ry="4"/></g>';
    s += '<rect x="0" y="24" width="100" height="1.5" fill="#c8d4dc" opacity="0.50"/>';
    s += '<g stroke="#c8d4dc" stroke-width="0.35" stroke-linecap="round" opacity="0.60">';
    for (var i = 0; i < 70; i++) {
      var x1 = ((i * 9.3) % 110) - 5;
      var y1 = ((i * 7.1) % 38) + 26;
      var len = 4 + (i % 3) * 1.2;
      s += '<line x1="' + x1.toFixed(2) + '" y1="' + y1.toFixed(2) + '" x2="' + (x1 - len * 0.30).toFixed(2) + '" y2="' + (y1 + len).toFixed(2) + '"/>';
    }
    s += '</g>';
    s += '<path d="M 78 22 L 75 32 L 79 32 L 74 44" stroke="#f0eadf" stroke-width="0.55" fill="none" stroke-linecap="round" opacity="0.90"/>';
    s += '<path d="M 78 22 L 75 32 L 79 32 L 74 44" stroke="#f0eadf" stroke-width="1.4" fill="none" stroke-linecap="round" opacity="0.20"/>';
    s += '<rect x="0" y="66" width="100" height="4" fill="#566e88"/>';
    s += '<path d="M 0 67 Q 30 68 60 67 Q 80 66 100 67" stroke="#c8d4dc" stroke-width="0.30" fill="none" opacity="0.55"/>';
    return s;
  }

  function sceneHeatWave(r) {
    var s = weatherSun(r, 50, 26, 12, '#fbb16c');
    s += '<g stroke="#fbb16c" stroke-width="0.55" stroke-linecap="round" opacity="0.55">';
    for (var i = 0; i < 12; i++) {
      var a = (i / 12) * 2 * Math.PI;
      var r1 = 18, r2 = 26;
      var x1 = 50 + Math.cos(a) * r1, y1 = 26 + Math.sin(a) * r1;
      var x2 = 50 + Math.cos(a) * r2, y2 = 26 + Math.sin(a) * r2;
      s += '<line x1="' + x1.toFixed(2) + '" y1="' + y1.toFixed(2) + '" x2="' + x2.toFixed(2) + '" y2="' + y2.toFixed(2) + '"/>';
    }
    s += '</g><g stroke="#f6d6a8" stroke-width="0.40" fill="none" opacity="0.65">';
    for (var j = 0; j < 4; j++) {
      var y = 48 + j * 5;
      var d = 'M 0 ' + y;
      for (var k = 0; k <= 10; k++) {
        var cx = k * 10;
        var cy = y + (k % 2 ? -1.2 : 1.2);
        d += ' Q ' + (cx - 5).toFixed(2) + ' ' + cy.toFixed(2) + ' ' + cx + ' ' + y;
      }
      s += '<path d="' + d + '"/>';
    }
    s += '</g>';
    s += '<rect x="0" y="66" width="100" height="4" fill="#c4642a"/>';
    s += '<g stroke="#5a2010" stroke-width="0.25" stroke-linecap="round" opacity="0.65" fill="none">';
    s += '<path d="M 14 66 L 16 70"/><path d="M 38 66 L 36 70"/><path d="M 60 66 L 62 70"/><path d="M 82 66 L 80 70"/></g>';
    return s;
  }

  var SCENES = {
    cold_wind:    sceneColdWind,
    humid_breeze: sceneHumidBreeze,
    morning_dew:  sceneMorningDew,
    heavy_rain:   sceneHeavyRain,
    heat_wave:    sceneHeatWave,
  };

  // ── Card variants: DB card slug → scene + palette + accent + tag ──
  // Every card uses one of the 5 scenes; palettes pulled from the
  // source mockups (with a couple of small variations).
  // The 5 source mockup cards — exact palettes / accents from the
  // source HTML so cold_wind / humid_breeze / morning_dew / heavy_rain
  // / heat_wave render identically to the reference mockups.
  var CARD_VARIANT = {
    cold_wind:          { scene: 'cold_wind',    palette: ['#7a92b8','#a8b8d0','#d0d8e2','#f0eadf'], accent: '#3d4d6a', tag: 'sharp · arctic · dry' },
    humid_breeze:       { scene: 'humid_breeze', palette: ['#7ac8c0','#a8e0d0','#e6d9a8','#f4e6c2'], accent: '#1d5e6e', tag: 'warm · saline · soft' },
    morning_dew:        { scene: 'morning_dew',  palette: ['#c8d8a8','#dde6c0','#f0e0c0','#f6ecd6'], accent: '#5e7038', tag: 'soft · golden · still' },
    heavy_rain:         { scene: 'heavy_rain',   palette: ['#3a4e68','#566e88','#7e95ab','#c8d4dc'], accent: '#1a2840', tag: 'cold · grey · drenched' },
    heat_wave:          { scene: 'heat_wave',    palette: ['#e85d2b','#f08240','#fbb16c','#f6d6a8'], accent: '#7d2410', tag: 'searing · ember · dry' },

    // Legacy seed slugs that pre-date the rename. Each routes to the
    // closest of the 5 archetypes with its own per-family palette.
    sunny_day:          { scene: 'heat_wave',    palette: ['#f0a040','#f6c270','#fbd998','#f6e2c2'], accent: '#9c4810', tag: 'bright · clear · warm' },
    dry_heat:           { scene: 'heat_wave',    palette: ['#e85d2b','#f08240','#fbb16c','#f6d6a8'], accent: '#7d2410', tag: 'arid · ember · still' },
    drought:            { scene: 'heat_wave',    palette: ['#d4a020','#e2b950','#eecf80','#f6e0a8'], accent: '#7a4810', tag: 'cracked · dry · long' },
    gentle_rain:        { scene: 'heavy_rain',   palette: ['#7a96b4','#a8c0d4','#cad8e2','#e6edf0'], accent: '#3a5a7a', tag: 'soft · grey · cool' },
    thunderstorm:       { scene: 'heavy_rain',   palette: ['#3a4e68','#566e88','#7e95ab','#c8d4dc'], accent: '#1a2840', tag: 'crackling · dark · loud' },
    flooding:           { scene: 'heavy_rain',   palette: ['#4a6a8a','#6e8aa6','#a0b8cc','#d0d8e0'], accent: '#1a3854', tag: 'submerged · cold · heavy' },
    hailstorm:          { scene: 'heavy_rain',   palette: ['#5e6e88','#8090a8','#b4becc','#d4dae2'], accent: '#2a3a54', tag: 'ice · drumming · sharp' },
    late_freeze:        { scene: 'cold_wind',    palette: ['#7a92b8','#a8b8d0','#d0d8e2','#f0eadf'], accent: '#3d4d6a', tag: 'frost · still · pale' },
    cool_breeze:        { scene: 'cold_wind',    palette: ['#88a0b8','#b0c0d0','#d4dde6','#eef2e8'], accent: '#3a4d68', tag: 'crisp · clean · light' },
    windstorm:          { scene: 'cold_wind',    palette: ['#6a7c98','#8e9eb4','#b4becc','#d6dae2'], accent: '#2a3a54', tag: 'gusting · whipped · loud' },
    tropical_humidity:  { scene: 'humid_breeze', palette: ['#7ac8c0','#a8e0d0','#e6d9a8','#f4e6c2'], accent: '#1d5e6e', tag: 'thick · warm · saline' },
    overcast:           { scene: 'humid_breeze', palette: ['#8aa0a8','#aebcc0','#c8d0d2','#e6e8e6'], accent: '#3a5560', tag: 'flat · grey · still' },
    perfect_conditions: { scene: 'morning_dew',  palette: ['#d4e6a0','#e8eebc','#f4ecc8','#f8f0d8'], accent: '#3e5e2a', tag: 'ideal · balanced · clear' },
  };

  function getVariant(slug) {
    return CARD_VARIANT[slug] || {
      scene: 'morning_dew',
      palette: ['#888','#a0a0a0','#c0c0c0','#e0e0e0'],
      accent: '#444',
      tag: 'weather event',
    };
  }

  // ── Shared filter defs ──────────────────────────────────────────
  var GRAIN_FILTER =
    '<defs>' +
    '<filter id="bwc-grain" x="0" y="0" width="100%" height="100%">' +
      '<feTurbulence type="fractalNoise" baseFrequency="3.0" numOctaves="2" seed="7"/>' +
      '<feColorMatrix values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.55 0"/>' +
      '<feComposite in2="SourceGraphic" operator="in"/>' +
      '<feBlend in="SourceGraphic" mode="multiply"/></filter>' +
    '<filter id="bwc-grain-coarse" x="0" y="0" width="100%" height="100%">' +
      '<feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="2" seed="11"/>' +
      '<feColorMatrix values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.40 -0.16"/>' +
      '<feComposite in2="SourceGraphic" operator="in"/></filter>' +
    '<radialGradient id="bwc-vignette" cx="50%" cy="50%" r="75%">' +
      '<stop offset="0.55" stop-color="#000" stop-opacity="0"/>' +
      '<stop offset="1" stop-color="#000" stop-opacity="0.22"/></radialGradient>' +
    '<filter id="bwc-rough" x="-5%" y="-5%" width="110%" height="110%">' +
      '<feTurbulence type="fractalNoise" baseFrequency="0.7" numOctaves="2" seed="13" result="rN"/>' +
      '<feDisplacementMap in="SourceGraphic" in2="rN" scale="0.55" xChannelSelector="R" yChannelSelector="G"/></filter>' +
    '<radialGradient id="bwc-lightleak" cx="85%" cy="10%" r="55%">' +
      '<stop offset="0" stop-color="#ffd9a6" stop-opacity="0.30"/>' +
      '<stop offset="0.6" stop-color="#ffd9a6" stop-opacity="0.05"/>' +
      '<stop offset="1" stop-color="#ffd9a6" stop-opacity="0"/></radialGradient>' +
    '</defs>';

  function buildScene(r) {
    var s = '';
    s += weatherSkyGradient(r);
    s += weatherHalftone(r);
    var fn = SCENES[r.scene] || SCENES.morning_dew;
    s += fn(r);
    return s;
  }

  function chrome(r, displayName) {
    var titleId = 'bwc-title-shadow-' + r.uid;
    return '' +
      '<defs><filter id="' + titleId + '" x="-10%" y="-10%" width="120%" height="120%">' +
        '<feDropShadow dx="0" dy="0.6" stdDeviation="0.5" flood-color="#000" flood-opacity="0.55"/></filter></defs>' +
      '<g font-family="JetBrains Mono, monospace" fill="#ffffff" filter="url(#' + titleId + ')">' +
        '<text x="50" y="15" text-anchor="middle" font-size="8" font-weight="800" letter-spacing="0.02">' +
          (displayName || '').toUpperCase() + '</text>' +
        '<text x="50" y="22" text-anchor="middle" font-size="3.0" letter-spacing="0.28" opacity="0.92">' +
          (r.tag || '').toUpperCase() + '</text>' +
      '</g>';
  }

  // White panel + per-flower effects strip. flowerColors is
  // { flower_slug: '#rrggbb' } so the dot matches each species accent.
  function effectsPanel(r, effects, flowerColors) {
    var panel = '<rect x="0" y="70" width="100" height="70" fill="#ffffff"/>';
    var rows = Object.keys(effects || {})
      .filter(function (slug) { return Number(effects[slug]) !== 0; })
      .sort(function (a, b) { return Number(effects[b]) - Number(effects[a]); });

    // Cap at 5 rows; rows centered in panel y=70..138.
    var n = Math.min(5, rows.length);
    var startY = 80;
    var rowH   = (n <= 3 ? 18 : n === 4 ? 14 : 12);
    var strip  = '<g>';
    for (var i = 0; i < n; i++) {
      var slug  = rows[i];
      var delta = Number(effects[slug]);
      var sign  = delta > 0 ? '+' : '';
      var color = delta > 0 ? '#1ec53d' : '#ef3838';
      var dot   = flowerColors[slug] || r.accent;
      var rowY  = startY + i * rowH;
      strip += '<circle cx="10" cy="' + (rowY - 1.5).toFixed(1) + '" r="2.4" fill="' + dot + '"/>';
      strip += '<text x="18" y="' + (rowY + 1.5).toFixed(1) +
        '" font-family="JetBrains Mono, monospace" font-size="6.0" font-weight="800" letter-spacing="0.02" fill="#2a2620">' +
        slug.replace(/_/g, ' ').toUpperCase() + '</text>';
      strip += '<text x="95" y="' + (rowY + 1.5).toFixed(1) +
        '" text-anchor="end" font-family="JetBrains Mono, monospace" font-size="7.0" font-weight="800" fill="' + color + '">' +
        sign + delta + '</text>';
    }
    strip += '</g>';
    return panel + strip;
  }

  var _uid = 0;
  function buildCardHTML(cardSlug, displayName, effects, opts) {
    opts = opts || {};
    var v = getVariant(cardSlug);
    var r = {
      uid:     'c' + (++_uid),
      scene:   v.scene,
      palette: v.palette,
      accent:  v.accent,
      tag:     v.tag,
    };
    var flowerColors = {};
    (opts.candidates || []).forEach(function (c) {
      flowerColors[c.flower] = c.accent_color || '#888';
    });
    var sceneSvg = buildScene(r);
    var flattenId = 'bwc-flatten-' + r.uid;
    var flatten = '<defs><filter id="' + flattenId + '" x="-10%" y="-10%" width="120%" height="120%">' +
      '<feFlood flood-color="' + r.accent + '" flood-opacity="1"/>' +
      '<feComposite in2="SourceGraphic" operator="in"/></filter></defs>';

    var mode = opts.mode || 'draw';
    // Always show the count badge in deck mode (even ×1) so every card
    // in the deck preview reads with the same chrome.
    var countBadge = (mode === 'deck' && Number(opts.count) > 0)
      ? '<div class="bwc-count">\u00D7' + Number(opts.count) + '</div>' : '';

    return '<div class="bwc-card is-' + mode + '" style="--bwc-accent:' + r.accent + '">' +
      countBadge +
      '<svg viewBox="0 0 100 140" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">' +
        GRAIN_FILTER + flatten +
        '<g filter="url(#' + flattenId + ')" transform="translate(0.7 0.35)" opacity="0.30" style="mix-blend-mode: multiply;">' + sceneSvg + '</g>' +
        '<g filter="url(#bwc-rough)">' + sceneSvg + '</g>' +
        '<rect width="100" height="140" fill="url(#bwc-lightleak)"/>' +
        '<rect width="100" height="140" opacity="0.12" filter="url(#bwc-grain-coarse)" fill="white"/>' +
        '<rect width="100" height="140" opacity="0.26" filter="url(#bwc-grain)" fill="white"/>' +
        '<rect width="100" height="140" fill="url(#bwc-vignette)"/>' +
        chrome(r, displayName) +
        effectsPanel(r, effects || {}, flowerColors) +
      '</svg></div>';
  }

  function renderCard(cardSlug, displayName, effects, container, opts) {
    if (!container) return;
    container.innerHTML = buildCardHTML(cardSlug, displayName, effects, opts);
  }

  global.BloomWeatherCards = {
    CARD_VARIANT: CARD_VARIANT,
    buildCardHTML: buildCardHTML,
    renderCard:    renderCard,
  };
})(typeof window !== 'undefined' ? window : this);
