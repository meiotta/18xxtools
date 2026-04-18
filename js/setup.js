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

  // ── Left Nav Rail — section switching ──────────────────────────────────────
  const canvasContainer   = document.getElementById('canvasContainer');
  const marketView        = document.getElementById('marketView');
  const corpView          = document.getElementById('corpView');
  const trainsView        = document.getElementById('trainsView');
  const tileManifestView  = document.getElementById('tileManifestView');
  const rightPanel        = document.getElementById('rightPanel');
  const navContent        = document.getElementById('navContent');

  function showMainView(which) {
    canvasContainer.style.display  = which === 'canvas' ? 'block' : 'none';
    marketView.style.display       = which === 'market' ? 'flex'  : 'none';
    if (corpView)   corpView.style.display   = which === 'corps'  ? 'flex'  : 'none';
    if (trainsView) trainsView.style.display = which === 'trains' ? 'flex'  : 'none';
    tileManifestView.style.display = 'none'; // manifest has its own toggle
    // Right panel and nav-content only meaningful in map mode
    if (rightPanel) rightPanel.style.display = which === 'canvas' ? '' : 'none';
    // Hide the 200px nav-content strip when not in map mode — give full width to center
    if (navContent) navContent.style.display = which === 'canvas' ? '' : 'none';
  }

  document.querySelectorAll('.nav-rail-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const sec = btn.dataset.lsec;

      // Update nav active state
      document.querySelectorAll('.nav-rail-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      // Show/hide lsections (only relevant for map mode now, but kept for structure)
      document.querySelectorAll('.lsection').forEach(s => s.classList.remove('active'));
      const target = document.getElementById('lsec-' + sec);
      if (target) target.classList.add('active');

      // Switch main center view
      if (sec === 'market') {
        showMainView('market');
        if (typeof renderMarketEditor === 'function') renderMarketEditor();
        // Update summary label
        const summary = document.getElementById('lsec-market-summary');
        if (summary && typeof state !== 'undefined') {
          const t = state.market?.type || '2D';
          const r = state.market?.rows || 11;
          const c = state.market?.cols || 19;
          summary.textContent = t === '1D' ? `1D Linear · ${state.market?.count || 10} cells`
                              : t === 'zigzag' ? `1.5D Zigzag · ${r}×${c}`
                              : `2D Grid · ${r}×${c}`;
        }
      } else if (sec === 'companies') {
        showMainView('corps');
      } else if (sec === 'trains') {
        showMainView('trains');
      } else {
        showMainView('canvas');
      }
    });
  });

  // ── Corps view tab switching (Privates / Minors / Majors) ───────────────────
  document.querySelectorAll('.corp-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.corpTab;

      // Update active tab button
      document.querySelectorAll('.corp-tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      // Show/hide sections
      const sections = {
        privates: { id: 'corpPrivatesSection', display: 'flex' },
        corps:    { id: 'corpCorpsSection',    display: 'flex' },
        auction:  { id: 'corpAuctionSection',  display: 'flex' },
      };
      Object.entries(sections).forEach(([key, cfg]) => {
        const el = document.getElementById(cfg.id);
        if (el) el.style.display = key === tab ? cfg.display : 'none';
      });
      // Trigger renders when switching tabs
      if (tab === 'corps'    && typeof renderCorpsSection    === 'function') renderCorpsSection();
      if (tab === 'auction'  && typeof renderAuctionPanel    === 'function') renderAuctionPanel();

      // Show/hide the matching add button
      document.querySelectorAll('.corp-add-btn').forEach(b => {
        b.style.display = (b.dataset.addFor === tab) ? '' : 'none';
      });
    });
  });

  // ── Right-panel Tab Switching (hex + config only) ──────────────────────────
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tabId = btn.dataset.tab;

      // Update Tab Headers
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      // Update Tab Content
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      const activeTab = document.getElementById(tabId + 'Tab');
      if (activeTab) activeTab.classList.add('active');
    });
  });

  // ── Theme Toggle ────────────────────────────────────────────────────────────
  const themeToggleBtn = document.getElementById('themeToggleBtn');
  if (themeToggleBtn) {
    themeToggleBtn.addEventListener('click', () => {
      const html = document.documentElement;
      const isDark = html.getAttribute('data-theme') !== 'light';
      html.setAttribute('data-theme', isDark ? 'light' : 'dark');
      // isDark=true → just switched to light → show 🌙 (click to go dark)
      // isDark=false → just switched to dark → show ☀️ (click to go light)
      themeToggleBtn.textContent = isDark ? '🌙' : '☀️';
    });
  }

  const helpClose = document.getElementById('helpDrawerClose');
  if (helpClose) helpClose.addEventListener('click', () => {
    document.getElementById('helpDrawer').style.display = 'none';
  });

  // ── Panel collapse/expand buttons ──────────────────────────────────────────
  // Iconoir "Sidebar Collapse" visual language: rounded-rect frame split by a
  // vertical divider, with a chevron in the sidebar pane showing direction.
  function _panelToggleIcon(side, isCollapsed) {
    // side: 'left' | 'right'. isCollapsed: whether the panel is currently hidden.
    const divX = side === 'left' ? 7 : 13;
    // When collapsed → chevron points INWARD (toward center) = expand hint
    // When open      → chevron points OUTWARD (toward edge)  = collapse hint
    let pts;
    if (side === 'left') {
      pts = isCollapsed ? '3,6.5 5.5,9 3,11.5' : '5.5,6.5 3,9 5.5,11.5';
    } else {
      pts = isCollapsed ? '17,6.5 14.5,9 17,11.5' : '14.5,6.5 17,9 14.5,11.5';
    }
    return `<svg viewBox="0 0 20 18" width="16" height="16" fill="none" stroke="currentColor" ` +
      `stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="display:block" aria-hidden="true">` +
      `<rect x="1" y="1" width="18" height="16" rx="2.5"/>` +
      `<line x1="${divX}" y1="1" x2="${divX}" y2="17"/>` +
      `<polyline points="${pts}"/>` +
      `</svg>`;
  }

  const leftPanel  = document.getElementById('leftPanel');
  // rightPanel already declared above (line ~19); reuse it here.
  const toggleLeftBtn  = document.getElementById('toggleLeftPanelBtn');
  const toggleRightBtn = document.getElementById('toggleRightPanelBtn');

  let _lpCollapsed = false;
  let _rpCollapsed = false;

  if (toggleLeftBtn && leftPanel) {
    toggleLeftBtn.innerHTML = _panelToggleIcon('left', false);
    toggleLeftBtn.addEventListener('click', () => {
      _lpCollapsed = !_lpCollapsed;
      leftPanel.classList.toggle('lp-collapsed', _lpCollapsed);
      toggleLeftBtn.innerHTML = _panelToggleIcon('left', _lpCollapsed);
      toggleLeftBtn.title = _lpCollapsed ? 'Expand left panel' : 'Collapse left panel';
    });
  }

  if (toggleRightBtn && rightPanel) {
    toggleRightBtn.innerHTML = _panelToggleIcon('right', false);
    toggleRightBtn.addEventListener('click', () => {
      _rpCollapsed = !_rpCollapsed;
      rightPanel.classList.toggle('rp-collapsed', _rpCollapsed);
      toggleRightBtn.innerHTML = _panelToggleIcon('right', _rpCollapsed);
      toggleRightBtn.title = _rpCollapsed ? 'Expand right panel' : 'Collapse right panel';
    });
  }

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

  // Map section → Clear Map
  const mapClearBtn       = document.getElementById('mapClearBtn');
  const clearMapWarning   = document.getElementById('clearMapWarning');
  const clearMapConfirmBtn = document.getElementById('clearMapConfirmBtn');
  const clearMapCancelBtn  = document.getElementById('clearMapCancelBtn');

  if (mapClearBtn && clearMapWarning) {
    mapClearBtn.addEventListener('click', () => {
      clearMapWarning.style.display = 'flex';
    });
    clearMapCancelBtn.addEventListener('click', () => {
      clearMapWarning.style.display = 'none';
    });
    clearMapConfirmBtn.addEventListener('click', () => {
      clearMapWarning.style.display = 'none';

      // Wipe all hex data — empty object means every position is default (alive, blank)
      state.hexes = {};

      // Clear per-column row limits (imported map shape) since we're starting fresh
      state.meta.maxRowPerCol = null;

      // Reset selection state
      selectedHex = null;
      selectedHexes = new Set();

      render();
      autosave();
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
  TileRegistry.rebuildRegistry();
  buildPalette();
  renderCompaniesTable();
  renderMinorsTable();
  renderTrainsTable();
  renderPhasesTable();
  renderPrivatesCards();
  renderTerrainCostsTable();
  renderHomeCompanySelect();
  syncOrientationSelect();
  if (typeof initFinancialsListeners === 'function') initFinancialsListeners();
  if (typeof initMarketWizard === 'function') initMarketWizard();
  if (typeof initMarketPainter === 'function') initMarketPainter();
  if (typeof initLogicRulesListeners === 'function') {
    initLogicRulesListeners();
    renderLogicRules();
  }

  // Enter editor immediately (no setup screen)
  state.phase = 'design';
  document.getElementById('editor').classList.add('active');
  requestAnimationFrame(() => { resizeCanvas(); render(); });

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

  // ── Market split — resizable drag handle ─────────────────────────────────
  const marketHandle = document.getElementById('marketResizeHandle');
  const marketLeft   = document.getElementById('marketLeftPane');
  const marketView_  = document.getElementById('marketView');

  if (marketHandle && marketLeft && marketView_) {
    let _dragging = false, _startX = 0, _startW = 0;

    marketHandle.addEventListener('mousedown', e => {
      _dragging = true;
      _startX   = e.clientX;
      _startW   = marketLeft.offsetWidth;
      document.body.style.cursor  = 'col-resize';
      document.body.style.userSelect = 'none';
      e.preventDefault();
    });

    document.addEventListener('mousemove', e => {
      if (!_dragging) return;
      const dx      = e.clientX - _startX;
      const total   = marketView_.offsetWidth;
      const newW    = Math.max(280, Math.min(total - 220, _startW + dx));
      marketLeft.style.width = newW + 'px';
    });

    document.addEventListener('mouseup', () => {
      if (!_dragging) return;
      _dragging = false;
      document.body.style.cursor     = '';
      document.body.style.userSelect = '';
    });
  }
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
  state.meta.maxRowPerCol = null; // Clear per-column limits on resize
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