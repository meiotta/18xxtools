// ─── CONSTANTS ────────────────────────────────────────────────────────────────
// Core geometric and rendering constants used throughout the editor.
// Load order: FOURTH — after tile-geometry.js, tile-packs.js, tile-registry.js

const HEX_SIZE = 40;

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
const TILE_HEX_COLORS = { white: '#D4B483', yellow: '#F0D070', green: '#71BF44', brown: '#CB7745', grey: '#BCBDC0' };
