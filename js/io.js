// ─── IO ───────────────────────────────────────────────────────────────────────
// Toolbar save/load/export handlers, autosave, and localStorage restore.
// Load order: ELEVENTH — after setup.js.
//
// autosave()  — serializes state to localStorage (called after every mutation)
// On page load, offers to restore the previous session from localStorage.

// ── Toolbar ───────────────────────────────────────────────────────────────────

// File menu toggle is wired in setup.js DOMContentLoaded (safe DOM access).

document.getElementById('saveBtn').addEventListener('click', () => {
  state.meta.title = document.getElementById('gameTitleEdit').value;
  const json = JSON.stringify(state, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = (state.meta.title || 'game') + '.18xx.json';
  a.click();
  URL.revokeObjectURL(url);
});

document.getElementById('loadBtn').addEventListener('click', () => {
  document.getElementById('fileInput').click();
});

document.getElementById('fileInput').addEventListener('change', (e) => {
  const file = e.target.files[0];
  const reader = new FileReader();
  reader.onload = (evt) => {
    const data = JSON.parse(evt.target.result);
    TileRegistry.setEmbeddedTiles(data.customTiles || {});
    Object.assign(state, data);
    document.getElementById('gameTitleEdit').value = state.meta.title;
    document.getElementById('baseGameLabel').textContent = 'Base: ' + state.meta.baseGame;
    renderCompaniesTable();
    if (typeof renderMinorsTable === 'function') renderMinorsTable();
    renderPrivatesCards();
    renderTrainsTable();
    renderTerrainCostsTable();
    renderHomeCompanySelect();
    if (typeof initFinancialsListeners === 'function') initFinancialsListeners();
    if (typeof renderLogicRules === 'function') renderLogicRules();
    buildPalette();
    syncOrientationSelect();
    syncDimInputs();
    render();
    autosave();
  };
  reader.readAsText(file);
});

document.getElementById('exportBtn').addEventListener('click', async () => {
  state.meta.title = document.getElementById('gameTitleEdit').value;
  const zip = new JSZip();
  const folder = zip.folder(state.meta.title || 'game');

  const mapHexes = [];
  for (let r = 0; r < state.meta.rows; r++) {
    for (let c = 0; c < state.meta.cols; c++) {
      const id = hexId(r, c);
      const hex = state.hexes[id];
      if (hex) mapHexes.push({ coordinate: id, ...hex });
    }
  }

  folder.file('map.json',       JSON.stringify({ rows: state.meta.rows, cols: state.meta.cols, orientation: state.meta.orientation, hexes: mapHexes }, null, 2));
  folder.file('tiles.json',     JSON.stringify({ tiles: state.trains }, null, 2));
  folder.file('game.json',      JSON.stringify({ meta: state.meta, terrainCosts: state.terrainCosts, financials: state.financials }, null, 2));
  folder.file('companies.json', JSON.stringify({ companies: state.companies, minors: state.minors, privates: state.privates, financials: state.financials }, null, 2));

  const readme = `# ${state.meta.title || 'Game'}\n\nBase: ${state.meta.baseGame}\nGrid: ${state.meta.rows}×${state.meta.cols}\nBank: $${state.meta.bank}\nPlayers: ${state.meta.playersMin}-${state.meta.playersMax}`;
  folder.file('README.md', readme);

  const blob = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = (state.meta.title || 'game') + '.zip';
  a.click();
  URL.revokeObjectURL(url);
});

// ── Autosave ──────────────────────────────────────────────────────────────────

function autosave() {
  localStorage.setItem('18xx-autosave', JSON.stringify(state));
}

// ── Restore on load ───────────────────────────────────────────────────────────

function _applyAutosave(data) {
  Object.assign(state, data);
  const el = document.getElementById('gameTitleEdit');
  if (el) el.value = state.meta.title || '';
  const bl = document.getElementById('baseGameLabel');
  if (bl) bl.textContent = state.meta.baseGame ? 'Base: ' + state.meta.baseGame : '';
  syncDimInputs();
  if (typeof syncOrientationSelect === 'function') syncOrientationSelect();
  if (typeof syncFinancialsUI      === 'function') syncFinancialsUI();
  if (typeof renderMarketEditor    === 'function') renderMarketEditor();
  if (typeof renderLogicRules      === 'function') renderLogicRules();
  if (typeof buildPalette          === 'function') buildPalette();
  render();
}

function _showAutosaveBanner(data) {
  const banner = document.createElement('div');
  banner.id = 'autosaveBanner';
  const title = data.meta?.title || 'Untitled';
  banner.style.cssText = [
    'position:fixed', 'bottom:20px', 'left:50%', 'transform:translateX(-50%)',
    'background:#1e2a1e', 'border:1px solid #4a7c4a', 'border-radius:8px',
    'padding:12px 20px', 'z-index:9999', 'display:flex', 'align-items:center',
    'gap:14px', 'box-shadow:0 4px 18px rgba(0,0,0,0.6)',
    'font-size:13px', 'color:#ccc', 'max-width:480px'
  ].join(';');
  banner.innerHTML = `
    <span>📋 Autosaved work found: <strong style="color:#e8e8e8">${title}</strong></span>
    <button id="autosaveRestoreBtn" style="background:#4a7c4a;color:#fff;border:none;border-radius:5px;padding:5px 12px;cursor:pointer;font-size:12px;">Restore</button>
    <button id="autosaveDismissBtn" style="background:#3a3a3a;color:#ccc;border:1px solid #555;border-radius:5px;padding:5px 12px;cursor:pointer;font-size:12px;">Discard</button>
  `;
  document.body.appendChild(banner);
  document.getElementById('autosaveRestoreBtn').addEventListener('click', () => {
    _applyAutosave(data);
    banner.remove();
  });
  document.getElementById('autosaveDismissBtn').addEventListener('click', () => {
    localStorage.removeItem('18xx-autosave');
    banner.remove();
  });
}

document.getElementById('newMapBtn').addEventListener('click', () => {
  if (!confirm('Start a new map? Unsaved changes will be lost.')) return;
  const fresh = {
    meta: { title: '', baseGame: 'custom', rows: 8, cols: 12, orientation: 'flat', staggerParity: 0, coordParity: 0, maxRowPerCol: null, bank: 12000, playersMin: 2, playersMax: 6 },
    hexes: {}, companies: [], minors: [], trains: [], privates: [],
    terrainCosts: { mountain: 80, hill: 40, water: 40, swamp: 20, forest: 20, desert: 40, pass: 120 },
    financials: { bank: 12000, marketType: '2D', market: [], marketRows: 11, marketCols: 19, rules: { dividend: 'right', withheld: 'left', soldOut: 'up', canPool: true }, logicRules: [] },
    enabledPacks: null,
  };
  Object.assign(state, fresh);
  document.getElementById('gameTitleEdit').value = '';
  document.getElementById('baseGameLabel').textContent = '';
  syncDimInputs();
  if (typeof syncOrientationSelect === 'function') syncOrientationSelect();
  if (typeof buildPalette          === 'function') buildPalette();
  if (typeof renderCompaniesTable  === 'function') renderCompaniesTable();
  if (typeof renderMarketEditor    === 'function') renderMarketEditor();
  render();
  autosave();
  document.getElementById('fileMenu').style.display = 'none';
});

window.addEventListener('load', () => {
  const saved = localStorage.getItem('18xx-autosave');
  if (saved) {
    try {
      const data = JSON.parse(saved);
      // Only offer restore if there's actual content (hexes or a title)
      if (data && (data.meta?.title || Object.keys(data.hexes || {}).length > 0)) {
        _showAutosaveBanner(data);
      } else {
        localStorage.removeItem('18xx-autosave');
      }
    } catch (err) {
      localStorage.removeItem('18xx-autosave');
    }
  }
  window.addEventListener('resize', resizeCanvas);
});
