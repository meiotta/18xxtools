// ─── CANVAS INPUT ─────────────────────────────────────────────────────────────
// Mouse/wheel event handlers for the SVG map element, plus applyTool/ensureHex.
// Load order: FIFTH — after renderer.js.
// Last-placed tile stamp (shift+click to repeat)
let _stampTile = null;
let _stampRotation = 0;
// Hex under cursor during a drag — used by renderer for drop-target highlight
let dragOverHex = null;
// Lasso selection — stored in WORLD coordinates (same space as getHexCenter output)
let _lasso = null;               // {startX, startY, endX, endY} in world coords
let _lassoJustCompleted = false; // suppress the click that fires after mouseup
// ── Coordinate helpers ────────────────────────────────────────────────────────
// clientToWorld: converts a browser clientX/clientY to world coordinates.
// Uses the mapViewport's screen CTM inverse — no manual pan/zoom/LABEL_PAD math.
function clientToWorld(clientX, clientY) {
  const vp = document.getElementById('mapViewport');
  if (!vp) return { x: 0, y: 0 };
  const pt = mapSvg.createSVGPoint();
  pt.x = clientX;
  pt.y = clientY;
  return pt.matrixTransform(vp.getScreenCTM().inverse());
}
// _updateLassoSvg: syncs the #mapLasso rect to current _lasso world coords.
// The lassoLayer follows the same transform as mapViewport, so the rect is in world units.
function _updateLassoSvg() {
  const el = document.getElementById('mapLasso');
  if (!el) return;
  if (!_lasso) { el.setAttribute('display', 'none'); return; }
  el.setAttribute('x',      Math.min(_lasso.startX, _lasso.endX).toFixed(1));
  el.setAttribute('y',      Math.min(_lasso.startY, _lasso.endY).toFixed(1));
  el.setAttribute('width',  Math.abs(_lasso.endX - _lasso.startX).toFixed(1));
  el.setAttribute('height', Math.abs(_lasso.endY - _lasso.startY).toFixed(1));
  el.setAttribute('display', '');
}
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
// mousemove and mouseup are registered on document during a drag so they fire
// even when the pointer leaves the SVG element mid-drag.
function _lassoMove(e) {
  const wp = clientToWorld(e.clientX, e.clientY);
  _lasso.endX = wp.x;
  _lasso.endY = wp.y;
  _updateLassoSvg();  // update lasso rect only — no full content rebuild
}
function _lassoUp(e) {
  if (e.button !== 0) return;
  document.removeEventListener('mousemove', _lassoMove);
  document.removeEventListener('mouseup',   _lassoUp);
  // Threshold: 3 screen pixels mapped to world units
  const wasDrag = Math.hypot(_lasso.endX - _lasso.startX, _lasso.endY - _lasso.startY) > 3 / zoom;
  if (wasDrag) {
    // Lasso corners in world coords — compare directly with hex centers.
    const wx1 = Math.min(_lasso.startX, _lasso.endX);
    const wy1 = Math.min(_lasso.startY, _lasso.endY);
    const wx2 = Math.max(_lasso.startX, _lasso.endX);
    const wy2 = Math.max(_lasso.startY, _lasso.endY);
    selectedHexes.clear();
    let lastId = null;
    for (let r = 0; r < state.meta.rows; r++) {
      for (let c = 0; c < state.meta.cols; c++) {
        const center = getHexCenter(r, c, HEX_SIZE, state.meta.orientation);
        if (center.x >= wx1 && center.x <= wx2 && center.y >= wy1 && center.y <= wy2) {
          lastId = hexId(r, c);
          selectedHexes.add(lastId);
        }
      }
    }
    if (lastId !== null) selectedHex = lastId;
    _lassoJustCompleted = true;
  }
  _lasso = null;
  _updateLassoSvg();
  render();
}
mapSvg.addEventListener('mousedown', (e) => {
  if (e.button === 0 && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
    // preventDefault stops the browser from firing dragstart on a real drag,
    // which would swallow subsequent mousemove events and break lasso.
    e.preventDefault();
    const wp = clientToWorld(e.clientX, e.clientY);
    _lasso = { startX: wp.x, startY: wp.y, endX: wp.x, endY: wp.y };
    document.addEventListener('mousemove', _lassoMove);
    document.addEventListener('mouseup',   _lassoUp);
  }
});
mapSvg.addEventListener('click', (e) => {
  // Dismiss any open right-click context menu on left click
  if (typeof removeContextMenu === 'function') removeContextMenu();
  // Placement Mode Intercept
  if (isPlacementMode && pendingMinorIndex !== null) {
    const wp = clientToWorld(e.clientX, e.clientY);
    const hex = pixelToHex(wp.x, wp.y, HEX_SIZE, state.meta.orientation);
    const id = hexId(hex.row, hex.col);
    state.minors[pendingMinorIndex].homeHex = id;
    renderMinorsTable();
    autosave();
    exitPlacementMode();
    return;
  }
  // Suppress click that fires immediately after a completed lasso drag
  if (_lassoJustCompleted) { _lassoJustCompleted = false; return; }
  const wp2 = clientToWorld(e.clientX, e.clientY);
  const hex = pixelToHex(wp2.x, wp2.y, HEX_SIZE, state.meta.orientation);
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
          border.cost = (state.terrainCosts && state.terrainCosts.water) || 40;
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
      if (selectedHex && !selectedHexes.has(selectedHex)) selectedHexes.add(selectedHex);
      selectedHexes.add(id);
      selectedHex = id;
      render();
      return;
    }
    // Plain click → clear multi-select, select this hex
    selectedHexes.clear();
    selectedHex = id;
    // Switch right panel to HEX tab whenever user clicks a hex on the map
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    const hexTabBtn = document.querySelector('.tab-btn[data-tab="hex"]');
    if (hexTabBtn) hexTabBtn.classList.add('active');
    const hexTab = document.getElementById('hexTab');
    if (hexTab) hexTab.classList.add('active');
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
mapSvg.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  const wp = clientToWorld(e.clientX, e.clientY);
  const hex = pixelToHex(wp.x, wp.y, HEX_SIZE, state.meta.orientation);
  const id = hexId(hex.row, hex.col);
  // If right-clicking inside an existing multi-selection (2+ hexes), show multi-menu
  if (selectedHexes.size >= 2 && selectedHexes.has(id)) {
    showMultiContextMenu(e.clientX, e.clientY, Array.from(selectedHexes));
  } else {
    showContextMenu(e.clientX, e.clientY, id);
  }
});
mapSvg.addEventListener('wheel', (e) => {
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
  updateViewport();  // transform-only update — no content rebuild
}, { passive: false });
// Apply the currently active tool to the given hex coordinate string.
// Mutates state.hexes[hexId] and calls autosave().
function applyTool(hexId) {
  // Guard: only create/modify hex state when a tool will actually make a change.
  const willChange =
    (activeTool === 'terrain' && activeTerrainType) ||
    activeTool === 'terrain-clear' ||
    (activeTool === 'tile'    && activeTile) ||
    (activeTool === 'label' && activeLabel) ||
    activeTool === 'erase' ||
    activeTool === 'river-edge';
  if (!willChange) return;
  if (!state.hexes[hexId]) state.hexes[hexId] = { terrain: '', terrainCost: 0, tile: 0, rotation: 0, city: null, town: false, label: '', upgradesTo: [], overrideUpgrades: false, riverEdges: [] };
  const hex = state.hexes[hexId];
  if (activeTool === 'terrain' && activeTerrainType) {
    hex.terrain = activeTerrainType;
    hex.terrainCost = terrainCost(activeTerrainType);
  } else if (activeTool === 'terrain-clear') {
    hex.terrain = '';
    hex.terrainCost = 0;
  } else if (activeTool === 'tile' && activeTile) {
    hex.tile = activeTile;
    hex.rotation = 0;
    // Record stamp for shift+click repeat
    _stampTile = activeTile;
    _stampRotation = 0;
    // Deselect after drop — tile is a one-shot pickup
    activeTile = null;
    activeTool = null;
    document.querySelectorAll('.tile-swatch').forEach(s => s.classList.remove('selected'));
    document.querySelectorAll('.tile-item').forEach(s => s.classList.remove('active'));
    updateStatus('');
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
// ── SVG map drag-and-drop tile placement ─────────────────────────────────────
// Allows dragging a tile swatch from the palette and dropping it on the map.
mapSvg.addEventListener('dragover', (e) => {
  if (!e.dataTransfer.types.includes('text/plain')) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = 'copy';
  // Track which hex the drag is over and re-render for highlight feedback
  const wp = clientToWorld(e.clientX, e.clientY);
  const hc = pixelToHex(wp.x, wp.y, HEX_SIZE, state.meta.orientation);
  const newId = hexId(hc.row, hc.col);
  if (newId !== dragOverHex) {
    dragOverHex = newId;
    render();
  }
});
mapSvg.addEventListener('dragleave', (e) => {
  if (dragOverHex !== null) { dragOverHex = null; render(); }
});
mapSvg.addEventListener('drop', (e) => {
  const payload = e.dataTransfer.getData('text/plain');
  if (!payload) return;
  e.preventDefault();
  const wp = clientToWorld(e.clientX, e.clientY);
  const hexCoord = pixelToHex(wp.x, wp.y, HEX_SIZE, state.meta.orientation);
  const id = hexId(hexCoord.row, hexCoord.col);
  if (!id) return;
  ensureHex(id);
  dragOverHex = null; // clear highlight before re-render
  if (TileRegistry.getTileDef(payload)) {
    // ── Numbered tile drop ───────────────────────────────────────────────────
    const parsedId = /^\d+$/.test(payload) ? parseInt(payload) : payload;
    state.hexes[id].tile = parsedId;
    state.hexes[id].rotation = 0;
    selectedHex = id;
    if (typeof updateHexPanel === 'function') updateHexPanel(id);
    _stampTile = parsedId;
    _stampRotation = 0;
    render(); autosave();
    updateStatus(`Placed tile #${payload} on ${id}`);
  }
});
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
