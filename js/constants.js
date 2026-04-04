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

const TILE_DEFS = {
  // === YELLOW TILES ===
  '55': { svgPath: 'M 0 43.5 L 0 -20 M 0 -43.5 L 0 -20 M -37.67 21.75 L -17.32 10 M 37.67 -21.75 L -17.32 10', color: 'yellow', dualTown: true, townPositions: [{x: 0, y: -20}, {x: -17.32, y: 10}], revenues: [{x: 14, y: -27, v: 10}, {x: -4, y: 22, v: 10}] },
  '56': { svgPath: 'M 0 43.5 A 76.53 76.53 0 0 0 -2.56 23.89 M -37.67 -21.75 A 75.48 75.48 0 0 1 -2.56 23.89 M -37.67 21.75 A 75.48 75.48 0 0 0 -2.56 -23.89 M 0 -43.5 A 76.53 76.53 0 0 1 -2.56 -23.89', color: 'yellow', dualTown: true, townPositions: [{x: -2.56, y: 23.89}, {x: -2.56, y: -23.89}], revenues: [{x: 14, y: 28, v: 10}, {x: 14, y: -28, v: 10}] },
  '69': { svgPath: 'M 0 43.5 L 0 20 M 0 -43.5 L 0 20 M -37.67 -21.75 A 76.46 76.46 0 0 0 -19.41 -14.16 M 37.67 -21.75 A 75.47 75.47 0 0 1 -19.41 -14.16', color: 'yellow', dualTown: true, townPositions: [{x: 0, y: 20}, {x: -19.41, y: -14.16}], revenues: [{x: 14, y: 24, v: 10}, {x: -30, y: -22, v: 10}] },
  '1':  { svgPath: 'M -37.50 21.65 A 76.49 76.49 0 0 0 -21.97 9.73 M 0.00 -43.30 A 75.48 75.48 0 0 1 -21.97 9.73 M 0.00 43.30 A 75.48 75.48 0 0 1 21.97 -9.73 M 37.50 -21.65 A 76.49 76.49 0 0 0 21.97 -9.73', color: 'yellow', oo: true, cityPositions: [{x: -21.97, y: 9.73}, {x: 21.97, y: -9.73}], revenue: { x: 0, y: 35, v: 20 } },
  '2':  { svgPath: 'M 0.00 43.30 L 0.00 -20.00 M 0.00 -43.30 L 0.00 -20.00 M -37.50 21.65 A 25.56 25.56 0 0 0 -26.51 8.55 M -37.50 -21.65 A 25.24 25.24 0 0 1 -26.51 8.55', color: 'yellow', oo: true, cityPositions: [{x: 0, y: -20}, {x: -26.51, y: 8.55}], revenue: { x: 30, y: 30, v: 20 } },
  '3':  { svgPath: 'M 0.00 43.30 A 25.22 25.22 0 0 0 -12.44 21.55 M -37.50 21.65 A 25.22 25.22 0 0 1 -12.44 21.55', color: 'yellow', townAt: { x: -12.44, y: 21.55, rot: 120, rw: 16.93, rh: 4.23 }, revenue: { x: -2.99, y: 5.17, v: 10 } },
  '4':  { svgPath: 'M 0.00 43.30 L 0.00 -43.30', color: 'yellow', townAt: { x: 0, y: 0, rot: 0, rw: 16.93, rh: 4.23 }, revenue: { x: 18.92, y: 0, v: 10 } },
  '5':  { svgPath: 'M 0.00 43.30 L 0.00 0.00 M -37.50 21.65 L 0.00 0.00', color: 'yellow', city: true, revenue: { x: 20.91, y: 0, v: 20 } },
  '6':  { svgPath: 'M 0.00 43.30 L 0.00 0.00 M -37.50 -21.65 L 0.00 0.00', color: 'yellow', city: true, revenue: { x: 20.91, y: 0, v: 20 } },
  '7':  { svgPath: 'M 0.00 43.30 A 25.00 25.00 0 0 0 -37.50 21.65', color: 'yellow' },
  '8':  { svgPath: 'M 0.00 43.30 A 75.00 75.00 0 0 0 -37.50 -21.65', color: 'yellow' },
  '9':  { svgPath: 'M 0.00 43.30 L 0.00 -43.30', color: 'yellow' },
  '57': { svgPath: 'M 0.00 43.30 L 0.00 0.00 M 0.00 -43.30 L 0.00 0.00', color: 'yellow', city: true, revenue: { x: 20.91, y: 0, v: 20 } },
  '58': { svgPath: 'M 0.00 43.30 A 75.47 75.47 0 0 0 -10.00 5.78 M -37.50 -21.65 A 75.46 75.46 0 0 1 -10.00 5.78', color: 'yellow', townAt: { x: -10.00, y: 5.78, rot: -30, rw: 16.93, rh: 4.23 }, revenue: { x: 6.38, y: -3.68, v: 10 } },
  // 94: yellow OO — one exit per city (top→city1, bottom→city2), 30/30
  '94': { svgPath: 'M 0 -43.3 L 0 -20 M 0 43.3 L 0 20', color: 'yellow', oo: true, cityPositions: [{x: 0, y: -20}, {x: 0, y: 20}], revenue: { x: 33.37, y: 0, v: 30 } },

  // === GREEN TILES ===
  '14':  { svgPath: 'M 0.00 43.30 L 0.00 0.00 M -37.50 21.65 L 0.00 0.00 M 0.00 -43.30 L 0.00 0.00 M 37.50 -21.65 L 0.00 0.00', color: 'green', oo: true, revenue: { x: 33.37, y: 0, v: 30 } },
  '15':  { svgPath: 'M 0.00 43.30 L 0.00 0.00 M -37.50 21.65 L 0.00 0.00 M -37.50 -21.65 L 0.00 0.00 M 0.00 -43.30 L 0.00 0.00', color: 'green', oo: true, revenue: { x: 33.37, y: 0, v: 30 } },
  '80':  { svgPath: 'M 0.00 43.30 L 0.00 0.00 M -37.50 21.65 L 0.00 0.00 M -37.50 -21.65 L 0.00 0.00', color: 'green' },
  '81':  { svgPath: 'M 0.00 43.30 L 0.00 0.00 M -37.50 -21.65 L 0.00 0.00 M 37.50 -21.65 L 0.00 0.00', color: 'green' },
  '82':  { svgPath: 'M 0.00 43.30 L 0.00 0.00 M -37.50 21.65 L 0.00 0.00 M 0.00 -43.30 L 0.00 0.00', color: 'green' },
  '83':  { svgPath: 'M 0.00 43.30 L 0.00 0.00 M 37.50 21.65 L 0.00 0.00 M 0.00 -43.30 L 0.00 0.00', color: 'green' },
  '141': { svgPath: 'M 0.00 43.30 L 0.00 0.00 M 0.00 -43.30 L 0.00 0.00 M -37.50 21.65 L 0.00 0.00', color: 'green', town: true, revenue: { x: 21, y: 0, v: 10 } },
  '142': { svgPath: 'M 0.00 43.30 L 0.00 0.00 M 37.50 21.65 L 0.00 0.00 M 0.00 -43.30 L 0.00 0.00', color: 'green', town: true, revenue: { x: 21, y: 0, v: 10 } },
  '143': { svgPath: 'M 0.00 43.30 L 0.00 0.00 M -37.50 21.65 L 0.00 0.00 M -37.50 -21.65 L 0.00 0.00', color: 'green' },
  '144': { svgPath: 'M 0.00 43.30 L 0.00 0.00 M -37.50 -21.65 L 0.00 0.00 M 37.50 -21.65 L 0.00 0.00', color: 'green' },
  '207': { svgPath: 'M 0.00 43.30 L 0.00 0.00 M -37.50 21.65 L 0.00 0.00 M -37.50 -21.65 L 0.00 0.00 M 0.00 -43.30 L 0.00 0.00', color: 'green', oo: true, tileLabel: 'Y', revenue: { x: 33.37, y: 0, v: 40 } },
  '208': { svgPath: 'M 0.00 43.30 L 0.00 0.00 M -37.50 21.65 L 0.00 0.00 M 0.00 -43.30 L 0.00 0.00 M 37.50 -21.65 L 0.00 0.00', color: 'green', oo: true, tileLabel: 'Y', revenue: { x: 33.37, y: 0, v: 40 } },
  '405': { svgPath: 'M 0.00 43.30 L 0.00 0.00 M -37.50 21.65 L 0.00 0.00 M 37.50 21.65 L 0.00 0.00', color: 'green', oo: true, tileLabel: 'T', revenue: { x: 33.37, y: 0, v: 40 } },
  '619': { svgPath: 'M 0.00 43.30 L 0.00 0.00 M -37.50 -21.65 L 0.00 0.00 M 0.00 -43.30 L 0.00 0.00 M 37.50 -21.65 L 0.00 0.00', color: 'green', oo: true, tileLabel: 'Y', revenue: { x: 33.37, y: 0, v: 30 } },
  '622': { svgPath: 'M 0.00 43.30 L 0.00 0.00 M -37.50 -21.65 L 0.00 0.00 M 0.00 -43.30 L 0.00 0.00 M 37.50 -21.65 L 0.00 0.00', color: 'green', oo: true, tileLabel: 'Y', revenue: { x: 33.37, y: 0, v: 40 } },
  // X3: green OO, curved 4-exit (bottom+upper-left → city1, top+lower-right → city2)
  'X3': { svgPath: 'M 0 43.5 A 83.25 83.25 0 0 0 -21.65 -12.5 M -37.67 -21.75 L -21.65 -12.5 M 0 -43.5 A 83.25 83.25 0 0 0 21.65 12.5 M 37.67 21.75 L 21.65 12.5', color: 'green', oo: true, cityPositions: [{x: -21.65, y: -12.5}, {x: 21.65, y: 12.5}], revenue: { x: 33.37, y: 0, v: 40 } },
  // X4: green OO, fork 4-exit (bottom+lower-left → city1, upper-left+top → city2)
  'X4': { svgPath: 'M 0 43.5 L 0 25 M -37.67 21.75 A 33.015 33.015 0 0 1 0 25 M -37.67 -21.75 A 33.015 33.015 0 0 0 0 -25 M 0 -43.5 L 0 -25', color: 'green', oo: true, cityPositions: [{x: 0, y: 25}, {x: 0, y: -25}], revenue: { x: 33.37, y: 0, v: 40 } },
  // X5: green OO, curved 4-exit (top+lower-right → city1, bottom+upper-right → city2)
  'X5': { svgPath: 'M 0 -43.5 L 0 -25 M 37.67 21.75 A 83.245 83.245 0 0 1 0 -25 M 0 43.5 L 0 25 M 37.67 -21.75 A 83.245 83.245 0 0 0 0 25', color: 'green', oo: true, cityPositions: [{x: 0, y: -25}, {x: 0, y: 25}], revenue: { x: 33.37, y: 0, v: 40 } },

  // === GREEN TRACK — HOSTILE (paths don't meet at center) ===
  // Two independent routes cross or run through the hex without connecting.
  // Tile 20 is the "bow-and-arrow": straight + crossing diagonal, no junction.
  '16': { svgPath: 'M 0 43.5 A 75.34 75.34 0 0 0 -37.67 -21.75 M -37.67 21.75 A 75.34 75.34 0 0 0 0 -43.5', color: 'green' },
  '17': { svgPath: 'M -37.67 21.75 A 75.34 75.34 0 0 0 0 -43.5 M 0 43.5 A 75.34 75.34 0 0 1 37.67 -21.75', color: 'green' },
  '18': { svgPath: 'M 0 43.5 L 0 -43.5 M -37.67 21.75 A 25.12 25.12 0 0 0 -37.67 -21.75', color: 'green' },
  '19': { svgPath: 'M 0 43.5 L 0 -43.5 M -37.67 -21.75 A 75.34 75.34 0 0 0 37.67 -21.75', color: 'green' },
  '20': { svgPath: 'M 0 43.5 L 0 -43.5 M -37.67 21.75 L 37.67 -21.75', color: 'green' },
  '21': { svgPath: 'M 0 43.5 A 75.34 75.34 0 0 0 -37.67 -21.75 M 0 -43.5 A 25.12 25.12 0 0 0 37.67 -21.75', color: 'green' },
  '22': { svgPath: 'M 0 43.5 A 75.34 75.34 0 0 1 37.67 -21.75 M -37.67 -21.75 A 12.62 12.62 0 0 1 0 -43.5', color: 'green' },
  '23': { svgPath: 'M 0 43.5 L 0 -43.5 M 0 43.5 A 75.34 75.34 0 0 1 37.67 -21.75', color: 'green' },
  '24': { svgPath: 'M 0 43.5 L 0 -43.5 M 0 43.5 A 75.34 75.34 0 0 0 -37.67 -21.75', color: 'green' },
  '25': { svgPath: 'M 0 43.5 A 75.34 75.34 0 0 0 -37.67 -21.75 M 0 43.5 A 75.34 75.34 0 0 1 37.67 -21.75', color: 'green' },
  '26': { svgPath: 'M 0 43.5 L 0 -43.5 M 0 43.5 A 25.12 25.12 0 0 1 37.67 21.75', color: 'green' },
  '27': { svgPath: 'M 0 43.5 L 0 -43.5 M 0 43.5 A 25.12 25.12 0 0 0 -37.67 21.75', color: 'green' },
  '28': { svgPath: 'M 0 43.5 A 75.34 75.34 0 0 1 37.67 -21.75 M 0 43.5 A 25.12 25.12 0 0 1 37.67 21.75', color: 'green' },
  '29': { svgPath: 'M 0 43.5 A 75.34 75.34 0 0 0 -37.67 -21.75 M 0 43.5 A 25.12 25.12 0 0 0 -37.67 21.75', color: 'green' },

  // === BROWN TILES ===
  '63':  { svgPath: 'M 0.00 43.30 L 0.00 0.00 M -37.50 21.65 L 0.00 0.00 M -37.50 -21.65 L 0.00 0.00 M 0.00 -43.30 L 0.00 0.00 M 37.50 -21.65 L 0.00 0.00 M 37.50 21.65 L 0.00 0.00', color: 'brown', oo: true },

  // Brown hostile track (no station) — 3 or 4 independent routes through hex
  '39': { svgPath: 'M 0 43.5 A 75.34 75.34 0 0 0 -37.67 -21.75 M 0 43.5 A 25.12 25.12 0 0 0 -37.67 21.75 M -37.67 21.75 A 25.12 25.12 0 0 0 -37.67 -21.75', color: 'brown' },
  '40': { svgPath: 'M 0 43.5 A 75.34 75.34 0 0 0 -37.67 -21.75 M -37.67 -21.75 A 75.34 75.34 0 0 0 37.67 -21.75 M 0 43.5 A 75.34 75.34 0 0 1 37.67 -21.75', color: 'brown' },
  '41': { svgPath: 'M 0 43.5 L 0 -43.5 M 0 43.5 A 25.12 25.12 0 0 0 -37.67 21.75 M -37.67 21.75 A 75.34 75.34 0 0 0 0 -43.5', color: 'brown' },
  '42': { svgPath: 'M 0 43.5 L 0 -43.5 M 0 -43.5 A 75.34 75.34 0 0 0 37.67 21.75 M 0 43.5 A 25.12 25.12 0 0 1 37.67 21.75', color: 'brown' },
  '43': { svgPath: 'M 0 43.5 L 0 -43.5 M 0 43.5 A 75.34 75.34 0 0 0 -37.67 -21.75 M -37.67 21.75 A 75.34 75.34 0 0 0 0 -43.5 M -37.67 21.75 A 25.12 25.12 0 0 0 -37.67 -21.75', color: 'brown' },
  '44': { svgPath: 'M 0 43.5 L 0 -43.5 M -37.67 21.75 L 37.67 -21.75 M 0 43.5 A 25.12 25.12 0 0 0 -37.67 21.75 M 0 -43.5 A 25.12 25.12 0 0 0 37.67 -21.75', color: 'brown' },
  '45': { svgPath: 'M 0 43.5 L 0 -43.5 M -37.67 -21.75 A 75.34 75.34 0 0 0 37.67 -21.75 M 0 43.5 A 75.34 75.34 0 0 1 37.67 -21.75 M -37.67 -21.75 A 25.12 25.12 0 0 0 0 -43.5', color: 'brown' },
  '46': { svgPath: 'M 0 43.5 L 0 -43.5 M -37.67 -21.75 A 75.34 75.34 0 0 0 37.67 -21.75 M 0 -43.5 A 25.12 25.12 0 0 0 37.67 -21.75 M 0 43.5 A 75.34 75.34 0 0 0 -37.67 -21.75', color: 'brown' },
  '47': { svgPath: 'M 0 43.5 L 0 -43.5 M -37.67 21.75 L 37.67 -21.75 M -37.67 21.75 A 75.34 75.34 0 0 0 0 -43.5 M 0 43.5 A 75.34 75.34 0 0 1 37.67 -21.75', color: 'brown' },
  '70': { svgPath: 'M 0 43.5 A 25.12 25.12 0 0 0 -37.67 21.75 M 0 43.5 A 75.34 75.34 0 0 0 -37.67 -21.75 M -37.67 21.75 A 75.34 75.34 0 0 0 0 -43.5 M -37.67 -21.75 A 25.12 25.12 0 0 0 0 -43.5', color: 'brown' },

  // Brown permissive junctions — all exits meet at center, no station
  '544': { svgPath: 'M 0 43.5 L 0 0 M -37.67 21.75 L 0 0 M 0 -43.5 L 0 0 M 37.67 -21.75 L 0 0', color: 'brown' },
  '545': { svgPath: 'M 0 43.5 L 0 0 M -37.67 21.75 L 0 0 M -37.67 -21.75 L 0 0 M 0 -43.5 L 0 0', color: 'brown' },
  '546': { svgPath: 'M 0 43.5 L 0 0 M -37.67 -21.75 L 0 0 M 0 -43.5 L 0 0 M 37.67 -21.75 L 0 0', color: 'brown' },

  // Brown city tiles
  '611': { svgPath: 'M 0 43.5 L 0 0 M -37.67 21.75 L 0 0 M -37.67 -21.75 L 0 0 M 0 -43.5 L 0 0 M 37.67 -21.75 L 0 0', color: 'brown', oo: true, revenue: { x: 33.37, y: 0, v: 40 } },
  '767': { svgPath: 'M -37.67 -21.75 L 0 0 M 0 -43.5 L 0 0 M 37.67 -21.75 L 0 0 M 37.67 21.75 L 0 0', color: 'brown', city: true, revenue: { x: 20.91, y: 0, v: 30 } },
  '768': { svgPath: 'M -37.67 21.75 L 0 0 M -37.67 -21.75 L 0 0 M 37.67 -21.75 L 0 0 M 37.67 21.75 L 0 0', color: 'brown', city: true, revenue: { x: 20.91, y: 0, v: 30 } },
  '769': { svgPath: 'M 0 43.5 L 0 0 M -37.67 -21.75 L 0 0 M 0 -43.5 L 0 0 M 37.67 -21.75 L 0 0', color: 'brown', city: true, revenue: { x: 20.91, y: 0, v: 30 } },

  // X7: brown OO, 5-exit to center
  'X7': { svgPath: 'M 0 43.5 L 0 0 M -37.67 21.75 L 0 0 M -37.67 -21.75 L 0 0 M 37.67 21.75 L 0 0 M 37.67 -21.75 L 0 0', color: 'brown', oo: true, revenue: { x: 33.37, y: 0, v: 50 } },
  // X6: brown 3-exit track, no station
  'X6':  { svgPath: 'M -37.67 21.75 L 0 0 M -37.67 -21.75 L 0 0 M 37.67 -21.75 L 0 0', color: 'brown' },
  // X8: brown 2-exit track, no station
  'X8':  { svgPath: 'M -37.67 21.75 L 0 0 M 37.67 -21.75 L 0 0', color: 'brown' },
  // X9: brown multi-exit track
  'X9':  { svgPath: 'M -37.67 -21.75 L 0 0 M 0 -43.5 L 0 0 M 37.67 21.75 L 0 0', color: 'brown' },
  // X10: brown 3-exit, no station (bottom + lower-left + lower-right)
  'X10': { svgPath: 'M 0 43.5 L 0 0 M -37.67 21.75 L 0 0 M 37.67 21.75 L 0 0', color: 'brown' },
  // X22: brown OO, 6-exit (all edges to two city circles)
  'X22': { svgPath: 'M 0 43.5 L 0 25 M -37.67 21.75 L -21.65 12.5 M -37.67 -21.75 L -21.65 -12.5 M 0 -43.5 L 0 -25 M 37.67 -21.75 L 21.65 -12.5 M 37.67 21.75 L 21.65 12.5', color: 'brown', oo: true, cityPositions: [{x:-10, y:0}, {x:10, y:0}], revenue: { x: 33.37, y: 0, v: 50 } },

  // === GREY TILES ===
  '60':  { svgPath: 'M 0.00 43.30 L 0.00 0.00 M -37.50 21.65 L 0.00 0.00 M -37.50 -21.65 L 0.00 0.00 M 0.00 -43.30 L 0.00 0.00 M 37.50 -21.65 L 0.00 0.00 M 37.50 21.65 L 0.00 0.00', color: 'grey' },
  '169': { svgPath: 'M 0.00 43.30 L 0.00 0.00 M -37.50 21.65 L 0.00 0.00 M -37.50 -21.65 L 0.00 0.00 M 0.00 -43.30 L 0.00 0.00 M 37.50 -21.65 L 0.00 0.00', color: 'grey' },
  // 915: grey 5-exit, high-value city (3-slot, rendered as city)
  '915': { svgPath: 'M 0 43.5 L 0 0 M -37.67 21.75 L 0 0 M -37.67 -21.75 L 0 0 M 0 -43.5 L 0 0 M 37.67 -21.75 L 0 0', color: 'grey', city: true, revenue: { x: 20.91, y: 0, v: 50 } },
  // X1: green 3-exit, city at center
  'X1':  { svgPath: 'M -37.67 21.75 L 0 0 M -37.67 -21.75 L 0 0 M 37.67 -21.75 L 0 0', color: 'green', city: true, revenue: { x: 20.91, y: 0, v: 30 } },
  // X2: green 5-exit city
  'X2':  { svgPath: 'M 0 43.5 L 0 0 M -37.67 21.75 L 0 0 M -37.67 -21.75 L 0 0 M 0 -43.5 L 0 0 M 37.67 -21.75 L 0 0', color: 'green', city: true, revenue: { x: 20.91, y: 0, v: 30 } },
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
  // X20-X23: OO across all four eras (yellow → green → brown → grey)
  'X20': { svgPath: 'M 0 43.5 L 0 25 M -37.67 21.75 L -21.65 12.5 M -37.67 -21.75 L -21.65 -12.5 M 0 -43.5 L 0 -25 M 37.67 -21.75 L 21.65 -12.5 M 37.67 21.75 L 21.65 12.5', color: 'yellow', oo: true, cityPositions: [{x:-10, y:0}, {x:10, y:0}], revenue: { x: 33.37, y: 0, v: 30 } },
  'X21': { svgPath: 'M 0 43.5 L 0 25 M -37.67 21.75 L -21.65 12.5 M -37.67 -21.75 L -21.65 -12.5 M 0 -43.5 L 0 -25 M 37.67 -21.75 L 21.65 -12.5 M 37.67 21.75 L 21.65 12.5', color: 'green', oo: true, cityPositions: [{x:-10, y:0}, {x:10, y:0}], revenue: { x: 33.37, y: 0, v: 40 } },
  'X23': { svgPath: 'M 0 43.5 L 0 25 M -37.67 21.75 L -21.65 12.5 M -37.67 -21.75 L -21.65 -12.5 M 0 -43.5 L 0 -25 M 37.67 -21.75 L 21.65 -12.5 M 37.67 21.75 L 21.65 12.5', color: 'grey', oo: true, cityPositions: [{x:-10, y:0}, {x:10, y:0}], revenue: { x: 33.37, y: 0, v: 60 } },
};
