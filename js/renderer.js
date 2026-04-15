// ─── RENDERER ─────────────────────────────────────────────────────────────────
// SVG map drawing functions.
// Load order: FOURTH — after hex-geometry.js.
//
// render()          — rebuilds all hex SVG content and updates viewport transform
// updateViewport()  — updates viewport transform only (pan/zoom, no content rebuild)
// resizeCanvas()    — legacy name; calls render() for compat with setup.js/io.js
// buildHexSvg(r,c,hex) — returns SVG string for one hex group
// hexToSvgInner(hex,tileDef) — inner track/city/town geometry (shared with swatches)

const RENDERER_VERSION = '2026-04-14-pure-svg';
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
const STATIC_BG_COLORS = {
  white:  '#D4B483',
  yellow: '#F0D070',
  green:  '#71BF44',
  brown:  '#CB7745',
  gray:   '#BCBDC0',
  red:    '#E05050',
  blue:   '#35A7FF',
};

const STATIC_PHASE_COLORS = {
  yellow: '#F0D070',
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
        svg += `<text x="${(bx-radDx*8*sc).toFixed(2)}" y="${(by-radDy*8*sc).toFixed(2)}" font-family="Arial" font-size="7" font-weight="bold" fill="${col}" text-anchor="middle" dominant-baseline="middle">${escSvg(String(border.cost))}</text>`;
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
    svg += `<text text-anchor="middle" font-family="Arial"` +
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

    case 'desert':
      // source: /icons/cactus.svg — vertical stem + two arms, viewBox -12.5 -12.5 25 25
      // stroke:#59b578 (from cactus.svg — same green as swamp)
      // tobymao maps 'desert' → icon:'cactus' (upgrade.rb line 107)
      return `<g transform="translate(${(dx+S/2).toFixed(2)},${(dy+S/2).toFixed(2)}) scale(${(S/25).toFixed(3)})">` +
             `<path fill="none" stroke="#000" stroke-linecap="round" stroke-linejoin="round" stroke-width="4"` +
             ` d="M0 8V-8M0 5q-5 0-5-5m5 0q5 0 5-5"/>` +
             `<path fill="none" stroke="#59b578" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"` + // cactus.svg green
             ` d="M0 8V-8M0 5q-5 0-5-5m5 0q5 0 5-5"/>` +
             `</g>`;

    case 'forest':
      // source: /icons/tree.svg — complex multi-path tree.
      // tobymao maps 'forest' → icon:'tree' (upgrade.rb line 113)
      // tree.svg is too complex to inline faithfully at this size; simplified to
      // a solid green triangle that reads clearly at 8px.  Colour #2d7a2d matches
      // the dominant fill in tree.svg.
      // !! If fidelity matters more than simplicity, inline tree.svg paths here. !!
      return `<polygon transform="translate(${px},${py})"` +
             ` points="${(S/2).toFixed(2)},0 0,${S.toFixed(2)} ${S.toFixed(2)},${S.toFixed(2)}"` +
             ` fill="#2d7a2d"/>`; // tree.svg dominant green

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
// All geometry uses tobymao's 100-unit values halved to match tile-geometry.js:
//   HEX_INRADIUS  = 43.5  (track endpoint distance, tobymao Y_B=87 / 2)
//   SLOT_RADIUS   = 12.5  (city/token circle radius, tobymao SLOT_RADIUS=25 / 2)
//   CITY_EDGE_DIST = 25   (city center at edge, tobymao distance=50 / 2)
//   BAR_RW = 16, BAR_RH = 4  (town bar, tobymao 32×8 / 2)
//   TRACK_W = 5              (track stroke-width)
//
// ep(edge): track endpoint at hex edge midpoint (distance HEX_INRADIUS=43.5).
//   Edge 0=S(0,+43.5)  1=SW(-37.7,+21.75)  2=NW(-37.7,-21.75)
//   3=N(0,-43.5)  4=NE(+37.7,-21.75)  5=SE(+37.7,+21.75)
const DSL_SLOT_R  = 12.5;  // city/token circle radius
const DSL_CITY_D  = 25;    // city center distance from hex center (at an edge)
const DSL_TRACK_W = 5;     // track stroke-width
const DSL_BAR_RW  = 16;    // town bar half-width
const DSL_BAR_RH  = 4;     // town bar half-height

function ep(edge) {
  const a = edge * Math.PI / 3;
  return { x: -Math.sin(a) * 43.5, y: Math.cos(a) * 43.5 };
}

// cityEdgePos: city center when placed at an edge (distance DSL_CITY_D=25).
function cityEdgePos(edge) {
  const a = edge * Math.PI / 3;
  return { x: -Math.sin(a) * DSL_CITY_D, y: Math.cos(a) * DSL_CITY_D };
}

// ─── HEX TO SVG INNER GEOMETRY ─────────────────────────────────────────────
// Generates SVG string for the INNER geometry of a hex (tracks, cities, towns, features).
// Operates in flat-top unrotated coordinate space centered at (0,0).
// The caller wraps this in a <g transform="rotate(deg) scale(sc)"> group.
// Returns SVG string (path, circle, line elements).
function hexToSvgInner(hex, tileDef) {
  let svg = '';

  // For placed tiles: use tileDef geometry
  if (tileDef) {
    if (tileDef.svgPath) {
      // Track stroke-width from tobymao track.rb:16 — width:9 at scale 100 → DSL_TRACK_W (5) at scale 50
      svg += `<path d="${tileDef.svgPath}" stroke="#222" stroke-width="${DSL_TRACK_W}" stroke-linecap="round" fill="none"/>`;
    }

    if (tileDef.city) {
      const cix = tileDef.cityX || 0, ciy = tileDef.cityY || 0;
      // City radius from tobymao city.rb:14 — SLOT_RADIUS=25 at scale 100 → DSL_SLOT_R (12.5) at scale 50
      svg += `<circle cx="${cix}" cy="${ciy}" r="${DSL_SLOT_R}" fill="white" stroke="#000" stroke-width="2"/>`;

    } else if (tileDef.oo) {
      const SR = 12.5;
      const positions = tileDef.cityPositions || [{ x: -SR, y: 0 }, { x: SR, y: 0 }];
      if (positions.length === 2) {
        const xs = positions.map(p => p.x);
        const ys = positions.map(p => p.y);
        const bx = Math.min(...xs) - SR, by = Math.min(...ys) - SR;
        const bw = Math.max(...xs) - Math.min(...xs) + 2 * SR;
        const bh = Math.max(...ys) - Math.min(...ys) + 2 * SR;
        svg += `<rect x="${bx}" y="${by}" width="${bw}" height="${bh}" fill="white"/>`;
      } else if (positions.length >= 3) {
        svg += `<polygon points="22.9,0 11.45,-19.923 -11.45,-19.923 -22.9,0 -11.45,19.923 11.45,19.923" fill="white" stroke="none"/>`;
      }
      for (const pos of positions) {
        svg += `<circle cx="${pos.x}" cy="${pos.y}" r="${SR}" fill="white" stroke="#333" stroke-width="1.5"/>`;
      }

    } else if (tileDef.cities && tileDef.cities.length) {
      const SR = 12.5;
      for (const pos of tileDef.cities) {
        svg += `<circle cx="${pos.x}" cy="${pos.y}" r="${SR}" fill="white" stroke="#333" stroke-width="1.5"/>`;
      }

    } else if (tileDef.town) {
      svg += `<circle cx="0" cy="0" r="5" fill="black"/>`;

    } else if (tileDef.townAt) {
      const { x, y, rot, rw, rh } = tileDef.townAt;
      svg += `<g transform="translate(${x},${y}) rotate(${rot})"><rect x="${-rw / 2}" y="${-rh / 2}" width="${rw}" height="${rh}" fill="black"/></g>`;

    } else if (tileDef.dualTown) {
      const dtPos = (tileDef.townPositions && tileDef.townPositions.length)
        ? tileDef.townPositions
        : [{ x: -10, y: 0, rot: 0, rw: 16, rh: 4 }, { x: 10, y: 0, rot: 0, rw: 16, rh: 4 }];
      for (const pos of dtPos) {
        if (pos.dot) {
          svg += `<circle cx="${pos.x}" cy="${pos.y}" r="5" fill="black"/>`;
        } else {
          const rw = pos.rw || 16, rh = pos.rh || 4;
          svg += `<g transform="translate(${pos.x},${pos.y}) rotate(${pos.rot || 0})"><rect x="${-rw / 2}" y="${-rh / 2}" width="${rw}" height="${rh}" fill="black"/></g>`;
        }
      }
    }
    return svg;
  }

  // ─── DSL hexes (no tileDef) — geometry in 50-unit space ─────────────────────
  // Constants (from tile-geometry.js, matching tobymao at scale 0.5):
  //   DSL_SLOT_R=12.5, DSL_CITY_D=25, DSL_TRACK_W=5, DSL_BAR_RW=16, DSL_BAR_RH=4
  // ep()          → track endpoint at HEX_INRADIUS=43.5
  // cityEdgePos() → city center at DSL_CITY_D=25 (tobymao city.rb distance=50/2)
  //
  // ── TOBYMAO-FAITHFUL NODES/PATHS RENDERING ──────────────────────────────────
  // When hex.nodes[] is populated (all non-offboard DSL hexes), we render by
  // iterating hex.nodes[] and hex.paths[] directly — matching tobymao's per-part
  // render loop: each path draws its track segment, each node draws itself.
  //
  // FUTURE CLAUDE: Do NOT add hex.feature switch cases for city/town/oo/dualTown.
  // All such cases are handled by the nodes[] iteration below.  hex.feature is a
  // DERIVED SUMMARY used only for terrain-badge collision and revenue display code.
  //
  // Node position computation (inline — no stored x/y on nodes in the parser):
  //   City with locStr       → position from locStr angle × DSL_CITY_D
  //   City in OO (2+ cities) → cityEdgePos(first connected exit)
  //   Single center city     → (0, 0)
  //   Town with locStr       → position from locStr angle × 25, angle = locStr*60°
  //   Town without locStr    → computeTownPos(connected exit edges)

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

    // Count towns with no edge connection — mirrors tobymao's condition:
    //   @tile.towns.count { |t| !@tile.preferred_city_town_edges[t] } > 1
    // source: town_dot.rb preferred_render_locations
    const noEdgeTownCount = hex.nodes.filter((n, ni) =>
      n.type === 'town' &&
      !(hex.paths || []).some(p =>
        (p.a.type === 'node' && p.a.n === ni && p.b.type === 'edge') ||
        (p.b.type === 'node' && p.b.n === ni && p.a.type === 'edge'))
    ).length;

    const cityNodeCount = hex.nodes.filter(n => n.type === 'city').length;

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
            pos = { x: -Math.sin(a) * DSL_CITY_D, y: Math.cos(a) * DSL_CITY_D, angle: 0 };
          }
        }
        if (!pos) {
          if (cityNodeCount >= 2) {
            pos = connEdges.length > 0
              ? { ...cityEdgePos(connEdges[0]), angle: 0 }
              : { ...cityEdgePos(hex.nodes.slice(0, ni + 1).filter(n => n.type === 'city').length === 1 ? 0 : 3), angle: 0 };
          } else {
            pos = { x: 0, y: 0, angle: 0 };
          }
        }
        nodePos.push(pos);
        // Cities were pre-incremented above; no additional _ru update here.

      } else {
        // Town
        let pos;
        if (node.locStr && node.locStr !== 'center') {
          const f = parseFloat(node.locStr);
          if (!isNaN(f)) {
            const a = f * Math.PI / 3;
            pos = { x: -Math.sin(a) * 25, y: Math.cos(a) * 25, angle: f * 60 };
          }
        }
        if (!pos) {
          if (connEdges.length === 0) {
            if (noEdgeTownCount > 1) {
              // Multiple no-edge towns: OFFSET_TOWNS via combinedCost, index tiebreak
              // source: town_dot.rb preferred_render_locations + base.rb min_by logic
              let best = _OT[0], bestCost = _otCost(_OT[0]);
              for (let i = 1; i < _OT.length; i++) {
                const c = _otCost(_OT[i]);
                if (c < bestCost) { best = _OT[i]; bestCost = c; }
              }
              _otInc(best); // update region_use for subsequent no-edge towns
              pos = { x: best.x, y: best.y, angle: 0 };
            } else {
              // Single no-edge town: CENTER_TOWN at origin
              // source: town_dot.rb CENTER_TOWN = [{ region_weights: CENTER, x: 0, y: 0 }]
              pos = { x: 0, y: 0, angle: 0 };
            }
          } else {
            const tp = computeTownPos(connEdges);
            pos = { x: tp.x, y: tp.y, angle: tp.angle };
          }
        }
        nodePos.push(pos);
      }
    }

    // ── STEP 1: Draw track segments (paths) — rendered UNDER nodes ──────────
    for (const path of (hex.paths || [])) {
      const posA = path.a.type === 'edge' ? ep(path.a.n) : (nodePos[path.a.n] || { x: 0, y: 0 });
      const posB = path.b.type === 'edge' ? ep(path.b.n) : (nodePos[path.b.n] || { x: 0, y: 0 });

      if (path.a.type === 'node' && path.b.type === 'node') {
        // Internal path (node→node, e.g. city→town in 1822 D35): straight line.
        // No arc needed — both endpoints are interior points, not edge midpoints.
        svg += `<line x1="${posA.x.toFixed(1)}" y1="${posA.y.toFixed(1)}" x2="${posB.x.toFixed(1)}" y2="${posB.y.toFixed(1)}" stroke="#000" stroke-width="${DSL_TRACK_W}" stroke-linecap="round"/>`;
      } else {
        // Edge→node path
        const ePt = path.a.type === 'edge' ? posA : posB;
        const nPt = path.a.type === 'edge' ? posB : posA;

        if (path.terminal) {
          // Terminal path: tobymao track_node_path.rb build_props terminal branch.
          // Pentagon drawn in the rotated edge frame (edge at y=43.5, tobymao y=87 × 0.5):
          //   hw = width/2 = 4 (tobymao) → 2 (×0.5); we use DSL_TRACK_W/2 to match our track width.
          //   terminal:1 → M hw 35 L hw 43.5 L -hw 43.5 L -hw 35 L 0 17.5 Z   (tobymao: M hw 70 L hw 87 L -hw 87 L -hw 70 L 0 35)
          //   terminal:2 → M hw 42.5 L hw 43.5 L -hw 43.5 L -hw 42.5 L 0 32.5 Z (tobymao: M hw 85 L hw 87 L -hw 87 L -hw 85 L 0 65)
          const edgeNum = path.a.type === 'edge' ? path.a.n : path.b.n;
          const hw = (DSL_TRACK_W / 2).toFixed(2);
          const d = path.terminal === 2
            ? `M ${hw} 42.5 L ${hw} 43.5 L -${hw} 43.5 L -${hw} 42.5 L 0 32.5 Z`
            : `M ${hw} 35.0 L ${hw} 43.5 L -${hw} 43.5 L -${hw} 35.0 L 0 17.5 Z`;
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
    for (const [ea, eb] of (hex.pathPairs || [])) {
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
          const [bx, by] = CITY_SLOT_POS[slots] || [0, 0];

          // Slot positions: rotate(360/n × i) applied to [bx,by], per city.rb render_part.
          const offsets = [];
          for (let i = 0; i < slots; i++) {
            const rad = (2 * Math.PI / slots) * i;
            const cos = Math.cos(rad), sin = Math.sin(rad);
            offsets.push({ x: cos * bx - sin * by, y: sin * bx + cos * by });
          }

          // BOX_ATTRS — white backdrop behind slot circles (tobymao city.rb × 0.5):
          //   2: rect  SLOT_DIAMETER × SLOT_DIAMETER at (−SLOT_RADIUS, −SLOT_RADIUS)   → 25×25 at (−12.5,−12.5)
          //   3: hex polygon (Hex::POINTS × 0.458 × 0.5)
          //   4: rect  2×SLOT_DIAMETER × 2×SLOT_DIAMETER at (−SLOT_DIAMETER, −SLOT_DIAMETER) rx=SLOT_RADIUS → 50×50 at (−25,−25) rx=12.5
          //   5: circle r = 1.36 × SLOT_DIAMETER → r = 34
          //   6–9: circle r = 1.5 × SLOT_DIAMETER → r = 37.5
          const SD = 2 * DSL_SLOT_R;  // SLOT_DIAMETER in our scale = 25
          if (slots === 2) {
            svg += `<rect x="${(pos.x - DSL_SLOT_R).toFixed(1)}" y="${(pos.y - DSL_SLOT_R).toFixed(1)}" width="${SD.toFixed(1)}" height="${SD.toFixed(1)}" fill="white" stroke="none"/>`;
          } else if (slots === 3) {
            svg += `<g transform="translate(${pos.x.toFixed(1)},${pos.y.toFixed(1)})">` +
                   `<polygon points="22.9,0 11.45,-19.923 -11.45,-19.923 -22.9,0 -11.45,19.923 11.45,19.923" fill="white" stroke="none"/>` +
                   `</g>`;
          } else if (slots === 4) {
            svg += `<rect x="${(pos.x - SD).toFixed(1)}" y="${(pos.y - SD).toFixed(1)}" width="${(SD * 2).toFixed(1)}" height="${(SD * 2).toFixed(1)}" rx="${DSL_SLOT_R.toFixed(1)}" fill="white" stroke="none"/>`;
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
        // Does this town node have any connected paths?
        const hasConnected = (hex.paths || []).some(p =>
          (p.a.type === 'node' && p.a.n === ni) ||
          (p.b.type === 'node' && p.b.n === ni));

        if (!hasConnected) {
          // No connected paths → TownDot (circle).
          // Covers lone dit (single town, no exits) AND double-dit (dualTown, no exits).
          // tobymao source: town_dot.rb — rendered when town has no @edge connection.
          // pos.x/y: (0,0) for single lone-dit; spread (±15,0) for double-dit (no exits).
          svg += `<circle cx="${pos.x.toFixed(1)}" cy="${pos.y.toFixed(1)}" r="5" fill="black" stroke="white" stroke-width="2"/>`;
        } else {
          // Town bar at computed position and angle
          svg += `<g transform="translate(${pos.x.toFixed(1)},${pos.y.toFixed(1)}) rotate(${pos.angle.toFixed(1)})">` +
                 `<rect x="${(-DSL_BAR_RW / 2).toFixed(1)}" y="${(-DSL_BAR_RH / 2).toFixed(1)}" width="${DSL_BAR_RW}" height="${DSL_BAR_RH}" fill="black" rx="1"/>` +
                 `</g>`;
        }

      } else if (node.type === 'junction') {
        // Junction: connection point for sea/port paths — small marker dot.
        // source: tobymao Part::Junction — always at hex center.
        // Kept small so it doesn't dominate; the spike path is the primary visual.
        svg += `<circle cx="${pos.x.toFixed(1)}" cy="${pos.y.toFixed(1)}" r="3" fill="#222" stroke="none"/>`;
      }
    }

  } else if (hex.feature === 'offboard') {
    // Offboard exits: tobymao track_offboard.rb build_props pentagon in rotated edge frame.
    // In tobymao 100-unit space: M hw 75 L hw 87 L -hw 87 L -hw 75 L 0 48 Z  (hw = width/2 = 4)
    // In our 0.5 scale:          M hw 37.5 L hw 43.5 L -hw 43.5 L -hw 37.5 L 0 24 Z
    for (const e of (hex.exits || [])) {
      const hw = (DSL_TRACK_W / 2).toFixed(2);
      svg += `<path d="M ${hw} 37.5 L ${hw} 43.5 L -${hw} 43.5 L -${hw} 37.5 L 0 24 Z" transform="rotate(${e * 60})" fill="#222"/>`;
    }

  } else if (hex.pathPairs && hex.pathPairs.length > 0) {
    // Pure edge-to-edge path hex (no nodes at all — pathMode==='pairs')
    // dualTown hexes are now handled above via nodes[]; this branch handles only
    // true no-feature track hexes (e.g. straight-through water crossing).
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
    for (const [ea, eb] of hex.pathPairs) drawSeg(ea, eb);
  }

  return svg;
}

function escSvg(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
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

    // City name (placed tile or DSL city/oo)
    if (hex?.cityName && hasCityFeature) {
      g += `<text x="0" y="${(-sz*0.5).toFixed(1)}" font-family="Arial" font-size="9" font-weight="bold" fill="#111" stroke="rgba(255,255,255,0.85)" stroke-width="2.5" paint-order="stroke" text-anchor="middle" dominant-baseline="middle">${escSvg(hex.cityName)}</text>`;
    }

    // Location name (unplaced hexes)
    const locName = !hex ? '' :
      (hex.city  && !hex.tile) ? (hex.city.name  || '') :
      (hex.town  && !hex.tile) ? (hex.town.name  || '') :
      (!hex.tile) ? (hex.featureName || hex.name || '') : '';
    if (locName) {
      const ny = (hex?.feature === 'city') ? -sz * 0.42 : sz * 0.58;
      g += `<text x="0" y="${ny.toFixed(1)}" font-family="Arial" font-size="8" font-weight="bold" fill="#111" stroke="rgba(255,255,255,0.75)" stroke-width="2.5" paint-order="stroke" text-anchor="middle" dominant-baseline="middle">${escSvg(locName)}</text>`;
    }

    // Resource icons
    if (hex?.icons && hex.icons.length > 0 && !hex?.tile) {
      g += buildIconsSvg(hex);
    }

    // Tile / DSL geometry
    const hasDslContent = !hex?.tile && hex && (
      (hex.feature && hex.feature !== 'none' && hex.feature !== 'blank') ||
      (hex.exits  && hex.exits.length  > 0) ||
      (hex.pathPairs  && hex.pathPairs.length  > 0) ||
      (hex.exitPairs  && hex.exitPairs.length  > 0) ||
      (hex.label  && hex.label !== '')
    );

    if (tileDef || hasDslContent) {
      const tileDeg  = (hex?.rotation || 0) * 60;
      const totalDeg = orientOff + tileDeg;
      const inner    = hexToSvgInner(hex, tileDef);

      // Clipped rotated tile content — uses shared #tile-clip from mapDefs
      g += `<g clip-path="url(#tile-clip)"><g transform="rotate(${totalDeg}) scale(${sc.toFixed(4)})">${inner}</g></g>`;

      // Tile label (upright)
      if (tileDef?.tileLabel) {
        g += `<text x="${(-sz*0.62).toFixed(1)}" y="0" font-family="Arial" font-size="9" font-weight="bold" fill="#111" dominant-baseline="middle">${escSvg(tileDef.tileLabel)}</text>`;
      }

      // Revenue bubbles (orbit with tile rotation, text stays upright)
      const revList = tileDef?.revenues || (tileDef?.revenue ? [tileDef.revenue] : []);
      if (revList.length > 0) {
        const revRotRad = tileDeg * Math.PI / 180 + (isPointy ? Math.PI / 6 : 0);
        const cosR = Math.cos(revRotRad), sinR = Math.sin(revRotRad);
        for (const rev of revList) {
          if (!rev || rev.v === 0) continue;
          const rx = (rev.x * cosR - rev.y * sinR) * sc;
          const ry = (rev.x * sinR + rev.y * cosR) * sc;
          if (rev.phases) {
            const segs = rev.phases.split('|').map(s => {
              const u = s.indexOf('_');
              return u < 0 ? null : { ph: s.slice(0,u) === 'gray' ? 'grey' : s.slice(0,u), val: +s.slice(u+1) };
            }).filter(Boolean);
            if (segs.length) {
              const bw = 13*sc, bh = 9*sc, gapW = sc;
              const tw = segs.length * bw + (segs.length - 1) * gapW;
              let bx = rx - tw / 2;
              const byp = ry - bh / 2;
              for (const { ph, val } of segs) {
                const pc = TILE_HEX_COLORS[ph] || '#ccc';
                g += `<rect x="${bx.toFixed(1)}" y="${byp.toFixed(1)}" width="${bw.toFixed(1)}" height="${bh.toFixed(1)}" fill="${pc}" stroke="rgba(0,0,0,0.35)" stroke-width="0.5"/>`;
                g += `<text x="${(bx+bw/2).toFixed(1)}" y="${ry.toFixed(1)}" font-family="Arial" font-size="6" font-weight="bold" fill="#111" text-anchor="middle" dominant-baseline="middle">${val}</text>`;
                bx += bw + gapW;
              }
            }
          } else {
            g += `<circle cx="${rx.toFixed(1)}" cy="${ry.toFixed(1)}" r="7.5" fill="white" stroke="#777" stroke-width="1"/>`;
            g += `<text x="${rx.toFixed(1)}" y="${ry.toFixed(1)}" font-family="Arial" font-size="8" font-weight="bold" fill="#000" text-anchor="middle" dominant-baseline="middle">${rev.v}</text>`;
          }
        }
      }

      // DSL hex label (OO, NY, etc.)
      if (!tileDef && hex?.label && hex.label !== '') {
        g += `<text x="${(-sz*0.62).toFixed(1)}" y="${(-sz*0.45).toFixed(1)}" font-family="Arial" font-size="9" font-weight="bold" fill="#111" dominant-baseline="middle">${escSvg(hex.label)}</text>`;
      }

      // DSL phase revenue (offboards, gray cities, etc.)
      if (!tileDef && hex?.phaseRevenue) {
        const phaseKeys = ['yellow', 'green', 'brown', 'gray'];
        const activeP = phaseKeys.filter(p => hex.activePhases && hex.activePhases[p]);
        if (activeP.length > 0) {
          const revVals = activeP.map(p => hex.phaseRevenue[p] || 0);
          const allSame = revVals.every(v => v === revVals[0]);
          const ryn = sz * 0.44;
          if (allSame && revVals[0] > 0) {
            g += `<circle cx="0" cy="${ryn.toFixed(1)}" r="7.5" fill="white" stroke="#777" stroke-width="1"/>`;
            g += `<text x="0" y="${ryn.toFixed(1)}" font-family="Arial" font-size="8" font-weight="bold" fill="#000" text-anchor="middle" dominant-baseline="middle">${revVals[0]}</text>`;
          } else if (!allSame) {
            const bw2 = 13*sc, bh2 = 9*sc, gapW2 = sc;
            const tw2 = activeP.length * bw2 + (activeP.length - 1) * gapW2;
            let bx2 = -tw2 / 2;
            const byp2 = ryn - bh2 / 2;
            for (const ph of activeP) {
              const pc2 = TILE_HEX_COLORS[ph] || '#ccc';
              g += `<rect x="${bx2.toFixed(1)}" y="${byp2.toFixed(1)}" width="${bw2.toFixed(1)}" height="${bh2.toFixed(1)}" fill="${pc2}" stroke="rgba(0,0,0,0.35)" stroke-width="0.5"/>`;
              g += `<text x="${(bx2+bw2/2).toFixed(1)}" y="${ryn.toFixed(1)}" font-family="Arial" font-size="6" font-weight="bold" fill="#111" text-anchor="middle" dominant-baseline="middle">${hex.phaseRevenue[ph] || 0}</text>`;
              bx2 += bw2 + gapW2;
            }
          }
        }
      }
    }
  }

  // Killed hex overlay
  if (hex?.killed) {
    g += `<polygon points="${hexPts}" fill="rgba(0,0,0,0.55)"/>`;
  }

  // Border markers
  g += buildBordersSvg(hex);

  // Coordinate label
  g += `<text x="0" y="${(-sz*0.62).toFixed(1)}" font-family="Arial" font-size="7" fill="rgba(140,140,140,0.7)" text-anchor="middle" dominant-baseline="middle">${escSvg(id)}</text>`;

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
