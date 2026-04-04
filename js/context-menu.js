// ─── CONTEXT MENU ─────────────────────────────────────────────────────────────
// Right-click context menu for hex operations.
// Load order: SIXTH — after canvas-input.js (uses ensureHex, render, autosave).

// ── Terrain definitions (cost-bearing, drawn by renderer) ────────────────────
const TERRAIN_TYPES = [
  { label: 'Hill',     key: 'hill',     defaultCost: 40  },
  { label: 'Mountain', key: 'mountain', defaultCost: 80  },
  { label: 'Swamp',    key: 'swamp',    defaultCost: 40  },
  { label: 'Marsh',    key: 'marsh',    defaultCost: 20  },
  { label: 'Water',    key: 'water',    defaultCost: 40  },
  { label: 'River',    key: 'river',    defaultCost: 40  },
  { label: 'Lake',     key: 'lake',     defaultCost: 60  },
  { label: 'Forest',   key: 'forest',   defaultCost: 10  },
  { label: 'Desert',   key: 'desert',   defaultCost: 20  },
  { label: 'Pass',     key: 'pass',     defaultCost: 120 },
];

// ── Resource icon definitions (no default cost, canvas-drawn) ────────────────
const RESOURCE_ICONS = [
  { label: 'Mine',    key: 'mine'    },
  { label: 'Port',    key: 'port'    },
  { label: 'Factory', key: 'factory' },
];

function removeContextMenu() {
  const old = document.getElementById('contextMenu');
  if (old) old.remove();
}

// ── Shared menu-building helpers ─────────────────────────────────────────────

function _addItem(menu, label, onClick) {
  const item = document.createElement('div');
  item.className = 'context-menu-item';
  item.textContent = label;
  item.onclick = (e) => { e.stopPropagation(); removeContextMenu(); onClick(); };
  menu.appendChild(item);
  return item;
}

function _addSep(menu) {
  const s = document.createElement('div');
  s.className = 'context-menu-sep';
  menu.appendChild(s);
}

function _addSectionLabel(menu, text) {
  const lbl = document.createElement('div');
  lbl.style.cssText = 'padding:3px 10px 1px;font-size:10px;color:#999;letter-spacing:0.06em;text-transform:uppercase;user-select:none;';
  lbl.textContent = text;
  menu.appendChild(lbl);
}

// ── Terrain submenu builder ───────────────────────────────────────────────────

function _buildTerrainSubmenu(menu, onApply) {
  const wrapper = document.createElement('div');
  wrapper.className = 'context-menu-item has-submenu';
  wrapper.innerHTML = '⛰ Add Terrain';

  const submenu = document.createElement('div');
  submenu.className = 'context-menu-submenu';

  TERRAIN_TYPES.forEach(({ label, key, defaultCost }) => {
    const sub = document.createElement('div');
    sub.className = 'context-menu-item';
    sub.textContent = label;
    sub.onclick = (e) => {
      e.stopPropagation();
      removeContextMenu();
      const cost = prompt(`Terrain cost for ${label} (0 = no cost displayed):`, String(defaultCost));
      if (cost === null) return;
      onApply(key, parseInt(cost, 10) || 0);
    };
    submenu.appendChild(sub);
  });

  wrapper.appendChild(submenu);
  menu.appendChild(wrapper);
}

// ── Resource icon strip builder ───────────────────────────────────────────────

function _buildIconStrip(menu, currentIcons, onToggle) {
  const iconDiv = document.createElement('div');
  iconDiv.style.cssText = 'padding:4px 10px 6px;';

  const strip = document.createElement('div');
  strip.style.cssText = 'display:flex;gap:6px;align-items:center;';

  RESOURCE_ICONS.forEach(({ label, key }) => {
    const btn = document.createElement('button');
    const active = currentIcons.includes(key);
    btn.title = label;
    btn.style.cssText = `
      padding:4px 8px;cursor:pointer;border-radius:4px;font-size:11px;
      border:1px solid ${active ? '#ffd700' : '#555'};
      background:${active ? 'rgba(255,215,0,0.18)' : '#2a2a2a'};
      color:${active ? '#ffd700' : '#ccc'};
      white-space:nowrap;
    `;
    btn.textContent = label;
    btn.onclick = (e) => {
      e.stopPropagation();
      removeContextMenu();
      onToggle(key, !active);
    };
    strip.appendChild(btn);
  });

  iconDiv.appendChild(strip);
  menu.appendChild(iconDiv);
}

// ── Single-hex context menu ───────────────────────────────────────────────────

function showContextMenu(x, y, hexId) {
  removeContextMenu();
  const menu = document.createElement('div');
  menu.id = 'contextMenu';
  menu.className = 'context-menu';
  menu.style.left = x + 'px';
  menu.style.top  = y + 'px';

  const hex = state.hexes[hexId] || {};

  function addItem(label, onClick) { return _addItem(menu, label, onClick); }
  function addSep()                { _addSep(menu); }

  // ── City ──────────────────────────────────────────────────────────────────
  addItem('🏙 City — Quick Add', () => {
    const name = prompt('City name (leave blank for unnamed):', hex.city?.name || hex.ooCityName || '');
    if (name === null) return;
    ensureHex(hexId);
    state.hexes[hexId].city = { name: name.trim(), slots: 1, home: '', revenue: { yellow: 0, green: 0, brown: 0, grey: 0 } };
    state.hexes[hexId].town = null;
    state.hexes[hexId].oo   = false;
    state.hexes[hexId].dualTown = false;
    render(); autosave();
  });

  // ── Town ──────────────────────────────────────────────────────────────────
  addItem('🔴 Town — Quick Add', () => {
    const name = prompt('Town name (leave blank for unnamed):', hex.town?.name || '');
    if (name === null) return;
    ensureHex(hexId);
    state.hexes[hexId].town = { name: name.trim() };
    state.hexes[hexId].dualTown = false;
    state.hexes[hexId].city = null;
    state.hexes[hexId].oo   = false;
    render(); autosave();
  });

  addSep();

  // ── Terrain section ───────────────────────────────────────────────────────
  _addSectionLabel(menu, 'Terrain');
  _buildTerrainSubmenu(menu, (key, cost) => {
    ensureHex(hexId);
    state.hexes[hexId].terrain     = key;
    state.hexes[hexId].terrainCost = cost;
    render(); autosave();
  });

  // ── Icons section ─────────────────────────────────────────────────────────
  _addSectionLabel(menu, 'Icons');
  const currentIcons = (hex.icons || []).map(i => i.image);
  _buildIconStrip(menu, currentIcons, (key, add) => {
    ensureHex(hexId);
    const icons = state.hexes[hexId].icons || [];
    const idx = icons.findIndex(i => i.image === key);
    if (add && idx < 0) {
      icons.push({ image: key, sticky: true });
    } else if (!add && idx >= 0) {
      icons.splice(idx, 1);
    }
    state.hexes[hexId].icons = icons;
    render(); autosave();
  });

  addSep();

  // ── Build-A-Hex (single hex only) ─────────────────────────────────────────
  addItem((hex.static ? '🗺 Edit Hex (Advanced)' : '🗺 Build-A-Hex (Advanced)'), () => {
    if (typeof openStaticHexWizard === 'function') openStaticHexWizard(hexId);
  });

  addSep();

  // ── Copy / Paste (single hex only) ───────────────────────────────────────
  addItem('📋 Copy Hex', () => {
    window.clipboardHex = JSON.parse(JSON.stringify(state.hexes[hexId] || {}));
    updateStatus('Hex copied');
  });
  addItem('📌 Paste Hex', () => {
    if (window.clipboardHex) {
      state.hexes[hexId] = JSON.parse(JSON.stringify(window.clipboardHex));
      render(); updateStatus('Hex pasted'); autosave();
    }
  });

  addSep();

  // ── Clear / Kill ──────────────────────────────────────────────────────────
  addItem('🗑 Clear Hex', () => {
    state.hexes[hexId] = { terrain: '', terrainCost: 0, tile: 0, rotation: 0, city: null, town: null, oo: false, dualTown: false, ooCityName: '', label: '', icons: [], killed: false };
    render(); autosave();
  });
  addItem(hex.killed ? '✅ Unkill Hex' : '💀 Kill Hex', () => {
    if (hex.killed) {
      ensureHex(hexId);
      state.hexes[hexId].killed = false;
    } else {
      state.hexes[hexId] = { terrain: '', terrainCost: 0, tile: 0, rotation: 0, city: null, town: null, label: '', icons: [], killed: true };
    }
    render(); autosave();
  });

  document.body.appendChild(menu);
  setTimeout(() => { document.addEventListener('click', removeContextMenu, { once: true }); }, 0);
}

// ── Multi-hex context menu ────────────────────────────────────────────────────

function showMultiContextMenu(x, y, hexIds) {
  removeContextMenu();
  const menu = document.createElement('div');
  menu.id = 'contextMenu';
  menu.className = 'context-menu';
  menu.style.left = x + 'px';
  menu.style.top  = y + 'px';

  const n = hexIds.length;
  const countLabel = document.createElement('div');
  countLabel.style.cssText = 'padding:4px 10px 3px;font-size:11px;color:#aaa;border-bottom:1px solid #444;margin-bottom:3px;';
  countLabel.textContent = `${n} hexes selected`;
  menu.appendChild(countLabel);

  function addItem(label, onClick) { return _addItem(menu, label, onClick); }
  function addSep()                { _addSep(menu); }

  function applyToAll(fn) {
    hexIds.forEach(id => { ensureHex(id); fn(id); });
    render(); autosave();
  }

  // ── City ──────────────────────────────────────────────────────────────────
  addItem('🏙 Add City (all)', () => {
    const name = prompt('City name for all selected (blank = unnamed):');
    if (name === null) return;
    applyToAll(id => {
      state.hexes[id].city = { name: name.trim(), slots: 1, home: '', revenue: { yellow: 0, green: 0, brown: 0, grey: 0 } };
      state.hexes[id].town = null;
      state.hexes[id].oo   = false;
    });
  });

  // ── Town ──────────────────────────────────────────────────────────────────
  addItem('🔴 Add Town (all)', () => {
    applyToAll(id => {
      state.hexes[id].town = { name: '' };
      state.hexes[id].city = null;
      state.hexes[id].oo   = false;
    });
  });

  addSep();

  // ── Terrain section ───────────────────────────────────────────────────────
  _addSectionLabel(menu, 'Terrain');

  // Context-aware: if all selected hexes share the same terrain type, offer a quick cost update
  const allTerrains = hexIds.map(id => (state.hexes[id] || {}).terrain).filter(Boolean);
  const uniqueTerrains = [...new Set(allTerrains)];
  if (uniqueTerrains.length === 1 && allTerrains.length === hexIds.length) {
    const sharedType = uniqueTerrains[0];
    const terrainDef = TERRAIN_TYPES.find(t => t.key === sharedType);
    const currentCost = (state.hexes[hexIds[0]] || {}).terrainCost || 0;
    const typeLabel = terrainDef ? terrainDef.label : sharedType;
    _addItem(menu, `💰 Update ${typeLabel} Cost (all ${n})`, () => {
      const cost = prompt(`New terrain cost for all ${typeLabel} hexes:`, String(currentCost));
      if (cost === null) return;
      applyToAll(id => { state.hexes[id].terrainCost = parseInt(cost, 10) || 0; });
    });
    _addSep(menu);
  }

  _buildTerrainSubmenu(menu, (key, cost) => {
    applyToAll(id => {
      state.hexes[id].terrain     = key;
      state.hexes[id].terrainCost = cost;
    });
  });

  // ── Icons section ─────────────────────────────────────────────────────────
  _addSectionLabel(menu, 'Icons');
  // Use first selected hex's icons to set active state
  const firstHex = state.hexes[hexIds[0]] || {};
  const currentIcons = (firstHex.icons || []).map(i => i.image);
  _buildIconStrip(menu, currentIcons, (key, add) => {
    applyToAll(id => {
      const icons = state.hexes[id].icons || [];
      const idx = icons.findIndex(i => i.image === key);
      if (add && idx < 0) {
        icons.push({ image: key, sticky: true });
      } else if (!add && idx >= 0) {
        icons.splice(idx, 1);
      }
      state.hexes[id].icons = icons;
    });
  });

  addSep();

  // ── Clear / Kill (multi) ──────────────────────────────────────────────────
  addItem(`🗑 Clear All (${n})`, () => {
    applyToAll(id => {
      state.hexes[id] = { terrain: '', terrainCost: 0, tile: 0, rotation: 0, city: null, town: null, oo: false, dualTown: false, ooCityName: '', label: '', icons: [], killed: false };
    });
  });
  addItem(`💀 Kill All (${n})`, () => {
    applyToAll(id => {
      state.hexes[id] = { terrain: '', terrainCost: 0, tile: 0, rotation: 0, city: null, town: null, label: '', icons: [], killed: true };
    });
  });

  document.body.appendChild(menu);
  setTimeout(() => { document.addEventListener('click', removeContextMenu, { once: true }); }, 0);
}
