// ─── SETUP ────────────────────────────────────────────────────────────────────
// Initialisation, dimension controls, and resize logic.
// Load order: TENTH — after companies-panel.js (calls renderCompaniesTable etc.)

document.addEventListener('DOMContentLoaded', () => {
  // Help drawer
  const helpBtn = document.getElementById('helpBtn');
  if (helpBtn) helpBtn.addEventListener('click', () => {
    const drawer = document.getElementById('helpDrawer');
    if (drawer) drawer.style.display = 'block';
  });
  const helpClose = document.getElementById('helpDrawerClose');
  if (helpClose) helpClose.addEventListener('click', () => {
    document.getElementById('helpDrawer').style.display = 'none';
  });

  // File ▾ dropdown toggle
  const fileMenuBtn = document.getElementById('fileMenuBtn');
  const fileMenu    = document.getElementById('fileMenu');
  if (fileMenuBtn && fileMenu) {
    let _open = false;
    fileMenuBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      _open = !_open;
      fileMenu.style.display = _open ? 'block' : 'none';
    });
    document.addEventListener('click', () => {
      if (_open) { _open = false; fileMenu.style.display = 'none'; }
    });
  }

  // Loading splash — show for 2200ms with a 300ms fade-out at 1900ms
  const splash = document.getElementById('loadingSplash');
  if (splash) {
    splash.style.display = 'flex';
    setTimeout(() => { splash.classList.add('splash-fadeout'); }, 1900);
    setTimeout(() => { splash.style.display = 'none'; splash.classList.remove('splash-fadeout'); }, 2200);
  }

  // Populate toolbar dim selects
  const dimColsSel = document.getElementById('dimCols');
  const dimRowsSel = document.getElementById('dimRows');
  if (dimColsSel) {
    for (let i = 2; i <= 80; i++) {
      const o = document.createElement('option');
      o.value = i; o.textContent = i;
      dimColsSel.appendChild(o);
    }
    dimColsSel.value = state.meta.cols;
  }
  if (dimRowsSel) {
    for (let i = 2; i <= 50; i++) {
      const o = document.createElement('option');
      o.value = i; o.textContent = i;
      dimRowsSel.appendChild(o);
    }
    dimRowsSel.value = state.meta.rows;
  }

  // Sync config-tab inputs
  const mapRows = document.getElementById('mapRows');
  const mapCols = document.getElementById('mapCols');
  if (mapRows) mapRows.value = state.meta.rows;
  if (mapCols) mapCols.value = state.meta.cols;

  // Initialise editor
  buildPalette();
  renderCompaniesTable();
  renderTrainsTable();
  renderPrivatesTable();
  renderTerrainCostsTable();
  renderHomeCompanySelect();
  syncOrientationSelect();

  // Enter editor immediately (no setup screen)
  state.phase = 'design';
  document.getElementById('editor').classList.add('active');
  requestAnimationFrame(() => { resizeCanvas(); render(); });

  // ── Toolbar dim selects — resize on change ───────────────────────────────
  if (dimColsSel) dimColsSel.addEventListener('change', () => {
    applyResize(parseInt(dimRowsSel.value), parseInt(dimColsSel.value));
  });
  if (dimRowsSel) dimRowsSel.addEventListener('change', () => {
    applyResize(parseInt(dimRowsSel.value), parseInt(dimColsSel.value));
  });

  // ── Config tab: +/- buttons and Apply ───────────────────────────────────
  const rowsDecBtn = document.getElementById('rowsDecBtn');
  const rowsIncBtn = document.getElementById('rowsIncBtn');
  const colsDecBtn = document.getElementById('colsDecBtn');
  const colsIncBtn = document.getElementById('colsIncBtn');
  const applyResizeBtn = document.getElementById('applyResizeBtn');

  if (rowsDecBtn) rowsDecBtn.addEventListener('click', () => {
    if (mapRows) mapRows.value = Math.max(2, parseInt(mapRows.value) - 1);
  });
  if (rowsIncBtn) rowsIncBtn.addEventListener('click', () => {
    if (mapRows) mapRows.value = Math.min(50, parseInt(mapRows.value) + 1);
  });
  if (colsDecBtn) colsDecBtn.addEventListener('click', () => {
    if (mapCols) mapCols.value = Math.max(2, parseInt(mapCols.value) - 1);
  });
  if (colsIncBtn) colsIncBtn.addEventListener('click', () => {
    if (mapCols) mapCols.value = Math.min(80, parseInt(mapCols.value) + 1);
  });
  if (applyResizeBtn) applyResizeBtn.addEventListener('click', () => {
    applyResize(parseInt(mapRows.value), parseInt(mapCols.value));
  });

  // ── Resize warning dialog buttons ────────────────────────────────────────
  document.getElementById('resizeConfirmBtn').addEventListener('click', () => {
    document.getElementById('resizeWarning').style.display = 'none';
    commitResize(_pendingRows, _pendingCols);
    _pendingRows = null; _pendingCols = null;
  });
  document.getElementById('resizeCancelBtn').addEventListener('click', () => {
    document.getElementById('resizeWarning').style.display = 'none';
    _pendingRows = null; _pendingCols = null;
    syncDimInputs(); // revert inputs to current state
  });
});

// ── Resize helpers ────────────────────────────────────────────────────────────

let _pendingRows = null, _pendingCols = null;

// Parse an 18xx coord string (e.g. 'B3') back to internal {row, col}.
function parseHexId(id) {
  const col = id.charCodeAt(0) - 65;
  const num = parseInt(id.slice(1));
  const row = (col % 2 === 0) ? (num - 2) / 2 : (num - 1) / 2;
  return { row, col };
}

// True if a hex entry has any non-blank content.
function hexHasContent(h) {
  if (!h) return false;
  return !!(h.tile || h.terrain || h.label || h.city || h.town ||
            h.killed || h.staticType || h.oo || h.dualTown ||
            (h.icons && h.icons.length) ||
            (h.riverEdges && h.riverEdges.length) ||
            (h.impassableEdges && h.impassableEdges.length));
}

// True if any filled hex falls outside newRows×newCols.
function hexesExistOutsideBounds(newRows, newCols) {
  return Object.entries(state.hexes).some(([id, h]) => {
    if (!hexHasContent(h)) return false;
    const { row, col } = parseHexId(id);
    return row >= newRows || col >= newCols;
  });
}

// Keep all dimension inputs in sync with state.
function syncDimInputs() {
  const dc = document.getElementById('dimCols');
  const dr = document.getElementById('dimRows');
  const mr = document.getElementById('mapRows');
  const mc = document.getElementById('mapCols');
  if (dc) dc.value = state.meta.cols;
  if (dr) dr.value = state.meta.rows;
  if (mr) mr.value = state.meta.rows;
  if (mc) mc.value = state.meta.cols;
}

// Request a resize — shows warning dialog if hexes would be lost.
function applyResize(newRows, newCols) {
  newRows = Math.max(2, Math.min(50, newRows));
  newCols = Math.max(2, Math.min(80, newCols));
  if (newRows === state.meta.rows && newCols === state.meta.cols) return;

  if (hexesExistOutsideBounds(newRows, newCols)) {
    _pendingRows = newRows;
    _pendingCols = newCols;
    document.getElementById('resizeWarning').style.display = 'flex';
    return;
  }
  commitResize(newRows, newCols);
}

// Apply the resize unconditionally, removing out-of-bounds hexes.
function commitResize(newRows, newCols) {
  for (const id of Object.keys(state.hexes)) {
    const { row, col } = parseHexId(id);
    if (row >= newRows || col >= newCols) delete state.hexes[id];
  }
  state.meta.rows = newRows;
  state.meta.cols = newCols;
  syncDimInputs();
  render();
  autosave();
}

// ── Preset loader ─────────────────────────────────────────────────────────────

function loadPreset(game) {
  const presets = {
    custom: {
      rows: 8, cols: 12, bank: 12000, playersMin: 2, playersMax: 6,
      terrainCosts: { mountain: 80, hill: 40, water: 40, swamp: 20, forest: 20, desert: 40, pass: 120 },
      companies: [],
      trains: [],
      privates: []
    },
    '1830': {
      rows: 9, cols: 11, bank: 12000, playersMin: 2, playersMax: 6,
      terrainCosts: { mountain: 80, hill: 40, water: 40, swamp: 20, forest: 20, desert: 40, pass: 120 },
      companies: [
        { name: 'Pennsylvania RR', abbr: 'PRR', color: '#cc2222', homeHex: '', parValue: 100, tokens: 5, floatPct: 60 },
        { name: 'New York Central', abbr: 'NYC', color: '#888888', homeHex: '', parValue: 100, tokens: 5, floatPct: 60 },
        { name: 'Chesapeake & Ohio', abbr: 'C&O', color: '#ccaa00', homeHex: '', parValue: 100, tokens: 5, floatPct: 60 },
        { name: 'B&O', abbr: 'B&O', color: '#1166aa', homeHex: '', parValue: 100, tokens: 5, floatPct: 60 }
      ],
      trains: [
        { type: '2', cost: 80,  distance: 2, rustsOn: '4', obsoleteOn: '', count: 6 },
        { type: '3', cost: 180, distance: 3, rustsOn: '6', obsoleteOn: '', count: 5 },
        { type: '4', cost: 300, distance: 4, rustsOn: 'D', obsoleteOn: '', count: 4 },
        { type: '5', cost: 450, distance: 5, rustsOn: '',  obsoleteOn: '', count: 3 },
        { type: '6', cost: 630, distance: 6, rustsOn: '',  obsoleteOn: '', count: 2 }
      ],
      privates: []
    },
    '1846': {
      rows: 7, cols: 9, bank: 9999, playersMin: 3, playersMax: 6,
      terrainCosts: { mountain: 100, hill: 40, water: 60, swamp: 20, forest: 20, desert: 40, pass: 120 },
      companies: [
        { name: 'Michigan Central', abbr: 'MC',  color: '#cc2222', homeHex: '', parValue: 100, tokens: 5, floatPct: 60 },
        { name: 'Illinois Central', abbr: 'IC',  color: '#228822', homeHex: '', parValue: 100, tokens: 5, floatPct: 60 },
        { name: 'B&O',              abbr: 'B&O', color: '#1166aa', homeHex: '', parValue: 100, tokens: 5, floatPct: 60 }
      ],
      trains: [
        { type: '2', cost: 80,  distance: 2, rustsOn: '', obsoleteOn: '', count: 5 },
        { type: '3', cost: 180, distance: 3, rustsOn: '', obsoleteOn: '', count: 4 },
        { type: '4', cost: 290, distance: 4, rustsOn: '', obsoleteOn: '', count: 3 },
        { type: '5', cost: 390, distance: 5, rustsOn: '', obsoleteOn: '', count: 2 }
      ],
      privates: [
        { name: 'Michigan Southern', cost: 80,  revenue: 15, ability: 'Connect' },
        { name: 'Ohio & Indiana',    cost: 100, revenue: 15, ability: 'Tunnel'  }
      ]
    },
    '1822': {
      rows: 9, cols: 12, bank: 12000, playersMin: 3, playersMax: 7,
      terrainCosts: { mountain: 200, hill: 40, water: 80, swamp: 20, forest: 20, desert: 40, pass: 120 },
      companies: [
        { name: 'London & North Western', abbr: 'LNWR', color: '#222222', homeHex: '', parValue: 100, tokens: 5, floatPct: 60 },
        { name: 'Great Western',          abbr: 'GWR',  color: '#228822', homeHex: '', parValue: 100, tokens: 5, floatPct: 60 },
        { name: 'Midland',                abbr: 'MR',   color: '#cc2222', homeHex: '', parValue: 100, tokens: 5, floatPct: 60 }
      ],
      trains: [
        { type: 'L', cost: 100, distance: 1, rustsOn: '', obsoleteOn: '', count: 4 },
        { type: '2', cost: 180, distance: 2, rustsOn: '', obsoleteOn: '', count: 5 },
        { type: '3', cost: 300, distance: 3, rustsOn: '', obsoleteOn: '', count: 4 }
      ],
      privates: []
    },
    '1889': {
      rows: 6, cols: 7, bank: 7000, playersMin: 3, playersMax: 6,
      terrainCosts: { mountain: 80, hill: 40, water: 40, swamp: 20, forest: 20, desert: 40, pass: 120 },
      companies: [
        { name: 'Aomori Railway', abbr: 'AR', color: '#cc6600', homeHex: '', parValue: 100, tokens: 5, floatPct: 60 },
        { name: 'Iyo Railway',    abbr: 'IR', color: '#cc2222', homeHex: '', parValue: 100, tokens: 5, floatPct: 60 },
        { name: 'Sanuki Railway', abbr: 'SR', color: '#2244cc', homeHex: '', parValue: 100, tokens: 5, floatPct: 60 }
      ],
      trains: [
        { type: '2', cost: 80,  distance: 2, rustsOn: '', obsoleteOn: '', count: 6 },
        { type: '3', cost: 180, distance: 3, rustsOn: '', obsoleteOn: '', count: 5 },
        { type: '4', cost: 300, distance: 4, rustsOn: '', obsoleteOn: '', count: 4 }
      ],
      privates: []
    }
  };
  const p = presets[game] || presets.custom;
  state.meta.baseGame  = game;
  state.meta.rows      = p.rows;
  state.meta.cols      = p.cols;
  state.meta.bank      = p.bank;
  state.meta.playersMin = p.playersMin;
  state.meta.playersMax = p.playersMax;
  state.terrainCosts   = p.terrainCosts;
  state.companies      = JSON.parse(JSON.stringify(p.companies));
  state.trains         = JSON.parse(JSON.stringify(p.trains));
  state.privates       = JSON.parse(JSON.stringify(p.privates));
}

// ── Orientation config control ────────────────────────────────────────────────

// Sync the CONFIG tab orientation select to the current state.
// Call after any operation that changes state.meta.orientation.
function syncOrientationSelect() {
  const sel = document.getElementById('configOrientation');
  if (sel) sel.value = state.meta.orientation || 'flat';
}

// Re-render map whenever orientation is changed in the config panel.
document.getElementById('configOrientation').addEventListener('change', (e) => {
  state.meta.orientation = e.target.value;
  render();
  autosave();
});
