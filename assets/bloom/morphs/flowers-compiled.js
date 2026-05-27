/* flowers-compiled.js
 * Auto-generated from flowers.jsx via Babel.
 * JSX pragma: __h, Fragment: __Fragment — chosen to avoid colliding with
 * local "h" (height) and "Fragment" identifiers in flowers.jsx.
 * Requires window.__h and window.__Fragment to be set before this loads
 * (the flower-morphs.js wrapper does this).
 */
/* global React */
// Flower components — botanically-distinct growth stages per species.
// Canvas: 220×340. Anchor (base of plant) at (110, 300). Soil line at y=300.
// All stages render on transparent background; host decides backdrop.
//
// Each species component takes:
//   stage : 0..6  (0 seed → 6 bloom)
//   swell : bool  (briefly true when growth ticks up within a stage)
//
// Stage semantics — generic, but specifics differ per species:
//   0  SEED          tiny species-typical seed sitting on/in soil
//   1  SPROUT        cotyledons / first emergence (very species-specific)
//   2  FOLIAGE       true leaves / mature plant body, no flower structures
//   3  BUD INITIATES first bud(s) appear, still green/protected
//   4  BUD SWELLS    bud grows, color hint begins
//   5  CRACKING      sepals/bracts part, petal color clearly visible
//   6  BLOOM         fully open flower

const FLOWER_W = 220;
const FLOWER_H = 340;
const ANCHOR_X = 110;
const SOIL_Y = 300;

// ── Frame system: 11 discrete growth frames at 10% increments ─────────
// Each frame maps to a base stage + optional "extra" detail. Intermediate
// frames render the base stage plus a small species-aware overlay that
// articulates the next bit of growth (sprout emerging, true leaves,
// bud enlarging, color showing). Pass `frame={0..10}` to <Flower>.
const FRAME_TO_STAGE = [{
  stage: 0,
  extra: null
},
//  0 SEED
{
  stage: 0,
  extra: "crack"
},
//  1 SEED CRACK
{
  stage: 1,
  extra: null
},
//  2 SPROUT
{
  stage: 1,
  extra: "leaves"
},
//  3 FIRST LEAVES
{
  stage: 2,
  extra: null
},
//  4 FOLIAGE
{
  stage: 3,
  extra: null
},
//  5 BUD INIT
{
  stage: 3,
  extra: "grows"
},
//  6 BUD GROWS
{
  stage: 4,
  extra: null
},
//  7 BUD SWELLS
{
  stage: 4,
  extra: "peek"
},
//  8 COLOR PEEK
{
  stage: 5,
  extra: null
},
//  9 CRACKING
{
  stage: 6,
  extra: null
} // 10 BLOOM
];
const FRAME_LABELS = ["SEED", "SEED CRACK", "SPROUT", "FIRST LEAVES", "FOLIAGE", "BUD INIT", "BUD GROWS", "BUD SWELLS", "COLOR PEEK", "CRACKING", "BLOOM"];

// ── Frame extras: intermediate-frame overlays ─────────────────────────
// Small visual additions that distinguish a "between" frame from its
// base stage. SeedCrack / FirstLeaves sit at the soil; BudGrows /
// ColorPeek take a tipX/tipY supplied by the species (since the bud
// position varies).
const SeedCrackOverlay = () => __h("g", null, __h("line", {
  x1: ANCHOR_X,
  y1: SOIL_Y - 1.5,
  x2: ANCHOR_X,
  y2: SOIL_Y - 5.5,
  stroke: "#7aac5e",
  strokeWidth: "1.4",
  strokeLinecap: "round"
}), __h("ellipse", {
  cx: ANCHOR_X - 1.8,
  cy: SOIL_Y - 5.6,
  rx: 1.6,
  ry: 0.7,
  fill: "#a4c882",
  transform: `rotate(-30 ${ANCHOR_X - 1.8} ${SOIL_Y - 5.6})`
}), __h("ellipse", {
  cx: ANCHOR_X + 1.8,
  cy: SOIL_Y - 5.6,
  rx: 1.6,
  ry: 0.7,
  fill: "#a4c882",
  transform: `rotate(30 ${ANCHOR_X + 1.8} ${SOIL_Y - 5.6})`
}));
const FirstLeavesOverlay = () => __h("g", null, __h("ellipse", {
  cx: ANCHOR_X - 9,
  cy: SOIL_Y - 13,
  rx: 5,
  ry: 2,
  fill: "#5a8e44",
  transform: `rotate(-32 ${ANCHOR_X - 9} ${SOIL_Y - 13})`
}), __h("ellipse", {
  cx: ANCHOR_X + 9,
  cy: SOIL_Y - 13,
  rx: 5,
  ry: 2,
  fill: "#5a8e44",
  transform: `rotate(32 ${ANCHOR_X + 9} ${SOIL_Y - 13})`
}), __h("line", {
  x1: ANCHOR_X - 4,
  y1: SOIL_Y - 13,
  x2: ANCHOR_X - 13,
  y2: SOIL_Y - 14,
  stroke: "#3a6a22",
  strokeWidth: "0.45",
  opacity: "0.7"
}), __h("line", {
  x1: ANCHOR_X + 4,
  y1: SOIL_Y - 13,
  x2: ANCHOR_X + 13,
  y2: SOIL_Y - 14,
  stroke: "#3a6a22",
  strokeWidth: "0.45",
  opacity: "0.7"
}));
const BudGrowsOverlay = ({
  tipY,
  tipX = ANCHOR_X
}) => __h("g", {
  transform: `translate(${tipX} ${tipY - 4})`
}, __h("circle", {
  r: 7,
  fill: "none",
  stroke: "#7aac5e",
  strokeWidth: "1.1",
  opacity: "0.55",
  strokeDasharray: "3 2.5"
}), __h("ellipse", {
  cx: 0,
  cy: -2,
  rx: 3.8,
  ry: 6,
  fill: "#3a8a3e",
  opacity: "0.5"
}));
const ColorPeekOverlay = ({
  tipY,
  tipX = ANCHOR_X,
  color = "#e63465"
}) => __h("g", {
  transform: `translate(${tipX} ${tipY - 8})`
}, __h("ellipse", {
  cx: 0,
  cy: 0,
  rx: 2.8,
  ry: 3.4,
  fill: color,
  opacity: "0.92"
}), __h("ellipse", {
  cx: -0.6,
  cy: -1,
  rx: 1.3,
  ry: 1.3,
  fill: "#fff",
  opacity: "0.4"
}), __h("ellipse", {
  cx: 0.6,
  cy: 1.2,
  rx: 0.9,
  ry: 1.2,
  fill: color,
  opacity: "0.75"
}));

// Helper: derive (stage, extra) from a frame prop, or fall back to stage.
function resolveFrame(stageProp, frame) {
  if (frame == null) return {
    stage: stageProp,
    extra: null
  };
  const f = FRAME_TO_STAGE[frame];
  if (!f) return {
    stage: stageProp,
    extra: null
  };
  return {
    stage: f.stage,
    extra: f.extra
  };
}

// ── Shared primitives ──────────────────────────────────────────────────

// A simple oval leaf with a midrib.
const Leaf = ({
  cx,
  cy,
  w,
  h,
  angle = 0,
  color = "#3e8a44",
  vein = "#2e6c34"
}) => __h("g", {
  transform: `rotate(${angle} ${cx} ${cy})`
}, __h("ellipse", {
  cx: cx,
  cy: cy,
  rx: w / 2,
  ry: h / 2,
  fill: color
}), __h("line", {
  x1: cx - w / 2 + 1,
  y1: cy,
  x2: cx + w / 2 - 1,
  y2: cy,
  stroke: vein,
  strokeWidth: 0.7,
  opacity: 0.7
}));

// A toothed/serrated leaf using a path. Returns a leaf pointing "up" then
// you rotate it. Origin at the base of the leaf at the petiole.
const ToothedLeaf = ({
  cx,
  cy,
  length,
  width,
  angle = 0,
  color = "#3e8a44",
  vein = "#225828",
  teeth = 6
}) => {
  // Build a leaf outline using zig-zag teeth along each side.
  const half = width / 2;
  const tipY = -length;
  const baseY = 0;
  const stepY = length / teeth;
  // right side teeth
  let path = `M 0 ${baseY} `;
  for (let i = 1; i <= teeth; i++) {
    const y = baseY - stepY * i;
    const isOut = i % 2 === 0;
    path += `Q ${half * 0.95} ${y + stepY * 0.5} ${(isOut ? half : half * 0.6) * (1 - i / teeth / 1.5)} ${y} `;
  }
  // tip and left side
  path += `L 0 ${tipY - 2} `;
  for (let i = teeth; i >= 1; i--) {
    const y = baseY - stepY * i;
    const isOut = i % 2 === 0;
    path += `Q ${-half * 0.95} ${y + stepY * 0.5} ${-(isOut ? half : half * 0.6) * (1 - i / teeth / 1.5)} ${y} `;
  }
  path += `Z`;
  return __h("g", {
    transform: `translate(${cx} ${cy}) rotate(${angle})`
  }, __h("path", {
    d: path,
    fill: color
  }), __h("line", {
    x1: "0",
    y1: baseY,
    x2: "0",
    y2: tipY,
    stroke: vein,
    strokeWidth: "0.8",
    opacity: "0.65"
  }), Array.from({
    length: Math.floor(teeth / 2)
  }).map((_, i) => {
    const y = baseY - stepY * (i * 2 + 1);
    return __h("g", {
      key: i
    }, __h("line", {
      x1: "0",
      y1: y,
      x2: half * 0.55,
      y2: y - stepY * 0.3,
      stroke: vein,
      strokeWidth: "0.5",
      opacity: "0.55"
    }), __h("line", {
      x1: "0",
      y1: y,
      x2: -half * 0.55,
      y2: y - stepY * 0.3,
      stroke: vein,
      strokeWidth: "0.5",
      opacity: "0.55"
    }));
  }));
};

// Curving stem path. anchor at (ANCHOR_X, SOIL_Y); ends at (tipX, tipY).
const CurveStem = ({
  tipX = ANCHOR_X,
  tipY = SOIL_Y - 80,
  curve = 0,
  color = "#3e8a44",
  thick = 3,
  dashed = false
}) => {
  const midX = (ANCHOR_X + tipX) / 2 + curve;
  const midY = (SOIL_Y + tipY) / 2;
  return __h("path", {
    d: `M ${ANCHOR_X} ${SOIL_Y} Q ${midX} ${midY} ${tipX} ${tipY}`,
    fill: "none",
    stroke: color,
    strokeWidth: thick,
    strokeLinecap: "round",
    strokeDasharray: dashed ? "2 2" : undefined
  });
};

// Tiny radiating bristles along a stem (for arctic poppy's hairy stalk).
const HairyStem = ({
  tipX = ANCHOR_X,
  tipY = SOIL_Y - 80,
  color = "#5a8848",
  thick = 2.2
}) => {
  const steps = 14;
  const lines = [];
  for (let i = 1; i <= steps; i++) {
    const t = i / (steps + 1);
    const x = ANCHOR_X + (tipX - ANCHOR_X) * t;
    const y = SOIL_Y + (tipY - SOIL_Y) * t;
    // perpendicular direction (rough)
    const dx = (tipY - SOIL_Y) / Math.hypot(tipX - ANCHOR_X, tipY - SOIL_Y);
    const dy = -(tipX - ANCHOR_X) / Math.hypot(tipX - ANCHOR_X, tipY - SOIL_Y);
    const len = 3.2;
    lines.push(__h("line", {
      key: `r${i}`,
      x1: x,
      y1: y,
      x2: x + dx * len,
      y2: y + dy * len,
      stroke: color,
      strokeWidth: "0.7",
      opacity: "0.85"
    }));
    lines.push(__h("line", {
      key: `l${i}`,
      x1: x,
      y1: y,
      x2: x - dx * len,
      y2: y - dy * len,
      stroke: color,
      strokeWidth: "0.7",
      opacity: "0.85"
    }));
  }
  return __h(__Fragment, null, __h(CurveStem, {
    tipX: tipX,
    tipY: tipY,
    color: color,
    thick: thick
  }), lines);
};

// BLOOM CELEBRATION — shared overlay elements that play on stage 6 for
// any species: soft accent halo behind the plant, sparkle stars scattered
// around, fallen petals on the ground line, slow rotating light ray burst.
function BloomFX({
  accent = "#e63465",
  centerX = ANCHOR_X,
  centerY = SOIL_Y - 80,
  radius = 70
}) {
  // sparkles distributed in a ring around the bloom center
  const sparkles = Array.from({
    length: 12
  }).map((_, i) => {
    const a = i / 12 * Math.PI * 2 + i % 3 * 0.4;
    const r = radius * (0.55 + i % 4 * 0.12);
    return {
      x: centerX + Math.cos(a) * r,
      y: centerY + Math.sin(a) * r * 0.85,
      size: 2 + i % 3,
      delay: i * 0.18 % 2
    };
  });
  // fallen petals along ground line
  const petals = [{
    x: ANCHOR_X - 36,
    rot: -30,
    opacity: 0.8
  }, {
    x: ANCHOR_X - 22,
    rot: 12,
    opacity: 0.6
  }, {
    x: ANCHOR_X + 18,
    rot: -8,
    opacity: 0.7
  }, {
    x: ANCHOR_X + 32,
    rot: 24,
    opacity: 0.55
  }, {
    x: ANCHOR_X + 48,
    rot: -18,
    opacity: 0.5
  }, {
    x: ANCHOR_X - 50,
    rot: 20,
    opacity: 0.5
  }];
  // unique ID per accent so multiple plants on a page don't collide
  const haloId = `bloom-halo-${accent.replace(/[^a-z0-9]/gi, '')}`;
  return __h("g", {
    style: {
      pointerEvents: "none"
    }
  }, __h("defs", null, __h("radialGradient", {
    id: haloId,
    cx: "50%",
    cy: "50%",
    r: "50%"
  }, __h("stop", {
    offset: "0%",
    "stop-color": accent,
    "stop-opacity": "0.32"
  }), __h("stop", {
    offset: "50%",
    "stop-color": accent,
    "stop-opacity": "0.10"
  }), __h("stop", {
    offset: "100%",
    "stop-color": accent,
    "stop-opacity": "0"
  }))), __h("ellipse", {
    cx: centerX,
    cy: centerY,
    rx: radius * 1.4,
    ry: radius * 1.2,
    fill: `url(#${haloId})`,
    style: {
      animation: "bloomfx-halo 3s ease-in-out infinite"
    }
  }), __h("g", {
    style: {
      transformOrigin: `${centerX}px ${centerY}px`,
      animation: "bloomfx-spin 18s linear infinite"
    }
  }, Array.from({
    length: 12
  }).map((_, i) => {
    const a = i / 12 * 360;
    return __h("line", {
      key: i,
      x1: centerX,
      y1: centerY,
      x2: centerX + Math.cos(a * Math.PI / 180) * radius * 1.5,
      y2: centerY + Math.sin(a * Math.PI / 180) * radius * 1.5,
      stroke: accent,
      strokeWidth: "0.6",
      opacity: "0.18"
    });
  })), sparkles.map((sp, i) => __h("g", {
    key: i,
    transform: `translate(${sp.x} ${sp.y})`,
    style: {
      animation: `bloomfx-sparkle 2.4s ease-in-out ${sp.delay}s infinite`
    }
  }, __h("path", {
    d: `M 0 ${-sp.size} L ${sp.size * 0.4} ${-sp.size * 0.4}
                    L ${sp.size} 0 L ${sp.size * 0.4} ${sp.size * 0.4}
                    L 0 ${sp.size} L ${-sp.size * 0.4} ${sp.size * 0.4}
                    L ${-sp.size} 0 L ${-sp.size * 0.4} ${-sp.size * 0.4} Z`,
    fill: accent
  }), __h("circle", {
    r: sp.size * 0.35,
    fill: "#fff",
    opacity: "0.9"
  }))), petals.map((p, i) => __h("g", {
    key: i,
    transform: `translate(${p.x} ${SOIL_Y + 2}) rotate(${p.rot})`,
    style: {
      opacity: p.opacity,
      animation: `bloomfx-petal-sway 4s ease-in-out ${i * 0.3}s infinite`
    }
  }, __h("ellipse", {
    cx: 0,
    cy: 0,
    rx: 4,
    ry: 2,
    fill: accent
  }), __h("ellipse", {
    cx: -1,
    cy: -0.5,
    rx: 1.5,
    ry: 0.8,
    fill: "#fff",
    opacity: "0.35"
  }))));
}

// Wrap everything with the optional swell scale.
const Plant = ({
  children,
  swell
}) => __h("g", {
  style: {
    transformOrigin: `${ANCHOR_X}px ${SOIL_Y}px`,
    animation: swell ? "flower-swell 0.6s ease-in-out" : "none",
    transition: "all 0.8s cubic-bezier(.22,1,.36,1)"
  }
}, children);

// ════════════════════════════════════════════════════════════════════════
// ARCTIC POPPY · Papaver radicatum
// Hairy throughout. Basal rosette of pinnately-lobed hairy leaves; single
// nodding bud on a long bristly stalk; 4 crinkled satiny yellow petals with
// dark anther crown and disc-shaped stigma.
// ════════════════════════════════════════════════════════════════════════

// Pinnately-lobed hairy leaf — radiates from base point
function PoppyLeaf({
  cx,
  cy,
  length = 18,
  angle = 0,
  color = "#5e8a4a"
}) {
  // Deeply lobed silhouette built as a zig-zag along both sides
  const lobes = 4;
  const w = length * 0.36;
  let path = `M 0 0 `;
  for (let i = 0; i < lobes; i++) {
    const t1 = (i + 0.5) / lobes;
    const t2 = (i + 1) / lobes;
    path += `Q ${w} ${-length * t1 * 0.95} ` + `${w * (1 - (i + 1) / (lobes + 1))} ${-length * t2} `;
  }
  path += `L 0 ${-length} `;
  for (let i = lobes - 1; i >= 0; i--) {
    const t1 = (i + 0.5) / lobes;
    const t2 = i / lobes;
    path += `Q ${-w} ${-length * t1 * 0.95} ` + `${-w * (1 - (i + 1) / (lobes + 1))} ${-length * t2} `;
  }
  path += `Z`;
  // bristles — short lines radiating off the leaf edge
  const bristles = [];
  for (let i = 0; i < 8; i++) {
    const t = i / 7;
    const lx = (Math.sin(t * Math.PI * 2 + cx) * 0.3 + 0.5) * w;
    const ly = -length * t * 0.95;
    bristles.push(__h("line", {
      key: `b${i}`,
      x1: lx,
      y1: ly,
      x2: lx + 1.4,
      y2: ly - 1.6,
      stroke: color,
      strokeWidth: "0.4",
      opacity: "0.7"
    }));
    bristles.push(__h("line", {
      key: `bn${i}`,
      x1: -lx,
      y1: ly,
      x2: -lx - 1.4,
      y2: ly - 1.6,
      stroke: color,
      strokeWidth: "0.4",
      opacity: "0.7"
    }));
  }
  return __h("g", {
    transform: `translate(${cx} ${cy}) rotate(${angle})`
  }, __h("path", {
    d: path,
    fill: color
  }), __h("path", {
    d: path,
    fill: "#8db672",
    opacity: "0.32",
    transform: "translate(0.6 -0.6)"
  }), __h("line", {
    x1: 0,
    y1: 0,
    x2: 0,
    y2: -length,
    stroke: "#3e6a32",
    strokeWidth: "0.6",
    opacity: "0.7"
  }), bristles);
}

// Bristly stalk — a curved line covered in tiny outward-pointing hairs
function BristlyStalk({
  tipX,
  tipY,
  color = "#6e9450",
  thick = 2.4,
  density = 18
}) {
  const lines = [];
  for (let i = 1; i <= density; i++) {
    const t = i / (density + 1);
    const x = ANCHOR_X + (tipX - ANCHOR_X) * t;
    const y = SOIL_Y + (tipY - SOIL_Y) * t;
    // perpendicular direction
    const dl = Math.hypot(tipX - ANCHOR_X, tipY - SOIL_Y);
    const px = (tipY - SOIL_Y) / dl;
    const py = -(tipX - ANCHOR_X) / dl;
    const len = 3 + i % 3 * 0.4;
    // alternate sides + add stagger
    const side = i % 2 === 0 ? 1 : -1;
    lines.push(__h("line", {
      key: `s${i}`,
      x1: x,
      y1: y,
      x2: x + px * len * side,
      y2: y + py * len * side,
      stroke: color,
      strokeWidth: "0.65",
      opacity: "0.85"
    }));
    if (i % 2 === 0) {
      // extra bristle the other side for fullness
      lines.push(__h("line", {
        key: `s2-${i}`,
        x1: x,
        y1: y,
        x2: x + px * (len * 0.8) * -side,
        y2: y + py * (len * 0.8) * -side,
        stroke: color,
        strokeWidth: "0.55",
        opacity: "0.7"
      }));
    }
  }
  return __h(__Fragment, null, __h("path", {
    d: `M ${ANCHOR_X} ${SOIL_Y} Q ${ANCHOR_X + 3} ${(SOIL_Y + tipY) / 2} ${tipX} ${tipY}`,
    fill: "none",
    stroke: color,
    strokeWidth: thick,
    strokeLinecap: "round"
  }), lines);
}

// Hairy nodding/upright bud — encased by two papery sepal halves with bristles
function PoppyBud({
  scale = 1,
  openness = 0,
  colorHint = false
}) {
  // openness: 0 = closed, 1 = sepals halfway open
  const s = scale;
  const halfOffset = 1 + openness * 5;
  // bud body
  return __h("g", null, colorHint && __h("ellipse", {
    cx: 0,
    cy: -2 * s,
    rx: 3.2 * s,
    ry: 5 * s,
    fill: "#fbe064",
    opacity: "0.85"
  }), __h("path", {
    d: `M ${-halfOffset} 4 
            Q ${-6 * s} 0 ${-5 * s} ${-7 * s}
            Q ${-3 * s} ${-10 * s} ${-halfOffset * 0.6} ${-8 * s}
            Q ${-halfOffset * 0.4} 0 ${-halfOffset} 4 Z`,
    fill: "#6c9450",
    transform: `rotate(${openness * -25})`
  }), __h("path", {
    d: `M ${-halfOffset} 4 
            Q ${-6 * s} 0 ${-5 * s} ${-7 * s}
            Q ${-3 * s} ${-10 * s} ${-halfOffset * 0.6} ${-8 * s}
            Q ${-halfOffset * 0.4} 0 ${-halfOffset} 4 Z`,
    fill: "#3e6a32",
    opacity: "0.3",
    transform: `rotate(${openness * -25}) translate(0.5 -0.5)`
  }), __h("path", {
    d: `M ${halfOffset} 4 
            Q ${6 * s} 0 ${5 * s} ${-7 * s}
            Q ${3 * s} ${-10 * s} ${halfOffset * 0.6} ${-8 * s}
            Q ${halfOffset * 0.4} 0 ${halfOffset} 4 Z`,
    fill: "#6c9450",
    transform: `rotate(${openness * 25})`
  }), __h("path", {
    d: `M ${halfOffset} 4 
            Q ${6 * s} 0 ${5 * s} ${-7 * s}
            Q ${3 * s} ${-10 * s} ${halfOffset * 0.6} ${-8 * s}
            Q ${halfOffset * 0.4} 0 ${halfOffset} 4 Z`,
    fill: "#3e6a32",
    opacity: "0.3",
    transform: `rotate(${openness * 25}) translate(-0.5 -0.5)`
  }), Array.from({
    length: 14
  }).map((_, i) => {
    const angle = i / 14 * Math.PI * 2 - Math.PI / 2;
    const r = 5 * s;
    const x = Math.sin(angle) * r;
    const y = Math.cos(angle) * r - 3 * s;
    return __h("line", {
      key: i,
      x1: x,
      y1: y,
      x2: x + Math.sin(angle) * 2.4,
      y2: y + Math.cos(angle) * 2.4 - 0.4,
      stroke: "#a8c08c",
      strokeWidth: "0.5",
      opacity: "0.85"
    });
  }));
}
function ArcticPoppy({
  stage: stageProp = 0,
  frame,
  swell = false
}) {
  const {
    stage,
    extra
  } = resolveFrame(stageProp, frame);
  // bloom at y=50 (stalkH 250) so all species top out together.
  // Growth weighted into 3→4 and 4→5 so progress reads vertically.
  const stalkH = [0, 12, 0, 150, 205, 235, 250][stage];
  const tipY = SOIL_Y - stalkH;
  // bud nods to the side at early stages
  const budTilt = stage === 3 ? 40 : stage === 4 ? 18 : 0;
  return __h(Plant, {
    swell: swell
  }, stage === 0 && __h("g", null, __h("path", {
    d: `M ${ANCHOR_X - 1.4} ${SOIL_Y - 1.4}
                    Q ${ANCHOR_X - 1.6} ${SOIL_Y - 2.6} ${ANCHOR_X} ${SOIL_Y - 2.8}
                    Q ${ANCHOR_X + 1.6} ${SOIL_Y - 2.6} ${ANCHOR_X + 1.4} ${SOIL_Y - 1.4}
                    Q ${ANCHOR_X} ${SOIL_Y - 1} ${ANCHOR_X - 1.4} ${SOIL_Y - 1.4} Z`,
    fill: "#1a0e08"
  }), __h("circle", {
    cx: ANCHOR_X - 5,
    cy: SOIL_Y + 0.5,
    r: 0.6,
    fill: "#8a7858",
    opacity: "0.6"
  }), __h("circle", {
    cx: ANCHOR_X + 6,
    cy: SOIL_Y + 1.5,
    r: 0.5,
    fill: "#8a7858",
    opacity: "0.6"
  })), stage === 1 && __h("g", null, __h("line", {
    x1: ANCHOR_X,
    y1: SOIL_Y,
    x2: ANCHOR_X,
    y2: SOIL_Y - 5,
    stroke: "#7aac5e",
    strokeWidth: "1.2",
    strokeLinecap: "round"
  }), __h("ellipse", {
    cx: ANCHOR_X - 3.5,
    cy: SOIL_Y - 6,
    rx: 3.5,
    ry: 1.2,
    fill: "#a4c882",
    transform: `rotate(-25 ${ANCHOR_X - 3.5} ${SOIL_Y - 6})`
  }), __h("ellipse", {
    cx: ANCHOR_X + 3.5,
    cy: SOIL_Y - 6,
    rx: 3.5,
    ry: 1.2,
    fill: "#a4c882",
    transform: `rotate(25 ${ANCHOR_X + 3.5} ${SOIL_Y - 6})`
  }), __h(PoppyLeaf, {
    cx: ANCHOR_X,
    cy: SOIL_Y - 6,
    length: 6,
    angle: 0,
    color: "#7aac5e"
  }), [-2, 0, 2].map(dx => __h("line", {
    key: dx,
    x1: ANCHOR_X + dx,
    y1: SOIL_Y - 6,
    x2: ANCHOR_X + dx * 1.6,
    y2: SOIL_Y - 9,
    stroke: "#7aac5e",
    strokeWidth: "0.4"
  }))), stage === 2 && __h("g", null, [-80, -50, -20, 20, 50, 80].map((a, i) => __h(PoppyLeaf, {
    key: a,
    cx: ANCHOR_X + Math.sin(a * Math.PI / 180) * 2,
    cy: SOIL_Y - 1,
    length: 14 + i % 3 * 4,
    angle: a,
    color: "#5e8a4a"
  })), __h("circle", {
    cx: ANCHOR_X,
    cy: SOIL_Y - 2,
    r: 1.6,
    fill: "#3e6a2a"
  }), [0, 60, 120, 180, 240, 300].map(a => __h("line", {
    key: a,
    x1: ANCHOR_X,
    y1: SOIL_Y - 2,
    x2: ANCHOR_X + Math.sin(a * Math.PI / 180) * 2.5,
    y2: SOIL_Y - 2 - Math.cos(a * Math.PI / 180) * 2.5,
    stroke: "#7aac5e",
    strokeWidth: "0.5"
  }))), stage >= 3 && __h(__Fragment, null, [-80, -50, -20, 20, 50, 80].map((a, i) => __h(PoppyLeaf, {
    key: a,
    cx: ANCHOR_X + Math.sin(a * Math.PI / 180) * 2,
    cy: SOIL_Y - 1,
    length: 14 + i % 3 * 4,
    angle: a,
    color: "#5e8a4a"
  })), __h(BristlyStalk, {
    tipX: ANCHOR_X + (stage === 3 ? -8 : -2),
    tipY: tipY + (stage === 3 ? 4 : 0),
    color: "#7aac5e",
    thick: 2.4
  }), __h("g", {
    transform: `translate(${ANCHOR_X + (stage === 3 ? -8 : -2)} ${tipY + (stage === 3 ? 4 : 0)}) rotate(${budTilt})`
  }, stage === 3 && __h(PoppyBud, {
    scale: 1.05,
    openness: 0
  }), stage === 4 && __h(PoppyBud, {
    scale: 1.3,
    openness: 0.15,
    colorHint: true
  }), stage === 5 &&
  // Cracking — sepals half-opened, yellow petals scrunched inside
  __h("g", null, __h(PoppyBud, {
    scale: 1.4,
    openness: 0.7,
    colorHint: true
  }), __h("g", {
    transform: "translate(0 -4)"
  }, [0, 90, 180, 270].map(rot => __h("path", {
    key: rot,
    d: "M 0 0 Q -4 -3 -3 -8 Q 0 -10 3 -8 Q 4 -3 0 0 Z",
    fill: "#fbe064",
    transform: `rotate(${rot}) scale(0.85)`
  })))), stage === 6 &&
  // BLOOM
  __h("g", null, __h("path", {
    d: "M -8 6 Q -12 9 -10 14",
    fill: "none",
    stroke: "#7aac5e",
    strokeWidth: "1.4",
    opacity: "0.6"
  }), __h("path", {
    d: "M  8 6 Q  12 9  10 14",
    fill: "none",
    stroke: "#7aac5e",
    strokeWidth: "1.4",
    opacity: "0.6"
  }), [0, 90, 180, 270].map(rot => __h("g", {
    key: rot,
    transform: `rotate(${rot})`
  }, __h("path", {
    d: `M 0 -2
                          Q -12 -10 -14 -20
                          Q -10 -28 -4 -28
                          Q 0 -30 4 -28
                          Q 10 -28 14 -20
                          Q 12 -10 0 -2 Z`,
    fill: "#fbe064"
  }), __h("path", {
    d: `M -2 -6 Q -8 -14 -8 -22 Q -4 -26 0 -26 Q 4 -26 8 -22 Q 8 -14 2 -6 Z`,
    fill: "#fde88a",
    opacity: "0.7"
  }), __h("line", {
    x1: 0,
    y1: -6,
    x2: 0,
    y2: -26,
    stroke: "#d4a020",
    strokeWidth: "0.5",
    opacity: "0.55"
  }), __h("line", {
    x1: 0,
    y1: -6,
    x2: -5,
    y2: -22,
    stroke: "#d4a020",
    strokeWidth: "0.4",
    opacity: "0.45"
  }), __h("line", {
    x1: 0,
    y1: -6,
    x2: 5,
    y2: -22,
    stroke: "#d4a020",
    strokeWidth: "0.4",
    opacity: "0.45"
  }))), __h("circle", {
    r: "6",
    fill: "#2a1808"
  }), __h("circle", {
    r: "4",
    fill: "#4a2a10"
  }), Array.from({
    length: 18
  }).map((_, i) => {
    const a = i / 18 * 360;
    return __h("g", {
      key: i,
      transform: `rotate(${a})`
    }, __h("line", {
      x1: 0,
      y1: 0,
      x2: 0,
      y2: -6.4,
      stroke: "#5a3a18",
      strokeWidth: "0.5"
    }), __h("circle", {
      cx: 0,
      cy: -7,
      r: "0.9",
      fill: "#1a0e08"
    }));
  }), __h("circle", {
    r: "2",
    fill: "#3a2010"
  }), [0, 60, 120, 180, 240, 300].map(a => __h("line", {
    key: a,
    x1: 0,
    y1: 0,
    x2: Math.sin(a * Math.PI / 180) * 1.8,
    y2: -Math.cos(a * Math.PI / 180) * 1.8,
    stroke: "#fbe064",
    strokeWidth: "0.5",
    opacity: "0.85"
  }))))), stage === 6 && __h(__Fragment, null, __h(BloomFX, {
    accent: "#fbe064",
    centerY: SOIL_Y - 180,
    radius: 75
  }), __h(BristlyStalk, {
    tipX: ANCHOR_X + 22,
    tipY: SOIL_Y - 180,
    color: "#7aac5e",
    thick: 2,
    density: 14
  }), __h("g", {
    transform: `translate(${ANCHOR_X + 22} ${SOIL_Y - 180})`
  }, [0, 90, 180, 270].map(rot => __h("g", {
    key: rot,
    transform: `rotate(${rot}) scale(0.6)`
  }, __h("path", {
    d: `M 0 -2
                      Q -12 -10 -14 -20
                      Q -10 -28 -4 -28
                      Q 0 -30 4 -28
                      Q 10 -28 14 -20
                      Q 12 -10 0 -2 Z`,
    fill: "#fbe064"
  }), __h("path", {
    d: `M -2 -6 Q -8 -14 -8 -22 Q -4 -26 0 -26 Q 4 -26 8 -22 Q 8 -14 2 -6 Z`,
    fill: "#fde88a",
    opacity: "0.7"
  }), __h("line", {
    x1: 0,
    y1: -6,
    x2: 0,
    y2: -26,
    stroke: "#d4a020",
    strokeWidth: "0.5",
    opacity: "0.55"
  }))), __h("circle", {
    r: "3.5",
    fill: "#2a1808"
  }), Array.from({
    length: 14
  }).map((_, i) => {
    const a = i / 14 * 360;
    return __h("g", {
      key: i,
      transform: `rotate(${a})`
    }, __h("line", {
      x1: 0,
      y1: 0,
      x2: 0,
      y2: -4.5,
      stroke: "#5a3a18",
      strokeWidth: "0.4"
    }), __h("circle", {
      cx: 0,
      cy: -5,
      r: "0.6",
      fill: "#1a0e08"
    }));
  }), __h("circle", {
    r: "1.2",
    fill: "#fbe064"
  })), __h(BristlyStalk, {
    tipX: ANCHOR_X - 28,
    tipY: SOIL_Y - 140,
    color: "#7aac5e",
    thick: 1.8,
    density: 12
  }), __h("g", {
    transform: `translate(${ANCHOR_X - 28} ${SOIL_Y - 140}) rotate(20)`
  }, __h(PoppyBud, {
    scale: 1.0,
    openness: 0.4,
    colorHint: true
  }))), extra === "crack" && __h(SeedCrackOverlay, null), extra === "leaves" && __h(FirstLeavesOverlay, null), extra === "grows" && __h(BudGrowsOverlay, {
    tipY: SOIL_Y - 150,
    tipX: ANCHOR_X - 8
  }), extra === "peek" && __h(ColorPeekOverlay, {
    tipY: SOIL_Y - 205,
    tipX: ANCHOR_X - 2,
    color: "#fbe064"
  }));
}

// ════════════════════════════════════════════════════════════════════════
// ARCTIC POPPY · 11-stage build (0% → 100% in 10% increments)
// Each stage is its own distinct frame — no scaling tricks, no crossfades.
// Stage 10 BLOOM is an eruption: huge halo, three satellite blooms, an
// unopened tertiary bud, layered glow, extra sparkles.
// ════════════════════════════════════════════════════════════════════════

function ArcticPoppy11({
  stage = 0,
  swell = false
}) {
  const s = Math.max(0, Math.min(10, stage | 0));

  // Stalk tip positions for stages 6–10 (rosette stays at base for all)
  const STALK_TIPS = {
    6: {
      x: ANCHOR_X - 4,
      y: SOIL_Y - 80,
      tilt: 30,
      budScale: 0.75,
      budOpen: 0,
      color: false
    },
    7: {
      x: ANCHOR_X - 6,
      y: SOIL_Y - 160,
      tilt: 20,
      budScale: 1.0,
      budOpen: 0,
      color: false
    },
    8: {
      x: ANCHOR_X - 2,
      y: SOIL_Y - 210,
      tilt: 0,
      budScale: 1.3,
      budOpen: 0.1,
      color: false
    },
    9: {
      x: ANCHOR_X - 2,
      y: SOIL_Y - 235,
      tilt: 0,
      budScale: 1.4,
      budOpen: 0.7,
      color: true
    },
    10: {
      x: ANCHOR_X - 2,
      y: SOIL_Y - 250,
      tilt: 0,
      budScale: 0,
      budOpen: 0,
      color: true
    }
  };

  // Root system per tier (1–6). Builds visible taproot + laterals below
  // the soil so growth reads even when above-ground is small.
  const roots = tier => {
    if (tier <= 0) return null;
    const depth = [0, 8, 16, 22, 28, 32, 34][tier];
    const numLats = [0, 2, 4, 6, 8, 10, 11][tier];
    const lats = [];
    for (let i = 0; i < numLats; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const t = (i + 1) / (numLats + 1);
      const startY = SOIL_Y + depth * 0.18 + t * depth * 0.7;
      const startX = ANCHOR_X + side * 0.4;
      const endX = ANCHOR_X + side * (3 + i % 3 * 2.2);
      const endY = startY + 2 + i % 3 * 0.8;
      lats.push(__h("path", {
        key: i,
        d: `M ${startX} ${startY} Q ${(startX + endX) / 2} ${startY + 1} ${endX} ${endY}`,
        stroke: "#7a5a3a",
        strokeWidth: 0.45 + i % 2 * 0.2,
        fill: "none",
        strokeLinecap: "round",
        opacity: 0.7
      }));
      // tiny tertiary branches for higher tiers
      if (tier >= 4 && i % 2 === 0) {
        const tx = endX + side * 1.5;
        const ty = endY + 2;
        lats.push(__h("path", {
          key: `t${i}`,
          d: `M ${endX} ${endY} L ${tx} ${ty}`,
          stroke: "#7a5a3a",
          strokeWidth: "0.35",
          fill: "none",
          strokeLinecap: "round",
          opacity: 0.6
        }));
      }
    }
    return __h("g", {
      opacity: "0.78"
    }, __h("path", {
      d: `M ${ANCHOR_X} ${SOIL_Y} Q ${ANCHOR_X + (tier % 2 ? -1 : 1)} ${SOIL_Y + depth * 0.5} ${ANCHOR_X} ${SOIL_Y + depth}`,
      stroke: "#7a5a3a",
      strokeWidth: Math.min(1.4, 0.5 + tier * 0.18),
      fill: "none",
      strokeLinecap: "round"
    }), lats);
  };

  // Rosette renderer — used in stages 5 and 6–10 base. Very bushy.
  // Rosette — 12 leaves at varied lengths, dense and visibly mature.
  const fullRosette = __h(__Fragment, null, Array.from({
    length: 12
  }).map((_, i) => {
    const a = -110 + i * 220 / 11;
    const len = 16 + i % 4 * 5;
    return __h(PoppyLeaf, {
      key: i,
      cx: ANCHOR_X + Math.sin(a * Math.PI / 180) * 2,
      cy: SOIL_Y - 1,
      length: len,
      angle: a,
      color: i % 3 === 0 ? "#6a9a52" : "#5e8a4a"
    });
  }), __h("circle", {
    cx: ANCHOR_X,
    cy: SOIL_Y - 2,
    r: 1.8,
    fill: "#3e6a2a"
  }), [0, 45, 90, 135, 180, 225, 270, 315].map(a => __h("line", {
    key: a,
    x1: ANCHOR_X,
    y1: SOIL_Y - 2,
    x2: ANCHOR_X + Math.sin(a * Math.PI / 180) * 2.8,
    y2: SOIL_Y - 2 - Math.cos(a * Math.PI / 180) * 2.8,
    stroke: "#7aac5e",
    strokeWidth: "0.5"
  })));
  return __h(Plant, {
    swell: swell
  }, s > 0 && roots(Math.min(6, s)), s === 0 && __h("g", null, __h("path", {
    d: `M ${ANCHOR_X - 1.4} ${SOIL_Y - 1.4}
                    Q ${ANCHOR_X - 1.6} ${SOIL_Y - 2.6} ${ANCHOR_X} ${SOIL_Y - 2.8}
                    Q ${ANCHOR_X + 1.6} ${SOIL_Y - 2.6} ${ANCHOR_X + 1.4} ${SOIL_Y - 1.4}
                    Q ${ANCHOR_X} ${SOIL_Y - 1} ${ANCHOR_X - 1.4} ${SOIL_Y - 1.4} Z`,
    fill: "#1a0e08"
  }), __h("circle", {
    cx: ANCHOR_X - 5,
    cy: SOIL_Y + 0.5,
    r: 0.6,
    fill: "#8a7858",
    opacity: "0.6"
  }), __h("circle", {
    cx: ANCHOR_X + 6,
    cy: SOIL_Y + 1.5,
    r: 0.5,
    fill: "#8a7858",
    opacity: "0.6"
  })), s === 1 && __h("g", null, __h("path", {
    d: `M ${ANCHOR_X - 2.4} ${SOIL_Y - 1.4}
                    Q ${ANCHOR_X - 2.6} ${SOIL_Y - 2.6} ${ANCHOR_X - 0.6} ${SOIL_Y - 2.8}
                    Q ${ANCHOR_X - 0.4} ${SOIL_Y - 1} ${ANCHOR_X - 2.4} ${SOIL_Y - 1.4} Z`,
    fill: "#1a0e08"
  }), __h("path", {
    d: `M ${ANCHOR_X + 0.6} ${SOIL_Y - 2.8}
                    Q ${ANCHOR_X + 2.6} ${SOIL_Y - 2.6} ${ANCHOR_X + 2.4} ${SOIL_Y - 1.4}
                    Q ${ANCHOR_X + 0.4} ${SOIL_Y - 1} ${ANCHOR_X + 0.6} ${SOIL_Y - 2.8} Z`,
    fill: "#1a0e08"
  }), __h("line", {
    x1: ANCHOR_X,
    y1: SOIL_Y - 1.5,
    x2: ANCHOR_X,
    y2: SOIL_Y - 7,
    stroke: "#5e8a4a",
    strokeWidth: "1.2",
    strokeLinecap: "round"
  }), __h("ellipse", {
    cx: ANCHOR_X,
    cy: SOIL_Y - 7.5,
    rx: 1.1,
    ry: 1.8,
    fill: "#7aac5e"
  }), __h("ellipse", {
    cx: ANCHOR_X - 0.3,
    cy: SOIL_Y - 7.6,
    rx: 0.5,
    ry: 1.2,
    fill: "#a4c882",
    opacity: "0.85"
  }), __h("line", {
    x1: ANCHOR_X - 1.8,
    y1: SOIL_Y - 1.5,
    x2: ANCHOR_X - 2.4,
    y2: SOIL_Y - 5,
    stroke: "#5e8a4a",
    strokeWidth: "0.7",
    strokeLinecap: "round"
  }), __h("ellipse", {
    cx: ANCHOR_X - 2.4,
    cy: SOIL_Y - 5.5,
    rx: 0.7,
    ry: 1.1,
    fill: "#7aac5e",
    opacity: "0.9"
  }), __h("line", {
    x1: ANCHOR_X + 1.8,
    y1: SOIL_Y - 1.5,
    x2: ANCHOR_X + 2.6,
    y2: SOIL_Y - 4.2,
    stroke: "#5e8a4a",
    strokeWidth: "0.6",
    strokeLinecap: "round"
  }), __h("ellipse", {
    cx: ANCHOR_X + 2.6,
    cy: SOIL_Y - 4.6,
    rx: 0.6,
    ry: 0.9,
    fill: "#7aac5e",
    opacity: "0.85"
  }), __h("line", {
    x1: ANCHOR_X - 0.5,
    y1: SOIL_Y + 0.6,
    x2: ANCHOR_X - 1.8,
    y2: SOIL_Y + 3.8,
    stroke: "#7a5a3a",
    strokeWidth: "0.5",
    opacity: "0.6"
  }), __h("line", {
    x1: ANCHOR_X + 0.5,
    y1: SOIL_Y + 0.6,
    x2: ANCHOR_X + 1.8,
    y2: SOIL_Y + 3.8,
    stroke: "#7a5a3a",
    strokeWidth: "0.5",
    opacity: "0.6"
  })), s === 2 && __h("g", null, __h("line", {
    x1: ANCHOR_X,
    y1: SOIL_Y,
    x2: ANCHOR_X,
    y2: SOIL_Y - 9,
    stroke: "#7aac5e",
    strokeWidth: "1.4",
    strokeLinecap: "round"
  }), __h("ellipse", {
    cx: ANCHOR_X - 4.5,
    cy: SOIL_Y - 9,
    rx: 4.5,
    ry: 1.4,
    fill: "#a4c882",
    transform: `rotate(-32 ${ANCHOR_X - 4.5} ${SOIL_Y - 9})`
  }), __h("ellipse", {
    cx: ANCHOR_X + 4.5,
    cy: SOIL_Y - 9,
    rx: 4.5,
    ry: 1.4,
    fill: "#a4c882",
    transform: `rotate(32 ${ANCHOR_X + 4.5} ${SOIL_Y - 9})`
  }), __h("ellipse", {
    cx: ANCHOR_X - 4.5,
    cy: SOIL_Y - 8.5,
    rx: 4.5,
    ry: 1.4,
    fill: "#5e8a4a",
    opacity: "0.3",
    transform: `rotate(-32 ${ANCHOR_X - 4.5} ${SOIL_Y - 8.5})`
  }), __h("ellipse", {
    cx: ANCHOR_X + 4.5,
    cy: SOIL_Y - 8.5,
    rx: 4.5,
    ry: 1.4,
    fill: "#5e8a4a",
    opacity: "0.3",
    transform: `rotate(32 ${ANCHOR_X + 4.5} ${SOIL_Y - 8.5})`
  }), __h("ellipse", {
    cx: ANCHOR_X - 1.6,
    cy: SOIL_Y - 11,
    rx: 1.4,
    ry: 0.6,
    fill: "#7aac5e",
    transform: `rotate(-115 ${ANCHOR_X - 1.6} ${SOIL_Y - 11})`
  }), __h("ellipse", {
    cx: ANCHOR_X + 1.6,
    cy: SOIL_Y - 11,
    rx: 1.4,
    ry: 0.6,
    fill: "#7aac5e",
    transform: `rotate(-65 ${ANCHOR_X + 1.6} ${SOIL_Y - 11})`
  }), __h("ellipse", {
    cx: ANCHOR_X,
    cy: SOIL_Y - 12.5,
    rx: 1.4,
    ry: 0.7,
    fill: "#7aac5e",
    transform: `rotate(-90 ${ANCHOR_X} ${SOIL_Y - 12.5})`
  }), __h("circle", {
    cx: ANCHOR_X,
    cy: SOIL_Y - 10,
    r: 1,
    fill: "#3e6a2a"
  }), __h("line", {
    x1: ANCHOR_X - 0.8,
    y1: SOIL_Y - 5,
    x2: ANCHOR_X - 2.2,
    y2: SOIL_Y - 6,
    stroke: "#7aac5e",
    strokeWidth: "0.4"
  }), __h("line", {
    x1: ANCHOR_X + 0.8,
    y1: SOIL_Y - 5,
    x2: ANCHOR_X + 2.2,
    y2: SOIL_Y - 6,
    stroke: "#7aac5e",
    strokeWidth: "0.4"
  })), s === 3 && __h("g", null, __h("line", {
    x1: ANCHOR_X,
    y1: SOIL_Y,
    x2: ANCHOR_X,
    y2: SOIL_Y - 4,
    stroke: "#7aac5e",
    strokeWidth: "1.3",
    strokeLinecap: "round"
  }), __h("ellipse", {
    cx: ANCHOR_X - 8,
    cy: SOIL_Y - 5,
    rx: 4,
    ry: 1.1,
    fill: "#a4c882",
    opacity: "0.7",
    transform: `rotate(-60 ${ANCHOR_X - 8} ${SOIL_Y - 5})`
  }), __h("ellipse", {
    cx: ANCHOR_X + 8,
    cy: SOIL_Y - 5,
    rx: 4,
    ry: 1.1,
    fill: "#a4c882",
    opacity: "0.7",
    transform: `rotate(60 ${ANCHOR_X + 8} ${SOIL_Y - 5})`
  }), [-65, -32, 0, 32, 65].map((a, i) => __h(PoppyLeaf, {
    key: a,
    cx: ANCHOR_X + Math.sin(a * Math.PI / 180) * 1.5,
    cy: SOIL_Y - 3,
    length: 9 + (i === 2 ? 3 : 0),
    angle: a,
    color: "#7aac5e"
  })), __h("circle", {
    cx: ANCHOR_X,
    cy: SOIL_Y - 4,
    r: 1.4,
    fill: "#3e6a2a"
  }), [0, 60, 120, 180, 240, 300].map(a => __h("line", {
    key: a,
    x1: ANCHOR_X,
    y1: SOIL_Y - 4,
    x2: ANCHOR_X + Math.sin(a * Math.PI / 180) * 1.7,
    y2: SOIL_Y - 4 - Math.cos(a * Math.PI / 180) * 1.7,
    stroke: "#7aac5e",
    strokeWidth: "0.4"
  }))), s === 4 && __h("g", null, [-100, -75, -50, -25, 0, 25, 50, 75, 100].map((a, i) => __h(PoppyLeaf, {
    key: a,
    cx: ANCHOR_X + Math.sin(a * Math.PI / 180) * 1.8,
    cy: SOIL_Y - 1,
    length: 12 + i % 3 * 2,
    angle: a,
    color: "#6a9a52"
  })), __h("circle", {
    cx: ANCHOR_X,
    cy: SOIL_Y - 2,
    r: 1.5,
    fill: "#3e6a2a"
  }), [0, 60, 120, 180, 240, 300].map(a => __h("line", {
    key: a,
    x1: ANCHOR_X,
    y1: SOIL_Y - 2,
    x2: ANCHOR_X + Math.sin(a * Math.PI / 180) * 2.4,
    y2: SOIL_Y - 2 - Math.cos(a * Math.PI / 180) * 2.4,
    stroke: "#7aac5e",
    strokeWidth: "0.5"
  })), __h("line", {
    x1: ANCHOR_X,
    y1: SOIL_Y - 3,
    x2: ANCHOR_X,
    y2: SOIL_Y - 28,
    stroke: "#7aac5e",
    strokeWidth: "1.3",
    strokeLinecap: "round"
  }), [8, 13, 18, 23].map(dy => __h("g", {
    key: dy
  }, __h("line", {
    x1: ANCHOR_X,
    y1: SOIL_Y - dy,
    x2: ANCHOR_X - 1.7,
    y2: SOIL_Y - dy - 1,
    stroke: "#7aac5e",
    strokeWidth: "0.4",
    opacity: "0.85"
  }), __h("line", {
    x1: ANCHOR_X,
    y1: SOIL_Y - dy,
    x2: ANCHOR_X + 1.7,
    y2: SOIL_Y - dy - 1,
    stroke: "#7aac5e",
    strokeWidth: "0.4",
    opacity: "0.85"
  }))), __h("ellipse", {
    cx: ANCHOR_X,
    cy: SOIL_Y - 29,
    rx: 1.3,
    ry: 1.8,
    fill: "#5e8a4a"
  }), __h("line", {
    x1: ANCHOR_X + 4,
    y1: SOIL_Y - 2,
    x2: ANCHOR_X + 8,
    y2: SOIL_Y - 11,
    stroke: "#7aac5e",
    strokeWidth: "0.9",
    strokeLinecap: "round"
  }), __h("circle", {
    cx: ANCHOR_X + 8,
    cy: SOIL_Y - 12,
    r: 0.8,
    fill: "#5e8a4a"
  })), s === 5 && __h(__Fragment, null, fullRosette, __h("line", {
    x1: ANCHOR_X,
    y1: SOIL_Y - 3,
    x2: ANCHOR_X,
    y2: SOIL_Y - 54,
    stroke: "#7aac5e",
    strokeWidth: "1.7",
    strokeLinecap: "round"
  }), [8, 15, 22, 29, 36, 43, 50].map(dy => __h("g", {
    key: dy
  }, __h("line", {
    x1: ANCHOR_X,
    y1: SOIL_Y - dy,
    x2: ANCHOR_X - 2.0,
    y2: SOIL_Y - dy - 1.2,
    stroke: "#7aac5e",
    strokeWidth: "0.55",
    opacity: "0.85"
  }), __h("line", {
    x1: ANCHOR_X,
    y1: SOIL_Y - dy,
    x2: ANCHOR_X + 2.0,
    y2: SOIL_Y - dy - 1.2,
    stroke: "#7aac5e",
    strokeWidth: "0.55",
    opacity: "0.85"
  }))), __h("ellipse", {
    cx: ANCHOR_X,
    cy: SOIL_Y - 55,
    rx: 1.7,
    ry: 2.4,
    fill: "#5e8a4a"
  }), __h("ellipse", {
    cx: ANCHOR_X - 0.5,
    cy: SOIL_Y - 56,
    rx: 0.7,
    ry: 1.6,
    fill: "#7aac5e",
    opacity: "0.85"
  }), __h("line", {
    x1: ANCHOR_X + 4,
    y1: SOIL_Y - 2,
    x2: ANCHOR_X + 10,
    y2: SOIL_Y - 20,
    stroke: "#7aac5e",
    strokeWidth: "1.0",
    strokeLinecap: "round"
  }), __h("circle", {
    cx: ANCHOR_X + 10,
    cy: SOIL_Y - 21,
    r: 1.0,
    fill: "#5e8a4a"
  })), s >= 6 && fullRosette, s >= 6 && (() => {
    const t = STALK_TIPS[s];
    return __h(__Fragment, null, __h(BristlyStalk, {
      tipX: t.x,
      tipY: t.y,
      color: "#7aac5e",
      thick: s === 6 ? 2.0 : s === 7 ? 2.2 : 2.4,
      density: s === 6 ? 8 : s === 7 ? 14 : 18
    }), __h("g", {
      transform: `translate(${t.x} ${t.y}) rotate(${t.tilt})`
    }, s === 6 && __h(PoppyBud, {
      scale: 0.75,
      openness: 0
    }), s === 7 && __h(PoppyBud, {
      scale: 1.0,
      openness: 0
    }), s === 8 && __h(PoppyBud, {
      scale: 1.3,
      openness: 0.1
    }), s === 9 && __h(__Fragment, null, __h(PoppyBud, {
      scale: 1.4,
      openness: 0.7,
      colorHint: true
    }), __h("g", {
      transform: "translate(0 -4)"
    }, [0, 90, 180, 270].map(rot => __h("path", {
      key: rot,
      d: "M 0 0 Q -4 -3 -3 -8 Q 0 -10 3 -8 Q 4 -3 0 0 Z",
      fill: "#fbe064",
      transform: `rotate(${rot}) scale(0.85)`
    })))), s === 10 && __h("g", null, __h("path", {
      d: "M -8 6 Q -12 9 -10 14",
      fill: "none",
      stroke: "#7aac5e",
      strokeWidth: "1.4",
      opacity: "0.6"
    }), __h("path", {
      d: "M  8 6 Q  12 9  10 14",
      fill: "none",
      stroke: "#7aac5e",
      strokeWidth: "1.4",
      opacity: "0.6"
    }), [0, 90, 180, 270].map(rot => __h("g", {
      key: rot,
      transform: `rotate(${rot})`
    }, __h("path", {
      d: "M 0 -2 Q -12 -10 -14 -20 Q -10 -28 -4 -28 Q 0 -30 4 -28 Q 10 -28 14 -20 Q 12 -10 0 -2 Z",
      fill: "#fbe064"
    }), __h("path", {
      d: "M -2 -6 Q -8 -14 -8 -22 Q -4 -26 0 -26 Q 4 -26 8 -22 Q 8 -14 2 -6 Z",
      fill: "#fde88a",
      opacity: "0.7"
    }), __h("line", {
      x1: 0,
      y1: -6,
      x2: 0,
      y2: -26,
      stroke: "#d4a020",
      strokeWidth: "0.5",
      opacity: "0.55"
    }), __h("line", {
      x1: 0,
      y1: -6,
      x2: -5,
      y2: -22,
      stroke: "#d4a020",
      strokeWidth: "0.4",
      opacity: "0.45"
    }), __h("line", {
      x1: 0,
      y1: -6,
      x2: 5,
      y2: -22,
      stroke: "#d4a020",
      strokeWidth: "0.4",
      opacity: "0.45"
    }))), __h("circle", {
      r: "6",
      fill: "#2a1808"
    }), __h("circle", {
      r: "4",
      fill: "#4a2a10"
    }), Array.from({
      length: 18
    }).map((_, i) => {
      const a = i / 18 * 360;
      return __h("g", {
        key: i,
        transform: `rotate(${a})`
      }, __h("line", {
        x1: 0,
        y1: 0,
        x2: 0,
        y2: -6.4,
        stroke: "#5a3a18",
        strokeWidth: "0.5"
      }), __h("circle", {
        cx: 0,
        cy: -7,
        r: "0.9",
        fill: "#1a0e08"
      }));
    }), __h("circle", {
      r: "2",
      fill: "#3a2010"
    }), [0, 60, 120, 180, 240, 300].map(a => __h("line", {
      key: a,
      x1: 0,
      y1: 0,
      x2: Math.sin(a * Math.PI / 180) * 1.8,
      y2: -Math.cos(a * Math.PI / 180) * 1.8,
      stroke: "#fbe064",
      strokeWidth: "0.5",
      opacity: "0.85"
    })))));
  })(), s === 6 && __h(__Fragment, null, __h("line", {
    x1: ANCHOR_X + 7,
    y1: SOIL_Y - 1,
    x2: ANCHOR_X + 10,
    y2: SOIL_Y - 11,
    stroke: "#7aac5e",
    strokeWidth: "0.9",
    strokeLinecap: "round"
  }), __h("circle", {
    cx: ANCHOR_X + 10,
    cy: SOIL_Y - 12,
    r: 0.9,
    fill: "#5e8a4a"
  }), __h("line", {
    x1: ANCHOR_X + 10,
    y1: SOIL_Y - 12,
    x2: ANCHOR_X + 11.4,
    y2: SOIL_Y - 13.5,
    stroke: "#7aac5e",
    strokeWidth: "0.4"
  })), s === 7 && __h(__Fragment, null, __h(BristlyStalk, {
    tipX: ANCHOR_X + 18,
    tipY: SOIL_Y - 50,
    color: "#7aac5e",
    thick: 1.4,
    density: 7
  }), __h("g", {
    transform: `translate(${ANCHOR_X + 18} ${SOIL_Y - 50}) rotate(25)`
  }, __h(PoppyBud, {
    scale: 0.55,
    openness: 0
  })), __h("line", {
    x1: ANCHOR_X - 6,
    y1: SOIL_Y - 1,
    x2: ANCHOR_X - 9,
    y2: SOIL_Y - 10,
    stroke: "#7aac5e",
    strokeWidth: "0.9",
    strokeLinecap: "round"
  }), __h("circle", {
    cx: ANCHOR_X - 9,
    cy: SOIL_Y - 11,
    r: 0.8,
    fill: "#5e8a4a"
  })), s === 8 && __h(__Fragment, null, __h(BristlyStalk, {
    tipX: ANCHOR_X + 22,
    tipY: SOIL_Y - 95,
    color: "#7aac5e",
    thick: 1.6,
    density: 10
  }), __h("g", {
    transform: `translate(${ANCHOR_X + 22} ${SOIL_Y - 95}) rotate(15)`
  }, __h(PoppyBud, {
    scale: 0.75,
    openness: 0
  })), __h(BristlyStalk, {
    tipX: ANCHOR_X - 20,
    tipY: SOIL_Y - 60,
    color: "#7aac5e",
    thick: 1.3,
    density: 7
  }), __h("g", {
    transform: `translate(${ANCHOR_X - 20} ${SOIL_Y - 60}) rotate(-22)`
  }, __h(PoppyBud, {
    scale: 0.6,
    openness: 0
  })), __h("line", {
    x1: ANCHOR_X + 9,
    y1: SOIL_Y - 1,
    x2: ANCHOR_X + 14,
    y2: SOIL_Y - 12,
    stroke: "#7aac5e",
    strokeWidth: "0.9",
    strokeLinecap: "round"
  }), __h("circle", {
    cx: ANCHOR_X + 14,
    cy: SOIL_Y - 13,
    r: 0.8,
    fill: "#5e8a4a"
  })), s === 9 && __h(__Fragment, null, __h(BristlyStalk, {
    tipX: ANCHOR_X + 24,
    tipY: SOIL_Y - 145,
    color: "#7aac5e",
    thick: 1.8,
    density: 12
  }), __h("g", {
    transform: `translate(${ANCHOR_X + 24} ${SOIL_Y - 145}) rotate(5)`
  }, __h(PoppyBud, {
    scale: 1.0,
    openness: 0.25,
    colorHint: true
  })), __h(BristlyStalk, {
    tipX: ANCHOR_X - 22,
    tipY: SOIL_Y - 105,
    color: "#7aac5e",
    thick: 1.5,
    density: 10
  }), __h("g", {
    transform: `translate(${ANCHOR_X - 22} ${SOIL_Y - 105}) rotate(-15)`
  }, __h(PoppyBud, {
    scale: 0.78,
    openness: 0.1
  })), __h(BristlyStalk, {
    tipX: ANCHOR_X + 32,
    tipY: SOIL_Y - 65,
    color: "#7aac5e",
    thick: 1.2,
    density: 6
  }), __h("g", {
    transform: `translate(${ANCHOR_X + 32} ${SOIL_Y - 65}) rotate(25)`
  }, __h(PoppyBud, {
    scale: 0.55,
    openness: 0
  }))), s === 10 && __h(__Fragment, null, __h(BloomFX, {
    accent: "#fbe064",
    centerY: SOIL_Y - 250,
    radius: 100
  }), __h(BloomFX, {
    accent: "#fff8c8",
    centerY: SOIL_Y - 250,
    radius: 55
  }), __h(BristlyStalk, {
    tipX: ANCHOR_X + 28,
    tipY: SOIL_Y - 180,
    color: "#7aac5e",
    thick: 2.0,
    density: 14
  }), __h("g", {
    transform: `translate(${ANCHOR_X + 28} ${SOIL_Y - 180})`
  }, [0, 90, 180, 270].map(rot => __h("g", {
    key: rot,
    transform: `rotate(${rot}) scale(0.65)`
  }, __h("path", {
    d: "M 0 -2 Q -12 -10 -14 -20 Q -10 -28 -4 -28 Q 0 -30 4 -28 Q 10 -28 14 -20 Q 12 -10 0 -2 Z",
    fill: "#fbe064"
  }), __h("path", {
    d: "M -2 -6 Q -8 -14 -8 -22 Q -4 -26 0 -26 Q 4 -26 8 -22 Q 8 -14 2 -6 Z",
    fill: "#fde88a",
    opacity: "0.7"
  }), __h("line", {
    x1: 0,
    y1: -6,
    x2: 0,
    y2: -26,
    stroke: "#d4a020",
    strokeWidth: "0.4",
    opacity: "0.5"
  }))), __h("circle", {
    r: "4",
    fill: "#2a1808"
  }), Array.from({
    length: 14
  }).map((_, i) => {
    const a = i / 14 * 360;
    return __h("g", {
      key: i,
      transform: `rotate(${a})`
    }, __h("line", {
      x1: 0,
      y1: 0,
      x2: 0,
      y2: -4.5,
      stroke: "#5a3a18",
      strokeWidth: "0.4"
    }), __h("circle", {
      cx: 0,
      cy: -5,
      r: "0.6",
      fill: "#1a0e08"
    }));
  }), __h("circle", {
    r: "1.2",
    fill: "#fbe064"
  })), __h(BristlyStalk, {
    tipX: ANCHOR_X - 32,
    tipY: SOIL_Y - 200,
    color: "#7aac5e",
    thick: 1.9,
    density: 13
  }), __h("g", {
    transform: `translate(${ANCHOR_X - 32} ${SOIL_Y - 200})`
  }, [0, 90, 180, 270].map(rot => __h("g", {
    key: rot,
    transform: `rotate(${rot}) scale(0.58)`
  }, __h("path", {
    d: "M 0 -2 Q -12 -10 -14 -20 Q -10 -28 -4 -28 Q 0 -30 4 -28 Q 10 -28 14 -20 Q 12 -10 0 -2 Z",
    fill: "#fbe064"
  }), __h("path", {
    d: "M -2 -6 Q -8 -14 -8 -22 Q -4 -26 0 -26 Q 4 -26 8 -22 Q 8 -14 2 -6 Z",
    fill: "#fde88a",
    opacity: "0.7"
  }))), __h("circle", {
    r: "3.5",
    fill: "#2a1808"
  }), Array.from({
    length: 12
  }).map((_, i) => {
    const a = i / 12 * 360;
    return __h("g", {
      key: i,
      transform: `rotate(${a})`
    }, __h("line", {
      x1: 0,
      y1: 0,
      x2: 0,
      y2: -4,
      stroke: "#5a3a18",
      strokeWidth: "0.4"
    }), __h("circle", {
      cx: 0,
      cy: -4.5,
      r: "0.55",
      fill: "#1a0e08"
    }));
  }), __h("circle", {
    r: "1",
    fill: "#fbe064"
  })), __h(BristlyStalk, {
    tipX: ANCHOR_X + 40,
    tipY: SOIL_Y - 120,
    color: "#7aac5e",
    thick: 1.7,
    density: 11
  }), __h("g", {
    transform: `translate(${ANCHOR_X + 40} ${SOIL_Y - 120})`
  }, [0, 90, 180, 270].map(rot => __h("g", {
    key: rot,
    transform: `rotate(${rot}) scale(0.48)`
  }, __h("path", {
    d: "M 0 -2 Q -12 -10 -14 -20 Q -10 -28 -4 -28 Q 0 -30 4 -28 Q 10 -28 14 -20 Q 12 -10 0 -2 Z",
    fill: "#fbe064"
  }))), __h("circle", {
    r: "3",
    fill: "#2a1808"
  }), Array.from({
    length: 10
  }).map((_, i) => {
    const a = i / 10 * 360;
    return __h("circle", {
      key: i,
      r: "0.45",
      cx: 0,
      cy: -3.6,
      fill: "#1a0e08",
      transform: `rotate(${a})`
    });
  })), __h(BristlyStalk, {
    tipX: ANCHOR_X - 24,
    tipY: SOIL_Y - 90,
    color: "#7aac5e",
    thick: 1.6,
    density: 10
  }), __h("g", {
    transform: `translate(${ANCHOR_X - 24} ${SOIL_Y - 90}) rotate(20)`
  }, __h(PoppyBud, {
    scale: 0.9,
    openness: 0.5,
    colorHint: true
  }))));
}
// ════════════════════════════════════════════════════════════════════════
// ARCTIC POPPY · 11-stage MORPH build — persistent elements, CSS-tweened
// Every frame renders the SAME element tree; only attribute/transform
// values change per stage. The browser smoothly interpolates between
// them via inline `transition:` — so the stem visibly extends, leaves
// scale in, and the bud rises into bloom rather than the SVG swapping.
// ════════════════════════════════════════════════════════════════════════

function ArcticPoppyMorph({
  stage = 0,
  swell = false
}) {
  const s = Math.max(0, Math.min(10, stage | 0));
  const tr = "all 0.8s cubic-bezier(.22,1,.36,1)";

  // Driver values per stage (continuous animation targets).
  const stemH = [0, 0, 9, 12, 28, 54, 80, 160, 210, 235, 250][s];
  const stemOp = s >= 2 ? 1 : 0;
  const seedOp = s === 0 ? 1 : s === 1 ? 0.45 : 0;
  const cotyScale = s === 2 ? 1 : s === 3 ? 0.65 : s === 4 ? 0.3 : 0;
  const cotyOp = s >= 2 && s <= 4 ? 1 : 0;
  const budTipX = ANCHOR_X;
  const budTilt = s === 6 ? 15 : s === 7 ? 8 : 0;
  const budScale = s < 6 ? 0 : s === 10 ? 0 : [0, 0, 0, 0, 0, 0, 0.75, 1.0, 1.3, 1.4, 0][s];
  const budOpenness = [0, 0, 0, 0, 0, 0, 0, 0, 0.1, 0.7, 0][s];
  const budColorHint = s === 8 || s === 9;
  const bloomScale = s === 10 ? 1.6 : 0;
  const bloomOp = s === 10 ? 1 : 0;
  const rootDepth = [0, 8, 16, 22, 28, 30, 32, 33, 34, 34, 34][s];

  // Bushier rosette: 24 leaves spawning across frames 3–9 so the bush
  // visibly thickens through stages 6–10 (2–3× the early rosette).
  const leaves = Array.from({
    length: 24
  }).map((_, i) => {
    if (i < 12) {
      const a = -110 + i * 220 / 11;
      const len = 16 + i % 4 * 5;
      const spawnAt = i < 3 ? 3 : i < 8 ? 4 : 5;
      return {
        a,
        len,
        spawnAt
      };
    }
    // 12 more leaves filling in later — interleaved angles + varied size
    const j = i - 12;
    const a = -105 + j * 210 / 11 + (j % 2 === 0 ? 8 : -8);
    const len = 18 + j % 5 * 4;
    const spawnAt = 5 + Math.floor(j / 3); // spawns at 5, 6, 7, 8
    return {
      a,
      len,
      spawnAt
    };
  });

  // Secondary-stem states — each precomputes its current (frame-dependent)
  // tip in world coords so the satellite bloom can render AT that tip,
  // not at a fixed final position. Bud and bloom share the same location.
  const satStems = [{
    tipX: ANCHOR_X + 30,
    tipY: SOIL_Y - 180,
    startFrame: 7,
    satScale: 0.65,
    thick: 1.5
  }, {
    tipX: ANCHOR_X - 34,
    tipY: SOIL_Y - 200,
    startFrame: 8,
    satScale: 0.58,
    thick: 1.4
  }, {
    tipX: ANCHOR_X + 42,
    tipY: SOIL_Y - 120,
    startFrame: 9,
    satScale: 0.48,
    thick: 1.2
  }].map(st => {
    const baseX = ANCHOR_X + (st.tipX > ANCHOR_X ? 5 : -5);
    const baseY = SOIL_Y - 1;
    const dx = st.tipX - baseX;
    const dy = st.tipY - baseY;
    const fullLen = Math.sqrt(dx * dx + dy * dy);
    const rotDeg = Math.atan2(dx, -dy) * 180 / Math.PI;
    const span = 10 - st.startFrame + 1;
    const t = s < st.startFrame ? 0 : Math.min(1, (s - st.startFrame + 1) / span);
    const curTipX = baseX + dx * t;
    const curTipY = baseY + dy * t;
    return {
      ...st,
      baseX,
      baseY,
      dx,
      dy,
      fullLen,
      rotDeg,
      t,
      curTipX,
      curTipY
    };
  });

  // Lateral roots — 8 branches at varied spawn tiers
  const lateralRoots = Array.from({
    length: 10
  }).map((_, i) => {
    const side = i % 2 === 0 ? -1 : 1;
    const t = (i + 1) / 11;
    const startY = SOIL_Y + 2 + t * 26;
    const startX = ANCHOR_X + side * 0.4;
    const endX = ANCHOR_X + side * (3 + i % 3 * 2.2);
    const endY = startY + 2 + i % 3;
    const spawnAt = Math.max(1, Math.floor(i / 2));
    return {
      side,
      startX,
      startY,
      endX,
      endY,
      spawnAt
    };
  });
  return __h(Plant, {
    swell: swell
  }, __h("line", {
    x1: ANCHOR_X,
    y1: SOIL_Y,
    x2: ANCHOR_X,
    y2: SOIL_Y + 1,
    stroke: "#7a5a3a",
    strokeWidth: "1.3",
    strokeLinecap: "round",
    vectorEffect: "non-scaling-stroke",
    style: {
      transformOrigin: `${ANCHOR_X}px ${SOIL_Y}px`,
      transform: `scaleY(${rootDepth})`,
      opacity: 0.78,
      transition: tr
    }
  }), lateralRoots.map((r, i) => {
    const visible = s >= r.spawnAt;
    return __h("line", {
      key: i,
      x1: r.startX,
      y1: r.startY,
      x2: visible ? r.endX : r.startX,
      y2: visible ? r.endY : r.startY,
      stroke: "#7a5a3a",
      strokeWidth: 0.45 + i % 2 * 0.2,
      strokeLinecap: "round",
      opacity: "0.7",
      style: {
        transition: tr
      }
    });
  }), __h("ellipse", {
    cx: ANCHOR_X,
    cy: SOIL_Y - 2,
    rx: 1.5,
    ry: 1.4,
    fill: "#1a0e08",
    style: {
      opacity: seedOp,
      transition: tr
    }
  }), __h("g", {
    style: {
      opacity: cotyOp,
      transition: tr
    }
  }, __h("ellipse", {
    cx: ANCHOR_X - 4.5,
    cy: SOIL_Y - 9,
    rx: 4.5,
    ry: 1.4,
    fill: "#a4c882",
    style: {
      transformBox: "fill-box",
      transformOrigin: "center",
      transform: `translate(${ANCHOR_X - 4.5}px, ${SOIL_Y - 9}px)
                               rotate(-32deg) scale(${cotyScale})
                               translate(${-(ANCHOR_X - 4.5)}px, ${-(SOIL_Y - 9)}px)`,
      transition: tr
    }
  }), __h("ellipse", {
    cx: ANCHOR_X + 4.5,
    cy: SOIL_Y - 9,
    rx: 4.5,
    ry: 1.4,
    fill: "#a4c882",
    style: {
      transformBox: "fill-box",
      transformOrigin: "center",
      transform: `translate(${ANCHOR_X + 4.5}px, ${SOIL_Y - 9}px)
                               rotate(32deg) scale(${cotyScale})
                               translate(${-(ANCHOR_X + 4.5)}px, ${-(SOIL_Y - 9)}px)`,
      transition: tr
    }
  })), leaves.map((leaf, i) => {
    const visible = s >= leaf.spawnAt;
    const scale = visible ? 1 : 0;
    const cx = ANCHOR_X + Math.sin(leaf.a * Math.PI / 180) * 2;
    const cy = SOIL_Y - 1;
    return __h("g", {
      key: i,
      style: {
        transformOrigin: `${cx}px ${cy}px`,
        transform: `scale(${scale})`,
        transition: tr
      }
    }, __h(PoppyLeaf, {
      cx: cx,
      cy: cy,
      length: leaf.len,
      angle: leaf.a,
      color: i % 3 === 0 ? "#6a9a52" : "#5e8a4a"
    }));
  }), __h("line", {
    x1: ANCHOR_X,
    y1: SOIL_Y,
    x2: ANCHOR_X,
    y2: SOIL_Y - 1,
    stroke: "#7aac5e",
    strokeWidth: "1.7",
    strokeLinecap: "round",
    vectorEffect: "non-scaling-stroke",
    style: {
      transformOrigin: `${ANCHOR_X}px ${SOIL_Y}px`,
      transform: `scaleY(${stemH})`,
      opacity: stemOp,
      transition: tr
    }
  }), __h("g", {
    style: {
      transform: `translate(${budTipX}px, ${SOIL_Y - stemH}px) rotate(${budTilt}deg) scale(${budScale})`,
      transformOrigin: "0 0",
      opacity: budScale > 0 ? 1 : 0,
      transition: tr
    }
  }, __h(PoppyBud, {
    scale: 1,
    openness: budOpenness,
    colorHint: budColorHint
  })), satStems.map((st, i) => {
    const stemOp = st.t > 0 ? 0.95 : 0;
    const budScale = s === 10 ? 0 : st.t > 0 ? 0.5 + st.t * 0.45 : 0;
    const budOp = st.t > 0 && s < 10 ? 1 : 0;
    return __h("g", {
      key: `sstem-${i}`,
      style: {
        transform: `translate(${st.baseX}px, ${st.baseY}px) rotate(${st.rotDeg}deg)`,
        transformOrigin: "0 0"
      }
    }, __h("line", {
      x1: 0,
      y1: 0,
      x2: 0,
      y2: -1,
      stroke: "#7aac5e",
      strokeWidth: st.thick,
      strokeLinecap: "round",
      vectorEffect: "non-scaling-stroke",
      style: {
        transformOrigin: "0 0",
        transform: `scaleY(${st.t * st.fullLen})`,
        opacity: stemOp,
        transition: tr
      }
    }), __h("g", {
      style: {
        transform: `translate(0px, ${-st.t * st.fullLen}px) scale(${budScale})`,
        transformOrigin: "0 0",
        opacity: budOp,
        transition: tr
      }
    }, __h(PoppyBud, {
      scale: 1,
      openness: st.t > 0.6 ? 0.1 : 0,
      colorHint: st.t > 0.8
    })));
  }), __h("g", {
    style: {
      opacity: bloomOp,
      transition: tr
    }
  }, __h(BloomFX, {
    accent: "#fbe064",
    centerY: SOIL_Y - 250,
    radius: 108
  }), __h(BloomFX, {
    accent: "#fff8c8",
    centerY: SOIL_Y - 250,
    radius: 60
  })), __h("g", {
    style: {
      transform: `translate(${satStems[0].curTipX}px, ${satStems[0].curTipY}px) scale(${bloomScale * satStems[0].satScale})`,
      transformOrigin: "0 0",
      opacity: bloomOp,
      transition: tr
    }
  }, [0, 60, 120, 180, 240, 300].map(rot => __h("g", {
    key: rot,
    transform: `rotate(${rot})`
  }, __h("path", {
    d: "M 0 -2 Q -12 -10 -14 -20 Q -10 -28 -4 -28 Q 0 -30 4 -28 Q 10 -28 14 -20 Q 12 -10 0 -2 Z",
    fill: "#fbe064"
  }), __h("path", {
    d: "M -2 -6 Q -8 -14 -8 -22 Q -4 -26 0 -26 Q 4 -26 8 -22 Q 8 -14 2 -6 Z",
    fill: "#fde88a",
    opacity: "0.7"
  }))), __h("circle", {
    r: "5",
    fill: "#2a1808"
  }), Array.from({
    length: 16
  }).map((_, i) => {
    const a = i / 16 * 360;
    return __h("g", {
      key: i,
      transform: `rotate(${a})`
    }, __h("line", {
      x1: 0,
      y1: 0,
      x2: 0,
      y2: -5,
      stroke: "#5a3a18",
      strokeWidth: "0.4"
    }), __h("circle", {
      cx: 0,
      cy: -5.5,
      r: "0.7",
      fill: "#1a0e08"
    }));
  }), __h("circle", {
    r: "1.4",
    fill: "#fbe064"
  })), __h("g", {
    style: {
      transform: `translate(${satStems[1].curTipX}px, ${satStems[1].curTipY}px) scale(${bloomScale * satStems[1].satScale})`,
      transformOrigin: "0 0",
      opacity: bloomOp,
      transition: tr
    }
  }, [0, 60, 120, 180, 240, 300].map(rot => __h("g", {
    key: rot,
    transform: `rotate(${rot})`
  }, __h("path", {
    d: "M 0 -2 Q -12 -10 -14 -20 Q -10 -28 -4 -28 Q 0 -30 4 -28 Q 10 -28 14 -20 Q 12 -10 0 -2 Z",
    fill: "#fbe064"
  }), __h("path", {
    d: "M -2 -6 Q -8 -14 -8 -22 Q -4 -26 0 -26 Q 4 -26 8 -22 Q 8 -14 2 -6 Z",
    fill: "#fde88a",
    opacity: "0.7"
  }))), __h("circle", {
    r: "4",
    fill: "#2a1808"
  }), Array.from({
    length: 14
  }).map((_, i) => {
    const a = i / 14 * 360;
    return __h("g", {
      key: i,
      transform: `rotate(${a})`
    }, __h("line", {
      x1: 0,
      y1: 0,
      x2: 0,
      y2: -4.5,
      stroke: "#5a3a18",
      strokeWidth: "0.4"
    }), __h("circle", {
      cx: 0,
      cy: -5,
      r: "0.6",
      fill: "#1a0e08"
    }));
  })), __h("g", {
    style: {
      transform: `translate(${satStems[2].curTipX}px, ${satStems[2].curTipY}px) scale(${bloomScale * satStems[2].satScale})`,
      transformOrigin: "0 0",
      opacity: bloomOp,
      transition: tr
    }
  }, [0, 60, 120, 180, 240, 300].map(rot => __h("g", {
    key: rot,
    transform: `rotate(${rot})`
  }, __h("path", {
    d: "M 0 -2 Q -12 -10 -14 -20 Q -10 -28 -4 -28 Q 0 -30 4 -28 Q 10 -28 14 -20 Q 12 -10 0 -2 Z",
    fill: "#fbe064"
  }))), __h("circle", {
    r: "3.5",
    fill: "#2a1808"
  }), Array.from({
    length: 12
  }).map((_, i) => {
    const a = i / 12 * 360;
    return __h("circle", {
      key: i,
      r: "0.55",
      cx: 0,
      cy: -4,
      fill: "#1a0e08",
      transform: `rotate(${a})`
    });
  })), __h("g", {
    style: {
      transform: `translate(${ANCHOR_X}px, ${SOIL_Y - stemH}px) scale(${bloomScale})`,
      transformOrigin: "0 0",
      opacity: bloomOp,
      transition: tr
    }
  }, __h("path", {
    d: "M -8 6 Q -12 9 -10 14",
    fill: "none",
    stroke: "#7aac5e",
    strokeWidth: "1.4",
    opacity: "0.6"
  }), __h("path", {
    d: "M  8 6 Q  12 9  10 14",
    fill: "none",
    stroke: "#7aac5e",
    strokeWidth: "1.4",
    opacity: "0.6"
  }), [0, 60, 120, 180, 240, 300].map(rot => __h("g", {
    key: rot,
    transform: `rotate(${rot})`
  }, __h("path", {
    d: "M 0 -2 Q -14 -10 -16 -22 Q -12 -32 -5 -32 Q 0 -34 5 -32 Q 12 -32 16 -22 Q 14 -10 0 -2 Z",
    fill: "#fbe064"
  }), __h("path", {
    d: "M -2 -6 Q -9 -15 -9 -25 Q -4 -29 0 -29 Q 4 -29 9 -25 Q 9 -15 2 -6 Z",
    fill: "#fde88a",
    opacity: "0.75"
  }), __h("line", {
    x1: 0,
    y1: -6,
    x2: 0,
    y2: -30,
    stroke: "#d4a020",
    strokeWidth: "0.55",
    opacity: "0.55"
  }), __h("line", {
    x1: 0,
    y1: -6,
    x2: -6,
    y2: -24,
    stroke: "#d4a020",
    strokeWidth: "0.4",
    opacity: "0.45"
  }), __h("line", {
    x1: 0,
    y1: -6,
    x2: 6,
    y2: -24,
    stroke: "#d4a020",
    strokeWidth: "0.4",
    opacity: "0.45"
  }))), [30, 90, 150, 210, 270, 330].map(rot => __h("g", {
    key: rot,
    transform: `rotate(${rot})`
  }, __h("path", {
    d: "M 0 -3 Q -8 -10 -9 -20 Q -5 -26 0 -26 Q 5 -26 9 -20 Q 8 -10 0 -3 Z",
    fill: "#fff4b8",
    opacity: "0.92"
  }), __h("line", {
    x1: 0,
    y1: -5,
    x2: 0,
    y2: -24,
    stroke: "#e8a040",
    strokeWidth: "0.4",
    opacity: "0.55"
  }))), __h("circle", {
    r: "7",
    fill: "#2a1808"
  }), __h("circle", {
    r: "5",
    fill: "#4a2a10"
  }), __h("circle", {
    r: "3.5",
    fill: "#5e3618"
  }), Array.from({
    length: 22
  }).map((_, i) => {
    const a = i / 22 * 360;
    return __h("g", {
      key: i,
      transform: `rotate(${a})`
    }, __h("line", {
      x1: 0,
      y1: -1,
      x2: 0,
      y2: -7.2,
      stroke: "#5a3a18",
      strokeWidth: "0.55"
    }), __h("circle", {
      cx: 0,
      cy: -7.8,
      r: "1.05",
      fill: "#1a0e08"
    }), __h("circle", {
      cx: 0,
      cy: -7.8,
      r: "0.4",
      fill: "#fff8c8",
      opacity: "0.7"
    }));
  }), __h("circle", {
    r: "2.2",
    fill: "#3a2010"
  }), [0, 45, 90, 135, 180, 225, 270, 315].map(a => __h("line", {
    key: a,
    x1: 0,
    y1: 0,
    x2: Math.sin(a * Math.PI / 180) * 2.2,
    y2: -Math.cos(a * Math.PI / 180) * 2.2,
    stroke: "#fbe064",
    strokeWidth: "0.6",
    opacity: "0.9"
  })), Array.from({
    length: 12
  }).map((_, i) => {
    const a = i / 12 * Math.PI * 2;
    const r = 45;
    return __h("g", {
      key: i,
      transform: `translate(${Math.cos(a) * r} ${Math.sin(a) * r})`
    }, __h("path", {
      d: "M 0 -2 L 0.6 -0.6 L 2 0 L 0.6 0.6 L 0 2 L -0.6 0.6 L -2 0 L -0.6 -0.6 Z",
      fill: "#fbe064"
    }), __h("circle", {
      r: "0.6",
      fill: "#fff",
      opacity: "0.9"
    }));
  })));
}

// Detailed: opposite-paired ovate serrated leaves with deep parallel
// veining; woody-edged stem; corymb of many 4-petal florets in varied
// purple/blue shades, each with a tiny true flower center.
// ════════════════════════════════════════════════════════════════════════

// ════════════════════════════════════════════════════════════════════════
// HYDRANGEA MORPH · 11-stage build with persistent SVG + CSS transitions
// Opposite leaf pairs along a woody stem; bloom is a corymb cluster of
// 4-petal florets in mixed purple tones — erupts AT the stem tip.
// ════════════════════════════════════════════════════════════════════════

function HydrangeaMorph({
  stage = 0,
  swell = false
}) {
  const s = Math.max(0, Math.min(10, stage | 0));
  const tr = "all 0.8s cubic-bezier(.22,1,.36,1)";
  const stemH = [0, 0, 14, 30, 55, 95, 140, 195, 230, 240, 248][s];
  const stemOp = s >= 2 ? 1 : 0;
  const seedOp = s === 0 ? 1 : s === 1 ? 0.45 : 0;
  const cotyScale = s === 2 ? 1 : s === 3 ? 0.65 : s === 4 ? 0.3 : 0;
  const cotyOp = s >= 2 && s <= 4 ? 1 : 0;
  const rootDepth = [0, 8, 16, 22, 28, 30, 32, 33, 34, 34, 34][s];

  // Opposite leaf pairs along stem — stem extends above all leaves
  const leafPairs = [{
    y: 10,
    spawnAt: 3,
    size: 0.55
  }, {
    y: 26,
    spawnAt: 4,
    size: 0.75
  }, {
    y: 52,
    spawnAt: 5,
    size: 0.90
  }, {
    y: 85,
    spawnAt: 6,
    size: 1.00
  }, {
    y: 130,
    spawnAt: 7,
    size: 1.05
  }, {
    y: 175,
    spawnAt: 8,
    size: 1.00
  }];

  // Corymb florets — fan around the top, openness grows with stage.
  const corymb = [{
    x: 0,
    y: 0
  }, {
    x: 8,
    y: 0
  }, {
    x: -8,
    y: 0
  }, {
    x: 4,
    y: -6.8
  }, {
    x: -4,
    y: -6.8
  }, {
    x: 4,
    y: 6.8
  }, {
    x: -4,
    y: 6.8
  }, {
    x: 16,
    y: 0
  }, {
    x: -16,
    y: 0
  }, {
    x: 12,
    y: -7.5
  }, {
    x: -12,
    y: -7.5
  }, {
    x: 12,
    y: 7.5
  }, {
    x: -12,
    y: 7.5
  }, {
    x: 4,
    y: -14
  }, {
    x: -4,
    y: -14
  }, {
    x: 4,
    y: 14
  }, {
    x: -4,
    y: 14
  }, {
    x: 8,
    y: -13
  }, {
    x: -8,
    y: -13
  }, {
    x: 8,
    y: 13
  }, {
    x: -8,
    y: 13
  }];
  // Corymb appears ONLY at frame 10 — big, dazzling final bloom.
  const corymbOp = s === 10 ? 1 : 0;
  const floretOpenness = 1;
  const floretScale = 2.3;
  const bloomOp = s === 10 ? 1 : 0;

  // Satellite corymbs at frame 10 only — for fullness
  const satStems = [{
    tipX: ANCHOR_X + 30,
    tipY: SOIL_Y - 165,
    startFrame: 8,
    satScale: 0.85
  }, {
    tipX: ANCHOR_X - 32,
    tipY: SOIL_Y - 185,
    startFrame: 9,
    satScale: 0.75
  }, {
    tipX: ANCHOR_X + 14,
    tipY: SOIL_Y - 120,
    startFrame: 9,
    satScale: 0.62
  }].map(st => {
    const baseX = ANCHOR_X + (st.tipX > ANCHOR_X ? 4 : -4);
    const baseY = SOIL_Y - 18;
    const dx = st.tipX - baseX,
      dy = st.tipY - baseY;
    const fullLen = Math.sqrt(dx * dx + dy * dy);
    const rotDeg = Math.atan2(dx, -dy) * 180 / Math.PI;
    const span = 10 - st.startFrame + 1;
    const t = s < st.startFrame ? 0 : Math.min(1, (s - st.startFrame + 1) / span);
    return {
      ...st,
      baseX,
      baseY,
      dx,
      dy,
      fullLen,
      rotDeg,
      t,
      curTipX: baseX + dx * t,
      curTipY: baseY + dy * t
    };
  });
  return __h(Plant, {
    swell: swell
  }, __h("line", {
    x1: ANCHOR_X,
    y1: SOIL_Y,
    x2: ANCHOR_X,
    y2: SOIL_Y + 1,
    stroke: "#7a5a3a",
    strokeWidth: "1.3",
    strokeLinecap: "round",
    vectorEffect: "non-scaling-stroke",
    style: {
      transformOrigin: `${ANCHOR_X}px ${SOIL_Y}px`,
      transform: `scaleY(${rootDepth})`,
      opacity: 0.78,
      transition: tr
    }
  }), Array.from({
    length: 10
  }).map((_, i) => {
    const side = i % 2 === 0 ? -1 : 1;
    const t = (i + 1) / 11;
    const startY = SOIL_Y + 2 + t * 26;
    const startX = ANCHOR_X + side * 0.4;
    const endX = ANCHOR_X + side * (3 + i % 3 * 2.2);
    const endY = startY + 2 + i % 3;
    const visible = s >= Math.max(1, Math.floor(i / 2));
    return __h("line", {
      key: `r${i}`,
      x1: startX,
      y1: startY,
      x2: visible ? endX : startX,
      y2: visible ? endY : startY,
      stroke: "#7a5a3a",
      strokeWidth: 0.45 + i % 2 * 0.2,
      strokeLinecap: "round",
      opacity: "0.7",
      style: {
        transition: tr
      }
    });
  }), __h("ellipse", {
    cx: ANCHOR_X,
    cy: SOIL_Y - 2,
    rx: 1.6,
    ry: 1.2,
    fill: "#2a1808",
    style: {
      opacity: seedOp,
      transition: tr
    }
  }), __h("g", {
    style: {
      opacity: cotyOp,
      transition: tr
    }
  }, __h("ellipse", {
    cx: ANCHOR_X - 6,
    cy: SOIL_Y - 9,
    rx: 6,
    ry: 1.7,
    fill: "#7aac5e",
    style: {
      transformOrigin: `${ANCHOR_X - 6}px ${SOIL_Y - 9}px`,
      transform: `rotate(-12deg) scale(${cotyScale})`,
      transition: tr
    }
  }), __h("ellipse", {
    cx: ANCHOR_X + 6,
    cy: SOIL_Y - 9,
    rx: 6,
    ry: 1.7,
    fill: "#7aac5e",
    style: {
      transformOrigin: `${ANCHOR_X + 6}px ${SOIL_Y - 9}px`,
      transform: `rotate(12deg) scale(${cotyScale})`,
      transition: tr
    }
  })), __h("path", {
    d: `M ${ANCHOR_X - 1.8} ${SOIL_Y} L ${ANCHOR_X - 1.4} ${SOIL_Y - 1} L ${ANCHOR_X + 1.4} ${SOIL_Y - 1} L ${ANCHOR_X + 1.8} ${SOIL_Y} Z`,
    fill: "#4a6230",
    style: {
      transformOrigin: `${ANCHOR_X}px ${SOIL_Y}px`,
      transform: `scaleY(${stemH})`,
      opacity: stemOp,
      transition: tr
    }
  }), __h("line", {
    x1: ANCHOR_X - 1,
    y1: SOIL_Y,
    x2: ANCHOR_X - 0.6,
    y2: SOIL_Y - 1,
    stroke: "#7a9a5a",
    strokeWidth: "0.5",
    opacity: "0.7",
    vectorEffect: "non-scaling-stroke",
    style: {
      transformOrigin: `${ANCHOR_X}px ${SOIL_Y}px`,
      transform: `scaleY(${stemH})`,
      opacity: stemOp * 0.7,
      transition: tr
    }
  }), leafPairs.map((pair, i) => {
    const visible = s >= pair.spawnAt;
    const ly = SOIL_Y - pair.y;
    const sc = visible ? pair.size : 0;
    return __h("g", {
      key: `lp${i}`,
      style: {
        opacity: visible ? 1 : 0,
        transition: tr,
        transformOrigin: `${ANCHOR_X}px ${ly}px`,
        transform: `scale(${sc > 0 ? 1 : 0})`
      }
    }, __h("ellipse", {
      cx: ANCHOR_X,
      cy: ly,
      rx: 2.2,
      ry: 1.2,
      fill: "#2a4220"
    }), __h(HydrangeaLeaf, {
      cx: ANCHOR_X - 1.4,
      cy: ly,
      size: pair.size,
      angle: -80
    }), __h(HydrangeaLeaf, {
      cx: ANCHOR_X + 1.4,
      cy: ly,
      size: pair.size,
      angle: 80
    }));
  }), __h("g", {
    style: {
      transform: `translate(${ANCHOR_X}px, ${SOIL_Y - stemH - 6}px) scale(${floretScale})`,
      transformOrigin: "0 0",
      opacity: corymbOp,
      transition: tr
    }
  }, __h("ellipse", {
    cx: 0,
    cy: 6,
    rx: 6,
    ry: 3,
    fill: "#3e6a2a",
    opacity: "0.85"
  }), corymb.map((f, i) => __h(HydrangeaFloret, {
    key: i,
    x: f.x,
    y: f.y,
    openness: floretOpenness,
    tone: i % 5,
    scale: 1
  }))), satStems.map((st, i) => __h("g", {
    key: `sat${i}`,
    style: {
      transform: `translate(${st.baseX}px, ${st.baseY}px) rotate(${st.rotDeg}deg)`,
      transformOrigin: "0 0"
    }
  }, __h("line", {
    x1: 0,
    y1: 0,
    x2: 0,
    y2: -1,
    stroke: "#4a6230",
    strokeWidth: "1.2",
    strokeLinecap: "round",
    vectorEffect: "non-scaling-stroke",
    style: {
      transformOrigin: "0 0",
      transform: `scaleY(${st.t * st.fullLen})`,
      opacity: st.t > 0 ? 0.9 : 0,
      transition: tr
    }
  }), __h("g", {
    style: {
      transform: `translate(0px, ${-st.t * st.fullLen}px) rotate(${-st.rotDeg}deg) scale(${bloomOp * st.satScale})`,
      transformOrigin: "0 0",
      opacity: bloomOp,
      transition: tr
    }
  }, __h("ellipse", {
    cx: 0,
    cy: 6,
    rx: 6,
    ry: 3,
    fill: "#3e6a2a",
    opacity: "0.85"
  }), corymb.slice(0, 14).map((f, j) => __h(HydrangeaFloret, {
    key: j,
    x: f.x,
    y: f.y,
    openness: 1,
    tone: (j + i) % 5,
    scale: 1
  }))))), __h("g", {
    style: {
      opacity: bloomOp,
      transition: tr
    }
  }, __h(BloomFX, {
    accent: "#9c84d8",
    centerY: SOIL_Y - stemH - 6,
    radius: 120
  }), __h(BloomFX, {
    accent: "#e0d0f0",
    centerY: SOIL_Y - stemH - 6,
    radius: 75
  })));
}

// Hydrangea leaf: broad ovate shape, deeply serrated edge, prominent
// midrib and lateral veins. Origin at petiole.
function HydrangeaLeaf({
  cx,
  cy,
  size = 1,
  angle = 0,
  color = "#3e8a44",
  vein = "#1a4220"
}) {
  const w = 18 * size;
  const h = 24 * size;
  // Build a leaf outline with small zigzag serrations along the edge.
  const teeth = 9;
  let path = `M 0 0 `;
  for (let i = 0; i < teeth; i++) {
    const t1 = (i + 0.4) / teeth;
    const t2 = (i + 1) / teeth;
    const wOut = w / 2 * Math.sin(t1 * Math.PI);
    const wIn = w / 2 * Math.sin(t2 * Math.PI) * 0.82;
    path += `Q ${wOut + 1.6} ${-h * t1 + 1.2} ${wIn} ${-h * t2} `;
  }
  path += `L 0 ${-h} `;
  for (let i = teeth - 1; i >= 0; i--) {
    const t1 = (i + 0.4) / teeth;
    const t2 = i / teeth;
    const wOut = -(w / 2) * Math.sin(t1 * Math.PI);
    const wIn = -(w / 2) * Math.sin((i + 0.0) / teeth * Math.PI) * 0.82;
    path += `Q ${wOut - 1.6} ${-h * t1 + 1.2} ${wIn} ${-h * t2} `;
  }
  path += `Z`;
  // Lateral veins (6 pairs)
  const laterals = [];
  for (let i = 1; i <= 6; i++) {
    const t = i / 7;
    const ly = -h * t;
    const lw = w / 2 * Math.sin(t * Math.PI);
    laterals.push(__h("line", {
      key: `vr${i}`,
      x1: 0,
      y1: ly + 1,
      x2: lw * 0.88,
      y2: ly - 1.2,
      stroke: vein,
      strokeWidth: 0.55,
      opacity: 0.7
    }));
    laterals.push(__h("line", {
      key: `vl${i}`,
      x1: 0,
      y1: ly + 1,
      x2: -lw * 0.88,
      y2: ly - 1.2,
      stroke: vein,
      strokeWidth: 0.55,
      opacity: 0.7
    }));
  }
  return __h("g", {
    transform: `translate(${cx} ${cy}) rotate(${angle})`
  }, __h("path", {
    d: path,
    fill: color
  }), __h("path", {
    d: path,
    fill: "#1f5224",
    opacity: "0.22",
    transform: "translate(0.8 1.2)"
  }), __h("ellipse", {
    cx: -w * 0.15,
    cy: -h * 0.55,
    rx: w * 0.15,
    ry: h * 0.25,
    fill: "#fff",
    opacity: "0.13",
    transform: `rotate(-12 ${-w * 0.15} ${-h * 0.55})`
  }), __h("line", {
    x1: 0,
    y1: 0,
    x2: 0,
    y2: -h,
    stroke: vein,
    strokeWidth: 0.85,
    opacity: 0.85
  }), laterals);
}

// A single 4-petal floret. `color` for petals, `openness` 0..1 controls
// how spread the petals are. `tone` selects palette variant for fullness.
function HydrangeaFloret({
  x = 0,
  y = 0,
  openness = 1,
  tone = 0,
  scale = 1
}) {
  const palettes = [{
    p: "#9c84d8",
    d: "#6e54a0",
    c: "#fff"
  }, {
    p: "#b8a4e4",
    d: "#7e62b0",
    c: "#fbe064"
  }, {
    p: "#7a5cb8",
    d: "#503090",
    c: "#fff"
  }, {
    p: "#a8c4e8",
    d: "#7898c4",
    c: "#fff"
  }, {
    p: "#bea8e4",
    d: "#8e74c0",
    c: "#f0a4d8"
  }];
  const pal = palettes[tone % palettes.length];
  const o = openness;
  const r = 3.6 * scale;
  return __h("g", {
    transform: `translate(${x} ${y})`
  }, [0, 90, 180, 270].map(rot => __h("g", {
    key: rot,
    transform: `rotate(${rot})`
  }, __h("path", {
    d: `M 0 ${-1.4 * o}
                Q ${-r * 0.8} ${-r * 1.1 * o} ${-r * 0.55} ${-r * 1.6 * o}
                Q  0 ${-r * 1.9 * o}            ${r * 0.55} ${-r * 1.6 * o}
                Q ${r * 0.8} ${-r * 1.1 * o}   0 ${-1.4 * o} Z`,
    fill: pal.p
  }), __h("line", {
    x1: 0,
    y1: -1 * o,
    x2: 0,
    y2: -r * 1.7 * o,
    stroke: pal.d,
    strokeWidth: 0.4,
    opacity: 0.55
  }))), o > 0.5 && __h("g", null, [0, 90, 180, 270].map(rot => __h("circle", {
    key: rot,
    cx: 0,
    cy: -1.1,
    r: 0.5,
    fill: "#fbe064",
    transform: `rotate(${rot})`
  })), __h("circle", {
    r: 0.9,
    fill: pal.c
  })));
}
function Hydrangea({
  stage: stageProp = 0,
  frame,
  swell = false
}) {
  const {
    stage,
    extra
  } = resolveFrame(stageProp, frame);
  // bloom corymb center at y=50 (stemH 244 + 6px offset).
  // Heavier growth 3→4 and 4→5.
  const stemH = [0, 18, 100, 160, 205, 235, 244][stage];
  const tipY = SOIL_Y - stemH;
  // # of opposite leaf pairs visible up the stem
  const pairs = stage >= 5 ? 4 : stage >= 4 ? 3 : stage >= 3 ? 3 : stage >= 2 ? 2 : 0;

  // Hexagonal corymb of florets (positions in flower-head local space)
  const corymb = [{
    x: 0,
    y: 0
  },
  // ring 1
  {
    x: 8,
    y: 0
  }, {
    x: -8,
    y: 0
  }, {
    x: 4,
    y: -6.8
  }, {
    x: -4,
    y: -6.8
  }, {
    x: 4,
    y: 6.8
  }, {
    x: -4,
    y: 6.8
  },
  // ring 2
  {
    x: 16,
    y: 0
  }, {
    x: -16,
    y: 0
  }, {
    x: 12,
    y: -7.5
  }, {
    x: -12,
    y: -7.5
  }, {
    x: 12,
    y: 7.5
  }, {
    x: -12,
    y: 7.5
  }, {
    x: 4,
    y: -14
  }, {
    x: -4,
    y: -14
  }, {
    x: 4,
    y: 14
  }, {
    x: -4,
    y: 14
  },
  // partial outer fringe
  {
    x: 8,
    y: -13
  }, {
    x: -8,
    y: -13
  }, {
    x: 8,
    y: 13
  }, {
    x: -8,
    y: 13
  }];
  return __h(Plant, {
    swell: swell
  }, stage === 0 && __h("g", null, [-2, 0, 2].map(dx => __h("circle", {
    key: dx,
    cx: ANCHOR_X + dx,
    cy: SOIL_Y - 1.5,
    r: 0.6,
    fill: "#2a1808"
  })), __h("ellipse", {
    cx: ANCHOR_X,
    cy: SOIL_Y - 0.5,
    rx: 4,
    ry: 0.7,
    fill: "#4a3a2a",
    opacity: "0.5"
  })), stage === 1 && __h("g", null, __h("line", {
    x1: ANCHOR_X,
    y1: SOIL_Y,
    x2: ANCHOR_X,
    y2: SOIL_Y - 8,
    stroke: "#6a9450",
    strokeWidth: "1.4",
    strokeLinecap: "round"
  }), __h("ellipse", {
    cx: ANCHOR_X - 6,
    cy: SOIL_Y - 8,
    rx: 6,
    ry: 1.8,
    fill: "#7aac5e",
    transform: `rotate(-10 ${ANCHOR_X - 6} ${SOIL_Y - 8})`
  }), __h("ellipse", {
    cx: ANCHOR_X + 6,
    cy: SOIL_Y - 8,
    rx: 6,
    ry: 1.8,
    fill: "#7aac5e",
    transform: `rotate(10 ${ANCHOR_X + 6} ${SOIL_Y - 8})`
  }), __h("line", {
    x1: ANCHOR_X - 1,
    y1: SOIL_Y - 8,
    x2: ANCHOR_X - 11,
    y2: SOIL_Y - 9,
    stroke: "#3e6a32",
    strokeWidth: "0.4"
  }), __h("line", {
    x1: ANCHOR_X + 1,
    y1: SOIL_Y - 8,
    x2: ANCHOR_X + 11,
    y2: SOIL_Y - 9,
    stroke: "#3e6a32",
    strokeWidth: "0.4"
  }), __h("ellipse", {
    cx: ANCHOR_X - 3,
    cy: SOIL_Y - 10,
    rx: 2.6,
    ry: 1.2,
    fill: "#5a8e44",
    transform: `rotate(-50 ${ANCHOR_X - 3} ${SOIL_Y - 10})`
  }), __h("ellipse", {
    cx: ANCHOR_X + 3,
    cy: SOIL_Y - 10,
    rx: 2.6,
    ry: 1.2,
    fill: "#5a8e44",
    transform: `rotate(50 ${ANCHOR_X + 3} ${SOIL_Y - 10})`
  })), stage >= 2 && __h(__Fragment, null, __h("path", {
    d: `M ${ANCHOR_X - 1.8} ${SOIL_Y}
                    L ${ANCHOR_X - 1.4} ${tipY}
                    L ${ANCHOR_X + 1.4} ${tipY}
                    L ${ANCHOR_X + 1.8} ${SOIL_Y} Z`,
    fill: "#4a6230"
  }), __h("line", {
    x1: ANCHOR_X - 1,
    y1: SOIL_Y,
    x2: ANCHOR_X - 0.6,
    y2: tipY,
    stroke: "#7a9a5a",
    strokeWidth: "0.5",
    opacity: "0.7"
  }), Array.from({
    length: pairs
  }).map((_, i) => {
    const y = SOIL_Y - 18 - i * 30;
    return __h("ellipse", {
      key: `n${i}`,
      cx: ANCHOR_X,
      cy: y,
      rx: 2.2,
      ry: 1.2,
      fill: "#2a4220"
    });
  }), Array.from({
    length: pairs
  }).map((_, i) => {
    const y = SOIL_Y - 18 - i * 30;
    // smaller upper leaves, biggest at base
    const size = (stage >= 3 ? 1.1 : 0.85) - i * 0.12;
    return __h("g", {
      key: i
    }, __h(HydrangeaLeaf, {
      cx: ANCHOR_X - 1.4,
      cy: y,
      size: Math.max(0.5, size),
      angle: -80
    }), __h(HydrangeaLeaf, {
      cx: ANCHOR_X + 1.4,
      cy: y,
      size: Math.max(0.5, size),
      angle: 80
    }));
  })), stage >= 3 && __h("g", {
    transform: `translate(${ANCHOR_X} ${tipY - 6})`
  }, __h("ellipse", {
    cx: 0,
    cy: 6,
    rx: 6,
    ry: 3,
    fill: "#3e6a2a",
    opacity: "0.85"
  }), corymb.slice(0, stage === 3 ? 7 : corymb.length).map((f, i) => __h("line", {
    key: i,
    x1: 0,
    y1: 5,
    x2: f.x * 0.85,
    y2: f.y * 0.85 + 1,
    stroke: "#3e6a2a",
    strokeWidth: "0.5",
    opacity: "0.7"
  })), stage === 3 &&
  // tight green floret buds — small nubs
  __h(__Fragment, null, corymb.slice(0, 7).map((f, i) => __h("g", {
    key: i
  }, __h("circle", {
    cx: f.x,
    cy: f.y,
    r: 2.2,
    fill: "#5a8844"
  }), __h("circle", {
    cx: f.x - 0.4,
    cy: f.y - 0.5,
    r: 0.6,
    fill: "#7aac5e",
    opacity: "0.6"
  }), __h("line", {
    x1: f.x - 1,
    y1: f.y,
    x2: f.x + 1,
    y2: f.y,
    stroke: "#2e5024",
    strokeWidth: "0.4"
  }), __h("line", {
    x1: f.x,
    y1: f.y - 1,
    x2: f.x,
    y2: f.y + 1,
    stroke: "#2e5024",
    strokeWidth: "0.4"
  })))), stage === 4 &&
  // floret buds visible, hint of color
  __h(__Fragment, null, corymb.slice(0, 13).map((f, i) => __h(HydrangeaFloret, {
    key: i,
    x: f.x,
    y: f.y,
    openness: 0.35,
    tone: i % 5,
    scale: 0.85
  }))), stage === 5 &&
  // florets partly open, color saturated
  __h(__Fragment, null, corymb.map((f, i) => __h(HydrangeaFloret, {
    key: i,
    x: f.x,
    y: f.y,
    openness: 0.7,
    tone: i % 5,
    scale: 0.95
  }))), stage === 6 &&
  // BLOOM — fully open corymb with varied palette
  __h(__Fragment, null, corymb.map((f, i) => __h(HydrangeaFloret, {
    key: i,
    x: f.x,
    y: f.y,
    openness: 1,
    tone: i % 5,
    scale: 1.05
  })), [{
    x: 18,
    y: -10
  }, {
    x: -18,
    y: -10
  }, {
    x: 18,
    y: 10
  }, {
    x: -18,
    y: 10
  }, {
    x: 0,
    y: -18
  }, {
    x: 0,
    y: 18
  }].map((f, i) => __h(HydrangeaFloret, {
    key: `o${i}`,
    x: f.x,
    y: f.y,
    openness: 1,
    tone: (i + 2) % 5,
    scale: 0.9
  })), __h("g", {
    transform: "translate(28 18)"
  }, corymb.slice(0, 14).map((f, i) => __h(HydrangeaFloret, {
    key: `b${i}`,
    x: f.x * 0.6,
    y: f.y * 0.6,
    openness: 1,
    tone: (i + 3) % 5,
    scale: 0.7
  }))), __h("g", {
    transform: "translate(-26 26)"
  }, corymb.slice(0, 9).map((f, i) => __h(HydrangeaFloret, {
    key: `c${i}`,
    x: f.x * 0.5,
    y: f.y * 0.5,
    openness: 1,
    tone: (i + 1) % 5,
    scale: 0.6
  }))))), stage === 6 && __h(BloomFX, {
    accent: "#9c84d8",
    centerY: tipY - 4,
    radius: 75
  }), extra === "crack" && __h(SeedCrackOverlay, null), extra === "leaves" && __h(FirstLeavesOverlay, null), extra === "grows" && __h(BudGrowsOverlay, {
    tipY: SOIL_Y - 160 - 6,
    tipX: ANCHOR_X
  }), extra === "peek" && __h(ColorPeekOverlay, {
    tipY: SOIL_Y - 205 - 6,
    tipX: ANCHOR_X,
    color: "#9c84d8"
  }));
}

// ════════════════════════════════════════════════════════════════════════
// HIBISCUS · rosa-sinensis
// Detailed: glossy lobed serrated leaves with palmate veining, woody stem
// with leaf scars, multi-segment trumpet bud, 5 crinkled petals with
// veining, iconic long staminal column with anther crown + pistil tip.
// ════════════════════════════════════════════════════════════════════════

// ════════════════════════════════════════════════════════════════════════
// HIBISCUS MORPH · 11-stage build · red hibiscus (rosa-sinensis)
// Woody stem with alternating lobed leaves; trumpet bud; 5-petal crimson
// bloom with iconic staminal column erupts at stem tip.
// ════════════════════════════════════════════════════════════════════════

function HibiscusMorph({
  stage = 0,
  swell = false
}) {
  const s = Math.max(0, Math.min(10, stage | 0));
  const tr = "all 0.8s cubic-bezier(.22,1,.36,1)";
  const stemH = [0, 0, 14, 24, 48, 85, 130, 180, 220, 238, 250][s];
  const stemOp = s >= 2 ? 1 : 0;
  const seedOp = s === 0 ? 1 : s === 1 ? 0.5 : 0;
  const cotyScale = s === 2 ? 1 : s === 3 ? 0.65 : s === 4 ? 0.3 : 0;
  const cotyOp = s >= 2 && s <= 4 ? 1 : 0;
  const rootDepth = [0, 8, 16, 22, 28, 30, 32, 33, 34, 34, 34][s];

  // Alternating lobed leaves — placed below the stem tip at each frame
  const leaves = [{
    y: 11,
    side: -1,
    spawnAt: 3,
    size: 0.55
  }, {
    y: 30,
    side: 1,
    spawnAt: 4,
    size: 0.75
  }, {
    y: 60,
    side: -1,
    spawnAt: 5,
    size: 0.90
  }, {
    y: 100,
    side: 1,
    spawnAt: 6,
    size: 1.00
  }, {
    y: 150,
    side: -1,
    spawnAt: 7,
    size: 1.05
  }, {
    y: 195,
    side: 1,
    spawnAt: 8,
    size: 1.00
  }];

  // Bud appearance evolves frames 6→9; bloom at 10
  const budScale = s === 10 ? 0 : [0, 0, 0, 0, 0, 0, 0.7, 0.95, 1.1, 1.3, 0][s];
  const budOp = s >= 6 && s < 10 ? 1 : 0;
  const budColor = s === 7 ? 0.3 : s === 8 ? 0.7 : s === 9 ? 1.0 : 0;
  const bloomScale = s === 10 ? 1.55 : 0;
  const bloomOp = s === 10 ? 1 : 0;
  const satStems = [{
    tipX: ANCHOR_X + 28,
    tipY: SOIL_Y - 180,
    startFrame: 8,
    satScale: 0.7
  }, {
    tipX: ANCHOR_X - 30,
    tipY: SOIL_Y - 145,
    startFrame: 9,
    satScale: 0.55
  }].map(st => {
    const baseX = ANCHOR_X + (st.tipX > ANCHOR_X ? 4 : -4);
    const baseY = SOIL_Y - 1;
    const dx = st.tipX - baseX,
      dy = st.tipY - baseY;
    const fullLen = Math.sqrt(dx * dx + dy * dy);
    const rotDeg = Math.atan2(dx, -dy) * 180 / Math.PI;
    const span = 10 - st.startFrame + 1;
    const t = s < st.startFrame ? 0 : Math.min(1, (s - st.startFrame + 1) / span);
    return {
      ...st,
      baseX,
      baseY,
      fullLen,
      rotDeg,
      t,
      curTipX: baseX + dx * t,
      curTipY: baseY + dy * t
    };
  });
  return __h(Plant, {
    swell: swell
  }, __h("line", {
    x1: ANCHOR_X,
    y1: SOIL_Y,
    x2: ANCHOR_X,
    y2: SOIL_Y + 1,
    stroke: "#7a5a3a",
    strokeWidth: "1.3",
    strokeLinecap: "round",
    vectorEffect: "non-scaling-stroke",
    style: {
      transformOrigin: `${ANCHOR_X}px ${SOIL_Y}px`,
      transform: `scaleY(${rootDepth})`,
      opacity: 0.78,
      transition: tr
    }
  }), Array.from({
    length: 10
  }).map((_, i) => {
    const side = i % 2 === 0 ? -1 : 1;
    const t = (i + 1) / 11;
    const startY = SOIL_Y + 2 + t * 26;
    const startX = ANCHOR_X + side * 0.4;
    const endX = ANCHOR_X + side * (3 + i % 3 * 2.2);
    const endY = startY + 2 + i % 3;
    const visible = s >= Math.max(1, Math.floor(i / 2));
    return __h("line", {
      key: `r${i}`,
      x1: startX,
      y1: startY,
      x2: visible ? endX : startX,
      y2: visible ? endY : startY,
      stroke: "#7a5a3a",
      strokeWidth: 0.45 + i % 2 * 0.2,
      strokeLinecap: "round",
      opacity: "0.7",
      style: {
        transition: tr
      }
    });
  }), __h("ellipse", {
    cx: ANCHOR_X,
    cy: SOIL_Y - 2,
    rx: 3,
    ry: 2,
    fill: "#4a2810",
    style: {
      opacity: seedOp,
      transition: tr
    }
  }), __h("g", {
    style: {
      opacity: cotyOp,
      transition: tr
    }
  }, __h("ellipse", {
    cx: ANCHOR_X - 5,
    cy: SOIL_Y - 12,
    rx: 5,
    ry: 2.6,
    fill: "#84b864",
    style: {
      transformOrigin: `${ANCHOR_X - 5}px ${SOIL_Y - 12}px`,
      transform: `rotate(-25deg) scale(${cotyScale})`,
      transition: tr
    }
  }), __h("ellipse", {
    cx: ANCHOR_X + 5,
    cy: SOIL_Y - 12,
    rx: 5,
    ry: 2.6,
    fill: "#84b864",
    style: {
      transformOrigin: `${ANCHOR_X + 5}px ${SOIL_Y - 12}px`,
      transform: `rotate(25deg) scale(${cotyScale})`,
      transition: tr
    }
  })), __h("path", {
    d: `M ${ANCHOR_X - 2} ${SOIL_Y} L ${ANCHOR_X - 1.5} ${SOIL_Y - 1} L ${ANCHOR_X + 1.5} ${SOIL_Y - 1} L ${ANCHOR_X + 2} ${SOIL_Y} Z`,
    fill: "#4a3018",
    style: {
      transformOrigin: `${ANCHOR_X}px ${SOIL_Y}px`,
      transform: `scaleY(${stemH})`,
      opacity: stemOp,
      transition: tr
    }
  }), leaves.map((leaf, i) => {
    const visible = s >= leaf.spawnAt;
    const ly = SOIL_Y - leaf.y;
    return __h("g", {
      key: `l${i}`,
      style: {
        opacity: visible ? 1 : 0,
        transition: tr,
        transformOrigin: `${ANCHOR_X + leaf.side * 2}px ${ly}px`,
        transform: `scale(${visible ? 1 : 0})`
      }
    }, __h(HibiscusLeaf, {
      cx: ANCHOR_X + leaf.side * 2,
      cy: ly,
      size: leaf.size,
      angle: leaf.side * 78
    }));
  }), __h("g", {
    style: {
      transform: `translate(${ANCHOR_X}px, ${SOIL_Y - stemH}px) scale(${budScale})`,
      transformOrigin: "0 0",
      opacity: budOp,
      transition: tr
    }
  }, [-50, -25, 0, 25, 50].map(a => __h("path", {
    key: a,
    d: `M 0 0 Q ${Math.sin(a * Math.PI / 180) * 5} -4 ${Math.sin(a * Math.PI / 180) * 4} -10 Z`,
    fill: "#3a7a32",
    stroke: "#2a5824",
    strokeWidth: "0.3"
  })), __h("path", {
    d: "M -3.5 -2 Q -3.5 -14 0 -20 Q 3.5 -14 3.5 -2 Z",
    fill: "#8eae3a"
  }), __h("path", {
    d: "M -2 -8 Q -2.4 -16 0 -20 Q 2.4 -16 2 -8 Z",
    fill: "#c43a4a",
    style: {
      opacity: budColor,
      transition: tr
    }
  }), __h("ellipse", {
    cx: 0,
    cy: -19,
    rx: 1.6,
    ry: 1.2,
    fill: "#e63465",
    style: {
      opacity: budColor,
      transition: tr
    }
  })), satStems.map((st, i) => {
    const sbudOp = st.t > 0 && s < 10 ? 1 : 0;
    const sbudScale = s === 10 ? 0 : st.t > 0 ? 0.5 + st.t * 0.4 : 0;
    return __h("g", {
      key: `sat${i}`,
      style: {
        transform: `translate(${st.baseX}px, ${st.baseY}px) rotate(${st.rotDeg}deg)`,
        transformOrigin: "0 0"
      }
    }, __h("line", {
      x1: 0,
      y1: 0,
      x2: 0,
      y2: -1,
      stroke: "#4a3018",
      strokeWidth: "1.4",
      strokeLinecap: "round",
      vectorEffect: "non-scaling-stroke",
      style: {
        transformOrigin: "0 0",
        transform: `scaleY(${st.t * st.fullLen})`,
        opacity: st.t > 0 ? 0.95 : 0,
        transition: tr
      }
    }), __h("g", {
      style: {
        transform: `translate(0px, ${-st.t * st.fullLen}px) rotate(${-st.rotDeg}deg) scale(${sbudScale})`,
        transformOrigin: "0 0",
        opacity: sbudOp,
        transition: tr
      }
    }, __h("path", {
      d: "M -3.5 -2 Q -3.5 -14 0 -20 Q 3.5 -14 3.5 -2 Z",
      fill: "#8eae3a"
    }), __h("path", {
      d: "M -2 -8 Q -2.4 -16 0 -20 Q 2.4 -16 2 -8 Z",
      fill: "#c43a4a",
      opacity: "0.6"
    })), __h("g", {
      style: {
        transform: `translate(0px, ${-st.t * st.fullLen}px) rotate(${-st.rotDeg}deg) scale(${bloomScale * st.satScale})`,
        transformOrigin: "0 0",
        opacity: bloomOp,
        transition: tr
      }
    }, __h(HibiscusBloom, {
      scale: 1
    })));
  }), __h("g", {
    style: {
      transform: `translate(${ANCHOR_X}px, ${SOIL_Y - stemH}px) scale(${bloomScale})`,
      transformOrigin: "0 0",
      opacity: bloomOp,
      transition: tr
    }
  }, __h(HibiscusBloom, {
    scale: 1
  })), __h("g", {
    style: {
      opacity: bloomOp,
      transition: tr
    }
  }, __h(BloomFX, {
    accent: "#e63465",
    centerY: SOIL_Y - stemH,
    radius: 80
  }), __h(BloomFX, {
    accent: "#f8b0c8",
    centerY: SOIL_Y - stemH,
    radius: 45
  })));
}

// A lobed glossy hibiscus leaf with palmate veins. Origin at petiole.
function HibiscusLeaf({
  cx,
  cy,
  size = 1,
  angle = 0,
  color = "#2e7a36",
  vein = "#1a4220"
}) {
  // Two side lobes + tip, vague maple/grape silhouette
  const w = 14 * size;
  const h = 22 * size;
  const path = `
    M 0 0
    Q ${-w * 0.2} ${-h * 0.15} ${-w * 0.55} ${-h * 0.30}
    Q ${-w * 0.65} ${-h * 0.45} ${-w * 0.45} ${-h * 0.55}
    Q ${-w * 0.6} ${-h * 0.75} ${-w * 0.30} ${-h * 0.80}
    Q ${-w * 0.20} ${-h * 0.95} 0 ${-h}
    Q ${w * 0.20} ${-h * 0.95} ${w * 0.30} ${-h * 0.80}
    Q ${w * 0.6} ${-h * 0.75} ${w * 0.45} ${-h * 0.55}
    Q ${w * 0.65} ${-h * 0.45} ${w * 0.55} ${-h * 0.30}
    Q ${w * 0.2} ${-h * 0.15} 0 0 Z`;
  // Palmate veins
  const veins = [{
    x: 0,
    y: -h
  }, {
    x: -w * 0.45,
    y: -h * 0.55
  }, {
    x: w * 0.45,
    y: -h * 0.55
  }, {
    x: -w * 0.55,
    y: -h * 0.30
  }, {
    x: w * 0.55,
    y: -h * 0.30
  }];
  return __h("g", {
    transform: `translate(${cx} ${cy}) rotate(${angle})`
  }, __h("path", {
    d: path,
    fill: color
  }), __h("ellipse", {
    cx: -w * 0.12,
    cy: -h * 0.55,
    rx: w * 0.18,
    ry: h * 0.30,
    fill: "#fff",
    opacity: "0.14",
    transform: `rotate(-10 ${-w * 0.12} ${-h * 0.55})`
  }), __h("path", {
    d: path,
    fill: "#1a5024",
    opacity: "0.18",
    transform: `translate(1.5 2)`
  }), __h("line", {
    x1: 0,
    y1: 0,
    x2: 0,
    y2: -h,
    stroke: vein,
    strokeWidth: 0.9,
    opacity: 0.7
  }), veins.slice(1).map((v, i) => __h("line", {
    key: i,
    x1: 0,
    y1: 0,
    x2: v.x,
    y2: v.y,
    stroke: vein,
    strokeWidth: 0.5,
    opacity: 0.5
  })));
}

// 5-petal hibiscus bloom with central staminal column. Origin at flower center.
function HibiscusBloom({
  scale = 1
}) {
  const s = scale;
  return __h("g", null, [0, 72, 144, 216, 288].map(rot => __h("g", {
    key: rot,
    transform: `rotate(${rot})`
  }, __h("path", {
    d: `M 0 -2
                Q ${-12 * s} ${-14 * s} ${-14 * s} ${-26 * s}
                Q ${-12 * s} ${-32 * s} ${-6 * s}  ${-34 * s}
                Q  0         ${-36 * s} ${6 * s}  ${-34 * s}
                Q ${12 * s} ${-32 * s} ${14 * s} ${-26 * s}
                Q ${12 * s} ${-14 * s}  0         -2 Z`,
    fill: "#e63465"
  }), __h("path", {
    d: `M -3 -8
                Q ${-9 * s} ${-18 * s} ${-7 * s} ${-28 * s}
                Q 0 ${-30 * s} ${7 * s} ${-28 * s}
                Q ${9 * s} ${-18 * s} 3 -8 Z`,
    fill: "#f78aa6",
    opacity: "0.5"
  }), __h("path", {
    d: `M 0 0
                Q ${-3 * s} ${-6 * s} ${-4 * s} ${-12 * s}
                L ${4 * s} ${-12 * s}
                Q ${3 * s} ${-6 * s}  0 0 Z`,
    fill: "#9c1842",
    opacity: "0.55"
  }), __h("line", {
    x1: 0,
    y1: -2,
    x2: 0,
    y2: -34 * s,
    stroke: "#9c1842",
    strokeWidth: 0.55,
    opacity: 0.5
  }), __h("line", {
    x1: 0,
    y1: -2,
    x2: -7 * s,
    y2: -28 * s,
    stroke: "#9c1842",
    strokeWidth: 0.4,
    opacity: 0.4
  }), __h("line", {
    x1: 0,
    y1: -2,
    x2: 7 * s,
    y2: -28 * s,
    stroke: "#9c1842",
    strokeWidth: 0.4,
    opacity: 0.4
  }))), __h("circle", {
    r: 5 * s,
    fill: "#4a0820"
  }), __h("circle", {
    r: 3 * s,
    fill: "#2a0410"
  }), __h("line", {
    x1: 0,
    y1: 0,
    x2: 0,
    y2: -30 * s,
    stroke: "#c41e4a",
    strokeWidth: 1.6 * s,
    strokeLinecap: "round"
  }), [{
    dx: -2.4,
    dy: -22
  }, {
    dx: 2.2,
    dy: -25
  }, {
    dx: -1.6,
    dy: -27
  }, {
    dx: 2.8,
    dy: -29
  }, {
    dx: -2.0,
    dy: -31
  }].map((p, i) => __h("g", {
    key: i
  }, __h("line", {
    x1: 0,
    y1: p.dy * s + 4,
    x2: p.dx * s,
    y2: p.dy * s,
    stroke: "#c41e4a",
    strokeWidth: 0.7 * s
  }), __h("circle", {
    cx: p.dx * s,
    cy: p.dy * s,
    r: 1.4 * s,
    fill: "#fbe064"
  }), __h("circle", {
    cx: p.dx * s - 0.4,
    cy: p.dy * s - 0.4,
    r: 0.6 * s,
    fill: "#fff8c8"
  }))), __h("g", {
    transform: `translate(0 ${-33 * s})`
  }, [0, 72, 144, 216, 288].map(rot => __h("circle", {
    key: rot,
    r: 1.2 * s,
    cx: 0,
    cy: -1.5 * s,
    fill: "#c41e4a",
    transform: `rotate(${rot})`
  })), __h("circle", {
    r: 1.6 * s,
    fill: "#9c1842"
  })));
}
function Hibiscus({
  stage: stageProp = 0,
  frame,
  swell = false
}) {
  const {
    stage,
    extra
  } = resolveFrame(stageProp, frame);
  // bloom center at y=50 (stemH 246 + 4px offset).
  // Heavier growth 3→4 and 4→5.
  const stemH = [0, 22, 110, 165, 210, 235, 246][stage];
  const tipY = SOIL_Y - stemH;
  // # of leaves up the stem
  const leafCount = stage >= 4 ? 6 : stage >= 3 ? 4 : stage >= 2 ? 3 : 0;
  return __h(Plant, {
    swell: swell
  }, stage === 0 && __h("g", null, __h("ellipse", {
    cx: ANCHOR_X,
    cy: SOIL_Y - 2,
    rx: 3.2,
    ry: 2.2,
    fill: "#4a2810"
  }), __h("ellipse", {
    cx: ANCHOR_X - 0.6,
    cy: SOIL_Y - 2.6,
    rx: 1.2,
    ry: 0.6,
    fill: "#7a4a20",
    opacity: "0.65"
  }), __h("line", {
    x1: ANCHOR_X - 1.5,
    y1: SOIL_Y - 1.5,
    x2: ANCHOR_X + 1.5,
    y2: SOIL_Y - 1.5,
    stroke: "#1a0a04",
    strokeWidth: "0.4",
    opacity: "0.7"
  })), stage === 1 && __h("g", null, __h("path", {
    d: `M ${ANCHOR_X} ${SOIL_Y} Q ${ANCHOR_X + 3} ${SOIL_Y - 6} ${ANCHOR_X} ${SOIL_Y - 12}`,
    fill: "none",
    stroke: "#6c9444",
    strokeWidth: "1.6",
    strokeLinecap: "round"
  }), __h("ellipse", {
    cx: ANCHOR_X - 5,
    cy: SOIL_Y - 12,
    rx: 5,
    ry: 2.6,
    fill: "#84b864",
    transform: `rotate(-25 ${ANCHOR_X - 5} ${SOIL_Y - 12})`
  }), __h("ellipse", {
    cx: ANCHOR_X + 5,
    cy: SOIL_Y - 12,
    rx: 5,
    ry: 2.6,
    fill: "#84b864",
    transform: `rotate(25 ${ANCHOR_X + 5} ${SOIL_Y - 12})`
  }), __h("circle", {
    cx: ANCHOR_X,
    cy: SOIL_Y - 13,
    r: 1.1,
    fill: "#3a6428"
  }), __h("line", {
    x1: ANCHOR_X,
    y1: SOIL_Y,
    x2: ANCHOR_X - 3,
    y2: SOIL_Y + 4,
    stroke: "#7a5a3a",
    strokeWidth: "0.5",
    opacity: "0.55"
  }), __h("line", {
    x1: ANCHOR_X,
    y1: SOIL_Y,
    x2: ANCHOR_X + 4,
    y2: SOIL_Y + 5,
    stroke: "#7a5a3a",
    strokeWidth: "0.5",
    opacity: "0.55"
  })), stage >= 2 && __h(__Fragment, null, __h("path", {
    d: `M ${ANCHOR_X - 2} ${SOIL_Y} L ${ANCHOR_X - 1.5} ${tipY}
                    L ${ANCHOR_X + 1.5} ${tipY} L ${ANCHOR_X + 2} ${SOIL_Y} Z`,
    fill: "#4a3018"
  }), __h("line", {
    x1: ANCHOR_X - 1.2,
    y1: SOIL_Y,
    x2: ANCHOR_X - 0.8,
    y2: tipY,
    stroke: "#7a5430",
    strokeWidth: "0.6",
    opacity: "0.85"
  }), Array.from({
    length: Math.max(0, leafCount - 1)
  }).map((_, i) => __h("path", {
    key: i,
    d: `M ${ANCHOR_X - 2.2} ${SOIL_Y - 22 - i * 22}
                      L ${ANCHOR_X} ${SOIL_Y - 23 - i * 22}
                      L ${ANCHOR_X + 2.2} ${SOIL_Y - 22 - i * 22}`,
    fill: "none",
    stroke: "#2a1808",
    strokeWidth: "0.5",
    opacity: "0.7"
  })), Array.from({
    length: leafCount
  }).map((_, i) => {
    const y = SOIL_Y - 20 - i * 22;
    const left = i % 2 === 0;
    const size = stage >= 3 ? 1.1 : 0.85;
    return __h(HibiscusLeaf, {
      key: i,
      cx: ANCHOR_X + (left ? -2 : 2),
      cy: y,
      size: size,
      angle: left ? -78 : 78,
      color: "#2e7a36",
      vein: "#1a4220"
    });
  })), stage === 3 && __h("g", {
    transform: `translate(${ANCHOR_X - 2} ${tipY})`
  }, __h("path", {
    d: "M 0 8 Q -2 0 0 -4",
    fill: "none",
    stroke: "#3a8a3e",
    strokeWidth: "1.4"
  }), __h("g", {
    transform: "translate(0 -8)"
  }, [-30, -10, 10, 30].map((a, i) => __h("ellipse", {
    key: i,
    cx: Math.sin(a * Math.PI / 180) * 2,
    cy: 0,
    rx: 1.6,
    ry: 5,
    fill: "#3a7a32",
    stroke: "#2a5824",
    strokeWidth: "0.3",
    transform: `rotate(${a * 0.6})`
  })), __h("ellipse", {
    cx: 0,
    cy: -5,
    rx: 3.2,
    ry: 5.5,
    fill: "#4a8a3e"
  }), [-2, 0, 2].map(dx => __h("line", {
    key: dx,
    x1: dx,
    y1: -1,
    x2: dx * 0.6,
    y2: -9,
    stroke: "#2e6224",
    strokeWidth: "0.5",
    opacity: "0.7"
  })))), stage === 4 && __h("g", {
    transform: `translate(${ANCHOR_X - 2} ${tipY})`
  }, __h("path", {
    d: "M 0 10 Q -2 2 0 -3",
    fill: "none",
    stroke: "#3a8a3e",
    strokeWidth: "1.6"
  }), __h("g", {
    transform: "translate(0 -4)"
  }, [-50, -25, 0, 25, 50].map((a, i) => __h("path", {
    key: i,
    d: `M 0 0 Q ${Math.sin(a * Math.PI / 180) * 5} -4
                    ${Math.sin(a * Math.PI / 180) * 4} -10 Z`,
    fill: "#3a7a32",
    stroke: "#2a5824",
    strokeWidth: "0.3"
  })), __h("path", {
    d: `M -3.5 -2 Q -3.5 -14 0 -20 Q 3.5 -14 3.5 -2 Z`,
    fill: "#8eae3a"
  }), __h("path", {
    d: `M -2 -8  Q -2.4 -16 0 -20  Q 2.4 -16 2 -8 Z`,
    fill: "#c43a4a",
    opacity: "0.8"
  }), [-2, -1, 0, 1, 2].map(dx => __h("line", {
    key: dx,
    x1: dx,
    y1: -3,
    x2: dx * 0.4,
    y2: -19,
    stroke: "#9c1842",
    strokeWidth: "0.45",
    opacity: "0.55"
  })), __h("ellipse", {
    cx: 0,
    cy: -19,
    rx: 1.6,
    ry: 1.2,
    fill: "#e63465"
  }))), stage === 5 && __h("g", {
    transform: `translate(${ANCHOR_X - 2} ${tipY})`
  }, __h("path", {
    d: "M 0 12 Q -2 4 0 -2",
    fill: "none",
    stroke: "#3a8a3e",
    strokeWidth: "1.8"
  }), [{
    rot: -55,
    d: "M 0 0 Q -10 -2 -8 -10"
  }, {
    rot: -25,
    d: "M 0 0 Q -6  -4 -5 -12"
  }, {
    rot: 25,
    d: "M 0 0 Q  6  -4  5 -12"
  }, {
    rot: 55,
    d: "M 0 0 Q  10 -2  8 -10"
  }].map((s, i) => __h("path", {
    key: i,
    d: s.d,
    fill: "none",
    stroke: "#3a7a32",
    strokeWidth: "2.2",
    strokeLinecap: "round"
  })), __h("g", {
    transform: "translate(0 -8)"
  }, [0, 72, 144, 216, 288].map(rot => __h("path", {
    key: rot,
    d: `M 0 0 Q ${-6} ${-10} ${-4} ${-18} Q 0 ${-22} ${4} ${-18} Q ${6} ${-10} 0 0 Z`,
    fill: "#e63465",
    opacity: "0.95",
    transform: `rotate(${rot}) scale(0.85)`
  })), __h("circle", {
    r: 2,
    fill: "#4a0820"
  }), __h("line", {
    x1: 0,
    y1: 0,
    x2: 0,
    y2: -12,
    stroke: "#c41e4a",
    strokeWidth: "1"
  }), __h("circle", {
    cx: 0,
    cy: -13,
    r: 1.5,
    fill: "#fbe064"
  }))), stage === 6 && __h(__Fragment, null, __h(BloomFX, {
    accent: "#e63465",
    centerY: tipY - 4,
    radius: 68
  }), __h("g", {
    transform: `translate(${ANCHOR_X + 24} ${tipY + 38})`
  }, __h(HibiscusBloom, {
    scale: 0.7
  })), __h("g", {
    transform: `translate(${ANCHOR_X - 26} ${tipY + 62})`
  }, __h(HibiscusBloom, {
    scale: 0.55
  })), __h("g", {
    transform: `translate(${ANCHOR_X + 14} ${tipY + 86})`
  }, __h("path", {
    d: "M 0 8 Q -3 0 -2 -10 L 0 -12 L 2 -10 Q 3 0 0 8 Z",
    fill: "#3a8a3e"
  }), __h("path", {
    d: "M -1.6 -2 Q -1.6 -10 0 -12 Q 1.6 -10 1.6 -2 Z",
    fill: "#c43a4a",
    opacity: "0.7"
  }), __h("path", {
    d: "M -3 8 Q -1 -2 0 -2 Q 1 -2 3 8 Z",
    fill: "#2e6224"
  })), __h("g", {
    transform: `translate(${ANCHOR_X - 2} ${tipY - 4})`
  }, __h(HibiscusBloom, {
    scale: 1
  }))), extra === "crack" && __h(SeedCrackOverlay, null), extra === "leaves" && __h(FirstLeavesOverlay, null), extra === "grows" && __h(BudGrowsOverlay, {
    tipY: SOIL_Y - 165 - 8,
    tipX: ANCHOR_X - 2
  }), extra === "peek" && __h(ColorPeekOverlay, {
    tipY: SOIL_Y - 210 - 8,
    tipX: ANCHOR_X - 2,
    color: "#e63465"
  }));
}

// ════════════════════════════════════════════════════════════════════════
// CACTUS BLOSSOM · Echinopsis sp.
// Detailed: 6-rib barrel with shaded valleys, areoles bearing wool + many
// radial spines + central dark spine. Fuzzy scaly tubular bud emerges from
// the apical areole. Bloom is a large multi-ring funnel with prominent
// stamen crown.
// ════════════════════════════════════════════════════════════════════════

// ════════════════════════════════════════════════════════════════════════
// CACTUS BLOSSOM MORPH · 11-stage build · Echinopsis
// Barrel body grows continuously; areoles fade in; tubular bud emerges
// from apex and erupts into multi-ring funnel bloom.
// ════════════════════════════════════════════════════════════════════════

function CactusBlossomMorph({
  stage = 0,
  swell = false
}) {
  const s = Math.max(0, Math.min(10, stage | 0));
  const tr = "all 0.8s cubic-bezier(.22,1,.36,1)";
  const cactusH = [0, 0, 14, 25, 55, 90, 130, 175, 210, 220, 230][s];
  const cactusW = [0, 0, 8, 14, 22, 32, 42, 48, 50, 50, 50][s];
  const cactusOp = s >= 2 ? 1 : 0;
  const seedOp = s === 0 ? 1 : s === 1 ? 0.5 : 0;
  const rootDepth = [0, 8, 14, 18, 22, 25, 28, 30, 30, 30, 30][s];
  const top = SOIL_Y - cactusH;
  const halfW = cactusW / 2;

  // Areoles spawn along ribs at higher frames
  const areolePositions = [];
  if (cactusH > 0 && cactusW > 0) {
    const rowCount = Math.max(1, Math.floor(cactusH / 16));
    for (let r = 0; r < rowCount; r++) {
      const yT = (r + 0.6) / rowCount;
      const y = top + cactusH * yT;
      if (yT < 0.12 && s >= 6) continue;
      for (let i = 0; i < 5; i++) {
        const ribT = i / 4;
        const bend = Math.sin(yT * Math.PI) * 0.95;
        const x = ANCHOR_X - halfW + cactusW * ribT * (0.5 + bend * 0.5) + cactusW * (1 - bend) * 0.25;
        areolePositions.push({
          x,
          y,
          rib: i
        });
      }
    }
  }

  // Bud and bloom states
  const budScale = s === 10 ? 0 : [0, 0, 0, 0, 0, 0, 0.6, 0.9, 1.1, 1.3, 0][s];
  const budOp = s >= 6 && s < 10 ? 1 : 0;
  const budOpenness = s === 7 ? 0.2 : s === 8 ? 0.5 : s === 9 ? 0.7 : 0;
  const budColorHint = s >= 7;
  const bloomScale = s === 10 ? 1.55 : 0;
  const bloomOp = s === 10 ? 1 : 0;

  // Cactus body — render with continuous scale
  const bodyD = `M ${ANCHOR_X - halfW} ${SOIL_Y - 2}
                 Q ${ANCHOR_X - halfW * 1.1} ${(SOIL_Y + top) / 2}
                   ${ANCHOR_X - halfW * 0.65} ${top + 6}
                 Q ${ANCHOR_X - halfW * 0.45} ${top - 2}
                   ${ANCHOR_X} ${top - 2}
                 Q ${ANCHOR_X + halfW * 0.45} ${top - 2}
                   ${ANCHOR_X + halfW * 0.65} ${top + 6}
                 Q ${ANCHOR_X + halfW * 1.1} ${(SOIL_Y + top) / 2}
                   ${ANCHOR_X + halfW} ${SOIL_Y - 2} Z`;
  return __h(Plant, {
    swell: swell
  }, __h("line", {
    x1: ANCHOR_X,
    y1: SOIL_Y,
    x2: ANCHOR_X,
    y2: SOIL_Y + 1,
    stroke: "#7a5a3a",
    strokeWidth: "1.3",
    strokeLinecap: "round",
    vectorEffect: "non-scaling-stroke",
    style: {
      transformOrigin: `${ANCHOR_X}px ${SOIL_Y}px`,
      transform: `scaleY(${rootDepth})`,
      opacity: 0.78,
      transition: tr
    }
  }), Array.from({
    length: 8
  }).map((_, i) => {
    const side = i % 2 === 0 ? -1 : 1;
    const t = (i + 1) / 9;
    const startY = SOIL_Y + 2 + t * 22;
    const startX = ANCHOR_X + side * 0.4;
    const endX = ANCHOR_X + side * (4 + i % 3 * 2);
    const endY = startY + 2 + i % 3;
    const visible = s >= Math.max(1, Math.floor(i / 2));
    return __h("line", {
      key: `r${i}`,
      x1: startX,
      y1: startY,
      x2: visible ? endX : startX,
      y2: visible ? endY : startY,
      stroke: "#7a5a3a",
      strokeWidth: 0.45 + i % 2 * 0.2,
      strokeLinecap: "round",
      opacity: "0.7",
      style: {
        transition: tr
      }
    });
  }), __h("circle", {
    cx: ANCHOR_X,
    cy: SOIL_Y - 2,
    r: 1.8,
    fill: "#2a1408",
    style: {
      opacity: seedOp,
      transition: tr
    }
  }), __h("circle", {
    cx: ANCHOR_X - 6,
    cy: SOIL_Y + 0.5,
    r: 0.7,
    fill: "#d6a060",
    opacity: "0.7",
    style: {
      opacity: seedOp * 0.7,
      transition: tr
    }
  }), __h("circle", {
    cx: ANCHOR_X + 5,
    cy: SOIL_Y + 1.5,
    r: 0.6,
    fill: "#d6a060",
    opacity: "0.7",
    style: {
      opacity: seedOp * 0.7,
      transition: tr
    }
  }), cactusH > 0 && __h("g", {
    style: {
      opacity: cactusOp,
      transition: tr
    }
  }, __h("path", {
    d: bodyD,
    fill: "#4a8a3e"
  }), Array.from({
    length: 4
  }).map((_, i) => {
    const t = (i + 1) / 5;
    const x = ANCHOR_X - halfW + cactusW * t;
    return __h("path", {
      key: `v${i}`,
      d: `M ${x} ${SOIL_Y - 2}
                    Q ${x + (t - 0.5) * 1.5} ${(SOIL_Y + top) / 2}
                      ${x + (t - 0.5) * 3} ${top + 4}`,
      fill: "none",
      stroke: "#3a6a2c",
      strokeWidth: "2",
      opacity: "0.7"
    });
  }), areolePositions.map((p, i) => __h("g", {
    key: `a${i}`
  }, __h("circle", {
    cx: p.x,
    cy: p.y,
    r: "1.2",
    fill: "#fff8e4",
    opacity: "0.95"
  }), Array.from({
    length: 6
  }).map((_, j) => {
    const a = j / 6 * Math.PI * 2 - Math.PI / 2 + 0.2;
    return __h("line", {
      key: j,
      x1: p.x,
      y1: p.y,
      x2: p.x + Math.cos(a) * 4,
      y2: p.y + Math.sin(a) * 4,
      stroke: "#dac88a",
      strokeWidth: "0.55"
    });
  })))), __h("g", {
    style: {
      transform: `translate(${ANCHOR_X}px, ${top + 2}px)`,
      transformOrigin: "0 0",
      transition: "none"
    }
  }, __h("g", {
    style: {
      transform: `scale(${budScale})`,
      transformOrigin: "0 0",
      opacity: budOp,
      transition: tr
    }
  }, __h("ellipse", {
    cx: 0,
    cy: -1,
    rx: 6,
    ry: 2.5,
    fill: "#fff8e4",
    opacity: "0.7"
  }), __h("path", {
    d: "M -3 4 Q -5 -4 -4 -10 Q 0 -14 4 -10 Q 5 -4 3 4 Z",
    fill: "#5aa044"
  }), __h("path", {
    d: "M -2 -4 Q -2 -10 0 -12 Q 2 -10 2 -4 Z",
    fill: "#f4a0c0",
    style: {
      opacity: budColorHint ? 0.85 : 0,
      transition: tr
    }
  }))), __h("g", {
    style: {
      transform: `translate(${ANCHOR_X}px, ${top - 4}px)`,
      transformOrigin: "0 0",
      transition: "none"
    }
  }, __h("g", {
    style: {
      transform: `translate(-14px, 4px) scale(${bloomScale * 0.7}) rotate(-12deg)`,
      transformOrigin: "0 0",
      opacity: bloomOp,
      transition: tr
    }
  }, __h("path", {
    d: "M -4 4 Q -5 -1 -3 -10 L 3 -10 Q 5 -1 4 4 Z",
    fill: "#6a9444"
  }), __h("g", {
    transform: "translate(0 -12)"
  }, Array.from({
    length: 10
  }).map((_, i) => {
    const rot = i / 10 * 360;
    return __h("g", {
      key: `lp${i}`,
      transform: `rotate(${rot})`
    }, __h("path", {
      d: "M 0 -2 Q -7 -10 -8 -22 Q -5 -28 -2 -28 Q 0 -30 2 -28 Q 5 -28 8 -22 Q 7 -10 0 -2 Z",
      fill: "#f06ba0"
    }), __h("path", {
      d: "M -2 -6 Q -5 -14 -4 -22 Q 0 -26 4 -22 Q 5 -14 2 -6 Z",
      fill: "#f8b0c8",
      opacity: "0.6"
    }));
  }), __h("circle", {
    r: "5",
    fill: "#fff8e4"
  }), Array.from({
    length: 18
  }).map((_, i) => __h("circle", {
    key: i,
    cx: "0",
    cy: "-5.5",
    r: "0.7",
    fill: "#fbe064",
    transform: `rotate(${i / 18 * 360})`
  })), __h("circle", {
    r: "1.2",
    fill: "#9c5a2a"
  }))), __h("g", {
    style: {
      transform: `translate(14px, 4px) scale(${bloomScale * 0.7}) rotate(12deg)`,
      transformOrigin: "0 0",
      opacity: bloomOp,
      transition: tr
    }
  }, __h("path", {
    d: "M -4 4 Q -5 -1 -3 -10 L 3 -10 Q 5 -1 4 4 Z",
    fill: "#6a9444"
  }), __h("g", {
    transform: "translate(0 -12)"
  }, Array.from({
    length: 10
  }).map((_, i) => {
    const rot = i / 10 * 360;
    return __h("g", {
      key: `rp${i}`,
      transform: `rotate(${rot})`
    }, __h("path", {
      d: "M 0 -2 Q -7 -10 -8 -22 Q -5 -28 -2 -28 Q 0 -30 2 -28 Q 5 -28 8 -22 Q 7 -10 0 -2 Z",
      fill: "#f06ba0"
    }), __h("path", {
      d: "M -2 -6 Q -5 -14 -4 -22 Q 0 -26 4 -22 Q 5 -14 2 -6 Z",
      fill: "#f8b0c8",
      opacity: "0.6"
    }));
  }), __h("circle", {
    r: "5",
    fill: "#fff8e4"
  }), Array.from({
    length: 18
  }).map((_, i) => __h("circle", {
    key: i,
    cx: "0",
    cy: "-5.5",
    r: "0.7",
    fill: "#fbe064",
    transform: `rotate(${i / 18 * 360})`
  })), __h("circle", {
    r: "1.2",
    fill: "#9c5a2a"
  }))), __h("g", {
    style: {
      transform: `scale(${bloomScale * 1.15})`,
      transformOrigin: "0 0",
      opacity: bloomOp,
      transition: tr
    }
  }, __h("path", {
    d: "M -5 4 Q -7 -2 -4 -12 L 4 -12 Q 7 -2 5 4 Z",
    fill: "#6a9444"
  }), __h("g", {
    transform: "translate(0 -16)"
  }, Array.from({
    length: 10
  }).map((_, i) => {
    const rot = i / 10 * 360;
    return __h("g", {
      key: `p${i}`,
      transform: `rotate(${rot})`
    }, __h("path", {
      d: "M 0 -2 Q -7 -10 -8 -22 Q -5 -28 -2 -28 Q 0 -30 2 -28 Q 5 -28 8 -22 Q 7 -10 0 -2 Z",
      fill: "#f06ba0"
    }), __h("path", {
      d: "M -2 -6 Q -5 -14 -4 -22 Q 0 -26 4 -22 Q 5 -14 2 -6 Z",
      fill: "#f8b0c8",
      opacity: "0.6"
    }));
  }), Array.from({
    length: 10
  }).map((_, i) => {
    const rot = i / 10 * 360 + 18;
    return __h("path", {
      key: `ip${i}`,
      d: "M 0 -2 Q -5 -10 -5 -19 Q 0 -22 5 -19 Q 5 -10 0 -2 Z",
      fill: "#f8b0c8",
      opacity: "0.92",
      transform: `rotate(${rot})`
    });
  }), __h("circle", {
    r: "6",
    fill: "#fff8e4"
  }), Array.from({
    length: 24
  }).map((_, i) => {
    const rot = i / 24 * 360;
    return __h("g", {
      key: `st${i}`,
      transform: `rotate(${rot})`
    }, __h("line", {
      x1: 0,
      y1: -1,
      x2: 0,
      y2: -6,
      stroke: "#e8a040",
      strokeWidth: "0.65"
    }), __h("circle", {
      cx: 0,
      cy: -6.5,
      r: "0.85",
      fill: "#fbe064"
    }));
  }), __h("circle", {
    r: "1.4",
    cx: 0,
    cy: -8.5,
    fill: "#7a3a18"
  })))), __h("g", {
    style: {
      opacity: bloomOp,
      transition: tr
    }
  }, __h(BloomFX, {
    accent: "#f06ba0",
    centerY: top - 18,
    radius: 80
  }), __h(BloomFX, {
    accent: "#fff8c8",
    centerY: top - 18,
    radius: 45
  })));
}

// A single areole: small woolly disc with radial spines + dark central spine.
function Areole({
  cx,
  cy,
  spines = 6,
  spineLen = 4,
  wool = "#fff8e4",
  spineColor = "#dac88a",
  centralColor = "#3a2010"
}) {
  const items = [];
  for (let i = 0; i < spines; i++) {
    const a = i / spines * Math.PI * 2 - Math.PI / 2 + 0.2;
    const x2 = Math.cos(a) * spineLen;
    const y2 = Math.sin(a) * spineLen;
    items.push(__h("line", {
      key: i,
      x1: cx,
      y1: cy,
      x2: cx + x2,
      y2: cy + y2,
      stroke: spineColor,
      strokeWidth: "0.55"
    }));
  }
  return __h("g", null, __h("circle", {
    cx: cx,
    cy: cy,
    r: "1.2",
    fill: wool,
    opacity: "0.95"
  }), __h("circle", {
    cx: cx + 0.3,
    cy: cy - 0.3,
    r: "0.4",
    fill: "#fff",
    opacity: "0.7"
  }), items, __h("line", {
    x1: cx,
    y1: cy,
    x2: cx + 0.6,
    y2: cy - spineLen * 1.1,
    stroke: centralColor,
    strokeWidth: "0.7"
  }));
}

// Cactus body shape — fat barrel with ribs. height in pixels, width in pixels.
function CactusBody({
  height = 100,
  width = 40
}) {
  const top = SOIL_Y - height;
  const ribs = 5;
  const halfW = width / 2;
  // Build a smooth oval-ish body
  return __h("g", null, __h("path", {
    d: `M ${ANCHOR_X - halfW} ${SOIL_Y - 2}
            Q ${ANCHOR_X - halfW * 1.1} ${(SOIL_Y + top) / 2} 
              ${ANCHOR_X - halfW * 0.65} ${top + 6}
            Q ${ANCHOR_X - halfW * 0.45} ${top - 2}
              ${ANCHOR_X} ${top - 2}
            Q ${ANCHOR_X + halfW * 0.45} ${top - 2}
              ${ANCHOR_X + halfW * 0.65} ${top + 6}
            Q ${ANCHOR_X + halfW * 1.1} ${(SOIL_Y + top) / 2}
              ${ANCHOR_X + halfW} ${SOIL_Y - 2} Z`,
    fill: "#4a8a3e"
  }), Array.from({
    length: ribs - 1
  }).map((_, i) => {
    const t = (i + 1) / ribs;
    const x = ANCHOR_X - halfW + width * t;
    return __h("path", {
      key: i,
      d: `M ${x} ${SOIL_Y - 2}
                Q ${x + (t - 0.5) * 1.5} ${(SOIL_Y + top) / 2}
                  ${x + (t - 0.5) * 3} ${top + 4}`,
      fill: "none",
      stroke: "#3a6a2c",
      strokeWidth: "2",
      opacity: "0.7"
    });
  }), __h("path", {
    d: `M ${ANCHOR_X + halfW * 0.7} ${SOIL_Y - 4}
            Q ${ANCHOR_X + halfW * 0.95} ${(SOIL_Y + top) / 2}
              ${ANCHOR_X + halfW * 0.55} ${top + 6} L
            ${ANCHOR_X + halfW * 0.65} ${top + 6}
            Q ${ANCHOR_X + halfW * 1.1} ${(SOIL_Y + top) / 2}
              ${ANCHOR_X + halfW} ${SOIL_Y - 2} L
            ${ANCHOR_X + halfW * 0.85} ${SOIL_Y - 2} Z`,
    fill: "#2e5c24",
    opacity: "0.5"
  }), __h("path", {
    d: `M ${ANCHOR_X - halfW * 0.85} ${SOIL_Y - 4}
            Q ${ANCHOR_X - halfW * 1.0} ${(SOIL_Y + top) / 2}
              ${ANCHOR_X - halfW * 0.6} ${top + 8}`,
    fill: "none",
    stroke: "#7cc068",
    strokeWidth: "1.6",
    opacity: "0.6"
  }));
}

// Tubular hairy/scaly bud (the elongating cactus bud)
function CactusBud({
  length = 12,
  openness = 0,
  colorHint = false
}) {
  const w = 5 + openness * 2;
  const colorTip = openness > 0.4 ? "#f4a0c0" : colorHint ? "#bcd470" : "#5aa044";
  return __h("g", null, __h("path", {
    d: `M ${-w * 0.4} 4
            Q ${-w} -4 ${-w * 0.85} ${-length * 0.5}
            Q ${-w * 0.6} ${-length} 0 ${-length}
            Q ${w * 0.6} ${-length} ${w * 0.85} ${-length * 0.5}
            Q ${w} -4 ${w * 0.4} 4 Z`,
    fill: "#5aa044"
  }), colorHint && __h("path", {
    d: `M ${-w * 0.55} ${-length * 0.4}
              Q ${-w * 0.5} ${-length * 0.85} 0 ${-length}
              Q ${w * 0.5} ${-length * 0.85} ${w * 0.55} ${-length * 0.4} Z`,
    fill: colorTip,
    opacity: "0.92"
  }), Array.from({
    length: 5
  }).map((_, i) => {
    const t = (i + 0.5) / 5;
    const y = -length * t;
    return __h("g", {
      key: i
    }, __h("path", {
      d: `M ${-w * 0.7} ${y} l 2 ${-1.5} l 1 ${1.5} z`,
      fill: "#3e6a32",
      opacity: "0.85"
    }), __h("path", {
      d: `M ${w * 0.7} ${y} l -2 ${-1.5} l -1 ${1.5} z`,
      fill: "#3e6a32",
      opacity: "0.85"
    }));
  }), Array.from({
    length: 5
  }).map((_, i) => {
    const t = (i + 0.5) / 5;
    const y = -length * t;
    return __h("g", {
      key: `w${i}`
    }, __h("circle", {
      cx: -w * 0.6,
      cy: y - 0.6,
      r: 0.6,
      fill: "#fff8e4",
      opacity: "0.9"
    }), __h("circle", {
      cx: w * 0.6,
      cy: y - 0.6,
      r: 0.6,
      fill: "#fff8e4",
      opacity: "0.9"
    }), __h("line", {
      x1: -w * 0.7,
      y1: y - 0.8,
      x2: -w * 0.85,
      y2: y - 2.3,
      stroke: "#fff8e4",
      strokeWidth: "0.4",
      opacity: "0.85"
    }), __h("line", {
      x1: w * 0.7,
      y1: y - 0.8,
      x2: w * 0.85,
      y2: y - 2.3,
      stroke: "#fff8e4",
      strokeWidth: "0.4",
      opacity: "0.85"
    }));
  }));
}
function CactusBlossom({
  stage: stageProp = 0,
  swell = false,
  frame
}) {
  const {
    stage,
    extra
  } = resolveFrame(stageProp, frame);
  // bloom center at y=50 (cactusH 230 + 20px receptacle/translate stack).
  // Heavier growth 3→4 and 4→5.
  const cactusH = [0, 14, 110, 155, 195, 220, 230][stage];
  const cactusW = stage >= 2 ? 50 : stage >= 1 ? 14 : 0;
  const top = SOIL_Y - cactusH;
  // small pup cactus at base in later stages
  const showPup = stage >= 4;

  // areole positions — distributed along 5 ribs
  const ribCount = 5;
  const rowCount = Math.max(0, Math.floor(cactusH / 16));
  const areolePositions = [];
  for (let r = 0; r < rowCount; r++) {
    const yT = (r + 0.6) / rowCount;
    const y = top + cactusH * yT;
    // skip top-most row to leave space for apical bud
    if (yT < 0.12 && stage >= 3) continue;
    for (let i = 0; i < ribCount; i++) {
      const ribT = i / (ribCount - 1);
      // x position curves with the body silhouette
      const bend = Math.sin(yT * Math.PI) * 0.95;
      const x = ANCHOR_X - cactusW / 2 + cactusW * ribT * (0.5 + bend * 0.5) + cactusW * (1 - bend) * 0.25;
      areolePositions.push({
        x,
        y,
        rib: i
      });
    }
  }
  return __h(Plant, {
    swell: swell
  }, stage === 0 && __h("g", null, __h("circle", {
    cx: ANCHOR_X,
    cy: SOIL_Y - 2,
    r: 1.8,
    fill: "#2a1408"
  }), __h("circle", {
    cx: ANCHOR_X - 0.4,
    cy: SOIL_Y - 2.4,
    r: 0.5,
    fill: "#6a3a18",
    opacity: "0.7"
  }), __h("circle", {
    cx: ANCHOR_X - 6,
    cy: SOIL_Y + 0.5,
    r: 0.7,
    fill: "#d6a060",
    opacity: "0.7"
  }), __h("circle", {
    cx: ANCHOR_X + 5,
    cy: SOIL_Y + 1.5,
    r: 0.6,
    fill: "#d6a060",
    opacity: "0.7"
  }), __h("circle", {
    cx: ANCHOR_X + 8,
    cy: SOIL_Y - 0.5,
    r: 0.5,
    fill: "#b88040",
    opacity: "0.7"
  })), stage === 1 && __h("g", null, __h("ellipse", {
    cx: ANCHOR_X,
    cy: SOIL_Y - 4,
    rx: 6,
    ry: 4.5,
    fill: "#5aa044"
  }), __h("ellipse", {
    cx: ANCHOR_X + 2.5,
    cy: SOIL_Y - 3,
    rx: 1.8,
    ry: 3,
    fill: "#3a7430",
    opacity: "0.6"
  }), __h(Areole, {
    cx: ANCHOR_X,
    cy: SOIL_Y - 8,
    spines: 5,
    spineLen: 2.6
  }), __h(Areole, {
    cx: ANCHOR_X - 3.5,
    cy: SOIL_Y - 5,
    spines: 4,
    spineLen: 2
  }), __h(Areole, {
    cx: ANCHOR_X + 3.5,
    cy: SOIL_Y - 5,
    spines: 4,
    spineLen: 2
  })), stage >= 2 && __h(__Fragment, null, showPup &&
  // small "pup" cactus offshoot beside the main body
  __h("g", null, __h("ellipse", {
    cx: ANCHOR_X - cactusW / 2 - 6,
    cy: SOIL_Y - 8,
    rx: 6,
    ry: 9,
    fill: "#4a8a3e"
  }), __h(Areole, {
    cx: ANCHOR_X - cactusW / 2 - 6,
    cy: SOIL_Y - 14,
    spines: 5,
    spineLen: 2.8
  }), __h(Areole, {
    cx: ANCHOR_X - cactusW / 2 - 9,
    cy: SOIL_Y - 8,
    spines: 4,
    spineLen: 2.2
  }), __h(Areole, {
    cx: ANCHOR_X - cactusW / 2 - 4,
    cy: SOIL_Y - 6,
    spines: 4,
    spineLen: 2.2
  })), __h(CactusBody, {
    height: cactusH,
    width: cactusW
  }), areolePositions.map((p, i) => __h(Areole, {
    key: i,
    cx: p.x,
    cy: p.y,
    spines: 6 + (p.rib % 2 ? 1 : 0),
    spineLen: 5
  }))), stage === 3 && __h("g", {
    transform: `translate(${ANCHOR_X} ${top + 2})`
  }, __h("ellipse", {
    cx: 0,
    cy: -1,
    rx: 5,
    ry: 2,
    fill: "#fff8e4",
    opacity: "0.85"
  }), __h(CactusBud, {
    length: 9,
    openness: 0
  })), stage === 4 && __h("g", {
    transform: `translate(${ANCHOR_X} ${top})`
  }, __h("ellipse", {
    cx: 0,
    cy: -1,
    rx: 6,
    ry: 2.5,
    fill: "#fff8e4",
    opacity: "0.7"
  }), __h(CactusBud, {
    length: 20,
    openness: 0.3,
    colorHint: true
  })), stage === 5 && __h("g", {
    transform: `translate(${ANCHOR_X} ${top})`
  }, __h(CactusBud, {
    length: 26,
    openness: 0.7,
    colorHint: true
  }), __h("path", {
    d: "M -5 -10 Q -10 -14 -10 -22",
    fill: "none",
    stroke: "#4a8a3e",
    strokeWidth: "1.6",
    strokeLinecap: "round"
  }), __h("path", {
    d: "M  5 -10 Q  10 -14  10 -22",
    fill: "none",
    stroke: "#4a8a3e",
    strokeWidth: "1.6",
    strokeLinecap: "round"
  }), __h("path", {
    d: "M -3 -28 Q 0 -32 3 -28 L 2 -25 L -2 -25 Z",
    fill: "#f06ba0"
  })), stage === 6 && __h(__Fragment, null, __h(BloomFX, {
    accent: "#f06ba0",
    centerY: top - 18,
    radius: 70
  }), __h("g", {
    transform: `translate(${ANCHOR_X - cactusW / 2 - 6} ${SOIL_Y - 20})`
  }, __h("path", {
    d: "M -2.5 2 Q -3 -1 -2 -6 L 2 -6 Q 3 -1 2.5 2 Z",
    fill: "#6a9444"
  }), __h("g", {
    transform: "translate(0 -8)"
  }, Array.from({
    length: 8
  }).map((_, i) => {
    const rot = i / 8 * 360;
    return __h("ellipse", {
      key: i,
      cx: 0,
      cy: -9,
      rx: 3.5,
      ry: 9,
      fill: "#f06ba0",
      opacity: "0.92",
      transform: `rotate(${rot})`
    });
  }), Array.from({
    length: 8
  }).map((_, i) => {
    const rot = i / 8 * 360 + 22;
    return __h("ellipse", {
      key: `i${i}`,
      cx: 0,
      cy: -6,
      rx: 2.4,
      ry: 6,
      fill: "#f8b0c8",
      opacity: "0.85",
      transform: `rotate(${rot})`
    });
  }), __h("circle", {
    r: "3",
    fill: "#fff8e4"
  }), Array.from({
    length: 8
  }).map((_, i) => {
    const rot = i / 8 * 360;
    return __h("circle", {
      key: `s${i}`,
      cx: 0,
      cy: -3.5,
      r: 0.7,
      fill: "#fbe064",
      transform: `rotate(${rot})`
    });
  }), __h("circle", {
    r: "1",
    fill: "#9c5a2a"
  }))), __h("g", {
    transform: `translate(${ANCHOR_X} ${top - 4})`
  }, __h("path", {
    d: "M -5 4 Q -7 -2 -4 -12 L 4 -12 Q 7 -2 5 4 Z",
    fill: "#6a9444"
  }), [-4, 0, 4].map(dx => __h("line", {
    key: dx,
    x1: dx,
    y1: -12,
    x2: dx * 0.6,
    y2: 2,
    stroke: "#3e6a32",
    strokeWidth: "0.4",
    opacity: "0.7"
  })), __h("circle", {
    cx: -3,
    cy: -8,
    r: 0.7,
    fill: "#fff8e4",
    opacity: "0.85"
  }), __h("circle", {
    cx: 3,
    cy: -8,
    r: 0.7,
    fill: "#fff8e4",
    opacity: "0.85"
  }), __h("circle", {
    cx: -2,
    cy: -2,
    r: 0.7,
    fill: "#fff8e4",
    opacity: "0.85"
  }), __h("circle", {
    cx: 2,
    cy: -2,
    r: 0.7,
    fill: "#fff8e4",
    opacity: "0.85"
  }), __h("g", {
    transform: "translate(0 -16)"
  }, Array.from({
    length: 10
  }).map((_, i) => {
    const rot = i / 10 * 360;
    return __h("g", {
      key: `o${i}`,
      transform: `rotate(${rot})`
    }, __h("path", {
      d: `M 0 -2
                          Q -7 -10 -8 -22
                          Q -5 -28 -2 -28
                          Q 0 -30 2 -28
                          Q 5 -28 8 -22
                          Q 7 -10 0 -2 Z`,
      fill: "#f06ba0"
    }), __h("path", {
      d: `M -2 -6 Q -5 -14 -4 -22 Q 0 -26 4 -22 Q 5 -14 2 -6 Z`,
      fill: "#f8b0c8",
      opacity: "0.6"
    }), __h("line", {
      x1: 0,
      y1: -4,
      x2: 0,
      y2: -28,
      stroke: "#c43868",
      strokeWidth: "0.4",
      opacity: "0.5"
    }));
  }), Array.from({
    length: 10
  }).map((_, i) => {
    const rot = i / 10 * 360 + 18;
    return __h("path", {
      key: `i${i}`,
      d: `M 0 -2
                        Q -5 -10 -5 -19
                        Q 0 -22 5 -19
                        Q 5 -10 0 -2 Z`,
      fill: "#f8b0c8",
      opacity: "0.92",
      transform: `rotate(${rot})`
    });
  }), __h("circle", {
    r: "6",
    fill: "#fff8e4"
  }), Array.from({
    length: 24
  }).map((_, i) => {
    const rot = i / 24 * 360;
    return __h("g", {
      key: `s${i}`,
      transform: `rotate(${rot})`
    }, __h("line", {
      x1: 0,
      y1: -1,
      x2: 0,
      y2: -6,
      stroke: "#e8a040",
      strokeWidth: "0.65"
    }), __h("circle", {
      cx: 0,
      cy: -6.5,
      r: 0.85,
      fill: "#fbe064"
    }));
  }), __h("line", {
    x1: 0,
    y1: 0,
    x2: 0,
    y2: -8,
    stroke: "#9c5a2a",
    strokeWidth: "0.9"
  }), [0, 45, 90, 135, 180, 225, 270, 315].map(rot => __h("ellipse", {
    key: rot,
    cx: 0,
    cy: -9,
    rx: 0.5,
    ry: 1.2,
    fill: "#c4783a",
    transform: `rotate(${rot})`
  })), __h("circle", {
    r: 1.4,
    cx: 0,
    cy: -8.5,
    fill: "#7a3a18"
  })))));
}

// ════════════════════════════════════════════════════════════════════════
// ORCHID · Phalaenopsis (Moth Orchid)
// Detailed: fan of thick leathery basal leaves with parallel veins +
// aerial roots (epiphyte signature). Arching raceme with multiple flowers,
// each with 3 sepals + 2 large lateral petals + elaborate labellum (lip)
// + central column. Distinctive bracts at each flower node.
// ════════════════════════════════════════════════════════════════════════

// ════════════════════════════════════════════════════════════════════════
// ORCHID MORPH · 11-stage build · Phalaenopsis
// Protocorm → fan of fleshy leaves → arching spike → moth-orchid flowers
// erupting along the spike.
// ════════════════════════════════════════════════════════════════════════

function OrchidMorph({
  stage = 0,
  swell = false
}) {
  const s = Math.max(0, Math.min(10, stage | 0));
  const tr = "all 0.8s cubic-bezier(.22,1,.36,1)";

  // Spike rises from leaf rosette base.
  const spikeBaseY = SOIL_Y - 18;
  const spikeH = [0, 0, 0, 0, 8, 25, 65, 115, 170, 220, 252][s];
  const spikeOp = s >= 6 ? 1 : 0;
  const seedOp = s === 0 ? 1 : s === 1 ? 0.4 : 0;
  const rootDepth = [0, 6, 12, 16, 20, 22, 22, 22, 22, 22, 22][s];

  // Aerial roots (orchids are epiphytes — show roots from frame 2)
  const aerialOp = s >= 2 ? 1 : 0;

  // Leaf fan — 6 leaves spawning at varying frames
  const leaves = [{
    a: -65,
    len: 50,
    spawnAt: 2
  }, {
    a: -35,
    len: 52,
    spawnAt: 3
  }, {
    a: -10,
    len: 56,
    spawnAt: 3
  }, {
    a: 15,
    len: 56,
    spawnAt: 4
  }, {
    a: 40,
    len: 52,
    spawnAt: 4
  }, {
    a: 65,
    len: 50,
    spawnAt: 5
  }];

  // Flower slots along the spike — 7 flowers for fullness
  const flowerSlots = [{
    t: 0.12,
    side: 8,
    spawnAt: 6
  }, {
    t: 0.28,
    side: -8,
    spawnAt: 7
  }, {
    t: 0.44,
    side: 9,
    spawnAt: 7
  }, {
    t: 0.60,
    side: -9,
    spawnAt: 8
  }, {
    t: 0.74,
    side: 9,
    spawnAt: 9
  }, {
    t: 0.86,
    side: -7,
    spawnAt: 9
  }, {
    t: 0.96,
    side: 6,
    spawnAt: 10
  }];

  // Secondary spike with its own flowers (for additional fullness at bloom)
  const secSlots = [{
    t: 0.35,
    side: -6,
    spawnAt: 9
  }, {
    t: 0.60,
    side: 6,
    spawnAt: 10
  }, {
    t: 0.85,
    side: -5,
    spawnAt: 10
  }];
  const bloomOp = s === 10 ? 1 : 0;
  // For pre-bloom buds along spike (frames 8-9)
  const budStateForFlower = flowerSpawnAt => {
    if (s < flowerSpawnAt) return {
      scale: 0,
      openness: 0
    };
    if (s === 10) return {
      scale: 1,
      openness: 1
    };
    if (s === flowerSpawnAt) return {
      scale: 0.8,
      openness: 0
    };
    return {
      scale: 1,
      openness: 0.5
    };
  };
  return __h(Plant, {
    swell: swell
  }, __h("line", {
    x1: ANCHOR_X,
    y1: SOIL_Y,
    x2: ANCHOR_X,
    y2: SOIL_Y + 1,
    stroke: "#7a5a3a",
    strokeWidth: "1.2",
    strokeLinecap: "round",
    vectorEffect: "non-scaling-stroke",
    style: {
      transformOrigin: `${ANCHOR_X}px ${SOIL_Y}px`,
      transform: `scaleY(${rootDepth})`,
      opacity: 0.7,
      transition: tr
    }
  }), __h("g", {
    style: {
      opacity: aerialOp,
      transition: tr
    }
  }, __h("path", {
    d: `M ${ANCHOR_X - 4} ${SOIL_Y - 6} Q ${ANCHOR_X - 12} ${SOIL_Y - 2} ${ANCHOR_X - 18} ${SOIL_Y + 6}`,
    fill: "none",
    stroke: "#a8c0a0",
    strokeWidth: "2.6",
    strokeLinecap: "round"
  }), __h("path", {
    d: `M ${ANCHOR_X + 5} ${SOIL_Y - 8} Q ${ANCHOR_X + 11} ${SOIL_Y - 3} ${ANCHOR_X + 16} ${SOIL_Y + 4}`,
    fill: "none",
    stroke: "#a8c0a0",
    strokeWidth: "2.4",
    strokeLinecap: "round"
  }), __h("path", {
    d: `M ${ANCHOR_X - 8} ${SOIL_Y - 10} Q ${ANCHOR_X - 18} ${SOIL_Y - 4} ${ANCHOR_X - 24} ${SOIL_Y + 12}`,
    fill: "none",
    stroke: "#a8c0a0",
    strokeWidth: "2.0",
    strokeLinecap: "round"
  })), __h("g", {
    style: {
      opacity: seedOp,
      transition: tr
    }
  }, [-4, -2, 0, 2, 4].map(dx => __h("circle", {
    key: dx,
    cx: ANCHOR_X + dx,
    cy: SOIL_Y - 1.2,
    r: 0.4,
    fill: "#2a1408"
  }))), __h("g", {
    style: {
      opacity: s === 1 ? 1 : 0,
      transition: tr
    }
  }, __h("ellipse", {
    cx: ANCHOR_X,
    cy: SOIL_Y - 5,
    rx: 6.5,
    ry: 4,
    fill: "#5a9460"
  }), __h("ellipse", {
    cx: ANCHOR_X - 1.5,
    cy: SOIL_Y - 6,
    rx: 3,
    ry: 1.6,
    fill: "#7eb47e",
    opacity: "0.7"
  })), leaves.map((leaf, i) => {
    const visible = s >= leaf.spawnAt;
    const rad = leaf.a * Math.PI / 180;
    const cx = ANCHOR_X + Math.sin(rad) * 2;
    const cy = SOIL_Y;
    const scaleVal = visible ? 1 : 0;
    return __h("g", {
      key: `l${i}`,
      style: {
        transformOrigin: `${cx}px ${cy}px`,
        transform: `scale(${scaleVal})`,
        transition: tr
      }
    }, __h(OrchidLeaf, {
      cx: cx,
      cy: cy,
      length: leaf.len,
      width: 18,
      angle: leaf.a
    }));
  }), __h("ellipse", {
    cx: ANCHOR_X,
    cy: SOIL_Y - 14,
    rx: 4,
    ry: 2,
    fill: "#3a5e34",
    style: {
      opacity: s >= 2 ? 1 : 0,
      transition: tr
    }
  }), __h("g", {
    style: {
      opacity: spikeOp,
      transition: tr,
      transformOrigin: `${ANCHOR_X}px ${spikeBaseY}px`,
      transform: `scale(${spikeH / 252})`
    }
  }, __h("path", {
    d: `M ${ANCHOR_X} ${spikeBaseY}
              Q ${ANCHOR_X + 14} ${spikeBaseY - 252 * 0.4}
                ${ANCHOR_X + 6} ${spikeBaseY - 252 * 0.7}
              Q ${ANCHOR_X - 4} ${spikeBaseY - 252 * 0.92}
                ${ANCHOR_X - 6} ${spikeBaseY - 252}`,
    fill: "none",
    stroke: "#6a4838",
    strokeWidth: "2.4",
    strokeLinecap: "round"
  })), flowerSlots.map((slot, i) => {
    const t = slot.t;
    const sx = ANCHOR_X + (1 - t) * (1 - t) * 0 + 2 * (1 - t) * t * 14 + t * t * -6;
    const sy = spikeBaseY - 252 * t;
    const fx = sx + slot.side * 0.7;
    const fy = sy - 2;
    const bud = budStateForFlower(slot.spawnAt);
    const ftScale = bud.scale;
    const ftOp = ftScale > 0 ? 1 : 0;
    return __h("g", {
      key: `flw${i}`
    }, __h("line", {
      x1: sx,
      y1: sy,
      x2: fx,
      y2: fy + 4,
      stroke: "#6a4838",
      strokeWidth: "1",
      strokeLinecap: "round",
      style: {
        opacity: ftOp,
        transition: tr
      }
    }), __h("g", {
      style: {
        transform: `translate(${fx}px, ${fy}px) scale(${ftScale})`,
        transformOrigin: "0 0",
        opacity: ftOp,
        transition: tr
      }
    }, __h(OrchidFlower, {
      openness: bud.openness,
      tone: i % 3,
      scale: 1.05
    })));
  }), __h("g", {
    style: {
      opacity: bloomOp,
      transition: tr
    }
  }, __h(BloomFX, {
    accent: "#d870e0",
    centerY: spikeBaseY - 252 * 0.5,
    radius: 90
  }), __h(BloomFX, {
    accent: "#f0c8f0",
    centerY: spikeBaseY - 252 * 0.5,
    radius: 55
  })), __h("g", {
    style: {
      opacity: bloomOp,
      transition: tr
    }
  }, __h("path", {
    d: `M ${ANCHOR_X + 6} ${spikeBaseY}
              Q ${ANCHOR_X + 30} ${spikeBaseY - 80}
                ${ANCHOR_X + 22} ${spikeBaseY - 150}
              Q ${ANCHOR_X + 8} ${spikeBaseY - 200}
                ${ANCHOR_X + 14} ${spikeBaseY - 230}`,
    fill: "none",
    stroke: "#6a4838",
    strokeWidth: "2",
    strokeLinecap: "round"
  }), secSlots.map((slot, i) => {
    const t = slot.t;
    const sx = ANCHOR_X + 6 + (1 - t) * (1 - t) * 0 + 2 * (1 - t) * t * 24 + t * t * 8;
    const sy = spikeBaseY - 230 * t;
    const fx = sx + slot.side * 0.7;
    const fy = sy - 2;
    return __h("g", {
      key: `sec${i}`
    }, __h("line", {
      x1: sx,
      y1: sy,
      x2: fx,
      y2: fy + 4,
      stroke: "#6a4838",
      strokeWidth: "0.9",
      strokeLinecap: "round"
    }), __h("g", {
      transform: `translate(${fx} ${fy}) scale(0.85)`
    }, __h(OrchidFlower, {
      openness: 1,
      tone: (i + 1) % 3,
      scale: 1
    })));
  })));
}

// Thick fleshy leaf with parallel longitudinal veining + sheen
function OrchidLeaf({
  cx,
  cy,
  length = 50,
  width = 18,
  angle = 0,
  color = "#3e6a44",
  vein = "#2a4a2c"
}) {
  // Spoon-shaped fleshy leaf
  const w = width;
  const h = length;
  const path = `M 0 0
     Q ${-w * 0.5} ${-h * 0.15} ${-w * 0.55} ${-h * 0.5}
     Q ${-w * 0.5} ${-h * 0.92} 0 ${-h}
     Q ${w * 0.5} ${-h * 0.92} ${w * 0.55} ${-h * 0.5}
     Q ${w * 0.5} ${-h * 0.15} 0 0 Z`;
  return __h("g", {
    transform: `translate(${cx} ${cy}) rotate(${angle})`
  }, __h("path", {
    d: path,
    fill: color
  }), __h("path", {
    d: path,
    fill: "#1f4226",
    opacity: "0.32",
    transform: "translate(0.8 0.8)"
  }), __h("path", {
    d: `M ${-w * 0.18} ${-h * 0.1}
            Q ${-w * 0.32} ${-h * 0.45} ${-w * 0.2} ${-h * 0.82}`,
    fill: "none",
    stroke: "#86b884",
    strokeWidth: "1.4",
    opacity: "0.42",
    strokeLinecap: "round"
  }), [-0.35, -0.18, 0, 0.18, 0.35].map((t, i) => __h("line", {
    key: i,
    x1: t * w * 0.85,
    y1: -h * 0.05,
    x2: t * w * 0.4,
    y2: -h * 0.95,
    stroke: vein,
    strokeWidth: 0.5,
    opacity: 0.55
  })), __h("ellipse", {
    cx: 0,
    cy: 0,
    rx: w * 0.4,
    ry: 1.4,
    fill: "#2a4220",
    opacity: "0.7"
  }));
}

// Aerial root — silvery-green tube with darker tip
function AerialRoot({
  x1,
  y1,
  x2,
  y2,
  thick = 2.4,
  color = "#a8c0a0",
  tip = "#5a7a5a"
}) {
  return __h("g", null, __h("path", {
    d: `M ${x1} ${y1} Q ${(x1 + x2) / 2 + 2} ${(y1 + y2) / 2} ${x2} ${y2}`,
    fill: "none",
    stroke: color,
    strokeWidth: thick,
    strokeLinecap: "round"
  }), __h("circle", {
    cx: x2,
    cy: y2,
    r: thick / 1.6,
    fill: tip
  }), __h("path", {
    d: `M ${x1} ${y1} Q ${(x1 + x2) / 2 + 2} ${(y1 + y2) / 2} ${x2} ${y2}`,
    fill: "none",
    stroke: "#d4e0c8",
    strokeWidth: thick * 0.4,
    opacity: "0.6",
    strokeLinecap: "round"
  }));
}

// A single Phalaenopsis flower with full anatomy. `openness` 0..1.
// `tone` selects palette variant for natural variation across the spike.
function OrchidFlower({
  openness = 1,
  tone = 0,
  scale = 1
}) {
  const o = openness;
  const s = scale;
  const palettes = [{
    petal: "#d870e0",
    sepal: "#e8a8e8",
    lip: "#9c1ad8",
    throat: "#fbe064",
    veinDk: "#7a1a98"
  }, {
    petal: "#ec90c8",
    sepal: "#f0b4d8",
    lip: "#b03098",
    throat: "#fbe064",
    veinDk: "#8a2080"
  }, {
    petal: "#c860d8",
    sepal: "#e4a4e4",
    lip: "#7c0eb4",
    throat: "#f6c460",
    veinDk: "#5a0a8a"
  }];
  const pal = palettes[tone % palettes.length];
  if (o < 0.05) {
    // closed bud
    return __h("g", null, __h("ellipse", {
      cx: 0,
      cy: 0,
      rx: 3.2 * s,
      ry: 5 * s,
      fill: "#7eaf6c"
    }), __h("ellipse", {
      cx: -0.6,
      cy: -0.4,
      rx: 1.2 * s,
      ry: 2 * s,
      fill: "#a4c888",
      opacity: "0.7"
    }), __h("path", {
      d: `M -3 4 Q 0 6 3 4 L 2 5 Q 0 6 -2 5 Z`,
      fill: "#5a8e44"
    }));
  }
  return __h("g", {
    transform: `scale(${s})`
  }, __h("ellipse", {
    cx: 0,
    cy: -10 * o,
    rx: 5 * o,
    ry: 8 * o,
    fill: pal.sepal,
    opacity: "0.95"
  }), __h("line", {
    x1: 0,
    y1: -2 * o,
    x2: 0,
    y2: -16 * o,
    stroke: pal.veinDk,
    strokeWidth: "0.4",
    opacity: "0.5"
  }), __h("ellipse", {
    cx: -7 * o,
    cy: 5 * o,
    rx: 4.5 * o,
    ry: 7 * o,
    fill: pal.sepal,
    opacity: "0.92",
    transform: `rotate(-30 ${-7 * o} ${5 * o})`
  }), __h("ellipse", {
    cx: 7 * o,
    cy: 5 * o,
    rx: 4.5 * o,
    ry: 7 * o,
    fill: pal.sepal,
    opacity: "0.92",
    transform: `rotate(30 ${7 * o} ${5 * o})`
  }), __h("path", {
    d: `M 0 0
            Q ${-8 * o} ${-4 * o} ${-12 * o} ${-2 * o}
            Q ${-15 * o} ${2 * o} ${-13 * o} ${6 * o}
            Q ${-10 * o} ${8 * o} ${-4 * o} ${4 * o}
            Q 0 ${2 * o} 0 0 Z`,
    fill: pal.petal
  }), __h("path", {
    d: `M 0 0
            Q ${8 * o} ${-4 * o} ${12 * o} ${-2 * o}
            Q ${15 * o} ${2 * o} ${13 * o} ${6 * o}
            Q ${10 * o} ${8 * o} ${4 * o} ${4 * o}
            Q 0 ${2 * o} 0 0 Z`,
    fill: pal.petal
  }), __h("path", {
    d: `M 0 0 Q ${-8 * o} 0 ${-12 * o} ${3 * o}`,
    fill: "none",
    stroke: pal.veinDk,
    strokeWidth: "0.4",
    opacity: "0.5"
  }), __h("path", {
    d: `M 0 0 Q ${8 * o} 0 ${12 * o} ${3 * o}`,
    fill: "none",
    stroke: pal.veinDk,
    strokeWidth: "0.4",
    opacity: "0.5"
  }), __h("g", {
    transform: `translate(0 ${4 * o})`
  }, __h("path", {
    d: `M ${-1.6 * o} 0
                  Q ${-4 * o} ${1 * o} ${-3.2 * o} ${4 * o}
                  Q ${-1.6 * o} ${4.5 * o} ${-0.8 * o} ${3 * o}`,
    fill: pal.lip
  }), __h("path", {
    d: `M ${1.6 * o} 0
                  Q ${4 * o} ${1 * o} ${3.2 * o} ${4 * o}
                  Q ${1.6 * o} ${4.5 * o} ${0.8 * o} ${3 * o}`,
    fill: pal.lip
  }), __h("path", {
    d: `M 0 ${1 * o}
                  Q ${-3.5 * o} ${3 * o} ${-2.2 * o} ${8 * o}
                  Q 0 ${10 * o} ${2.2 * o} ${8 * o}
                  Q ${3.5 * o} ${3 * o} 0 ${1 * o} Z`,
    fill: pal.lip
  }), __h("ellipse", {
    cx: 0,
    cy: 2.5 * o,
    rx: 2 * o,
    ry: 1.5 * o,
    fill: pal.throat
  }), __h("circle", {
    cx: -0.9 * o,
    cy: 2 * o,
    r: 0.7 * o,
    fill: "#fff8c8"
  }), __h("circle", {
    cx: 0.9 * o,
    cy: 2 * o,
    r: 0.7 * o,
    fill: "#fff8c8"
  }), __h("path", {
    d: `M ${-1 * o} ${8 * o} Q ${-3 * o} ${10 * o} ${-2 * o} ${12 * o}`,
    fill: "none",
    stroke: pal.veinDk,
    strokeWidth: "0.6",
    strokeLinecap: "round"
  }), __h("path", {
    d: `M ${1 * o} ${8 * o} Q ${3 * o} ${10 * o} ${2 * o} ${12 * o}`,
    fill: "none",
    stroke: pal.veinDk,
    strokeWidth: "0.6",
    strokeLinecap: "round"
  }), [-30, -10, 10, 30].map(a => __h("line", {
    key: a,
    x1: 0,
    y1: 2 * o,
    x2: Math.sin(a * Math.PI / 180) * 2.4 * o,
    y2: 2 * o + Math.cos(a * Math.PI / 180) * 5 * o,
    stroke: pal.veinDk,
    strokeWidth: "0.35",
    opacity: "0.65"
  }))), __h("ellipse", {
    cx: 0,
    cy: 1 * o,
    rx: 1.6 * o,
    ry: 3 * o,
    fill: "#fff",
    opacity: "0.95"
  }), __h("circle", {
    cx: 0,
    cy: 2 * o,
    r: 0.8 * o,
    fill: pal.throat
  }), __h("circle", {
    cx: 0,
    cy: -0.5 * o,
    r: 0.7 * o,
    fill: pal.lip
  }), __h("ellipse", {
    cx: 0,
    cy: -2 * o,
    rx: 1 * o,
    ry: 0.6 * o,
    fill: "#fbe064"
  }));
}
function Orchid({
  stage: stageProp = 0,
  swell = false,
  frame
}) {
  const {
    stage,
    extra
  } = resolveFrame(stageProp, frame);
  // Spike rises from the leaf rosette base.
  const spikeBaseY = SOIL_Y - 18; // top of leaf fan where spike emerges
  // top flower at spike t=0.92 lands at y≈52 (spikeBaseY 282 - spikeH*0.92).
  // Heavier growth 3→4 and 4→5.
  const spikeH = [0, 0, 0, 110, 175, 225, 252][stage];
  const tipY = spikeBaseY - spikeH;
  const showLeaves = stage >= 2;
  const showSpike = stage >= 3;
  const showRoots = stage >= 2;
  const flowerCount = stage >= 6 ? 4 : stage >= 5 ? 4 : stage >= 4 ? 4 : stage >= 3 ? 4 : 0;

  // Position flowers along the spike with natural stagger
  const flowerSlots = [{
    t: 0.18,
    side: 9
  }, {
    t: 0.42,
    side: -9
  }, {
    t: 0.68,
    side: 9
  }, {
    t: 0.92,
    side: -7
  }];
  return __h(Plant, {
    swell: swell
  }, stage === 0 && __h("g", null, [-4, -2, 0, 2, 4].map(dx => __h("circle", {
    key: dx,
    cx: ANCHOR_X + dx,
    cy: SOIL_Y - 1.2,
    r: 0.4,
    fill: "#2a1408"
  })), __h("ellipse", {
    cx: ANCHOR_X,
    cy: SOIL_Y - 0.5,
    rx: 6,
    ry: 0.6,
    fill: "#3e2e20",
    opacity: "0.5"
  })), stage === 1 && __h("g", null, __h("ellipse", {
    cx: ANCHOR_X,
    cy: SOIL_Y - 5,
    rx: 6.5,
    ry: 4,
    fill: "#5a9460"
  }), __h("ellipse", {
    cx: ANCHOR_X - 1.5,
    cy: SOIL_Y - 6,
    rx: 3,
    ry: 1.6,
    fill: "#7eb47e",
    opacity: "0.7"
  }), __h("circle", {
    cx: ANCHOR_X,
    cy: SOIL_Y - 8.5,
    r: 1.4,
    fill: "#3e6a3e"
  }), __h("path", {
    d: `M ${ANCHOR_X - 1.5} ${SOIL_Y - 10}
                    L ${ANCHOR_X + 1.5} ${SOIL_Y - 10}
                    L ${ANCHOR_X} ${SOIL_Y - 13} Z`,
    fill: "#6a9466"
  }), __h("path", {
    d: `M ${ANCHOR_X - 4} ${SOIL_Y - 3} Q ${ANCHOR_X - 6} ${SOIL_Y} ${ANCHOR_X - 6} ${SOIL_Y + 3}`,
    fill: "none",
    stroke: "#a8c0a0",
    strokeWidth: "1.2",
    strokeLinecap: "round"
  })), showLeaves && __h("g", null, showRoots && __h(__Fragment, null, __h(AerialRoot, {
    x1: ANCHOR_X - 4,
    y1: SOIL_Y - 6,
    x2: ANCHOR_X - 18,
    y2: SOIL_Y + 6,
    thick: 2.6
  }), __h(AerialRoot, {
    x1: ANCHOR_X + 5,
    y1: SOIL_Y - 8,
    x2: ANCHOR_X + 16,
    y2: SOIL_Y + 4,
    thick: 2.4
  }), __h(AerialRoot, {
    x1: ANCHOR_X - 8,
    y1: SOIL_Y - 10,
    x2: ANCHOR_X - 24,
    y2: SOIL_Y + 12,
    thick: 2.0
  }), stage >= 3 && __h(AerialRoot, {
    x1: ANCHOR_X + 3,
    y1: SOIL_Y - 12,
    x2: ANCHOR_X + 22,
    y2: SOIL_Y + 10,
    thick: 2.2
  })), (stage === 2 ? [-55, -25, 25, 55] : [-65, -35, -10, 15, 40, 65]).map((a, i) => {
    const len = (stage >= 3 ? 56 : 44) + (i % 2 ? -4 : 4);
    const wid = stage >= 3 ? 20 : 16;
    const rad = a * Math.PI / 180;
    return __h(OrchidLeaf, {
      key: a,
      cx: ANCHOR_X + Math.sin(rad) * 2,
      cy: SOIL_Y,
      length: len,
      width: wid,
      angle: a
    });
  }), __h("ellipse", {
    cx: ANCHOR_X,
    cy: SOIL_Y - 14,
    rx: 4,
    ry: 2,
    fill: "#3a5e34"
  })), showSpike && __h(__Fragment, null, __h("path", {
    d: `M ${ANCHOR_X} ${spikeBaseY}
                Q ${ANCHOR_X + 14} ${spikeBaseY - spikeH * 0.4}
                  ${ANCHOR_X + 6} ${spikeBaseY - spikeH * 0.7}
                Q ${ANCHOR_X - 4} ${spikeBaseY - spikeH * 0.92}
                  ${ANCHOR_X - 6} ${tipY}`,
    fill: "none",
    stroke: "#6a4838",
    strokeWidth: "2.4",
    strokeLinecap: "round"
  }), __h("path", {
    d: `M ${ANCHOR_X} ${spikeBaseY}
                Q ${ANCHOR_X + 14} ${spikeBaseY - spikeH * 0.4}
                  ${ANCHOR_X + 6} ${spikeBaseY - spikeH * 0.7}
                Q ${ANCHOR_X - 4} ${spikeBaseY - spikeH * 0.92}
                  ${ANCHOR_X - 6} ${tipY}`,
    fill: "none",
    stroke: "#9a7858",
    strokeWidth: "0.7",
    strokeLinecap: "round",
    transform: "translate(-0.6 0)"
  }), Array.from({
    length: flowerCount
  }).map((_, i) => {
    const slot = flowerSlots[i];
    const t = slot.t;
    // bezier position approximation
    const sx = ANCHOR_X + (1 - t) * (1 - t) * 0 + 2 * (1 - t) * t * 14 + t * t * -6;
    const sy = spikeBaseY - spikeH * t;
    const fx = sx + slot.side * 0.7;
    const fy = sy + (stage <= 4 ? 0 : -2);

    // openness per stage
    const open = stage === 3 ? 0 : stage === 4 ? 0.5 : stage === 5 ? 0.8 : 1.0;
    const scale = stage === 3 ? 0.9 : stage === 4 ? 1.0 : stage === 5 ? 1.05 : 1.15;
    return __h("g", {
      key: i
    }, __h("path", {
      d: `M ${sx} ${sy} L ${sx + (slot.side > 0 ? 2 : -2)} ${sy + 2}
                      L ${sx + (slot.side > 0 ? -1 : 1)} ${sy + 3} Z`,
      fill: "#5a8044"
    }), __h("line", {
      x1: sx,
      y1: sy,
      x2: fx,
      y2: fy + 4,
      stroke: "#6a4838",
      strokeWidth: "1",
      strokeLinecap: "round"
    }), __h("g", {
      transform: `translate(${fx} ${fy})`
    }, __h(OrchidFlower, {
      openness: open,
      tone: i % 3,
      scale: scale
    })));
  }), stage >= 5 && __h("g", {
    transform: `translate(${ANCHOR_X - 6} ${tipY})`
  }, __h("ellipse", {
    cx: 0,
    cy: -2,
    rx: 2.2,
    ry: 3.5,
    fill: "#7eaf6c"
  }), __h("ellipse", {
    cx: -3,
    cy: 1,
    rx: 1.6,
    ry: 2.6,
    fill: "#7eaf6c",
    transform: "rotate(-30 -3 1)"
  }), __h("ellipse", {
    cx: 3,
    cy: 1,
    rx: 1.6,
    ry: 2.6,
    fill: "#7eaf6c",
    transform: "rotate(30 3 1)"
  }))), stage === 6 && __h(__Fragment, null, __h(BloomFX, {
    accent: "#d870e0",
    centerY: spikeBaseY - spikeH * 0.5,
    radius: 80
  }), __h("path", {
    d: `M ${ANCHOR_X + 6} ${spikeBaseY}
                Q ${ANCHOR_X + 24} ${spikeBaseY - 75}
                  ${ANCHOR_X + 30} ${spikeBaseY - 130}`,
    fill: "none",
    stroke: "#6a4838",
    strokeWidth: "2",
    strokeLinecap: "round"
  }), __h("path", {
    d: `M ${ANCHOR_X + 6} ${spikeBaseY}
                Q ${ANCHOR_X + 24} ${spikeBaseY - 75}
                  ${ANCHOR_X + 30} ${spikeBaseY - 130}`,
    fill: "none",
    stroke: "#9a7858",
    strokeWidth: "0.6",
    strokeLinecap: "round",
    transform: "translate(-0.5 0)"
  }), __h("g", {
    transform: `translate(${ANCHOR_X + 20} ${spikeBaseY - 50})`
  }, __h("line", {
    x1: 0,
    y1: 0,
    x2: -8,
    y2: 4,
    stroke: "#6a4838",
    strokeWidth: "0.8"
  }), __h(OrchidFlower, {
    openness: 1,
    tone: 2,
    scale: 0.85
  })), __h("g", {
    transform: `translate(${ANCHOR_X + 36} ${spikeBaseY - 115})`
  }, __h("line", {
    x1: 0,
    y1: 0,
    x2: -6,
    y2: 4,
    stroke: "#6a4838",
    strokeWidth: "0.8"
  }), __h(OrchidFlower, {
    openness: 1,
    tone: 1,
    scale: 0.75
  })), __h("g", {
    transform: `translate(${ANCHOR_X + 30} ${spikeBaseY - 138})`
  }, __h("ellipse", {
    cx: 0,
    cy: 0,
    rx: 2,
    ry: 3,
    fill: "#7eaf6c"
  }), __h("ellipse", {
    cx: 0,
    cy: -0.5,
    rx: 1.2,
    ry: 2,
    fill: "#e0a8d8",
    opacity: "0.6"
  }))));
}

// ── Master wrapper ────────────────────────────────────────────────────
function Flower({
  species,
  stage = 0,
  swell = false,
  showSoil = false,
  soilColor = "#4a3018"
}) {
  const Inner = FLOWER_COMPONENTS[species] || Hibiscus;
  return __h("svg", {
    viewBox: `0 0 ${FLOWER_W} ${FLOWER_H}`,
    width: "100%",
    height: "100%",
    style: {
      display: "block",
      overflow: "visible"
    },
    preserveAspectRatio: "xMidYMax meet"
  }, showSoil && __h(__Fragment, null, __h("rect", {
    x: 0,
    y: SOIL_Y,
    width: FLOWER_W,
    height: FLOWER_H - SOIL_Y,
    fill: soilColor
  }), Array.from({
    length: 12
  }).map((_, i) => __h("circle", {
    key: i,
    cx: (i * 19 + 8) % FLOWER_W,
    cy: SOIL_Y + 5 + i % 3 * 6,
    r: 0.8,
    fill: "#1a1008",
    opacity: "0.6"
  }))), !showSoil && __h("line", {
    x1: ANCHOR_X - 30,
    y1: SOIL_Y,
    x2: ANCHOR_X + 30,
    y2: SOIL_Y,
    stroke: "#cdb89a",
    strokeWidth: "1.4",
    strokeLinecap: "round",
    opacity: "0.45"
  }), __h(Inner, {
    stage: stage,
    swell: swell
  }));
}
const FLOWER_COMPONENTS = {
  arctic_poppy: ArcticPoppy,
  hydrangea: Hydrangea,
  hibiscus: Hibiscus,
  cactus_blossom: CactusBlossom,
  orchid: Orchid
};
const FLOWER_SPECIES = [{
  id: "arctic_poppy",
  name: "ARCTIC POPPY",
  accent: "#f0a521",
  scientific: "Papaver radicatum"
}, {
  id: "hydrangea",
  name: "HYDRANGEA",
  accent: "#9c84d8",
  scientific: "Hydrangea macrophylla"
}, {
  id: "hibiscus",
  name: "HIBISCUS",
  accent: "#e63465",
  scientific: "Hibiscus rosa-sinensis"
}, {
  id: "cactus_blossom",
  name: "CACTUS BLOSSOM",
  accent: "#f06ba0",
  scientific: "Echinopsis sp."
}, {
  id: "orchid",
  name: "ORCHID",
  accent: "#d870e0",
  scientific: "Phalaenopsis sp."
}];
const STAGE_LABELS = ["0 · SEED", "1 · SPROUT", "2 · FOLIAGE", "3 · BUD INIT", "4 · BUD SWELLS", "5 · CRACKING", "6 · BLOOM"];
Object.assign(window, {
  Flower,
  FLOWER_COMPONENTS,
  FLOWER_SPECIES,
  STAGE_LABELS,
  FLOWER_W,
  FLOWER_H,
  ArcticPoppy11,
  ArcticPoppyMorph,
  HydrangeaMorph,
  HibiscusMorph,
  CactusBlossomMorph,
  OrchidMorph,
  FRAME_TO_STAGE,
  FRAME_LABELS
});