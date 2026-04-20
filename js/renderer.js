// ─── RENDERER ─────────────────────────────────────────────────────────────────
// SVG map drawing functions.
// Load order: FOURTH — after hex-geometry.js.
//
// render()          — rebuilds all hex SVG content and updates viewport transform
// updateViewport()  — updates viewport transform only (pan/zoom, no content rebuild)
// resizeCanvas()    — legacy name; calls render() for compat with setup.js/io.js
// buildHexSvg(r,c,hex) — returns SVG string for one hex group
// hexToSvgInner(hex,tileDef) — inner track/city/town geometry (shared with swatches)

const RENDERER_VERSION = '2026-04-17-tobymao-revenue';
console.log(`[renderer] loaded version=${RENDERER_VERSION}`);

// ── Debug: inspect a hex by grid key or by clicking ──────────────────────────
window.debugHex = function(key) {
  if (typeof state === 'undefined' || !state.hexes) { console.warn('[debugHex] no state'); return; }
  if (key) {
    const hex = state.hexes[key];
    if (!hex) { console.warn(`[debugHex] no hex at ${key}`); return; }
    console.group(`[debugHex] ${key}`);
    console.log('hex object:', JSON.parse(JSON.stringify(hex)));
    if (!hex.tile && hex.feature && hex.feature !== 'none' && hex.feature !== 'blank') {
      try {
        const svg = hexToSvgInner(hex, null);
        console.log('hexToSvgInner output:', svg || '(empty string)');
      } catch(e) {
        console.error('hexToSvgInner threw:', e);
      }
    } else if (hex.tile) {
      const td = TileRegistry.getTileDef(hex.tile);
      console.log('tile:', hex.tile, 'rotation:', hex.rotation, 'tileDef:', td);
    }
    console.groupEnd();
  } else {
    const all = Object.entries(state.hexes).filter(([,h]) => !h.killed);
    console.group(`[debugHex] all live hexes (${all.length})`);
    const dsl  = all.filter(([,h]) => !h.tile && h.feature && h.feature !== 'none' && h.feature !== 'blank');
    const tile = all.filter(([,h]) => h.tile);
    const blank = all.filter(([,h]) => !h.tile && (!h.feature || h.feature === 'none' || h.feature === 'blank'));
    console.log(`DSL hexes: ${dsl.length}  |  tile hexes: ${tile.length}  |  blank: ${blank.length}`);
    console.table(dsl.map(([k,h]) => ({ key: k, bg: h.bg, feature: h.feature, exits: (h.exits||[]).join(','), name: h.name||'' })));
    console.groupEnd();
  }
};

// ─── DSL HEX COLORS ───────────────────────────────────────────────────────────
// Source: tobymao lib/hex.rb Lib::Hex::COLOR — must match TILE_HEX_COLORS in constants.js
const STATIC_BG_COLORS = {
  white:  '#EAE0C8',
  yellow: '#fde900',
  green:  '#71BF44',
  brown:  '#CB7745',
  gray:   '#BCBDC0',
  red:    '#E05050',
  blue:   '#35A7FF',
};

const STATIC_PHASE_COLORS = {
  yellow: '#fde900',
  green:  '#71BF44',
  brown:  '#CB7745',
  gray:   '#BCBDC0',
};

// ─── EDGE POSITION HELPERS ────────────────────────────────────────────────────
function edgePos(edge, dist) {
  if (dist === undefined) dist = 43.3;
  const a = edge * Math.PI / 3;
  const x0 = -Math.sin(a) * dist;
  const y0 =  Math.cos(a) * dist;
  if (state && state.meta && state.meta.orientation === 'pointy') {
    const R = Math.PI / 6;
    const cosR = Math.cos(R), sinR = Math.sin(R);
    return { x: x0 * cosR - y0 * sinR, y: x0 * sinR + y0 * cosR };
  }
  return { x: x0, y: y0 };
}

function rotateLocPos(x, y) {
  if (state && state.meta && state.meta.orientation === 'pointy') {
    const R = Math.PI / 6;
    const cosR = Math.cos(R), sinR = Math.sin(R);
    return { x: x * cosR - y * sinR, y: x * sinR + y * cosR };
  }
  return { x, y };
}

function computeTownPos(exits) {
  if (!exits || exits.length === 0) return { x: 0, y: 0, angle: 0 };

  if (exits.length === 1) {
    const a = exits[0] * Math.PI / 3;
    return { x: +(-Math.sin(a) * 25).toFixed(2), y: +(Math.cos(a) * 25).toFixed(2), angle: exits[0] * 60 };
  }

  let ea = exits[0], eb = exits[1];
  if (Math.abs(ea - eb) > 3) { if (ea < eb) ea += 6; else eb += 6; }
  const minEdge = Math.min(ea, eb);
  const diff    = Math.abs(ea - eb);
  const type    = diff === 1 ? 'sharp' : diff === 2 ? 'gentle' : 'straight';

  if (type === 'straight') {
    return { x: 0, y: 0, angle: minEdge * 60 };
  } else if (type === 'sharp') {
    const a = (minEdge + 0.5) * Math.PI / 3;
    return { x: +(-Math.sin(a) * 25).toFixed(2), y: +(Math.cos(a) * 25).toFixed(2), angle: (minEdge + 2) * 60 };
  } else {
    const a = (minEdge + 1) * Math.PI / 3;
    return { x: +(-Math.sin(a) * 11.6).toFixed(2), y: +(Math.cos(a) * 11.6).toFixed(2), angle: (minEdge * 60) - 30 };
  }
}

function checkColinear(x0, y0, x1, y1) {
  const angleBE     = Math.atan2(y1 - y0, x1 - x0);
  const angleBCenter = Math.atan2(-y0, -x0);
  return Math.abs(angleBE - angleBCenter) < 0.05;
}

function calcArc(bx, by, ex, ey) {
  const dist   = Math.hypot(bx - ex, by - ey);
  const angleBo = Math.atan2(by, -bx);
  const angleBe = Math.atan2(by - ey, ex - bx);
  let da = angleBo - angleBe;
  if (da < -Math.PI) da += 2 * Math.PI;
  else if (da > Math.PI) da -= 2 * Math.PI;
  const cosA = Math.cos(Math.PI / 2 - Math.abs(da));
  const radius = cosA < 0.001 ? 1e6 : dist / (2 * cosA);
  return { radius, sweep: da < 0 ? 0 : 1 };
}

// ─── SVG BUILD HELPERS ─────────────────────────────────────────────────────────
// buildBordersSvg: border markers (impassable/water) in hex-local world-unit coords.
// All positions relative to hex center (0,0).
function buildBordersSvg(hex) {
  if (!hex || !hex.borders || hex.borders.length === 0) return '';
  const sc = HEX_SIZE / 50;  // 50-unit edgePos space → world-unit scale
  let svg = '';
  for (const border of hex.borders) {
    const mp = edgePos(border.edge);         // orientation-aware midpoint in 43.3-unit space
    const bx = mp.x * sc, by = mp.y * sc;   // world space
    const len = Math.hypot(bx, by);
    const edgeDx = -by / len, edgeDy = bx / len;
    const halfLen = 11 * sc;
    if (border.type === 'impassable') {
      svg += `<line x1="${(bx-edgeDx*halfLen).toFixed(2)}" y1="${(by-edgeDy*halfLen).toFixed(2)}" x2="${(bx+edgeDx*halfLen).toFixed(2)}" y2="${(by+edgeDy*halfLen).toFixed(2)}" stroke="#8b0000" stroke-width="4" stroke-linecap="round"/>`;
    } else if (border.type === 'water' || border.type === 'mountain') {
      const col = border.type === 'water' ? '#2266cc' : '#8B6914';
      svg += `<line x1="${(bx-edgeDx*halfLen).toFixed(2)}" y1="${(by-edgeDy*halfLen).toFixed(2)}" x2="${(bx+edgeDx*halfLen).toFixed(2)}" y2="${(by+edgeDy*halfLen).toFixed(2)}" stroke="${col}" stroke-width="3" stroke-linecap="round"/>`;
      if (border.cost) {
        const radDx = bx / len, radDy = by / len;
        svg += `<text x="${(bx-radDx*8*sc).toFixed(2)}" y="${(by-radDy*8*sc).toFixed(2)}" font-family="Lato,Arial,sans-serif" font-size="7" font-weight="bold" fill="${col}" text-anchor="middle" dominant-baseline="middle">${escSvg(String(border.cost))}</text>`;
      }
    }
  }
  return svg;
}

// ═══════════════════════════════════════════════════════════════════════════════
// TERRAIN BADGE RENDERING — TOBYMAO FAITHFUL PORT
// ═══════════════════════════════════════════════════════════════════════════════
//
// !! FUTURE CLAUDE: READ THIS BEFORE TOUCHING ANYTHING BELOW !!
//
// This code is a deliberate, line-for-line port of tobymao's 18xx.games renderer.
// Every magic number, every region array, every coordinate has a named constant
// and a file citation in the tobymao source at:
//   C:\Users\meiot\Rail\18xx-master\assets\app\view\game\part\
//
// TWO bugs were previously introduced by AI refactoring:
//
//   BUG 1 — "simplified" the 7-location preference list down to a binary
//            hasCityFeature flag (just P_CENTER or P_TOP_RIGHT_CORNER).
//            This is WRONG.  There are 7 candidate positions evaluated by
//            combined_cost.  Track exits also consume regions.  A hex with
//            exits pointing into the top-right corner must push the badge
//            further along the list even with no city present.
//
//   BUG 2 — invented a "collision-safe mode" (upper-right icon + cost bubble
//            below city) with no basis in tobymao source.  The rule is simply:
//            run preferred_render_locations through combined_cost, pick min.
//
// RULE: If you think something here "could be simplified", "looks redundant",
// or "could be abstracted" — you are wrong.  Verify against tobymao source
// first.  Every number is there because tobymao put it there.
//
// ── COORDINATE SYSTEM ───────────────────────────────────────────────────────
// Tobymao renders in a 100-unit circumradius hex space.
//   Lib::Hex::X_R = 100  (half-width of flat hex = circumradius)
//   Lib::Hex::Y_B = 87   (half-height of flat hex = inradius)
// Our renderer uses HEX_SIZE = 40 as circumradius.
// Scale factor: 40/100 = 0.4  ← applied to ALL tobymao coordinates below.
//
// ── 24-REGION ARRAY (Part::Base) ────────────────────────────────────────────
// source: assets/app/view/game/part/base.rb
//
// The hex is divided into 24 regions, laid out as rows (flat-top orientation):
//
//   row 0 (top):           [ 0][ 1][ 2][ 3][ 4]
//   row 1 (upper-mid): [ 5][ 6][ 7][ 8][ 9][10][11]
//   row 2 (lower-mid): [12][13][14][15][16][17][18]
//   row 3 (bottom):       [19][20][21][22][23]
//
// Named groups (Base::* constants, verbatim):
//   CENTER           = [7, 8, 9, 14, 15, 16]
//   TRACK_TO_EDGE_0  = [15, 21]     ← edge 0 (bottom)
//   TRACK_TO_EDGE_1  = [13, 14]     ← edge 1 (lower-left)
//   TRACK_TO_EDGE_2  = [ 6,  7]     ← edge 2 (upper-left)
//   TRACK_TO_EDGE_3  = [ 2,  8]     ← edge 3 (top)
//   TRACK_TO_EDGE_4  = [ 9, 10]     ← edge 4 (upper-right)
//   TRACK_TO_EDGE_5  = [16, 17]     ← edge 5 (lower-right)
//
// @region_use starts at [0,0,...,0] for each hex.  Each part calls
// increment_cost() after choosing its position, adding weight to its regions.
// The upgrade badge picks positions by combined_cost = sum(weight*region_use).
//
// ── PLACEMENT ALGORITHM (Part::Base#render_location) ────────────────────────
// source: assets/app/view/game/part/base.rb lines 155-163
//
//   render_location = preferred_render_locations
//                       .min_by.with_index { |t, i|
//                         [combined_cost(t[:region_weights_in] || t[:region_weights]), i]
//                       }
//
// The index is the tiebreaker — preference order matters when costs are equal.
//
// ── UPGRADE PREFERRED LOCATIONS (Part::Upgrade#preferred_render_locations) ──
// source: assets/app/view/game/part/upgrade.rb lines 68-90
//        flat P_* constants: upgrade.rb lines 17-63
//        pointy PP_* constants: small_item.rb + upgrade.rb PP_EDGE2
//
// FLAT layout — 7 positions in preference order (tobymao coords → ×0.4 ours):
//   #  name                  tobymao (x,y)    our (x,y)   regions
//   0  P_CENTER              (  0,   0)       (  0,  0)   CENTER=[7,8,9,14,15,16]
//   1  P_TOP_RIGHT_CORNER    ( 30, -60)       ( 12,-24)   [3,4]
//   2  P_EDGE2               (-50, -45)       (-20,-18)   [0,5,6]
//   3  P_BOTTOM_LEFT_CORNER  (-30,  60)       (-12, 24)   [19,20]
//   4  P_RIGHT_CORNER        ( 70,   0)       ( 28,  0)   [11,18]
//   5  P_LEFT_CORNER         (-70,   0)       (-28,  0)   [5,12]
//   6  P_BOTTOM_RIGHT_CORNER ( 30,  60)       ( 12, 24)   [22,23]
//
// POINTY layout — 7 positions (SmallItem PP_* + Upgrade PP_EDGE2, all ×0.4):
//   #  name                  tobymao (x,y)    our (x,y)   regions
//   0  P_CENTER              (  0,    0)      (  0,  0)   CENTER
//   1  PP_UPPER_RIGHT_CORNER ( 65, -37.5)     ( 26,-15)   [3,4]
//   2  PP_EDGE2              (-35,  -55)      (-14,-22)   [0,5,6]
//   3  PP_BOTTOM_LEFT_CORNER (-65,  37.5)     (-26, 15)   [19,20]
//   4  PP_RIGHT_CORNER       ( 60,    0)      ( 24,  0)   [9,10]
//   5  PP_LEFT_CORNER        (-60,    0)      (-24,  0)   [13,14]
//   6  PP_BOTTOM_RIGHT_CORNER( 65,  37.5)     ( 26, 15)   [11,18]
//
// ── ICON SIZING (Part::Upgrade) ──────────────────────────────────────────────
// source: assets/app/view/game/part/upgrade.rb lines 64, 96-116
//
//   SIZE     = 20  (tobymao) → 20 × 0.4 = 8  (our S)
//   delta_x  = -(SIZE/2)     → -10 × 0.4 = -4  (our dx)
//   delta_y  = 5 + SIZE*idx  → for idx=0: 5 × 0.4 = 2  (our dy)
//
// ── COST TEXT (main.css + upgrade.rb) ───────────────────────────────────────
// source: public/assets/main.css  "text.number { font-size: 21px; font-weight: 300; }"
//         upgrade.rb line 97:  h('text.number', { attrs: { fill: 'black' } }, @cost)
//         .tile CSS:  text-anchor: middle
//
//   font-size:   21px (tobymao) × 0.4 = 8.4px  (HEX_SIZE * 0.21)
//   font-weight: 300  ← NOT bold, NOT 400, NOT 600.  Exactly 300.
//   text-anchor: middle
//   fill:        black
//   NO dominant-baseline attribute (tobymao does not set it on cost text)
//
// ═══════════════════════════════════════════════════════════════════════════════

function buildTerrainSvg(hex) {
  if (!hex || !hex.terrain) return '';

  const isPointy = (state.meta && state.meta.orientation === 'pointy');

  // ── Step 1: build @region_use from hex features ───────────────────────────
  // Mirrors what tobymao's city/town/track parts do via increment_cost() before
  // the upgrade badge is rendered.  We only track the parts relevant to our
  // static hex descriptions (no dynamic tile routes to worry about here).

  const ru = new Array(24).fill(0); // Part::Base @region_use, all zeros

  // Track paths → Base::TRACK_TO_EDGE_N (base.rb lines 34-39)
  // Each exit edge occupies 2 regions along the path toward that edge.
  // !! DO NOT collapse these into a formula — they are named constants !!
  const TRACK_TO_EDGE = [
    [15, 21],  // edge 0 — TRACK_TO_EDGE_0
    [13, 14],  // edge 1 — TRACK_TO_EDGE_1
    [ 6,  7],  // edge 2 — TRACK_TO_EDGE_2
    [ 2,  8],  // edge 3 — TRACK_TO_EDGE_3
    [ 9, 10],  // edge 4 — TRACK_TO_EDGE_4
    [16, 17],  // edge 5 — TRACK_TO_EDGE_5
  ];
  if (Array.isArray(hex.exits)) {
    for (const e of hex.exits) {
      const rr = TRACK_TO_EDGE[e];
      if (rr) for (const r of rr) ru[r] += 1; // increment_weight_for_regions(regions, 1)
    }
  }

  // Center city (1-slot): City#preferred_render_locations → region_weights: CENTER
  //   source: city.rb lines 275-296 (single-slot center city uses CENTER)
  // Center town: TownDot CENTER_TOWN / TownRect center path → region_weights: CENTER
  //   source: town_dot.rb lines 29-35, town_location.rb SINGLE_STOP_TWO_EXIT_REGIONS :straight
  // Static map hexes (hex.feature) are always center stops, never edge stops.
  const CENTER = [7, 8, 9, 14, 15, 16]; // Base::CENTER (base.rb line 19)
  const hasCenterStop =
    hex.city || hex.feature === 'city' || hex.feature === 'oo' ||
    hex.town || hex.feature === 'town' || hex.feature === 'dualTown';
  if (hasCenterStop) {
    for (const r of CENTER) ru[r] += 1; // city/town increment_cost occupies CENTER
  }

  // ── Step 2: preferred_render_locations ───────────────────────────────────
  // These arrays are VERBATIM from tobymao — do not reorder, do not merge,
  // do not "deduplicate" entries that share region sets.  Order is the
  // tiebreaker in min_by, so position 0 wins ties over position 1, etc.
  // All (x, y) = tobymao 100-unit coords × 0.4.
  //
  // Flat source:   upgrade.rb lines 17-63 (P_* constants) + lines 68-78
  // Pointy source: small_item.rb PP_* constants + upgrade.rb PP_EDGE2 (line 46-50)

  const LOCS_FLAT = [
    { r: CENTER,   x:   0, y:   0 },  // P_CENTER            (  0,  0)×0.4
    { r: [3,4],    x:  12, y: -24 },  // P_TOP_RIGHT_CORNER  ( 30,-60)×0.4
    { r: [0,5,6],  x: -20, y: -18 },  // P_EDGE2             (-50,-45)×0.4
    { r: [19,20],  x: -12, y:  24 },  // P_BOTTOM_LEFT_CORNER(-30, 60)×0.4
    { r: [11,18],  x:  28, y:   0 },  // P_RIGHT_CORNER      ( 70,  0)×0.4
    { r: [5,12],   x: -28, y:   0 },  // P_LEFT_CORNER       (-70,  0)×0.4
    { r: [22,23],  x:  12, y:  24 },  // P_BOTTOM_RIGHT_CORNER(30, 60)×0.4
  ];
  const LOCS_POINTY = [
    { r: CENTER,   x:   0, y:   0 },  // P_CENTER
    { r: [3,4],    x:  26, y: -15 },  // PP_UPPER_RIGHT_CORNER( 65,-37.5)×0.4
    { r: [0,5,6],  x: -14, y: -22 },  // PP_EDGE2             (-35,  -55)×0.4
    { r: [19,20],  x: -26, y:  15 },  // PP_BOTTOM_LEFT_CORNER(-65, 37.5)×0.4
    { r: [9,10],   x:  24, y:   0 },  // PP_RIGHT_CORNER      ( 60,    0)×0.4
    { r: [13,14],  x: -24, y:   0 },  // PP_LEFT_CORNER       (-60,    0)×0.4
    { r: [11,18],  x:  26, y:  15 },  // PP_BOTTOM_RIGHT_CORNER(65, 37.5)×0.4
  ];
  const locs = isPointy ? LOCS_POINTY : LOCS_FLAT;

  // ── Step 3: pick best location — Base#render_location (base.rb lines 155-163)
  // min_by [combined_cost(region_weights), index]
  // combined_cost = region_weights.sum { |regions, w| w * regions.sum { @region_use[r] } }
  // All our weights are 1.0 (uniform), so combined_cost = sum of ru[r] for r in regions.
  // The index i is the tiebreaker — lower index = higher preference.
  const combinedCost = (regions) => regions.reduce((s, r) => s + ru[r], 0);
  let best = locs[0];
  let bestCost = combinedCost(locs[0].r);
  for (let i = 1; i < locs.length; i++) {
    const c = combinedCost(locs[i].r);
    if (c < bestCost) { bestCost = c; best = locs[i]; } // strictly less — index wins ties
  }

  // ── Step 4: render badge at chosen position ───────────────────────────────
  // upgrade.rb render_part wraps children in:
  //   h(:g, { transform: rotation_for_layout },    ← we rely on outer hex transform
  //     h(:g, { transform: translate }, children)) ← translate = (best.x, best.y)

  // Icon sizing (upgrade.rb lines 64, 99-102):
  //   SIZE    = 20        → S  = 20 × 0.4 = HEX_SIZE * 0.20
  //   delta_x = -(SIZE/2) → dx = -10 × 0.4 = -S/2
  //   delta_y = 5+SIZE*0  → dy =  5 × 0.4 = HEX_SIZE * 0.05   (first terrain, index=0)
  const S  = HEX_SIZE * 0.20; // tobymao SIZE=20 × scale
  const dx = -S / 2;          // tobymao delta_x = -(size/2)
  const dy = HEX_SIZE * 0.05; // tobymao delta_y = 5 × scale  (index 0 only; we render one icon)

  let svg = `<g transform="translate(${best.x.toFixed(1)},${best.y.toFixed(1)})">`;

  // Cost text — upgrade.rb line 97 + main.css "text.number"
  // !! font-weight MUST be 300 — NOT bold.  fill MUST be 'black' not '#000'. !!
  if (hex.terrainCost && hex.terrainCost > 0) {
    svg += `<text text-anchor="middle" font-family="Lato,Arial,sans-serif"` +
           ` font-size="${(HEX_SIZE * 0.21).toFixed(1)}"` + // 21px × 0.4
           ` font-weight="300" fill="black">${escSvg(String(hex.terrainCost))}</text>`;
  }

  svg += _terrainIconSvg(hex.terrain, S, dx, dy);
  svg += '</g>';
  return svg;
}

// ── _terrainIconSvg ──────────────────────────────────────────────────────────
// Renders one terrain icon SVG element, positioned at (dx, dy) within the
// badge group, sized to S×S.
//
// Every shape here is taken verbatim from tobymao source.  DO NOT:
//   • change #cb7745 (mountain fill) — it is tobymao's exact brown, not gray
//   • change the WATER_PATH string — it is upgrade.rb line 65 verbatim
//   • change stroke colours — they are from the referenced .svg files
//   • "simplify" water/river into a single case — their stroke colours differ
//   • replace the swamp/desert paths with emoji or CSS — the SVG paths are
//     inlined directly from /icons/swamp.svg and /icons/cactus.svg
//
// Sources for each case are cited inline.
//
// Parameters:
//   terrain  — string key matching tobymao terrain names
//   S        — icon size in our coordinate space (tobymao SIZE=20 × 0.4 = 8)
//   dx, dy   — top-left offset within badge group (tobymao delta_x, delta_y)
function _terrainIconSvg(terrain, S, dx, dy) {
  // px/py: string versions of dx/dy for SVG attribute values.
  // tobymao positions icons with translate(delta_x delta_y) — we do the same.
  const px = dx.toFixed(2), py = dy.toFixed(2);

  switch (terrain) {

    case 'mountain':
      // source: upgrade.rb lines 125-131
      //   TRIANGLE_PATH = '0,20 10,0 20,20'  (tobymao 100-unit space)
      //   fill: '#cb7745'  ← tobymao's brown.  NOT gray.  NOT '#777'.
      //   transform: "translate(#{delta_x} #{delta_y})"
      // Scaled: points become '0,S  S/2,0  S,S'
      return `<polygon transform="translate(${px},${py})"` +
             ` points="0,${S.toFixed(2)} ${(S/2).toFixed(2)},0 ${S.toFixed(2)},${S.toFixed(2)}"` +
             ` fill="#cb7745"/>`;

    case 'water': {
      // source: upgrade.rb lines 133-137
      //   WATER_PATH = 'M -15 -7 Q -7.5 -15, 0 -7 S 7.5 1, 15 -7
      //                 M -15 -2  Q -7.5 -10, 0 -2  S 7.5 6, 15 -2'
      //   rendered as: h('path.tile__water', attrs: { d: WATER_PATH })
      //   inside:      h(:g, { transform: "translate(#{10+delta_x} #{12+delta_y}) scale(0.7)" })
      //
      // tile__water CSS (main.css): fill:none; stroke:#147ebe; stroke-width:2;
      //                             stroke-linecap:round; stroke-linejoin:round
      //
      // Coordinate transform: tobymao group is translate(10+dx, 12+dy) scale(0.7)
      //   in 100-unit space.  Scale to our space: ×0.4.
      //   Net path scale = 0.4 × 0.7 = 0.28.
      //   Group origin   = (10×0.4 + dx, 12×0.4 + dy)
      //
      // !! Do NOT use scale(0.4*0.7) written as scale(0.28) then change it.
      //    The 0.28 = 0.4 (hex scale) × 0.7 (tobymao's own scale(0.7)). !!
      const tx = (10 * 0.4 + dx).toFixed(2); // (10 + delta_x) × 0.4
      const ty = (12 * 0.4 + dy).toFixed(2); // (12 + delta_y) × 0.4
      return `<g transform="translate(${tx},${ty}) scale(0.28)">` + // 0.28 = 0.4×0.7
             `<path d="M -15 -7 Q -7.5 -15 0 -7 S 7.5 1 15 -7 M -15 -2 Q -7.5 -10 0 -2 S 7.5 6 15 -2"` +
             ` fill="none" stroke="#147ebe" stroke-width="2"` + // tile__water CSS
             ` stroke-linecap="round" stroke-linejoin="round"/>` +
             `</g>`;
    }

    case 'river':
      // source: /icons/river.svg — same wave shape as WATER_PATH, darker blue.
      // stroke:#0a2ebe  (from river.svg stroke attribute, NOT #147ebe water blue)
      // Slightly thicker stroke (2.8 vs 2.0) to visually distinguish from water.
      // Same coordinate transform as water case (translate + scale(0.28)).
      return `<g transform="translate(${(10*0.4+dx).toFixed(2)},${(12*0.4+dy).toFixed(2)}) scale(0.28)">` +
             `<path d="M -15 -7 Q -7.5 -15 0 -7 S 7.5 1 15 -7 M -15 -2 Q -7.5 -10 0 -2 S 7.5 6 15 -2"` +
             ` fill="none" stroke="#0a2ebe" stroke-width="2.8"` + // river.svg colour
             ` stroke-linecap="round" stroke-linejoin="round"/>` +
             `</g>`;

    case 'lake':
      // source: /icons/lake.svg — two rows of wavy lines, viewBox -12.5 -12.5 25 25
      // stroke:#67a7c4 (from lake.svg)
      // Centered at (dx+S/2, dy+S/2); scaled so the 25-unit viewBox fits in S px.
      return `<g transform="translate(${(dx+S/2).toFixed(2)},${(dy+S/2).toFixed(2)}) scale(${(S/25).toFixed(3)})">` +
             `<path d="M-10.75 3c0 3 6 3 6 0 0 3 6 3 6 0 0 3 6 3 6 0m-15-8c0 3 6 3 6 0 0 3 6 3 6 0 0 3 6 3 6 0"` +
             ` fill="none" stroke="#67a7c4" stroke-width="2"` + // lake.svg colour
             ` stroke-linecap="round" stroke-linejoin="round"/>` +
             `</g>`;

    case 'hill':
      // source: /icons/hill.svg — green dome, viewBox 0 0 174 87 (half-ellipse shape)
      // fill:#4e983b (from hill.svg)
      // Rendered as an ellipse (top half = dome) + rect (bottom fill = hex background)
      // to clip the lower half of the ellipse and match the flat-bottom dome shape.
      return `<ellipse cx="${(dx+S/2).toFixed(2)}" cy="${(dy+S/2).toFixed(2)}"` +
             ` rx="${(S/2).toFixed(2)}" ry="${(S/4).toFixed(2)}"` +
             ` fill="#4e983b"/>` + // hill.svg green
             `<rect x="${px}" y="${(dy+S/2).toFixed(2)}"` +
             ` width="${S.toFixed(2)}" height="${(S/2).toFixed(2)}"` +
             ` fill="${TERRAIN_COLORS[''] || '#c8a87a'}"/>`; // hex bg colour clips dome base

    case 'swamp':
    case 'marsh':
      // source: /icons/swamp.svg — three drooping U-shapes, viewBox -12.5 -12.5 25 25
      // stroke:#59b578 (from swamp.svg)
      // The black outline path (stroke-width:4) is the .svg's shadow/outline layer;
      // the green path (stroke-width:1.5) is the foreground.  Both paths verbatim.
      return `<g transform="translate(${(dx+S/2).toFixed(2)},${(dy+S/2).toFixed(2)}) scale(${(S/25).toFixed(3)})">` +
             `<path fill="none" stroke="#000" stroke-linecap="round" stroke-linejoin="round" stroke-width="4"` +
             ` d="M-7.5 3q0-3.75-3.75-3.75M-7.5 3q0-3.75 3.75-3.75` +
             `M0-.75Q0-4.5-3.75-4.5M0-.75Q0-4.5 3.75-4.5` +
             `M7.5 3q0-3.75 3.75-3.75M7.5 3q0-3.75-3.75-3.75"/>` +
             `<path fill="none" stroke="#59b578" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"` + // swamp.svg green
             ` d="M-7.5 3q0-3.75-3.75-3.75M-7.5 3q0-3.75 3.75-3.75` +
             `M0-.75Q0-4.5-3.75-4.5M0-.75Q0-4.5 3.75-4.5` +
             `M7.5 3q0-3.75 3.75-3.75M7.5 3q0-3.75-3.75-3.75"/>` +
             `</g>`;

    case 'forest':
    case 'tree':
      // source: /icons/tree.svg — tobymao maps 'forest' → icon:'tree' (upgrade.rb line 113)
      // 'tree' is the canonical key used by the terrain picker; 'forest' is kept
      // for backward-compat with any imported hexes that already use that key.
      return `<polygon transform="translate(${px},${py})"` +
             ` points="${(S/2).toFixed(2)},0 0,${S.toFixed(2)} ${S.toFixed(2)},${S.toFixed(2)}"` +
             ` fill="#2d7a2d"/>`;

    case 'cactus':
      // 'cactus' is the canonical key; 'desert' kept for backward-compat.
      // Falls through to 'desert' case below — same SVG path.
    case 'desert':
      // source: /icons/cactus.svg — tobymao maps 'desert' → icon:'cactus' (upgrade.rb line 107)
      return `<g transform="translate(${(dx+S/2).toFixed(2)},${(dy+S/2).toFixed(2)}) scale(${(S/25).toFixed(3)})">` +
             `<path fill="none" stroke="#000" stroke-linecap="round" stroke-linejoin="round" stroke-width="4"` +
             ` d="M0 8V-8M0 5q-5 0-5-5m5 0q5 0 5-5"/>` +
             `<path fill="none" stroke="#59b578" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"` +
             ` d="M0 8V-8M0 5q-5 0-5-5m5 0q5 0 5-5"/>` +
             `</g>`;

    case 'pass':
      // tobymao has no dedicated 'pass' icon — pass terrain uses mountain (upgrade.rb).
      // We render two overlapping brown triangles to suggest a mountain pass gap.
      // Both use the same #cb7745 fill as single mountain.
      return `<polygon transform="translate(${(dx-S*0.3).toFixed(2)},${dy.toFixed(2)})"` +
             ` points="0,${S.toFixed(2)} ${(S*0.5).toFixed(2)},0 ${S.toFixed(2)},${S.toFixed(2)}"` +
             ` fill="#cb7745"/>` +
             `<polygon transform="translate(${(dx+S*0.3).toFixed(2)},${(dy+S*0.15).toFixed(2)})"` +
             ` points="0,${(S*0.85).toFixed(2)} ${(S*0.5).toFixed(2)},0 ${S.toFixed(2)},${(S*0.85).toFixed(2)}"` +
             ` fill="#9b6030"/>`;

    default:
      // Unknown terrain type: fall back to a brown mountain so cost is still visible.
      return `<polygon transform="translate(${px},${py})"` +
             ` points="0,${S.toFixed(2)} ${(S/2).toFixed(2)},0 ${S.toFixed(2)},${S.toFixed(2)}"` +
             ` fill="#cb7745"/>`;
  }
}

// buildIconsSvg: resource icons (mine/port/factory) in hex-local world-unit coords.
function buildIconsSvg(hex) {
  if (!hex.icons || hex.icons.length === 0) return '';
  const s   = 7;
  const ox0 = HEX_SIZE * 0.32;
  const oy  = HEX_SIZE * 0.28;
  const gap = s * 1.6;
  const n   = hex.icons.length;
  let svg = '';
  hex.icons.forEach((icon, idx) => {
    const ix = ox0 + (idx - (n - 1) / 2) * gap;
    svg += `<g transform="translate(${ix.toFixed(1)},${oy.toFixed(1)})">`;
    if (icon.image === 'mine') {
      const d = (s*0.7).toFixed(2), r = (s*0.22).toFixed(2);
      svg += `<line x1="${-d}" y1="${-d}" x2="${d}" y2="${d}" stroke="#5a3e1b" stroke-width="1.5" stroke-linecap="round"/>`;
      svg += `<line x1="${d}" y1="${-d}" x2="${-d}" y2="${d}" stroke="#5a3e1b" stroke-width="1.5" stroke-linecap="round"/>`;
      svg += `<circle cx="${-d}" cy="${-d}" r="${r}" fill="#8B6914"/>`;
      svg += `<circle cx="${d}" cy="${-d}" r="${r}" fill="#8B6914"/>`;
    } else if (icon.image === 'port') {
      const shaft = (s*0.75).toFixed(2), bar = (s*0.42).toFixed(2), ring = (s*0.16).toFixed(2);
      const cr = s*0.65, cy_a = s*0.05;
      const ax1 = (Math.cos(0.2)*cr).toFixed(2),  ay  = (cy_a+Math.sin(0.2)*cr).toFixed(2);
      const ax2 = (Math.cos(Math.PI-0.2)*cr).toFixed(2);
      svg += `<line x1="0" y1="${-shaft}" x2="0" y2="${shaft}" stroke="#1a3a7a" stroke-width="1.2" stroke-linecap="round"/>`;
      svg += `<line x1="${-bar}" y1="${-bar}" x2="${bar}" y2="${-bar}" stroke="#1a3a7a" stroke-width="1.2" stroke-linecap="round"/>`;
      svg += `<circle cx="0" cy="${-shaft}" r="${ring}" fill="#1a3a7a"/>`;
      svg += `<path d="M ${ax1},${ay} A ${cr.toFixed(2)},${cr.toFixed(2)} 0 0 0 ${ax2},${ay}" stroke="#1a3a7a" stroke-width="1.2" fill="none" stroke-linecap="round"/>`;
      svg += `<circle cx="${ax1}" cy="${ay}" r="${(s*0.13).toFixed(2)}" fill="#1a3a7a"/>`;
      svg += `<circle cx="${ax2}" cy="${ay}" r="${(s*0.13).toFixed(2)}" fill="#1a3a7a"/>`;
    } else if (icon.image === 'factory') {
      svg += `<rect x="${(-s*0.7).toFixed(2)}" y="${(-s*0.2).toFixed(2)}" width="${(s*1.4).toFixed(2)}" height="${s.toFixed(2)}" fill="#555"/>`;
      svg += `<rect x="${(-s*0.45).toFixed(2)}" y="${(-s*0.9).toFixed(2)}" width="${(s*0.28).toFixed(2)}" height="${(s*0.7).toFixed(2)}" fill="#555"/>`;
      svg += `<rect x="${(s*0.17).toFixed(2)}" y="${(-s*0.75).toFixed(2)}" width="${(s*0.28).toFixed(2)}" height="${(s*0.55).toFixed(2)}" fill="#555"/>`;
      svg += `<rect x="${(-s*0.2).toFixed(2)}" y="0" width="${(s*0.4).toFixed(2)}" height="${(s*0.3).toFixed(2)}" fill="#aaddff"/>`;
    } else {
      svg += `<circle r="${(s*0.5).toFixed(2)}" fill="#888"/>`;
    }
    svg += '</g>';
  });
  return svg;
}

// ─── EDGE POSITION HELPERS FOR SVG (flat-top unrotated, 50-unit space) ───────
//
// This renderer is a JavaScript port of the relevant geometry from tobymao's
// 18xx-maker engine (assets/app/view/game/part/ and lib/engine/part/).  We work
// at HALF tobymao's coordinate scale (tobymao = 100-unit hex; ours = 50-unit) so
// that the numbers fit cleanly in SVG without a global 0.5 scale transform.
//
// Scale table  (tobymao value → our value):
//   HEX_INRADIUS   87  → 43.5   track endpoint distance from center
//   SLOT_RADIUS    25  → 12.5   city/token circle radius   (city.rb)
//   CITY_EDGE_DIST 50  → 25     city center when placed at an edge
//   TOWN_BAR       32×8 → 16×4  bar rect half-width/height
//   TRACK_WIDTH     9  → 5      stroke-width (rounded up for clarity at small size)
//
// Edge numbering — matches tobymao DSL throughout this file AND in static-hex-builder.js:
//   0 = S  (bottom)         ep(0) = (0, +43.5)
//   1 = SW (lower-left)     ep(1) = (-37.7, +21.75)
//   2 = NW (upper-left)     ep(2) = (-37.7, -21.75)
//   3 = N  (top)            ep(3) = (0, -43.5)
//   4 = NE (upper-right)    ep(4) = (+37.7, -21.75)
//   5 = SE (lower-right)    ep(5) = (+37.7, +21.75)
//
// ep(edge): track endpoint at hex edge midpoint.
// Formula: x = -sin(edge × π/3) × 43.5,  y = cos(edge × π/3) × 43.5
// (SVG y-axis points down, so edge 0 = directly below center.)
const DSL_SLOT_R  = 12.5;  // city/token circle radius
const DSL_CITY_D  = 25;    // city center distance from hex center (at an edge)
const DSL_TRACK_W = 5;     // track stroke-width
const DSL_BAR_RW  = 16;    // town bar half-width
const DSL_BAR_RH  = 4;     // town bar half-height

function ep(edge) {
  const a = edge * Math.PI / 3;
  return { x: -Math.sin(a) * 43.5, y: Math.cos(a) * 43.5 };
}

// ── Lane helpers ──────────────────────────────────────────────────────────────
// Tobymao formula (view/game/part/track_node_path.rb TrackNodePath#calculate_shift):
//   shift = ((idx * 2) - total + 1) * (width + PARALLEL_SPACING[total-2]) / 2.0
//   PARALLEL_SPACING = [8, 7, 6, 5]  (tobymao 100-unit space, for 2/3/4/5 total lanes)
//   width = 9  (tobymao 100-unit track stroke-width)
// Scaled ×0.5 for our 50-unit system: PARALLEL_SPACING → [4, 3.5, 3, 2.5], width → 5.
// DSL_TRACK_W is 5, so (DSL_TRACK_W + spacing)/2 acts as the per-step scale factor.
const _LANE_SPACING = [4, 3.5, 3, 2.5]; // ×0.5 of tobymao's [8,7,6,5] for total=2..5
function _laneShift(total, idx) {
  const spacing = (total >= 2 && total <= 5) ? _LANE_SPACING[total - 2] : 2.5;
  return ((idx * 2) - total + 1) * (DSL_TRACK_W + spacing) / 2.0;
}
// Shift a point laterally (perpendicular to the edge direction) by `shift` units.
// Edge direction vector: (-sin, cos).  Perpendicular: (cos, sin).
function _shiftPt(pt, edgeNum, shift) {
  const a = edgeNum * Math.PI / 3;
  return { x: pt.x + shift * Math.cos(a), y: pt.y + shift * Math.sin(a) };
}

// cityEdgePos: city center when placed at an edge (distance DSL_CITY_D=25).
function cityEdgePos(edge) {
  const a = edge * Math.PI / 3;
  return { x: -Math.sin(a) * DSL_CITY_D, y: Math.cos(a) * DSL_CITY_D };
}

// ─── computePreferredEdges ────────────────────────────────────────────────────
// Port of tobymao lib/engine/tile.rb Tile#compute_city_town_edges.
//
// Returns an array (length = hex.nodes.length); value at each index is:
//   • a numeric edge (0–5 or half-integer for OO) — place the city/town there
//   • null — place at the hex center
//
// Only city and town nodes receive meaningful values; all other types stay null.
//
// This result drives three things:
//   1. City symbol placement in hexToSvgInner (fix: uses first connEdge today)
//   2. Revenue bubble positioning in _buildDslRevenueSvg (fix: both cities
//      land on the same edge today because _nodeEdge returns null for both)
//   3. Location-name position in buildHexSvg (fix: always l_center today)
function computePreferredEdges(hex) {
  const nodes     = hex.nodes || [];
  const paths     = hex.paths || [];
  const cities    = nodes.filter(n => n.type === 'city');
  const towns     = nodes.filter(n => n.type === 'town');
  const cityTowns = nodes.filter(n => n.type === 'city' || n.type === 'town');

  // result[i] = preferred edge for nodes[i]; null = hex center.
  const result = new Array(nodes.length).fill(null);

  // ── Special case: no paths + (2 cities + 2 towns) ────────────────────────
  // "Multiple city/town option tiles" (tobymao uses div=3 for both arrays).
  if (paths.length === 0 && cities.length === 2 && towns.length === 2) {
    const div = 3;
    let ci = 0, ti = 0;
    for (let i = 0; i < nodes.length; i++) {
      const loc = _nodeEdge(nodes[i]);
      if      (nodes[i].type === 'city') result[i] = loc ?? ci++ * div;
      else if (nodes[i].type === 'town') result[i] = loc ?? ti++ * div;
    }
    return result;
  }

  // ── Special case: no paths + 2+ cities (no town constraint) ─────────────
  // Evenly space cities around the hex (div = floor(6/count)).
  if (paths.length === 0 && cities.length >= 2) {
    const div = Math.floor(6 / cities.length);
    let ci = 0;
    for (let i = 0; i < nodes.length; i++) {
      if (nodes[i].type === 'city') {
        result[i] = _nodeEdge(nodes[i]) ?? ci++ * div;
      }
    }
    return result;
  }

  // ── Special case: single city, no towns, no explicit loc → center ────────
  if (cities.length === 1 && towns.length === 0) {
    const ni = nodes.findIndex(n => n.type === 'city');
    const loc = _nodeEdge(nodes[ni]);
    if (loc !== null) result[ni] = loc;
    return result; // null = center when loc === null
  }

  // ── Special case: single town, no cities, exits ≠ 2, no loc → center ────
  if (cities.length === 0 && towns.length === 1) {
    const ni = nodes.findIndex(n => n.type === 'town');
    const loc = _nodeEdge(nodes[ni]);
    if (loc !== null) {
      result[ni] = loc;
      return result;
    }
    const tExits = paths.filter(p =>
      (p.a.type === 'node' && p.a.n === ni && p.b.type === 'edge') ||
      (p.b.type === 'node' && p.b.n === ni && p.a.type === 'edge')
    ).length;
    if (tExits !== 2) return result; // null = center
    // else: 2-exit single through-town → fall through to general case
  }

  // ── General case ─────────────────────────────────────────────────────────
  // Mirrors tobymao: populate ct_edges + edge_count from paths, sort ct_edges
  // by minimum connected edge, then assign each node its min-cost edge.

  // ctEdgesMap[nodeIdx] = list of edge numbers connected to that node via paths.
  const ctEdgesMap = {};
  for (let i = 0; i < nodes.length; i++) {
    if (nodes[i].type === 'city' || nodes[i].type === 'town') ctEdgesMap[i] = [];
  }

  // edge_count[e]: usage count of edge e, biased +0.1 at edge 0 to leave
  // room for the location name typically rendered at the hex bottom.
  const edgeCount = new Array(6).fill(0);
  edgeCount[0] += 0.1;

  for (const path of paths) {
    // Find which city/town node this path touches (if any).
    let nodeIdx = null;
    if (path.a.type === 'node') {
      const n = nodes[path.a.n];
      if (n && (n.type === 'city' || n.type === 'town')) nodeIdx = path.a.n;
    }
    if (nodeIdx === null && path.b.type === 'node') {
      const n = nodes[path.b.n];
      if (n && (n.type === 'city' || n.type === 'town')) nodeIdx = path.b.n;
    }
    if (nodeIdx === null) continue;

    // Collect the edge endpoint of this path and update edge_count.
    for (const side of [path.a, path.b]) {
      if (side.type === 'edge') {
        const e = side.n;
        ctEdgesMap[nodeIdx].push(e);
        edgeCount[e] += 1;
        edgeCount[(e + 1) % 6] += 0.1;
        edgeCount[(e - 1 + 6) % 6] += 0.1;
      }
    }
  }

  // Sort each node's edges ascending, then sort nodes by their minimum edge
  // (nodes with earlier minimum edge get priority in assignment).
  const ctList = Object.entries(ctEdgesMap)
    .map(([k, edges]) => ({ ni: parseInt(k), edges: edges.slice().sort((a, b) => a - b) }))
    .sort((a, b) => {
      const aMin = a.edges.length > 0 ? a.edges[0] : Infinity;
      const bMin = b.edges.length > 0 ? b.edges[0] : Infinity;
      return aMin - bMin || a.ni - b.ni;
    });

  // Assign preferred edge to each node, updating edge_count after each
  // assignment so later nodes avoid already-used edges.
  for (const { ni, edges } of ctList) {
    const loc = _nodeEdge(nodes[ni]);
    if (loc !== null) {
      result[ni] = loc;
      // No edge_count update for explicit locs (tobymao: `unless ct.loc`).
    } else if (edges.length > 0) {
      const best = edges.reduce((b, e) => edgeCount[e] < edgeCount[b] ? e : b);
      result[ni] = best;
      edgeCount[best] += 1;
      edgeCount[(best + 1) % 6] += 0.1;
      edgeCount[(best - 1 + 6) % 6] += 0.1;
    }
    // edges.length === 0 → pathless; handled by the pass below.
  }

  // ── Pathless city/town with one sibling: place opposite (+3) ────────────
  // tobymao: "take care of city/towns with no paths when there is one other ct"
  const pathlessCTs = cityTowns.filter(n => {
    const ni = nodes.indexOf(n);
    return (ctEdgesMap[ni] || []).length === 0 && _nodeEdge(n) === null;
  });
  if (pathlessCTs.length === 1 && cityTowns.length === 2) {
    const ni      = nodes.indexOf(pathlessCTs[0]);
    const otherNi = cityTowns.map(n => nodes.indexOf(n)).find(j => j !== ni);
    const other   = result[otherNi];
    if (other !== null && other !== undefined) {
      result[ni] = (Math.round(other) + 3) % 6;
    }
  }

  // ── Exitless city/towns with explicit loc (no-path but has locStr) ───────
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    if (n.type !== 'city' && n.type !== 'town') continue;
    const loc = _nodeEdge(n);
    if (loc !== null && result[i] === null) result[i] = loc;
  }

  return result;
}

// ─── HEX TO SVG INNER GEOMETRY ─────────────────────────────────────────────
// hexToSvgInner(hex, tileDef) — SVG string for the interior of one hex cell.
//
// Coordinate space: flat-top, unrotated, centered at (0,0), 50-unit scale.
// The caller in render() wraps the result in:
//   <g transform="translate(cx,cy) rotate(orientOff + tileDeg) scale(sc)">
// where orientOff is 0 for flat-top maps, 30 for pointy-top maps.
//
// SINGLE RENDERING PATH — all three tile sources converge here:
//
//   tile-packs.js tile   → TileRegistry → tileDef {nodes+paths, locStr on nodes}
//                          → hex synthesis below → DSL branch
//
//   manifest tile def    → TileRegistry (same pipeline as tile-packs)
//
//   inline DSL hex       → hex.nodes[] + hex.paths[] directly → DSL branch
//
// All sources produce nodes with locStr (set by parseDSL / import-ruby.js) and
// paths with {type,n} endpoints.  The renderer computes all positions itself —
// one canonical implementation, no pre-computation bypass.
//
// hex model fields consumed here:
//   nodes[]     — [{type, slots, locStr?, revenue?, style?}]
//   paths[]     — [{a:{type,n}, b:{type,n}, terminal?, aLane?, bLane?}]
//   pathPairs[] — [[ea,eb], …]  legacy edge-pairs (import fallback)
//   blankPaths[]— [[ea,eb], …]  hex-builder drawn tracks
//   exits[]     — [edge,…]      used for region_use initialisation only
//   feature     — string        terrain/revenue use only, NOT rendering
//   bg          — color string  used by the caller, not here

// Private helper — collect unique exit edge numbers from a normalised paths[].
function _exitsFromPaths(paths) {
  const s = new Set();
  for (const p of (paths || [])) {
    if (p.a?.type === 'edge') s.add(p.a.n);
    if (p.b?.type === 'edge') s.add(p.b.n);
  }
  return [...s];
}

function hexToSvgInner(hex, tileDef) {
  let svg = '';

  // ── Canonical path unification ────────────────────────────────────────────
  // When tileDef is provided, synthesise a hex-like object so the single DSL
  // branch below handles everything.  tileDef.nodes carry locStr (from parseDSL);
  // the renderer computes all positions the same way it does for map hexes.
  if (tileDef) {
    hex = {
      nodes: tileDef.nodes || [],
      paths: tileDef.paths || [],
      exits: _exitsFromPaths(tileDef.paths || []),
    };
    tileDef = null; // fall through to DSL branch below
  }

  // ─── DSL hexes (no tileDef) ──────────────────────────────────────────────────
  //
  // Rendering is entirely driven by hex.nodes[] and hex.paths[].
  //
  // !! FUTURE CLAUDE: do NOT add feature-switch rendering (if feature==='town' …).
  // !! hex.feature is a string summary used only by terrain-badge and revenue code.
  // !! Towns and cities are drawn solely by the nodes[] loop below.
  // !! If a hex has no nodes[], nothing is drawn — even if feature is set.
  // !! static-hex-builder.js must always write nodes[]+paths[] into the hex model.
  //
  // ── Node data model ──────────────────────────────────────────────────────────
  //   node.type   — 'town' | 'city' | 'junction'
  //   node.slots  — integer ≥ 1  (city only; 1=single, 2=double, etc.)
  //   node.locStr — optional position string:
  //                   'center' or omitted → default position logic below
  //                   '0'–'5'            → integer loc, angle = N × 60°
  //                   '0.5'–'5.5'        → half-integer loc (between two edges)
  //
  // ── Path data model ──────────────────────────────────────────────────────────
  //   path.a / path.b — endpoints, each { type: 'edge'|'node', n: index }
  //                     edge n = tobymao edge number (0=S, clockwise)
  //                     node n = index into hex.nodes[]
  //   path.terminal   — 1 or 2 for offboard terminal flags (pentagon shape)
  //
  // ── Node position logic (mirrors tobymao part/town_dot.rb + part/city.rb) ────
  //   City, single, center        → (0, 0)
  //   City, single, locStr N      → cityEdgePos(N)  (distance 25 toward edge N)
  //   City, OO / multi, no locStr → cityEdgePos(first connected exit edge)
  //   Town, locStr N              → (-sin(N×π/3)×25, cos(N×π/3)×25)
  //   Town, no locStr, 1+ edges   → computeTownPos(connected edges)  (midpoint arc)
  //   Town, no locStr, no edges   → origin, or OFFSET_TOWNS spread for 2+ such towns

  if (hex.nodes && hex.nodes.length > 0) {

    // ── Compute display positions for every node ────────────────────────────
    //
    // Uses the same 24-region @region_use system as buildTerrainSvg so that
    // no-edge town positions are placed via TownDot.preferred_render_locations
    // exactly as tobymao does — not via a hardcoded spread.
    //
    // Processes nodes SEQUENTIALLY so each placed node's regions are visible
    // to subsequent nodes (tobymao calls increment_cost() after each render).
    //
    // ── region_use initialisation ─────────────────────────────────────────
    // source: base.rb TRACK_TO_EDGE_N, CENTER
    const _ru = new Array(24).fill(0);
    const _TTE = [[15,21],[13,14],[6,7],[2,8],[9,10],[16,17]]; // TRACK_TO_EDGE_N
    for (const e of (hex.exits || [])) {
      const rr = _TTE[e]; if (rr) for (const r of rr) _ru[r] += 1;
    }
    // Cities pre-occupy CENTER; done before the loop so they affect town placement.
    const _CTR = [7,8,9,14,15,16]; // Base::CENTER
    for (const node of hex.nodes) {
      if (node.type === 'city') for (const r of _CTR) _ru[r] += 1;
    }

    // ── TownDot.OFFSET_TOWNS ──────────────────────────────────────────────
    // source: assets/app/view/game/part/town_dot.rb lines 33-52
    // Used when more than one town in the tile has no edge connection.
    // Coords in tobymao 100-unit space; ×0.5 for our 50-unit space.
    // Weights on positions 2 and 3 are 0.5 (region_weights is a Hash there).
    // !! DO NOT change these coordinates or weights — they are tobymao constants !!
    const _OT = [
      { r: [13, 14], w: 1,   x: -20, y:  10 }, // x=-40,y=20  ×0.5
      { r: [9,  10], w: 1,   x:  20, y: -10 }, // x=40, y=-20 ×0.5
      { r: [6,   7], w: 0.5, x: -20, y: -10 }, // x=-40,y=-20 ×0.5 (weight=0.5)
      { r: [16, 17], w: 0.5, x:  20, y:  10 }, // x=40, y=20  ×0.5 (weight=0.5)
    ];
    // combined_cost: sum(region_use[r] * weight) for each region in the location
    const _otCost = loc => loc.r.reduce((s, r) => s + _ru[r] * loc.w, 0);
    // increment_cost: add weight to each region after placement
    const _otInc  = loc => { for (const r of loc.r) _ru[r] += loc.w; };

    const cityNodeCount = hex.nodes.filter(n => n.type === 'city').length;

    // Pre-compute preferred edges for all city/town nodes using tobymao's
    // compute_city_town_edges algorithm.  These drive city symbol placement
    // (below), revenue bubble positions, and location-name placement.
    const prefEdges = computePreferredEdges(hex);

    // Count towns without a preferred edge — exact port of tobymao's condition:
    //   @tile.towns.count { |t| !@tile.preferred_city_town_edges[t] } > 1
    // source: town_dot.rb preferred_render_locations
    // This correctly includes junction towns (3+ exits → null prefEdge) in addition
    // to isolated towns (0 exits → null prefEdge).  Bar towns always have a
    // non-null prefEdge so they are never counted here.
    const noEdgeTownCount = hex.nodes.filter((n, ni) =>
      n.type === 'town' && (prefEdges[ni] === null || prefEdges[ni] === undefined)
    ).length;

    // Total unique exit edges on this tile — used for center_town? check on every town.
    // source: town_location.rb center_town? → tile.exits.size
    const _allTileExitCount = (() => {
      const s = new Set();
      for (const p of (hex.paths || [])) {
        if (p.a?.type === 'edge') s.add(p.a.n);
        if (p.b?.type === 'edge') s.add(p.b.n);
      }
      return s.size;
    })();

    // Sequential position computation
    const nodePos = [];
    for (let ni = 0; ni < hex.nodes.length; ni++) {
      const node = hex.nodes[ni];

      const connEdges = (hex.paths || [])
        .filter(p =>
          (p.a.type === 'node' && p.a.n === ni && p.b.type === 'edge') ||
          (p.b.type === 'node' && p.b.n === ni && p.a.type === 'edge'))
        .map(p => p.a.type === 'edge' ? p.a.n : p.b.n);

      if (node.type === 'junction') {
        // Junction nodes sit at hex center.
        // source: tobymao Part::Junction — sea/port interchange, rendered as small dot.
        // Position is always (0,0); no region tracking needed (junction is a minor part).
        nodePos.push({ x: 0, y: 0, angle: 0 });

      } else if (node.type === 'city') {
        let pos;
        if (node.locStr && node.locStr !== 'center') {
          const f = parseFloat(node.locStr);
          if (!isNaN(f)) {
            const a = f * Math.PI / 3;
            // source: city.rb preferred_render_locations → angle: @edge * 60
            pos = { x: -Math.sin(a) * DSL_CITY_D, y: Math.cos(a) * DSL_CITY_D, angle: f * 60 };
          }
        }
        if (!pos) {
          if (cityNodeCount >= 2) {
            // Use tobymao compute_city_town_edges result (preferred edge) for this city.
            // Falls back to center only when the algorithm returns null (extremely rare
            // in valid hex DSL, but safe default).
            const prefEdge = prefEdges[ni];
            pos = (prefEdge !== null && prefEdge !== undefined)
              ? { ...cityEdgePos(prefEdge), angle: prefEdge * 60 }
              : { x: 0, y: 0, angle: 0 };
          } else {
            pos = { x: 0, y: 0, angle: 0 };
          }
        }
        nodePos.push(pos);
        // Cities were pre-incremented above; no additional _ru update here.

      } else {
        // Town
        // source: tobymao town.rb, town_rect.rb, town_dot.rb
        let pos;
        if (node.locStr && node.locStr !== 'center') {
          const f = parseFloat(node.locStr);
          if (!isNaN(f)) {
            const a = f * Math.PI / 3;
            pos = { x: -Math.sin(a) * 25, y: Math.cos(a) * 25, angle: f * 60 };
          }
        }
        if (!pos) {
          // Determine bar vs dot — port of tobymao town.rb rect?:
          //   @style ? (@style == :rect) : (!paths.empty? && paths.size < 3)
          // paths = ALL paths touching this town (edge→node AND node→node).
          const allTownPaths = (hex.paths || []).filter(p =>
            (p.a?.type === 'node' && p.a.n === ni) ||
            (p.b?.type === 'node' && p.b.n === ni)
          );
          const isTownBar = node.style
            ? node.style === 'rect'
            : (allTownPaths.length > 0 && allTownPaths.length < 3);

          if (isTownBar) {
            // center_town? = exits.size==2 && tile.exits.size ∈ {2,3}
            // source: town_location.rb center_town?
            const isCenterTown = connEdges.length === 2 &&
              (_allTileExitCount === 2 || _allTileExitCount === 3);

            if (isCenterTown || connEdges.length !== 2) {
              // Center town or non-2-exit bar: arc-midpoint formula.
              // source: town_location.rb town_position → center_town? branch.
              const tp = computeTownPos(connEdges);
              pos = { x: tp.x, y: tp.y, angle: tp.angle };
            } else {
              // Non-center 2-exit bar town (tile has ≥4 exits total).
              // source: town_location.rb town_position + town_rotation_angles → else branch.
              const _POSITIONAL_ANGLE = { sharp: 12.12, gentle: 6.11 };
              const _RECTANGLE_TILT   = { sharp: 40,    gentle: 15    };

              // normalized_edges: ea = prefEdge (or connEdges[0]), eb = other exit
              // if |ea-eb|>3, add 6 to the smaller to unwrap the short path.
              // source: town_location.rb normalized_edges
              const pe = prefEdges[ni];
              let ea = (pe !== null && pe !== undefined) ? pe : connEdges[0];
              let eb = connEdges.find(e => e !== ea) ?? connEdges[1];
              if (Math.abs(ea - eb) > 3) {
                if (Math.min(ea, eb) === ea) ea += 6; else eb += 6;
              }

              const diff = Math.abs(ea - eb);
              const trackType = diff === 1 ? 'sharp' : diff === 2 ? 'gentle' : 'straight';
              const dir = diff === 3 ? 'straight' : ea > eb ? 'right' : 'left';

              const posAngle = _POSITIONAL_ANGLE[trackType] || 0;
              const tilt     = _RECTANGLE_TILT[trackType]   || 0;
              const deltaPos = dir === 'left' ? posAngle : dir === 'right' ? -posAngle : 0;
              const deltaRot = dir === 'left' ? -tilt    : dir === 'right' ?  tilt     : 0;

              // barPos values from tobymao town_location.rb POSITIONAL_RADIUS constants
              const barPos  = trackType === 'sharp' ? 55.70 : trackType === 'gentle' ? 48.05 : 40;
              const axisRad = (ea * 60 + deltaPos) * Math.PI / 180;

              pos = {
                x: +(-Math.sin(axisRad) * barPos / 2).toFixed(2),
                y: +( Math.cos(axisRad) * barPos / 2).toFixed(2),
                angle: ea * 60 + deltaRot,
              };
            }
          } else {
            // Dot town: use preferred edge from computePreferredEdges.
            // source: town_dot.rb preferred_render_locations → @edge branch.
            const prefEdge = prefEdges[ni]; // null when no preferred edge
            if (prefEdge !== null && prefEdge !== undefined) {
              // Dot with a preferred edge: 25 units toward that edge.
              // source: town_dot.rb → x: -sin(@edge*60°)*50, y: cos(@edge*60°)*50
              //   (tobymao 100-unit → our 50-unit = ÷2)
              const a = prefEdge * Math.PI / 3;
              pos = { x: -Math.sin(a) * 25, y: Math.cos(a) * 25, angle: prefEdge * 60 };
            } else {
              // Dot with no preferred edge: CENTER_TOWN or OFFSET_TOWNS.
              // source: town_dot.rb → !@tile.preferred_city_town_edges[t] branch.
              if (noEdgeTownCount > 1) {
                // Multiple centerless towns: OFFSET_TOWNS via combinedCost, index tiebreak.
                // source: town_dot.rb preferred_render_locations + base.rb min_by logic.
                let best = _OT[0], bestCost = _otCost(_OT[0]);
                for (let i = 1; i < _OT.length; i++) {
                  const c = _otCost(_OT[i]);
                  if (c < bestCost) { best = _OT[i]; bestCost = c; }
                }
                _otInc(best); // update region_use for subsequent centerless towns
                pos = { x: best.x, y: best.y, angle: 0 };
              } else {
                // Single centerless town: CENTER_TOWN at origin.
                // source: town_dot.rb CENTER_TOWN = [{ region_weights: CENTER, x: 0, y: 0 }]
                pos = { x: 0, y: 0, angle: 0 };
              }
            }
          }
        }
        nodePos.push(pos);
      }
    }

    // ── STEP 1: Draw track segments (paths) — rendered UNDER nodes ──────────
    // source: tobymao view/game/part/track.rb + track_node_path.rb
    // Lane support: tobymao TrackNodePath#load_from_tile shifts both endpoints of a
    // path by calculate_shift(lane) in direction (cos,sin) of the reference edge, so
    // the track segment moves laterally as a whole unit (parallel, not fan-shaped).
    // begin_shift_edge = begin_edge || end_edge; end_shift_edge = end_edge || begin_edge
    // i.e. whichever endpoint IS an edge determines the perpendicular shift direction.
    for (const path of (hex.paths || [])) {
      const aL = path.aLane || null;   // [total, idx] or null
      const bL = path.bLane || null;

      // Base positions
      let posA = path.a.type === 'edge' ? ep(path.a.n) : (nodePos[path.a.n] || { x: 0, y: 0 });
      let posB = path.b.type === 'edge' ? ep(path.b.n) : (nodePos[path.b.n] || { x: 0, y: 0 });

      // Edge endpoints shift in their own perpendicular direction.
      if (path.a.type === 'edge' && aL && aL[0] > 1) posA = _shiftPt(posA, path.a.n, _laneShift(aL[0], aL[1]));
      if (path.b.type === 'edge' && bL && bL[0] > 1) posB = _shiftPt(posB, path.b.n, _laneShift(bL[0], bL[1]));
      // Node endpoints shift using their OWN lane spec (tobymao: end_lane = @path.lanes[b_side]).
      // Direction = the edge number on the other endpoint (end_shift_edge = @end_edge || @begin_edge).
      // This handles both: lanes:N (aLane=bLane, parallel result) and explicit b_lane: only
      // (only node side shifts, track fans toward the city — correct for boundary entry paths).
      const _edgeN = path.a.type === 'edge' ? path.a.n : (path.b.type === 'edge' ? path.b.n : null);
      if (path.b.type === 'node' && bL && bL[0] > 1 && _edgeN !== null) posB = _shiftPt(posB, _edgeN, _laneShift(bL[0], bL[1]));
      if (path.a.type === 'node' && aL && aL[0] > 1 && _edgeN !== null) posA = _shiftPt(posA, _edgeN, _laneShift(aL[0], aL[1]));

      if (path.a.type === 'node' && path.b.type === 'node') {
        // Internal path (node→node, e.g. city→town in 1822 D35): straight line.
        // No arc needed — both endpoints are interior points, not edge midpoints.
        svg += `<line x1="${posA.x.toFixed(1)}" y1="${posA.y.toFixed(1)}" x2="${posB.x.toFixed(1)}" y2="${posB.y.toFixed(1)}" stroke="#000" stroke-width="${DSL_TRACK_W}" stroke-linecap="round"/>`;
      } else {
        // Edge→node or edge→edge path
        const ePt = path.a.type === 'edge' ? posA : posB;
        const nPt = path.a.type === 'edge' ? posB : posA;

        if (path.terminal) {
          // Terminal path: tobymao track_node_path.rb build_props terminal branch.
          // Lane shift applied to terminal_start_x / terminal_end_x BEFORE the rotate transform
          // (tobymao build_props lines 435-440: terminal_start_x += begin_shift).
          // tLane = the edge side's lane spec (a if a is edge, else b).
          const edgeNum = path.a.type === 'edge' ? path.a.n : path.b.n;
          const tLane   = path.a.type === 'edge' ? aL : bL;
          const tShift  = (tLane && tLane[0] > 1) ? _laneShift(tLane[0], tLane[1]) : 0;
          const hw = DSL_TRACK_W / 2;
          const x1 = (hw + tShift).toFixed(2), x2 = (-hw + tShift).toFixed(2), xm = tShift.toFixed(2);
          const d = path.terminal === 2
            ? `M ${x1} 42.5 L ${x1} 43.5 L ${x2} 43.5 L ${x2} 42.5 L ${xm} 32.5 Z`
            : `M ${x1} 35.0 L ${x1} 43.5 L ${x2} 43.5 L ${x2} 35.0 L ${xm} 17.5 Z`;
          svg += `<path d="${d}" transform="rotate(${edgeNum * 60})" fill="#222"/>`;
        } else {
          // Normal edge→node path: arc when off-center and not colinear through origin
          const isCenter = (Math.abs(nPt.x) < 0.5 && Math.abs(nPt.y) < 0.5);
          if (!isCenter && !checkColinear(ePt.x, ePt.y, nPt.x, nPt.y)) {
            const arc = calcArc(ePt.x, ePt.y, nPt.x, nPt.y);
            svg += `<path d="M ${ePt.x.toFixed(1)} ${ePt.y.toFixed(1)} A ${arc.radius.toFixed(2)} ${arc.radius.toFixed(2)} 0 0 ${arc.sweep} ${nPt.x.toFixed(1)} ${nPt.y.toFixed(1)}" stroke="#000" stroke-width="${DSL_TRACK_W}" stroke-linecap="round" fill="none"/>`;
          } else {
            svg += `<line x1="${ePt.x.toFixed(1)}" y1="${ePt.y.toFixed(1)}" x2="${nPt.x.toFixed(1)}" y2="${nPt.y.toFixed(1)}" stroke="#000" stroke-width="${DSL_TRACK_W}" stroke-linecap="round"/>`;
          }
        }
      }
    }

    // Edge-to-edge bypass paths (e.g. Altoona path=a:1,b:4 alongside city)
    // Also renders blankPaths (from hex builder) that coexist with a node feature.
    // hex.paths is the canonical source for imported maps (already rendered above with
    // lane offsets in STEP 1). Rendering pathPairs again here would double-draw those
    // tracks without the lane shift, cancelling the visual effect. Skip pathPairs when
    // hex.paths is populated; keep the blankPaths source for hex-builder-drawn tracks.
    const _eeBypass = (hex.paths && hex.paths.length > 0) ? [] : (hex.pathPairs || []);
    for (const [ea, eb] of [..._eeBypass, ...(hex.blankPaths || [])]) {
      const pa = ep(ea), pb = ep(eb);
      const diff = Math.abs(ea - eb);
      if (diff === 3 || diff === 0) {
        svg += `<line x1="${pa.x.toFixed(1)}" y1="${pa.y.toFixed(1)}" x2="${pb.x.toFixed(1)}" y2="${pb.y.toFixed(1)}" stroke="#000" stroke-width="${DSL_TRACK_W}" stroke-linecap="round"/>`;
      } else {
        const arc = calcArc(pa.x, pa.y, pb.x, pb.y);
        svg += `<path d="M ${pa.x.toFixed(1)} ${pa.y.toFixed(1)} A ${arc.radius} ${arc.radius} 0 0 ${arc.sweep} ${pb.x.toFixed(1)} ${pb.y.toFixed(1)}" stroke="#000" stroke-width="${DSL_TRACK_W}" stroke-linecap="round" fill="none"/>`;
      }
    }

    // ── STEP 2: Draw nodes — rendered OVER tracks ───────────────────────────
    for (let ni = 0; ni < hex.nodes.length; ni++) {
      const node = hex.nodes[ni];
      const pos  = nodePos[ni];

      if (node.type === 'city') {
        if (node.slots >= 2) {
          // Multi-slot city.
          // source: tobymao city.rb CITY_SLOT_POSITION + BOX_ATTRS.
          //
          // CITY_SLOT_POSITION[n] — starting offset before slot rotation (tobymao 100-unit × 0.5):
          const CITY_SLOT_POS = {
            1: [0, 0], 2: [-12.5, 0], 3: [0, -14.5], 4: [-12.5, -12.5],
            5: [0, -21.5], 6: [0, -25], 7: [0, -26], 8: [0, -27], 9: [0, -27.5],
          };
          const slots = node.slots;
          let [bx, by] = CITY_SLOT_POS[slots] || [0, 0];

          // For pointy-top maps the inner <g> is rotated +30°.  City slot positions
          // are defined in flat-top tile space, so we counter-rotate [bx,by] by −30°
          // before computing the per-slot offsets.  Because 2-D rotations commute:
          //   rotate(+30) × rotate(360/n × i) × rotate(−30) × [bx,by]
          //   = rotate(360/n × i) × [bx,by]
          // …so the final on-screen slot positions equal the un-rotated tobymao values.
          // The same −30° wrapper is applied to rect backdrops (slots 2 and 4) below
          // so they also appear axis-aligned on screen.  Circles and the hexagon are
          // rotationally symmetric and need no correction.
          const isPointy = (typeof state !== 'undefined') && state?.meta?.orientation === 'pointy';
          if (isPointy) {
            const cr = Math.cos(-Math.PI / 6), sr = Math.sin(-Math.PI / 6); // −30°
            [bx, by] = [cr * bx - sr * by, sr * bx + cr * by];
          }

          // Slot positions: rotate(pos.angle + 360/n × i) applied to [bx,by].
          // source: city.rb render_part → slot positions are in city-group local space
          // which is rotated by render_location[:angle] (= edge*60 for edge cities).
          // For flat-map center cities pos.angle=0 so behaviour is unchanged.
          const angleRad = (pos.angle || 0) * Math.PI / 180;
          const offsets = [];
          for (let i = 0; i < slots; i++) {
            const rad = angleRad + (2 * Math.PI / slots) * i;
            const cos = Math.cos(rad), sin = Math.sin(rad);
            offsets.push({ x: cos * bx - sin * by, y: sin * bx + cos * by });
          }

          // BOX_ATTRS — white backdrop behind slot circles (tobymao city.rb × 0.5):
          //   2: rect  SLOT_DIAMETER × SLOT_DIAMETER at (−SLOT_RADIUS, −SLOT_RADIUS)   → 25×25 at (−12.5,−12.5)
          //   3: hex polygon (Hex::POINTS × 0.458 × 0.5)
          //   4: rect  2×SLOT_DIAMETER × 2×SLOT_DIAMETER at (−SLOT_DIAMETER, −SLOT_DIAMETER) rx=SLOT_RADIUS → 50×50 at (−25,−25) rx=12.5
          //   5: circle r = 1.36 × SLOT_DIAMETER → r = 34
          //   6–9: circle r = 1.5 × SLOT_DIAMETER → r = 37.5
          // Rect backdrops (slots 2 and 4) are wrapped in rotate(-30) for pointy maps
          // so the outer +30° inner-group rotation leaves them screen-axis-aligned.
          const bWrap  = isPointy ? `<g transform="rotate(-30)">` : '';
          const bWrapZ = isPointy ? `</g>` : '';
          const SD = 2 * DSL_SLOT_R;  // SLOT_DIAMETER in our scale = 25
          if (slots === 2) {
            svg += bWrap + `<rect x="${(pos.x - DSL_SLOT_R).toFixed(1)}" y="${(pos.y - DSL_SLOT_R).toFixed(1)}" width="${SD.toFixed(1)}" height="${SD.toFixed(1)}" fill="white" stroke="none"/>` + bWrapZ;
          } else if (slots === 3) {
            svg += `<g transform="translate(${pos.x.toFixed(1)},${pos.y.toFixed(1)})">` +
                   `<polygon points="22.9,0 11.45,-19.923 -11.45,-19.923 -22.9,0 -11.45,19.923 11.45,19.923" fill="white" stroke="none"/>` +
                   `</g>`;
          } else if (slots === 4) {
            svg += bWrap + `<rect x="${(pos.x - SD).toFixed(1)}" y="${(pos.y - SD).toFixed(1)}" width="${(SD * 2).toFixed(1)}" height="${(SD * 2).toFixed(1)}" rx="${DSL_SLOT_R.toFixed(1)}" fill="white" stroke="none"/>` + bWrapZ;
          } else {
            const r = ((slots === 5 ? 1.36 : 1.5) * SD).toFixed(1);
            svg += `<circle cx="${pos.x.toFixed(1)}" cy="${pos.y.toFixed(1)}" r="${r}" fill="white" stroke="none"/>`;
          }
          for (const off of offsets) {
            svg += `<circle cx="${(pos.x + off.x).toFixed(1)}" cy="${(pos.y + off.y).toFixed(1)}" r="${DSL_SLOT_R}" fill="white" stroke="#000" stroke-width="2"/>`;
          }
        } else {
          // Single-slot city circle
          svg += `<circle cx="${pos.x.toFixed(1)}" cy="${pos.y.toFixed(1)}" r="${DSL_SLOT_R}" fill="white" stroke="#000" stroke-width="2"/>`;
        }

      } else if (node.type === 'town') {
        // tobymao town.rb: rect? = @style ? (@style == :rect) : (!paths.empty? && paths.size < 3)
        // paths = ALL paths that include this town as an endpoint (edge→node AND node→node).
        const _townPaths = (hex.paths || []).filter(_p =>
          (_p.a?.type === 'node' && _p.a.n === ni) ||
          (_p.b?.type === 'node' && _p.b.n === ni)
        );
        const isBarTown = node.style
          ? node.style === 'rect'
          : (_townPaths.length > 0 && _townPaths.length < 3);

        if (!isBarTown) {
          // TownDot (circle) — 0 paths (isolated dit) or 3+ paths (junction), or explicit style:dot.
          // tobymao source: town_dot.rb rendered when rect? is false.
          // pos.x/y: (0,0) for lone-dit; spread (±14,0) for double-dit (no exits).
          svg += `<circle cx="${pos.x.toFixed(1)}" cy="${pos.y.toFixed(1)}" r="5" fill="black" stroke="white" stroke-width="2"/>`;
        } else {
          // Town bar at computed position and angle
          svg += `<g transform="translate(${pos.x.toFixed(1)},${pos.y.toFixed(1)}) rotate(${pos.angle.toFixed(1)})">` +
                 `<rect x="${(-DSL_BAR_RW / 2).toFixed(1)}" y="${(-DSL_BAR_RH / 2).toFixed(1)}" width="${DSL_BAR_RW}" height="${DSL_BAR_RH}" fill="black" rx="1"/>` +
                 `</g>`;
        }

      } else if (node.type === 'junction') {
        // Junction: routing node only — no visual element.
        // source: tobymao has no view/game/part/junction.rb.
        // The engine Part::Junction exists for route-finding; nothing is drawn for it.
      }
    }

  } else if (hex.feature === 'offboard') {
    // Offboard exits: tobymao track_offboard.rb build_props pentagon in rotated edge frame.
    // source: track_offboard.rb — one pentagon per path, shifted by begin_shift in edge-local space.
    // Pentagon in tobymao 100-unit: M (hw+s) 75 L (hw+s) 87 L (-hw+s) 87 L (-hw+s) 75 L s 48 Z
    // In our 0.5 scale:             M (hw+s) 37.5 L (hw+s) 43.5 L (-hw+s) 43.5 L (-hw+s) 37.5 L s 24 Z
    // Build a map from exit edge number → array of lane specs from hex.paths.
    const _obLanesByEdge = new Map();
    for (const path of (hex.paths || [])) {
      // Determine which endpoint is the edge and get its lane spec.
      const isAEdge = path.a.type === 'edge';
      const edgeN   = isAEdge ? path.a.n : (path.b.type === 'edge' ? path.b.n : null);
      if (edgeN === null) continue;
      const laneSpec = isAEdge ? path.aLane : path.bLane;
      if (!laneSpec || laneSpec[0] <= 1) continue;
      if (!_obLanesByEdge.has(edgeN)) _obLanesByEdge.set(edgeN, []);
      _obLanesByEdge.get(edgeN).push(laneSpec);
    }
    const hw = DSL_TRACK_W / 2;
    for (const e of (hex.exits || [])) {
      const laneSpecs = _obLanesByEdge.get(e) || [];
      if (laneSpecs.length > 0) {
        // Render one shifted pentagon per lane — source: track_offboard.rb build_props.
        for (const laneSpec of laneSpecs) {
          const s  = _laneShift(laneSpec[0], laneSpec[1]);
          const x1 = (hw + s).toFixed(2), x2 = (-hw + s).toFixed(2), xm = s.toFixed(2);
          svg += `<path d="M ${x1} 37.5 L ${x1} 43.5 L ${x2} 43.5 L ${x2} 37.5 L ${xm} 24 Z" transform="rotate(${e * 60})" fill="#222"/>`;
        }
      } else {
        // No lane data for this exit — single centred pentagon (fallback / non-parallel paths).
        const x1 = hw.toFixed(2), x2 = (-hw).toFixed(2);
        svg += `<path d="M ${x1} 37.5 L ${x1} 43.5 L ${x2} 43.5 L ${x2} 37.5 L 0 24 Z" transform="rotate(${e * 60})" fill="#222"/>`;
      }
    }

  } else if ((hex.paths && hex.paths.length > 0) || (hex.pathPairs && hex.pathPairs.length > 0) || (hex.blankPaths && hex.blankPaths.length > 0)) {
    // Pure edge-to-edge path hex (no nodes at all).
    // hex.paths      — canonical paths model with lane support (from import-ruby.js)
    // hex.pathPairs  — legacy edge pairs (fallback when hex.paths is empty)
    // hex.blankPaths — paths drawn manually in the hex builder

    // Render hex.paths with lane offsets (same logic as STEP 1, nodePos unused here).
    for (const path of (hex.paths || [])) {
      const aL = path.aLane || null;
      const bL = path.bLane || null;
      let posA = path.a.type === 'edge' ? ep(path.a.n) : { x: 0, y: 0 };
      let posB = path.b.type === 'edge' ? ep(path.b.n) : { x: 0, y: 0 };
      if (path.a.type === 'edge' && aL && aL[0] > 1) posA = _shiftPt(posA, path.a.n, _laneShift(aL[0], aL[1]));
      if (path.b.type === 'edge' && bL && bL[0] > 1) posB = _shiftPt(posB, path.b.n, _laneShift(bL[0], bL[1]));
      const _eN2 = path.a.type === 'edge' ? path.a.n : (path.b.type === 'edge' ? path.b.n : null);
      if (path.b.type === 'node' && bL && bL[0] > 1 && _eN2 !== null) posB = _shiftPt(posB, _eN2, _laneShift(bL[0], bL[1]));
      if (path.a.type === 'node' && aL && aL[0] > 1 && _eN2 !== null) posA = _shiftPt(posA, _eN2, _laneShift(aL[0], aL[1]));
      if (!checkColinear(posA.x, posA.y, posB.x, posB.y)) {
        const arc = calcArc(posA.x, posA.y, posB.x, posB.y);
        svg += `<path d="M ${posA.x.toFixed(1)} ${posA.y.toFixed(1)} A ${arc.radius.toFixed(2)} ${arc.radius.toFixed(2)} 0 0 ${arc.sweep} ${posB.x.toFixed(1)} ${posB.y.toFixed(1)}" stroke="#000" stroke-width="${DSL_TRACK_W}" stroke-linecap="round" fill="none"/>`;
      } else {
        svg += `<line x1="${posA.x.toFixed(1)}" y1="${posA.y.toFixed(1)}" x2="${posB.x.toFixed(1)}" y2="${posB.y.toFixed(1)}" stroke="#000" stroke-width="${DSL_TRACK_W}" stroke-linecap="round"/>`;
      }
    }

    // Legacy pathPairs fallback (only when hex.paths is absent — pre-DSL saves).
    const _legacyPairs = (hex.paths && hex.paths.length > 0) ? [] : (hex.pathPairs || []);
    const drawSeg = (e1, e2) => {
      const p1 = ep(e1), p2 = ep(e2);
      const diff = Math.abs(e1 - e2);
      if (diff === 3 || diff === 0) {
        svg += `<line x1="${p1.x.toFixed(1)}" y1="${p1.y.toFixed(1)}" x2="${p2.x.toFixed(1)}" y2="${p2.y.toFixed(1)}" stroke="#000" stroke-width="${DSL_TRACK_W}" stroke-linecap="round"/>`;
      } else {
        const arc = calcArc(p1.x, p1.y, p2.x, p2.y);
        svg += `<path d="M ${p1.x.toFixed(1)} ${p1.y.toFixed(1)} A ${arc.radius} ${arc.radius} 0 0 ${arc.sweep} ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}" stroke="#000" stroke-width="${DSL_TRACK_W}" stroke-linecap="round" fill="none"/>`;
      }
    };
    for (const [ea, eb] of _legacyPairs) drawSeg(ea, eb);
    for (const [ea, eb] of (hex.blankPaths || [])) drawSeg(ea, eb);
  }

  // ── Stubs — drawn unconditionally, can appear on any hex ───────────────────
  // source: tobymao track_stub.rb build_props — M 0 87 L 0 65 (100-unit) → M 0 43.5 L 0 32.5 (×0.5)
  // stroke-linecap:'butt' per source (not round).
  for (const stub of (hex.stubs || [])) {
    svg += `<path d="M 0 43.5 L 0 32.5" transform="rotate(${stub.edge * 60})" stroke="#000" stroke-width="${DSL_TRACK_W}" stroke-linecap="butt" fill="none"/>`;
  }

  return svg;
}

function escSvg(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ── _nameSegments ─────────────────────────────────────────────────────────────
// Splits a location name across multiple lines when it exceeds max_size chars.
// Direct port of tobymao location_name.rb self.name_segments (lines 156-188).
// max_size defaults to 12 (tobymao default).
function _nameSegments(name) {
  if (!name) return [];
  if (name.length <= 12) return [name];
  const words = name.split(' ');
  switch (words.length) {
    case 3:
      // join middle with shorter of first/last; prefer first if equal length
      return words[0].length > words[2].length
        ? [words[0], words[1] + ' ' + words[2]]
        : [words[0] + ' ' + words[1], words[2]];
    case 4:
      return [words[0] + ' ' + words[1], words[2] + ' ' + words[3]];
    case 5: {
      const front = words[0] + ' ' + words[1];
      const back  = words[3] + ' ' + words[4];
      return front.length > back.length
        ? [front + ' ' + words[2], back]
        : [front, words[2] + ' ' + back];
    }
    default:
      return words;
  }
}

// ─── Tobymao-safe DSL Revenue Rendering ──────────────────────────────────────
//
// Direct port of the tobymao positioning algorithm for city/town flat revenue:
//   City#render_revenue  (assets/app/view/game/part/city.rb)
//   TownRect#render_revenue (assets/app/view/game/part/town_rect.rb)
//   Tile#should_render_revenue? (assets/app/view/game/tile.rb)
//
// Scale notes:
//   Tobymao uses a 100-unit hex.  We use 50-unit (half scale).
//   All _REV_* constants below are tobymao 100-unit values.
//   Final world coords = (tobymao_value / 2) × sc  (sc = HEX_SIZE / 50).
//
// Angle convention: SVG rotate(θ) — clockwise positive; 0° = x-axis (rightward).
//   So (d·cos θ, d·sin θ) is the vector in the rotated frame.

// REVENUE_DISPLACEMENT indexed by city slot count (flat layout, tobymao 100-unit).
const _REV_DISP_FLAT = [null, 42, 67, 65, 67, 0, 0, 0, 0, 0];

// ── Phase-revenue region-weight system ───────────────────────────────────────
// Full port of tobymao Part::Revenue#preferred_render_locations (revenue.rb) +
// the region-use accumulation performed by Part::Track, Part::Cities, Part::Towns
// before Part::Revenue renders.  Used to position FLAT multi-revenue (phase rev).
//
// sources:
//   base.rb           — region constants, combined_cost, increment_weight_for_regions
//   revenue.rb        — FLAT_MULTI_REVENUE_LOCATIONS (candidates)
//   track_node_path.rb — EXIT0_TO_EDGE_* tables, CW_REGION, calculate_regions
//   city.rb           — EDGE_CITY_REGIONS, EXTRA_SLOT_REGIONS
//   town_location.rb  — EDGE_TOWN_REGIONS
//   track_offboard.rb — REGIONS (pentagon region per exit edge)

// Region groups — base.rb
const _RRG_CENTER  = [7,8,9,14,15,16];   // CENTER
const _RRG_TOP_MID = [6,7,8,9,10];       // TOP_MIDDLE_ROW
const _RRG_BOT_MID = [13,14,15,16,17];   // BOTTOM_MIDDLE_ROW

// TRACK_TO_EDGE[e] — base.rb (regions for a straight stub toward edge e)
const _RRG_TRACK_TO_EDGE = [[15,21],[13,14],[6,7],[2,8],[9,10],[16,17]];

// CW_REGION — track_node_path.rb (rotate one edge-step clockwise)
const _RRG_CW = [3,4,10,11,18,1,2,8,9,16,17,23,0,6,7,14,15,21,22,5,12,13,19,20];

// EXIT0_TO_EDGE_BEZIER_REGIONS[rot_edge1] — track_node_path.rb (arcing paths)
const _RRG_E0_BEZIER = [
  [21],             // 0
  [13,14,15,21],    // 1
  [6,7,14,15,21],   // 2
  [2,8,15,21],      // 3
  [9,10,15,16,21],  // 4
  [15,16,17,21],    // 5
];

// EXIT0_TO_EDGE_LINE_REGIONS[rot_edge1] — track_node_path.rb (straight paths)
const _RRG_E0_LINE = [
  [21],             // 0
  [13,19,20],       // 1
  [6,7,14,15,21],   // 2
  [2,8,15,21],      // 3
  [9,10,15,16,21],  // 4
  [17,22,23],       // 5
];

// EDGE_CITY_REGIONS — city.rb (regions occupied by a city at each edge/half-edge)
const _RRG_CITY = {
  '0':   [15,20,21,22], '0.5': [13,14,15,19,20,21],
  '1':   [12,13,14,19], '1.5': [5,6,7,12,13,14],
  '2':   [0,5,6,7],     '2.5': [0,1,2,6,7,8],
  '3':   [1,2,3,8],     '3.5': [2,3,4,8,9,10],
  '4':   [4,9,10,11],   '4.5': [9,10,11,16,17,18],
  '5':   [16,17,18,23], '5.5': [15,16,17,21,22,23],
};

// EXTRA_SLOT_REGIONS — city.rb (additional regions for multi-slot cities)
const _RRG_EXTRA = {
  '0':   [13,14,16,17,19,20,22,23], '0.5': [12,22],
  '1':   [5,6,7,12,15,19,20,21],   '1.5': [0,19],
  '2':   [0,1,2,5,8,14,13,12],     '2.5': [3,5],
  '3':   [0,1,3,4,6,7,9,10],       '3.5': [1,11],
  '4':   [17,16,18,8,2,18,3,4],    '4.5': [4,17],
  '5':   [21,15,22,23,9,10,11,18], '5.5': [18,20],
};

// EDGE_TOWN_REGIONS — town_location.rb
const _RRG_TOWN = {
  '0':  [21], '0.5': [13,21], '1':  [13], '1.5': [6,13],
  '2':  [6],  '2.5': [2,6],  '3':  [2],  '3.5': [2,10],
  '4':  [10], '4.5': [10,17],'5':  [17], '5.5': [17,21],
};

// TrackOffboard REGIONS — track_offboard.rb (pentagon region per exit edge)
const _RRG_OFFBOARD = [21,13,6,2,10,17];

// Rotate a region list by `times` CW steps — port of track_node_path.rb rotate_regions
function _rrgRotate(regs, times) {
  let r = regs;
  for (let i = 0; i < times; i++) r = r.map(x => _RRG_CW[x]);
  return r;
}

// Regions occupied by a track path — port of track_node_path.rb calculate_regions.
// beginEdge: integer 0-5 (the exit/start edge).
// endEdge:   integer 0-5 (the other edge or city's preferred edge), or null for center.
// needArc:   boolean — true for curved paths.
// exit0 is always true for our path types (all have at least one exit).
function _rrgPathRegs(beginEdge, endEdge, needArc) {
  if (endEdge === null || endEdge === undefined) {
    // Center path (exit → center node) — track_node_path.rb @center=true branch
    return _RRG_TRACK_TO_EDGE[beginEdge] || [];
  }
  // Half-edge floats (e.g. 2.5 from loc:2.5 cities) produce fractional rot values;
  // round to nearest integer so we always index into a valid table row.
  const rot = Math.round(((endEdge - beginEdge) % 6 + 6) % 6);
  const base = needArc ? _RRG_E0_BEZIER[rot] : _RRG_E0_LINE[rot];
  return _rrgRotate(base || [], beginEdge);
}

// Build a 24-element regionUse array from all tile parts that render before Part::Revenue.
// Mirrors tobymao's @region_use accumulation in tile.rb render.
function _rrgBuildUse(hex) {
  const ru = new Array(24).fill(0);
  const mark = (regs) => { for (const r of (regs || [])) ru[r] += 1; };

  const prefEdges = computePreferredEdges(hex);
  const nodes = hex.nodes || [];

  // ── Part::Track — one TrackNodePath per path (or TrackOffboard for offboards) ──
  for (const path of (hex.paths || [])) {
    const aEdge = path.a.type === 'edge';
    const bEdge = path.b.type === 'edge';

    if (aEdge && bEdge) {
      // edge→edge: rot_edge = (b-a) mod 6; straight only if opposite (rot=3)
      const rot = ((path.b.n - path.a.n) % 6 + 6) % 6;
      mark(_rrgPathRegs(path.a.n, path.b.n, rot !== 3));
    } else if (aEdge) {
      // edge→node
      const ni = path.b.n;
      const pref = (ni < nodes.length) ? prefEdges[ni] : null;
      mark(_rrgPathRegs(path.a.n, (pref ?? null), pref != null));
    } else if (bEdge) {
      // node→edge (reversed)
      const ni = path.a.n;
      const pref = (ni < nodes.length) ? prefEdges[ni] : null;
      mark(_rrgPathRegs(path.b.n, (pref ?? null), pref != null));
    }
    // node→node: no track regions
  }

  // ── Part::Cities — EDGE_CITY_REGIONS (+ EXTRA_SLOT_REGIONS for multi-slot) ──
  for (let ni = 0; ni < nodes.length; ni++) {
    const node = nodes[ni];
    if (node.type !== 'city') continue;
    const edge = prefEdges[ni];
    if (edge != null) {
      const key = String(edge);
      mark(_RRG_CITY[key]);
      if ((node.slots || 1) > 1) mark(_RRG_EXTRA[key]);
    } else {
      mark(_RRG_CENTER); // center city marks CENTER (weight 1.0)
    }
  }

  // ── Part::Towns — EDGE_TOWN_REGIONS ──
  for (let ni = 0; ni < nodes.length; ni++) {
    const node = nodes[ni];
    if (node.type !== 'town') continue;
    const edge = prefEdges[ni];
    mark(edge != null ? _RRG_TOWN[String(edge)] : _RRG_CENTER);
  }

  // ── TrackOffboard pentagon — track_offboard.rb REGIONS ──
  if (hex.feature === 'offboard') {
    for (const e of (hex.exits || [])) ru[_RRG_OFFBOARD[e]] += 1;
  }

  return ru;
}

// Pick the best FLAT_MULTI_REVENUE_LOCATIONS candidate — port of revenue.rb +
// base.rb combined_cost.  Tiebreak: first candidate wins (center before top/bottom).
function _rrgPickFlat(ru) {
  const cands = [
    { regions: _RRG_CENTER,  x: 0, y:   0 }, // CENTER
    { regions: _RRG_TOP_MID, x: 0, y: -48 }, // TOP_MIDDLE_ROW
    { regions: _RRG_BOT_MID, x: 0, y:  45 }, // BOTTOM_MIDDLE_ROW
  ];
  let best = cands[0], bestCost = 1.5 * cands[0].regions.reduce((s,r) => s + ru[r], 0);
  for (let i = 1; i < cands.length; i++) {
    const cost = 1.5 * cands[i].regions.reduce((s,r) => s + ru[r], 0);
    if (cost < bestCost) { bestCost = cost; best = cands[i]; }
  }
  return best;
}

// ─── BLOCKER / RESERVATION / ASSIGNMENT PIPELINE ─────────────────────────────
// Port of tobymao Part::Blocker (blocker.rb), Part::Reservation (reservation.rb),
// Part::Assignments (assignments.rb + small_item.rb).
// Source files read: blocker.rb, reservation.rb, assignments.rb, small_item.rb, base.rb.
// Data model: hex.blocker={sym}, hex.reservations=[{sym},...], hex.assignments=[{sym,color,count},...]

// General region-weight location picker — reuses _locNameCost (base.rb#combined_cost port).
// Each candidate: { rw:[[[regions],weight],...], rwOut:[...](opt), x, y } in tobymao 100-unit.
// Tiebreak: first candidate wins (port of .min_by.with_index).
function _rrgPickLoc(cands, ru) {
  let best = cands[0], bestCost = _locNameCost(ru, cands[0].rw);
  for (let i = 1; i < cands.length; i++) {
    const cost = _locNameCost(ru, cands[i].rw);
    if (cost < bestCost) { bestCost = cost; best = cands[i]; }
  }
  return best;
}

// Mark chosen location's regions in ru — port of Base#increment_cost.
// Uses loc.rwOut (region_weights_out) if defined, else loc.rw (region_weights).
function _rrgMarkLoc(loc, ru) {
  for (const [regs, w] of (loc.rwOut || loc.rw)) for (const r of regs) ru[r] += w;
}

// blocker.rb preferred_render_locations (flat): P_LEFT_CORNER, P_BOTTOM_RIGHT.
// region_weights_in (rw) vs region_weights_out (rwOut) from blocker.rb lines 19-30.
const _BLK_FLAT_CANDS = [
  { rw:[[[5,12,13],1]], rwOut:[[[5,12],1]],  x:-65, y:5  }, // P_LEFT_CORNER
  { rw:[[[17,22,23],1]],rwOut:[[[22,23],1]], x:35,  y:60 }, // P_BOTTOM_RIGHT
];

// reservation.rb preferred_render_locations (flat layout).
// base.rb region constants: LEFT_CORNER=[5,12] LEFT_MID=[6,13] LEFT_CENTER=[7,14]
// RIGHT_CORNER=[11,18] RIGHT_MID=[10,17] RIGHT_CENTER=[9,16]
// UPPER_LEFT_CORNER=[0,1] UPPER_RIGHT_CORNER=[3,4]
// BOTTOM_LEFT_CORNER=[19,20] BOTTOM_RIGHT_CORNER=[22,23]
const _RES_SINGLE_1SLOT_FLAT = [                              // SINGLE_CITY_ONE_SLOT[:flat]
  { rw:[[[6,13,5,12],1],[[7,14],0.5]],   x:-55, y:0 },
  { rw:[[[10,17,11,18],1],[[9,16],0.5]], x:55,  y:0 }, // SINGLE_CITY_ONE_SLOT_RIGHT
];
const _RES_P_LEFT_FLAT   = { rw:[[[5,12],1],[[6,13],0.25]],   x:-71.25, y:0  }; // P_LEFT_CORNER
const _RES_P_RIGHT_FLAT  = { rw:[[[11,18],1],[[10,17],0.25]], x:71.25,  y:0  }; // P_RIGHT_CORNER
const _RES_P_BTMLEFT     = { rw:[[[19,20],1],[[21],0.5]],     x:-30,    y:65 }; // P_BOTTOM_LEFT_CORNER
const _RES_MULTI_CITY_FLAT = [     // MULTI_CITY_LOCATIONS (flat) — reservation.rb lines 77-129
  { rw:[[[2],1],[[1,3],0.5]],     x:0,      y:-60 }, // top center
  { rw:[[[6],1],[[5,7],0.5]],    x:-50,    y:-31 }, // edge 2
  { rw:[[[17],1],[[16,18],0.5]], x:50,     y:37  }, // edge 5
  { rw:[[[0,1],1],[[2],0.5]],    x:-30,    y:-65 }, // top left (UPPER_LEFT_CORNER)
  { rw:[[[3,4],1],[[2],0.5]],    x:30,     y:-65 }, // top right (UPPER_RIGHT_CORNER)
  _RES_P_LEFT_FLAT,
  _RES_P_RIGHT_FLAT,
  _RES_P_BTMLEFT,
  { rw:[[[22,23],1],[[21],0.5]], x:30,     y:65  }, // bottom right (BOTTOM_RIGHT_CORNER)
  { rw:[[[12,13],1],[[14],0.5]], x:-50,    y:25  }, // edge 1
  { rw:[[[21],1],[[20,22],0.5]], x:0,      y:60  }, // bottom center
];

// assignments.rb + small_item.rb: SMALL_ITEM_LOCATIONS (flat, 1 item), WIDE_ITEM_LOCATIONS (2+).
const _ASN_SMALL_FLAT = [
  { rw:[[[11,18],1]], x:75,    y:0      }, // P_RIGHT_CORNER
  { rw:[[[5,12],1]],  x:-75,   y:0      }, // P_LEFT_CORNER
  { rw:[[[22,23],1]], x:35,    y:60.62  }, // P_BOTTOM_RIGHT_CORNER
  { rw:[[[0,1],1]],   x:-35,   y:-60.62 }, // P_UPPER_LEFT_CORNER
  { rw:[[[19,20],1]], x:-35,   y:60.62  }, // P_BOTTOM_LEFT_CORNER
];
const _ASN_WIDE_FLAT = [
  { rw:[[[0,1,2,3,5,6],1]],        x:0, y:-65 }, // PP_WIDE_TOP_CORNER
  { rw:[[[17,18,20,21,22,23],1]],  x:0, y:65  }, // PP_WIDE_BOTTOM_CORNER
];

// ── _buildBlockerSvg ──────────────────────────────────────────────────────────
// Port of blocker.rb render_part. Renders company sym text + barbell at best position.
// hex.blocker = { sym: string }. sz = HEX_SIZE (tobymao 100-unit → world: ×sz/100).
// ru updated in place (port of increment_cost).
function _buildBlockerSvg(hex, ru, sz) {
  if (!hex?.blocker?.sym) return '';
  const loc = _rrgPickLoc(_BLK_FLAT_CANDS, ru);
  _rrgMarkLoc(loc, ru);
  const k = sz / 100;
  const bx = loc.x * k, by = loc.y * k;
  // Barbell: arc M(-11,6) A(44,44) 0 0 0 (11,6) + circles r=6 — blocker.rb lines 112-116.
  const x1 = (bx - 11*k).toFixed(2), x2 = (bx + 11*k).toFixed(2);
  const yb = (by + 6*k).toFixed(2);
  let svg = `<path d="M ${x1} ${yb} A ${(44*k).toFixed(2)} ${(44*k).toFixed(2)} 0 0 0 ${x2} ${yb}" fill="white"/>`;
  svg += `<circle cx="${x2}" cy="${yb}" r="${(6*k).toFixed(2)}" fill="white"/>`;
  svg += `<circle cx="${x1}" cy="${yb}" r="${(6*k).toFixed(2)}" fill="white"/>`;
  // Text: fill='black', dominant-baseline='baseline', at (0,−5) relative to group centre.
  svg += `<text x="${bx.toFixed(2)}" y="${(by - 5*k).toFixed(2)}" font-family="Lato,Arial,sans-serif" font-size="8" font-weight="bold" fill="black" text-anchor="middle" dominant-baseline="baseline">${escSvg(hex.blocker.sym)}</text>`;
  return svg;
}

// ── _buildReservationsSvg ─────────────────────────────────────────────────────
// Port of reservation.rb render_part. Renders reservation sym at preferred location.
// hex.reservations = [{ sym: string }, ...]. sz = HEX_SIZE. ru updated in place.
function _buildReservationsSvg(hex, ru, sz) {
  if (!hex?.reservations?.length) return '';
  const nodes     = hex.nodes || [];
  const cityTowns = nodes.filter(n => n.type === 'city' || n.type === 'town');
  const cities    = nodes.filter(n => n.type === 'city');
  const k = sz / 100;
  let svg = '';
  for (const res of hex.reservations) {
    let cands;
    if (cityTowns.length === 1) {
      // reservation.rb lines 180-183: multi-slot → P_LEFT_CORNER; 1-slot → left+right pair.
      cands = (cities.length === 1 && (cities[0].slots || 1) > 1)
        ? [_RES_P_LEFT_FLAT]
        : _RES_SINGLE_1SLOT_FLAT;
    } else if (cityTowns.length > 1) {
      cands = _RES_MULTI_CITY_FLAT;   // reservation.rb lines 185-186
    } else {
      cands = [_RES_P_LEFT_FLAT];     // reservation.rb line 189: P_LEFT_CORNER fallback
    }
    const loc = _rrgPickLoc(cands, ru);
    _rrgMarkLoc(loc, ru);
    const rx = (loc.x * k).toFixed(2), ry = (loc.y * k).toFixed(2);
    // reservation.rb line 198: transform='scale(1.1)' on inner text element.
    // Achieved via <g translate> so the scale affects glyph size only, not position.
    svg += `<g transform="translate(${rx},${ry})"><text font-family="Lato,Arial,sans-serif" font-size="9" font-weight="bold" fill="#111" text-anchor="middle" dominant-baseline="middle" transform="scale(1.1)">${escSvg(res.sym)}</text></g>`;
  }
  return svg;
}

// ── _buildAssignmentsSvg ──────────────────────────────────────────────────────
// Port of assignments.rb render_part. Renders assignment tokens as icon circles.
// hex.assignments = [{ sym: string, color: string (opt), count: int (opt) }, ...].
// ICON_RADIUS=20, DELTA=42 in tobymao 100-unit (assignments.rb lines 15-16).
// sz = HEX_SIZE. ru updated in place.
function _buildAssignmentsSvg(hex, ru, sz) {
  if (!hex?.assignments?.length) return '';
  const n   = hex.assignments.length;
  const loc = _rrgPickLoc(n === 1 ? _ASN_SMALL_FLAT : _ASN_WIDE_FLAT, ru);
  _rrgMarkLoc(loc, ru);
  const k = sz / 100, DELTA = 42, IR = 20; // assignments.rb constants (100-unit space)
  let svg = '';
  for (let i = 0; i < n; i++) {
    const asn    = hex.assignments[i];
    const offset = (i - (n - 1) / 2) * DELTA; // x-axis spread (flat layout)
    const cx = ((loc.x + offset) * k).toFixed(2);
    const cy = (loc.y * k).toFixed(2);
    const r  = (IR * k).toFixed(2);
    svg += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${asn.color || '#ccc'}" stroke="#555" stroke-width="${(0.6 * k).toFixed(2)}"/>`;
    if (asn.sym) {
      const fs = Math.max(4, Math.round(IR * k * 0.65)); // ~65% of radius → legible text
      svg += `<text x="${cx}" y="${cy}" font-family="Lato,Arial,sans-serif" font-size="${fs}" font-weight="bold" fill="#111" text-anchor="middle" dominant-baseline="middle">${escSvg(asn.sym)}</text>`;
    }
    const cnt = asn.count || 1;
    if (cnt > 1) { // stack count badge — assignments.rb lines 109-114
      const bcx = (parseFloat(cx) + 12 * k).toFixed(2);
      const bcy = (parseFloat(cy) - 12 * k).toFixed(2);
      svg += `<circle cx="${bcx}" cy="${bcy}" r="${(7 * k).toFixed(2)}" fill="white" stroke="#555" stroke-width="${(0.5 * k).toFixed(2)}"/>`;
      svg += `<text x="${bcx}" y="${bcy}" font-family="Lato,Arial,sans-serif" font-size="${Math.max(3, Math.round(6 * k))}" fill="#111" text-anchor="middle" dominant-baseline="middle">${cnt}</text>`;
    }
  }
  return svg;
}

// Canonical angle names (tobymao city.rb ANGLE_* constants, degrees).
const _ANG_RIGHT       = -5;
const _ANG_UPPER_RIGHT = -60;
const _ANG_LOWER_RIGHT =  10;
const _ANG_LOWER_LEFT  =  170;
const _ANG_UPPER_LEFT  = -120;
const _ANG_LEFT        = -175;

// REVENUE_LOCATIONS_BY_EDGE — candidate positions for a 1-slot edge city's revenue badge.
// Each entry: { r:[regions], a:angle }.  First entry = tobymao's preferred (lowest region cost).
// Key = edge number (integer or half-integer for OO cities).
const _REV_LOC_BY_EDGE = {
  0:   [{r:[19],a:_ANG_LOWER_LEFT}, {r:[14],a:_ANG_UPPER_LEFT}, {r:[23],a:_ANG_LOWER_RIGHT}, {r:[16],a:_ANG_UPPER_RIGHT}],
  0.5: [{r:[12,13],a:_ANG_LEFT},    {r:[7,14],a:_ANG_UPPER_LEFT},{r:[15,16],a:_ANG_UPPER_RIGHT},{r:[21,22],a:_ANG_RIGHT}],
  1:   [{r:[5],a:_ANG_LOWER_LEFT},  {r:[7],a:_ANG_UPPER_LEFT},   {r:[15],a:_ANG_UPPER_RIGHT},  {r:[20],a:_ANG_LOWER_RIGHT}],
  1.5: [{r:[0,6],a:_ANG_LEFT},      {r:[13,19],a:_ANG_RIGHT},    {r:[7,8],a:_ANG_UPPER_LEFT},  {r:[14,15],a:_ANG_UPPER_RIGHT}],
  2:   [{r:[12],a:_ANG_LOWER_RIGHT},{r:[14],a:_ANG_UPPER_RIGHT}, {r:[8],a:_ANG_UPPER_LEFT},    {r:[1],a:_ANG_LOWER_LEFT}],
  2.5: [{r:[5,6],a:_ANG_RIGHT},     {r:[7,14],a:_ANG_UPPER_RIGHT},{r:[8,9],a:_ANG_UPPER_LEFT}, {r:[2,3],a:_ANG_LEFT}],
  3:   [{r:[4],a:_ANG_LOWER_LEFT},  {r:[0],a:_ANG_LOWER_RIGHT},  {r:[9],a:_ANG_UPPER_LEFT},    {r:[7],a:_ANG_UPPER_RIGHT}],
  3.5: [{r:[10,11],a:_ANG_LEFT},    {r:[9,16],a:_ANG_UPPER_LEFT},{r:[7,8],a:_ANG_UPPER_RIGHT}, {r:[1,2],a:_ANG_RIGHT}],
  4:   [{r:[18],a:_ANG_LOWER_LEFT}, {r:[16],a:_ANG_UPPER_LEFT},  {r:[8],a:_ANG_UPPER_RIGHT},   {r:[3],a:_ANG_LOWER_RIGHT}],
  4.5: [{r:[4,10],a:_ANG_RIGHT},    {r:[17,23],a:_ANG_LEFT},     {r:[8,9],a:_ANG_UPPER_RIGHT}, {r:[15,16],a:_ANG_UPPER_LEFT}],
  5:   [{r:[11],a:_ANG_LOWER_RIGHT},{r:[9],a:_ANG_UPPER_RIGHT},  {r:[15],a:_ANG_UPPER_LEFT},   {r:[22],a:_ANG_LOWER_LEFT}],
  5.5: [{r:[17,18],a:_ANG_RIGHT},   {r:[14,15],a:_ANG_UPPER_LEFT},{r:[9,16],a:_ANG_UPPER_RIGHT},{r:[20,21],a:_ANG_LEFT}],
};

// CENTER_REVENUE_EDGE_PRIORITY: preferred edge directions for a center city's revenue badge
// when there are multiple stops.  Edges used by other stops are excluded before picking.
const _CTR_REV_EDGE_PRI = [1, 2, 3, 4, 0, 5];

// EDGE_TOWN_REVENUE_REGIONS: [regions[], invert_displacement] per edge (town_rect.rb).
// invert=true → displacement = -35 (revenue placed on the "inner" side of the town bar).
const _EDGE_TOWN_REV = {
  0:   [[23], false],
  0.5: [[12], true ],
  1:   [[5],  true ],
  1.5: [[19], false],
  2:   [[12], false],
  2.5: [[5],  false],
  3:   [[0],  false],
  3.5: [[11], true ],
  4:   [[18], true ],
  4.5: [[23], true ],
  5:   [[11], false],
  5.5: [[18], false],
};

// SMALL_ITEM_LOCATIONS (flat layout) — five corner positions for the central revenue badge.
// x, y are tobymao 100-unit; priority order matches tobymao's SMALL_ITEM_LOCATIONS array.
// Adjacent edges in our edge system used for lightweight region-cost estimation.
const _SMALL_ITEM_LOCS_FLAT = [
  { x:  75, y:   0,    adjEdges:[4,5] }, // P_RIGHT_CORNER         regions [11,18]
  { x: -75, y:   0,    adjEdges:[1,2] }, // P_LEFT_CORNER          regions [5,12]
  { x:  35, y:  60.62, adjEdges:[0,5] }, // P_BOTTOM_RIGHT_CORNER  regions [22,23]
  { x: -35, y: -60.62, adjEdges:[2,3] }, // P_UPPER_LEFT_CORNER    regions [0,1]
  { x: -35, y:  60.62, adjEdges:[0,1] }, // P_BOTTOM_LEFT_CORNER   regions [19,20]
];

// ── Helpers ──────────────────────────────────────────────────────────────────

// _nodeEdge: return numeric edge from node.locStr, or null for center nodes.
function _nodeEdge(node) {
  if (!node.locStr || node.locStr === 'center') return null;
  const f = parseFloat(node.locStr);
  return isNaN(f) ? null : f;
}

// _revNodeValue: resolve flat revenue for hex.nodes[i], with legacy fallbacks.
// node.flat  — DSL map hexes (set by import-ruby.js)
// node.revenue — tile-packs / tileDef nodes (set by parseDSL / normalizeTileDef)
// hex.cityRevenues / hex.townRevenues — legacy save-file format
function _revNodeValue(hex, i) {
  const node = hex.nodes[i];
  const tIdx = hex.nodes.slice(0, i).filter(n => n.type === 'town').length;
  return node.flat ?? node?.revenue ?? hex.cityRevenues?.[i] ?? hex.townRevenues?.[tIdx] ?? null;
}

// ── _shouldRenderRevenue: port of tile.rb Tile#should_render_revenue? ────────
// Returns true → single central badge for the tile (all stops same revenue).
// Returns false → inline badge per node.
function _shouldRenderRevenue(hex) {
  const nodes     = hex.nodes || [];
  const cityTowns = nodes.filter(n => n.type === 'city' || n.type === 'town');

  const revenues  = cityTowns.map((node) => {
    const origIdx = nodes.indexOf(node);
    const tIdx    = nodes.slice(0, origIdx).filter(n => n.type === 'town').length;
    return node.flat ?? node?.revenue ?? hex.cityRevenues?.[origIdx] ?? hex.townRevenues?.[tIdx] ?? null;
  }).filter(r => r !== null);

  if (revenues.length === 0)   return false; // nothing to render
  if (cityTowns.length <= 1)   return false; // single stop → inline
  if (new Set(revenues).size > 1) return false; // different revenues → inline per node

  const cities = nodes.filter(n => n.type === 'city');

  // Count unique exit edges (for "avoid obscuring track" check).
  const exitEdgeSet = new Set();
  (hex.paths || []).forEach(p => {
    if (p.a?.type === 'edge') exitEdgeSet.add(p.a.n);
    if (p.b?.type === 'edge') exitEdgeSet.add(p.b.n);
  });

  // Special case: 2 towns, no cities, >4 exits → central to avoid crowding inline badges.
  if (cities.length === 0 && cityTowns.length === 2 && exitEdgeSet.size > 4) return true;

  // 2 stops and total city slot count < 3 → inline
  const totalSlots = cities.reduce((s, c) => s + (c.slots || 1), 0);
  if (totalSlots < 3 && cityTowns.length === 2) return false;

  return true; // central badge
}

// ── _buildDslRevenueSvg ───────────────────────────────────────────────────────
// Tobymao-safe revenue rendering for any hex-like object with nodes[].
// Called for both tileDef tiles (via synthesised hex) and DSL map hexes.
// _revNodeValue reads node.flat (DSL hexes) or node.revenue (tileDef nodes).
// totalDeg: tile orientation in degrees (orientOff + tileDeg).
// sc: world-unit scale (= HEX_SIZE / 50).
function _buildDslRevenueSvg(hex, totalDeg, sc) {
  const nodes = hex.nodes || [];
  if (!nodes.length) return '';

  const cosT = Math.cos(totalDeg * Math.PI / 180);
  const sinT = Math.sin(totalDeg * Math.PI / 180);

  // Convert from 50-unit tile space to SVG world coords (with tile rotation).
  function toWorld(x50, y50) {
    return { x: (x50 * cosT - y50 * sinT) * sc,
             y: (x50 * sinT + y50 * cosT) * sc };
  }

  // Render one revenue bubble centred at world (w.x, w.y).
  function bubble(w, rev) {
    const r = 7.5;
    return `<circle cx="${w.x.toFixed(1)}" cy="${w.y.toFixed(1)}" r="${r}" fill="white" stroke="#777" stroke-width="1"/>` +
           `<text x="${w.x.toFixed(1)}" y="${w.y.toFixed(1)}" font-family="Lato,Arial,sans-serif" font-size="8" font-weight="bold" fill="#000" text-anchor="middle" dominant-baseline="middle">${rev}</text>`;
  }

  const cityTowns = nodes.filter(n => n.type === 'city' || n.type === 'town');
  const numCTs    = cityTowns.length;

  // Preferred edges for every city/town node (tobymao compute_city_town_edges).
  // Used for city revenue position and to compute blockedEdges for center cities.
  const prefEdges = computePreferredEdges(hex);

  // ── Central badge (all stops share the same revenue) ─────────────────────
  if (_shouldRenderRevenue(hex)) {
    const rev = _revNodeValue(hex, nodes.indexOf(cityTowns[0]));
    if (!rev || rev === 0) return '';

    // Build a lightweight adjacency cost for each corner to mimic tobymao's
    // min_by region_use.  Cost = position priority + 10 × (exits or nodes at
    // adjacent edges).  No full 24-region tracking needed for the corner case.
    const exitEdgeSet = new Set();
    (hex.paths || []).forEach(p => {
      if (p.a?.type === 'edge') exitEdgeSet.add(p.a.n);
      if (p.b?.type === 'edge') exitEdgeSet.add(p.b.n);
    });
    // Use prefEdges for city/town nodes, _nodeEdge for any explicit-locStr remainder.
    const nodeEdgeSet = new Set(
      nodes.map((n, idx) => {
        const loc = _nodeEdge(n);
        if (loc !== null) return Math.round(loc);
        const pe = prefEdges[idx];
        return (pe !== null && pe !== undefined) ? Math.round(pe) : null;
      }).filter(e => e !== null)
    );

    let bestLoc = _SMALL_ITEM_LOCS_FLAT[0], bestCost = Infinity;
    _SMALL_ITEM_LOCS_FLAT.forEach((loc, j) => {
      let cost = j; // base priority (lower index = preferred)
      for (const e of loc.adjEdges) {
        if (exitEdgeSet.has(e)) cost += 10;
        if (nodeEdgeSet.has(e)) cost += 10;
      }
      if (cost < bestCost) { bestCost = cost; bestLoc = loc; }
    });

    return bubble(toWorld(bestLoc.x / 2, bestLoc.y / 2), rev);
  }

  // ── Inline badge per node ─────────────────────────────────────────────────
  let svg = '';

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    if (node.type !== 'city' && node.type !== 'town') continue;

    const rev = _revNodeValue(hex, i);
    if (!rev || rev === 0) continue;

    // For cities: use computePreferredEdges so that cities without an explicit
    // locStr (like O14's two cities connected via paths) are correctly classified
    // as "edge cities" rather than "center cities".
    // For towns: keep _nodeEdge — town revenue direction is driven by exit paths,
    // not by the preferred-edge assignment.
    const edge = node.type === 'city' ? prefEdges[i] : _nodeEdge(node);

    // City/town center in tobymao 100-unit space.
    // Edge nodes: distance 50 toward that edge; center nodes: origin.
    const nodeX100 = (edge === null || edge === undefined) ? 0 : -Math.sin(edge * Math.PI / 3) * 50;
    const nodeY100 = (edge === null || edge === undefined) ? 0 :  Math.cos(edge * Math.PI / 3) * 50;
    const nodeAng  = (edge === null || edge === undefined) ? 0 : edge * 60; // city frame rotation (°)

    let x50, y50; // final revenue position in our 50-unit space

    if (node.type === 'city') {
      // ── City revenue (city.rb render_revenue) ──────────────────────────
      const slots = node.slots || 1;
      // Displacement (tobymao 100-unit); clamp index, treat 0 as 42 fallback.
      const rawDisp = _REV_DISP_FLAT[Math.min(slots, _REV_DISP_FLAT.length - 1)];
      const dispT   = (!rawDisp || rawDisp === 0) ? 42 : rawDisp;

      let revRotation; // degrees (SVG bearing, 0=rightward, +CW)

      if (numCTs === 1) {
        // Single stop on tile: revenue goes in city's "right" direction.
        // angle_for_layout=0 for flat layout → rotation=0 → just cityAngle rotation.
        revRotation = 0;

      } else if (edge !== null && edge !== undefined && slots === 1) {
        // Edge 1-slot city in multi-stop tile: REVENUE_LOCATIONS_BY_EDGE.
        // Use first candidate (tobymao picks min region_use; first = default priority).
        const candidates = _REV_LOC_BY_EDGE[edge];
        revRotation = candidates ? candidates[0].a : 0;

      } else if (edge !== null && edge !== undefined /* && slots > 1 */) {
        // OO / multi-slot edge city: OO_REVENUE_REGIONS path.
        // Rare and complex (negative displacement, etc.).
        // Fallback: skip; phase block handles OO cities that carry phaseRevenue.
        continue;

      } else {
        // Center city in multi-stop tile: CENTER_REVENUE_EDGE_PRIORITY.
        // Exclude edges occupied by other stops (use prefEdges for correct blocking).
        const blockedEdges = nodes
          .filter((n, j) => j !== i && (n.type === 'city' || n.type === 'town'))
          .flatMap((n, _, arr) => {
            const j = nodes.indexOf(n);
            const ne = n.type === 'city' ? prefEdges[j] : _nodeEdge(n);
            if (ne === null || ne === undefined) return [];
            return [ne, ((Math.round(ne) - 1 + 6) % 6)];
          });
        const availEdges = _CTR_REV_EDGE_PRI.filter(e => !blockedEdges.includes(e));
        const revenueEdge = availEdges.length > 0 ? availEdges[0] : 0;
        revRotation = 60 * revenueEdge + 120;
      }

      // Revenue vector in city-local space: rotate(revRotation) × (dispT, 0).
      const rrRad = revRotation * Math.PI / 180;
      const dX    = dispT * Math.cos(rrRad);
      const dY    = dispT * Math.sin(rrRad);

      // Apply city's own rotation (city frame is rotated by nodeAng in the hex).
      const caRad = nodeAng * Math.PI / 180;
      const offX  = dX * Math.cos(caRad) - dY * Math.sin(caRad);
      const offY  = dX * Math.sin(caRad) + dY * Math.cos(caRad);

      // Tobymao 100-unit → our 50-unit space (÷2).
      x50 = (nodeX100 + offX) / 2;
      y50 = (nodeY100 + offY) / 2;

    } else {
      // ── Town revenue (town_rect.rb render_revenue + town_location.rb) ──────
      // source: town_rect.rb render_revenue, town_location.rb town_position +
      //         town_rotation_angles + center_town? + normalized_edges

      // Edge-connected exits for this town node.
      const exits = (hex.paths || []).filter(p =>
        (p.a.type === 'node' && p.a.n === i && p.b.type === 'edge') ||
        (p.b.type === 'node' && p.b.n === i && p.a.type === 'edge')
      ).map(p => p.a.type === 'edge' ? p.a.n : p.b.n);

      // Preferred edge for this town (tobymao: @edge = preferred_city_town_edges[@town]).
      const tPrefEdge = prefEdges[i];

      // Total tile exits (for center_town? check).
      const allTileExits = new Set();
      (hex.paths || []).forEach(p => {
        if (p.a?.type === 'edge') allTileExits.add(p.a.n);
        if (p.b?.type === 'edge') allTileExits.add(p.b.n);
      });

      // normalized_edges(tPrefEdge, exits) — port of town_location.rb normalized_edges.
      // Makes ea = tPrefEdge; adjusts the smaller of [ea, eb] by +6 when they wrap.
      let ea = tPrefEdge, eb = null;
      if (tPrefEdge !== null && tPrefEdge !== undefined && exits.length === 2) {
        eb = exits.find(e => e !== tPrefEdge) ?? null;
        if (eb !== null) {
          if (Math.abs(ea - eb) > 3) {
            // tobymao: edges[edges.index(edges.min)] += 6
            if (Math.min(ea, eb) === ea) ea = ea + 6; else eb = eb + 6;
          }
        }
      }
      // min_edge = min of the (possibly +6 adjusted) pair.
      const minEdge = (eb !== null && eb !== undefined) ? Math.min(ea, eb) : (tPrefEdge ?? 0);

      // town_track_type — port of town_location.rb town_track_type.
      // :straight if diff==3, :sharp if diff==1, :gentle if diff==2.
      let trackType = 'straight';
      if (eb !== null && eb !== undefined) {
        const diff = Math.abs(ea - eb);
        trackType = diff === 1 ? 'sharp' : diff === 2 ? 'gentle' : 'straight';
      }

      // center_town? — port of town_location.rb center_town?.
      // true when town has 2 exits AND the tile has exactly 2 or 3 exits total.
      const isCenterTown = exits.length === 2 &&
        (allTileExits.size === 2 || allTileExits.size === 3);

      // Compute bar center position (barX100, barY100) in tobymao 100-unit space.
      // Source: town_location.rb town_position.
      let barX100 = 0, barY100 = 0, revAngle, dispT;

      if (exits.length === 2 && isCenterTown) {
        // center_town? branch: bar sits on the track at the arc midpoint.
        // town_position: angles=[(minEdge+offset)*60], positions=[p]
        const barAxisDeg = trackType === 'sharp'  ? (minEdge + 0.5) * 60
                         : trackType === 'gentle' ? (minEdge + 1)   * 60
                         : 0; // straight → position=0 → stays at origin
        const barPos     = trackType === 'sharp'  ? 50
                         : trackType === 'gentle' ? 23.2
                         : 0;
        const barAxisRad = barAxisDeg * Math.PI / 180;
        barX100 = -Math.sin(barAxisRad) * barPos;
        barY100 =  Math.cos(barAxisRad) * barPos;

        // town_rotation_angles for center_town? (same formula as computeTownPos angle).
        // source: town_location.rb town_rotation_angles → center_town? case.
        const baseAngle = trackType === 'sharp'  ? (minEdge + 2) * 60
                        : trackType === 'gentle' ? (minEdge * 60) - 30
                        : minEdge * 60; // straight

        // reverse_side = (track_type == :sharp) → angle += 180.
        // source: town_rect.rb render_revenue → reverse_side logic.
        revAngle = trackType === 'sharp' ? baseAngle + 180 : baseAngle;
        dispT = 38; // source: town_rect.rb — default displacement for center_town?

      } else if (exits.length === 2) {
        // Non-center 2-exit town (double-dit style, tile has ≥4 exits).
        // town_position uses POSITIONAL_ANGLE and edge_a (= ea) direction.
        // source: town_location.rb town_position → else (exits.size==2) branch.
        const POSITIONAL_ANGLE = { sharp: 12.12, gentle: 6.11 };
        const posAngle = POSITIONAL_ANGLE[trackType] || 0;
        // town_track_direction: ea > eb → :right, ea < eb → :left, diff==3 → :straight
        const dir = ea > eb ? 'right' : ea < eb ? 'left' : 'straight';
        const delta = dir === 'left' ? posAngle : dir === 'right' ? -posAngle : 0;
        const barPos = trackType === 'sharp' ? 55.70 : trackType === 'gentle' ? 48.05 : 40;
        const barAxisRad = (ea * 60 + delta) * Math.PI / 180;
        barX100 = -Math.sin(barAxisRad) * barPos;
        barY100 =  Math.cos(barAxisRad) * barPos;

        // Revenue: DOUBLE_DIT_REVENUE_ANGLES[@edge] for non-center 2-exit towns.
        // source: town_rect.rb → @town.exits.size == 2 && !center_town? branch.
        const _DDIT = [170, -130, 130, -10, 50, -50];
        revAngle = _DDIT[Math.round(tPrefEdge ?? 0) % 6] ?? (tPrefEdge ?? 0) * 60;
        dispT = 35;

      } else if (tPrefEdge !== null && tPrefEdge !== undefined) {
        // 1-exit (or 0-exit with edge assignment) town: positioned toward preferred edge.
        // town_position: angles=[prefEdge*60], positions=[50].
        // source: town_location.rb → elsif edge_a branch (single-exit town).
        const barAxisRad = (tPrefEdge * 60) * Math.PI / 180;
        barX100 = -Math.sin(barAxisRad) * 50;
        barY100 =  Math.cos(barAxisRad) * 50;

        // Revenue: EDGE_TOWN_REVENUE_REGIONS[@edge] → invert → displacement sign.
        // town_rotation_angles for edge_a case: [edge_a * 60].
        // source: town_rect.rb → else (exits!=2) → @edge branch.
        const [, invert] = _EDGE_TOWN_REV[tPrefEdge] || [[], false];
        revAngle = tPrefEdge * 60;
        dispT    = invert ? -35 : 35;

      } else {
        // No exits, no preferred edge (isolated/junction dot town) → center.
        // source: town_rect.rb → else (exits!=2) → no @edge → regions=CENTER.
        barX100 = 0; barY100 = 0;
        revAngle = 0;
        dispT = 38;
      }

      // Revenue position = bar_center + R(revAngle) × (dispT, 0), all in 100-unit.
      // Divide by 2 to convert to our 50-unit tile space.
      const raRad = revAngle * Math.PI / 180;
      x50 = (barX100 + dispT * Math.cos(raRad)) / 2;
      y50 = (barY100 + dispT * Math.sin(raRad)) / 2;
    }

    svg += bubble(toWorld(x50, y50), rev);
  }

  return svg;
}

// ─── Location-name candidate positions (tobymao location_name.rb) ────────────
//
// For flat-layout multi-city/town tiles the candidate list is (line 84):
//   [l_center, l_up40, l_down40, l_bottom, l_top]
// Selection: min_by.with_index { combined_cost(region_weights_in || region_weights), i }
//
// Each entry: { rw: [[regions[], weight], …], ny: y as fraction of sz }
// rw is region_weights_in when present, else region_weights (location_name.rb).
// Tiebreaking by array index (tobymao: min_by.with_index → first minimum wins).
//
// Region constants from base.rb:
//   TRACK_TO_EDGE_0=[15,21]  TRACK_TO_EDGE_3=[2,8]
//   TOP_ROW=[0,1,2,3,4]      BOTTOM_ROW=[19,20,21,22,23]
const _LOC_NAME_FLAT = [
  { rw: [[[9,14],1],[[7,8,15,16],0.7]],                ny:  0    }, // l_center
  { rw: [[[0,2,4,6,8,10],0.7],[[1,3,7,9],0.2]],        ny: -0.40 }, // l_up40
  { rw: [[[13,15,17,19,21,23],0.7],[[14,16,20,22],0.2]],ny:  0.40 }, // l_down40
  { rw: [[[15,21],1],[[19,20,21,22,23],1.5]],           ny:  0.56 }, // l_bottom (rwIn)
  { rw: [[[2,8],1],[[0,1,2,3,4],2]],                    ny: -0.61 }, // l_top    (rwIn)
];

// _locNameCost: weighted sum of region_use over [[regions,weight],...] pairs.
// Direct port of tobymao base.rb Base#combined_cost.
function _locNameCost(ru, rw) {
  return rw.reduce((s, [regions, weight]) =>
    s + weight * regions.reduce((t, r) => t + ru[r], 0), 0);
}

// ── _buildLabelSvg ────────────────────────────────────────────────────────────
// Canonical tobymao label.rb preferred_render_locations + base.rb render_location.
// Called by BOTH the tileDef branch (placed pack/manifest tiles) and the DSL
// hex branch (static map hexes with hex.label), and by palette.js for swatches.
// Ensures every label goes through the same single implementation.
//
// Parameters:
//   label  — string (Y, M, T, OO, etc.)
//   nodes  — node array with .type ('city'|'town') and .slots
//             — either tileDef.nodes or hex.nodes
//   paths  — path array with .a/.b = {type:'edge'|'node', n:int}
//             — either tileDef.paths or hex.paths
//   sz     — coordinate scale:
//             HEX_SIZE → world coordinates (placed tiles on map)
//             50       → tile coordinates   (palette swatches)
//
// Returns SVG <text> string in (sz/100)-scaled space, or '' for empty label.
// Font: tobymao tile__text (14px × scale(1.5) = 21px effective at 100-unit).
// Style: fill:black, no bold, no stroke (exact tobymao tile__text CSS).
function _buildLabelSvg(label, nodes, paths, sz) {
  if (!label || label === '') return '';

  const _cities    = nodes.filter(n => n.type === 'city');
  const _cityTowns = nodes.filter(n => n.type === 'city' || n.type === 'town');

  // region_use — port of tobymao base.rb TRACK_TO_EDGE_N + CENTER
  const _TTE = [[15,21],[13,14],[6,7],[2,8],[9,10],[16,17]]; // TRACK_TO_EDGE_N
  const _CTR = [7,8,9,14,15,16];                             // CENTER
  const _ru  = new Array(24).fill(0);
  for (const p of (paths || [])) {
    if (p.a?.type === 'edge') { const rr = _TTE[p.a.n]; if (rr) for (const r of rr) _ru[r] += 1; }
    if (p.b?.type === 'edge') { const rr = _TTE[p.b.n]; if (rr) for (const r of rr) _ru[r] += 1; }
  }
  for (const n of nodes) { if (n.type === 'city') for (const r of _CTR) _ru[r] += 1; }

  // Candidate positions — tobymao label.rb preferred_render_locations, flat layout.
  // Coordinates in tobymao 100-unit space; scaled to output space by × sz/100 below.
  //   LEFT_MID=[6,13] LEFT_CORNER=[5,12] LEFT_CENTER=[7,14]
  //   RIGHT_MID=[10,17] RIGHT_CORNER=[11,18] RIGHT_CENTER=[9,16]
  //   UPPER_LEFT_CORNER=[0,1]  UPPER_RIGHT_CORNER=[3,4]
  //   BOTTOM_LEFT_CORNER=[19,20] BOTTOM_RIGHT_CORNER=[22,23]
  let _cands;
  if (_cityTowns.length === 1) {
    if (_cities.length === 1 && (_cities[0].slots || 1) > 1) {
      // single city, 2+ slots → P_LEFT_CORNER only (label.rb line 188)
      _cands = [{ rw:[[[5,12],1.0]],                       x:-71.25, y:0 }];
    } else {
      // single city 1-slot or single town (label.rb line 190)
      _cands = [
        { rw:[[[5,6,12,13],1],[[7,14],0.5]],   x:-55,    y:0 }, // SINGLE_CITY_ONE_SLOT
        { rw:[[[10,11,17,18],1],[[9,16],0.5]],  x: 55,    y:0 }, // SINGLE_CITY_ONE_SLOT_RIGHT
        { rw:[[[11,18],1.0]],                   x: 71.25, y:0 }, // P_RIGHT_CORNER
      ];
    }
  } else if (_cityTowns.length > 1) {
    // MULTI_CITY_LOCATIONS flat (label.rb line 193)
    _cands = [
      { rw:[[[2],1.0],[[1,3],0.5]],        x:   0,    y:-60 }, // top centre
      { rw:[[[6],1.0],[[5,7],0.5]],         x: -50,    y:-31 }, // edge 2
      { rw:[[[17],1.0],[[16,18],0.5]],      x:  50,    y: 37 }, // edge 5
      { rw:[[[0,1],1.0]],                   x: -40,    y:-65 }, // top-left corner
      { rw:[[[3,4],1.0]],                   x:  40,    y:-65 }, // top-right corner
      { rw:[[[5,12],1.0]],                  x: -71.25, y:  0 }, // P_LEFT_CORNER
      { rw:[[[11,18],1.0]],                 x:  71.25, y:  0 }, // P_RIGHT_CORNER
      { rw:[[[19,20],1.0]],                 x: -30,    y: 65 }, // P_BOTTOM_LEFT_CORNER
      { rw:[[[22,23],1.0]],                 x:  40,    y: 65 }, // bottom-right corner
      { rw:[[[12,13],1.0]],                 x: -50,    y: 25 }, // edge 1
      { rw:[[[21],1.0],[[20,22],0.5]],      x:   0,    y: 60 }, // bottom centre
    ];
  } else {
    // no city_towns → P_LEFT_CORNER (label.rb line 197)
    _cands = [{ rw:[[[5,12],1.0]], x:-71.25, y:0 }];
  }

  // Pick min combined_cost; first minimum wins (tobymao min_by order preserved)
  let _lx = _cands[0].x, _ly = _cands[0].y, _best = Infinity;
  for (const c of _cands) {
    const cost = _locNameCost(_ru, c.rw);
    if (cost < _best) { _best = cost; _lx = c.x; _ly = c.y; }
  }

  // tobymao 100-unit → output space: × sz/100
  // Font: 14px (tile__text CSS) × scale(1.5) = 21px at 100-unit → × sz/100
  const fz = (21 * sz / 100).toFixed(1);
  return `<text x="${(_lx * sz / 100).toFixed(1)}" y="${(_ly * sz / 100).toFixed(1)}" font-family="Lato,Arial,sans-serif" font-size="${fz}" fill="black" text-anchor="middle" dominant-baseline="middle">${escSvg(label)}</text>`;
}

// ─── HEX GROUP BUILDER ────────────────────────────────────────────────────────
// buildHexSvg: returns complete SVG <g> element for one hex.
// Coordinate space: hex-local world units centered at (0,0), group translated to hex center.
// Uses shared clip path #tile-clip (updated by render() in mapDefs).
function buildHexSvg(r, c, hex) {
  const id      = hexId(r, c);
  const center  = getHexCenter(r, c, HEX_SIZE, state.meta.orientation);
  const tileDef = hex?.tile ? TileRegistry.getTileDef(hex.tile) : null;
  const isPointy = state.meta.orientation === 'pointy';
  const orientOff = isPointy ? 30 : 0;
  const sc  = HEX_SIZE / 50;
  const sz  = HEX_SIZE;

  // Background color
  const _tc = tileDef ? (tileDef.color === 'gray' ? 'grey' : tileDef.color) : null;
  const color = _tc
    ? (TILE_HEX_COLORS[_tc] || TERRAIN_COLORS[''])
    : (hex?.bg ? (STATIC_BG_COLORS[hex.bg] || TERRAIN_COLORS[''])
               : (TERRAIN_COLORS[hex?.terrain || ''] || TERRAIN_COLORS['']));

  // Hex polygon corners (local coords, centered at 0,0)
  const hexPts = Array.from({length: 6}, (_, i) => {
    const a = (orientOff + i * 60) * Math.PI / 180;
    return `${(sz * Math.cos(a)).toFixed(2)},${(sz * Math.sin(a)).toFixed(2)}`;
  }).join(' ');

  // Selection / drag stroke
  const _isSel   = selectedHex === id;
  const _isMulti = selectedHexes && selectedHexes.has(id);
  const _isDrag  = (typeof dragOverHex !== 'undefined') && dragOverHex === id;
  let strokeColor = '#666', strokeWidth = 1, strokeDash = '';
  if (_isDrag)        { strokeColor = '#ffffff'; strokeWidth = 3; strokeDash = '5,3'; }
  else if (_isMulti)  { strokeColor = '#00ccff'; strokeWidth = 2; strokeDash = '4,3'; }
  else if (_isSel)    { strokeColor = '#ffd700'; strokeWidth = 2; }

  let g = `<g id="hex_${r}_${c}" data-id="${escSvg(id)}" transform="translate(${center.x.toFixed(2)},${center.y.toFixed(2)})">`;
  g += `<polygon points="${hexPts}" fill="${color}" stroke="${strokeColor}" stroke-width="${strokeWidth}"${strokeDash ? ` stroke-dasharray="${strokeDash}"` : ''}/>`;

  if (!hex?.killed) {
    // Determine whether this hex has a city/town/oo symbol that occupies hex centre.
    // Used to collision-avoid terrain icon placement (see buildTerrainSvg).
    const hasCityFeature = (tileDef && (tileDef.city || tileDef.oo || tileDef.cities))
      || !!hex?.city || !!hex?.town
      || hex?.feature === 'city' || hex?.feature === 'oo'
      || hex?.feature === 'town' || hex?.feature === 'dualTown';

    // Terrain icon (no tile placed) — buildTerrainSvg runs full 24-region
    // collision resolution internally from hex.exits / hex.feature.
    if (hex?.terrain && hex.terrain !== '' && !hex?.tile) {
      g += buildTerrainSvg(hex);
    }

    // City name — only when a tile is actually placed (hex.tile is truthy).
    // Unplaced / static hexes get their name via the locName path below, which
    // uses tobymao location_name.rb positioning.  Guarding on hex.tile prevents
    // double-rendering now that hex.cityName is the single source of truth for
    // both placed and unplaced hexes.
    if (hex?.cityName && hex?.tile && hasCityFeature) {
      g += `<text x="0" y="${(-sz*0.5).toFixed(1)}" font-family="Lato,Arial,sans-serif" font-size="9" font-weight="bold" fill="#111" stroke="rgba(255,255,255,0.85)" stroke-width="2.5" paint-order="stroke" text-anchor="middle" dominant-baseline="middle">${escSvg(hex.cityName)}</text>`;
    }

    // Location name (unplaced hexes with city/town content).
    // Single source of truth: hex.cityName (set on import from LOCATION_NAMES,
    // writable from the hex panel, round-trips through export).
    // Guard rules:
    //   DSL hexes with nodes   — show only when a city or town node is present
    //                            (suppresses pass-through / pure-track hexes).
    //   Blank upgradeable hexes (no nodes) — always show cityName if set; a blank
    //                            hex that carries a city name is always a city hex.
    //   Legacy hex.city/town   — fall back to the name stored in those objects.
    const locName = !hex || !!hex.tile ? '' :
      (!hex.nodes || hex.nodes.length === 0)
        ? (hex.cityName || hex.city?.name || hex.town?.name || '')
        : hex.nodes.some(n => n.type === 'city' || n.type === 'town')
          ? (hex.cityName || hex.city?.name || hex.town?.name || '')
          : '';
    if (locName) {
      // ── tobymao location_name.rb preferred_render_locations ─────────────────
      // CRITICAL: hex.feature is a derived summary field (set to 'city' ONLY for
      // 3+ city hexes, 'offboard' for red hexes, 'none' for everything else).
      // It MUST NOT be used to determine label position — it cannot distinguish a
      // single-city from a town from an offboard-city hex.
      //
      // Instead we use hex.nodes[] (the actual node model populated by import-ruby.js)
      // and map to tobymao's location_name.rb preferred_render_locations constants:
      //
      //   Tobymao 100-unit scale → our sz (HEX_SIZE=40) via × (sz/100):
      //     l_up40   y=-40 → -sz*0.40    l_up24  y=-24 → -sz*0.24
      //     l_center y=  0 →          0  l_down24 y=24 →  sz*0.24
      //     l_down40 y= 40 →  sz*0.40    l_down50 y=50 →  sz*0.50
      //     l_top    y=-61 → -sz*0.61    l_bottom y=56 →  sz*0.56
      //
      //   Per location_name.rb:
      //     offboard             → [l_center, l_up24]         → l_up24 (exits raise center cost)
      //     single town (no city)→ [l_center, l_up40, l_down40] → l_up40 (town in CENTER)
      //     single city 1-2 slot → [l_center, l_up40, l_down40] → l_down40 (city in CENTER)
      //     single city 3 slot   → [l_down50, l_top]
      //     single city 4+ slot  → [l_top, l_bottom]
      //     multi city_towns     → l_center (complex edge logic; center is safe default)
      let ny;
      if (hex.city && !hex.tile) {
        // Legacy hex.city model — treat as single 1-slot city
        ny = sz * 0.40;                              // l_down40
      } else if (hex.town && !hex.tile) {
        // Legacy hex.town model — treat as single town
        ny = -sz * 0.40;                             // l_up40
      } else {
        const _nodes  = hex.nodes || [];
        const _cities = _nodes.filter(n => n.type === 'city');
        const _towns  = _nodes.filter(n => n.type === 'town');
        if (hex.feature === 'offboard') {
          // Offboard: revenue shown below → name goes above center
          ny = -sz * 0.24;                           // l_up24
        } else if (_cities.length === 1 && _towns.length === 0) {
          const _slots = _cities[0].slots || 1;
          if (_slots >= 4) ny = -sz * 0.61;          // l_top  (4-slot city)
          else if (_slots === 3) ny = sz * 0.50;     // l_down50 (3-slot city)
          else ny = sz * 0.40;                       // l_down40 (1-2 slot city)
        } else if (_towns.length >= 1 && _cities.length === 0) {
          ny = -sz * 0.40;                           // l_up40 (town-only hex)
        } else if (_nodes.length > 1) {
          // Port of tobymao location_name.rb preferred_render_locations (flat layout)
          // + base.rb render_location: min_by.with_index { combined_cost, i }.
          //
          // Step 1 — region_use at label-render time.
          // In tobymao's tile.rb rendering order, location name for multi-city tiles
          // is rendered AFTER Part::Cities and Part::Towns have incremented region_use.
          // We approximate: exits → TRACK_TO_EDGE_N, cities → CENTER.
          const _lruTTE = [[15,21],[13,14],[6,7],[2,8],[9,10],[16,17]]; // TRACK_TO_EDGE_N
          const _lruCTR = [7,8,9,14,15,16]; // CENTER
          const _lru = new Array(24).fill(0);
          // exits — compute from paths for reliability (same as hexToSvgInner)
          for (const p of (hex.paths || [])) {
            if (p.a?.type === 'edge') { const rr = _lruTTE[p.a.n]; if (rr) for (const r of rr) _lru[r] += 1; }
            if (p.b?.type === 'edge') { const rr = _lruTTE[p.b.n]; if (rr) for (const r of rr) _lru[r] += 1; }
          }
          // each city pre-occupies CENTER
          for (const n of (hex.nodes || [])) {
            if (n.type === 'city') for (const r of _lruCTR) _lru[r] += 1;
          }

          // Step 2 — preferred edges of all city/town nodes (for special-case check).
          const _lnPE    = computePreferredEdges(hex);
          const _ctEdges = (hex.nodes || [])
            .map((n, i) => (n.type === 'city' || n.type === 'town') ? _lnPE[i] : null)
            .filter(e => e !== null && e !== undefined)
            .map(e => Math.round(e));

          // Step 3 — special cases that always force l_center (tobymao lines 55–64).
          // "2 flat cities on exactly edges [0,3]" or "3 flat cities on [0,2,4]/[1,3,5]"
          const _has = arr => arr.every(e => _ctEdges.includes(e));
          if (_cities.length === 2 && _has([0, 3])) {
            ny = 0;
          } else if (_cities.length === 3 && (_has([0,2,4]) || _has([1,3,5]))) {
            ny = 0;
          } else {
            // Step 4 — general case: pick from _LOC_NAME_FLAT via min combined_cost.
            // Tiebreaks by array index (tobymao: min_by.with_index → first min wins).
            let _bestNy = 0, _bestCost = Infinity;
            for (const cand of _LOC_NAME_FLAT) {
              const cost = _locNameCost(_lru, cand.rw);
              if (cost < _bestCost) { _bestCost = cost; _bestNy = cand.ny; }
            }
            ny = _bestNy * sz;
          }
        } else {
          ny = sz * 0.40;                            // fallback l_down40
        }
      }
      // ── Background box + text (tobymao location_name.rb render_background_box) ─
      // tobymao: white rect fill-opacity=0.5 behind all text segments, then text on top.
      // CHARACTER_WIDTH=8, LINE_HEIGHT=15, buffer_x=8, buffer_y=4 (tobymao 100-unit).
      // We use empirical values tuned for our font-size at sz=40 rather than the
      // raw ×0.4 scale (which underestimates our larger relative font).
      const _segs = _nameSegments(locName);
      const _fz   = 7;    // font-size in world units (tobymao ~14×0.4≈5.6 + our larger text)
      const _cw   = 4.2;  // approx char width for Lato at _fz (proportional)
      const _lh   = 9;    // line height (≈ 1.3 × _fz)
      const _padX = 5;    // horizontal padding total (±2.5 each side)
      const _padY = 3;    // vertical padding total (±1.5 each side)
      const _maxC = Math.max(..._segs.map(s => s.length));
      const _bw   = _maxC * _cw + _padX;
      const _bh   = _segs.length * _lh + _padY;
      // Rect centered on ny (tobymao box_dimensions + render_background_box logic)
      g += `<rect x="${(-_bw / 2).toFixed(1)}" y="${(ny - _bh / 2).toFixed(1)}" ` +
           `width="${_bw.toFixed(1)}" height="${_bh.toFixed(1)}" ` +
           `fill="white" fill-opacity="0.5" stroke="none"/>`;
      // Text segments vertically centered around ny, one per line
      for (let i = 0; i < _segs.length; i++) {
        const _ty = ny + (i - (_segs.length - 1) / 2) * _lh;
        g += `<text x="0" y="${_ty.toFixed(1)}" font-family="Lato,Arial,sans-serif" ` +
             `font-size="${_fz}" font-weight="bold" fill="#111" stroke-width="0.5" ` +
             `text-anchor="middle" dominant-baseline="middle">${escSvg(_segs[i])}</text>`;
      }
    }

    // Resource icons
    if (hex?.icons && hex.icons.length > 0 && !hex?.tile) {
      g += buildIconsSvg(hex);
    }

    // Tile / DSL geometry
    const hasDslContent = !hex?.tile && hex && (
      (hex.feature && hex.feature !== 'none' && hex.feature !== 'blank') ||
      (hex.exits      && hex.exits.length      > 0) ||
      (hex.paths      && hex.paths.length      > 0) ||
      (hex.pathPairs  && hex.pathPairs.length  > 0) ||
      (hex.blankPaths && hex.blankPaths.length > 0) ||
      (hex.exitPairs  && hex.exitPairs.length  > 0) ||
      (hex.label  && hex.label !== '')
    );

    if (tileDef || hasDslContent) {
      const tileDeg  = (hex?.rotation || 0) * 60;
      const totalDeg = orientOff + tileDeg;
      const inner    = hexToSvgInner(hex, tileDef);

      // Clipped rotated tile content — uses shared #tile-clip from mapDefs
      g += `<g clip-path="url(#tile-clip)"><g transform="rotate(${totalDeg}) scale(${sc.toFixed(4)})">${inner}</g></g>`;

      // Tile label (placed pack/manifest tiles) — canonical via _buildLabelSvg
      if (tileDef?.tileLabel) {
        g += _buildLabelSvg(tileDef.tileLabel, tileDef.nodes || [], tileDef.paths || [], sz);
      }

      // DSL hex label (C, Y, OO, NY, etc.) — canonical via _buildLabelSvg
      if (!tileDef && hex?.label && hex.label !== '') {
        g += _buildLabelSvg(hex.label, hex.nodes || [], hex.paths || [], sz);
      }

      // DSL phase revenue — for offboards and phase-coloured city nodes (flat=null).
      // Suppressed when any city/town node has a flat revenue value, since those are
      // handled by _buildDslRevenueSvg with tobymao-safe positioning (see below).
      // Rationale: parsePhaseRevenue('20') returns phases={yellow:20,...} even for a
      // plain flat city, so without this guard the phase block would render at the
      // wrong fixed position AND _buildDslRevenueSvg would render it again at the
      // correct tobymao position.
      const _hasFlatNodeRev = !!(hex?.nodes?.some(
        n => (n.type === 'city' || n.type === 'town') && n.flat !== null && n.flat !== undefined && n.flat !== 0));
      if (!tileDef && !_hasFlatNodeRev && hex?.phaseRevenue) {
        const phaseKeys = ['yellow', 'green', 'brown', 'gray'];
        const activeP = phaseKeys.filter(p => hex.activePhases && hex.activePhases[p]);
        if (activeP.length > 0) {
          const revVals = activeP.map(p => hex.phaseRevenue[p] || 0);
          const allSame = revVals.every(v => v === revVals[0]);

          // Position the revenue bubble using the tobymao region-weight system.
          // source: revenue.rb FLAT_MULTI_REVENUE_LOCATIONS + base.rb combined_cost.
          // Part::Revenue picks from candidates (0,0), (0,-48), (0,45) in 100-unit
          // based on which regions are already occupied by track, cities, and towns.
          // RCA for previous bug: City#render_revenue returns early (line 351:
          //   "return if revenues.size > 1") for multi/phase revenues, so the
          //   REVENUE_DISPLACEMENT[:flat] formula we ported is NEVER reached for
          //   phase revenue. Phase revenue goes through Part::Revenue instead.
          const _phRevLoc = _rrgPickFlat(_rrgBuildUse(hex));
          let revCX = _phRevLoc.x * sz / 100;
          let revCY = _phRevLoc.y * sz / 100;

          if (allSame && revVals[0] > 0) {
            g += `<circle cx="${revCX.toFixed(1)}" cy="${revCY.toFixed(1)}" r="7.5" fill="white" stroke="#777" stroke-width="1"/>`;
            g += `<text x="${revCX.toFixed(1)}" y="${revCY.toFixed(1)}" font-family="Lato,Arial,sans-serif" font-size="8" font-weight="bold" fill="#000" text-anchor="middle" dominant-baseline="middle">${revVals[0]}</text>`;
          } else if (!allSame) {
            const bw2 = 13*sc, bh2 = 9*sc, gapW2 = sc;
            const tw2 = activeP.length * bw2 + (activeP.length - 1) * gapW2;
            let bx2 = revCX - tw2 / 2;
            const byp2 = revCY - bh2 / 2;
            for (const ph of activeP) {
              const pc2 = TILE_HEX_COLORS[ph] || '#ccc';
              g += `<rect x="${bx2.toFixed(1)}" y="${byp2.toFixed(1)}" width="${bw2.toFixed(1)}" height="${bh2.toFixed(1)}" fill="${pc2}" stroke="rgba(0,0,0,0.35)" stroke-width="0.5"/>`;
              g += `<text x="${(bx2+bw2/2).toFixed(1)}" y="${revCY.toFixed(1)}" font-family="Lato,Arial,sans-serif" font-size="6" font-weight="bold" fill="#111" text-anchor="middle" dominant-baseline="middle">${hex.phaseRevenue[ph] || 0}</text>`;
              bx2 += bw2 + gapW2;
            }
          }
        }
      }

      // Revenue — unified via _buildDslRevenueSvg for both tileDef tiles and
      // DSL map hexes.  For tileDef tiles a synthesised hex-like object is built
      // from tileDef.nodes (enriched by tile-registry.js with node.revenue) so
      // _revNodeValue can read them through the node.flat ?? node.revenue chain.
      {
        const _revHex = tileDef
          ? { nodes: tileDef.nodes || [], paths: tileDef.paths || [], exits: _exitsFromPaths(tileDef.paths || []) }
          : hex;
        if (_revHex?.nodes?.length > 0) {
          g += _buildDslRevenueSvg(_revHex, totalDeg, sc);
        }
      }
    }

    // Part::Blocker, Part::Reservation, Part::Assignments — game-state pipeline.
    // Port of tobymao blocker.rb, reservation.rb, assignments.rb (source files read above).
    // Uses independent region_use accumulator seeded from Track/City/Town occupancy.
    // Rendered inside !hex?.killed but outside tileDef||hasDslContent so they appear
    // on any hex that carries game-state data, not just tiles with content.
    if (hex?.blocker || hex?.reservations?.length || hex?.assignments?.length) {
      const _pipRU = _rrgBuildUse(hex);
      g += _buildBlockerSvg(hex, _pipRU, sz);
      g += _buildReservationsSvg(hex, _pipRU, sz);
      g += _buildAssignmentsSvg(hex, _pipRU, sz);
    }
  }

  // Killed hex overlay
  if (hex?.killed) {
    g += `<polygon points="${hexPts}" fill="rgba(0,0,0,0.55)"/>`;
  }

  // Border markers
  g += buildBordersSvg(hex);

  // Coordinate label
  g += `<text x="0" y="${(-sz*0.62).toFixed(1)}" font-family="Lato,Arial,sans-serif" font-size="7" fill="rgba(140,140,140,0.7)" text-anchor="middle" dominant-baseline="middle">${escSvg(id)}</text>`;

  g += '</g>';
  return g;
}

// ─── SVG VIEWPORT UPDATE ─────────────────────────────────────────────────────
// Update the mapViewport (and lassoLayer) transform for current pan/zoom.
// Call instead of render() for pan/zoom-only changes — no content rebuild.
function updateViewport() {
  const t = `scale(${zoom}) translate(${panX},${panY})`;
  const vp = document.getElementById('mapViewport');
  const ll = document.getElementById('lassoLayer');
  if (vp) vp.setAttribute('transform', t);
  if (ll) ll.setAttribute('transform', t);
}

// ─── RENDER ──────────────────────────────────────────────────────────────────
// Rebuilds all hex SVG content in mapViewport, then applies viewport transform.
function render() {
  const vp = document.getElementById('mapViewport');
  if (!vp) return;

  const isPointy = state.meta.orientation === 'pointy';
  const orientOff = isPointy ? 30 : 0;
  const sz = HEX_SIZE;

  // Rebuild shared clip path in defs (hexagonal polygon in hex-local coords)
  const defsEl = document.getElementById('mapDefs');
  if (defsEl) {
    const clipPts = Array.from({length: 6}, (_, n) => {
      const a = (orientOff + n * 60) * Math.PI / 180;
      return `${(sz * Math.cos(a)).toFixed(1)},${(sz * Math.sin(a)).toFixed(1)}`;
    }).join(' ');
    defsEl.innerHTML = `<clipPath id="tile-clip"><polygon points="${clipPts}"/></clipPath>`;
  }

  let content = '';
  for (let r = 0; r < state.meta.rows; r++) {
    for (let c = 0; c < state.meta.cols; c++) {
      content += buildHexSvg(r, c, state.hexes[hexId(r, c)] || null);
    }
  }
  vp.innerHTML = content;

  // Update lasso visibility if active
  if (typeof _updateLassoSvg === 'function') _updateLassoSvg();

  updateViewport();
}

// ─── RESIZE ──────────────────────────────────────────────────────────────────
// resizeCanvas: legacy name kept for compatibility with setup.js and io.js.
// SVG fills container automatically; just re-render on resize.
function resizeCanvas() {
  render();
}
