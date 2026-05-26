/*!
 * bloom-weather.js — vanilla port of the 10 weather overlay effects.
 *
 * Exposes window.BloomWeather:
 *   .renderWeather(event, intensity) → HTMLDivElement | null
 *   .BloomWeather class { setEvent, setIntensity, destroy }
 *   .WEATHER_EVENTS
 *
 * Each overlay is a position:absolute, inset:0, pointer-events:none layer
 * intended to sit ABOVE the region background. Designed to read at a glance
 * without burying the foreground plant.
 *
 * Requires bloom-weather.css to be loaded — animation keyframes live there.
 */
(function (global) {
  'use strict';

  var SVG_NS = 'http://www.w3.org/2000/svg';
  var _instanceCounter = 0;

  // ── Catalog ────────────────────────────────────────────────────────
  var WEATHER_EVENTS = [
    { id: 'arctic_wind',         name: 'ARCTIC WIND',         sub: 'biting horizontal gusts' },
    { id: 'late_freeze',         name: 'LATE FREEZE',         sub: 'frost creeping inward' },
    { id: 'monsoon',             name: 'MONSOON',             sub: 'warm heavy diagonal rain' },
    { id: 'perfect_conditions',  name: 'PERFECT CONDITIONS',  sub: 'warm light · gentle sparkle' },
    { id: 'torrential_downpour', name: 'TORRENTIAL DOWNPOUR', sub: 'vertical sheets · darkened' },
    { id: 'dense_mist',          name: 'DENSE MIST',          sub: 'thick low cloud' },
    { id: 'drought',             name: 'DROUGHT',             sub: 'parched · faded · still' },
    { id: 'dry_heat',            name: 'DRY HEAT',            sub: 'shimmering air · warm cast' },
    { id: 'coastal_fog',         name: 'COASTAL FOG',         sub: 'low fog rolling in' },
    { id: 'morning_dew',         name: 'MORNING DEW',         sub: 'twinkling micro-sparkles' },
  ];

  // ── Helpers ────────────────────────────────────────────────────────
  function div(styles, children) {
    var e = document.createElement('div');
    if (styles) for (var k in styles) e.style[k] = styles[k];
    if (children) {
      for (var i = 0; i < children.length; i++) {
        if (children[i]) e.appendChild(children[i]);
      }
    }
    return e;
  }
  function svgEl(tag, attrs, children) {
    var e = document.createElementNS(SVG_NS, tag);
    if (attrs) for (var k in attrs) {
      var v = attrs[k];
      if (v == null || v === false) continue;
      if (k === 'style' && typeof v === 'object') {
        for (var sk in v) e.style[sk] = v[sk];
      } else {
        e.setAttribute(k, v);
      }
    }
    if (children) {
      for (var i = 0; i < children.length; i++) {
        if (children[i]) e.appendChild(children[i]);
      }
    }
    return e;
  }
  // Build SVG content from a raw string (for inner svg markup).
  function svgInner(svgEl, str) { svgEl.innerHTML = str; }

  // Shared host wrapper — full-bleed, click-through.
  function W(children, extraStyles) {
    var s = {
      position: 'absolute', inset: '0',
      pointerEvents: 'none',
      overflow: 'hidden',
    };
    if (extraStyles) for (var k in extraStyles) s[k] = extraStyles[k];
    return div(s, children);
  }

  // ──────────────────────────────────────────────────────────────────
  // ARCTIC WIND — cool tint + fast horizontal wisps
  // ──────────────────────────────────────────────────────────────────
  function arcticWind(intensity) {
    var count = Math.round(7 * intensity);
    var kids = [
      div({
        position: 'absolute', inset: '0',
        background: 'linear-gradient(180deg, rgba(180,210,235,0.10) 0%, rgba(180,210,235,0.04) 100%)',
        mixBlendMode: 'screen',
      }),
    ];
    for (var i = 0; i < count; i++) {
      var top = 8 + (i * 13) % 70;
      var len = 80 + (i % 4) * 30;
      var dur = 2.2 + (i % 5) * 0.4;
      var delay = (i * 0.27) % 3;
      kids.push(div({
        position: 'absolute',
        top: top + '%',
        left: '0',
        width: len + 'px',
        height: '1.5px',
        background: 'linear-gradient(90deg, transparent 0%, rgba(225,235,245,0.55) 50%, transparent 100%)',
        animation: 'wx-wind ' + dur + 's linear ' + delay + 's infinite',
        opacity: '0.75',
      }));
    }
    return W(kids);
  }

  // ──────────────────────────────────────────────────────────────────
  // LATE FREEZE — frost vignette + cracks drawing in from all edges
  // ──────────────────────────────────────────────────────────────────
  function lateFreeze(intensity) {
    var cracks = [
      { d: 'M 12 0 L 16 8 L 10 14 L 18 22 L 12 30 L 22 38 L 16 46', delay: 0.0 },
      { d: 'M 46 0 L 42 8 L 50 14 L 44 22 L 52 30',                delay: 1.4 },
      { d: 'M 92 0 L 88 8 L 96 14 L 90 22 L 96 30 L 90 38 L 98 44', delay: 0.6 },
      { d: 'M 148 0 L 144 10 L 152 18 L 146 26 L 152 34',           delay: 2.0 },
      { d: 'M 24 100 L 28 90 L 20 82 L 28 72 L 22 64 L 30 56',      delay: 0.9 },
      { d: 'M 68 100 L 64 92 L 72 82 L 66 74 L 72 64 L 66 56',      delay: 0.3 },
      { d: 'M 118 100 L 114 90 L 122 82 L 116 72 L 124 64',         delay: 1.6 },
      { d: 'M 172 100 L 176 90 L 168 80 L 174 72',                  delay: 0.5 },
      { d: 'M 0 30 L 10 32 L 18 26 L 28 32 L 36 26 L 44 32',         delay: 2.2 },
      { d: 'M 0 62 L 8 60 L 16 66 L 26 60 L 34 66',                 delay: 1.0 },
      { d: 'M 200 24 L 192 28 L 184 22 L 174 28 L 166 22',           delay: 0.4 },
      { d: 'M 200 72 L 194 70 L 184 76 L 174 70 L 166 76',           delay: 1.7 },
    ];
    var paths = cracks.map(function (c) {
      return svgEl('path', {
        d: c.d,
        style: {
          strokeDasharray: '200',
          strokeDashoffset: '200',
          animation: 'wx-freeze-crack ' + (9 / intensity) + 's ease-out ' + c.delay + 's infinite',
        },
      });
    });
    var g = svgEl('g', {
      stroke: 'rgba(230,240,250,0.85)',
      'stroke-width': '0.45',
      fill: 'none',
      'stroke-linecap': 'round',
    }, paths);
    var svg = svgEl('svg', {
      viewBox: '0 0 200 100',
      preserveAspectRatio: 'none',
      style: { position: 'absolute', inset: '0', width: '100%', height: '100%', opacity: '0.7' },
    }, [g]);

    return W([
      div({
        position: 'absolute', inset: '0',
        background: 'radial-gradient(140% 80% at 50% 50%, transparent 35%, rgba(200,225,235,0.18) 70%, rgba(200,225,235,0.32) 100%)',
        mixBlendMode: 'screen',
        animation: 'wx-freeze-pulse ' + (5 / intensity) + 's ease-in-out infinite',
      }),
      svg,
    ]);
  }

  // ──────────────────────────────────────────────────────────────────
  // MONSOON — warm dark tint + diagonal rain
  // ──────────────────────────────────────────────────────────────────
  function monsoon(intensity) {
    var count = Math.round(28 * intensity);
    var rainBox = div({
      position: 'absolute', inset: '0', transform: 'skewX(-12deg)',
    });
    for (var i = 0; i < count; i++) {
      var left = (i * 71) % 110 - 5;
      var dur = 0.55 + (i % 5) * 0.08;
      var delay = (i * 0.13) % 1.4;
      rainBox.appendChild(div({
        position: 'absolute',
        left: left + '%',
        top: '-10%',
        width: '1.2px',
        height: '22px',
        background: 'linear-gradient(180deg, transparent 0%, rgba(200,220,235,0.55) 50%, transparent 100%)',
        animation: 'wx-rain ' + dur + 's linear ' + delay + 's infinite',
      }));
    }
    return W([
      div({
        position: 'absolute', inset: '0',
        background: 'linear-gradient(180deg, rgba(10,20,30,0.20) 0%, rgba(10,20,30,0.10) 100%)',
      }),
      rainBox,
    ]);
  }

  // ──────────────────────────────────────────────────────────────────
  // PERFECT CONDITIONS — warm glow + sparkles + wavy breeze lines
  // ──────────────────────────────────────────────────────────────────
  function perfectConditions(intensity) {
    var sparkles = Math.round(6 * intensity);
    var breezeLines = Math.max(3, Math.round(5 * intensity));
    var kids = [
      div({
        position: 'absolute', inset: '0',
        background: 'radial-gradient(70% 50% at 50% 70%, rgba(255,235,180,0.18) 0%, transparent 60%)',
        animation: 'wx-glow ' + (8 / intensity) + 's ease-in-out infinite',
        mixBlendMode: 'screen',
      }),
    ];
    for (var i = 0; i < sparkles; i++) {
      var left = 12 + (i * 17) % 76;
      var top  = 30 + (i * 23) % 50;
      var delay = (i * 0.6) % 4;
      kids.push(div({
        position: 'absolute',
        left: left + '%', top: top + '%',
        width: '3px', height: '3px', borderRadius: '50%',
        background: 'rgba(255,240,200,0.95)',
        boxShadow: '0 0 6px rgba(255,235,180,0.7)',
        animation: 'wx-twinkle 3.5s ease-in-out ' + delay + 's infinite',
      }));
    }
    for (var b = 0; b < breezeLines; b++) {
      var btop = 10 + (b * 17) % 72;
      var bdur = 14 + (b % 4) * 4;
      var bdelay = (b * 1.7) % bdur;
      var widthPct = 38 + (b % 3) * 12;
      var phaseA = b % 2 === 0;
      var pathStr = phaseA
        ? 'M 0 8 Q 15 3 30 8 T 60 8 T 90 8 T 120 8;' +
          'M 0 8 Q 15 13 30 8 T 60 8 T 90 8 T 120 8;' +
          'M 0 8 Q 15 3 30 8 T 60 8 T 90 8 T 120 8'
        : 'M 0 8 Q 15 13 30 8 T 60 8 T 90 8 T 120 8;' +
          'M 0 8 Q 15 3 30 8 T 60 8 T 90 8 T 120 8;' +
          'M 0 8 Q 15 13 30 8 T 60 8 T 90 8 T 120 8';
      var animate = svgEl('animate', {
        attributeName: 'd', dur: '3.4s', repeatCount: 'indefinite',
        values: pathStr,
      });
      var path = svgEl('path', {
        d: 'M 0 8 Q 15 3 30 8 T 60 8 T 90 8 T 120 8',
        stroke: 'rgba(255,250,225,0.85)',
        'stroke-width': '0.55',
        fill: 'none',
        'stroke-linecap': 'round',
      }, [animate]);
      var svg = svgEl('svg', {
        viewBox: '0 0 120 16', preserveAspectRatio: 'none',
        style: {
          position: 'absolute',
          top: btop + '%', left: '-40%',
          width: widthPct + '%', height: '14px',
          animation: 'wx-breeze-drift ' + bdur + 's linear ' + bdelay + 's infinite',
          opacity: '0.6',
          pointerEvents: 'none',
        },
      }, [path]);
      kids.push(svg);
    }
    return W(kids);
  }

  // ──────────────────────────────────────────────────────────────────
  // TORRENTIAL DOWNPOUR — vertical sheets, darker
  // ──────────────────────────────────────────────────────────────────
  function torrentialDownpour(intensity) {
    var count = Math.round(55 * intensity);
    var kids = [
      div({
        position: 'absolute', inset: '0',
        background: 'linear-gradient(180deg, rgba(8,14,24,0.32) 0%, rgba(8,14,24,0.16) 100%)',
      }),
    ];
    for (var i = 0; i < count; i++) {
      var left = (i * 41) % 100;
      var dur = 0.38 + (i % 6) * 0.05;
      var delay = (i * 0.07) % 0.9;
      var h = 24 + (i % 4) * 6;
      kids.push(div({
        position: 'absolute',
        left: left + '%',
        top: '-12%',
        width: '1.2px',
        height: h + 'px',
        background: 'linear-gradient(180deg, transparent 0%, rgba(190,210,225,0.7) 50%, transparent 100%)',
        animation: 'wx-rain-vert ' + dur + 's linear ' + delay + 's infinite',
      }));
    }
    kids.push(div({
      position: 'absolute', inset: '0',
      background: 'repeating-linear-gradient(180deg, transparent 0 18px, rgba(180,195,210,0.04) 18px 22px)',
      animation: 'wx-rain-sheet 1.1s linear infinite',
    }));
    return W(kids);
  }

  // ──────────────────────────────────────────────────────────────────
  // DENSE MIST — three drifting fog layers
  // ──────────────────────────────────────────────────────────────────
  function denseMist(intensity) {
    return W([
      div({
        position: 'absolute',
        left: '-30%', right: '-30%', top: '-10%', height: '75%',
        background:
          'radial-gradient(35% 55% at 25% 50%, rgba(228,228,230,0.42) 0%, transparent 60%),' +
          'radial-gradient(40% 55% at 65% 55%, rgba(228,228,230,0.36) 0%, transparent 60%)',
        filter: 'blur(10px)',
        animation: 'wx-mist-drift-a ' + (22 / intensity) + 's ease-in-out infinite alternate',
      }),
      div({
        position: 'absolute',
        left: '-30%', right: '-30%', top: '10%', height: '70%',
        background:
          'radial-gradient(40% 50% at 55% 50%, rgba(220,222,225,0.40) 0%, transparent 60%),' +
          'radial-gradient(45% 55% at 15% 55%, rgba(220,222,225,0.30) 0%, transparent 60%),' +
          'radial-gradient(35% 50% at 85% 45%, rgba(220,222,225,0.34) 0%, transparent 60%)',
        filter: 'blur(12px)',
        animation: 'wx-mist-drift-b ' + (16 / intensity) + 's ease-in-out infinite alternate',
      }),
      div({
        position: 'absolute',
        left: '-35%', right: '-35%', top: '30%', height: '75%',
        background:
          'radial-gradient(45% 50% at 70% 50%, rgba(232,232,234,0.46) 0%, transparent 60%),' +
          'radial-gradient(35% 50% at 25% 55%, rgba(232,232,234,0.36) 0%, transparent 60%)',
        filter: 'blur(14px)',
        animation: 'wx-mist-drift-c ' + (28 / intensity) + 's ease-in-out infinite alternate',
      }),
      div({
        position: 'absolute', inset: '0',
        background: 'linear-gradient(180deg, rgba(230,232,235,0.18) 0%, rgba(230,232,235,0.10) 60%, transparent 100%)',
      }),
    ]);
  }

  // ──────────────────────────────────────────────────────────────────
  // DROUGHT — sun arcing across the sky
  // ──────────────────────────────────────────────────────────────────
  function drought(intensity) {
    return W([
      div({
        position: 'absolute', inset: '0',
        background: 'linear-gradient(180deg, rgba(220,175,110,0.18) 0%, rgba(180,130,70,0.18) 100%)',
        mixBlendMode: 'multiply',
      }),
      div({
        position: 'absolute', inset: '0',
        background: 'linear-gradient(180deg, rgba(255,235,200,0.12) 0%, transparent 70%)',
        mixBlendMode: 'screen',
        animation: 'wx-drought-light ' + (14 / intensity) + 's ease-in-out infinite',
      }),
      div({
        position: 'absolute',
        left: '50%', top: '22%',
        width: '56px', height: '56px',
        marginLeft: '-28px', marginTop: '-28px',
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(255,235,170,0.98) 0%, rgba(255,200,110,0.85) 35%, rgba(255,160,70,0.5) 65%, transparent 78%)',
        boxShadow: '0 0 40px rgba(255,210,140,0.65), 0 0 80px rgba(255,180,90,0.35)',
        animation: 'wx-drought-sun ' + (14 / intensity) + 's ease-in-out infinite',
        mixBlendMode: 'screen',
        willChange: 'transform, opacity',
      }),
      div({
        position: 'absolute', left: '0', right: '0', bottom: '12%', height: '30%',
        background: 'repeating-linear-gradient(transparent 0 10px, rgba(255,220,170,0.04) 10px 11px)',
        animation: 'wx-shimmer ' + (7 / intensity) + 's ease-in-out infinite',
      }),
    ]);
  }

  // ──────────────────────────────────────────────────────────────────
  // DRY HEAT — SVG feTurbulence + feDisplacementMap warp
  // ──────────────────────────────────────────────────────────────────
  function dryHeat(intensity, instanceId) {
    var filterId = 'wxhw-' + instanceId;
    var scale = (5 + 3 * intensity).toFixed(1);
    var scaleHigh = (8 + 5 * intensity).toFixed(1);

    var turb = svgEl('feTurbulence', {
      type: 'fractalNoise',
      baseFrequency: '0.018 0.05',
      numOctaves: '2',
      seed: '3',
      result: 'turb',
    }, [
      svgEl('animate', {
        attributeName: 'baseFrequency',
        dur: '7s', repeatCount: 'indefinite',
        values: '0.018 0.05;0.025 0.07;0.018 0.05',
      }),
    ]);
    var disp = svgEl('feDisplacementMap', {
      in: 'SourceGraphic', in2: 'turb', scale: scale,
    }, [
      svgEl('animate', {
        attributeName: 'scale',
        dur: '4.2s', repeatCount: 'indefinite',
        values: scale + ';' + scaleHigh + ';' + scale,
      }),
    ]);
    var filter = svgEl('filter', {
      id: filterId, x: '-15%', y: '-15%', width: '130%', height: '130%',
    }, [turb, disp]);
    var defs = svgEl('defs', null, [filter]);

    var bars = [];
    for (var i = 0; i < 18; i++) {
      bars.push(svgEl('rect', {
        x: '-10', y: String(38 + i * 3.4),
        width: '220', height: '1.3',
        fill: 'rgba(255,232,200,0.32)',
      }));
    }
    var g = svgEl('g', {
      filter: 'url(#' + filterId + ')',
      opacity: '0.85',
    }, bars);

    var svg = svgEl('svg', {
      viewBox: '0 0 200 100',
      preserveAspectRatio: 'none',
      style: { position: 'absolute', inset: '0', width: '100%', height: '100%', opacity: '0.8' },
    }, [defs, g]);

    return W([
      div({
        position: 'absolute', inset: '0',
        background: 'linear-gradient(180deg, rgba(255,210,160,0.12) 0%, rgba(255,190,130,0.10) 100%)',
        mixBlendMode: 'screen',
      }),
      svg,
      div({
        position: 'absolute', left: '0', right: '0', bottom: '8%', height: '30%',
        background: 'repeating-linear-gradient(transparent 0 4px, rgba(255,230,200,0.05) 4px 5px)',
        animation: 'wx-heat-fast ' + (2.0 / intensity) + 's ease-in-out infinite',
      }),
    ]);
  }

  // ──────────────────────────────────────────────────────────────────
  // COASTAL FOG — low rolling fog from the sides
  // ──────────────────────────────────────────────────────────────────
  function coastalFog(intensity) {
    return W([
      div({
        position: 'absolute', inset: '0',
        background: 'linear-gradient(180deg, rgba(190,205,215,0.10) 0%, rgba(190,205,215,0.20) 60%, rgba(190,205,215,0.30) 100%)',
      }),
      div({
        position: 'absolute', left: '-30%', right: '-30%', bottom: '10%',
        height: '30%',
        background:
          'radial-gradient(60% 100% at 30% 50%, rgba(225,232,238,0.55) 0%, transparent 70%),' +
          'radial-gradient(50% 100% at 70% 50%, rgba(225,232,238,0.45) 0%, transparent 70%)',
        filter: 'blur(6px)',
        animation: 'wx-coastal ' + (22 / intensity) + 's ease-in-out infinite alternate',
      }),
      div({
        position: 'absolute', left: '-30%', right: '-30%', bottom: '35%',
        height: '20%',
        background: 'linear-gradient(180deg, transparent 0%, rgba(225,232,238,0.22) 50%, transparent 100%)',
        filter: 'blur(8px)',
        animation: 'wx-coastal-b ' + (30 / intensity) + 's ease-in-out infinite alternate',
      }),
    ]);
  }

  // ──────────────────────────────────────────────────────────────────
  // MORNING DEW — ground sparkles + cross stars
  // ──────────────────────────────────────────────────────────────────
  function morningDew(intensity) {
    var dots = Math.round(28 * intensity);
    var stars = Math.max(3, Math.round(7 * intensity));
    var kids = [
      div({
        position: 'absolute', inset: '0',
        background: 'linear-gradient(180deg, rgba(220,235,245,0.10) 0%, rgba(220,235,245,0.04) 60%, transparent 100%)',
        mixBlendMode: 'screen',
      }),
    ];
    for (var i = 0; i < dots; i++) {
      var left = (i * 13 + 4) % 100;
      var top  = 70 + (i * 7) % 26;
      var delay = (i * 0.19) % 3.5;
      var dur  = 2.4 + (i % 5) * 0.35;
      var sz   = 1.5 + (i % 4) * 0.4;
      kids.push(div({
        position: 'absolute',
        left: left + '%', top: top + '%',
        width: sz + 'px', height: sz + 'px', borderRadius: '50%',
        background: 'rgba(245,252,255,1)',
        boxShadow: '0 0 6px rgba(220,240,255,0.95), 0 0 12px rgba(200,230,255,0.45)',
        animation: 'wx-dew-sparkle ' + dur + 's ease-in-out ' + delay + 's infinite',
      }));
    }
    for (var s = 0; s < stars; s++) {
      var sleft = 8 + (s * 17) % 84;
      var stop  = 76 + (s * 5) % 20;
      var sdelay = (s * 0.7) % 4;
      var vert = div({
        position: 'absolute', left: '50%', top: '0', bottom: '0',
        width: '1.4px', marginLeft: '-0.7px',
        background: 'linear-gradient(180deg, transparent, rgba(255,255,255,0.95), transparent)',
      });
      var horiz = div({
        position: 'absolute', top: '50%', left: '0', right: '0',
        height: '1.4px', marginTop: '-0.7px',
        background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.95), transparent)',
      });
      kids.push(div({
        position: 'absolute',
        left: sleft + '%', top: stop + '%',
        width: '10px', height: '10px',
        marginLeft: '-5px', marginTop: '-5px',
        animation: 'wx-dew-star 3.2s ease-in-out ' + sdelay + 's infinite',
      }, [vert, horiz]));
    }
    return W(kids);
  }

  // ── Dispatch ────────────────────────────────────────────────────────
  function renderWeather(event, intensity) {
    if (intensity == null) intensity = 1;
    if (intensity <= 0) return null;
    var id = ++_instanceCounter;
    switch (event) {
      case 'arctic_wind':         return arcticWind(intensity);
      case 'late_freeze':         return lateFreeze(intensity);
      case 'monsoon':             return monsoon(intensity);
      case 'perfect_conditions':  return perfectConditions(intensity);
      case 'torrential_downpour': return torrentialDownpour(intensity);
      case 'dense_mist':          return denseMist(intensity);
      case 'drought':             return drought(intensity);
      case 'dry_heat':            return dryHeat(intensity, id);
      case 'coastal_fog':         return coastalFog(intensity);
      case 'morning_dew':         return morningDew(intensity);
      default: return null;
    }
  }

  // ── Class wrapper ───────────────────────────────────────────────────
  function BloomWeather(opts) {
    if (!opts || !opts.container) {
      throw new Error('BloomWeather: opts.container is required');
    }
    this.container = opts.container;
    this.event = opts.event || 'perfect_conditions';
    this.intensity = opts.intensity == null ? 1 : opts.intensity;
    this._destroyed = false;
    this._el = null;
    this._mount();
  }
  BloomWeather.prototype._mount = function () {
    if (this._destroyed) return;
    if (this._el && this._el.parentNode === this.container) {
      this.container.removeChild(this._el);
    }
    this._el = renderWeather(this.event, this.intensity);
    if (this._el) this.container.appendChild(this._el);
  };
  BloomWeather.prototype.setEvent = function (event) {
    this.event = event;
    this._mount();
  };
  BloomWeather.prototype.setIntensity = function (intensity) {
    this.intensity = intensity;
    this._mount();
  };
  BloomWeather.prototype.destroy = function () {
    if (this._destroyed) return;
    this._destroyed = true;
    if (this._el && this._el.parentNode === this.container) {
      this.container.removeChild(this._el);
    }
    this._el = null;
  };

  global.BloomWeather = {
    renderWeather:  renderWeather,
    BloomWeather:   BloomWeather,
    WEATHER_EVENTS: WEATHER_EVENTS,
  };
})(typeof window !== 'undefined' ? window : this);
