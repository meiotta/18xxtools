// ─── CONFIG PANEL ────────────────────────────────────────────────────────────
// Centralised map configuration logic (terrain costs, orientation, resize).
// Loads before setup.js.

// ── Tile Pack Toggles ────────────────────────────────────────────────────────

function renderTilePackToggles() {
  const container = document.getElementById('tilePackToggles');
  if (!container) return;

  // Short display names for the UI (keys must match TILE_PACK_ORDER exactly)
  const PACK_LABELS = {
    'Basic Tile Pack': 'Basic',
    'Junctions & Nontraditional Cities': 'Junctions & Nontraditional',
    'Limited Exit & Token Cities': 'Limited Exit & Token Cities',
    'These are dumb and you are dumb but they don\'t break anything, I think': 'Dumb (but harmless)',
    'Unclassified (Review Needed)': 'Unclassified',
    'Unsupported': 'Unsupported',
  };

  // Ensure defaults are applied if enabledPacks is null
  if (!state.enabledPacks && typeof DEFAULT_ENABLED_PACKS !== 'undefined') {
    state.enabledPacks = Object.assign({}, DEFAULT_ENABLED_PACKS);
  }

  container.innerHTML = '';

  const packs = typeof TILE_PACK_ORDER !== 'undefined' ? TILE_PACK_ORDER : Object.keys(PACK_LABELS);

  for (const packName of packs) {
    const label = PACK_LABELS[packName] || packName;
    const isUnsupported = packName === 'Unsupported';
    const isEnabled = state.enabledPacks ? !!state.enabledPacks[packName] : false;

    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:8px;';

    if (isUnsupported) {
      // Static disabled indicator — no toggle
      row.innerHTML = `
        <span style="width:32px;height:16px;background:#333;border-radius:8px;display:inline-block;flex-shrink:0;"></span>
        <span style="font-size:11px;color:#555;">${label}</span>
      `;
    } else {
      const toggleId = 'tilepack_' + packName.replace(/[^a-zA-Z0-9]/g, '_');
      row.innerHTML = `
        <label class="toggle-switch" style="flex-shrink:0;">
          <input type="checkbox" id="${toggleId}"${isEnabled ? ' checked' : ''}>
          <span class="toggle-slider"></span>
        </label>
        <span style="font-size:11px;color:#ccc;">${label}</span>
      `;
      const checkbox = row.querySelector('input');
      checkbox.addEventListener('change', () => {
        if (!state.enabledPacks) state.enabledPacks = {};
        state.enabledPacks[packName] = checkbox.checked;
        if (typeof buildPalette === 'function') buildPalette();
        autosave();
      });
    }

    container.appendChild(row);
  }

  // ── Custom packs section ───────────────────────────────────────────────────
  // Shows currently loaded custom packs + a file-picker button to load more.

  const divider = document.createElement('div');
  divider.style.cssText = 'border-top:1px solid #333;margin:10px 0 8px;';
  container.appendChild(divider);

  const cpLabel = document.createElement('div');
  cpLabel.style.cssText = 'font-size:10px;color:#666;letter-spacing:.05em;text-transform:uppercase;margin-bottom:6px;';
  cpLabel.textContent = 'Custom Packs';
  container.appendChild(cpLabel);

  // List installed custom packs
  const customNames = typeof getCustomPackNames === 'function' ? getCustomPackNames() : [];
  if (customNames.length === 0) {
    const none = document.createElement('div');
    none.style.cssText = 'font-size:11px;color:#555;margin-bottom:6px;';
    none.textContent = 'No custom packs loaded';
    container.appendChild(none);
  } else {
    for (const name of customNames) {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;gap:6px;margin-bottom:4px;';
      row.innerHTML = `
        <span style="flex:1;font-size:11px;color:#bbb;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${name}">${name}</span>
        <button style="flex-shrink:0;padding:1px 6px;font-size:10px;background:#3a1a1a;border:1px solid #664;border-radius:3px;color:#c88;cursor:pointer;" data-pack="${name}">×</button>
      `;
      row.querySelector('button').addEventListener('click', () => {
        if (typeof removeCustomPack === 'function') removeCustomPack(name);
        renderTilePackToggles(); // rebuild this UI
      });
      container.appendChild(row);
    }
  }

  // File-picker button
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = '.json';
  fileInput.style.display = 'none';
  fileInput.addEventListener('change', () => {
    const file = fileInput.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = evt => {
      try {
        const data = JSON.parse(evt.target.result);
        // Validate: must have name (string) and tiles (object)
        if (!data.name || typeof data.name !== 'string') throw new Error('Missing "name" field');
        if (!data.tiles || typeof data.tiles !== 'object') throw new Error('Missing "tiles" field');
        addCustomPack(data.name, data.tiles);
        renderTilePackToggles(); // rebuild this UI
      } catch (err) {
        alert('Invalid pack file: ' + err.message + '\n\nFormat: { "name": "My Pack", "tiles": { "id": { "dsl": "...", "color": "yellow" }, ... } }');
      }
    };
    reader.readAsText(file);
    fileInput.value = ''; // allow re-picking same file
  });
  container.appendChild(fileInput);

  const loadBtn = document.createElement('button');
  loadBtn.textContent = '+ Load pack file…';
  loadBtn.style.cssText = 'margin-top:2px;padding:4px 10px;font-size:11px;background:#1e2a1e;border:1px solid #3a5a3a;border-radius:4px;color:#8bc88b;cursor:pointer;width:100%;';
  loadBtn.addEventListener('click', () => fileInput.click());
  container.appendChild(loadBtn);
}

function renderTerrainCostsTable() {
  const tbody = document.getElementById('terrainCostsTable');
  if (!tbody) return;
  tbody.innerHTML = '';
  // Expected terrain types in 18XX
  const types = ['mountain', 'hill', 'water', 'swamp', 'forest', 'desert', 'pass'];
  types.forEach(t => {
    const cost = state.terrainCosts[t] || 0;
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><span class="terrain-dot ${t}"></span> ${t.charAt(0).toUpperCase() + t.slice(1)}</td>
      <td><input type="number" value="${cost}" style="width:100%;text-align:right;"></td>
    `;
    tr.querySelector('input').addEventListener('change', (e) => {
      state.terrainCosts[t] = parseInt(e.target.value) || 0;
      autosave();
    });
    tbody.appendChild(tr);
  });
}

function syncOrientationSelect() {
  const sel = document.getElementById('configOrientation');
  if (sel) sel.value = state.meta.orientation || 'flat';
}

// ── Initialisation ───────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  // Tile Packs — rendered after state is initialized, defer slightly
  setTimeout(renderTilePackToggles, 0);

  // Orientation
  const configOrientation = document.getElementById('configOrientation');
  if (configOrientation) {
    configOrientation.addEventListener('change', (e) => {
      state.meta.orientation = e.target.value;
      if (typeof buildPalette === 'function') buildPalette();
      render();
      autosave();
    });
  }

  // Map Resize logic
  const rowsDecBtn = document.getElementById('rowsDecBtn');
  const rowsIncBtn = document.getElementById('rowsIncBtn');
  const colsDecBtn = document.getElementById('colsDecBtn');
  const colsIncBtn = document.getElementById('colsIncBtn');
  const applyResizeBtn = document.getElementById('applyResizeBtn');
  const mapRows = document.getElementById('mapRows');
  const mapCols = document.getElementById('mapCols');

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
    if (typeof applyResize === 'function') {
      applyResize(parseInt(mapRows.value), parseInt(mapCols.value));
    }
  });

  // Toolbar dimension selects (top right context)
  const dimColsSel = document.getElementById('dimCols');
  const dimRowsSel = document.getElementById('dimRows');
  if (dimColsSel) dimColsSel.addEventListener('change', () => {
    if (typeof applyResize === 'function') applyResize(parseInt(dimRowsSel.value), parseInt(dimColsSel.value));
  });
  if (dimRowsSel) dimRowsSel.addEventListener('change', () => {
    if (typeof applyResize === 'function') applyResize(parseInt(dimRowsSel.value), parseInt(dimColsSel.value));
  });
});
