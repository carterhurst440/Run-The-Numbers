/*!
 * bloom-region-cards.js — field-guide region cards (5 biomes).
 *
 * Vanilla port of the renderExportScene routine from the source HTML
 * mockups. Exposes:
 *
 *   window.BloomRegionCards = {
 *     REGIONS,                                  // raw region defs
 *     renderCard(regionDbSlug, container, opts) // mount one card
 *   };
 *
 * Caller maps the bloom DB region slug (desert, tundra, tropical_island,
 * rainforest, temperate_forest) to the bundle's id (desert, tundra,
 * tropical, rainforest, forest) — see DB_TO_BRC at the bottom.
 *
 * Markup uses the brc- prefixed classes from bloom-region-cards.css.
 */
(function (global) {
  'use strict';

  // ── Region palettes (4 colors each) ───────────────────────────────────
  //  Order: top sky, lower sky / blend, foreground hill, accent
  var REGIONS = [
    {
      id: 'tundra', name: 'TUNDRA', tag: 'cold · still · pale',
      palette: ['#a899c8', '#c8bae0', '#e8dff0', '#f6ecd6'],
      accent: '#4a3d6a',
      coords: '78°13\u2032N  16°02\u2032E',
      elev: '1840 m',
      cat: 'A-014',
      sun:  { x: 78, y: 38, r: 7, fill: '#f6ecd6' },
      flower: {
        common: 'ARCTIC POPPY', latin:  'Papaver radicatum',
        bloom:  'JUN — AUG', note: 'sun-tracking · high arctic',
        draw:   'arctic_poppy',
      },
    },
    {
      id: 'forest', name: 'TEMPERATE FOREST', tag: 'evergreen · mossy · still',
      palette: ['#7a9c7a', '#5a8060', '#3a5640', '#e6e1c8'],
      accent: '#1f3a25',
      coords: '41°12\u2032N  124°00\u2032W',
      elev: '420 m',
      cat: 'A-027',
      sun:  { x: 28, y: 32, r: 9, fill: '#e6e1c8' },
      flower: {
        common: 'BIGLEAF HYDRANGEA', latin:  'Hydrangea macrophylla',
        bloom:  'MAY — OCT', note: 'corymb cluster · pH-sensitive',
        draw:   'hydrangea',
      },
    },
    {
      id: 'tropical', name: 'TROPICAL', tag: 'humid · warm · breeze',
      palette: ['#7ac3c3', '#a8e0d5', '#e6c98a', '#f4e6c2'],
      accent: '#1d5e6e',
      coords: '08°24\u2032N  79°56\u2032W',
      elev: '012 m',
      cat: 'A-038',
      sun:  { x: 76, y: 30, r: 8, fill: '#f4e6c2' },
      flower: {
        common: 'RED HIBISCUS', latin:  'Hibiscus rosa-sinensis',
        bloom:  'YEAR-ROUND', note: 'staminal column · one-day bloom',
        draw:   'hibiscus',
      },
    },
    {
      id: 'desert', name: 'DESERT', tag: 'arid · ember · sunlit',
      palette: ['#e85d2b', '#f08240', '#fbb16c', '#f6d6a8'],
      accent: '#7d2410',
      coords: '32°08\u2032N  110°56\u2032W',
      elev: '780 m',
      cat: 'A-051',
      sun:  { x: 60, y: 42, r: 8, fill: '#c93a1f' },
      flower: {
        common: 'CACTUS BLOSSOM', latin:  'Echinopsis sp.',
        bloom:  'APR — JUN', note: 'nocturnal bloom · 24-hr cycle',
        draw:   'cactus_blossom',
      },
    },
    {
      id: 'rainforest', name: 'RAINFOREST', tag: 'lush · canopy · alive',
      palette: ['#c2dc62', '#8fb83c', '#3e7a3a', '#e6da8a'],
      accent: '#143a16',
      coords: '03°06\u2032S  60°02\u2032W',
      elev: '094 m',
      cat: 'A-063',
      sun:  { x: 72, y: 34, r: 9, fill: '#e6da8a' },
      flower: {
        common: 'MOTH ORCHID', latin:  'Phalaenopsis sp.',
        bloom:  'YEAR-ROUND', note: 'epiphyte · labellum + column',
        draw:   'orchid',
      },
    },
  ];

  // ── Color utilities ────────────────────────────────────────────────
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

  // ── Scene builders ────────────────────────────────────────────────
  function skyGradient(c1, c2, id, midStop) {
    var mid = midStop || mixHex(c1, c2, 0.55);
    return '<defs>' +
      '<linearGradient id="sky-' + id + '" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="' + c1 + '"/>' +
      '<stop offset="0.55" stop-color="' + mid + '"/>' +
      '<stop offset="1" stop-color="' + c2 + '"/>' +
      '</linearGradient></defs>' +
      '<rect width="100" height="75" fill="url(#sky-' + id + ')"/>';
  }

  function sunHalo(s, id, glowColor) {
    var g = glowColor || s.fill;
    return '<defs>' +
      '<radialGradient id="halo-' + id + '" cx="50%" cy="50%" r="50%">' +
      '<stop offset="0" stop-color="' + g + '" stop-opacity="0.55"/>' +
      '<stop offset="0.45" stop-color="' + g + '" stop-opacity="0.18"/>' +
      '<stop offset="1" stop-color="' + g + '" stop-opacity="0"/>' +
      '</radialGradient></defs>' +
      '<circle cx="' + s.x + '" cy="' + s.y + '" r="' + (s.r * 3.6).toFixed(2) + '" fill="url(#halo-' + id + ')"/>';
  }

  function hazeBand(y, h, color, opacity) {
    return '<rect x="0" y="' + y + '" width="100" height="' + h + '" fill="' + color + '" opacity="' + opacity + '"/>';
  }

  function birds(positions, color) {
    var s = '<g fill="none" stroke="' + color + '" stroke-width="0.22" stroke-linecap="round" opacity="0.65">';
    positions.forEach(function (p) {
      var x = p[0], y = p[1], w = p[2];
      s += '<path d="M ' + (x-w).toFixed(2) + ' ' + y.toFixed(2) +
           ' Q ' + (x-w*0.5).toFixed(2) + ' ' + (y-w*0.5).toFixed(2) +
           ' ' + x.toFixed(2) + ' ' + y.toFixed(2) +
           ' Q ' + (x+w*0.5).toFixed(2) + ' ' + (y-w*0.5).toFixed(2) +
           ' ' + (x+w).toFixed(2) + ' ' + y.toFixed(2) + '"/>';
    });
    return s + '</g>';
  }

  function groundDetail(yMin, yMax, color, count, seedOffset) {
    var s = '<g fill="' + color + '" opacity="0.65">';
    for (var i = 0; i < count; i++) {
      var k = i + (seedOffset || 0);
      var x = (k * 17.3 + 7) % 100;
      var y = yMin + ((k * 11.7) % (yMax - yMin));
      var w = 0.4 + ((k * 7) % 5) * 0.18;
      var h = w * (0.35 + ((k * 3) % 4) * 0.10);
      s += '<ellipse cx="' + x.toFixed(2) + '" cy="' + y.toFixed(2) +
           '" rx="' + w.toFixed(2) + '" ry="' + h.toFixed(2) + '"/>';
    }
    return s + '</g>';
  }

  function cloud(x, y, w, color, shadowColor) {
    var h = w * 0.20;
    var shadow = shadowColor || mixHex(color, '#7a7282', 0.35);
    var hilite = shade(color, 0.25);
    var s = '<g opacity="0.95">';
    s += '<ellipse cx="' + (x - w*0.10) + '" cy="' + (y + h*0.30) + '" rx="' + (w*0.60) + '" ry="' + (h*0.95) + '" fill="' + shadow + '" opacity="0.7"/>';
    s += '<ellipse cx="' + (x - w*0.35) + '" cy="' + (y + h*0.05) + '" rx="' + (w*0.28) + '" ry="' + (h*0.95) + '" fill="' + color + '"/>';
    s += '<ellipse cx="' + (x - w*0.10) + '" cy="' + (y - h*0.20) + '" rx="' + (w*0.42) + '" ry="' + (h*1.10) + '" fill="' + color + '"/>';
    s += '<ellipse cx="' + (x + w*0.18) + '" cy="' + (y - h*0.05) + '" rx="' + (w*0.32) + '" ry="' + (h*1.00) + '" fill="' + color + '"/>';
    s += '<ellipse cx="' + (x + w*0.40) + '" cy="' + (y + h*0.10) + '" rx="' + (w*0.22) + '" ry="' + (h*0.80) + '" fill="' + color + '"/>';
    s += '<ellipse cx="' + (x - w*0.12) + '" cy="' + (y - h*0.32) + '" rx="' + (w*0.18) + '" ry="' + (h*0.40) + '" fill="' + hilite + '" opacity="0.6"/>';
    return s + '</g>';
  }

  function sun(s) {
    return '<circle cx="' + s.x + '" cy="' + s.y + '" r="' + s.r + '" fill="' + s.fill + '"/>' +
           '<circle cx="' + (s.x - s.r * 0.30).toFixed(2) + '" cy="' + (s.y - s.r * 0.30).toFixed(2) +
           '" r="' + (s.r * 0.55).toFixed(2) + '" fill="' + shade(s.fill, 0.18) + '" opacity="0.55"/>';
  }

  function hill(yBase, amp, freq, color, phase) {
    if (phase == null) phase = 0;
    var d = 'M 0 75 L 0 ' + yBase;
    var steps = 24;
    for (var i = 0; i <= steps; i++) {
      var x = (i / steps) * 100;
      var y = yBase + Math.sin((x + phase) * freq) * amp;
      d += ' L ' + x.toFixed(2) + ' ' + y.toFixed(2);
    }
    d += ' L 100 75 Z';
    return '<path d="' + d + '" fill="' + color + '"/>';
  }

  function snowflakes(color) {
    var s = '<g opacity="0.65">';
    for (var i = 0; i < 30; i++) {
      var x = (i * 13 + 5) % 100;
      var y = (i * 7  + 3) % 55;
      var r = 0.35 + ((i * 31) % 5) * 0.08;
      s += '<circle cx="' + x + '" cy="' + y + '" r="' + r.toFixed(2) + '" fill="' + color + '"/>';
    }
    return s + '</g>';
  }

  function jaggedMountains(peaks, baseY, rockColor, snowColor) {
    var litRock    = shade(rockColor, 0.10);
    var shadowRock = shade(rockColor, -0.20);
    var snowShade  = mixHex(snowColor, rockColor, 0.30);

    var pts = ['0,' + baseY];
    peaks.forEach(function (p) {
      pts.push((p.x - p.w).toFixed(2) + ',' + baseY);
      pts.push(p.x.toFixed(2) + ',' + (baseY - p.h).toFixed(2));
      pts.push((p.x + p.w).toFixed(2) + ',' + baseY);
    });
    pts.push('100,' + baseY, '100,75', '0,75');
    var body = '<polygon points="' + pts.join(' ') + '" fill="' + shadowRock + '"/>';

    var detail = '';
    peaks.forEach(function (p) {
      var px = p.x, py = baseY - p.h;
      detail += '<polygon points="' + (px - p.w).toFixed(2) + ',' + baseY + ' ' + px.toFixed(2) + ',' + py.toFixed(2) + ' ' + px.toFixed(2) + ',' + baseY + '" fill="' + litRock + '"/>';
      detail += '<line x1="' + px.toFixed(2) + '" y1="' + py.toFixed(2) + '" x2="' + (px + p.w * 0.15).toFixed(2) + '" y2="' + baseY + '" stroke="' + shade(rockColor, -0.30) + '" stroke-width="0.18" opacity="0.6"/>';
      var capH = p.h * 0.34;
      var capW = p.w * 0.34;
      detail += '<polygon points="' + px + ',' + py.toFixed(2) + ' ' + (px - capW).toFixed(2) + ',' + (py + capH).toFixed(2) + ' ' + (px + capW * 0.3).toFixed(2) + ',' + (py + capH * 0.5).toFixed(2) + ' ' + (px + capW).toFixed(2) + ',' + (py + capH).toFixed(2) + '" fill="' + snowColor + '"/>';
      detail += '<polygon points="' + (px - capW * 0.5).toFixed(2) + ',' + (py + capH * 0.7).toFixed(2) + ' ' + (px - capW * 1.4).toFixed(2) + ',' + (py + capH * 2.6).toFixed(2) + ' ' + (px - capW * 0.1).toFixed(2) + ',' + (py + capH * 1.9).toFixed(2) + '" fill="' + snowColor + '" opacity="0.85"/>';
      detail += '<polygon points="' + px + ',' + py.toFixed(2) + ' ' + (px + capW * 0.15).toFixed(2) + ',' + (py + capH * 0.55).toFixed(2) + ' ' + (px + capW).toFixed(2) + ',' + (py + capH).toFixed(2) + '" fill="' + snowShade + '" opacity="0.6"/>';
    });

    return body + detail;
  }

  function redwood(x, baseY, h, color) {
    var tw = h * 0.04;
    var s = '<g fill="' + color + '">';
    s += '<rect x="' + (x - tw/2).toFixed(2) + '" y="' + (baseY - h * 0.92).toFixed(2) + '" width="' + tw.toFixed(2) + '" height="' + (h * 0.92).toFixed(2) + '"/>';
    var tiers = 6;
    for (var i = 0; i < tiers; i++) {
      var t = i / (tiers - 1);
      var cy = baseY - h * (0.18 + t * 0.78);
      var w  = h * (0.32 - t * 0.25);
      var hh = h * (0.10 + (1 - t) * 0.04);
      s += '<ellipse cx="' + x + '" cy="' + cy.toFixed(2) + '" rx="' + w.toFixed(2) + '" ry="' + hh.toFixed(2) + '"/>';
    }
    s += '<polygon points="' + x + ',' + (baseY - h).toFixed(2) + ' ' + (x - h * 0.05).toFixed(2) + ',' + (baseY - h * 0.86).toFixed(2) + ' ' + (x + h * 0.05).toFixed(2) + ',' + (baseY - h * 0.86).toFixed(2) + '"/>';
    return s + '</g>';
  }

  function cactus(x, baseY, h, color, arms) {
    if (!arms) arms = [['L', 0.55, 0.30]];
    var w = h * 0.16;
    var s = '<g fill="' + color + '">';
    s += '<rect x="' + (x - w/2).toFixed(2) + '" y="' + (baseY - h).toFixed(2) + '" width="' + w.toFixed(2) + '" height="' + h.toFixed(2) + '" rx="' + (w/2).toFixed(2) + '"/>';
    arms.forEach(function (arm) {
      var side = arm[0], startF = arm[1], lenF = arm[2];
      var armLen = h * lenF;
      var armW = w * 0.85;
      var armBaseY = baseY - h * startF;
      var dir = side === 'L' ? -1 : 1;
      var elbowX = x + dir * (w * 0.55);
      var elbowY = armBaseY;
      var tipX = elbowX + dir * (h * 0.22);
      var tipY = armBaseY - armLen;
      s += '<rect x="' + Math.min(elbowX, tipX).toFixed(2) + '" y="' + (elbowY - armW/2).toFixed(2) + '" width="' + Math.abs(tipX - elbowX + (dir > 0 ? armW/2 : 0) - (dir < 0 ? -armW/2 : 0)).toFixed(2) + '" height="' + armW.toFixed(2) + '" rx="' + (armW/2).toFixed(2) + '"/>';
      s += '<rect x="' + (tipX - armW/2).toFixed(2) + '" y="' + tipY.toFixed(2) + '" width="' + armW.toFixed(2) + '" height="' + (elbowY - tipY).toFixed(2) + '" rx="' + (armW/2).toFixed(2) + '"/>';
    });
    s += '<line x1="' + (x - w * 0.18).toFixed(2) + '" y1="' + (baseY - h * 0.92).toFixed(2) + '" x2="' + (x - w * 0.18).toFixed(2) + '" y2="' + (baseY - h * 0.04).toFixed(2) + '" stroke="rgba(0,0,0,0.18)" stroke-width="0.18"/>';
    s += '<line x1="' + (x + w * 0.18).toFixed(2) + '" y1="' + (baseY - h * 0.92).toFixed(2) + '" x2="' + (x + w * 0.18).toFixed(2) + '" y2="' + (baseY - h * 0.04).toFixed(2) + '" stroke="rgba(0,0,0,0.18)" stroke-width="0.18"/>';
    return s + '</g>';
  }

  function canopyTree(x, baseY, h, variant, trunkColor, trunkShade, crownColor, crownDark, crownLight) {
    var out = [];
    function cluster(cx, cy, r) {
      var s = '';
      s += '<ellipse cx="' + cx.toFixed(2) + '" cy="' + (cy + r * 0.35).toFixed(2) + '" rx="' + (r * 0.95).toFixed(2) + '" ry="' + (r * 0.55).toFixed(2) + '" fill="' + crownDark + '"/>';
      var puffs = [[-0.55, 0.05, 0.55], [0.50, -0.05, 0.58], [0.00, -0.45, 0.55], [-0.20, 0.20, 0.60], [0.25, 0.25, 0.50]];
      puffs.forEach(function (p) {
        s += '<circle cx="' + (cx + r * p[0]).toFixed(2) + '" cy="' + (cy + r * p[1]).toFixed(2) + '" r="' + (r * p[2]).toFixed(2) + '" fill="' + crownColor + '"/>';
      });
      s += '<circle cx="' + (cx - r * 0.32).toFixed(2) + '" cy="' + (cy - r * 0.30).toFixed(2) + '" r="' + (r * 0.32).toFixed(2) + '" fill="' + crownLight + '" opacity="0.85"/>';
      s += '<circle cx="' + (cx + r * 0.10).toFixed(2) + '" cy="' + (cy - r * 0.50).toFixed(2) + '" r="' + (r * 0.22).toFixed(2) + '" fill="' + crownLight + '" opacity="0.7"/>';
      return s;
    }
    function branch(x0, y0, x1, y1, w0, w1, color) {
      var dx = x1 - x0, dy = y1 - y0;
      var len = Math.hypot(dx, dy) || 1;
      var px = -dy / len, py = dx / len;
      var ax = x0 + px * w0 / 2, ay = y0 + py * w0 / 2;
      var bx = x0 - px * w0 / 2, by = y0 - py * w0 / 2;
      var cx = x1 - px * w1 / 2, cy = y1 - py * w1 / 2;
      var dx2 = x1 + px * w1 / 2, dy2 = y1 + py * w1 / 2;
      return '<path d="M ' + ax.toFixed(2) + ' ' + ay.toFixed(2) + ' L ' + dx2.toFixed(2) + ' ' + dy2.toFixed(2) + ' L ' + cx.toFixed(2) + ' ' + cy.toFixed(2) + ' L ' + bx.toFixed(2) + ' ' + by.toFixed(2) + ' Z" fill="' + color + '"/>';
    }

    var trunkBaseW = h * 0.14;

    if (variant === 'banyan') {
      var splitY  = baseY - h * 0.42;
      var crownCY = baseY - h * 0.75;
      var crownW  = h * 0.95;

      out.push(branch(x, baseY, x, splitY, trunkBaseW * 1.6, trunkBaseW * 1.1, trunkColor));
      out.push('<line x1="' + (x + trunkBaseW * 0.4).toFixed(2) + '" y1="' + (baseY - 0.4).toFixed(2) + '" x2="' + (x + trunkBaseW * 0.25).toFixed(2) + '" y2="' + (splitY + 0.4).toFixed(2) + '" stroke="' + trunkShade + '" stroke-width="' + (trunkBaseW * 0.6).toFixed(2) + '" opacity="0.55" stroke-linecap="round"/>');
      out.push('<path d="M ' + (x - trunkBaseW * 0.7).toFixed(2) + ' ' + (baseY - h * 0.20).toFixed(2) + ' Q ' + x.toFixed(2) + ' ' + (baseY - h * 0.16).toFixed(2) + ' ' + (x + trunkBaseW * 0.7).toFixed(2) + ' ' + (baseY - h * 0.24).toFixed(2) + '" stroke="' + crownDark + '" stroke-width="0.45" fill="none" opacity="0.85"/>');

      var arms = [
        { dx: -h * 0.45, dy: -h * 0.30, w: trunkBaseW * 0.65, r: h * 0.30 },
        { dx: -h * 0.22, dy: -h * 0.42, w: trunkBaseW * 0.70, r: h * 0.32 },
        { dx:  0,        dy: -h * 0.50, w: trunkBaseW * 0.75, r: h * 0.36 },
        { dx:  h * 0.22, dy: -h * 0.42, w: trunkBaseW * 0.70, r: h * 0.32 },
        { dx:  h * 0.45, dy: -h * 0.30, w: trunkBaseW * 0.65, r: h * 0.30 },
      ];
      arms.forEach(function (a) {
        out.push(branch(x, splitY, x + a.dx, splitY + a.dy, trunkBaseW, a.w * 0.55, trunkColor));
      });
      var clusters = [
        { dx: -0.42, dy:  0.10, r: 0.22 },
        { dx: -0.20, dy: -0.05, r: 0.26 },
        { dx:  0.00, dy: -0.10, r: 0.30 },
        { dx:  0.22, dy: -0.05, r: 0.26 },
        { dx:  0.42, dy:  0.10, r: 0.22 },
        { dx: -0.10, dy: -0.22, r: 0.20 },
        { dx:  0.14, dy: -0.22, r: 0.20 },
      ];
      clusters.forEach(function (c) { out.push(cluster(x + crownW * c.dx, crownCY + h * c.dy, crownW * c.r)); });

      var aerial = [];
      for (var i = 0; i < 14; i++) {
        var t = i / 13;
        var ax = x + crownW * (-0.48 + t * 0.96);
        var ay = crownCY + h * (0.06 + Math.sin(t * 6) * 0.04);
        var len = h * (0.18 + (i % 3) * 0.06 + (Math.sin(i * 7) * 0.5 + 0.5) * 0.10);
        var sway = (i % 2 ? 1 : -1) * h * 0.025;
        var mx = ax + sway * 1.2;
        var my = ay + len * 0.55;
        var ex = ax + sway * 2.2;
        var ey = ay + len;
        aerial.push('<path d="M ' + ax.toFixed(2) + ' ' + ay.toFixed(2) + ' Q ' + mx.toFixed(2) + ' ' + my.toFixed(2) + ' ' + ex.toFixed(2) + ' ' + ey.toFixed(2) + '" stroke="' + trunkShade + '" stroke-width="' + (0.22 + (i % 2) * 0.08).toFixed(2) + '" fill="none" opacity="0.7" stroke-linecap="round"/>');
        if (i % 3 === 1) {
          aerial.push('<ellipse cx="' + ex.toFixed(2) + '" cy="' + (ey + 0.2).toFixed(2) + '" rx="' + (len * 0.04).toFixed(2) + '" ry="' + (len * 0.06).toFixed(2) + '" fill="' + crownColor + '" opacity="0.85"/>');
        }
      }
      aerial.push('<path d="M ' + (x - crownW * 0.30).toFixed(2) + ' ' + (crownCY + h * 0.10).toFixed(2) + ' Q ' + (x - crownW * 0.10).toFixed(2) + ' ' + (crownCY + h * 0.38).toFixed(2) + ' ' + (x + crownW * 0.06).toFixed(2) + ' ' + (crownCY + h * 0.10).toFixed(2) + '" stroke="' + trunkShade + '" stroke-width="0.30" fill="none" opacity="0.7"/>');
      out.push(aerial.join(''));
    }
    else if (variant === 'twisty') {
      var lean = h * 0.22;
      var midX = x + lean * 0.6;
      var midY = baseY - h * 0.45;
      var topX = x + lean;
      var topY = baseY - h * 0.78;
      out.push(branch(x, baseY, midX, midY, trunkBaseW * 1.2, trunkBaseW * 0.75, trunkColor));
      out.push(branch(midX, midY, topX, topY, trunkBaseW * 0.75, trunkBaseW * 0.45, trunkColor));
      out.push('<path d="M ' + (x + 1).toFixed(2) + ' ' + (baseY - 0.4).toFixed(2) + ' Q ' + (midX + 1).toFixed(2) + ' ' + (midY + 0.4).toFixed(2) + ' ' + (topX + 0.5).toFixed(2) + ' ' + (topY + 0.5).toFixed(2) + '" stroke="' + trunkShade + '" stroke-width="' + (trunkBaseW * 0.35).toFixed(2) + '" fill="none" opacity="0.55" stroke-linecap="round"/>');
      var sbX = midX - h * 0.18;
      var sbY = midY - h * 0.04;
      out.push(branch(midX, midY, sbX, sbY, h * 0.05, h * 0.03, trunkColor));
      out.push(cluster(sbX - h * 0.04, sbY - h * 0.04, h * 0.16));
      out.push(cluster(topX + h * 0.04, topY - h * 0.04, h * 0.22));
      out.push(cluster(midX + h * 0.18, midY - h * 0.18, h * 0.14));
    }

    if (variant === 'banyan') {
      out.unshift('<path d="M ' + (x - trunkBaseW * 0.7).toFixed(2) + ' ' + baseY + ' L ' + (x - trunkBaseW * 2.4).toFixed(2) + ' ' + baseY + ' Q ' + (x - trunkBaseW * 1.8).toFixed(2) + ' ' + (baseY - h * 0.04).toFixed(2) + ' ' + (x - trunkBaseW * 0.5).toFixed(2) + ' ' + (baseY - h * 0.14).toFixed(2) + ' Z" fill="' + trunkColor + '" opacity="0.95"/>');
      out.unshift('<path d="M ' + (x + trunkBaseW * 0.7).toFixed(2) + ' ' + baseY + ' L ' + (x + trunkBaseW * 2.4).toFixed(2) + ' ' + baseY + ' Q ' + (x + trunkBaseW * 1.8).toFixed(2) + ' ' + (baseY - h * 0.04).toFixed(2) + ' ' + (x + trunkBaseW * 0.5).toFixed(2) + ' ' + (baseY - h * 0.14).toFixed(2) + ' Z" fill="' + trunkColor + '" opacity="0.95"/>');
      out.unshift('<polygon points="' + (x - trunkBaseW * 0.2).toFixed(2) + ',' + baseY + ' ' + (x - trunkBaseW * 0.9).toFixed(2) + ',' + baseY + ' ' + (x - trunkBaseW * 0.3).toFixed(2) + ',' + (baseY - h * 0.05).toFixed(2) + '" fill="' + trunkShade + '" opacity="0.7"/>');
      out.unshift('<polygon points="' + (x + trunkBaseW * 0.2).toFixed(2) + ',' + baseY + ' ' + (x + trunkBaseW * 0.9).toFixed(2) + ',' + baseY + ' ' + (x + trunkBaseW * 0.3).toFixed(2) + ',' + (baseY - h * 0.05).toFixed(2) + '" fill="' + trunkShade + '" opacity="0.7"/>');
    } else {
      out.unshift('<polygon points="' + (x - trunkBaseW * 0.6).toFixed(2) + ',' + baseY + ' ' + (x - trunkBaseW * 1.5).toFixed(2) + ',' + baseY + ' ' + (x - trunkBaseW * 0.5).toFixed(2) + ',' + (baseY - h * 0.08).toFixed(2) + '" fill="' + trunkColor + '" opacity="0.95"/>');
      out.unshift('<polygon points="' + (x + trunkBaseW * 0.6).toFixed(2) + ',' + baseY + ' ' + (x + trunkBaseW * 1.5).toFixed(2) + ',' + baseY + ' ' + (x + trunkBaseW * 0.5).toFixed(2) + ',' + (baseY - h * 0.08).toFixed(2) + '" fill="' + trunkColor + '" opacity="0.95"/>');
    }

    return out.join('');
  }

  function mistBand(yCenter, h, color) {
    return '<rect x="0" y="' + (yCenter - h/2) + '" width="100" height="' + h + '" fill="' + color + '" opacity="0.45"/>';
  }

  function halftoneSky(id, color) {
    return '<defs>' +
      '<pattern id="ht-a-' + id + '" width="2.4" height="2.4" patternUnits="userSpaceOnUse">' +
      '<circle cx="1.2" cy="1.2" r="0.42" fill="' + color + '"/></pattern>' +
      '<pattern id="ht-b-' + id + '" width="1.6" height="1.6" patternUnits="userSpaceOnUse" patternTransform="translate(0.8,0.8)">' +
      '<circle cx="0.8" cy="0.8" r="0.22" fill="' + color + '"/></pattern>' +
      '<linearGradient id="ht-fade-' + id + '" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="#fff" stop-opacity="0"/>' +
      '<stop offset="0.35" stop-color="#fff" stop-opacity="0.45"/>' +
      '<stop offset="0.7" stop-color="#fff" stop-opacity="0.10"/>' +
      '<stop offset="1" stop-color="#fff" stop-opacity="0"/>' +
      '</linearGradient>' +
      '<mask id="ht-mask-' + id + '">' +
      '<rect width="100" height="55" fill="url(#ht-fade-' + id + ')"/></mask></defs>' +
      '<g mask="url(#ht-mask-' + id + ')" style="mix-blend-mode: multiply;">' +
      '<rect x="0" y="0"  width="100" height="28" fill="url(#ht-a-' + id + ')" opacity="0.55"/>' +
      '<rect x="0" y="22" width="100" height="33" fill="url(#ht-b-' + id + ')" opacity="0.40"/></g>';
  }

  function fieldGuideChrome(r) {
    var right = r.sun.x < 50;
    var anchor = right ? 'end' : 'start';
    var stampX = right ? 96 : 4;
    return '' +
      '<rect x="2" y="2" width="96" height="71" fill="none" stroke="' + r.accent + '" stroke-width="0.25" opacity="0.55"/>' +
      '<g stroke="' + r.accent + '" stroke-width="0.35" opacity="0.75">' +
      '<line x1="2" y1="2" x2="5" y2="2"/><line x1="2" y1="2" x2="2" y2="5"/>' +
      '<line x1="98" y1="2" x2="95" y2="2"/><line x1="98" y1="2" x2="98" y2="5"/>' +
      '<line x1="2" y1="73" x2="5" y2="73"/><line x1="2" y1="73" x2="2" y2="70"/>' +
      '<line x1="98" y1="73" x2="95" y2="73"/><line x1="98" y1="73" x2="98" y2="70"/></g>' +
      '<g font-family="JetBrains Mono, monospace" fill="' + r.accent + '" opacity="0.85">' +
      '<text x="' + stampX + '" y="6.8" text-anchor="' + anchor + '" font-size="2.2" font-weight="700" letter-spacing="0.10">' + r.coords + '</text>' +
      '<text x="' + stampX + '" y="9.6" text-anchor="' + anchor + '" font-size="1.7" letter-spacing="0.18" opacity="0.75">ELEV ' + r.elev + '  ·  CAT \u2116 ' + r.cat + '</text></g>' +
      '<g font-family="JetBrains Mono, monospace" fill="' + r.accent + '">' +
      '<text x="' + (right ? 4 : 96) + '" y="71.2" text-anchor="' + (right ? 'start' : 'end') + '" font-size="2.0" font-weight="800" letter-spacing="0.15" opacity="0.85">' + r.romanIndex + ' / V</text></g>';
  }

  // ── Flower thumbnails ─────────────────────────────────────────────
  var FLOWER_DRAW = {
    arctic_poppy: function (_f, accent) {
      var s = '<g transform="translate(32 34)">';
      [0,60,120,180,240,300].forEach(function (rot) {
        s += '<g transform="rotate(' + rot + ')">' +
          '<path d="M 0 -2 Q -10 -8 -11 -18 Q -8 -24 -3 -24 Q 0 -26 3 -24 Q 8 -24 11 -18 Q 10 -8 0 -2 Z" fill="#fbe064" stroke="' + accent + '" stroke-width="0.35" stroke-opacity="0.55"/>' +
          '<path d="M -1.5 -5 Q -6 -12 -6 -20 Q -3 -22 0 -22 Q 3 -22 6 -20 Q 6 -12 1.5 -5 Z" fill="#fde88a" opacity="0.75"/>' +
          '<line x1="0" y1="-5" x2="0" y2="-22" stroke="#d4a020" stroke-width="0.4" opacity="0.55"/></g>';
      });
      [30,90,150,210,270,330].forEach(function (rot) {
        s += '<g transform="rotate(' + rot + ')"><path d="M 0 -2 Q -6 -8 -7 -16 Q -3 -20 0 -20 Q 3 -20 7 -16 Q 6 -8 0 -2 Z" fill="#fff4b8" opacity="0.92"/></g>';
      });
      s += '<circle r="5" fill="#2a1808"/><circle r="3.5" fill="#4a2a10"/><circle r="2.2" fill="#5e3618"/>';
      for (var i = 0; i < 16; i++) {
        var a = (i / 16) * 360;
        s += '<g transform="rotate(' + a + ')"><line x1="0" y1="-1" x2="0" y2="-6" stroke="#5a3a18" stroke-width="0.5"/><circle cx="0" cy="-6.4" r="0.85" fill="#1a0e08"/><circle cx="0" cy="-6.4" r="0.3" fill="#fff8c8" opacity="0.7"/></g>';
      }
      [0,45,90,135,180,225,270,315].forEach(function (a) {
        var rad = a * Math.PI / 180;
        s += '<line x1="0" y1="0" x2="' + (Math.sin(rad) * 1.8).toFixed(2) + '" y2="' + (-Math.cos(rad) * 1.8).toFixed(2) + '" stroke="#fbe064" stroke-width="0.55" opacity="0.9"/>';
      });
      return s + '</g>';
    },
    hydrangea: function (_f, accent) {
      var florets = [
        { x: 32, y: 32, scale: 1.0, tone: 0 }, { x: 22, y: 28, scale: 0.9, tone: 1 },
        { x: 42, y: 28, scale: 0.9, tone: 2 }, { x: 22, y: 40, scale: 0.85, tone: 3 },
        { x: 42, y: 40, scale: 0.85, tone: 4 }, { x: 32, y: 22, scale: 0.8, tone: 1 },
        { x: 32, y: 44, scale: 0.85, tone: 2 },
      ];
      var palettes = [
        { p: "#9c84d8", d: "#6e54a0", c: "#fff8c8" }, { p: "#b8a4e4", d: "#7e62b0", c: "#fbe064" },
        { p: "#7a5cb8", d: "#503090", c: "#fff8c8" }, { p: "#a8c4e8", d: "#7898c4", c: "#fff8c8" },
        { p: "#bea8e4", d: "#8e74c0", c: "#f0a4d8" },
      ];
      var s = '';
      [[14,50,-30],[50,50,30]].forEach(function (l) {
        var cx = l[0], cy = l[1], rot = l[2];
        s += '<g transform="translate(' + cx + ' ' + cy + ') rotate(' + rot + ')">' +
          '<path d="M 0 -7 Q -6 -2 -6 5 Q -3 9 0 9 Q 3 9 6 5 Q 6 -2 0 -7 Z" fill="#3e8a44" stroke="' + accent + '" stroke-width="0.4" stroke-opacity="0.55"/>' +
          '<line x1="0" y1="-6" x2="0" y2="8" stroke="#1a4220" stroke-width="0.35"/></g>';
      });
      florets.forEach(function (f) {
        var pal = palettes[f.tone % palettes.length];
        var r = 5 * f.scale;
        s += '<g transform="translate(' + f.x + ' ' + f.y + ')">';
        [0,90,180,270].forEach(function (rot) {
          s += '<g transform="rotate(' + rot + ')">' +
            '<path d="M 0 -1.4 Q ' + (-r * 0.8).toFixed(2) + ' ' + (-r * 1.1).toFixed(2) + ' ' + (-r * 0.55).toFixed(2) + ' ' + (-r * 1.6).toFixed(2) + ' Q 0 ' + (-r * 1.9).toFixed(2) + ' ' + (r * 0.55).toFixed(2) + ' ' + (-r * 1.6).toFixed(2) + ' Q ' + (r * 0.8).toFixed(2) + ' ' + (-r * 1.1).toFixed(2) + ' 0 -1.4 Z" fill="' + pal.p + '" stroke="' + accent + '" stroke-width="0.3" stroke-opacity="0.5"/>' +
            '<line x1="0" y1="-1" x2="0" y2="' + (-r * 1.7).toFixed(2) + '" stroke="' + pal.d + '" stroke-width="0.35" opacity="0.55"/></g>';
        });
        [0,90,180,270].forEach(function (rot) {
          s += '<circle cx="0" cy="-1.1" r="0.45" fill="#fbe064" transform="rotate(' + rot + ')"/>';
        });
        s += '<circle r="0.9" fill="' + pal.c + '"/></g>';
      });
      return s;
    },
    hibiscus: function (_f, accent) {
      var s = '<g transform="translate(32 36)">';
      [0,72,144,216,288].forEach(function (rot) {
        s += '<g transform="rotate(' + rot + ')">' +
          '<path d="M 0 -2 Q -10 -12 -12 -22 Q -10 -28 -5 -28 Q  0 -30  5 -28 Q 10 -28 12 -22 Q 10 -12  0 -2 Z" fill="#e63465" stroke="' + accent + '" stroke-width="0.35" stroke-opacity="0.5"/>' +
          '<path d="M -3 -7 Q -8 -16 -6 -24 Q 0 -26 6 -24 Q 8 -16 3 -7 Z" fill="#f78aa6" opacity="0.55"/>' +
          '<path d="M 0 0 Q -3 -5 -4 -10 L 4 -10 Q 3 -5 0 0 Z" fill="#9c1842" opacity="0.6"/>' +
          '<line x1="0" y1="-2" x2="0" y2="-28" stroke="#9c1842" stroke-width="0.45" opacity="0.5"/></g>';
      });
      s += '<circle r="4" fill="#4a0820"/><circle r="2.5" fill="#2a0410"/>';
      s += '<g transform="rotate(-15)"><line x1="0" y1="0" x2="0" y2="-24" stroke="#c41e4a" stroke-width="1.4" stroke-linecap="round"/>';
      [[-1.8,-17],[1.6,-19],[-1.2,-21],[2.0,-22],[-1.4,-24]].forEach(function (p) {
        var x = p[0], y = p[1];
        s += '<line x1="0" y1="' + (y + 3) + '" x2="' + x + '" y2="' + y + '" stroke="#c41e4a" stroke-width="0.55"/>';
        s += '<circle cx="' + x + '" cy="' + y + '" r="1.1" fill="#fbe064" stroke="#c41e4a" stroke-width="0.25"/>';
        s += '<circle cx="' + (x - 0.3) + '" cy="' + (y - 0.3) + '" r="0.4" fill="#fff8c8"/>';
      });
      s += '<g transform="translate(0 -26)">';
      [0,72,144,216,288].forEach(function (rot) {
        s += '<circle r="0.9" cx="0" cy="-1.2" fill="#c41e4a" transform="rotate(' + rot + ')"/>';
      });
      s += '<circle r="1.2" fill="#9c1842"/></g></g></g>';
      return s;
    },
    cactus_blossom: function (_f, accent) {
      var s = '<g transform="translate(32 36)">';
      s += '<g transform="translate(0 18)">';
      s += '<path d="M -4 4 Q -6 -2 -3 -10 L 3 -10 Q 6 -2 4 4 Z" fill="#6a9444" stroke="' + accent + '" stroke-width="0.35" stroke-opacity="0.5"/>';
      [-3,0,3].forEach(function (dx) {
        s += '<line x1="' + dx + '" y1="-9" x2="' + (dx * 0.6) + '" y2="2" stroke="#3e6a32" stroke-width="0.35" opacity="0.7"/>';
      });
      s += '<circle cx="-2" cy="-6" r="0.6" fill="#fff8e4" opacity="0.85"/>';
      s += '<circle cx="2"  cy="-6" r="0.6" fill="#fff8e4" opacity="0.85"/>';
      s += '<circle cx="-1.5" cy="-1" r="0.55" fill="#fff8e4" opacity="0.85"/>';
      s += '<circle cx="1.5"  cy="-1" r="0.55" fill="#fff8e4" opacity="0.85"/></g>';
      for (var i = 0; i < 10; i++) {
        var rot = (i / 10) * 360;
        s += '<g transform="rotate(' + rot + ')"><path d="M 0 -2 Q -6 -10 -7 -22 Q -4 -27 -2 -27 Q 0 -28 2 -27 Q 4 -27 7 -22 Q 6 -10 0 -2 Z" fill="#f06ba0" stroke="' + accent + '" stroke-width="0.35" stroke-opacity="0.5"/>' +
          '<path d="M -2 -6 Q -4 -14 -3 -21 Q 0 -25 3 -21 Q 4 -14 2 -6 Z" fill="#f8b0c8" opacity="0.6"/>' +
          '<line x1="0" y1="-4" x2="0" y2="-26" stroke="#c43868" stroke-width="0.35" opacity="0.5"/></g>';
      }
      for (var j = 0; j < 10; j++) {
        var rot2 = (j / 10) * 360 + 18;
        s += '<path d="M 0 -2 Q -4 -9 -4 -17 Q 0 -20 4 -17 Q 4 -9 0 -2 Z" fill="#f8b0c8" opacity="0.9" transform="rotate(' + rot2 + ')"/>';
      }
      s += '<circle r="5" fill="#fff8e4" stroke="' + accent + '" stroke-width="0.35" stroke-opacity="0.4"/>';
      for (var k = 0; k < 20; k++) {
        var rot3 = (k / 20) * 360;
        s += '<g transform="rotate(' + rot3 + ')"><line x1="0" y1="-1" x2="0" y2="-5" stroke="#e8a040" stroke-width="0.55"/><circle cx="0" cy="-5.5" r="0.7" fill="#fbe064"/></g>';
      }
      s += '<line x1="0" y1="0" x2="0" y2="-7" stroke="#9c5a2a" stroke-width="0.8"/>';
      [0,45,90,135,180,225,270,315].forEach(function (rot) {
        s += '<ellipse cx="0" cy="-8" rx="0.45" ry="1.1" fill="#c4783a" transform="rotate(' + rot + ')"/>';
      });
      s += '<circle cx="0" cy="-7.5" r="1.1" fill="#7a3a18"/>';
      return s + '</g>';
    },
    orchid: function (_f, accent) {
      var pal = { petal: "#d870e0", sepal: "#e8a8e8", lip: "#9c1ad8", throat: "#fbe064", veinDk: "#7a1a98" };
      var s = '<g transform="translate(32 34) scale(2.2)">';
      s += '<ellipse cx="0" cy="-10" rx="5" ry="8" fill="' + pal.sepal + '" stroke="' + accent + '" stroke-width="0.3" stroke-opacity="0.4"/>';
      s += '<line x1="0" y1="-2" x2="0" y2="-16" stroke="' + pal.veinDk + '" stroke-width="0.4" opacity="0.5"/>';
      s += '<ellipse cx="-7" cy="5" rx="4.5" ry="7" fill="' + pal.sepal + '" stroke="' + accent + '" stroke-width="0.3" stroke-opacity="0.4" transform="rotate(-30 -7 5)"/>';
      s += '<ellipse cx="7" cy="5" rx="4.5" ry="7" fill="' + pal.sepal + '" stroke="' + accent + '" stroke-width="0.3" stroke-opacity="0.4" transform="rotate(30 7 5)"/>';
      s += '<path d="M 0 0 Q -8 -4 -12 -2 Q -15 2 -13 6 Q -10 8 -4 4 Q 0 2 0 0 Z" fill="' + pal.petal + '" stroke="' + accent + '" stroke-width="0.3" stroke-opacity="0.45"/>';
      s += '<path d="M 0 0 Q  8 -4  12 -2 Q  15 2  13 6 Q  10 8  4 4 Q 0 2 0 0 Z" fill="' + pal.petal + '" stroke="' + accent + '" stroke-width="0.3" stroke-opacity="0.45"/>';
      s += '<path d="M 0 0 Q -8 0 -12 3" fill="none" stroke="' + pal.veinDk + '" stroke-width="0.4" opacity="0.5"/>';
      s += '<path d="M 0 0 Q  8 0  12 3" fill="none" stroke="' + pal.veinDk + '" stroke-width="0.4" opacity="0.5"/>';
      s += '<g transform="translate(0 4)">';
      s += '<path d="M -1.6 0 Q -4 1 -3.2 4 Q -1.6 4.5 -0.8 3" fill="' + pal.lip + '"/>';
      s += '<path d="M  1.6 0 Q  4 1  3.2 4 Q  1.6 4.5  0.8 3" fill="' + pal.lip + '"/>';
      s += '<path d="M 0 1 Q -3.5 3 -2.2 8 Q 0 10 2.2 8 Q 3.5 3 0 1 Z" fill="' + pal.lip + '" stroke="' + accent + '" stroke-width="0.25" stroke-opacity="0.4"/>';
      s += '<ellipse cx="0" cy="2.5" rx="2" ry="1.5" fill="' + pal.throat + '"/>';
      s += '<circle cx="-0.9" cy="2" r="0.7" fill="#fff8c8"/><circle cx="0.9" cy="2" r="0.7" fill="#fff8c8"/>';
      s += '<path d="M -1 8 Q -3 10 -2 12" fill="none" stroke="' + pal.veinDk + '" stroke-width="0.5" stroke-linecap="round"/>';
      s += '<path d="M  1 8 Q  3 10  2 12" fill="none" stroke="' + pal.veinDk + '" stroke-width="0.5" stroke-linecap="round"/>';
      [-30,-10,10,30].forEach(function (a) {
        var rad = a * Math.PI / 180;
        s += '<line x1="0" y1="2" x2="' + (Math.sin(rad) * 2.4).toFixed(2) + '" y2="' + (2 + Math.cos(rad) * 5).toFixed(2) + '" stroke="' + pal.veinDk + '" stroke-width="0.3" opacity="0.65"/>';
      });
      s += '</g>';
      s += '<ellipse cx="0" cy="1" rx="1.6" ry="3" fill="#fff" opacity="0.95"/>';
      s += '<circle cx="0" cy="2" r="0.8" fill="' + pal.throat + '"/>';
      s += '<circle cx="0" cy="-0.5" r="0.7" fill="' + pal.lip + '"/>';
      s += '<ellipse cx="0" cy="-2" rx="1" ry="0.6" fill="' + pal.throat + '"/>';
      return s + '</g>';
    },
  };

  function drawFlower(r) {
    var fn = FLOWER_DRAW[r.flower.draw];
    if (!fn) return '';
    return fn(r.flower, r.accent);
  }

  function buildScene(r) {
    var c1 = r.palette[0], c2 = r.palette[1];
    var s = '';
    s += skyGradient(c1, c2, r.id);
    s += sunHalo(r.sun, r.id);
    s += halftoneSky(r.id, r.accent);

    if (r.id === 'tundra') {
      var stars = '<g fill="#f6ecd6" opacity="0.55">';
      for (var i = 0; i < 18; i++) {
        var x = (i * 19.7 + 4) % 100;
        var y = ((i * 11) % 26) + 2;
        var r2 = 0.18 + ((i * 5) % 3) * 0.08;
        stars += '<circle cx="' + x.toFixed(2) + '" cy="' + y.toFixed(2) + '" r="' + r2.toFixed(2) + '"/>';
      }
      s += stars + '</g>';
      s += sun(r.sun);
      s += birds([[18,22,1.2],[22,24,0.9]], '#5a4a6c');
      s += snowflakes(r.palette[3]);
      s += hazeBand(46, 8, '#f3e7e2', 0.55);
      s += hill(50, 2, 0.20, mixHex(r.palette[2], '#ffffff', 0.25), 4);
      var peaks = [
        { x: 14, h: 22, w: 9 }, { x: 30, h: 28, w: 10 }, { x: 44, h: 20, w: 8 },
        { x: 58, h: 32, w: 11 }, { x: 74, h: 24, w: 9 }, { x: 90, h: 18, w: 7 },
      ];
      s += jaggedMountains(peaks, 58, '#7d6b9a', '#f6ecd6');
      s += '<rect x="0" y="58" width="100" height="17" fill="#cdbedd"/>';
      s += '<path d="M 0 58 Q 25 60 50 58 Q 75 56 100 58 L 100 62 L 0 62 Z" fill="#dccfdd" opacity="0.8"/>';
      s += '<path d="M 0 67 Q 30 66 60 68 Q 80 69 100 67" stroke="#b6a4ca" stroke-width="0.25" fill="none" opacity="0.55"/>';
      s += '<path d="M 0 71 Q 35 72 65 70 Q 85 69 100 71" stroke="#b6a4ca" stroke-width="0.22" fill="none" opacity="0.45"/>';
      s += '<ellipse cx="20" cy="68" rx="3" ry="0.6" fill="#5e4d72" opacity="0.7"/>';
      s += '<ellipse cx="82" cy="71" rx="4" ry="0.7" fill="#5e4d72" opacity="0.7"/>';
    }
    else if (r.id === 'forest') {
      s += sun(r.sun);
      s += hazeBand(34, 10, '#efe7c8', 0.55);
      s += mistBand(38, 8, r.palette[3]);
      s += birds([[68,22,1.0]], '#3a5640');
      s += hill(44, 3, 0.12, r.palette[0], 7);
      s += hazeBand(48, 5, '#e6dfc4', 0.45);
      s += hill(55, 4, 0.09, r.palette[1], 18);
      s += redwood(8, 56, 18, '#557663');
      s += redwood(15, 56, 22, '#4d6e5b');
      s += redwood(28, 56, 28, '#3f6052');
      s += redwood(38, 56, 20, '#557663');
      s += redwood(72, 56, 21, '#4d6e5b');
      s += redwood(82, 56, 24, '#3f6052');
      s += redwood(92, 56, 19, '#557663');
      s += hill(64, 3, 0.07, r.palette[2], 0);
      s += redwood(48, 65, 38, '#1f3a25');
      s += redwood(62, 65, 32, '#244530');
      s += redwood(9, 65, 30, '#244530');
      s += redwood(24, 65, 26, '#2a4a32');
      s += redwood(75, 65, 28, '#1f3a25');
      s += '<ellipse cx="48" cy="70" rx="8" ry="0.7" fill="#000" opacity="0.20"/>';
      s += '<ellipse cx="62" cy="71" rx="6" ry="0.6" fill="#000" opacity="0.18"/>';
      s += '<ellipse cx="9" cy="71" rx="6" ry="0.6" fill="#000" opacity="0.18"/>';
      s += groundDetail(67, 73, '#1a2e1e', 22, 5);
    }
    else if (r.id === 'tropical') {
      s += sun(r.sun);
      s += cloud(28, 14, 14, '#fffdf2');
      s += cloud(74, 22, 10, '#fffdf2');
      s += birds([[40,18,1.0],[44,20,0.8]], '#3d7d56');
      s += hazeBand(42, 6, '#f4e6c2', 0.50);
      s += hill(40, 5, 0.10, '#3d7d56', 5);
      s += hill(48, 4, 0.08, '#4f9968', 12);
      s += hill(54, 3, 0.06, '#6ab487', 22);
      s += hill(60, 2, 0.05, r.palette[2], 0);
      s += '<rect x="0" y="64" width="100" height="11" fill="' + r.palette[0] + '"/>';
      var sx = r.sun.x;
      s += '<rect x="' + (sx - 6).toFixed(2) + '" y="64" width="12" height="11" fill="#f4e6c2" opacity="0.32"/>';
      s += '<path d="M 0 64 Q 25 62 50 64 Q 75 66 100 64 L 100 67 L 0 67 Z" fill="' + r.palette[1] + '" opacity="0.7"/>';
      s += '<path d="M 0 67 Q 25 69 50 67 Q 75 65 100 67 L 100 68 L 0 68 Z" fill="#ffffff" opacity="0.55"/>';
      s += '<path d="M 0 70 Q 30 71 60 70 Q 80 69 100 70" stroke="#ffffff" stroke-width="0.18" fill="none" opacity="0.6"/>';
      s += '<path d="M 0 72.5 Q 35 73 65 72.5 Q 85 72 100 72.5" stroke="#ffffff" stroke-width="0.18" fill="none" opacity="0.5"/>';
      s += '<g stroke="#ffffff" stroke-width="0.30" opacity="0.75" stroke-linecap="round">';
      [[72,66],[78,68],[70,69.5],[80,71],[74,72.5]].forEach(function (p) {
        var x = p[0], y = p[1];
        s += '<line x1="' + (x - 0.8) + '" y1="' + y + '" x2="' + (x + 0.8) + '" y2="' + y + '"/>';
      });
      s += '</g>';
    }
    else if (r.id === 'desert') {
      s += sun(r.sun);
      s += cloud(20, 13, 14, '#fde7d4');
      s += cloud(78, 22, 11, '#fde7d4');
      s += birds([[42,24,1.0],[46,26,0.9]], '#7d2410');
      s += hazeBand(44, 6, '#fbd5a8', 0.55);
      s += '<path d="M 0 48 L 8 48 L 10 44 L 22 44 L 24 48 L 36 48 L 38 46 L 46 46 L 47 48 L 100 48 L 100 60 L 0 60 Z" fill="' + shade(r.palette[1], -0.10) + '" opacity="0.85"/>';
      s += hill(46, 6, 0.07, r.palette[1], 10);
      s += hill(56, 5, 0.05, r.palette[2], 22);
      s += '<path d="M 0 56 Q 25 53 50 56 Q 75 59 100 56" stroke="' + shade(r.palette[2], 0.18) + '" stroke-width="0.5" fill="none" opacity="0.6"/>';
      s += hill(64, 3, 0.07, r.palette[3], 0);
      s += '<rect x="0" y="71" width="100" height="4" fill="#e2a263"/>';
      s += '<g stroke="#b56a2e" stroke-width="0.18" fill="none" opacity="0.55">';
      s += '<path d="M 0 72.3 Q 25 72.6 50 72.3 Q 75 72.0 100 72.3"/>';
      s += '<path d="M 0 73.4 Q 30 73.7 60 73.4 Q 80 73.1 100 73.4"/></g>';
      s += groundDetail(71.5, 74.5, '#7d3a18', 16, 11);
      s += cactus(25, 64, 14, '#7d3a18', [['R', 0.55, 0.30]]);
      s += cactus(72, 71, 18, '#5e2a10', [['L', 0.50, 0.34], ['R', 0.65, 0.22]]);
      s += cactus(86, 71, 10, '#7d3a18');
      s += '<ellipse cx="27" cy="64.3" rx="3" ry="0.35" fill="#000" opacity="0.22"/>';
      s += '<ellipse cx="74" cy="71.3" rx="4" ry="0.45" fill="#000" opacity="0.25"/>';
      s += '<ellipse cx="87" cy="71.3" rx="2.4" ry="0.30" fill="#000" opacity="0.22"/>';
    }
    else if (r.id === 'rainforest') {
      s += sun(r.sun);
      s += mistBand(30, 12, '#f5edb0');
      s += birds([[18,18,1.1],[22,20,0.9]], '#1f4a20');
      s += hazeBand(36, 6, '#eaf2b8', 0.55);
      s += hill(40, 4, 0.10, '#5fa83a', 6);
      s += hazeBand(46, 4, '#dde88f', 0.40);
      s += hill(50, 5, 0.08, '#2f7a30', 12);
      s += canopyTree(14, 64, 28, 'twisty', '#8a3a1a', '#5a1e0c', '#3e8a3a', '#1f4a20', '#bfe066');
      s += canopyTree(85, 64, 28, 'twisty', '#8a3a1a', '#5a1e0c', '#3e8a3a', '#1f4a20', '#bfe066');
      s += canopyTree(50, 68, 44, 'banyan', '#9a4220', '#5a1e0c', '#2f7a30', '#143a16', '#a8d04a');
      s += '<rect x="0" y="71" width="100" height="4" fill="#2e5a30"/>';
      s += groundDetail(71.5, 74.5, '#143a16', 22, 3);
      s += groundDetail(71.5, 74.5, '#a8d04a', 10, 17);
      s += '<ellipse cx="50" cy="71.5" rx="22" ry="1.0" fill="#000" opacity="0.22"/>';
    }
    return s;
  }

  // ── Grain / filter defs (shared per card) ─────────────────────────
  var GRAIN_FILTER = '' +
    '<defs>' +
    '<filter id="grain" x="0" y="0" width="100%" height="100%">' +
      '<feTurbulence type="fractalNoise" baseFrequency="3.0" numOctaves="2" seed="7"/>' +
      '<feColorMatrix values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.55 0"/>' +
      '<feComposite in2="SourceGraphic" operator="in"/>' +
      '<feBlend in="SourceGraphic" mode="multiply"/></filter>' +
    '<filter id="grain-coarse" x="0" y="0" width="100%" height="100%">' +
      '<feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="2" seed="11"/>' +
      '<feColorMatrix values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.40 -0.16"/>' +
      '<feComposite in2="SourceGraphic" operator="in"/></filter>' +
    '<filter id="wavy-lines" x="0" y="0" width="100%" height="100%">' +
      '<feTurbulence type="fractalNoise" baseFrequency="0.04 0.12" numOctaves="2" seed="3"/>' +
      '<feColorMatrix values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 -1.0 0.9"/>' +
      '<feComposite in2="SourceGraphic" operator="in"/></filter>' +
    '<radialGradient id="vignette" cx="50%" cy="50%" r="75%">' +
      '<stop offset="0.55" stop-color="#000" stop-opacity="0"/>' +
      '<stop offset="1" stop-color="#000" stop-opacity="0.22"/></radialGradient>' +
    '<filter id="rough-edges" x="-5%" y="-5%" width="110%" height="110%">' +
      '<feTurbulence type="fractalNoise" baseFrequency="0.7" numOctaves="2" seed="13" result="rN"/>' +
      '<feDisplacementMap in="SourceGraphic" in2="rN" scale="0.55" xChannelSelector="R" yChannelSelector="G"/></filter>' +
    '<radialGradient id="lightleak" cx="85%" cy="10%" r="55%">' +
      '<stop offset="0" stop-color="#ffd9a6" stop-opacity="0.30"/>' +
      '<stop offset="0.6" stop-color="#ffd9a6" stop-opacity="0.05"/>' +
      '<stop offset="1" stop-color="#ffd9a6" stop-opacity="0"/></radialGradient>' +
    '</defs>';

  var ROMAN = ['I', 'II', 'III', 'IV', 'V'];

  // DB region slug → bundle region id.
  var DB_TO_BRC = {
    desert:           'desert',
    rainforest:       'rainforest',
    temperate_forest: 'forest',
    tundra:           'tundra',
    tropical_island:  'tropical',
  };

  function findRegion(dbSlug) {
    var id = DB_TO_BRC[dbSlug] || dbSlug;
    for (var i = 0; i < REGIONS.length; i++) {
      if (REGIONS[i].id === id) {
        return { region: REGIONS[i], romanIndex: ROMAN[i] };
      }
    }
    return null;
  }

  function renderCard(dbSlug, container) {
    if (!container) return;
    container.innerHTML = '';
    var entry = findRegion(dbSlug);
    if (!entry) return;
    var r = entry.region;
    r.romanIndex = entry.romanIndex;

    var flattenFilter =
      '<defs><filter id="flatten-' + r.id + '" x="-10%" y="-10%" width="120%" height="120%">' +
      '<feFlood flood-color="' + r.accent + '" flood-opacity="1"/>' +
      '<feComposite in2="SourceGraphic" operator="in"/></filter></defs>';

    var sceneSvg  = buildScene(r);
    var swatches  = r.palette.map(function (c) {
      return '<div class="brc-swatch" style="background:' + c + '"></div>';
    }).join('');

    var html = '' +
      '<div class="brc-card" style="--brc-accent:' + r.accent + '">' +
      '<div class="brc-scene-wrap">' +
        '<svg viewBox="0 0 100 75" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">' +
          GRAIN_FILTER + flattenFilter +
          '<g filter="url(#flatten-' + r.id + ')" transform="translate(0.7 0.35)" opacity="0.30" style="mix-blend-mode: multiply;">' +
            sceneSvg + '</g>' +
          '<g filter="url(#rough-edges)">' + sceneSvg + '</g>' +
          '<rect width="100" height="75" fill="url(#lightleak)"/>' +
          '<rect width="100" height="75" opacity="0.12" filter="url(#grain-coarse)" fill="white"/>' +
          '<rect width="100" height="75" fill="white" opacity="0.06" filter="url(#wavy-lines)"/>' +
          '<rect width="100" height="75" opacity="0.26" filter="url(#grain)" fill="white"/>' +
          '<rect width="100" height="75" fill="url(#vignette)"/>' +
          fieldGuideChrome(r) +
        '</svg>' +
      '</div>' +
      '<div class="brc-chrome">' +
        '<div class="brc-chrome-top">' +
          '<span class="brc-idx">' + r.romanIndex + ' / V</span>' +
          '<span class="brc-rule"></span>' +
          '<span class="brc-name">' + r.name + '</span>' +
        '</div>' +
        '<div class="brc-chrome-mid">' +
          '<span class="brc-tag">' + r.tag + '</span>' +
          '<span class="brc-coords">' + r.coords + '</span>' +
        '</div>' +
        '<div class="brc-chrome-bot">' +
          '<div class="brc-palette">' + swatches + '</div>' +
          '<div class="brc-cat">CAT \u2116 <strong>' + r.cat + '</strong> · ELEV <strong>' + r.elev + '</strong></div>' +
        '</div>' +
      '</div>' +
      '<div class="brc-specimen">' +
        '<div class="brc-specimen-art">' +
          '<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">' + drawFlower(r) + '</svg>' +
        '</div>' +
        '<div class="brc-specimen-info">' +
          '<div class="brc-lbl">SPECIMEN — NOTABLE BLOOM</div>' +
          '<div class="brc-common">' + r.flower.common + '</div>' +
          '<div class="brc-latin">' + r.flower.latin + '</div>' +
          '<div class="brc-bloom"><span class="brc-pip"></span><strong>' + r.flower.bloom + '</strong> · ' + r.flower.note + '</div>' +
        '</div>' +
      '</div>' +
      '</div>';

    container.innerHTML = html;
  }

  global.BloomRegionCards = {
    REGIONS:  REGIONS,
    DB_TO_BRC: DB_TO_BRC,
    renderCard: renderCard,
  };
})(typeof window !== 'undefined' ? window : this);
