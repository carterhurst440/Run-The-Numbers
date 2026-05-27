/* flower-morphs.js
 *
 * Vanilla wrapper around the React 11-stage Morph flower components from
 * flowers.jsx, faithfully ported with Preact (3KB) doing the
 * VDOM diff so CSS transitions fire on every stage change.
 *
 * Load order:
 *   1) preact.umd.js        ← sets window.preact
 *   2) <inline bootstrap>   ← window.__h / window.__Fragment = preact.h / Fragment
 *   3) flowers-compiled.js  ← babel-compiled JSX (pragma __h), uses globals
 *   4) flower-morphs.js     ← this file, exposes window.FlowerMorphs
 *
 *   <script src="flower-morphs/preact.umd.js"></script>
 *   <script>window.__h = preact.h; window.__Fragment = preact.Fragment;</script>
 *   <script src="flower-morphs/flowers-compiled.js"></script>
 *   <script src="flower-morphs/flower-morphs.js"></script>
 *
 * Public API: window.FlowerMorphs
 *
 *   .SPECIES_IDS                  — ['arctic_poppy', 'hydrangea', 'hibiscus', 'cactus_blossom', 'orchid']
 *   .STAGE_LABELS                 — 11 labels (SEED ... BLOOM)
 *   .FRAME_TO_STAGE               — mapping table from flowers.jsx
 *   .Mount({ container, species, stage?, swell?, baseline? })
 *       Renders the Morph for `species` at `stage` into `container`.
 *       Returns { setStage(s), swell(), setSwell(b), destroy() }.
 *
 *       baseline: boolean (default true) — draw the subtle pale ground line
 *                 the side-by-side view ships with under each flower.
 */
(function (global) {
  'use strict';

  if (!global.preact) {
    console.error('[flower-morphs] preact missing — load preact.umd.js first.');
    return;
  }
  // Ensure global __h/__Fragment exist (compiled file references them as
  // bare identifiers; pragma is __h to avoid colliding with local "h" vars
  // used as height inside flowers.jsx).
  if (!global.__h)        global.__h        = global.preact.h;
  if (!global.__Fragment) global.__Fragment = global.preact.Fragment;

  var h        = global.preact.h;
  var Fragment = global.preact.Fragment;
  var render   = global.preact.render;

  var MORPH_BY_SPECIES = {
    arctic_poppy:   global.ArcticPoppyMorph,
    hydrangea:      global.HydrangeaMorph,
    hibiscus:       global.HibiscusMorph,
    cactus_blossom: global.CactusBlossomMorph,
    orchid:         global.OrchidMorph,
  };

  var SPECIES_IDS = Object.keys(MORPH_BY_SPECIES);

  // 11-frame timeline — matches FRAME_LABELS in flowers.jsx.
  var STAGE_LABELS = [
    'SEED', 'SEED CRACK', 'SPROUT', 'FIRST LEAVES', 'FOLIAGE',
    'BUD INIT', 'BUD GROWS', 'BUD SWELLS', 'COLOR PEEK', 'CRACKING', 'BLOOM',
  ];
  var FRAME_TO_STAGE = global.FRAME_TO_STAGE; // exposed by flowers-compiled.js

  var FLOWER_W = global.FLOWER_W || 220;
  var FLOWER_H = global.FLOWER_H || 340;

  // The side-by-side view wraps the Morph in an <svg> with a pale baseline.
  // Mirror that wrapper here so the consumer just hands us a container div.
  function FlowerSvg(props) {
    var Comp = MORPH_BY_SPECIES[props.species];
    if (!Comp) {
      return h('text', { x: 4, y: 14, fill: '#c4314b', 'font-size': '10' },
        'unknown species: ' + props.species);
    }
    var children = [];
    if (props.baseline !== false) {
      children.push(
        h('line', {
          x1: 80, y1: 300, x2: 140, y2: 300,
          stroke: '#cdb89a', 'stroke-width': '1.4',
          'stroke-linecap': 'round', opacity: '0.45',
        })
      );
    }
    children.push(h(Comp, { stage: props.stage | 0, swell: !!props.swell }));

    return h('svg', {
      viewBox: '0 0 ' + FLOWER_W + ' ' + FLOWER_H,
      preserveAspectRatio: 'xMidYMax meet',
      style: 'display:block;overflow:visible;width:auto;height:100%;max-height:100%;',
    }, children);
  }

  // Mount a Morph into a container. Returns a handle with imperative methods.
  function Mount(opts) {
    if (!opts || !opts.container) {
      throw new Error('FlowerMorphs.Mount: opts.container required');
    }
    if (!MORPH_BY_SPECIES[opts.species]) {
      throw new Error('FlowerMorphs.Mount: unknown species "' + opts.species + '"');
    }

    var state = {
      species:  opts.species,
      stage:    opts.stage  == null ? 0 : opts.stage | 0,
      swell:    !!opts.swell,
      baseline: opts.baseline !== false,
    };

    var swellTimer = 0;
    var destroyed  = false;

    function rerender() {
      if (destroyed) return;
      render(h(FlowerSvg, {
        species: state.species,
        stage:   state.stage,
        swell:   state.swell,
        baseline: state.baseline,
      }), opts.container);
    }

    rerender();

    return {
      setStage: function (s) {
        state.stage = Math.max(0, Math.min(10, s | 0));
        rerender();
      },
      // transitionTo — emphasis pulse + stage jump (matches FlowerStage API)
      transitionTo: function (s) {
        state.stage = Math.max(0, Math.min(10, s | 0));
        state.swell = true;
        rerender();
        clearTimeout(swellTimer);
        swellTimer = setTimeout(function () {
          if (destroyed) return;
          state.swell = false;
          rerender();
        }, 600);
      },
      swell: function () {
        state.swell = true;
        rerender();
        clearTimeout(swellTimer);
        swellTimer = setTimeout(function () {
          if (destroyed) return;
          state.swell = false;
          rerender();
        }, 600);
      },
      setSwell: function (b) {
        state.swell = !!b;
        rerender();
      },
      setSpecies: function (sp) {
        if (!MORPH_BY_SPECIES[sp]) return;
        state.species = sp;
        rerender();
      },
      getState: function () { return Object.assign({}, state); },
      destroy: function () {
        if (destroyed) return;
        destroyed = true;
        clearTimeout(swellTimer);
        render(null, opts.container);
      },
    };
  }

  global.FlowerMorphs = {
    SPECIES_IDS:     SPECIES_IDS,
    STAGE_LABELS:    STAGE_LABELS,
    FRAME_TO_STAGE:  FRAME_TO_STAGE,
    FLOWER_W:        FLOWER_W,
    FLOWER_H:        FLOWER_H,
    Mount:           Mount,
  };

})(typeof window !== 'undefined' ? window : this);
