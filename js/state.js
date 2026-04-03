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

const state = {
  meta: { title: '', baseGame: 'custom', rows: 8, cols: 12, orientation: 'flat', staggerParity: 0, bank: 12000, playersMin: 2, playersMax: 6 },
  hexes: {},
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
