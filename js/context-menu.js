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

// ── Draw a terrain icon onto a 2d canvas context centred at (0,0) ─────────────
function _drawTerrainIcon(bCtx, key, s) {
  switch (key) {
    case 'mountain':
      bCtx.beginPath();
      bCtx.moveTo(0, -s * 1.4);
      bCtx.lineTo(-s * 1.2, s * 0.6);
      bCtx.lineTo( s * 1.2, s * 0.6);
      bCtx.closePath();
      bCtx.fillStyle = '#777';
      bCtx.fill();
      bCtx.beginPath();
      bCtx.moveTo(0, -s * 1.4);
      bCtx.lineTo(-s * 0.4, -s * 0.5);
      bCtx.lineTo( s * 0.4, -s * 0.5);
      bCtx.closePath();
      bCtx.fillStyle = 'white';
      bCtx.fill();
      break;
    case 'hill':
      bCtx.beginPath();
      bCtx.arc(0, s * 0.2, s * 0.9, Math.PI, 0);
      bCtx.closePath();
      bCtx.fillStyle = '#8B7355';
      bCtx.fill();
      break;
    case 'water':
    case 'river':
    case 'lake':
      bCtx.beginPath();
      bCtx.moveTo(0, -s);
      bCtx.bezierCurveTo(s * 0.8, -s * 0.2, s * 0.8, s * 0.6, 0, s * 0.7);
      bCtx.bezierCurveTo(-s * 0.8, s * 0.6, -s * 0.8, -s * 0.2, 0, -s);
      bCtx.fillStyle = '#3366CC';
      bCtx.fill();
      break;
    case 'swamp':
    case 'marsh':
      bCtx.strokeStyle = '#4A7A4A';
      bCtx.lineWidth = 1.5;
      bCtx.lineCap = 'round';
      for (const ox of [-s * 0.6, 0, s * 0.6]) {
        bCtx.beginPath(); bCtx.moveTo(ox, s * 0.5); bCtx.lineTo(ox, -s * 0.5); bCtx.stroke();
        bCtx.beginPath(); bCtx.moveTo(ox, -s * 0.2); bCtx.lineTo(ox - s * 0.35, -s * 0.8); bCtx.stroke();
        bCtx.beginPath(); bCtx.moveTo(ox, -s * 0.2); bCtx.lineTo(ox + s * 0.35, -s * 0.8); bCtx.stroke();
      }
      break;
    case 'forest':
      bCtx.fillStyle = '#2d7a2d';
      bCtx.beginPath();
      bCtx.moveTo(0, -s * 1.2);
      bCtx.lineTo(-s * 1.0, s * 0.5);
      bCtx.lineTo( s * 1.0, s * 0.5);
      bCtx.closePath();
      bCtx.fill();
      break;
    case 'desert':
      bCtx.beginPath();
      bCtx.moveTo(0, -s); bCtx.lineTo(s * 0.7, 0); bCtx.lineTo(0, s); bCtx.lineTo(-s * 0.7, 0);
      bCtx.closePath();
      bCtx.fillStyle = '#C8A040';
      bCtx.fill();
      break;
    case 'pass':
      bCtx.fillStyle = '#888';
      bCtx.beginPath();
      bCtx.moveTo(-s * 1.2, s * 0.6);
      bCtx.lineTo(-s * 0.3, -s * 0.6);
      bCtx.lineTo( s * 0.3, -s * 0.6);
      bCtx.lineTo( s * 1.2, s * 0.6);
      bCtx.closePath();
      bCtx.fill();
      break;
    default:
      bCtx.beginPath();
      bCtx.moveTo(0, -s); bCtx.lineTo(s * 0.7, 0); bCtx.lineTo(0, s); bCtx.lineTo(-s * 0.7, 0);
      bCtx.closePath();
      bCtx.fillStyle = '#AA8844';
      bCtx.fill();
  }
}

// ── Draw a resource icon onto a 2d canvas context centred at (0,0) ────────────
function _drawResourceIcon(bCtx, key, s) {
  if (key === 'mine') {
    bCtx.strokeStyle = '#8B6914';
    bCtx.lineWidth = 1.5;
    bCtx.lineCap = 'round';
    bCtx.beginPath(); bCtx.moveTo(-s * 0.7, -s * 0.7); bCtx.lineTo(s * 0.7,  s * 0.7); bCtx.stroke();
    bCtx.beginPath(); bCtx.moveTo( s * 0.7, -s * 0.7); bCtx.lineTo(-s * 0.7, s * 0.7); bCtx.stroke();
    bCtx.beginPath(); bCtx.arc(-s * 0.7, -s * 0.7, s * 0.22, 0, Math.PI * 2);
    bCtx.fillStyle = '#8B6914'; bCtx.fill();
    bCtx.beginPath(); bCtx.arc( s * 0.7, -s * 0.7, s * 0.22, 0, Math.PI * 2);
    bCtx.fillStyle = '#8B6914'; bCtx.fill();
  } else if (key === 'port') {
    bCtx.strokeStyle = '#1a3a7a';
    bCtx.lineWidth = 1.2;
    bCtx.lineCap = 'round';
    bCtx.beginPath(); bCtx.moveTo(0, -s * 0.75); bCtx.lineTo(0, s * 0.75); bCtx.stroke();
    bCtx.beginPath(); bCtx.moveTo(-s * 0.42, -s * 0.42); bCtx.lineTo(s * 0.42, -s * 0.42); bCtx.stroke();
    bCtx.beginPath(); bCtx.arc(0, -s * 0.75, s * 0.16, 0, Math.PI * 2);
    bCtx.fillStyle = '#1a3a7a'; bCtx.fill();
    bCtx.beginPath(); bCtx.arc(0, s * 0.05, s * 0.65, 0.2, Math.PI - 0.2);
    bCtx.strokeStyle = '#1a3a7a'; bCtx.stroke();
    bCtx.beginPath(); bCtx.arc(-s * 0.60, s * 0.18, s * 0.13, 0, Math.PI * 2);
    bCtx.fillStyle = '#1a3a7a'; bCtx.fill();
    bCtx.beginPath(); bCtx.arc( s * 0.60, s * 0.18, s * 0.13, 0, Math.PI * 2);
    bCtx.fillStyle = '#1a3a7a'; bCtx.fill();
  } else if (key === 'factory') {
    bCtx.fillStyle = '#666';
    bCtx.fillRect(-s * 0.7, -s * 0.2, s * 1.4, s * 1.0);
    bCtx.fillRect(-s * 0.45, -s * 0.9, s * 0.28, s * 0.7);
    bCtx.fillRect( s * 0.17, -s * 0.75, s * 0.28, s * 0.55);
    bCtx.fillStyle = '#aaddff';
    bCtx.fillRect(-s * 0.2, s * 0.0, s * 0.4, s * 0.3);
  } else {
    bCtx.beginPath(); bCtx.arc(0, 0, s * 0.5, 0, Math.PI * 2);
    bCtx.fillStyle = '#888'; bCtx.fill();
  }
}

// ── Unified quick-icon grid (terrain + resource icons as canvas buttons) ──────
// Replaces _buildTerrainSubmenu + _buildIconStrip with a single inline grid.

function _buildQuickIconGrid(menu, hexData, onTerrainApply, onIconToggle) {
  const BTN = 28;  // button size in px
  const S   = 7;   // icon scale

  const grid = document.createElement('div');
  grid.style.cssText = 'display:flex;flex-wrap:wrap;gap:4px;padding:6px 8px 4px;max-width:224px;';

  // ── Terrain buttons ───────────────────────────────────────────────────────
  TERRAIN_TYPES.forEach(({ label, key, defaultCost }) => {
    const btn = document.createElement('canvas');
    btn.width  = BTN;
    btn.height = BTN;
    btn.title  = label;
    const isActive = hexData.terrain === key;
    btn.style.cssText = `cursor:pointer;border-radius:3px;border:1.5px solid ${isActive ? '#ffd700' : '#444'};background:#1e1e1e;display:block;`;

    const bCtx = btn.getContext('2d');
    bCtx.save();
    bCtx.translate(BTN / 2, BTN / 2);
    _drawTerrainIcon(bCtx, key, S);
    bCtx.restore();

    btn.onclick = (e) => {
      e.stopPropagation();
      removeContextMenu();
      onTerrainApply(key, defaultCost);
    };
    grid.appendChild(btn);
  });

  // ── Separator between terrain and icons ───────────────────────────────────
  const sep = document.createElement('div');
  sep.style.cssText = 'width:100%;height:1px;background:#444;margin:2px 0;';
  grid.appendChild(sep);

  // ── Resource icon buttons ─────────────────────────────────────────────────
  const currentIcons = (hexData.icons || []).map(i => i.image);
  RESOURCE_ICONS.forEach(({ label, key }) => {
    const btn = document.createElement('canvas');
    btn.width  = BTN;
    btn.height = BTN;
    btn.title  = label;
    const isActive = currentIcons.includes(key);
    btn.style.cssText = `cursor:pointer;border-radius:3px;border:1.5px solid ${isActive ? '#ffd700' : '#444'};background:#1e1e1e;display:block;`;

    const bCtx = btn.getContext('2d');
    bCtx.save();
    bCtx.translate(BTN / 2, BTN / 2);
    _drawResourceIcon(bCtx, key, S);
    bCtx.restore();

    btn.onclick = (e) => {
      e.stopPropagation();
      removeContextMenu();
      onIconToggle(key, !isActive);
    };
    grid.appendChild(btn);
  });

  menu.appendChild(grid);
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
    ensureHex(hexId);
    state.hexes[hexId].city = { name: hex.city?.name || hex.ooCityName || '', slots: 1, home: '', revenue: { yellow: 0, green: 0, brown: 0, grey: 0 } };
    state.hexes[hexId].town = null;
    state.hexes[hexId].oo   = false;
    state.hexes[hexId].dualTown = false;
    render(); autosave();
  });

  // ── Town ──────────────────────────────────────────────────────────────────
  addItem('🔴 Town — Quick Add', () => {
    ensureHex(hexId);
    state.hexes[hexId].town = { name: hex.town?.name || '' };
    state.hexes[hexId].dualTown = false;
    state.hexes[hexId].city = null;
    state.hexes[hexId].oo   = false;
    render(); autosave();
  });

  addSep();

  // ── Terrain + Icons quick-grid ────────────────────────────────────────────
  _addSectionLabel(menu, 'Terrain & Icons');
  _buildQuickIconGrid(menu, hex,
    (key, cost) => {
      ensureHex(hexId);
      state.hexes[hexId].terrain     = key;
      state.hexes[hexId].terrainCost = cost;
      render(); autosave();
    },
    (key, add) => {
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
    }
  );

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
  // Clamp so menu never clips past viewport edge
  const _mw = menu.offsetWidth, _mh = menu.offsetHeight;
  if (x + _mw > window.innerWidth)  menu.style.left = (window.innerWidth  - _mw - 4) + 'px';
  if (y + _mh > window.innerHeight) menu.style.top  = (window.innerHeight - _mh - 4) + 'px';
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
    applyToAll(id => {
      state.hexes[id].city = { name: '', slots: 1, home: '', revenue: { yellow: 0, green: 0, brown: 0, grey: 0 } };
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

  // ── Terrain + Icons quick-grid ────────────────────────────────────────────
  _addSectionLabel(menu, 'Terrain & Icons');

  // Context-aware: if all selected hexes share the same terrain type, offer a quick cost update
  const allTerrains = hexIds.map(id => (state.hexes[id] || {}).terrain).filter(Boolean);
  const uniqueTerrains = [...new Set(allTerrains)];
  if (uniqueTerrains.length === 1 && allTerrains.length === hexIds.length) {
    const sharedType = uniqueTerrains[0];
    const terrainDef = TERRAIN_TYPES.find(t => t.key === sharedType);
    const typeLabel = terrainDef ? terrainDef.label : sharedType;
    const defaultCost = terrainDef ? terrainDef.defaultCost : 0;
    _addItem(menu, `💰 Reset ${typeLabel} Cost to default (all ${n})`, () => {
      applyToAll(id => { state.hexes[id].terrainCost = defaultCost; });
    });
    _addSep(menu);
  }

  // Use first selected hex's data for active-state highlighting
  const firstHex = state.hexes[hexIds[0]] || {};
  _buildQuickIconGrid(menu, firstHex,
    (key, cost) => {
      applyToAll(id => {
        state.hexes[id].terrain     = key;
        state.hexes[id].terrainCost = cost;
      });
    },
    (key, add) => {
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
    }
  );

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
  // Clamp so menu never clips past viewport edge
  const _mmw = menu.offsetWidth, _mmh = menu.offsetHeight;
  if (x + _mmw > window.innerWidth)  menu.style.left = (window.innerWidth  - _mmw - 4) + 'px';
  if (y + _mmh > window.innerHeight) menu.style.top  = (window.innerHeight - _mmh - 4) + 'px';
  setTimeout(() => { document.addEventListener('click', removeContextMenu, { once: true }); }, 0);
}
