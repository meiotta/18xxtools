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

  // Tracks whether the map canvas is the active view; used by the resize /
  // orientationchange handler to reapply button visibility after iOS repaints.
  let _inCanvasView = true;

  function showMainView(which) {
    _inCanvasView = (which === 'canvas');
    canvasContainer.style.display  = which === 'canvas' ? 'block' : 'none';
    marketView.style.display       = which === 'market' ? 'flex'  : 'none';
    if (corpView)   corpView.style.display   = which === 'corps'  ? 'flex'  : 'none';
    if (trainsView) trainsView.style.display = which === 'trains' ? 'flex'  : 'none';
    tileManifestView.style.display = 'none'; // manifest has its own toggle
    // Right panel and nav-content only meaningful in map mode
    if (rightPanel) rightPanel.style.display = _inCanvasView ? '' : 'none';
    // Hide the 200px nav-content strip when not in map mode — give full width to center
    if (navContent) navContent.style.display = _inCanvasView ? '' : 'none';
    // Panel toggle tabs only make sense in map mode
    if (toggleLeftBtn)  toggleLeftBtn.style.display  = _inCanvasView ? '' : 'none';
    if (toggleRightBtn) toggleRightBtn.style.display = _inCanvasView ? '' : 'none';
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
  // Simple chevron: points toward center when open (= collapse hint),
  // points toward edge when collapsed (= expand hint).
  function _panelToggleIcon(side, isCollapsed) {
    // pointLeft: chevron faces left (‹)
    const pointLeft = (side === 'left') ? !isCollapsed : isCollapsed;
    const pts = pointLeft ? '6,3 2,8 6,13' : '2,3 6,8 2,13';
    return `<svg viewBox="0 0 8 16" width="7" height="14" fill="none" stroke="currentColor" ` +
      `stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">` +
      `<polyline points="${pts}"/>` +
      `</svg>`;
  }

  // rightPanel already declared above (line ~19); reuse it here.
  const toggleLeftBtn  = document.getElementById('toggleLeftPanelBtn');
  const toggleRightBtn = document.getElementById('toggleRightPanelBtn');

  let _lpCollapsed = false;
  let _rpCollapsed = false;

  if (toggleLeftBtn && navContent) {
    toggleLeftBtn.innerHTML = _panelToggleIcon('left', false);
    toggleLeftBtn.addEventListener('click', () => {
      _lpCollapsed = !_lpCollapsed;
      navContent.classList.toggle('lp-collapsed', _lpCollapsed);
      toggleLeftBtn.classList.toggle('lp-collapsed', _lpCollapsed);
      toggleLeftBtn.innerHTML = _panelToggleIcon('left', _lpCollapsed);
      toggleLeftBtn.title = _lpCollapsed ? 'Expand tile tray' : 'Collapse tile tray';
    });
  }

  if (toggleRightBtn && rightPanel) {
    toggleRightBtn.innerHTML = _panelToggleIcon('right', false);
    toggleRightBtn.addEventListener('click', () => {
      _rpCollapsed = !_rpCollapsed;
      rightPanel.classList.toggle('rp-collapsed', _rpCollapsed);
      toggleRightBtn.classList.toggle('rp-collapsed', _rpCollapsed);
      toggleRightBtn.innerHTML = _panelToggleIcon('right', _rpCollapsed);
      toggleRightBtn.title = _rpCollapsed ? 'Expand right panel' : 'Collapse right panel';
    });
  }

  // ── Orientation / resize: keep toggle-button visibility in sync ─────────
  function _syncToggleBtns() {
    const show = _inCanvasView;
    if (toggleLeftBtn)  { toggleLeftBtn.style.display  = show ? '' : 'none'; }
    if (toggleRightBtn) { toggleRightBtn.style.display = show ? '' : 'none'; }
  }
  window.addEventListener('resize', _syncToggleBtns);
  window.addEventListener('orientationchange', () => setTimeout(_syncToggleBtns, 150));

  // File ▾ dropdown toggle
  const fileMenuBtn = document.getElementById('fileMenuBtn');
  const fileMenu    = document.getElementById('fileMenu');
  if (fileMenuBtn && fileMenu) {
    let _open = false;
    fileMenuBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      _open = !_open;
      fileMenu.style.display = _open ? 'block' : 'none';
      if (!_open) document.querySelectorAll('.file-menu-parent.sub-open').forEach(p => p.classList.remove('sub-open'));
    });
    document.addEventListener('click', () => {
      if (_open) {
        _open = false;
        fileMenu.style.display = 'none';
        document.querySelectorAll('.file-menu-parent.sub-open').forEach(p => p.classList.remove('sub-open'));
      }
    });

    // Touch-friendly submenu toggle (CSS :hover handles desktop)
    fileMenu.querySelectorAll('.file-menu-parent').forEach(parent => {
      const btn = parent.querySelector('.file-menu-parent-btn');
      if (!btn) return;
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = parent.classList.contains('sub-open');
        document.querySelectorAll('.file-menu-parent.sub-open').forEach(p => p.classList.remove('sub-open'));
        if (!isOpen) parent.classList.add('sub-open');
      });
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

  // Loading splash — real async validation replaces the old 2.2s CSS timer.
  // Steps: validate tile packs → check custom packs → check localStorage state.
  // Bar fills via JS transitions; status text shows live progress.
  // Errors are shown as amber warnings; splash auto-dismisses after ≥1.8s total.
  (async () => {
    const splash    = document.getElementById('loadingSplash');
    const bar       = document.getElementById('splashBar');
    const statusEl  = document.getElementById('splashStatus');
    if (!splash) return;

    const setStatus = (msg, isWarn) => {
      if (!statusEl) return;
      statusEl.textContent = msg;
      statusEl.className = 'splash-status' + (isWarn ? ' warn' : '');
    };
    const setBar = pct => { if (bar) bar.style.width = pct + '%'; };
    const delay  = ms  => new Promise(r => setTimeout(r, ms));

    splash.style.display = 'flex';
    setBar(0);

    // ── Step 1: validate tile packs ─────────────────────────────────────────
    setStatus('Validating tile packs…');
    await delay(0); // yield to paint
    setBar(20);

    let badTiles = 0, badPackNames = [];
    if (typeof TILE_PACKS !== 'undefined' && typeof TILE_GEO !== 'undefined') {
      const COLOR_KEYS = new Set(['yellow','green','brown','gray','grey','white']);
      for (const packName of (typeof TILE_PACK_ORDER !== 'undefined' ? TILE_PACK_ORDER : [])) {
        const pack = TILE_PACKS[packName];
        if (!pack) continue;
        let packBad = 0;
        const validateEntry = (id, entry) => {
          if (!entry || typeof entry !== 'object') return;
          if (!('dsl' in entry)) return; // not a leaf
          if (!entry.dsl || entry.dsl === '') return; // blank DSL is valid (white tiles)
          try {
            const r = TILE_GEO.parseDSL(entry.dsl, entry.color);
            if (!r) packBad++;
          } catch (_) { packBad++; }
        };
        for (const [k, v] of Object.entries(pack)) {
          if (COLOR_KEYS.has(k) && v && typeof v === 'object' && !Array.isArray(v)) {
            for (const [id, entry] of Object.entries(v)) validateEntry(id, entry);
          } else {
            validateEntry(k, v);
          }
        }
        if (packBad > 0) { badTiles += packBad; badPackNames.push(packName); }
      }
    }

    setBar(55);
    setStatus('Validating custom packs…');
    await delay(0);

    // ── Step 2: check custom packs in localStorage ──────────────────────────
    let customPackErr = false;
    try {
      const raw = localStorage.getItem('18xx_custom_packs_v1');
      if (raw) JSON.parse(raw); // parse check only
    } catch (_) { customPackErr = true; }

    setBar(80);
    setStatus('Checking saved state…');
    await delay(0);

    // ── Step 3: check localStorage state ───────────────────────────────────
    let stateErr = false;
    try {
      const raw = localStorage.getItem('18xx_map_state');
      if (raw) JSON.parse(raw);
    } catch (_) { stateErr = true; }

    setBar(100);

    // ── Show result ─────────────────────────────────────────────────────────
    if (badTiles > 0) {
      setStatus(`⚠ ${badTiles} malformed tile${badTiles !== 1 ? 's' : ''} in: ${badPackNames.join(', ')}`, true);
      await delay(2000); // hold longer so user can read
    } else if (stateErr) {
      setStatus('⚠ Saved state may be corrupt — check browser console', true);
      await delay(1500);
    } else if (customPackErr) {
      setStatus('⚠ Custom pack storage unreadable — packs may be missing', true);
      await delay(1500);
    } else {
      setStatus('All systems nominal');
      await delay(400); // brief "all clear" pause before fade
    }

    // ── Fade out ────────────────────────────────────────────────────────────
    splash.classList.add('splash-fadeout');
    await delay(300);
    splash.style.display = 'none';
    splash.classList.remove('splash-fadeout');
  })();

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