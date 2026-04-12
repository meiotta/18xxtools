// ─── CONSTANTS ────────────────────────────────────────────────────────────────
// Core geometric and rendering constants used throughout the editor.
// Load order: FIRST — all other modules depend on these.

const HEX_SIZE = 40;
const LABEL_PAD = 30; // pixels reserved at left/top edges for coordinate labels

const TERRAIN_COLORS = {
  '': '#c8a87a',
  plains: '#c8a87a',
  mountain: '#c8a87a',  // terrain icon shows; background stays plains (matches 18xx.games ref)
  hill: '#c8a87a',     // same — hill cost shown by icon only
  water: '#c8a87a',  // water-crossing cost hex; background stays plains (not ocean)
  river: '#c8a87a',  // river crossing; background stays plains
  lake: '#c8a87a',   // lake; background stays plains (lake is a feature/icon overlay)
  swamp: '#556644',
  marsh: '#4a6040',  // similar to swamp, slightly greener
  forest: '#336633',
  desert: '#cc9944',
  pass: '#8b7355',
  offmap: '#1a1a1a'
};

// Edge midpoints for flat-top hex, radius 50, centered at 0,0
const EDGE_MIDPOINTS = [
  { x: 37.5,  y: 21.65 },  // edge 0: lower-right
  { x: 0,     y: 43.3  },  // edge 1: bottom
  { x: -37.5, y: 21.65 },  // edge 2: lower-left
  { x: -37.5, y: -21.65 }, // edge 3: upper-left
  { x: 0,     y: -43.3  }, // edge 4: top
  { x: 37.5,  y: -21.65 }, // edge 5: upper-right
];

// Tile hex fill colors by upgrade era
const TILE_HEX_COLORS = { yellow: '#F0D070', green: '#71BF44', brown: '#CB7745', grey: '#BCBDC0' };

// ─── TILE DEFINITIONS ─────────────────────────────────────────────────────────
// Each entry describes how to render a standard or custom 18xx tile.
//
// Fields:
//   svgPath      — SVG path string drawn at scale 50 (circumradius), centered at 0,0
//   color        — 'yellow' | 'green' | 'brown' | 'grey'
//   city         — true → single city circle at center
//   oo           — true → OO station (two city circles)
//   town         — true → single town bar at center
//   townAt       — { x, y, rot, rw, rh } → off-center town bar
//   dualTown     — true → two town circles (dit×2)
//   cityPositions — [{x,y}] → custom city circle centers (for non-standard OO layout)
//   townPositions — [{x,y}] → custom town circle centers (for dualTown)
//   revenue      — { x, y, v } → single revenue bubble
//   revenues     — [{ x, y, v }] → multiple revenue bubbles (for dualTown tiles)
//   tileLabel    — 'Y' | 'T' → small letter drawn at left of hex (not rotated with tile)
//
// Coordinate convention: SVG space with circumradius=50 (apothem≈43.3).
// The manifest SVG uses circumradius=100 — divide all coords by 2 when porting.

// normalizeTileDef (from tile-geometry.js) is called at load time for new-format
// tile definitions. The renderer sees the same familiar structure as before.
// OLD FORMAT tiles (svgPath + flags) pass through normalizeTileDef unchanged.
// NEW FORMAT tiles use: { color, nodes:[{type,x,y,revenue,revenueX,revenueY}], paths:[{a,b}] }
//   a/b: integer = edge (0-5), {node:N} = reference to nodes[N]
//
// All standard tiles (1-9, 14-15, 16-29, 39-47, 55-58, 60, 63, 69, 70, 80-83,
// 94, 141-144, 169, 207-208, 405, 544-546, 611, 619, 622, 767-769, 915) are
// defined in the tile pack DSL and injected at runtime. Only tiles with no pack
// equivalent are listed here.
const TILE_DEFS = {
  // === YELLOW (X series) ===
  // X20: yellow OO, 6-exit
  'X20': { svgPath: 'M 0 43.5 L 0 25 M -37.67 21.75 L -21.65 12.5 M -37.67 -21.75 L -21.65 -12.5 M 0 -43.5 L 0 -25 M 37.67 -21.75 L 21.65 -12.5 M 37.67 21.75 L 21.65 12.5', color: 'yellow', oo: true, cityPositions: [{x:-10, y:0}, {x:10, y:0}], revenue: { x: 33.37, y: 0, v: 30 } },

  // === GREEN (X series) ===
  // X1: green 3-exit city
  'X1':  { svgPath: 'M -37.67 21.75 L 0 0 M -37.67 -21.75 L 0 0 M 37.67 -21.75 L 0 0', color: 'green', city: true, revenue: { x: 20.91, y: 0, v: 30 } },
  // X2: green 5-exit city
  'X2':  { svgPath: 'M 0 43.5 L 0 0 M -37.67 21.75 L 0 0 M -37.67 -21.75 L 0 0 M 0 -43.5 L 0 0 M 37.67 -21.75 L 0 0', color: 'green', city: true, revenue: { x: 20.91, y: 0, v: 30 } },
  // X3: green OO, curved 4-exit
  'X3':  { svgPath: 'M 0 43.5 A 83.25 83.25 0 0 0 -21.65 -12.5 M -37.67 -21.75 L -21.65 -12.5 M 0 -43.5 A 83.25 83.25 0 0 0 21.65 12.5 M 37.67 21.75 L 21.65 12.5', color: 'green', oo: true, cityPositions: [{x: -21.65, y: -12.5}, {x: 21.65, y: 12.5}], revenue: { x: 33.37, y: 0, v: 40 } },
  // X4: green OO, fork 4-exit
  'X4':  { svgPath: 'M 0 43.5 L 0 25 M -37.67 21.75 A 33.015 33.015 0 0 1 0 25 M -37.67 -21.75 A 33.015 33.015 0 0 0 0 -25 M 0 -43.5 L 0 -25', color: 'green', oo: true, cityPositions: [{x: 0, y: 25}, {x: 0, y: -25}], revenue: { x: 33.37, y: 0, v: 40 } },
  // X5: green OO, curved 4-exit (alt)
  'X5':  { svgPath: 'M 0 -43.5 L 0 -25 M 37.67 21.75 A 83.245 83.245 0 0 1 0 -25 M 0 43.5 L 0 25 M 37.67 -21.75 A 83.245 83.245 0 0 0 0 25', color: 'green', oo: true, cityPositions: [{x: 0, y: -25}, {x: 0, y: 25}], revenue: { x: 33.37, y: 0, v: 40 } },
  // X21: green OO, 6-exit
  'X21': { svgPath: 'M 0 43.5 L 0 25 M -37.67 21.75 L -21.65 12.5 M -37.67 -21.75 L -21.65 -12.5 M 0 -43.5 L 0 -25 M 37.67 -21.75 L 21.65 -12.5 M 37.67 21.75 L 21.65 12.5', color: 'green', oo: true, cityPositions: [{x:-10, y:0}, {x:10, y:0}], revenue: { x: 33.37, y: 0, v: 40 } },

  // === BROWN (X series) ===
  // X6: brown 3-exit track, no station
  'X6':  { svgPath: 'M -37.67 21.75 L 0 0 M -37.67 -21.75 L 0 0 M 37.67 -21.75 L 0 0', color: 'brown' },
  // X7: brown OO, 5-exit
  'X7':  { svgPath: 'M 0 43.5 L 0 0 M -37.67 21.75 L 0 0 M -37.67 -21.75 L 0 0 M 37.67 21.75 L 0 0 M 37.67 -21.75 L 0 0', color: 'brown', oo: true, revenue: { x: 33.37, y: 0, v: 50 } },
  // X8: brown 2-exit track, no station
  'X8':  { svgPath: 'M -37.67 21.75 L 0 0 M 37.67 -21.75 L 0 0', color: 'brown' },
  // X9: brown 3-exit track, no station
  'X9':  { svgPath: 'M -37.67 -21.75 L 0 0 M 0 -43.5 L 0 0 M 37.67 21.75 L 0 0', color: 'brown' },
  // X10: brown 3-exit track, no station (bottom + lower-left + lower-right)
  'X10': { svgPath: 'M 0 43.5 L 0 0 M -37.67 21.75 L 0 0 M 37.67 21.75 L 0 0', color: 'brown' },
  // X22: brown OO, 6-exit
  'X22': { svgPath: 'M 0 43.5 L 0 25 M -37.67 21.75 L -21.65 12.5 M -37.67 -21.75 L -21.65 -12.5 M 0 -43.5 L 0 -25 M 37.67 -21.75 L 21.65 -12.5 M 37.67 21.75 L 21.65 12.5', color: 'brown', oo: true, cityPositions: [{x:-10, y:0}, {x:10, y:0}], revenue: { x: 33.37, y: 0, v: 50 } },

  // === GREY (X series) ===
  // X11-X19: grey blank track tiles
  'X11': { svgPath: 'M 0 43.5 L 0 0 M -37.67 21.75 L 0 0 M -37.67 -21.75 L 0 0 M 0 -43.5 L 0 0 M 37.67 -21.75 L 0 0', color: 'grey' },
  'X12': { svgPath: 'M -37.67 21.75 L 0 0 M -37.67 -21.75 L 0 0 M 37.67 -21.75 L 0 0', color: 'grey' },
  'X13': { svgPath: 'M 0 43.5 L 0 0 M -37.67 21.75 L 0 0 M -37.67 -21.75 L 0 0 M 0 -43.5 L 0 0 M 37.67 -21.75 L 0 0 M 37.67 21.75 L 0 0', color: 'grey' },
  'X14': { svgPath: 'M -37.67 21.75 L 0 0 M 37.67 -21.75 L 0 0', color: 'grey' },
  'X15': { svgPath: 'M -37.67 -21.75 L 0 0 M 0 -43.5 L 0 0 M 37.67 21.75 L 0 0', color: 'grey' },
  'X16': { svgPath: 'M 0 43.5 L 0 0 M -37.67 21.75 L 0 0 M 37.67 21.75 L 0 0', color: 'grey' },
  'X17': { svgPath: 'M 0 43.5 L 0 0 M -37.67 21.75 L 0 0 M -37.67 -21.75 L 0 0 M 0 -43.5 L 0 0 M 37.67 -21.75 L 0 0 M 37.67 21.75 L 0 0', color: 'grey' },
  'X18': { svgPath: 'M 0 43.5 L 0 0 M -37.67 21.75 L 0 0 M -37.67 -21.75 L 0 0 M 0 -43.5 L 0 0 M 37.67 -21.75 L 0 0', color: 'grey' },
  'X19': { svgPath: 'M 0 43.5 L 0 0 M -37.67 21.75 L 0 0 M -37.67 -21.75 L 0 0 M 0 -43.5 L 0 0 M 37.67 -21.75 L 0 0 M 37.67 21.75 L 0 0', color: 'grey' },
  // X23: grey OO, 6-exit
  'X23': { svgPath: 'M 0 43.5 L 0 25 M -37.67 21.75 L -21.65 12.5 M -37.67 -21.75 L -21.65 -12.5 M 0 -43.5 L 0 -25 M 37.67 -21.75 L 21.65 -12.5 M 37.67 21.75 L 21.65 12.5', color: 'grey', oo: true, cityPositions: [{x:-10, y:0}, {x:10, y:0}], revenue: { x: 33.37, y: 0, v: 60 } },
};
