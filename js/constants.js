// ─── CONSTANTS ────────────────────────────────────────────────────────────────
// Core geometric and rendering constants used throughout the editor.
// Load order: FOURTH — after tile-geometry.js, tile-packs.js, tile-registry.js

const HEX_SIZE = 40;

const TERRAIN_COLORS = {
  // All terrain types use the standard plains background.
  // Visual differentiation is through the terrain icon/badge only — no colored
  // hex backgrounds.  The offmap key is the only exception (black = off the board).
  '': '#c8a87a',
  offmap: '#1a1a1a',
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

// Tile hex fill colors by upgrade era — source: tobymao lib/hex.rb Lib::Hex::COLOR
const TILE_HEX_COLORS = { white: '#EAE0C8', yellow: '#fde900', green: '#71BF44', brown: '#CB7745', grey: '#BCBDC0' };
