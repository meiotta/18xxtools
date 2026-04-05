// ─── IO ───────────────────────────────────────────────────────────────────────
// Toolbar save/load/export handlers, autosave, and localStorage restore.
// Load order: ELEVENTH — after setup.js.
//
// autosave()  — serializes state to localStorage (called after every mutation)
// On page load, offers to restore the previous session from localStorage.

// ── Toolbar ───────────────────────────────────────────────────────────────────

// File menu open/close toggle.
// We track open state with a boolean so we never rely on reading style.display
// (which can be overridden by CSS and mis-compare as '').
let _fileMenuOpen = false;
const _fileMenuBtn = document.getElementById('fileMenuBtn');
const _fileMenuEl  = document.getElementById('fileMenu');
if (_fileMenuBtn && _fileMenuEl) {
  _fileMenuBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    _fileMenuOpen = !_fileMenuOpen;
    _fileMenuEl.style.display = _fileMenuOpen ? 'block' : 'none';
  });
  // Close on any click outside the wrapper
  document.addEventListener('click', () => {
    _fileMenuOpen = false;
    _fileMenuEl.style.display = 'none';
  });
}

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
    Object.assign(state, data);
    document.getElementById('gameTitleEdit').value = state.meta.title;
    document.getElementById('baseGameLabel').textContent = 'Base: ' + state.meta.baseGame;
    renderCompaniesTable();
    renderPrivatesTable();
    renderTrainsTable();
    renderTerrainCostsTable();
    renderHomeCompanySelect();
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
  folder.file('game.json',      JSON.stringify({ meta: state.meta, terrainCosts: state.terrainCosts }, null, 2));
  folder.file('companies.json', JSON.stringify({ companies: state.companies, privates: state.privates }, null, 2));

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

window.addEventListener('load', () => {
  const saved = localStorage.getItem('18xx-autosave');
  if (saved) {
    try {
      const data = JSON.parse(saved);
      Object.assign(state, data);
      const el = document.getElementById('gameTitleEdit');
      if (el) el.value = state.meta.title || '';
      const bl = document.getElementById('baseGameLabel');
      if (bl) bl.textContent = state.meta.baseGame ? 'Base: ' + state.meta.baseGame : '';
      syncDimInputs();
    } catch (err) {
      localStorage.removeItem('18xx-autosave');
    }
  }
  window.addEventListener('resize', resizeCanvas);
});
