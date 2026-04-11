// ─── STATE ────────────────────────────────────────────────────────────────────
// Global mutable application state and UI references.
// Load order: SECOND — after constants.js, before all others.
//
// state       — the saveable game data object (serialized to JSON on save)
// activeTool  — which left-panel tool is selected (string or null)
// activeTile  — which tile number is queued for placement (number or null)
// selectedHex — the currently selected hex coordinate string (e.g. 'C5')
// zoom/panX/panY — canvas viewport transform
//
// canvas/ctx/container — DOM references initialized once on DOMContentLoaded

// ── meta.staggerParity ────────────────────────────────────────────────────────
// Controls which set of internal columns receives the half-row downward offset
// in the flat-top hex grid layout.
//
//   0 (default) — even internal cols (0,2,4…) are the staggered/tall ones.
//                 This is the standard 18xx.games convention where letter=column
//                 and even columns (A,C,E…) start at string-row 2,4,6… (lower).
//
//   1           — odd internal cols (1,3,5…) are the staggered/tall ones.
//                 Set automatically when importing Ruby files that declare
//                 AXES = { x: :number, y: :letter } (e.g. 1882 Saskatchewan).
//                 In those files the coord letter encodes the ROW and the number
//                 encodes the COLUMN, so after coordToGrid transposes them the
//                 stagger direction is reversed relative to the internal grid.
//
// This value is read by getHexCenter, pixelToHex (hex-geometry.js), and
// getNeighborHex (canvas-input.js) via  (col + staggerParity) % 2 === 0.
// It is serialized in the save file so imported maps reload correctly.

// ── meta.maxRowPerCol ─────────────────────────────────────────────────────────
// When set (by importRubyMap), this records the max valid internal row for each
// column: maxRowPerCol[col] = first row index that is OUT of bounds for that col.
// null means no per-column clipping (user-created maps or uniform-height maps).
// The render loop uses this to skip positions beyond each column's valid range
// (e.g. 1889 Shikoku: rightmost cols only extend partway down the island).
// It is serialized in the save file so imported maps reload correctly.

const state = {
  meta: { title: '', baseGame: 'custom', rows: 8, cols: 12, orientation: 'flat', staggerParity: 0, maxRowPerCol: null, bank: 12000, playersMin: 2, playersMax: 6 },
  hexes: {},
  enabledPacks: null,
  companies: [],
  trains: [],
  privates: [],
  terrainCosts: { mountain: 80, hill: 40, water: 40, swamp: 20, forest: 20, desert: 40, pass: 120 },
  phase: 'setup'
};

let activeTool = null;
let activeTerrainType = null;
let activeTile = null;
let activeLabel = null;
let selectedHex = null;
let selectedHexes = new Set();   // ctrl+click multi-selection
let zoom = 1;
let panX = 0, panY = 0;

const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const container = document.getElementById('canvasContainer');
