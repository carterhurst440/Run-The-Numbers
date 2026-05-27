/* bloom-growth · side-by-side growth panel
 *
 *   Exposes a single global: window.BloomGrowth
 *     .SPECIES_BIOMES   — per-species biome card data (sky, soil, decor, plus/minus)
 *     .STAGE_LABELS     — ["SEED", "SPROUT", …, "BLOOM"] (7 stages, 0..6)
 *     .PCTS             — [0, 17, 33, 50, 67, 83, 100]
 *     .createDecor(kind)        → DOM node for ambient card weather
 *     .buildBiomeCard(species)  → { col, refs }  card element + handles to update
 *     .buildStatCard(species)   → DOM node
 *     .GrowthPanel(opts)        → class that mounts the full panel + controls
 *
 * Depends on:
 *   bloom-flowers/bloom-flowers.js  (window.BloomFlowers.FlowerStage)
 *   bloom-flowers/bloom-flowers.css (flower-swell keyframes)
 *   bloom-growth/bloom-growth.css   (panel layout + ambient keyframes)
 *
 * Card classes are all `bg-*`. The accent color is exposed via the
 * CSS variable `--bg-accent` on each card so themable .bg-bloomed
 * states can pull from it.
 */
(function (global) {
  'use strict';

  var BF = global.BloomFlowers;

  var SVG_NS = 'http://www.w3.org/2000/svg';

  // ── Catalog ────────────────────────────────────────────────────────
  // Each species ships with its own biome card backing — the same data
  // that drives Flower Growth · Side by Side.
  var SPECIES_BIOMES = [
    {
      id: 'arctic_poppy',
      name: 'ARCTIC POPPY',
      sci: 'Papaver radicatum',
      accent: '#f0a521',
      sky:  'linear-gradient(180deg, #e4dcf2 0%, #c8bce0 100%)',
      soil: { base: '#bcb0c0', stripe: '#ccc0cc', stripeHeight: 12 },
      plus:  ['COLD CLIMATE', 'SNOWFALL', 'GOOD DRAINAGE'],
      minus: ['HEAT WAVES', 'DROUGHT', 'HIGH HUMIDITY'],
      decor: 'tundra'
    },
    {
      id: 'hydrangea',
      name: 'HYDRANGEA',
      sci: 'Hydrangea macrophylla',
      accent: '#9c84d8',
      sky:  'linear-gradient(180deg, #d4e4d0 0%, #a8c4a2 100%)',
      soil: { base: '#8a8870', stripe: '#9aa088', stripeHeight: 12 },
      plus:  ['MOIST SOIL', 'PART SHADE', 'COOL ROOTS'],
      minus: ['HEAT WAVES', 'DROUGHT', 'DIRECT SUN'],
      decor: 'fog'
    },
    {
      id: 'hibiscus',
      name: 'RED HIBISCUS',
      sci: 'Hibiscus rosa-sinensis',
      accent: '#e63465',
      sky:  'linear-gradient(180deg, #e0f0ec 0%, #a8d0d5 60%, #82c0c8 100%)',
      soil: { base: '#dccdab', stripe: '#e6d8b8', stripeHeight: 12 },
      plus:  ['WARM TEMPS', 'HUMIDITY', 'FULL SUN'],
      minus: ['FROST', 'DROUGHT', 'STRONG WIND'],
      decor: 'tropical-band'
    },
    {
      id: 'cactus_blossom',
      name: 'CACTUS BLOSSOM',
      sci: 'Echinopsis sp.',
      accent: '#f06ba0',
      sky:  'linear-gradient(180deg, #fbf3e4 0%, #f3e0c4 100%)',
      soil: { base: '#d8b888', stripe: '#e6cca0', stripeHeight: 14 },
      plus:  ['DROUGHT', 'HOT SUN', 'SANDY SOIL'],
      minus: ['OVERWATER', 'FROST', 'DEEP SHADE'],
      decor: 'sunrays'
    },
    {
      id: 'orchid',
      name: 'ORCHID',
      sci: 'Phalaenopsis sp.',
      accent: '#d870e0',
      sky:  'linear-gradient(180deg, #e8f0c8 0%, #c8dc7c 100%)',
      soil: { base: '#7a5832', stripe: '#9c7642', stripeHeight: 14 },
      plus:  ['HIGH HUMIDITY', 'FILTERED SUN', 'AIR FLOW'],
      minus: ['DIRECT SUN', 'COLD SNAPS', 'WET ROOTS'],
      decor: 'dew'
    }
  ];

  // 7-stage native bloom-flowers timeline.
  var STAGE_LABELS = ['SEED', 'SPROUT', 'FOLIAGE', 'BUD INIT', 'BUD SWELLS', 'CRACKING', 'BLOOM'];
  var PCTS = [0, 17, 33, 50, 67, 83, 100];

  // ── Decor builders — subtle per-card ambient weather ───────────────
  function createDecor(kind) {
    if (kind === 'tundra') {
      var svg = document.createElementNS(SVG_NS, 'svg');
      svg.setAttribute('viewBox', '0 0 100 100');
      svg.setAttribute('preserveAspectRatio', 'none');
      svg.style.cssText =
        'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;' +
        'animation: bg-wx-drift-slow 24s ease-in-out infinite alternate;';
      [
        { cx: 22, cy: 16, rx: 15, ry: 3,   op: 0.55 },
        { cx: 68, cy: 24, rx: 19, ry: 3.5, op: 0.5  },
        { cx: 42, cy: 38, rx: 11, ry: 2.5, op: 0.4  }
      ].forEach(function (c) {
        var e = document.createElementNS(SVG_NS, 'ellipse');
        e.setAttribute('cx', c.cx); e.setAttribute('cy', c.cy);
        e.setAttribute('rx', c.rx); e.setAttribute('ry', c.ry);
        e.setAttribute('fill', 'white');
        e.setAttribute('opacity', c.op);
        svg.appendChild(e);
      });
      return svg;
    }
    if (kind === 'fog') {
      var d = document.createElement('div');
      d.style.cssText =
        'position:absolute;left:0;right:0;top:42%;height:22%;' +
        'background:linear-gradient(180deg,transparent 0%,rgba(255,255,255,0.45) 50%,transparent 100%);' +
        'filter:blur(5px);pointer-events:none;' +
        'animation: bg-wx-fog-drift 30s ease-in-out infinite alternate;';
      return d;
    }
    if (kind === 'tropical-band') {
      var b = document.createElement('div');
      b.style.cssText =
        'position:absolute;left:0;right:0;top:55%;height:12%;' +
        'background:linear-gradient(180deg,transparent 0%,rgba(140,200,210,0.45) 50%,transparent 100%);' +
        'pointer-events:none;' +
        'animation: bg-wx-fog-drift 26s ease-in-out infinite alternate;';
      return b;
    }
    if (kind === 'sunrays') {
      var s = document.createElementNS(SVG_NS, 'svg');
      s.setAttribute('viewBox', '0 0 100 100');
      s.setAttribute('preserveAspectRatio', 'none');
      s.style.cssText =
        'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;' +
        'animation: bg-wx-pulse 6s ease-in-out infinite;';
      [
        { x1: 95, y1: 5,  x2: 5,  y2: 60, c: 'rgba(255,235,170,0.35)', w: 0.7  },
        { x1: 95, y1: 15, x2: 25, y2: 80, c: 'rgba(255,235,170,0.28)', w: 0.55 },
        { x1: 95, y1: 25, x2: 45, y2: 95, c: 'rgba(255,235,170,0.22)', w: 0.45 },
        { x1: 95, y1: 35, x2: 60, y2: 95, c: 'rgba(255,235,170,0.18)', w: 0.4  }
      ].forEach(function (l) {
        var ln = document.createElementNS(SVG_NS, 'line');
        ln.setAttribute('x1', l.x1); ln.setAttribute('y1', l.y1);
        ln.setAttribute('x2', l.x2); ln.setAttribute('y2', l.y2);
        ln.setAttribute('stroke', l.c);
        ln.setAttribute('stroke-width', l.w);
        s.appendChild(ln);
      });
      return s;
    }
    if (kind === 'dew') {
      var sv = document.createElementNS(SVG_NS, 'svg');
      sv.setAttribute('viewBox', '0 0 100 100');
      sv.setAttribute('preserveAspectRatio', 'none');
      sv.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;';
      [
        { x: 18, y: 72, r: 0.7,  d: 0   },
        { x: 32, y: 82, r: 0.55, d: 0.5 },
        { x: 50, y: 76, r: 0.65, d: 1.0 },
        { x: 68, y: 85, r: 0.5,  d: 1.5 },
        { x: 82, y: 70, r: 0.75, d: 2.0 },
        { x: 42, y: 88, r: 0.45, d: 2.5 },
        { x: 75, y: 78, r: 0.5,  d: 3.0 }
      ].forEach(function (c, i) {
        var dot = document.createElementNS(SVG_NS, 'circle');
        dot.setAttribute('cx', c.x); dot.setAttribute('cy', c.y);
        dot.setAttribute('r', c.r);  dot.setAttribute('fill', 'white');
        dot.style.animation =
          'bg-wx-dew-twinkle ' + (3.5 + (i % 3) * 0.6) + 's ease-in-out ' + c.d + 's infinite';
        sv.appendChild(dot);
      });
      return sv;
    }
    var empty = document.createElement('span');
    empty.setAttribute('data-bg-decor', 'none');
    return empty;
  }

  // ── Single biome card (head + stage + bar + foot) ──────────────────
  // Returns { col: HTMLElement, refs: { col, pctEl, vbar, stageLabel, score, host, inst } }
  // The caller may pass `mountFlower: false` to skip creating a FlowerStage
  // instance (useful when the consumer wants to own its own flower).
  function buildBiomeCard(species, opts) {
    opts = opts || {};
    var col = document.createElement('div');
    col.className = 'bg-col';
    col.style.setProperty('--bg-accent', species.accent);

    // Header
    var head = document.createElement('div');
    head.className = 'bg-col-head';
    head.style.borderTop = '3px solid ' + species.accent;

    var text = document.createElement('div');
    text.className = 'bg-text';
    var name = document.createElement('div');
    name.className = 'bg-name';
    name.style.color = species.accent;
    name.textContent = species.name;
    var sci = document.createElement('div');
    sci.className = 'bg-sci';
    sci.textContent = species.sci;
    text.appendChild(name);
    text.appendChild(sci);

    var pctEl = document.createElement('div');
    pctEl.className = 'bg-pct';
    pctEl.style.color = species.accent;
    pctEl.textContent = '0%';

    head.appendChild(text);
    head.appendChild(pctEl);
    col.appendChild(head);

    // Stage area
    var stageEl = document.createElement('div');
    stageEl.className = 'bg-col-stage';

    var bg = document.createElement('div');
    bg.className = 'bg-col-bg';

    var sky = document.createElement('div');
    sky.className = 'bg-sky';
    sky.style.background = species.sky;
    bg.appendChild(sky);

    bg.appendChild(createDecor(species.decor));

    var soilBase = document.createElement('div');
    soilBase.className = 'bg-soil-base';
    soilBase.style.background = species.soil.base;
    bg.appendChild(soilBase);

    var soilStripe = document.createElement('div');
    soilStripe.className = 'bg-soil-stripe';
    soilStripe.style.background = species.soil.stripe;
    soilStripe.style.height = species.soil.stripeHeight + 'px';
    bg.appendChild(soilStripe);

    var svgWrap = document.createElement('div');
    svgWrap.className = 'bg-col-svg';
    var host = document.createElement('div');
    host.className = 'bg-flower-host';
    svgWrap.appendChild(host);
    bg.appendChild(svgWrap);

    stageEl.appendChild(bg);

    // Vertical bar
    var vbarWrap = document.createElement('div');
    vbarWrap.className = 'bg-vbar-wrap';
    var vbar = document.createElement('div');
    vbar.className = 'bg-vbar-fill';
    vbar.style.background = species.accent;
    vbarWrap.appendChild(vbar);
    stageEl.appendChild(vbarWrap);

    col.appendChild(stageEl);

    // Footer
    var foot = document.createElement('div');
    foot.className = 'bg-col-foot';
    var stageLabel = document.createElement('div');
    stageLabel.className = 'bg-stage-label';
    stageLabel.textContent = STAGE_LABELS[0];
    var score = document.createElement('div');
    score.className = 'bg-score';
    score.textContent = 'growing · 0 PTS';
    foot.appendChild(stageLabel);
    foot.appendChild(score);
    col.appendChild(foot);

    // FlowerStage instance (optional)
    var inst = null;
    if (opts.mountFlower !== false && BF && BF.FlowerStage) {
      inst = new BF.FlowerStage({
        container: host,
        species: species.id,
        stage: opts.stage == null ? 0 : opts.stage
      });
    }

    return {
      col: col,
      refs: {
        col: col,
        pctEl: pctEl,
        vbar: vbar,
        stageLabel: stageLabel,
        score: score,
        host: host,
        inst: inst
      }
    };
  }

  // ── Single +/– stat card ────────────────────────────────────────────
  function buildStatCard(species) {
    var sc = document.createElement('div');
    sc.className = 'bg-stat-card';

    var head = document.createElement('div');
    head.className = 'bg-stat-card-head';
    head.style.borderTop = '3px solid ' + species.accent;
    var nameEl = document.createElement('div');
    nameEl.className = 'bg-stat-card-name';
    nameEl.style.color = species.accent;
    nameEl.textContent = species.name;
    var tagEl = document.createElement('div');
    tagEl.className = 'bg-stat-card-tag';
    tagEl.textContent = 'conditions';
    head.appendChild(nameEl);
    head.appendChild(tagEl);
    sc.appendChild(head);

    var grid = document.createElement('div');
    grid.className = 'bg-stat-grid';

    function makeCol(kind, label, items) {
      var c = document.createElement('div');
      c.className = 'bg-stat-col bg-' + kind;
      var lab = document.createElement('div');
      lab.className = 'bg-stat-label';
      lab.textContent = label;
      c.appendChild(lab);
      items.forEach(function (i) {
        var row = document.createElement('div');
        row.className = 'bg-stat-item';
        row.textContent = (kind === 'plus' ? '+ ' : '– ') + i;
        c.appendChild(row);
      });
      return c;
    }

    grid.appendChild(makeCol('plus',  '+ PLUS',  species.plus));
    grid.appendChild(makeCol('minus', '– MINUS', species.minus));
    sc.appendChild(grid);

    return sc;
  }

  // ── Global controls bar ────────────────────────────────────────────
  // Internal helper used by GrowthPanel.
  function buildControls() {
    var wrap = document.createElement('div');
    wrap.className = 'bg-controls';

    var title = document.createElement('div');
    title.className = 'bg-title';
    var stageNum = document.createElement('span');
    stageNum.textContent = '00';
    var stageLabel = document.createElement('span');
    stageLabel.className = 'bg-stage-label';
    stageLabel.innerHTML = '· <span class="bg-stage-name">SEED</span>';
    title.appendChild(document.createTextNode('STAGE '));
    title.appendChild(stageNum);
    title.appendChild(document.createTextNode(' '));
    title.appendChild(stageLabel);

    var spacer = document.createElement('div');
    spacer.className = 'bg-spacer';

    function btn(label, ghost) {
      var b = document.createElement('button');
      b.className = 'bg-btn' + (ghost ? ' bg-ghost' : '');
      b.textContent = label;
      return b;
    }
    var btnPlay    = btn('⏸ PAUSE', false);
    var btnRestart = btn('↻ RESTART', true);
    var btnStep    = btn('STEP →', true);
    var btnBack    = btn('← BACK', true);

    var speed = document.createElement('div');
    speed.className = 'bg-speed';
    var label = document.createElement('span'); label.textContent = 'SPEED';
    var input = document.createElement('input');
    input.type = 'range'; input.min = '0.3'; input.max = '2.0'; input.step = '0.1'; input.value = '0.85';
    var readWrap = document.createElement('span');
    var readVal  = document.createElement('span');
    readVal.className = 'bg-readout';
    readVal.textContent = '0.85';
    readWrap.appendChild(readVal);
    readWrap.appendChild(document.createTextNode('s'));
    speed.appendChild(label);
    speed.appendChild(input);
    speed.appendChild(readWrap);

    wrap.appendChild(title);
    wrap.appendChild(spacer);
    wrap.appendChild(btnPlay);
    wrap.appendChild(btnRestart);
    wrap.appendChild(btnStep);
    wrap.appendChild(btnBack);
    wrap.appendChild(speed);

    return {
      el: wrap,
      stageNum: stageNum,
      stageName: stageLabel.querySelector('.bg-stage-name'),
      btnPlay: btnPlay,
      btnRestart: btnRestart,
      btnStep: btnStep,
      btnBack: btnBack,
      speedInput: input,
      speedRead: readVal
    };
  }

  // ── GrowthPanel — full side-by-side widget ─────────────────────────
  //
  //   new BloomGrowth.GrowthPanel({
  //     container: HTMLElement,                // required
  //     species:   array of biome species,     // default: SPECIES_BIOMES
  //     speed:     seconds per stage step,     // default: 0.85
  //     autoplay:  boolean,                    // default: true
  //     showControls: boolean,                 // default: true
  //     showStats:    boolean,                 // default: true
  //   })
  //
  //   Instance API:
  //     .play() / .pause() / .toggle()
  //     .restart() / .stepForward() / .stepBack()
  //     .setSpeed(seconds)
  //     .setStage(stage)
  //     .destroy()
  //
  function GrowthPanel(opts) {
    if (!opts || !opts.container) {
      throw new Error('GrowthPanel: opts.container is required');
    }
    this.container = opts.container;
    this.speciesList = (opts.species || SPECIES_BIOMES).slice();
    this.speed = opts.speed == null ? 0.85 : +opts.speed;
    this.playing = opts.autoplay !== false;
    this._frame = 0;
    this._tickId = 0;
    this._holdId = 0;
    this._destroyed = false;
    this._cards = [];
    this._showControls = opts.showControls !== false;
    this._showStats    = opts.showStats !== false;
    this._mount();
  }

  GrowthPanel.prototype._mount = function () {
    var self = this;

    // Controls
    if (this._showControls) {
      var c = buildControls();
      this._ctrl = c;
      this.container.appendChild(c.el);
      c.btnPlay.addEventListener('click',    function () { self.toggle(); });
      c.btnRestart.addEventListener('click', function () { self.restart(); });
      c.btnStep.addEventListener('click',    function () { self.stepForward(); });
      c.btnBack.addEventListener('click',    function () { self.stepBack(); });
      c.speedInput.addEventListener('input', function () {
        self.setSpeed(parseFloat(c.speedInput.value));
      });
    }

    // Card row
    var row = document.createElement('div');
    row.className = 'bg-row';
    this._row = row;
    this.container.appendChild(row);

    this.speciesList.forEach(function (sp) {
      var built = buildBiomeCard(sp);
      row.appendChild(built.col);
      self._cards.push({ species: sp, refs: built.refs });
    });

    // Stat row
    if (this._showStats) {
      var statRow = document.createElement('div');
      statRow.className = 'bg-stat-row';
      this._statRow = statRow;
      this.container.appendChild(statRow);
      this.speciesList.forEach(function (sp) {
        statRow.appendChild(buildStatCard(sp));
      });
    }

    this._render({ pulse: false });
    if (this.playing) this._schedule();
    else this._updatePlayButton();
  };

  GrowthPanel.prototype._render = function (opts) {
    opts = opts || {};
    var pct = PCTS[this._frame];
    var bloomed = this._frame === 6;
    if (this._ctrl) {
      this._ctrl.stageNum.textContent = (this._frame < 10 ? '0' : '') + this._frame;
      this._ctrl.stageName.textContent = STAGE_LABELS[this._frame];
    }
    this._cards.forEach(function (c) {
      var r = c.refs;
      r.pctEl.textContent = pct + '%';
      r.vbar.style.height = pct + '%';
      r.vbar.classList.toggle('bg-bloomed', bloomed);
      r.col.classList.toggle('bg-bloomed', bloomed);
      r.stageLabel.textContent = bloomed ? '★ BLOOMED' : STAGE_LABELS[this._frame];
      r.score.textContent = bloomed ? ('+' + pct + ' PTS') : ('growing · ' + pct + ' PTS');
      if (!r.inst) return;
      if (opts.transition) r.inst.transitionTo(this._frame);
      else {
        r.inst.setStage(this._frame);
        if (opts.pulse) r.inst.swell();
      }
    }, this);
  };

  GrowthPanel.prototype._clearTimers = function () {
    clearTimeout(this._tickId);  this._tickId = 0;
    clearTimeout(this._holdId);  this._holdId = 0;
  };

  GrowthPanel.prototype._schedule = function () {
    if (this._destroyed || !this.playing) return;
    var self = this;
    clearTimeout(this._tickId);
    this._tickId = setTimeout(function () {
      if (self._destroyed || !self.playing) return;
      if (self._frame >= 6) {
        // Hold bloom, then loop.
        self._holdId = setTimeout(function () {
          if (self._destroyed) return;
          self._frame = 0;
          self._render({ pulse: false });
          self._schedule();
        }, 1800);
        return;
      }
      self._frame += 1;
      self._render({ transition: true });
      self._schedule();
    }, this.speed * 1000);
  };

  GrowthPanel.prototype._updatePlayButton = function () {
    if (this._ctrl) this._ctrl.btnPlay.textContent = this.playing ? '⏸ PAUSE' : '▶ PLAY';
  };

  GrowthPanel.prototype.play = function () {
    if (this._destroyed) return;
    this.playing = true;
    this._updatePlayButton();
    this._clearTimers();
    this._schedule();
  };
  GrowthPanel.prototype.pause = function () {
    if (this._destroyed) return;
    this.playing = false;
    this._updatePlayButton();
    this._clearTimers();
  };
  GrowthPanel.prototype.toggle = function () { this.playing ? this.pause() : this.play(); };

  GrowthPanel.prototype.restart = function () {
    if (this._destroyed) return;
    this._clearTimers();
    this._frame = 0;
    this._render({ pulse: false });
    this.play();
  };

  GrowthPanel.prototype.stepForward = function () {
    if (this._destroyed) return;
    this.pause();
    if (this._frame < 6) {
      this._frame += 1;
      this._render({ transition: true });
    } else {
      this._render({ pulse: true });
    }
  };

  GrowthPanel.prototype.stepBack = function () {
    if (this._destroyed) return;
    this.pause();
    if (this._frame > 0) {
      this._frame -= 1;
      this._render({ pulse: true });
    }
  };

  GrowthPanel.prototype.setSpeed = function (s) {
    if (this._destroyed) return;
    this.speed = +s;
    if (this._ctrl) {
      this._ctrl.speedInput.value = String(this.speed);
      this._ctrl.speedRead.textContent = this.speed.toFixed(2);
    }
    if (this.playing) {
      this._clearTimers();
      this._schedule();
    }
  };

  GrowthPanel.prototype.setStage = function (stage) {
    if (this._destroyed) return;
    this.pause();
    var s = Math.max(0, Math.min(6, stage | 0));
    this._frame = s;
    this._render({ pulse: true });
  };

  GrowthPanel.prototype.destroy = function () {
    if (this._destroyed) return;
    this._destroyed = true;
    this._clearTimers();
    this._cards.forEach(function (c) { if (c.refs.inst) c.refs.inst.destroy(); });
    while (this.container.firstChild) this.container.removeChild(this.container.firstChild);
  };

  // ── Public API ─────────────────────────────────────────────────────
  global.BloomGrowth = {
    SPECIES_BIOMES: SPECIES_BIOMES,
    STAGE_LABELS:   STAGE_LABELS,
    PCTS:           PCTS,
    createDecor:    createDecor,
    buildBiomeCard: buildBiomeCard,
    buildStatCard:  buildStatCard,
    GrowthPanel:    GrowthPanel
  };

})(typeof window !== 'undefined' ? window : this);
