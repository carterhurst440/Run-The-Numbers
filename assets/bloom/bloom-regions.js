/*!
 * bloom-regions.js — vanilla port of the minimal region backgrounds.
 *
 * Exposes window.BloomRegions:
 *   .renderRegion(id, opts) → HTMLDivElement
 *   .BloomRegion             class { setRegion, setVignette, destroy }
 *   .REGION_LIST, .REGION_DEFS
 *
 * 5 biomes — pure static composition. Each biome is a vertical gradient
 * sky + a dirt band (base + thin stripe) + optional static scene content
 * (frond silhouettes, wave bands, fog layers).
 *
 * No CSS dependency: there are no animations to drive. The scene props are
 * baked as DOM/SVG with inline styles.
 */
(function (global) {
  'use strict';

  var SVG_NS = 'http://www.w3.org/2000/svg';

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
  function svgNode(tag, attrs, children) {
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

  // ── Region scenes (return Node or null) ────────────────────────────
  function tundraScene() {
    return null;
  }
  function desertScene() {
    return null;
  }

  // Tropical island — static wave bands above the soil
  function tropicalIslandScene() {
    return div({ position: 'absolute', inset: '0', pointerEvents: 'none' }, [
      div({
        position: 'absolute',
        left: '-20%', right: '-20%',
        bottom: '16%',
        height: '8px',
        background: 'repeating-linear-gradient(90deg, transparent 0 14px, rgba(255,255,255,0.45) 14px 18px, transparent 18px 32px)',
        opacity: '0.75',
      }),
      div({
        position: 'absolute',
        left: '-20%', right: '-20%',
        bottom: '20%',
        height: '4px',
        background: 'repeating-linear-gradient(90deg, transparent 0 22px, rgba(255,255,255,0.3) 22px 26px, transparent 26px 44px)',
        opacity: '0.55',
      }),
    ]);
  }

  // Jungle — static silhouette fronds at the bottom corners
  function jungleScene() {
    function frond(side) {
      var attrs = {
        viewBox: '0 0 100 200',
        preserveAspectRatio: side === 'left' ? 'xMinYMax meet' : 'xMaxYMax meet',
        style: {
          position: 'absolute',
          bottom: '12%',
          width: side === 'left' ? '30%' : '26%',
          height: side === 'left' ? '70%' : '62%',
        },
      };
      if (side === 'left') attrs.style.left = '-6%';
      else                 attrs.style.right = '-6%';
      var paths;
      if (side === 'left') {
        paths = [
          svgNode('path', { d: 'M 14 200 Q 12 140 18 80 Q 22 40 16 0 L 22 0 Q 30 50 24 110 Q 22 160 22 200 Z' }),
          svgNode('ellipse', { cx: '40', cy: '60',  rx: '34', ry: '9',  transform: 'rotate(-20 40 60)'  }),
          svgNode('ellipse', { cx: '46', cy: '92',  rx: '38', ry: '10', transform: 'rotate(-10 46 92)'  }),
          svgNode('ellipse', { cx: '38', cy: '130', rx: '32', ry: '8',  transform: 'rotate(8 38 130)'   }),
          svgNode('ellipse', { cx: '32', cy: '40',  rx: '28', ry: '7',  transform: 'rotate(-40 32 40)'  }),
        ];
      } else {
        paths = [
          svgNode('path', { d: 'M 80 200 Q 82 140 78 80 Q 76 40 82 0 L 88 0 Q 90 50 84 110 Q 82 160 86 200 Z' }),
          svgNode('ellipse', { cx: '60', cy: '70',  rx: '32', ry: '8', transform: 'rotate(18 60 70)'   }),
          svgNode('ellipse', { cx: '56', cy: '106', rx: '36', ry: '9', transform: 'rotate(8 56 106)'    }),
          svgNode('ellipse', { cx: '62', cy: '140', rx: '30', ry: '7', transform: 'rotate(-12 62 140)'  }),
        ];
      }
      var g = svgNode('g', { fill: '#0e2818', opacity: side === 'left' ? '0.7' : '0.65' }, paths);
      return svgNode('svg', attrs, [g]);
    }
    var wrap = div({ position: 'absolute', inset: '0', pointerEvents: 'none' });
    wrap.appendChild(frond('left'));
    wrap.appendChild(frond('right'));
    return wrap;
  }

  // Temperate forest — static fog bands
  function temperateForestScene() {
    return div({ position: 'absolute', inset: '0', pointerEvents: 'none' }, [
      div({
        position: 'absolute',
        left: '-30%', right: '-30%',
        bottom: '18%',
        height: '26%',
        background: 'linear-gradient(180deg, transparent 0%, rgba(180,210,180,0.14) 40%, rgba(180,210,180,0.18) 60%, transparent 100%)',
        filter: 'blur(8px)',
      }),
      div({
        position: 'absolute',
        left: '-30%', right: '-30%',
        bottom: '38%',
        height: '18%',
        background: 'linear-gradient(180deg, transparent 0%, rgba(170,200,170,0.09) 50%, transparent 100%)',
        filter: 'blur(10px)',
      }),
    ]);
  }

  // ── Region catalog ─────────────────────────────────────────────────
  var REGION_DEFS = {
    tundra: {
      name: 'TUNDRA',
      sub: 'blue · purple · white',
      accent: '#bcc6e0',
      sky: 'linear-gradient(180deg, #2a2f5e 0%, #4a4f88 30%, #7a78b0 60%, #c8c2dc 90%, #e8e4ee 100%)',
      soil: { base: '#2a1f14', stripe: '#e8e4ee', stripeHeight: 18 },
      scene: tundraScene,
    },
    desert: {
      name: 'DESERT',
      sub: 'orange · yellow · brown',
      accent: '#f5a14b',
      sky: 'linear-gradient(180deg, #f4b15a 0%, #f3933a 30%, #d96a2a 65%, #8c4a22 100%)',
      soil: { base: '#6e3e1e', stripe: '#e5b76a', stripeHeight: 22 },
      scene: desertScene,
    },
    tropical_island: {
      name: 'TROPICAL ISLAND',
      sub: 'green · sand · ocean',
      accent: '#54b8a8',
      sky: 'linear-gradient(180deg, #cfeae6 0%, #94d2c8 30%, #4ea99a 55%, #2a7a8a 78%, #1f5a76 100%)',
      soil: { base: '#dcc28a', stripe: '#b8956a', stripeHeight: 14 },
      scene: tropicalIslandScene,
    },
    jungle: {
      name: 'JUNGLE',
      sub: 'lush · humid · alive',
      accent: '#6abf52',
      sky: 'linear-gradient(180deg, #1f4a2a 0%, #2f6e3a 30%, #4a9a4e 60%, #7ac066 100%)',
      soil: { base: '#2a1a0e', stripe: '#3a5a28', stripeHeight: 20 },
      scene: jungleScene,
    },
    temperate_forest: {
      name: 'TEMPERATE FOREST',
      sub: 'evergreen · mossy · deep',
      accent: '#2e5a3a',
      sky: 'linear-gradient(180deg, #0e1f14 0%, #143028 30%, #1d4030 60%, #285a3a 100%)',
      soil: { base: '#1a140e', stripe: '#2a3a22', stripeHeight: 16 },
      scene: temperateForestScene,
    },
  };

  var REGION_LIST = [
    { id: 'tundra',           name: 'TUNDRA' },
    { id: 'jungle',           name: 'JUNGLE' },
    { id: 'tropical_island',  name: 'TROPICAL ISLAND' },
    { id: 'desert',           name: 'DESERT' },
    { id: 'temperate_forest', name: 'TEMPERATE FOREST' },
  ];

  // ── Public render fn ───────────────────────────────────────────────
  function renderRegion(id, opts) {
    opts = opts || {};
    var safeId = id === 'rainforest' ? 'jungle' : id;
    var R = REGION_DEFS[safeId] || REGION_DEFS.tundra;
    var height = opts.height == null ? 320 : opts.height;
    var heightCss = typeof height === 'number' ? (height + 'px') : height;
    var vignette = !!opts.vignette;
    var soilFraction = 0.16;

    var root = div({
      position: 'relative',
      width: '100%',
      height: heightCss,
      overflow: 'hidden',
      background: R.sky,
    });
    root.dataset.region = safeId;

    var scene = R.scene && R.scene();
    if (scene) root.appendChild(scene);

    // dirt base
    root.appendChild(div({
      position: 'absolute', left: '0', right: '0', bottom: '0',
      height: (soilFraction * 100) + '%',
      background: R.soil.base,
    }));
    // dirt accent stripe
    root.appendChild(div({
      position: 'absolute', left: '0', right: '0',
      bottom: (soilFraction * 100) + '%',
      height: R.soil.stripeHeight + 'px',
      background: R.soil.stripe,
      transform: 'translateY(1px)',
    }));

    if (vignette) {
      root.appendChild(div({
        position: 'absolute', inset: '0',
        background: 'radial-gradient(120% 70% at 50% 95%, transparent 35%, rgba(0,0,0,0.10) 75%, rgba(0,0,0,0.20) 100%)',
        pointerEvents: 'none',
      }));
    }
    return root;
  }

  // ── Class wrapper ──────────────────────────────────────────────────
  function BloomRegion(opts) {
    if (!opts || !opts.container) {
      throw new Error('BloomRegion: opts.container is required');
    }
    this.container = opts.container;
    this.id       = opts.id       || 'tundra';
    this.vignette = !!opts.vignette;
    this.height   = opts.height   == null ? 320 : opts.height;
    this._destroyed = false;
    this._el = null;
    this._mount();
  }
  BloomRegion.prototype._mount = function () {
    if (this._destroyed) return;
    if (this._el && this._el.parentNode === this.container) {
      this.container.removeChild(this._el);
    }
    this._el = renderRegion(this.id, {
      vignette: this.vignette,
      height: this.height,
    });
    this.container.appendChild(this._el);
  };
  BloomRegion.prototype.setRegion = function (id) {
    this.id = id;
    this._mount();
  };
  BloomRegion.prototype.setVignette = function (on) {
    this.vignette = !!on;
    this._mount();
  };
  BloomRegion.prototype.setHeight = function (h) {
    this.height = h;
    if (this._el) this._el.style.height = typeof h === 'number' ? (h + 'px') : h;
  };
  BloomRegion.prototype.destroy = function () {
    if (this._destroyed) return;
    this._destroyed = true;
    if (this._el && this._el.parentNode === this.container) {
      this.container.removeChild(this._el);
    }
    this._el = null;
  };

  global.BloomRegions = {
    renderRegion:  renderRegion,
    BloomRegion:   BloomRegion,
    REGION_DEFS:   REGION_DEFS,
    REGION_LIST:   REGION_LIST,
  };
})(typeof window !== 'undefined' ? window : this);
