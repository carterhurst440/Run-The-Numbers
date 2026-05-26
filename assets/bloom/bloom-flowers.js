/*!
 * bloom-flowers.js — vanilla port of the React/JSX flower animation system.
 *
 * Exposes a single global namespace: window.BloomFlowers
 *   .renderFlowerSvg(species, stage, swell)  → SVGElement
 *   .FlowerStage         class (one-shot gameplay flowers)
 *   .FlowerClipLoop      class (looping admin catalog clips)
 *   .FLOWER_SPECIES, .STAGE_LABELS, .CLIP_VARIANTS
 *   .FLOWER_W, .FLOWER_H, .ANCHOR_X, .SOIL_Y
 *
 * Canvas 220×340, anchor (110, 300), soil line y=300, transparent bg.
 * Stage semantics:
 *   0 SEED · 1 SPROUT · 2 FOLIAGE · 3 BUD INIT · 4 BUD SWELLS ·
 *   5 CRACKING · 6 BLOOM
 *
 * The bloom celebration overlay (halo, sparkles, rotating rays, fallen
 * petals) plays on stage 6 and uses instance-unique <defs> IDs so multiple
 * flowers can coexist without colliding on radialGradient references.
 *
 * Requires bloom-flowers.css to be loaded for the swell / bloom keyframes.
 */
(function (global) {
  'use strict';

  // ── Canvas constants ───────────────────────────────────────────────
  var SVG_NS    = 'http://www.w3.org/2000/svg';
  var FLOWER_W  = 220;
  var FLOWER_H  = 340;
  var ANCHOR_X  = 110;
  var SOIL_Y    = 300;

  // Bump per renderFlowerSvg call so BloomFX defs IDs are unique.
  var _instanceCounter = 0;

  // ── Catalogs ───────────────────────────────────────────────────────
  var FLOWER_SPECIES = [
    { id: 'arctic_poppy',   name: 'ARCTIC POPPY',   accent: '#f0a521', scientific: 'Papaver radicatum' },
    { id: 'hydrangea',      name: 'HYDRANGEA',      accent: '#9c84d8', scientific: 'Hydrangea macrophylla' },
    { id: 'hibiscus',       name: 'HIBISCUS',       accent: '#e63465', scientific: 'Hibiscus rosa-sinensis' },
    { id: 'cactus_blossom', name: 'CACTUS BLOSSOM', accent: '#f06ba0', scientific: 'Echinopsis sp.' },
    { id: 'orchid',         name: 'ORCHID',         accent: '#d870e0', scientific: 'Phalaenopsis sp.' },
  ];

  var STAGE_LABELS = [
    '0 · SEED',
    '1 · SPROUT',
    '2 · FOLIAGE',
    '3 · BUD INIT',
    '4 · BUD SWELLS',
    '5 · CRACKING',
    '6 · BLOOM',
  ];

  var CLIP_VARIANTS = [
    { id: 'swell-1', label: 'Stage 1 (0–20) swell',   short: 'S1·SWELL', type: 'swell',      stage: 0 },
    { id: 'tx-1-2',  label: 'Transition 1 → 2',        short: '1 → 2',    type: 'transition', from: 0, to: 1 },
    { id: 'swell-2', label: 'Stage 2 (20–40) swell',  short: 'S2·SWELL', type: 'swell',      stage: 1 },
    { id: 'tx-2-3',  label: 'Transition 2 → 3',        short: '2 → 3',    type: 'transition', from: 1, to: 2 },
    { id: 'swell-3', label: 'Stage 3 (40–60) swell',  short: 'S3·SWELL', type: 'swell',      stage: 2 },
    { id: 'tx-3-4',  label: 'Transition 3 → 4',        short: '3 → 4',    type: 'transition', from: 2, to: 3 },
    { id: 'swell-4', label: 'Stage 4 (60–80) swell',  short: 'S4·SWELL', type: 'swell',      stage: 3 },
    { id: 'tx-4-5',  label: 'Transition 4 → 5',        short: '4 → 5',    type: 'transition', from: 3, to: 4 },
    { id: 'swell-5', label: 'Stage 5 (80–90) swell',  short: 'S5·SWELL', type: 'swell',      stage: 4 },
    { id: 'tx-5-6',  label: 'Transition 5 → 6',        short: '5 → 6',    type: 'transition', from: 4, to: 5 },
    { id: 'swell-6', label: 'Stage 6 (90–100) swell', short: 'S6·SWELL', type: 'swell',      stage: 5 },
    { id: 'bloom',   label: 'Bloom!',                  short: 'BLOOM!',   type: 'transition', from: 5, to: 6 },
  ];

  // ── Small utilities ────────────────────────────────────────────────
  function range(n) {
    var a = []; for (var i = 0; i < n; i++) a.push(i); return a;
  }

  // Stage 0..6 clamp helper for safety
  function clampStage(s) {
    s = +s | 0;
    if (s < 0) return 0;
    if (s > 6) return 6;
    return s;
  }

  // ── BloomFX overlay ────────────────────────────────────────────────
  // Returns an SVG string for the bloom celebration overlay. The halo
  // gradient is given an instance-unique id so two simultaneous flowers
  // with the same accent color don't collide on the <defs> reference.
  function bloomFx(accent, centerX, centerY, radius, instanceId) {
    if (centerX == null) centerX = ANCHOR_X;
    if (centerY == null) centerY = SOIL_Y - 80;
    if (radius == null)  radius = 70;

    var haloId = 'bloom-halo-' + String(accent).replace(/[^a-z0-9]/gi, '') + '-' + instanceId;

    // sparkles distributed in a ring around the bloom center
    var sparkleStr = '';
    for (var i = 0; i < 12; i++) {
      var a = (i / 12) * Math.PI * 2 + (i % 3) * 0.4;
      var r = radius * (0.55 + (i % 4) * 0.12);
      var sx = centerX + Math.cos(a) * r;
      var sy = centerY + Math.sin(a) * r * 0.85;
      var size = 2 + (i % 3);
      var delay = (i * 0.18) % 2;
      sparkleStr +=
        '<g transform="translate(' + sx + ' ' + sy + ')" ' +
          'style="animation: bloomfx-sparkle 2.4s ease-in-out ' + delay + 's infinite">' +
          '<path d="M 0 ' + (-size) + ' L ' + (size * 0.4) + ' ' + (-size * 0.4) +
                  ' L ' + size + ' 0 L ' + (size * 0.4) + ' ' + (size * 0.4) +
                  ' L 0 ' + size + ' L ' + (-size * 0.4) + ' ' + (size * 0.4) +
                  ' L ' + (-size) + ' 0 L ' + (-size * 0.4) + ' ' + (-size * 0.4) + ' Z" ' +
                'fill="' + accent + '" />' +
          '<circle r="' + (size * 0.35) + '" fill="#fff" opacity="0.9" />' +
        '</g>';
    }

    // rotating ray burst
    var raysStr = '';
    for (var j = 0; j < 12; j++) {
      var ra = (j / 12) * 360;
      var rx = centerX + Math.cos(ra * Math.PI / 180) * radius * 1.5;
      var ry = centerY + Math.sin(ra * Math.PI / 180) * radius * 1.5;
      raysStr +=
        '<line x1="' + centerX + '" y1="' + centerY + '" x2="' + rx + '" y2="' + ry + '" ' +
              'stroke="' + accent + '" stroke-width="0.6" opacity="0.18" />';
    }

    // fallen petals along ground line
    var petals = [
      { x: ANCHOR_X - 36, rot: -30, opacity: 0.8 },
      { x: ANCHOR_X - 22, rot: 12,  opacity: 0.6 },
      { x: ANCHOR_X + 18, rot: -8,  opacity: 0.7 },
      { x: ANCHOR_X + 32, rot: 24,  opacity: 0.55 },
      { x: ANCHOR_X + 48, rot: -18, opacity: 0.5 },
      { x: ANCHOR_X - 50, rot: 20,  opacity: 0.5 },
    ];
    var petalsStr = '';
    for (var k = 0; k < petals.length; k++) {
      var p = petals[k];
      petalsStr +=
        '<g transform="translate(' + p.x + ' ' + (SOIL_Y + 2) + ') rotate(' + p.rot + ')" ' +
          'style="opacity:' + p.opacity + ';animation: bloomfx-petal-sway 4s ease-in-out ' + (k * 0.3) + 's infinite">' +
          '<ellipse cx="0" cy="0" rx="4" ry="2" fill="' + accent + '" />' +
          '<ellipse cx="-1" cy="-0.5" rx="1.5" ry="0.8" fill="#fff" opacity="0.35" />' +
        '</g>';
    }

    return (
      '<g style="pointer-events:none">' +
        '<defs>' +
          '<radialGradient id="' + haloId + '" cx="50%" cy="50%" r="50%">' +
            '<stop offset="0%"   stop-color="' + accent + '" stop-opacity="0.32" />' +
            '<stop offset="50%"  stop-color="' + accent + '" stop-opacity="0.10" />' +
            '<stop offset="100%" stop-color="' + accent + '" stop-opacity="0" />' +
          '</radialGradient>' +
        '</defs>' +
        '<ellipse cx="' + centerX + '" cy="' + centerY + '" rx="' + (radius * 1.4) + '" ry="' + (radius * 1.2) + '" ' +
                 'fill="url(#' + haloId + ')" ' +
                 'style="animation: bloomfx-halo 3s ease-in-out infinite" />' +
        '<g style="transform-origin:' + centerX + 'px ' + centerY + 'px;' +
                  'animation: bloomfx-spin 18s linear infinite">' +
          raysStr +
        '</g>' +
        sparkleStr +
        petalsStr +
      '</g>'
    );
  }

  // ══════════════════════════════════════════════════════════════════
  // ARCTIC POPPY · Papaver radicatum
  // ══════════════════════════════════════════════════════════════════

  // Pinnately-lobed hairy leaf — radiates from base point.
  function poppyLeaf(cx, cy, length, angle, color) {
    length = (length == null) ? 18 : length;
    angle  = (angle  == null) ?  0 : angle;
    color  = color || '#5e8a4a';
    var lobes = 4;
    var w = length * 0.36;
    var path = 'M 0 0 ';
    for (var i = 0; i < lobes; i++) {
      var t1 = (i + 0.5) / lobes;
      var t2 = (i + 1) / lobes;
      path += 'Q ' + w + ' ' + (-length * t1 * 0.95) + ' ' +
              (w * (1 - (i + 1) / (lobes + 1))) + ' ' + (-length * t2) + ' ';
    }
    path += 'L 0 ' + (-length) + ' ';
    for (var i2 = lobes - 1; i2 >= 0; i2--) {
      var t1b = (i2 + 0.5) / lobes;
      var t2b = i2 / lobes;
      path += 'Q ' + (-w) + ' ' + (-length * t1b * 0.95) + ' ' +
              (-w * (1 - (i2 + 1) / (lobes + 1))) + ' ' + (-length * t2b) + ' ';
    }
    path += 'Z';

    var bristles = '';
    for (var b = 0; b < 8; b++) {
      var t = b / 7;
      var lx = (Math.sin(t * Math.PI * 2 + cx) * 0.3 + 0.5) * w;
      var ly = -length * t * 0.95;
      bristles +=
        '<line x1="' + lx + '" y1="' + ly + '" x2="' + (lx + 1.4) + '" y2="' + (ly - 1.6) +
              '" stroke="' + color + '" stroke-width="0.4" opacity="0.7" />' +
        '<line x1="' + (-lx) + '" y1="' + ly + '" x2="' + (-lx - 1.4) + '" y2="' + (ly - 1.6) +
              '" stroke="' + color + '" stroke-width="0.4" opacity="0.7" />';
    }

    return (
      '<g transform="translate(' + cx + ' ' + cy + ') rotate(' + angle + ')">' +
        '<path d="' + path + '" fill="' + color + '" />' +
        '<path d="' + path + '" fill="#8db672" opacity="0.32" transform="translate(0.6 -0.6)" />' +
        '<line x1="0" y1="0" x2="0" y2="' + (-length) + '" stroke="#3e6a32" stroke-width="0.6" opacity="0.7" />' +
        bristles +
      '</g>'
    );
  }

  // Bristly stalk — curved line covered in tiny outward-pointing hairs.
  function bristlyStalk(tipX, tipY, color, thick, density) {
    color   = color   || '#6e9450';
    thick   = (thick   == null) ? 2.4 : thick;
    density = (density == null) ? 18  : density;
    var lines = '';
    var dl = Math.hypot(tipX - ANCHOR_X, tipY - SOIL_Y);
    var px = (tipY - SOIL_Y) / dl;
    var py = -(tipX - ANCHOR_X) / dl;
    for (var i = 1; i <= density; i++) {
      var t = i / (density + 1);
      var x = ANCHOR_X + (tipX - ANCHOR_X) * t;
      var y = SOIL_Y + (tipY - SOIL_Y) * t;
      var len = 3 + (i % 3) * 0.4;
      var side = i % 2 === 0 ? 1 : -1;
      lines +=
        '<line x1="' + x + '" y1="' + y + '" ' +
              'x2="' + (x + px * len * side) + '" y2="' + (y + py * len * side) + '" ' +
              'stroke="' + color + '" stroke-width="0.65" opacity="0.85" />';
      if (i % 2 === 0) {
        lines +=
          '<line x1="' + x + '" y1="' + y + '" ' +
                'x2="' + (x + px * (len * 0.8) * -side) + '" y2="' + (y + py * (len * 0.8) * -side) + '" ' +
                'stroke="' + color + '" stroke-width="0.55" opacity="0.7" />';
      }
    }
    return (
      '<path d="M ' + ANCHOR_X + ' ' + SOIL_Y + ' Q ' + (ANCHOR_X + 3) + ' ' +
        ((SOIL_Y + tipY) / 2) + ' ' + tipX + ' ' + tipY + '" ' +
        'fill="none" stroke="' + color + '" stroke-width="' + thick + '" stroke-linecap="round" />' +
      lines
    );
  }

  // Hairy nodding/upright bud — two papery sepal halves with bristles.
  function poppyBud(scale, openness, colorHint) {
    scale     = (scale     == null) ? 1   : scale;
    openness  = (openness  == null) ? 0   : openness;
    colorHint = !!colorHint;
    var s = scale;
    var halfOffset = 1 + openness * 5;
    var rotL = openness * -25;
    var rotR = openness *  25;

    var bristles = '';
    for (var i = 0; i < 14; i++) {
      var ang = (i / 14) * Math.PI * 2 - Math.PI / 2;
      var rr = 5 * s;
      var bx = Math.sin(ang) * rr;
      var by = Math.cos(ang) * rr - 3 * s;
      bristles +=
        '<line x1="' + bx + '" y1="' + by + '" ' +
              'x2="' + (bx + Math.sin(ang) * 2.4) + '" y2="' + (by + Math.cos(ang) * 2.4 - 0.4) + '" ' +
              'stroke="#a8c08c" stroke-width="0.5" opacity="0.85" />';
    }

    function sepalPath(sign) {
      var sx = sign * halfOffset;
      var s6 = sign * 6 * s, s5 = sign * 5 * s, s3 = sign * 3 * s;
      var s06 = sign * halfOffset * 0.6, s04 = sign * halfOffset * 0.4;
      return 'M ' + sx + ' 4 ' +
             'Q ' + s6 + ' 0 ' + s5 + ' ' + (-7 * s) + ' ' +
             'Q ' + s3 + ' ' + (-10 * s) + ' ' + s06 + ' ' + (-8 * s) + ' ' +
             'Q ' + s04 + ' 0 ' + sx + ' 4 Z';
    }

    return (
      '<g>' +
        (colorHint
          ? '<ellipse cx="0" cy="' + (-2 * s) + '" rx="' + (3.2 * s) + '" ry="' + (5 * s) + '" fill="#fbe064" opacity="0.85" />'
          : '') +
        '<path d="' + sepalPath(-1) + '" fill="#6c9450" transform="rotate(' + rotL + ')" />' +
        '<path d="' + sepalPath(-1) + '" fill="#3e6a32" opacity="0.3" transform="rotate(' + rotL + ') translate(0.5 -0.5)" />' +
        '<path d="' + sepalPath( 1) + '" fill="#6c9450" transform="rotate(' + rotR + ')" />' +
        '<path d="' + sepalPath( 1) + '" fill="#3e6a32" opacity="0.3" transform="rotate(' + rotR + ') translate(-0.5 -0.5)" />' +
        bristles +
      '</g>'
    );
  }

  function arcticPoppyContent(stage, instanceId) {
    var stalkH = [0, 12, 0, 150, 205, 235, 250][stage];
    var tipY = SOIL_Y - stalkH;
    var budTilt = stage === 3 ? 40 : stage === 4 ? 18 : 0;
    var out = '';

    // Stage 0 — kidney-shaped poppy seed
    if (stage === 0) {
      out +=
        '<g>' +
          '<path d="M ' + (ANCHOR_X - 1.4) + ' ' + (SOIL_Y - 1.4) +
                  ' Q ' + (ANCHOR_X - 1.6) + ' ' + (SOIL_Y - 2.6) +
                  ' ' + ANCHOR_X + ' ' + (SOIL_Y - 2.8) +
                  ' Q ' + (ANCHOR_X + 1.6) + ' ' + (SOIL_Y - 2.6) +
                  ' ' + (ANCHOR_X + 1.4) + ' ' + (SOIL_Y - 1.4) +
                  ' Q ' + ANCHOR_X + ' ' + (SOIL_Y - 1) +
                  ' ' + (ANCHOR_X - 1.4) + ' ' + (SOIL_Y - 1.4) + ' Z" fill="#1a0e08" />' +
          '<circle cx="' + (ANCHOR_X - 5) + '" cy="' + (SOIL_Y + 0.5) + '" r="0.6" fill="#8a7858" opacity="0.6" />' +
          '<circle cx="' + (ANCHOR_X + 6) + '" cy="' + (SOIL_Y + 1.5) + '" r="0.5" fill="#8a7858" opacity="0.6" />' +
        '</g>';
    }

    // Stage 1 — tiny sprout
    if (stage === 1) {
      out +=
        '<g>' +
          '<line x1="' + ANCHOR_X + '" y1="' + SOIL_Y + '" x2="' + ANCHOR_X + '" y2="' + (SOIL_Y - 5) +
                '" stroke="#7aac5e" stroke-width="1.2" stroke-linecap="round" />' +
          '<ellipse cx="' + (ANCHOR_X - 3.5) + '" cy="' + (SOIL_Y - 6) + '" rx="3.5" ry="1.2" ' +
                  'fill="#a4c882" transform="rotate(-25 ' + (ANCHOR_X - 3.5) + ' ' + (SOIL_Y - 6) + ')" />' +
          '<ellipse cx="' + (ANCHOR_X + 3.5) + '" cy="' + (SOIL_Y - 6) + '" rx="3.5" ry="1.2" ' +
                  'fill="#a4c882" transform="rotate(25 ' + (ANCHOR_X + 3.5) + ' ' + (SOIL_Y - 6) + ')" />' +
          poppyLeaf(ANCHOR_X, SOIL_Y - 6, 6, 0, '#7aac5e');
      [-2, 0, 2].forEach(function (dx) {
        out += '<line x1="' + (ANCHOR_X + dx) + '" y1="' + (SOIL_Y - 6) + '" ' +
                     'x2="' + (ANCHOR_X + dx * 1.6) + '" y2="' + (SOIL_Y - 9) + '" ' +
                     'stroke="#7aac5e" stroke-width="0.4" />';
      });
      out += '</g>';
    }

    // Stage 2 — full basal rosette
    if (stage === 2) {
      out += '<g>';
      [-80, -50, -20, 20, 50, 80].forEach(function (a, i) {
        out += poppyLeaf(
          ANCHOR_X + Math.sin(a * Math.PI / 180) * 2,
          SOIL_Y - 1,
          14 + (i % 3) * 4,
          a,
          '#5e8a4a'
        );
      });
      out += '<circle cx="' + ANCHOR_X + '" cy="' + (SOIL_Y - 2) + '" r="1.6" fill="#3e6a2a" />';
      [0, 60, 120, 180, 240, 300].forEach(function (a) {
        out +=
          '<line x1="' + ANCHOR_X + '" y1="' + (SOIL_Y - 2) + '" ' +
                'x2="' + (ANCHOR_X + Math.sin(a * Math.PI / 180) * 2.5) + '" ' +
                'y2="' + (SOIL_Y - 2 - Math.cos(a * Math.PI / 180) * 2.5) + '" ' +
                'stroke="#7aac5e" stroke-width="0.5" />';
      });
      out += '</g>';
    }

    // Stage 3+ — rosette below + bristly stalk + nodding bud
    if (stage >= 3) {
      [-80, -50, -20, 20, 50, 80].forEach(function (a, i) {
        out += poppyLeaf(
          ANCHOR_X + Math.sin(a * Math.PI / 180) * 2,
          SOIL_Y - 1,
          14 + (i % 3) * 4,
          a,
          '#5e8a4a'
        );
      });

      var bx = ANCHOR_X + (stage === 3 ? -8 : -2);
      var by = tipY + (stage === 3 ? 4 : 0);
      out += bristlyStalk(bx, by, '#7aac5e', 2.4, 18);

      out += '<g transform="translate(' + bx + ' ' + by + ') rotate(' + budTilt + ')">';
      if (stage === 3) out += poppyBud(1.05, 0, false);
      if (stage === 4) out += poppyBud(1.3, 0.15, true);
      if (stage === 5) {
        out += '<g>' + poppyBud(1.4, 0.7, true) +
               '<g transform="translate(0 -4)">';
        [0, 90, 180, 270].forEach(function (rot) {
          out += '<path d="M 0 0 Q -4 -3 -3 -8 Q 0 -10 3 -8 Q 4 -3 0 0 Z" fill="#fbe064" ' +
                       'transform="rotate(' + rot + ') scale(0.85)" />';
        });
        out += '</g></g>';
      }
      if (stage === 6) {
        out +=
          '<g>' +
            '<path d="M -8 6 Q -12 9 -10 14" fill="none" stroke="#7aac5e" stroke-width="1.4" opacity="0.6" />' +
            '<path d="M  8 6 Q  12 9  10 14" fill="none" stroke="#7aac5e" stroke-width="1.4" opacity="0.6" />';
        [0, 90, 180, 270].forEach(function (rot) {
          out +=
            '<g transform="rotate(' + rot + ')">' +
              '<path d="M 0 -2 Q -12 -10 -14 -20 Q -10 -28 -4 -28 Q 0 -30 4 -28 Q 10 -28 14 -20 Q 12 -10 0 -2 Z" fill="#fbe064" />' +
              '<path d="M -2 -6 Q -8 -14 -8 -22 Q -4 -26 0 -26 Q 4 -26 8 -22 Q 8 -14 2 -6 Z" fill="#fde88a" opacity="0.7" />' +
              '<line x1="0" y1="-6" x2="0" y2="-26" stroke="#d4a020" stroke-width="0.5" opacity="0.55" />' +
              '<line x1="0" y1="-6" x2="-5" y2="-22" stroke="#d4a020" stroke-width="0.4" opacity="0.45" />' +
              '<line x1="0" y1="-6" x2="5" y2="-22" stroke="#d4a020" stroke-width="0.4" opacity="0.45" />' +
            '</g>';
        });
        out +=
          '<circle r="6" fill="#2a1808" />' +
          '<circle r="4" fill="#4a2a10" />';
        for (var i = 0; i < 18; i++) {
          var ang = (i / 18) * 360;
          out +=
            '<g transform="rotate(' + ang + ')">' +
              '<line x1="0" y1="0" x2="0" y2="-6.4" stroke="#5a3a18" stroke-width="0.5" />' +
              '<circle cx="0" cy="-7" r="0.9" fill="#1a0e08" />' +
            '</g>';
        }
        out += '<circle r="2" fill="#3a2010" />';
        [0, 60, 120, 180, 240, 300].forEach(function (a) {
          out +=
            '<line x1="0" y1="0" ' +
                  'x2="' + (Math.sin(a * Math.PI / 180) * 1.8) + '" ' +
                  'y2="' + (-Math.cos(a * Math.PI / 180) * 1.8) + '" ' +
                  'stroke="#fbe064" stroke-width="0.5" opacity="0.85" />';
        });
        out += '</g>';
      }
      out += '</g>';
    }

    // Stage 6 — extra stalks + bloom celebration
    if (stage === 6) {
      out += bloomFx('#fbe064', ANCHOR_X, SOIL_Y - 180, 75, instanceId);

      out += bristlyStalk(ANCHOR_X + 22, SOIL_Y - 180, '#7aac5e', 2, 14);
      out += '<g transform="translate(' + (ANCHOR_X + 22) + ' ' + (SOIL_Y - 180) + ')">';
      [0, 90, 180, 270].forEach(function (rot) {
        out +=
          '<g transform="rotate(' + rot + ') scale(0.6)">' +
            '<path d="M 0 -2 Q -12 -10 -14 -20 Q -10 -28 -4 -28 Q 0 -30 4 -28 Q 10 -28 14 -20 Q 12 -10 0 -2 Z" fill="#fbe064" />' +
            '<path d="M -2 -6 Q -8 -14 -8 -22 Q -4 -26 0 -26 Q 4 -26 8 -22 Q 8 -14 2 -6 Z" fill="#fde88a" opacity="0.7" />' +
            '<line x1="0" y1="-6" x2="0" y2="-26" stroke="#d4a020" stroke-width="0.5" opacity="0.55" />' +
          '</g>';
      });
      out += '<circle r="3.5" fill="#2a1808" />';
      for (var j = 0; j < 14; j++) {
        var aj = (j / 14) * 360;
        out +=
          '<g transform="rotate(' + aj + ')">' +
            '<line x1="0" y1="0" x2="0" y2="-4.5" stroke="#5a3a18" stroke-width="0.4" />' +
            '<circle cx="0" cy="-5" r="0.6" fill="#1a0e08" />' +
          '</g>';
      }
      out += '<circle r="1.2" fill="#fbe064" /></g>';

      out += bristlyStalk(ANCHOR_X - 28, SOIL_Y - 140, '#7aac5e', 1.8, 12);
      out += '<g transform="translate(' + (ANCHOR_X - 28) + ' ' + (SOIL_Y - 140) + ') rotate(20)">' +
             poppyBud(1.0, 0.4, true) +
             '</g>';
    }

    return out;
  }

  // ══════════════════════════════════════════════════════════════════
  // HYDRANGEA · Hydrangea macrophylla
  // ══════════════════════════════════════════════════════════════════

  function hydrangeaLeaf(cx, cy, size, angle, color, vein) {
    size  = (size  == null) ? 1   : size;
    angle = (angle == null) ? 0   : angle;
    color = color || '#3e8a44';
    vein  = vein  || '#1a4220';
    var w = 18 * size;
    var h = 24 * size;
    var teeth = 9;
    var path = 'M 0 0 ';
    for (var i = 0; i < teeth; i++) {
      var t1 = (i + 0.4) / teeth;
      var t2 = (i + 1) / teeth;
      var wOut = (w / 2) * Math.sin(t1 * Math.PI);
      var wIn  = (w / 2) * Math.sin(t2 * Math.PI) * 0.82;
      path += 'Q ' + (wOut + 1.6) + ' ' + (-h * t1 + 1.2) + ' ' + wIn + ' ' + (-h * t2) + ' ';
    }
    path += 'L 0 ' + (-h) + ' ';
    for (var i2 = teeth - 1; i2 >= 0; i2--) {
      var t1b = (i2 + 0.4) / teeth;
      var t2b = i2 / teeth;
      var wOutb = -(w / 2) * Math.sin(t1b * Math.PI);
      var wInb  = -(w / 2) * Math.sin((i2 + 0.0) / teeth * Math.PI) * 0.82;
      path += 'Q ' + (wOutb - 1.6) + ' ' + (-h * t1b + 1.2) + ' ' + wInb + ' ' + (-h * t2b) + ' ';
    }
    path += 'Z';

    var laterals = '';
    for (var l = 1; l <= 6; l++) {
      var t = l / 7;
      var ly = -h * t;
      var lw = (w / 2) * Math.sin(t * Math.PI);
      laterals +=
        '<line x1="0" y1="' + (ly + 1) + '" x2="' + (lw * 0.88) + '" y2="' + (ly - 1.2) +
              '" stroke="' + vein + '" stroke-width="0.55" opacity="0.7" />' +
        '<line x1="0" y1="' + (ly + 1) + '" x2="' + (-lw * 0.88) + '" y2="' + (ly - 1.2) +
              '" stroke="' + vein + '" stroke-width="0.55" opacity="0.7" />';
    }

    return (
      '<g transform="translate(' + cx + ' ' + cy + ') rotate(' + angle + ')">' +
        '<path d="' + path + '" fill="' + color + '" />' +
        '<path d="' + path + '" fill="#1f5224" opacity="0.22" transform="translate(0.8 1.2)" />' +
        '<ellipse cx="' + (-w * 0.15) + '" cy="' + (-h * 0.55) + '" rx="' + (w * 0.15) + '" ry="' + (h * 0.25) + '" ' +
                 'fill="#fff" opacity="0.13" transform="rotate(-12 ' + (-w * 0.15) + ' ' + (-h * 0.55) + ')" />' +
        '<line x1="0" y1="0" x2="0" y2="' + (-h) + '" stroke="' + vein + '" stroke-width="0.85" opacity="0.85" />' +
        laterals +
      '</g>'
    );
  }

  function hydrangeaFloret(x, y, openness, tone, scale) {
    var palettes = [
      { p: '#9c84d8', d: '#6e54a0', c: '#fff' },
      { p: '#b8a4e4', d: '#7e62b0', c: '#fbe064' },
      { p: '#7a5cb8', d: '#503090', c: '#fff' },
      { p: '#a8c4e8', d: '#7898c4', c: '#fff' },
      { p: '#bea8e4', d: '#8e74c0', c: '#f0a4d8' },
    ];
    var pal = palettes[tone % palettes.length];
    var o = openness;
    var r = 3.6 * scale;
    var petals = '';
    [0, 90, 180, 270].forEach(function (rot) {
      petals +=
        '<g transform="rotate(' + rot + ')">' +
          '<path d="M 0 ' + (-1.4 * o) +
                  ' Q ' + (-r * 0.8) + ' ' + (-r * 1.1 * o) + ' ' + (-r * 0.55) + ' ' + (-r * 1.6 * o) +
                  ' Q 0 ' + (-r * 1.9 * o) + ' ' + (r * 0.55) + ' ' + (-r * 1.6 * o) +
                  ' Q ' + (r * 0.8) + ' ' + (-r * 1.1 * o) + ' 0 ' + (-1.4 * o) + ' Z" fill="' + pal.p + '" />' +
          '<line x1="0" y1="' + (-1 * o) + '" x2="0" y2="' + (-r * 1.7 * o) +
                '" stroke="' + pal.d + '" stroke-width="0.4" opacity="0.55" />' +
        '</g>';
    });
    var center = '';
    if (o > 0.5) {
      center += '<g>';
      [0, 90, 180, 270].forEach(function (rot) {
        center += '<circle cx="0" cy="-1.1" r="0.5" fill="#fbe064" transform="rotate(' + rot + ')" />';
      });
      center += '<circle r="0.9" fill="' + pal.c + '" /></g>';
    }
    return '<g transform="translate(' + x + ' ' + y + ')">' + petals + center + '</g>';
  }

  function hydrangeaContent(stage, instanceId) {
    var stemH = [0, 18, 100, 160, 205, 235, 244][stage];
    var tipY = SOIL_Y - stemH;
    var pairs = stage >= 5 ? 4 : stage >= 4 ? 3 : stage >= 3 ? 3 : stage >= 2 ? 2 : 0;
    var out = '';

    var corymb = [
      { x: 0,   y: 0 },
      { x:  8,  y:  0 },   { x: -8,  y:  0 },
      { x:  4,  y: -6.8 }, { x: -4,  y: -6.8 },
      { x:  4,  y:  6.8 }, { x: -4,  y:  6.8 },
      { x:  16, y:  0 },   { x: -16, y:  0 },
      { x:  12, y: -7.5 }, { x: -12, y: -7.5 },
      { x:  12, y:  7.5 }, { x: -12, y:  7.5 },
      { x:  4,  y: -14 },  { x: -4,  y: -14 },
      { x:  4,  y:  14 },  { x: -4,  y:  14 },
      { x:  8,  y: -13 },  { x: -8,  y: -13 },
      { x:  8,  y:  13 },  { x: -8,  y:  13 },
    ];

    // Stage 0 — tiny seeds
    if (stage === 0) {
      out += '<g>';
      [-2, 0, 2].forEach(function (dx) {
        out += '<circle cx="' + (ANCHOR_X + dx) + '" cy="' + (SOIL_Y - 1.5) + '" r="0.6" fill="#2a1808" />';
      });
      out += '<ellipse cx="' + ANCHOR_X + '" cy="' + (SOIL_Y - 0.5) + '" rx="4" ry="0.7" fill="#4a3a2a" opacity="0.5" /></g>';
    }

    // Stage 1 — cotyledons
    if (stage === 1) {
      out +=
        '<g>' +
          '<line x1="' + ANCHOR_X + '" y1="' + SOIL_Y + '" x2="' + ANCHOR_X + '" y2="' + (SOIL_Y - 8) +
                '" stroke="#6a9450" stroke-width="1.4" stroke-linecap="round" />' +
          '<ellipse cx="' + (ANCHOR_X - 6) + '" cy="' + (SOIL_Y - 8) + '" rx="6" ry="1.8" ' +
                   'fill="#7aac5e" transform="rotate(-10 ' + (ANCHOR_X - 6) + ' ' + (SOIL_Y - 8) + ')" />' +
          '<ellipse cx="' + (ANCHOR_X + 6) + '" cy="' + (SOIL_Y - 8) + '" rx="6" ry="1.8" ' +
                   'fill="#7aac5e" transform="rotate(10 ' + (ANCHOR_X + 6) + ' ' + (SOIL_Y - 8) + ')" />' +
          '<line x1="' + (ANCHOR_X - 1) + '" y1="' + (SOIL_Y - 8) + '" x2="' + (ANCHOR_X - 11) + '" y2="' + (SOIL_Y - 9) +
                '" stroke="#3e6a32" stroke-width="0.4" />' +
          '<line x1="' + (ANCHOR_X + 1) + '" y1="' + (SOIL_Y - 8) + '" x2="' + (ANCHOR_X + 11) + '" y2="' + (SOIL_Y - 9) +
                '" stroke="#3e6a32" stroke-width="0.4" />' +
          '<ellipse cx="' + (ANCHOR_X - 3) + '" cy="' + (SOIL_Y - 10) + '" rx="2.6" ry="1.2" ' +
                   'fill="#5a8e44" transform="rotate(-50 ' + (ANCHOR_X - 3) + ' ' + (SOIL_Y - 10) + ')" />' +
          '<ellipse cx="' + (ANCHOR_X + 3) + '" cy="' + (SOIL_Y - 10) + '" rx="2.6" ry="1.2" ' +
                   'fill="#5a8e44" transform="rotate(50 ' + (ANCHOR_X + 3) + ' ' + (SOIL_Y - 10) + ')" />' +
        '</g>';
    }

    // Stage 2+ — woody stem with opposite leaf pairs
    if (stage >= 2) {
      out +=
        '<path d="M ' + (ANCHOR_X - 1.8) + ' ' + SOIL_Y +
                ' L ' + (ANCHOR_X - 1.4) + ' ' + tipY +
                ' L ' + (ANCHOR_X + 1.4) + ' ' + tipY +
                ' L ' + (ANCHOR_X + 1.8) + ' ' + SOIL_Y + ' Z" fill="#4a6230" />' +
        '<line x1="' + (ANCHOR_X - 1) + '" y1="' + SOIL_Y + '" ' +
              'x2="' + (ANCHOR_X - 0.6) + '" y2="' + tipY + '" ' +
              'stroke="#7a9a5a" stroke-width="0.5" opacity="0.7" />';
      for (var p = 0; p < pairs; p++) {
        var ny = SOIL_Y - 18 - p * 30;
        out += '<ellipse cx="' + ANCHOR_X + '" cy="' + ny + '" rx="2.2" ry="1.2" fill="#2a4220" />';
      }
      for (var p2 = 0; p2 < pairs; p2++) {
        var ly = SOIL_Y - 18 - p2 * 30;
        var lsize = (stage >= 3 ? 1.1 : 0.85) - p2 * 0.12;
        var lszc = Math.max(0.5, lsize);
        out += hydrangeaLeaf(ANCHOR_X - 1.4, ly, lszc, -80) +
               hydrangeaLeaf(ANCHOR_X + 1.4, ly, lszc,  80);
      }
    }

    // Stage 3+ — corymb at top of stem
    if (stage >= 3) {
      out += '<g transform="translate(' + ANCHOR_X + ' ' + (tipY - 6) + ')">';
      out += '<ellipse cx="0" cy="6" rx="6" ry="3" fill="#3e6a2a" opacity="0.85" />';
      var slice = stage === 3 ? 7 : corymb.length;
      for (var c = 0; c < slice; c++) {
        var f = corymb[c];
        out += '<line x1="0" y1="5" x2="' + (f.x * 0.85) + '" y2="' + (f.y * 0.85 + 1) +
                     '" stroke="#3e6a2a" stroke-width="0.5" opacity="0.7" />';
      }

      if (stage === 3) {
        for (var c3 = 0; c3 < 7; c3++) {
          var f3 = corymb[c3];
          out +=
            '<g>' +
              '<circle cx="' + f3.x + '" cy="' + f3.y + '" r="2.2" fill="#5a8844" />' +
              '<circle cx="' + (f3.x - 0.4) + '" cy="' + (f3.y - 0.5) + '" r="0.6" fill="#7aac5e" opacity="0.6" />' +
              '<line x1="' + (f3.x - 1) + '" y1="' + f3.y + '" x2="' + (f3.x + 1) + '" y2="' + f3.y +
                    '" stroke="#2e5024" stroke-width="0.4" />' +
              '<line x1="' + f3.x + '" y1="' + (f3.y - 1) + '" x2="' + f3.x + '" y2="' + (f3.y + 1) +
                    '" stroke="#2e5024" stroke-width="0.4" />' +
            '</g>';
        }
      }
      if (stage === 4) {
        for (var c4 = 0; c4 < 13; c4++) {
          var f4 = corymb[c4];
          out += hydrangeaFloret(f4.x, f4.y, 0.35, c4 % 5, 0.85);
        }
      }
      if (stage === 5) {
        for (var c5 = 0; c5 < corymb.length; c5++) {
          var f5 = corymb[c5];
          out += hydrangeaFloret(f5.x, f5.y, 0.7, c5 % 5, 0.95);
        }
      }
      if (stage === 6) {
        for (var c6 = 0; c6 < corymb.length; c6++) {
          var f6 = corymb[c6];
          out += hydrangeaFloret(f6.x, f6.y, 1, c6 % 5, 1.05);
        }
        var outers = [
          { x: 18, y: -10 }, { x: -18, y: -10 },
          { x: 18, y:  10 }, { x: -18, y:  10 },
          { x:  0, y: -18 }, { x:   0, y:  18 },
        ];
        outers.forEach(function (f, i) {
          out += hydrangeaFloret(f.x, f.y, 1, (i + 2) % 5, 0.9);
        });
        out += '<g transform="translate(28 18)">';
        for (var sb = 0; sb < 14; sb++) {
          var fb = corymb[sb];
          out += hydrangeaFloret(fb.x * 0.6, fb.y * 0.6, 1, (sb + 3) % 5, 0.7);
        }
        out += '</g><g transform="translate(-26 26)">';
        for (var sc = 0; sc < 9; sc++) {
          var fc = corymb[sc];
          out += hydrangeaFloret(fc.x * 0.5, fc.y * 0.5, 1, (sc + 1) % 5, 0.6);
        }
        out += '</g>';
      }
      out += '</g>';
    }

    if (stage === 6) {
      out += bloomFx('#9c84d8', ANCHOR_X, tipY - 4, 75, instanceId);
    }
    return out;
  }

  // ══════════════════════════════════════════════════════════════════
  // HIBISCUS · Hibiscus rosa-sinensis
  // ══════════════════════════════════════════════════════════════════

  function hibiscusLeaf(cx, cy, size, angle, color, vein) {
    size  = (size  == null) ? 1   : size;
    angle = (angle == null) ? 0   : angle;
    color = color || '#2e7a36';
    vein  = vein  || '#1a4220';
    var w = 14 * size;
    var h = 22 * size;
    var path =
      'M 0 0 ' +
      'Q ' + (-w * 0.2)  + ' ' + (-h * 0.15) + ' ' + (-w * 0.55) + ' ' + (-h * 0.30) + ' ' +
      'Q ' + (-w * 0.65) + ' ' + (-h * 0.45) + ' ' + (-w * 0.45) + ' ' + (-h * 0.55) + ' ' +
      'Q ' + (-w * 0.6)  + ' ' + (-h * 0.75) + ' ' + (-w * 0.30) + ' ' + (-h * 0.80) + ' ' +
      'Q ' + (-w * 0.20) + ' ' + (-h * 0.95) + ' 0 ' + (-h) + ' ' +
      'Q ' + (w * 0.20)  + ' ' + (-h * 0.95) + ' ' + (w * 0.30)  + ' ' + (-h * 0.80) + ' ' +
      'Q ' + (w * 0.6)   + ' ' + (-h * 0.75) + ' ' + (w * 0.45)  + ' ' + (-h * 0.55) + ' ' +
      'Q ' + (w * 0.65)  + ' ' + (-h * 0.45) + ' ' + (w * 0.55)  + ' ' + (-h * 0.30) + ' ' +
      'Q ' + (w * 0.2)   + ' ' + (-h * 0.15) + ' 0 0 Z';

    var veins = [
      { x: 0,         y: -h },
      { x: -w * 0.45, y: -h * 0.55 },
      { x:  w * 0.45, y: -h * 0.55 },
      { x: -w * 0.55, y: -h * 0.30 },
      { x:  w * 0.55, y: -h * 0.30 },
    ];
    var veinLines = '';
    for (var v = 1; v < veins.length; v++) {
      veinLines +=
        '<line x1="0" y1="0" x2="' + veins[v].x + '" y2="' + veins[v].y +
              '" stroke="' + vein + '" stroke-width="0.5" opacity="0.5" />';
    }

    return (
      '<g transform="translate(' + cx + ' ' + cy + ') rotate(' + angle + ')">' +
        '<path d="' + path + '" fill="' + color + '" />' +
        '<ellipse cx="' + (-w * 0.12) + '" cy="' + (-h * 0.55) + '" rx="' + (w * 0.18) + '" ry="' + (h * 0.30) + '" ' +
                 'fill="#fff" opacity="0.14" transform="rotate(-10 ' + (-w * 0.12) + ' ' + (-h * 0.55) + ')" />' +
        '<path d="' + path + '" fill="#1a5024" opacity="0.18" transform="translate(1.5 2)" />' +
        '<line x1="0" y1="0" x2="0" y2="' + (-h) + '" stroke="' + vein + '" stroke-width="0.9" opacity="0.7" />' +
        veinLines +
      '</g>'
    );
  }

  function hibiscusBloom(scale) {
    var s = scale == null ? 1 : scale;
    var petals = '';
    [0, 72, 144, 216, 288].forEach(function (rot) {
      petals +=
        '<g transform="rotate(' + rot + ')">' +
          '<path d="M 0 -2' +
                  ' Q ' + (-12 * s) + ' ' + (-14 * s) + ' ' + (-14 * s) + ' ' + (-26 * s) +
                  ' Q ' + (-12 * s) + ' ' + (-32 * s) + ' ' + (-6 * s)  + ' ' + (-34 * s) +
                  ' Q 0 ' + (-36 * s) + ' ' + (6 * s)  + ' ' + (-34 * s) +
                  ' Q ' + (12 * s)  + ' ' + (-32 * s) + ' ' + (14 * s)  + ' ' + (-26 * s) +
                  ' Q ' + (12 * s)  + ' ' + (-14 * s) + ' 0 -2 Z" fill="#e63465" />' +
          '<path d="M -3 -8' +
                  ' Q ' + (-9 * s) + ' ' + (-18 * s) + ' ' + (-7 * s) + ' ' + (-28 * s) +
                  ' Q 0 ' + (-30 * s) + ' ' + (7 * s) + ' ' + (-28 * s) +
                  ' Q ' + (9 * s) + ' ' + (-18 * s) + ' 3 -8 Z" fill="#f78aa6" opacity="0.5" />' +
          '<path d="M 0 0' +
                  ' Q ' + (-3 * s) + ' ' + (-6 * s) + ' ' + (-4 * s) + ' ' + (-12 * s) +
                  ' L ' + (4 * s) + ' ' + (-12 * s) +
                  ' Q ' + (3 * s) + ' ' + (-6 * s) + ' 0 0 Z" fill="#9c1842" opacity="0.55" />' +
          '<line x1="0" y1="-2" x2="0" y2="' + (-34 * s) + '" stroke="#9c1842" stroke-width="0.55" opacity="0.5" />' +
          '<line x1="0" y1="-2" x2="' + (-7 * s) + '" y2="' + (-28 * s) + '" stroke="#9c1842" stroke-width="0.4" opacity="0.4" />' +
          '<line x1="0" y1="-2" x2="' + (7 * s)  + '" y2="' + (-28 * s) + '" stroke="#9c1842" stroke-width="0.4" opacity="0.4" />' +
        '</g>';
    });

    var anthers = '';
    var anthData = [
      { dx: -2.4, dy: -22 }, { dx:  2.2, dy: -25 }, { dx: -1.6, dy: -27 },
      { dx:  2.8, dy: -29 }, { dx: -2.0, dy: -31 },
    ];
    anthData.forEach(function (p) {
      anthers +=
        '<g>' +
          '<line x1="0" y1="' + (p.dy * s + 4) + '" x2="' + (p.dx * s) + '" y2="' + (p.dy * s) +
                '" stroke="#c41e4a" stroke-width="' + (0.7 * s) + '" />' +
          '<circle cx="' + (p.dx * s) + '" cy="' + (p.dy * s) + '" r="' + (1.4 * s) + '" fill="#fbe064" />' +
          '<circle cx="' + (p.dx * s - 0.4) + '" cy="' + (p.dy * s - 0.4) + '" r="' + (0.6 * s) + '" fill="#fff8c8" />' +
        '</g>';
    });

    var stigma = '<g transform="translate(0 ' + (-33 * s) + ')">';
    [0, 72, 144, 216, 288].forEach(function (rot) {
      stigma += '<circle r="' + (1.2 * s) + '" cx="0" cy="' + (-1.5 * s) + '" fill="#c41e4a" transform="rotate(' + rot + ')" />';
    });
    stigma += '<circle r="' + (1.6 * s) + '" fill="#9c1842" /></g>';

    return (
      '<g>' +
        petals +
        '<circle r="' + (5 * s) + '" fill="#4a0820" />' +
        '<circle r="' + (3 * s) + '" fill="#2a0410" />' +
        '<line x1="0" y1="0" x2="0" y2="' + (-30 * s) + '" stroke="#c41e4a" ' +
              'stroke-width="' + (1.6 * s) + '" stroke-linecap="round" />' +
        anthers +
        stigma +
      '</g>'
    );
  }

  function hibiscusContent(stage, instanceId) {
    var stemH = [0, 22, 110, 165, 210, 235, 246][stage];
    var tipY = SOIL_Y - stemH;
    var leafCount = stage >= 4 ? 6 : stage >= 3 ? 4 : stage >= 2 ? 3 : 0;
    var out = '';

    if (stage === 0) {
      out +=
        '<g>' +
          '<ellipse cx="' + ANCHOR_X + '" cy="' + (SOIL_Y - 2) + '" rx="3.2" ry="2.2" fill="#4a2810" />' +
          '<ellipse cx="' + (ANCHOR_X - 0.6) + '" cy="' + (SOIL_Y - 2.6) + '" rx="1.2" ry="0.6" fill="#7a4a20" opacity="0.65" />' +
          '<line x1="' + (ANCHOR_X - 1.5) + '" y1="' + (SOIL_Y - 1.5) + '" x2="' + (ANCHOR_X + 1.5) + '" y2="' + (SOIL_Y - 1.5) +
                '" stroke="#1a0a04" stroke-width="0.4" opacity="0.7" />' +
        '</g>';
    }

    if (stage === 1) {
      out +=
        '<g>' +
          '<path d="M ' + ANCHOR_X + ' ' + SOIL_Y + ' Q ' + (ANCHOR_X + 3) + ' ' + (SOIL_Y - 6) +
                ' ' + ANCHOR_X + ' ' + (SOIL_Y - 12) + '" fill="none" stroke="#6c9444" stroke-width="1.6" stroke-linecap="round" />' +
          '<ellipse cx="' + (ANCHOR_X - 5) + '" cy="' + (SOIL_Y - 12) + '" rx="5" ry="2.6" ' +
                   'fill="#84b864" transform="rotate(-25 ' + (ANCHOR_X - 5) + ' ' + (SOIL_Y - 12) + ')" />' +
          '<ellipse cx="' + (ANCHOR_X + 5) + '" cy="' + (SOIL_Y - 12) + '" rx="5" ry="2.6" ' +
                   'fill="#84b864" transform="rotate(25 ' + (ANCHOR_X + 5) + ' ' + (SOIL_Y - 12) + ')" />' +
          '<circle cx="' + ANCHOR_X + '" cy="' + (SOIL_Y - 13) + '" r="1.1" fill="#3a6428" />' +
          '<line x1="' + ANCHOR_X + '" y1="' + SOIL_Y + '" x2="' + (ANCHOR_X - 3) + '" y2="' + (SOIL_Y + 4) +
                '" stroke="#7a5a3a" stroke-width="0.5" opacity="0.55" />' +
          '<line x1="' + ANCHOR_X + '" y1="' + SOIL_Y + '" x2="' + (ANCHOR_X + 4) + '" y2="' + (SOIL_Y + 5) +
                '" stroke="#7a5a3a" stroke-width="0.5" opacity="0.55" />' +
        '</g>';
    }

    if (stage >= 2) {
      out +=
        '<path d="M ' + (ANCHOR_X - 2) + ' ' + SOIL_Y +
                ' L ' + (ANCHOR_X - 1.5) + ' ' + tipY +
                ' L ' + (ANCHOR_X + 1.5) + ' ' + tipY +
                ' L ' + (ANCHOR_X + 2) + ' ' + SOIL_Y + ' Z" fill="#4a3018" />' +
        '<line x1="' + (ANCHOR_X - 1.2) + '" y1="' + SOIL_Y + '" x2="' + (ANCHOR_X - 0.8) + '" y2="' + tipY +
              '" stroke="#7a5430" stroke-width="0.6" opacity="0.85" />';
      var scarCount = Math.max(0, leafCount - 1);
      for (var sc = 0; sc < scarCount; sc++) {
        out +=
          '<path d="M ' + (ANCHOR_X - 2.2) + ' ' + (SOIL_Y - 22 - sc * 22) +
                  ' L ' + ANCHOR_X + ' ' + (SOIL_Y - 23 - sc * 22) +
                  ' L ' + (ANCHOR_X + 2.2) + ' ' + (SOIL_Y - 22 - sc * 22) + '" ' +
                  'fill="none" stroke="#2a1808" stroke-width="0.5" opacity="0.7" />';
      }
      for (var li = 0; li < leafCount; li++) {
        var ly = SOIL_Y - 20 - li * 22;
        var left = li % 2 === 0;
        var lsize = stage >= 3 ? 1.1 : 0.85;
        out += hibiscusLeaf(ANCHOR_X + (left ? -2 : 2), ly, lsize, left ? -78 : 78);
      }
    }

    if (stage === 3) {
      out += '<g transform="translate(' + (ANCHOR_X - 2) + ' ' + tipY + ')">' +
               '<path d="M 0 8 Q -2 0 0 -4" fill="none" stroke="#3a8a3e" stroke-width="1.4" />' +
               '<g transform="translate(0 -8)">';
      [-30, -10, 10, 30].forEach(function (a) {
        out += '<ellipse cx="' + (Math.sin(a * Math.PI / 180) * 2) + '" cy="0" rx="1.6" ry="5" ' +
                       'fill="#3a7a32" stroke="#2a5824" stroke-width="0.3" transform="rotate(' + (a * 0.6) + ')" />';
      });
      out += '<ellipse cx="0" cy="-5" rx="3.2" ry="5.5" fill="#4a8a3e" />';
      [-2, 0, 2].forEach(function (dx) {
        out += '<line x1="' + dx + '" y1="-1" x2="' + (dx * 0.6) + '" y2="-9" ' +
                     'stroke="#2e6224" stroke-width="0.5" opacity="0.7" />';
      });
      out += '</g></g>';
    }

    if (stage === 4) {
      out += '<g transform="translate(' + (ANCHOR_X - 2) + ' ' + tipY + ')">' +
               '<path d="M 0 10 Q -2 2 0 -3" fill="none" stroke="#3a8a3e" stroke-width="1.6" />' +
               '<g transform="translate(0 -4)">';
      [-50, -25, 0, 25, 50].forEach(function (a) {
        out += '<path d="M 0 0 Q ' + (Math.sin(a * Math.PI / 180) * 5) + ' -4 ' +
                       (Math.sin(a * Math.PI / 180) * 4) + ' -10 Z" ' +
                       'fill="#3a7a32" stroke="#2a5824" stroke-width="0.3" />';
      });
      out += '<path d="M -3.5 -2 Q -3.5 -14 0 -20 Q 3.5 -14 3.5 -2 Z" fill="#8eae3a" />' +
             '<path d="M -2 -8 Q -2.4 -16 0 -20 Q 2.4 -16 2 -8 Z" fill="#c43a4a" opacity="0.8" />';
      [-2, -1, 0, 1, 2].forEach(function (dx) {
        out += '<line x1="' + dx + '" y1="-3" x2="' + (dx * 0.4) + '" y2="-19" ' +
                     'stroke="#9c1842" stroke-width="0.45" opacity="0.55" />';
      });
      out += '<ellipse cx="0" cy="-19" rx="1.6" ry="1.2" fill="#e63465" /></g></g>';
    }

    if (stage === 5) {
      out += '<g transform="translate(' + (ANCHOR_X - 2) + ' ' + tipY + ')">' +
               '<path d="M 0 12 Q -2 4 0 -2" fill="none" stroke="#3a8a3e" stroke-width="1.8" />';
      var sepals = [
        { rot: -55, d: 'M 0 0 Q -10 -2 -8 -10' },
        { rot: -25, d: 'M 0 0 Q -6  -4 -5 -12' },
        { rot:  25, d: 'M 0 0 Q  6  -4  5 -12' },
        { rot:  55, d: 'M 0 0 Q  10 -2  8 -10' },
      ];
      sepals.forEach(function (sp) {
        out += '<path d="' + sp.d + '" fill="none" stroke="#3a7a32" stroke-width="2.2" stroke-linecap="round" />';
      });
      out += '<g transform="translate(0 -8)">';
      [0, 72, 144, 216, 288].forEach(function (rot) {
        out += '<path d="M 0 0 Q -6 -10 -4 -18 Q 0 -22 4 -18 Q 6 -10 0 0 Z" fill="#e63465" opacity="0.95" ' +
                       'transform="rotate(' + rot + ') scale(0.85)" />';
      });
      out +=
        '<circle r="2" fill="#4a0820" />' +
        '<line x1="0" y1="0" x2="0" y2="-12" stroke="#c41e4a" stroke-width="1" />' +
        '<circle cx="0" cy="-13" r="1.5" fill="#fbe064" />' +
        '</g></g>';
    }

    if (stage === 6) {
      out += bloomFx('#e63465', ANCHOR_X, tipY - 4, 68, instanceId);
      out += '<g transform="translate(' + (ANCHOR_X + 24) + ' ' + (tipY + 38) + ')">' + hibiscusBloom(0.7)  + '</g>';
      out += '<g transform="translate(' + (ANCHOR_X - 26) + ' ' + (tipY + 62) + ')">' + hibiscusBloom(0.55) + '</g>';
      out +=
        '<g transform="translate(' + (ANCHOR_X + 14) + ' ' + (tipY + 86) + ')">' +
          '<path d="M 0 8 Q -3 0 -2 -10 L 0 -12 L 2 -10 Q 3 0 0 8 Z" fill="#3a8a3e" />' +
          '<path d="M -1.6 -2 Q -1.6 -10 0 -12 Q 1.6 -10 1.6 -2 Z" fill="#c43a4a" opacity="0.7" />' +
          '<path d="M -3 8 Q -1 -2 0 -2 Q 1 -2 3 8 Z" fill="#2e6224" />' +
        '</g>';
      out += '<g transform="translate(' + (ANCHOR_X - 2) + ' ' + (tipY - 4) + ')">' + hibiscusBloom(1) + '</g>';
    }
    return out;
  }

  // ══════════════════════════════════════════════════════════════════
  // CACTUS BLOSSOM · Echinopsis sp.
  // ══════════════════════════════════════════════════════════════════

  function areole(cx, cy, spines, spineLen, wool, spineColor, centralColor) {
    spines       = (spines       == null) ? 6        : spines;
    spineLen     = (spineLen     == null) ? 4        : spineLen;
    wool         = wool         || '#fff8e4';
    spineColor   = spineColor   || '#dac88a';
    centralColor = centralColor || '#3a2010';
    var items = '';
    for (var i = 0; i < spines; i++) {
      var a = (i / spines) * Math.PI * 2 - Math.PI / 2 + 0.2;
      var x2 = Math.cos(a) * spineLen;
      var y2 = Math.sin(a) * spineLen;
      items +=
        '<line x1="' + cx + '" y1="' + cy + '" x2="' + (cx + x2) + '" y2="' + (cy + y2) +
              '" stroke="' + spineColor + '" stroke-width="0.55" />';
    }
    return (
      '<g>' +
        '<circle cx="' + cx + '" cy="' + cy + '" r="1.2" fill="' + wool + '" opacity="0.95" />' +
        '<circle cx="' + (cx + 0.3) + '" cy="' + (cy - 0.3) + '" r="0.4" fill="#fff" opacity="0.7" />' +
        items +
        '<line x1="' + cx + '" y1="' + cy + '" x2="' + (cx + 0.6) + '" y2="' + (cy - spineLen * 1.1) +
              '" stroke="' + centralColor + '" stroke-width="0.7" />' +
      '</g>'
    );
  }

  function cactusBody(height, width) {
    height = (height == null) ? 100 : height;
    width  = (width  == null) ? 40  : width;
    var top = SOIL_Y - height;
    var ribs = 5;
    var halfW = width / 2;

    var body =
      '<path d="M ' + (ANCHOR_X - halfW) + ' ' + (SOIL_Y - 2) +
              ' Q ' + (ANCHOR_X - halfW * 1.1) + ' ' + ((SOIL_Y + top) / 2) +
              ' ' + (ANCHOR_X - halfW * 0.65) + ' ' + (top + 6) +
              ' Q ' + (ANCHOR_X - halfW * 0.45) + ' ' + (top - 2) +
              ' ' + ANCHOR_X + ' ' + (top - 2) +
              ' Q ' + (ANCHOR_X + halfW * 0.45) + ' ' + (top - 2) +
              ' ' + (ANCHOR_X + halfW * 0.65) + ' ' + (top + 6) +
              ' Q ' + (ANCHOR_X + halfW * 1.1) + ' ' + ((SOIL_Y + top) / 2) +
              ' ' + (ANCHOR_X + halfW) + ' ' + (SOIL_Y - 2) + ' Z" fill="#4a8a3e" />';

    var rvalleys = '';
    for (var r = 0; r < ribs - 1; r++) {
      var t = (r + 1) / ribs;
      var rx = ANCHOR_X - halfW + width * t;
      rvalleys +=
        '<path d="M ' + rx + ' ' + (SOIL_Y - 2) +
                ' Q ' + (rx + (t - 0.5) * 1.5) + ' ' + ((SOIL_Y + top) / 2) +
                ' ' + (rx + (t - 0.5) * 3) + ' ' + (top + 4) + '" ' +
                'fill="none" stroke="#3a6a2c" stroke-width="2" opacity="0.7" />';
    }

    var shadow =
      '<path d="M ' + (ANCHOR_X + halfW * 0.7) + ' ' + (SOIL_Y - 4) +
              ' Q ' + (ANCHOR_X + halfW * 0.95) + ' ' + ((SOIL_Y + top) / 2) +
              ' ' + (ANCHOR_X + halfW * 0.55) + ' ' + (top + 6) +
              ' L ' + (ANCHOR_X + halfW * 0.65) + ' ' + (top + 6) +
              ' Q ' + (ANCHOR_X + halfW * 1.1) + ' ' + ((SOIL_Y + top) / 2) +
              ' ' + (ANCHOR_X + halfW) + ' ' + (SOIL_Y - 2) +
              ' L ' + (ANCHOR_X + halfW * 0.85) + ' ' + (SOIL_Y - 2) + ' Z" fill="#2e5c24" opacity="0.5" />';

    var hl =
      '<path d="M ' + (ANCHOR_X - halfW * 0.85) + ' ' + (SOIL_Y - 4) +
              ' Q ' + (ANCHOR_X - halfW * 1.0) + ' ' + ((SOIL_Y + top) / 2) +
              ' ' + (ANCHOR_X - halfW * 0.6) + ' ' + (top + 8) + '" ' +
              'fill="none" stroke="#7cc068" stroke-width="1.6" opacity="0.6" />';

    return '<g>' + body + rvalleys + shadow + hl + '</g>';
  }

  function cactusBud(length, openness, colorHint) {
    length = (length == null) ? 12 : length;
    openness = (openness == null) ? 0 : openness;
    colorHint = !!colorHint;
    var w = 5 + openness * 2;
    var colorTip = openness > 0.4 ? '#f4a0c0' : colorHint ? '#bcd470' : '#5aa044';

    var scales = '';
    var wool = '';
    for (var i = 0; i < 5; i++) {
      var t = (i + 0.5) / 5;
      var y = -length * t;
      scales +=
        '<g>' +
          '<path d="M ' + (-w * 0.7) + ' ' + y + ' l 2 -1.5 l 1 1.5 z" fill="#3e6a32" opacity="0.85" />' +
          '<path d="M ' + (w * 0.7)  + ' ' + y + ' l -2 -1.5 l -1 1.5 z" fill="#3e6a32" opacity="0.85" />' +
        '</g>';
      wool +=
        '<g>' +
          '<circle cx="' + (-w * 0.6) + '" cy="' + (y - 0.6) + '" r="0.6" fill="#fff8e4" opacity="0.9" />' +
          '<circle cx="' + ( w * 0.6) + '" cy="' + (y - 0.6) + '" r="0.6" fill="#fff8e4" opacity="0.9" />' +
          '<line x1="' + (-w * 0.7) + '" y1="' + (y - 0.8) + '" x2="' + (-w * 0.85) + '" y2="' + (y - 2.3) +
                '" stroke="#fff8e4" stroke-width="0.4" opacity="0.85" />' +
          '<line x1="' + ( w * 0.7) + '" y1="' + (y - 0.8) + '" x2="' + ( w * 0.85) + '" y2="' + (y - 2.3) +
                '" stroke="#fff8e4" stroke-width="0.4" opacity="0.85" />' +
        '</g>';
    }

    return (
      '<g>' +
        '<path d="M ' + (-w * 0.4) + ' 4' +
                ' Q ' + (-w) + ' -4 ' + (-w * 0.85) + ' ' + (-length * 0.5) +
                ' Q ' + (-w * 0.6) + ' ' + (-length) + ' 0 ' + (-length) +
                ' Q ' + (w * 0.6) + ' ' + (-length) + ' ' + (w * 0.85) + ' ' + (-length * 0.5) +
                ' Q ' + w + ' -4 ' + (w * 0.4) + ' 4 Z" fill="#5aa044" />' +
        (colorHint
          ? '<path d="M ' + (-w * 0.55) + ' ' + (-length * 0.4) +
                  ' Q ' + (-w * 0.5) + ' ' + (-length * 0.85) + ' 0 ' + (-length) +
                  ' Q ' + (w * 0.5) + ' ' + (-length * 0.85) + ' ' + (w * 0.55) + ' ' + (-length * 0.4) +
                  ' Z" fill="' + colorTip + '" opacity="0.92" />'
          : '') +
        scales + wool +
      '</g>'
    );
  }

  function cactusBlossomContent(stage, instanceId) {
    var cactusH = [0, 14, 110, 155, 195, 220, 230][stage];
    var cactusW = stage >= 2 ? 50 : stage >= 1 ? 14 : 0;
    var top = SOIL_Y - cactusH;
    var showPup = stage >= 4;
    var out = '';

    // areole positions
    var ribCount = 5;
    var rowCount = Math.max(0, Math.floor(cactusH / 16));
    var positions = [];
    for (var r = 0; r < rowCount; r++) {
      var yT = (r + 0.6) / rowCount;
      var y = top + cactusH * yT;
      if (yT < 0.12 && stage >= 3) continue;
      for (var ri = 0; ri < ribCount; ri++) {
        var ribT = ri / (ribCount - 1);
        var bend = Math.sin(yT * Math.PI) * 0.95;
        var x = ANCHOR_X - cactusW / 2 + cactusW * ribT * (0.5 + bend * 0.5) + cactusW * (1 - bend) * 0.25;
        positions.push({ x: x, y: y, rib: ri });
      }
    }

    if (stage === 0) {
      out +=
        '<g>' +
          '<circle cx="' + ANCHOR_X + '" cy="' + (SOIL_Y - 2) + '" r="1.8" fill="#2a1408" />' +
          '<circle cx="' + (ANCHOR_X - 0.4) + '" cy="' + (SOIL_Y - 2.4) + '" r="0.5" fill="#6a3a18" opacity="0.7" />' +
          '<circle cx="' + (ANCHOR_X - 6) + '" cy="' + (SOIL_Y + 0.5) + '" r="0.7" fill="#d6a060" opacity="0.7" />' +
          '<circle cx="' + (ANCHOR_X + 5) + '" cy="' + (SOIL_Y + 1.5) + '" r="0.6" fill="#d6a060" opacity="0.7" />' +
          '<circle cx="' + (ANCHOR_X + 8) + '" cy="' + (SOIL_Y - 0.5) + '" r="0.5" fill="#b88040" opacity="0.7" />' +
        '</g>';
    }

    if (stage === 1) {
      out +=
        '<g>' +
          '<ellipse cx="' + ANCHOR_X + '" cy="' + (SOIL_Y - 4) + '" rx="6" ry="4.5" fill="#5aa044" />' +
          '<ellipse cx="' + (ANCHOR_X + 2.5) + '" cy="' + (SOIL_Y - 3) + '" rx="1.8" ry="3" fill="#3a7430" opacity="0.6" />' +
          areole(ANCHOR_X, SOIL_Y - 8, 5, 2.6) +
          areole(ANCHOR_X - 3.5, SOIL_Y - 5, 4, 2) +
          areole(ANCHOR_X + 3.5, SOIL_Y - 5, 4, 2) +
        '</g>';
    }

    if (stage >= 2) {
      if (showPup) {
        out +=
          '<g>' +
            '<ellipse cx="' + (ANCHOR_X - cactusW / 2 - 6) + '" cy="' + (SOIL_Y - 8) + '" rx="6" ry="9" fill="#4a8a3e" />' +
            areole(ANCHOR_X - cactusW / 2 - 6, SOIL_Y - 14, 5, 2.8) +
            areole(ANCHOR_X - cactusW / 2 - 9, SOIL_Y - 8, 4, 2.2) +
            areole(ANCHOR_X - cactusW / 2 - 4, SOIL_Y - 6, 4, 2.2) +
          '</g>';
      }
      out += cactusBody(cactusH, cactusW);
      for (var pi = 0; pi < positions.length; pi++) {
        var pos = positions[pi];
        out += areole(pos.x, pos.y, 6 + (pos.rib % 2 ? 1 : 0), 5);
      }
    }

    if (stage === 3) {
      out += '<g transform="translate(' + ANCHOR_X + ' ' + (top + 2) + ')">' +
               '<ellipse cx="0" cy="-1" rx="5" ry="2" fill="#fff8e4" opacity="0.85" />' +
               cactusBud(9, 0, false) +
             '</g>';
    }
    if (stage === 4) {
      out += '<g transform="translate(' + ANCHOR_X + ' ' + top + ')">' +
               '<ellipse cx="0" cy="-1" rx="6" ry="2.5" fill="#fff8e4" opacity="0.7" />' +
               cactusBud(20, 0.3, true) +
             '</g>';
    }
    if (stage === 5) {
      out += '<g transform="translate(' + ANCHOR_X + ' ' + top + ')">' +
               cactusBud(26, 0.7, true) +
               '<path d="M -5 -10 Q -10 -14 -10 -22" fill="none" stroke="#4a8a3e" stroke-width="1.6" stroke-linecap="round" />' +
               '<path d="M  5 -10 Q  10 -14  10 -22" fill="none" stroke="#4a8a3e" stroke-width="1.6" stroke-linecap="round" />' +
               '<path d="M -3 -28 Q 0 -32 3 -28 L 2 -25 L -2 -25 Z" fill="#f06ba0" />' +
             '</g>';
    }

    if (stage === 6) {
      out += bloomFx('#f06ba0', ANCHOR_X, top - 18, 70, instanceId);

      // pup bloom
      out += '<g transform="translate(' + (ANCHOR_X - cactusW / 2 - 6) + ' ' + (SOIL_Y - 20) + ')">';
      out += '<path d="M -2.5 2 Q -3 -1 -2 -6 L 2 -6 Q 3 -1 2.5 2 Z" fill="#6a9444" />';
      out += '<g transform="translate(0 -8)">';
      for (var pp = 0; pp < 8; pp++) {
        var rotp = (pp / 8) * 360;
        out += '<ellipse cx="0" cy="-9" rx="3.5" ry="9" fill="#f06ba0" opacity="0.92" transform="rotate(' + rotp + ')" />';
      }
      for (var pp2 = 0; pp2 < 8; pp2++) {
        var rotp2 = (pp2 / 8) * 360 + 22;
        out += '<ellipse cx="0" cy="-6" rx="2.4" ry="6" fill="#f8b0c8" opacity="0.85" transform="rotate(' + rotp2 + ')" />';
      }
      out += '<circle r="3" fill="#fff8e4" />';
      for (var sp = 0; sp < 8; sp++) {
        var rsp = (sp / 8) * 360;
        out += '<circle cx="0" cy="-3.5" r="0.7" fill="#fbe064" transform="rotate(' + rsp + ')" />';
      }
      out += '<circle r="1" fill="#9c5a2a" />';
      out += '</g></g>';

      // main bloom
      out += '<g transform="translate(' + ANCHOR_X + ' ' + (top - 4) + ')">';
      out += '<path d="M -5 4 Q -7 -2 -4 -12 L 4 -12 Q 7 -2 5 4 Z" fill="#6a9444" />';
      [-4, 0, 4].forEach(function (dx) {
        out += '<line x1="' + dx + '" y1="-12" x2="' + (dx * 0.6) + '" y2="2" ' +
                     'stroke="#3e6a32" stroke-width="0.4" opacity="0.7" />';
      });
      out +=
        '<circle cx="-3" cy="-8" r="0.7" fill="#fff8e4" opacity="0.85" />' +
        '<circle cx="3" cy="-8" r="0.7" fill="#fff8e4" opacity="0.85" />' +
        '<circle cx="-2" cy="-2" r="0.7" fill="#fff8e4" opacity="0.85" />' +
        '<circle cx="2" cy="-2" r="0.7" fill="#fff8e4" opacity="0.85" />';

      out += '<g transform="translate(0 -16)">';
      for (var op = 0; op < 10; op++) {
        var rot = (op / 10) * 360;
        out +=
          '<g transform="rotate(' + rot + ')">' +
            '<path d="M 0 -2 Q -7 -10 -8 -22 Q -5 -28 -2 -28 Q 0 -30 2 -28 Q 5 -28 8 -22 Q 7 -10 0 -2 Z" fill="#f06ba0" />' +
            '<path d="M -2 -6 Q -5 -14 -4 -22 Q 0 -26 4 -22 Q 5 -14 2 -6 Z" fill="#f8b0c8" opacity="0.6" />' +
            '<line x1="0" y1="-4" x2="0" y2="-28" stroke="#c43868" stroke-width="0.4" opacity="0.5" />' +
          '</g>';
      }
      for (var ip = 0; ip < 10; ip++) {
        var rot2 = (ip / 10) * 360 + 18;
        out +=
          '<path d="M 0 -2 Q -5 -10 -5 -19 Q 0 -22 5 -19 Q 5 -10 0 -2 Z" ' +
                'fill="#f8b0c8" opacity="0.92" transform="rotate(' + rot2 + ')" />';
      }
      out += '<circle r="6" fill="#fff8e4" />';
      for (var st = 0; st < 24; st++) {
        var rst = (st / 24) * 360;
        out +=
          '<g transform="rotate(' + rst + ')">' +
            '<line x1="0" y1="-1" x2="0" y2="-6" stroke="#e8a040" stroke-width="0.65" />' +
            '<circle cx="0" cy="-6.5" r="0.85" fill="#fbe064" />' +
          '</g>';
      }
      out += '<line x1="0" y1="0" x2="0" y2="-8" stroke="#9c5a2a" stroke-width="0.9" />';
      [0, 45, 90, 135, 180, 225, 270, 315].forEach(function (rot) {
        out += '<ellipse cx="0" cy="-9" rx="0.5" ry="1.2" fill="#c4783a" transform="rotate(' + rot + ')" />';
      });
      out += '<circle r="1.4" cx="0" cy="-8.5" fill="#7a3a18" />';
      out += '</g></g>';
    }

    return out;
  }

  // ══════════════════════════════════════════════════════════════════
  // ORCHID · Phalaenopsis sp.
  // ══════════════════════════════════════════════════════════════════

  function orchidLeaf(cx, cy, length, width, angle, color, vein) {
    length = (length == null) ? 50 : length;
    width  = (width  == null) ? 18 : width;
    angle  = (angle  == null) ? 0  : angle;
    color  = color  || '#3e6a44';
    vein   = vein   || '#2a4a2c';
    var w = width;
    var h = length;
    var path =
      'M 0 0 ' +
      'Q ' + (-w * 0.5) + ' ' + (-h * 0.15) + ' ' + (-w * 0.55) + ' ' + (-h * 0.5) + ' ' +
      'Q ' + (-w * 0.5) + ' ' + (-h * 0.92) + ' 0 ' + (-h) + ' ' +
      'Q ' + ( w * 0.5) + ' ' + (-h * 0.92) + ' ' + ( w * 0.55) + ' ' + (-h * 0.5) + ' ' +
      'Q ' + ( w * 0.5) + ' ' + (-h * 0.15) + ' 0 0 Z';
    var veinLines = '';
    [-0.35, -0.18, 0, 0.18, 0.35].forEach(function (t) {
      veinLines +=
        '<line x1="' + (t * w * 0.85) + '" y1="' + (-h * 0.05) + '" ' +
              'x2="' + (t * w * 0.4)  + '" y2="' + (-h * 0.95) + '" ' +
              'stroke="' + vein + '" stroke-width="0.5" opacity="0.55" />';
    });
    return (
      '<g transform="translate(' + cx + ' ' + cy + ') rotate(' + angle + ')">' +
        '<path d="' + path + '" fill="' + color + '" />' +
        '<path d="' + path + '" fill="#1f4226" opacity="0.32" transform="translate(0.8 0.8)" />' +
        '<path d="M ' + (-w * 0.18) + ' ' + (-h * 0.1) +
                ' Q ' + (-w * 0.32) + ' ' + (-h * 0.45) + ' ' + (-w * 0.2) + ' ' + (-h * 0.82) + '" ' +
                'fill="none" stroke="#86b884" stroke-width="1.4" opacity="0.42" stroke-linecap="round" />' +
        veinLines +
        '<ellipse cx="0" cy="0" rx="' + (w * 0.4) + '" ry="1.4" fill="#2a4220" opacity="0.7" />' +
      '</g>'
    );
  }

  function aerialRoot(x1, y1, x2, y2, thick) {
    thick = (thick == null) ? 2.4 : thick;
    var color = '#a8c0a0';
    var tip = '#5a7a5a';
    return (
      '<g>' +
        '<path d="M ' + x1 + ' ' + y1 + ' Q ' + ((x1 + x2) / 2 + 2) + ' ' + ((y1 + y2) / 2) +
                ' ' + x2 + ' ' + y2 + '" fill="none" stroke="' + color + '" stroke-width="' + thick + '" stroke-linecap="round" />' +
        '<circle cx="' + x2 + '" cy="' + y2 + '" r="' + (thick / 1.6) + '" fill="' + tip + '" />' +
        '<path d="M ' + x1 + ' ' + y1 + ' Q ' + ((x1 + x2) / 2 + 2) + ' ' + ((y1 + y2) / 2) +
                ' ' + x2 + ' ' + y2 + '" fill="none" stroke="#d4e0c8" stroke-width="' + (thick * 0.4) +
                '" opacity="0.6" stroke-linecap="round" />' +
      '</g>'
    );
  }

  function orchidFlower(openness, tone, scale) {
    openness = (openness == null) ? 1 : openness;
    tone     = tone || 0;
    scale    = (scale == null) ? 1 : scale;
    var o = openness;
    var s = scale;
    var palettes = [
      { petal: '#d870e0', sepal: '#e8a8e8', lip: '#9c1ad8', throat: '#fbe064', veinDk: '#7a1a98' },
      { petal: '#ec90c8', sepal: '#f0b4d8', lip: '#b03098', throat: '#fbe064', veinDk: '#8a2080' },
      { petal: '#c860d8', sepal: '#e4a4e4', lip: '#7c0eb4', throat: '#f6c460', veinDk: '#5a0a8a' },
    ];
    var pal = palettes[tone % palettes.length];

    if (o < 0.05) {
      return (
        '<g>' +
          '<ellipse cx="0" cy="0" rx="' + (3.2 * s) + '" ry="' + (5 * s) + '" fill="#7eaf6c" />' +
          '<ellipse cx="-0.6" cy="-0.4" rx="' + (1.2 * s) + '" ry="' + (2 * s) + '" fill="#a4c888" opacity="0.7" />' +
          '<path d="M -3 4 Q 0 6 3 4 L 2 5 Q 0 6 -2 5 Z" fill="#5a8e44" />' +
        '</g>'
      );
    }

    var lipStripes = '';
    [-30, -10, 10, 30].forEach(function (a) {
      lipStripes +=
        '<line x1="0" y1="' + (2 * o) + '" ' +
              'x2="' + (Math.sin(a * Math.PI / 180) * 2.4 * o) + '" ' +
              'y2="' + (2 * o + Math.cos(a * Math.PI / 180) * 5 * o) + '" ' +
              'stroke="' + pal.veinDk + '" stroke-width="0.35" opacity="0.65" />';
    });

    return (
      '<g transform="scale(' + s + ')">' +
        // DORSAL SEPAL (top)
        '<ellipse cx="0" cy="' + (-10 * o) + '" rx="' + (5 * o) + '" ry="' + (8 * o) + '" fill="' + pal.sepal + '" opacity="0.95" />' +
        '<line x1="0" y1="' + (-2 * o) + '" x2="0" y2="' + (-16 * o) +
              '" stroke="' + pal.veinDk + '" stroke-width="0.4" opacity="0.5" />' +

        // TWO LATERAL SEPALS
        '<ellipse cx="' + (-7 * o) + '" cy="' + (5 * o) + '" rx="' + (4.5 * o) + '" ry="' + (7 * o) + '" ' +
                 'fill="' + pal.sepal + '" opacity="0.92" ' +
                 'transform="rotate(-30 ' + (-7 * o) + ' ' + (5 * o) + ')" />' +
        '<ellipse cx="' + ( 7 * o) + '" cy="' + (5 * o) + '" rx="' + (4.5 * o) + '" ry="' + (7 * o) + '" ' +
                 'fill="' + pal.sepal + '" opacity="0.92" ' +
                 'transform="rotate(30 ' + (7 * o) + ' ' + (5 * o) + ')" />' +

        // TWO LATERAL PETALS — moth wings
        '<path d="M 0 0 ' +
                'Q ' + (-8 * o)  + ' ' + (-4 * o) + ' ' + (-12 * o) + ' ' + (-2 * o) +
                ' Q ' + (-15 * o) + ' ' + (2 * o) + ' ' + (-13 * o) + ' ' + (6 * o) +
                ' Q ' + (-10 * o) + ' ' + (8 * o) + ' ' + (-4 * o) + ' ' + (4 * o) +
                ' Q 0 ' + (2 * o) + ' 0 0 Z" fill="' + pal.petal + '" />' +
        '<path d="M 0 0 ' +
                'Q ' + (8 * o)  + ' ' + (-4 * o) + ' ' + (12 * o) + ' ' + (-2 * o) +
                ' Q ' + (15 * o) + ' ' + (2 * o) + ' ' + (13 * o) + ' ' + (6 * o) +
                ' Q ' + (10 * o) + ' ' + (8 * o) + ' ' + (4 * o) + ' ' + (4 * o) +
                ' Q 0 ' + (2 * o) + ' 0 0 Z" fill="' + pal.petal + '" />' +
        '<path d="M 0 0 Q ' + (-8 * o) + ' 0 ' + (-12 * o) + ' ' + (3 * o) + '" ' +
              'fill="none" stroke="' + pal.veinDk + '" stroke-width="0.4" opacity="0.5" />' +
        '<path d="M 0 0 Q ' + ( 8 * o) + ' 0 ' + ( 12 * o) + ' ' + (3 * o) + '" ' +
              'fill="none" stroke="' + pal.veinDk + '" stroke-width="0.4" opacity="0.5" />' +

        // LABELLUM (lip)
        '<g transform="translate(0 ' + (4 * o) + ')">' +
          '<path d="M ' + (-1.6 * o) + ' 0 Q ' + (-4 * o) + ' ' + (1 * o) + ' ' + (-3.2 * o) + ' ' + (4 * o) +
                  ' Q ' + (-1.6 * o) + ' ' + (4.5 * o) + ' ' + (-0.8 * o) + ' ' + (3 * o) + '" fill="' + pal.lip + '" />' +
          '<path d="M ' + ( 1.6 * o) + ' 0 Q ' + ( 4 * o) + ' ' + (1 * o) + ' ' + ( 3.2 * o) + ' ' + (4 * o) +
                  ' Q ' + ( 1.6 * o) + ' ' + (4.5 * o) + ' ' + ( 0.8 * o) + ' ' + (3 * o) + '" fill="' + pal.lip + '" />' +
          '<path d="M 0 ' + (1 * o) + ' Q ' + (-3.5 * o) + ' ' + (3 * o) + ' ' + (-2.2 * o) + ' ' + (8 * o) +
                  ' Q 0 ' + (10 * o) + ' ' + (2.2 * o) + ' ' + (8 * o) +
                  ' Q ' + (3.5 * o) + ' ' + (3 * o) + ' 0 ' + (1 * o) + ' Z" fill="' + pal.lip + '" />' +
          '<ellipse cx="0" cy="' + (2.5 * o) + '" rx="' + (2 * o) + '" ry="' + (1.5 * o) + '" fill="' + pal.throat + '" />' +
          '<circle cx="' + (-0.9 * o) + '" cy="' + (2 * o) + '" r="' + (0.7 * o) + '" fill="#fff8c8" />' +
          '<circle cx="' + ( 0.9 * o) + '" cy="' + (2 * o) + '" r="' + (0.7 * o) + '" fill="#fff8c8" />' +
          '<path d="M ' + (-1 * o) + ' ' + ( 8 * o) + ' Q ' + (-3 * o) + ' ' + (10 * o) + ' ' + (-2 * o) + ' ' + (12 * o) + '" ' +
                'fill="none" stroke="' + pal.veinDk + '" stroke-width="0.6" stroke-linecap="round" />' +
          '<path d="M ' + ( 1 * o) + ' ' + ( 8 * o) + ' Q ' + ( 3 * o) + ' ' + (10 * o) + ' ' + ( 2 * o) + ' ' + (12 * o) + '" ' +
                'fill="none" stroke="' + pal.veinDk + '" stroke-width="0.6" stroke-linecap="round" />' +
          lipStripes +
        '</g>' +

        // COLUMN (gynostemium)
        '<ellipse cx="0" cy="' + (1 * o) + '" rx="' + (1.6 * o) + '" ry="' + (3 * o) + '" fill="#fff" opacity="0.95" />' +
        '<circle cx="0" cy="' + (2 * o) + '" r="' + (0.8 * o) + '" fill="' + pal.throat + '" />' +
        '<circle cx="0" cy="' + (-0.5 * o) + '" r="' + (0.7 * o) + '" fill="' + pal.lip + '" />' +
        '<ellipse cx="0" cy="' + (-2 * o) + '" rx="' + (1 * o) + '" ry="' + (0.6 * o) + '" fill="#fbe064" />' +
      '</g>'
    );
  }

  function orchidContent(stage, instanceId) {
    var spikeBaseY = SOIL_Y - 18;
    var spikeH = [0, 0, 0, 110, 175, 225, 252][stage];
    var tipY = spikeBaseY - spikeH;
    var showLeaves = stage >= 2;
    var showSpike  = stage >= 3;
    var showRoots  = stage >= 2;
    var flowerCount = stage >= 3 ? 4 : 0;
    var out = '';

    var flowerSlots = [
      { t: 0.18, side:  9 },
      { t: 0.42, side: -9 },
      { t: 0.68, side:  9 },
      { t: 0.92, side: -7 },
    ];

    if (stage === 0) {
      out += '<g>';
      [-4, -2, 0, 2, 4].forEach(function (dx) {
        out += '<circle cx="' + (ANCHOR_X + dx) + '" cy="' + (SOIL_Y - 1.2) + '" r="0.4" fill="#2a1408" />';
      });
      out += '<ellipse cx="' + ANCHOR_X + '" cy="' + (SOIL_Y - 0.5) + '" rx="6" ry="0.6" fill="#3e2e20" opacity="0.5" /></g>';
    }

    if (stage === 1) {
      out +=
        '<g>' +
          '<ellipse cx="' + ANCHOR_X + '" cy="' + (SOIL_Y - 5) + '" rx="6.5" ry="4" fill="#5a9460" />' +
          '<ellipse cx="' + (ANCHOR_X - 1.5) + '" cy="' + (SOIL_Y - 6) + '" rx="3" ry="1.6" fill="#7eb47e" opacity="0.7" />' +
          '<circle cx="' + ANCHOR_X + '" cy="' + (SOIL_Y - 8.5) + '" r="1.4" fill="#3e6a3e" />' +
          '<path d="M ' + (ANCHOR_X - 1.5) + ' ' + (SOIL_Y - 10) +
                  ' L ' + (ANCHOR_X + 1.5) + ' ' + (SOIL_Y - 10) +
                  ' L ' + ANCHOR_X + ' ' + (SOIL_Y - 13) + ' Z" fill="#6a9466" />' +
          '<path d="M ' + (ANCHOR_X - 4) + ' ' + (SOIL_Y - 3) +
                  ' Q ' + (ANCHOR_X - 6) + ' ' + SOIL_Y + ' ' + (ANCHOR_X - 6) + ' ' + (SOIL_Y + 3) + '" ' +
                  'fill="none" stroke="#a8c0a0" stroke-width="1.2" stroke-linecap="round" />' +
        '</g>';
    }

    if (showLeaves) {
      out += '<g>';
      if (showRoots) {
        out +=
          aerialRoot(ANCHOR_X - 4, SOIL_Y - 6,   ANCHOR_X - 18, SOIL_Y + 6, 2.6) +
          aerialRoot(ANCHOR_X + 5, SOIL_Y - 8,   ANCHOR_X + 16, SOIL_Y + 4, 2.4) +
          aerialRoot(ANCHOR_X - 8, SOIL_Y - 10,  ANCHOR_X - 24, SOIL_Y + 12, 2.0);
        if (stage >= 3) {
          out += aerialRoot(ANCHOR_X + 3, SOIL_Y - 12, ANCHOR_X + 22, SOIL_Y + 10, 2.2);
        }
      }
      var leafAngles = stage === 2 ? [-55, -25, 25, 55] : [-65, -35, -10, 15, 40, 65];
      leafAngles.forEach(function (a, i) {
        var len = (stage >= 3 ? 56 : 44) + (i % 2 ? -4 : 4);
        var wid = (stage >= 3 ? 20 : 16);
        var rad = a * Math.PI / 180;
        out += orchidLeaf(ANCHOR_X + Math.sin(rad) * 2, SOIL_Y, len, wid, a);
      });
      out += '<ellipse cx="' + ANCHOR_X + '" cy="' + (SOIL_Y - 14) + '" rx="4" ry="2" fill="#3a5e34" /></g>';
    }

    if (showSpike) {
      var spikeD =
        'M ' + ANCHOR_X + ' ' + spikeBaseY +
        ' Q ' + (ANCHOR_X + 14) + ' ' + (spikeBaseY - spikeH * 0.4) +
        ' ' + (ANCHOR_X + 6) + ' ' + (spikeBaseY - spikeH * 0.7) +
        ' Q ' + (ANCHOR_X - 4) + ' ' + (spikeBaseY - spikeH * 0.92) +
        ' ' + (ANCHOR_X - 6) + ' ' + tipY;
      out +=
        '<path d="' + spikeD + '" fill="none" stroke="#6a4838" stroke-width="2.4" stroke-linecap="round" />' +
        '<path d="' + spikeD + '" fill="none" stroke="#9a7858" stroke-width="0.7" stroke-linecap="round" ' +
                    'transform="translate(-0.6 0)" />';

      for (var fi = 0; fi < flowerCount; fi++) {
        var slot = flowerSlots[fi];
        var t = slot.t;
        // bezier position approximation (matches source)
        var sx = ANCHOR_X + (1 - t) * (1 - t) * 0 + 2 * (1 - t) * t * 14 + t * t * -6;
        var sy = spikeBaseY - spikeH * t;
        var fx = sx + slot.side * 0.7;
        var fy = sy + (stage <= 4 ? 0 : -2);
        var open =
          stage === 3 ? 0 :
          stage === 4 ? 0.5 :
          stage === 5 ? 0.8 : 1.0;
        var fscale =
          stage === 3 ? 0.9 :
          stage === 4 ? 1.0 :
          stage === 5 ? 1.05 : 1.15;
        var bractEnd = slot.side > 0 ? 2 : -2;
        var bractEnd2 = slot.side > 0 ? -1 : 1;
        out +=
          '<g>' +
            '<path d="M ' + sx + ' ' + sy + ' L ' + (sx + bractEnd) + ' ' + (sy + 2) +
                    ' L ' + (sx + bractEnd2) + ' ' + (sy + 3) + ' Z" fill="#5a8044" />' +
            '<line x1="' + sx + '" y1="' + sy + '" x2="' + fx + '" y2="' + (fy + 4) +
                  '" stroke="#6a4838" stroke-width="1" stroke-linecap="round" />' +
            '<g transform="translate(' + fx + ' ' + fy + ')">' +
              orchidFlower(open, fi % 3, fscale) +
            '</g>' +
          '</g>';
      }

      if (stage >= 5) {
        out += '<g transform="translate(' + (ANCHOR_X - 6) + ' ' + tipY + ')">' +
                 '<ellipse cx="0" cy="-2" rx="2.2" ry="3.5" fill="#7eaf6c" />' +
                 '<ellipse cx="-3" cy="1" rx="1.6" ry="2.6" fill="#7eaf6c" transform="rotate(-30 -3 1)" />' +
                 '<ellipse cx="3"  cy="1" rx="1.6" ry="2.6" fill="#7eaf6c" transform="rotate(30 3 1)" />' +
               '</g>';
      }
    }

    if (stage === 6) {
      out += bloomFx('#d870e0', ANCHOR_X, spikeBaseY - spikeH * 0.5, 80, instanceId);

      var sec2 =
        'M ' + (ANCHOR_X + 6) + ' ' + spikeBaseY +
        ' Q ' + (ANCHOR_X + 24) + ' ' + (spikeBaseY - 75) +
        ' ' + (ANCHOR_X + 30) + ' ' + (spikeBaseY - 130);
      out +=
        '<path d="' + sec2 + '" fill="none" stroke="#6a4838" stroke-width="2" stroke-linecap="round" />' +
        '<path d="' + sec2 + '" fill="none" stroke="#9a7858" stroke-width="0.6" stroke-linecap="round" ' +
                    'transform="translate(-0.5 0)" />' +
        '<g transform="translate(' + (ANCHOR_X + 20) + ' ' + (spikeBaseY - 50) + ')">' +
          '<line x1="0" y1="0" x2="-8" y2="4" stroke="#6a4838" stroke-width="0.8" />' +
          orchidFlower(1, 2, 0.85) +
        '</g>' +
        '<g transform="translate(' + (ANCHOR_X + 36) + ' ' + (spikeBaseY - 115) + ')">' +
          '<line x1="0" y1="0" x2="-6" y2="4" stroke="#6a4838" stroke-width="0.8" />' +
          orchidFlower(1, 1, 0.75) +
        '</g>' +
        '<g transform="translate(' + (ANCHOR_X + 30) + ' ' + (spikeBaseY - 138) + ')">' +
          '<ellipse cx="0" cy="0" rx="2" ry="3" fill="#7eaf6c" />' +
          '<ellipse cx="0" cy="-0.5" rx="1.2" ry="2" fill="#e0a8d8" opacity="0.6" />' +
        '</g>';
    }
    return out;
  }

  // ── Dispatch by species ────────────────────────────────────────────
  var SPECIES_BUILDERS = {
    arctic_poppy:   arcticPoppyContent,
    hydrangea:      hydrangeaContent,
    hibiscus:       hibiscusContent,
    cactus_blossom: cactusBlossomContent,
    orchid:         orchidContent,
  };

  function speciesContent(species, stage, instanceId) {
    var fn = SPECIES_BUILDERS[species] || hibiscusContent;
    return fn(stage, instanceId);
  }

  // ══════════════════════════════════════════════════════════════════
  // renderFlowerSvg — primary public API
  // ══════════════════════════════════════════════════════════════════
  function renderFlowerSvg(species, stage, swell) {
    stage = clampStage(stage);
    swell = !!swell;
    var instanceId = ++_instanceCounter;

    var svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 ' + FLOWER_W + ' ' + FLOWER_H);
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', '100%');
    svg.setAttribute('preserveAspectRatio', 'xMidYMax meet');
    svg.style.display = 'block';
    svg.style.overflow = 'visible';
    // Stash for downstream consumers — useful for class toggles.
    svg.dataset.species = species;
    svg.dataset.stage = String(stage);
    svg.dataset.bloomInstance = String(instanceId);

    // subtle soil hint line (matches source — only drawn when showSoil=false)
    var soilLine = document.createElementNS(SVG_NS, 'line');
    soilLine.setAttribute('x1', String(ANCHOR_X - 30));
    soilLine.setAttribute('y1', String(SOIL_Y));
    soilLine.setAttribute('x2', String(ANCHOR_X + 30));
    soilLine.setAttribute('y2', String(SOIL_Y));
    soilLine.setAttribute('stroke', '#cdb89a');
    soilLine.setAttribute('stroke-width', '1.4');
    soilLine.setAttribute('stroke-linecap', 'round');
    soilLine.setAttribute('opacity', '0.45');
    svg.appendChild(soilLine);

    // Plant wrapper — matches the <Plant> component in source.
    var plant = document.createElementNS(SVG_NS, 'g');
    plant.setAttribute('data-role', 'plant');
    plant.style.transformOrigin = ANCHOR_X + 'px ' + SOIL_Y + 'px';
    plant.style.transition = 'all 0.5s cubic-bezier(.34,1.2,.55,1.05)';
    if (swell) {
      plant.style.animation = 'flower-swell 0.6s ease-in-out';
      plant.classList.add('flower-swell');
    } else {
      plant.style.animation = 'none';
    }

    // innerHTML on an SVG element works in modern browsers — the content
    // is parsed in the SVG namespace because the parent has one.
    plant.innerHTML = speciesContent(species, stage, instanceId);
    svg.appendChild(plant);
    return svg;
  }

  // ══════════════════════════════════════════════════════════════════
  // FlowerStage — one-shot gameplay flower (single mount, setStage,
  // swell, transitionTo). Each instance owns its own timers and unique
  // BloomFX defs IDs.
  // ══════════════════════════════════════════════════════════════════
  function FlowerStage(opts) {
    if (!opts || !opts.container) {
      throw new Error('FlowerStage: opts.container is required');
    }
    this.container = opts.container;
    this.species   = opts.species || 'hibiscus';
    this.stage     = clampStage(opts.stage == null ? 0 : opts.stage);
    this._swellTimer = 0;
    this._destroyed = false;
    this._svg = null;
    this._mount();
  }
  FlowerStage.prototype._mount = function () {
    if (this._destroyed) return;
    // Empty container without nuking other children we didn't own
    // — we only remove our own previous svg if it's still there.
    if (this._svg && this._svg.parentNode === this.container) {
      this.container.removeChild(this._svg);
    }
    this._svg = renderFlowerSvg(this.species, this.stage, false);
    this.container.appendChild(this._svg);
  };
  FlowerStage.prototype._plantEl = function () {
    return this._svg && this._svg.querySelector('[data-role="plant"]');
  };
  FlowerStage.prototype.setStage = function (stage) {
    if (this._destroyed) return;
    this.stage = clampStage(stage);
    this._mount();
  };
  FlowerStage.prototype.swell = function () {
    if (this._destroyed) return;
    var plant = this._plantEl();
    if (!plant) return;
    // Restart animation by clearing then setting on next frame.
    plant.style.animation = 'none';
    plant.classList.remove('flower-swell');
    // Force reflow so the animation actually restarts.
    // eslint-disable-next-line no-unused-expressions
    plant.getBoundingClientRect();
    plant.style.animation = 'flower-swell 0.6s ease-in-out';
    plant.classList.add('flower-swell');
    var self = this;
    clearTimeout(this._swellTimer);
    this._swellTimer = setTimeout(function () {
      if (self._destroyed) return;
      var p = self._plantEl();
      if (p) {
        p.style.animation = 'none';
        p.classList.remove('flower-swell');
      }
    }, 700);
  };
  FlowerStage.prototype.transitionTo = function (nextStage) {
    if (this._destroyed) return;
    // Jump to next stage with an emphasis swell — matches the
    // FlowerClip transition behavior (no looping).
    this.setStage(nextStage);
    this.swell();
  };
  FlowerStage.prototype.destroy = function () {
    if (this._destroyed) return;
    this._destroyed = true;
    clearTimeout(this._swellTimer);
    this._swellTimer = 0;
    if (this._svg && this._svg.parentNode === this.container) {
      this.container.removeChild(this._svg);
    }
    this._svg = null;
  };

  // ══════════════════════════════════════════════════════════════════
  // FlowerClipLoop — admin catalog clip player. Drives the 12 variants
  // from CLIP_VARIANTS on a repeating period; per-instance timers.
  // ══════════════════════════════════════════════════════════════════
  function FlowerClipLoop(opts) {
    if (!opts || !opts.container) {
      throw new Error('FlowerClipLoop: opts.container is required');
    }
    this.container   = opts.container;
    this.species     = opts.species  || 'hibiscus';
    this.variant     = typeof opts.variant === 'string'
      ? CLIP_VARIANTS.find(function (v) { return v.id === opts.variant; }) || opts.variant
      : opts.variant;
    if (!this.variant) {
      // default to bloom! variant if unspecified
      this.variant = CLIP_VARIANTS[CLIP_VARIANTS.length - 1];
    }
    this.period      = opts.period      != null ? opts.period      : 2600;
    this.phaseOffset = opts.phaseOffset != null ? opts.phaseOffset : 0;

    this._destroyed    = false;
    this._playing      = false;
    this._svg          = null;
    this._intervalId   = 0;
    this._firstTrigger = 0;
    this._swellTimer   = 0;
    this._transitionTimer = 0;

    this._currentStage =
      this.variant.type === 'swell' ? this.variant.stage : this.variant.from;
    this._currentSwell = false;

    this._mount();
    this.play();
  }
  FlowerClipLoop.prototype._mount = function () {
    if (this._destroyed) return;
    if (this._svg && this._svg.parentNode === this.container) {
      this.container.removeChild(this._svg);
    }
    this._svg = renderFlowerSvg(this.species, this._currentStage, this._currentSwell);
    this.container.appendChild(this._svg);
  };
  FlowerClipLoop.prototype._plantEl = function () {
    return this._svg && this._svg.querySelector('[data-role="plant"]');
  };
  // Apply swell on the existing plant element without remounting.
  FlowerClipLoop.prototype._applySwell = function (on) {
    var plant = this._plantEl();
    if (!plant) return;
    if (on) {
      plant.style.animation = 'none';
      plant.classList.remove('flower-swell');
      plant.getBoundingClientRect(); // reflow
      plant.style.animation = 'flower-swell 0.6s ease-in-out';
      plant.classList.add('flower-swell');
    } else {
      plant.style.animation = 'none';
      plant.classList.remove('flower-swell');
    }
    this._currentSwell = !!on;
  };
  FlowerClipLoop.prototype._setStageInline = function (stage) {
    if (stage === this._currentStage) return;
    this._currentStage = clampStage(stage);
    this._mount();
  };
  FlowerClipLoop.prototype._trigger = function () {
    if (this._destroyed) return;
    var v = this.variant;
    var self = this;
    if (v.type === 'swell') {
      this._applySwell(true);
      clearTimeout(this._swellTimer);
      this._swellTimer = setTimeout(function () {
        if (!self._destroyed) self._applySwell(false);
      }, 700);
    } else {
      // transition: from → to. Reset to `from`, then 400ms later jump to
      // `to` and pulse a swell. Matches FlowerClip in flower-clips.jsx.
      this._setStageInline(v.from);
      clearTimeout(this._transitionTimer);
      this._transitionTimer = setTimeout(function () {
        if (self._destroyed) return;
        self._setStageInline(v.to);
        self._applySwell(true);
        clearTimeout(self._swellTimer);
        self._swellTimer = setTimeout(function () {
          if (!self._destroyed) self._applySwell(false);
        }, 700);
      }, 400);
    }
  };
  FlowerClipLoop.prototype.play = function () {
    if (this._destroyed || this._playing) return;
    this._playing = true;
    var self = this;
    // First trigger after the phase offset (so cells stagger).
    this._firstTrigger = setTimeout(function () {
      self._trigger();
    }, 250 + this.phaseOffset);
    this._intervalId = setInterval(function () {
      self._trigger();
    }, this.period);
  };
  FlowerClipLoop.prototype.pause = function () {
    this._playing = false;
    clearTimeout(this._firstTrigger);
    clearInterval(this._intervalId);
    clearTimeout(this._swellTimer);
    clearTimeout(this._transitionTimer);
    this._firstTrigger = 0;
    this._intervalId = 0;
    this._swellTimer = 0;
    this._transitionTimer = 0;
  };
  FlowerClipLoop.prototype.destroy = function () {
    if (this._destroyed) return;
    this.pause();
    this._destroyed = true;
    if (this._svg && this._svg.parentNode === this.container) {
      this.container.removeChild(this._svg);
    }
    this._svg = null;
  };

  // ══════════════════════════════════════════════════════════════════
  // Public namespace
  // ══════════════════════════════════════════════════════════════════
  var BloomFlowers = {
    renderFlowerSvg: renderFlowerSvg,
    FlowerStage:     FlowerStage,
    FlowerClipLoop:  FlowerClipLoop,
    FLOWER_SPECIES:  FLOWER_SPECIES,
    STAGE_LABELS:    STAGE_LABELS,
    CLIP_VARIANTS:   CLIP_VARIANTS,
    FLOWER_W:        FLOWER_W,
    FLOWER_H:        FLOWER_H,
    ANCHOR_X:        ANCHOR_X,
    SOIL_Y:          SOIL_Y,
  };

  global.BloomFlowers = BloomFlowers;
})(typeof window !== 'undefined' ? window : this);
