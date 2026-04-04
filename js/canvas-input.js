// ─── CANVAS INPUT ─────────────────────────────────────────────────────────────
// Mouse/wheel event handlers for the canvas element, plus applyTool/ensureHex.
// Load order: FIFTH — after renderer.js.

// Last-placed tile stamp (shift+click to repeat)
let _stampTile = null;
let _stampRotation = 0;

// Shift+drag lasso selection
let _lasso = null;               // {startX, startY, endX, endY} in canvas pixel coords
let _lassoJustCompleted = false; // suppress the click that fires after mouseup

// Returns the index (0–5) of the hex edge midpoint closest to world point (wx, wy).
// Uses edgePos() (renderer convention: edge 0=bottom, 1=lower-left, …) to match
// how border.edge is used throughout the renderer.
function findNearestEdge(row, col, wx, wy) {
  const center = getHexCenter(row, col, HEX_SIZE, state.meta.orientation);
  const lx = wx - center.x;
  const ly = wy - center.y;
  // Scale canvas pixels → unit space (hex circumradius 40px → 50 units)
  const scale = 50 / HEX_SIZE;
  const sx = lx * scale;
  const sy = ly * scale;
  let minDist = Infinity, nearest = 0;
  for (let i = 0; i < 6; i++) {
    const mp = edgePos(i);  // orientation-aware, same convention as renderer
    const d = Math.hypot(sx - mp.x, sy - mp.y);
    if (d < minDist) { minDist = d; nearest = i; }
  }
  return nearest;
}

// Returns {row, col} of the hex sharing edge `edge` with hex (row, col).
// edge convention: 0=bottom, 1=lower-left, 2=upper-left, 3=top, 4=upper-right, 5=lower-right.
// Returns null if the neighbor would be off the grid (col < 0 or row < 0).
//
// ── Stagger parity ────────────────────────────────────────────────────────────
// In a flat-top hex grid the row offsets for diagonal neighbors depend on which
// columns are "staggered" (shifted down by half a row).  This is controlled by
// state.meta.staggerParity (see hex-geometry.js for the full explanation):
//
//   staggerParity=0 (default): even cols are staggered.
//     isEven=true  → col is lower than its odd neighbours → diagonal edges go
//                    one row DOWN on the left/right.
//     isEven=false → col is higher → diagonal edges go one row UP.
//
//   staggerParity=1 (1882 transposed axes): odd cols are staggered.
//     The (col + sp) % 2 trick flips the even/odd sense so the same adjacency
//     table remains correct — no other logic changes needed.
//
// Without this fix, for a transposed-axes game (sp=1) the neighbour of e.g.
// Western Canada (I1 → internal col=0, even) would be computed as if col=0 is
// the high column, placing Lethbridge (L2 → col=1) adjacent to it — which is
// wrong.  With sp=1, col=0 is treated as odd (high), and col=1 as even (low),
// matching the actual visual stagger and the Ruby coordinate geometry.
function getNeighborHex(row, col, edge) {
  const sp = (typeof state !== 'undefined' && state?.meta?.staggerParity) || 0;
  const isEven = (col + sp) % 2 === 0;
  let nr, nc;
  switch (edge) {
    case 0: nr = row + 1; nc = col;     break;
    case 1: nr = row + (isEven ? 1 : 0); nc = col - 1; break;
    case 2: nr = row + (isEven ? 0 : -1); nc = col - 1; break;
    case 3: nr = row - 1; nc = col;     break;
    case 4: nr = row + (isEven ? 0 : -1); nc = col + 1; break;
    case 5: nr = row + (isEven ? 1 : 0); nc = col + 1; break;
    default: return null;
  }
  if (nr < 0 || nc < 0) return null;
  return { row: nr, col: nc };
}

// ── Lasso selection (plain left-button drag) ──────────────────────────────────
canvas.addEventListener('mousedown', (e) => {
  if (e.button === 0 && !e.ctrlKey && !e.metaKey) {
    const rect = canvas.getBoundingClientRect();
    _lasso = {
      startX: e.clientX - rect.left,
      startY: e.clientY - rect.top,
      endX:   e.clientX - rect.left,
      endY:   e.clientY - rect.top,
    };
  }
});

canvas.addEventListener('mousemove', (e) => {
  if (_lasso) {
    const rect = canvas.getBoundingClientRect();
    _lasso.endX = e.clientX - rect.left;
    _lasso.endY = e.clientY - rect.top;
    render();
  }
});

canvas.addEventListener('mouseup', (e) => {
  if (_lasso && e.button === 0) {
    const wasDrag = Math.abs(_lasso.endX - _lasso.startX) > 5 ||
                    Math.abs(_lasso.endY - _lasso.startY) > 5;
    if (wasDrag) {
      // Convert pixel rect to world coords
      const px1 = Math.min(_lasso.startX, _lasso.endX);
      const py1 = Math.min(_lasso.startY, _lasso.endY);
      const px2 = Math.max(_lasso.startX, _lasso.endX);
      const py2 = Math.max(_lasso.startY, _lasso.endY);
      const wx1 = (px1 - LABEL_PAD) / zoom - panX;
      const wy1 = (py1 - LABEL_PAD) / zoom - panY;
      const wx2 = (px2 - LABEL_PAD) / zoom - panX;
      const wy2 = (py2 - LABEL_PAD) / zoom - panY;

      selectedHexes.clear();
      for (let r = 0; r < state.meta.rows; r++) {
        for (let c = 0; c < state.meta.cols; c++) {
          const center = getHexCenter(r, c, HEX_SIZE, state.meta.orientation);
          if (center.x >= wx1 && center.x <= wx2 &&
              center.y >= wy1 && center.y <= wy2) {
            selectedHexes.add(hexId(r, c));
          }
        }
      }
      _lassoJustCompleted = true;
    }
    _lasso = null;
    render();
  }
});

canvas.addEventListener('click', (e) => {
  // Suppress click that fires immediately after a completed lasso drag
  if (_lassoJustCompleted) { _lassoJustCompleted = false; return; }
  const rect = canvas.getBoundingClientRect();
  const px = e.clientX - rect.left;
  const py = e.clientY - rect.top;
  const wx = (px - LABEL_PAD) / zoom - panX;
  const wy = (py - LABEL_PAD) / zoom - panY;
  const hex = pixelToHex(wx, wy, HEX_SIZE, state.meta.orientation);
  const id = hexId(hex.row, hex.col);

  if (e.button === 0) {
    // ── Edge tools: detect which edge was clicked ──────────────────────────
    if (activeTool === 'impassable' || activeTool === 'water-crossing') {
      selectedHex = id;
      const edgeNum = findNearestEdge(hex.row, hex.col, wx, wy);
      ensureHex(id);
      const h = state.hexes[id];
      if (!h.borders) h.borders = [];
      const type = activeTool === 'impassable' ? 'impassable' : 'water';

      // Determine the border object first (need cost for water before applying)
      const existingIdx = h.borders.findIndex(b => b.edge === edgeNum);
      let removing = existingIdx >= 0 && h.borders[existingIdx].type === type;
      let border = null;
      if (!removing) {
        border = { edge: edgeNum, type };
        if (type === 'water') {
          const costStr = prompt('Water crossing cost:', String(
            (state.terrainCosts && state.terrainCosts.water) || 40
          ));
          if (costStr === null) return; // cancelled
          border.cost = parseInt(costStr, 10) || 40;
        }
      }

      // Apply to primary hex
      if (removing) {
        h.borders.splice(existingIdx, 1);
      } else if (existingIdx >= 0) {
        h.borders[existingIdx] = border;
      } else {
        h.borders.push(border);
      }

      // Apply mirror border to adjacent hex (same edge between the two hexes)
      const neighbor = getNeighborHex(hex.row, hex.col, edgeNum);
      if (neighbor) {
        const nid = hexId(neighbor.row, neighbor.col);
        ensureHex(nid);
        const nh = state.hexes[nid];
        if (!nh.borders) nh.borders = [];
        const mirrorEdge = (edgeNum + 3) % 6;
        const nExistingIdx = nh.borders.findIndex(b => b.edge === mirrorEdge);
        if (removing) {
          if (nExistingIdx >= 0) nh.borders.splice(nExistingIdx, 1);
        } else {
          const nBorder = { edge: mirrorEdge, type };
          if (border.cost !== undefined) nBorder.cost = border.cost;
          if (nExistingIdx >= 0) {
            nh.borders[nExistingIdx] = nBorder;
          } else {
            nh.borders.push(nBorder);
          }
        }
      }

      updateHexPanel(id);
      render();
      autosave();
      return;
    }

    // Ctrl/Cmd+click → toggle multi-select
    if (e.ctrlKey || e.metaKey) {
      if (selectedHexes.has(id)) {
        selectedHexes.delete(id);
      } else {
        selectedHexes.add(id);
        selectedHex = id;
      }
      render();
      return;
    }

    // Shift+click → add hex to multi-select
    if (e.shiftKey) {
      selectedHexes.add(id);
      selectedHex = id;
      render();
      return;
    }

    // Plain click → clear multi-select, select this hex
    selectedHexes.clear();
    selectedHex = id;
    const existingHex = state.hexes[id];
    if (activeTool === 'tile' && activeTile) {
      // DROP: place tile, applyTool handles deselect
      applyTool(id);
    } else if (!activeTool && existingHex?.tile) {
      // ROTATE: no tool active, hex has a tile — rotate 60°
      existingHex.rotation = ((existingHex.rotation || 0) + 1) % 6;
      // Keep stamp rotation in sync if this tile matches the stamp
      if (existingHex.tile === _stampTile) _stampRotation = existingHex.rotation;
      autosave();
      updateStatus(`Rotated tile #${existingHex.tile} → ${existingHex.rotation * 60}°`);
    } else {
      // Other tools (terrain, erase, etc.)
      applyTool(id);
    }
    updateHexPanel(id);
    render();
  }
});

canvas.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  const rect = canvas.getBoundingClientRect();
  const px = e.clientX - rect.left;
  const py = e.clientY - rect.top;
  const hex = pixelToHex(((px - LABEL_PAD) / zoom - panX), ((py - LABEL_PAD) / zoom - panY), HEX_SIZE, state.meta.orientation);
  const id = hexId(hex.row, hex.col);
  // If right-clicking inside an existing multi-selection (2+ hexes), show multi-menu
  if (selectedHexes.size >= 2 && selectedHexes.has(id)) {
    showMultiContextMenu(e.clientX, e.clientY, Array.from(selectedHexes));
  } else {
    showContextMenu(e.clientX, e.clientY, id);
  }
});

canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  if (e.ctrlKey || e.metaKey) {
    // Ctrl/Cmd + scroll → zoom
    zoom = Math.max(0.3, Math.min(4, zoom * (1 - e.deltaY * 0.001)));
  } else if (e.shiftKey) {
    // Shift + scroll → pan horizontally
    panX -= e.deltaY / zoom * 0.5;
  } else {
    // Plain scroll → pan vertically
    panY -= e.deltaY / zoom * 0.5;
  }
  render();
});

// Apply the currently active tool to the given hex coordinate string.
// Mutates state.hexes[hexId] and calls autosave().
function applyTool(hexId) {
  // Guard: only create/modify hex state when a tool will actually make a change.
  const willChange =
    (activeTool === 'terrain' && activeTerrainType) ||
    (activeTool === 'tile'    && activeTile) ||
    activeTool === 'city-1' || activeTool === 'city-2' || activeTool === 'city-3' ||
    activeTool === 'town' ||
    (activeTool === 'label' && activeLabel) ||
    activeTool === 'erase' ||
    activeTool === 'river-edge';
  if (!willChange) return;

  if (!state.hexes[hexId]) state.hexes[hexId] = { terrain: '', terrainCost: 0, tile: 0, rotation: 0, city: null, town: false, label: '', upgradesTo: [], overrideUpgrades: false, riverEdges: [] };
  const hex = state.hexes[hexId];

  if (activeTool === 'terrain' && activeTerrainType) {
    hex.terrain = activeTerrainType;
    hex.terrainCost = terrainCost(activeTerrainType);
  } else if (activeTool === 'tile' && activeTile) {
    hex.tile = activeTile;
    hex.rotation = 0;
    // Record stamp for shift+click repeat
    _stampTile = activeTile;
    _stampRotation = 0;
    // Prompt for city name if the tile has a city or OO station
    const td = TILE_DEFS[String(activeTile)];
    if (td && (td.city || td.oo)) {
      const name = prompt('City name for this tile (leave blank to skip):', hex.cityName || '');
      if (name !== null) hex.cityName = name.trim();
    }
    // Deselect after drop — tile is a one-shot pickup
    activeTile = null;
    activeTool = null;
    document.querySelectorAll('.tile-swatch').forEach(s => s.classList.remove('selected'));
    document.querySelectorAll('.tile-item').forEach(s => s.classList.remove('active'));
    updateStatus('');
  } else if (activeTool === 'city-1') {
    hex.city = { slots: 1, home: '', revenue: { yellow: 0, green: 0, brown: 0, grey: 0 } };
    hex.town = false;
  } else if (activeTool === 'city-2') {
    hex.city = { slots: 2, home: '', revenue: { yellow: 0, green: 0, brown: 0, grey: 0 } };
    hex.town = false;
  } else if (activeTool === 'city-3') {
    hex.city = { slots: 3, home: '', revenue: { yellow: 0, green: 0, brown: 0, grey: 0 } };
    hex.town = false;
  } else if (activeTool === 'town') {
    hex.town = true;
    hex.city = null;
  } else if (activeTool === 'label' && activeLabel) {
    hex.label = activeLabel;
  } else if (activeTool === 'erase') {
    state.hexes[hexId] = { terrain: '', terrainCost: 0, tile: 0, rotation: 0, city: null, town: false, label: '', upgradesTo: [], overrideUpgrades: false, riverEdges: [] };
  } else if (activeTool === 'river-edge') {
    hex.riverEdges = hex.riverEdges || [];
    if (hex.riverEdges.length === 0) {
      hex.riverEdges = [0, 1, 2, 3, 4, 5];
    } else {
      hex.riverEdges = [];
    }
  }
  autosave();
}

// Ensure a hex entry exists at the given coordinate ID.
// Creates a default blank hex if none exists yet, so callers can safely mutate.
function ensureHex(id) {
  if (!state.hexes[id]) {
    state.hexes[id] = {
      terrain: '', terrainCost: 0, tile: 0, rotation: 0,
      city: null, town: false, label: '',
      upgradesTo: [], overrideUpgrades: false, riverEdges: [], borders: []
    };
  }
}
