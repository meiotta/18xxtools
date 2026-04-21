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
  } else {
    // Plain click — handle selection here because mousedown.preventDefault()
    // suppresses the 'click' event in some browsers (Chrome/Edge on SVG).
    const startWp = { x: _lasso.startX, y: _lasso.startY };
    _lasso = null; // clear before calling handlers that might check it

    // Dismiss any open context menu
    if (typeof removeContextMenu === 'function') removeContextMenu();

    // Placement mode intercept
    if (isPlacementMode && pendingMinorIndex !== null) {
      const ph = pixelToHex(startWp.x, startWp.y, HEX_SIZE, state.meta.orientation);
      const pid = hexId(ph.row, ph.col);
      state.minors[pendingMinorIndex].homeHex = pid;
      renderMinorsTable();
      autosave();
      exitPlacementMode();
      _lassoJustCompleted = true;
      _updateLassoSvg();
      render();
      return;
    }

    const ph = pixelToHex(startWp.x, startWp.y, HEX_SIZE, state.meta.orientation);
    const pid = hexId(ph.row, ph.col);

    // Edge tools
    if (activeTool === 'impassable' || activeTool === 'water-crossing' || activeTool === 'province') {
      selectedHex = pid;
      const edgeNum = findNearestEdge(ph.row, ph.col, startWp.x, startWp.y);
      ensureHex(pid);
      const h = state.hexes[pid];
      if (!h.borders) h.borders = [];
      const type = activeTool === 'impassable' ? 'impassable'
                 : activeTool === 'province'   ? 'province'
                 : 'water';
      const existingIdx = h.borders.findIndex(b => b.edge === edgeNum);
      let removing = existingIdx >= 0 && h.borders[existingIdx].type === type;
      let border = null;
      if (!removing) {
        border = { edge: edgeNum, type };
        if (type === 'water') border.cost = (state.terrainCosts && state.terrainCosts.water) || 40;
        if (type === 'province') border.color = 'black';
      }
      if (removing) {
        h.borders.splice(existingIdx, 1);
      } else if (existingIdx >= 0) {
        h.borders[existingIdx] = border;
      } else {
        h.borders.push(border);
      }
      const neighbor = getNeighborHex(ph.row, ph.col, edgeNum);
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
          if (border.cost  !== undefined) nBorder.cost  = border.cost;
          if (border.color !== undefined) nBorder.color = border.color;
          if (nExistingIdx >= 0) nh.borders[nExistingIdx] = nBorder;
          else nh.borders.push(nBorder);
        }
      }
      if (typeof updateHexPanel === 'function') updateHexPanel(pid);
      _lassoJustCompleted = true;
      _updateLassoSvg();
      render(); autosave();
      return;
    }

    // Plain hex select / tool apply
    selectedHexes.clear();
    selectedHex = pid;
    // Switch right panel to HEX tab
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    const hexTabBtn = document.querySelector('.tab-btn[data-tab="hex"]');
    if (hexTabBtn) hexTabBtn.classList.add('active');
    const hexTab = document.getElementById('hexTab');
    if (hexTab) hexTab.classList.add('active');

    const existingHex = state.hexes[pid];
    if (activeTool === 'tile' && activeTile) {
      applyTool(pid);
    } else if (!activeTool && existingHex?.tile) {
      existingHex.rotation = ((existingHex.rotation || 0) + 1) % 6;
      if (existingHex.tile === _stampTile) _stampRotation = existingHex.rotation;
      autosave();
      updateStatus(`Rotated tile #${existingHex.tile} → ${existingHex.rotation * 60}°`);
    } else {
      applyTool(pid);
    }
    if (typeof updateHexPanel === 'function') updateHexPanel(pid);
    _lassoJustCompleted = true; // suppress click handler from double-processing
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
  // Always dismiss any open context menu
  if (typeof removeContextMenu === 'function') removeContextMenu();
  // Suppress click that fires after lasso drag or plain click handled by _lassoUp
  if (_lassoJustCompleted) { _lassoJustCompleted = false; return; }
  // Modifier clicks (ctrl/shift) bypass mousedown lasso, so click still fires for these
  if (e.button !== 0) return;
  const wp = clientToWorld(e.clientX, e.clientY);
  const hex = pixelToHex(wp.x, wp.y, HEX_SIZE, state.meta.orientation);
  const id = hexId(hex.row, hex.col);
  // Ctrl/Cmd+click → toggle multi-select
  if (e.ctrlKey || e.metaKey) {
    if (selectedHexes.has(id)) {
      selectedHexes.delete(id);
      // Keep selectedHex pointing at a valid remaining member
      if (selectedHexes.size > 0) selectedHex = [...selectedHexes][selectedHexes.size - 1];
    } else {
      // Anchor the current single-selection into the multi-set before expanding
      if (selectedHex && !selectedHexes.has(selectedHex)) selectedHexes.add(selectedHex);
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
  // Plain unmodified click that wasn't caught by _lassoUp (edge case fallback)
  selectedHexes.clear();
  selectedHex = id;
  if (typeof updateHexPanel === 'function') updateHexPanel(id);
  render();
});
mapSvg.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  e.stopPropagation();
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

// ── Touch handlers (mobile pinch-zoom + pan + long-press context menu) ────────
//
// Single-finger:
//   • Short tap (< 8 px movement, < 450 ms) → synthetic MouseEvent('click') so
//     the existing click handler selects/rotates hexes as on desktop.
//   • Hold still ≥ 450 ms → long-press context menu (same items as right-click).
//   • Drag > 8 px → pan the map.
//   All three call e.preventDefault() on touchstart so Chrome cannot start text
//   selection on nearby SVG labels (which triggers its "search" popup).
//
// Two-finger:
//   • Pinch → zoom, anchored at the pinch midpoint.
//   • Midpoint translation simultaneously pans.

const _ts = {
  panning:  false,
  pinching: false,
  longPressFired: false,
  longPressTimer: null,
  startX: 0, startY: 0,
  startPanX: 0, startPanY: 0,
  svgRect: null,
  startDist: 0,
  startZoom: 1,
  midWorldX: 0, midWorldY: 0,
  startMidSvgX: 0, startMidSvgY: 0,
};

function _tsCancelLongPress() {
  if (_ts.longPressTimer) { clearTimeout(_ts.longPressTimer); _ts.longPressTimer = null; }
}

mapSvg.addEventListener('touchstart', (e) => {
  e.preventDefault();   // suppress text-selection gesture on all touch starts
  _ts.svgRect = mapSvg.getBoundingClientRect();
  _tsCancelLongPress();
  if (e.touches.length >= 2) {
    const t1 = e.touches[0], t2 = e.touches[1];
    const midCX = (t1.clientX + t2.clientX) / 2;
    const midCY = (t1.clientY + t2.clientY) / 2;
    const mw = clientToWorld(midCX, midCY);
    _ts.pinching       = true;
    _ts.panning        = false;
    _ts.longPressFired = false;
    _ts.startDist      = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
    _ts.startZoom      = zoom;
    _ts.startPanX      = panX;
    _ts.startPanY      = panY;
    _ts.midWorldX      = mw.x;
    _ts.midWorldY      = mw.y;
    _ts.startMidSvgX   = midCX - _ts.svgRect.left;
    _ts.startMidSvgY   = midCY - _ts.svgRect.top;
  } else if (e.touches.length === 1) {
    _ts.pinching       = false;
    _ts.panning        = false;
    _ts.longPressFired = false;
    _ts.startX    = e.touches[0].clientX;
    _ts.startY    = e.touches[0].clientY;
    _ts.startPanX = panX;
    _ts.startPanY = panY;
    // Long-press: after 450 ms without movement, show context menu.
    // We handle this ourselves because e.preventDefault() on touchstart
    // stops Chrome from firing the 'contextmenu' event on long press.
    _ts.longPressTimer = setTimeout(() => {
      _ts.longPressTimer  = null;
      _ts.longPressFired  = true;
      _ts.panning         = true;   // prevent touchend from treating this as a tap
      const wp = clientToWorld(_ts.startX, _ts.startY);
      const ph = pixelToHex(wp.x, wp.y, HEX_SIZE, state.meta.orientation);
      const id = hexId(ph.row, ph.col);
      selectedHex = id;
      if (selectedHexes.size >= 2 && selectedHexes.has(id)) {
        showMultiContextMenu(_ts.startX, _ts.startY, Array.from(selectedHexes));
      } else {
        showContextMenu(_ts.startX, _ts.startY, id);
      }
      render();
    }, 450);
  }
}, { passive: false });

mapSvg.addEventListener('touchmove', (e) => {
  if (e.touches.length >= 2 && _ts.pinching) {
    // ── Pinch-zoom ─────────────────────────────────────────────────────────
    e.preventDefault();
    const t1 = e.touches[0], t2 = e.touches[1];
    const dist       = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
    const newZoom    = Math.max(0.3, Math.min(4, _ts.startZoom * dist / _ts.startDist));
    const midCX      = (t1.clientX + t2.clientX) / 2;
    const midCY      = (t1.clientY + t2.clientY) / 2;
    const curMidSvgX = midCX - _ts.svgRect.left;
    const curMidSvgY = midCY - _ts.svgRect.top;
    zoom = newZoom;
    panX = curMidSvgX / newZoom - _ts.midWorldX;
    panY = curMidSvgY / newZoom - _ts.midWorldY;
    updateViewport();
  } else if (e.touches.length === 1 && !_ts.pinching) {
    // ── Single-finger pan ──────────────────────────────────────────────────
    const dx = e.touches[0].clientX - _ts.startX;
    const dy = e.touches[0].clientY - _ts.startY;
    if (!_ts.panning && Math.hypot(dx, dy) > 8) {
      _ts.panning = true;
      _tsCancelLongPress();   // finger moved — this isn't a long press
    }
    if (_ts.panning && !_ts.longPressFired) {
      e.preventDefault();
      panX = _ts.startPanX + dx / zoom;
      panY = _ts.startPanY + dy / zoom;
      updateViewport();
    }
  }
}, { passive: false });

mapSvg.addEventListener('touchend', (e) => {
  _tsCancelLongPress();
  if (e.touches.length < 2) _ts.pinching = false;
  if (e.touches.length === 0) {
    const wasTap = !_ts.panning && !_ts.longPressFired;
    _ts.panning        = false;
    _ts.longPressFired = false;
    if (wasTap) {
      // Tap: dispatch a synthetic click so the existing handler selects the hex.
      // Using MouseEvent preserves clientX/clientY so clientToWorld works correctly.
      mapSvg.dispatchEvent(new MouseEvent('click', {
        bubbles: true, cancelable: true, view: window,
        clientX: _ts.startX, clientY: _ts.startY,
      }));
    }
    return;
  }
  // One finger remains after a pinch — reset for single-finger pan/tap
  if (e.touches.length === 1 && !_ts.pinching) {
    _ts.panning        = false;
    _ts.longPressFired = false;
    _ts.startX    = e.touches[0].clientX;
    _ts.startY    = e.touches[0].clientY;
    _ts.startPanX = panX;
    _ts.startPanY = panY;
  }
}, { passive: true });
