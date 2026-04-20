// ─── PALETTE ──────────────────────────────────────────────────────────────────
// Left-panel tool palette: terrain tools, tile swatches, label tool, erase.
// Load order: SEVENTH — after context-menu.js.
//
// buildPalette() — called once on startup and after terrain costs change.
// makeTileSwatchSvg(tileId) — returns SVG string for a tile swatch.
// updateStatus(text) — sets the status bar text.
// ── Tile swatch SVG generation ───────────────────────────────────────────────
function makeTileSwatchSvg(tileId) {
  const td = TileRegistry.getTileDef(tileId);
  if (!td) return '';
  const normColor = td.color === 'gray' ? 'grey' : td.color;
  const hexColor = TILE_HEX_COLORS[normColor] || '#c8a87a';
  let inner = '';
  // Hex background — inradius 43.5 matches ep() in renderer (DSL track termination point)
  inner += `<polygon points="50,0 25,43.5 -25,43.5 -50,0 -25,-43.5 25,-43.5" fill="${hexColor}" stroke="#999" stroke-width="1.5"/>`;
  // Track + station geometry via the legacy tileDef branch of hexToSvgInner.
  // Pass null as hex and td as tileDef so the function reads the pre-computed
  // geometry fields (svgPath, city, oo, cities, town, townAt, dualTown, cityPositions,
  // townPositions) that normalizeTileDef built.  Do NOT pass td as hex — that
  // routes to the DSL branch which (a) silently skips pure-track tiles because
  // tile-registry only sets td.nodes when raw.nodes.length > 0, and (b) leaves
  // td.paths un-normalized for node-free tiles (normalization is inside the same
  // guard), so path endpoints read as undefined.type → zero-length lines.
  inner += hexToSvgInner(null, td);
  // Revenue bubble(s) — unified via _buildDslRevenueSvg (renderer.js).
  // sc=1 because makeTileSwatchSvg already works in 50-unit tile space;
  // totalDeg=0 because orientation rotation is applied to the outer group below.
  {
    const _revHex = { nodes: td.nodes || [], paths: td.paths || [], exits: _exitsFromPaths(td.paths || []) };
    if (_revHex.nodes.length > 0) inner += _buildDslRevenueSvg(_revHex, 0, 1);
  }
  // ── Tile label (Y / T / OO / M etc.) ─────────────────────────────────────────
  // Delegated to _buildLabelSvg (renderer.js) — the single canonical implementation
  // of tobymao label.rb preferred_render_locations + base.rb render_location.
  // sz=50 → tile-space coordinates (50-unit space), same unit system as svgPath/cities.
  if (td.tileLabel) {
    inner += _buildLabelSvg(td.tileLabel, td.nodes || [], td.paths || [], 50);
  }
  // Tile number — small badge bottom-right, semi-transparent, doesn't rotate
  const numBadge = `<text x="46" y="44" font-size="8" fill="rgba(255,255,255,0.4)" text-anchor="end" dominant-baseline="auto">#${tileId}</text>`;
  // Rotate entire hex + track for pointy-top orientation (30° = flat→pointy)
  // Label is inside inner so it rotates with the tile (tobymao behaviour).
  const isPointy = (state.meta && state.meta.orientation === 'pointy');
  const hexGroup = isPointy
    ? `<g transform="rotate(30)">${inner}</g>`
    : inner;
  return `<svg viewBox="-50 -50 100 100" width="90" height="90">${hexGroup}${numBadge}</svg>`;
}
// ── Palette builder ──────────────────────────────────────────────────────────
function buildPalette() {
  // Initialize enabledPacks to defaults if not set
  if (!state.enabledPacks) {
    state.enabledPacks = typeof DEFAULT_ENABLED_PACKS !== 'undefined'
      ? Object.assign({}, DEFAULT_ENABLED_PACKS)
      : {};
  }
  // ── Tile swatches — dynamic from TileRegistry ─────────────────────────────
  const container = document.getElementById('starterTilesGrid');
  container.innerHTML = '';
  const colorOrder = ['white', 'yellow', 'green', 'brown', 'grey'];
  const colorLabels = { white: 'White Tiles', yellow: 'Yellow Tiles', green: 'Green Tiles', brown: 'Brown Tiles', grey: 'Grey Tiles' };
  // Group tile IDs by color, sorted: numeric IDs first (ascending), then X-IDs (ascending by number)
  const groups = {};
  for (const color of colorOrder) groups[color] = [];
  // Precompute tile → pack name map for reliable filtering (avoids per-tile nested loops)
  const tilePackMap = {};
  if (typeof TILE_PACK_ORDER !== 'undefined' && typeof TILE_PACKS !== 'undefined') {
    for (const pn of TILE_PACK_ORDER) {
      const pack = TILE_PACKS[pn];
      if (!pack) continue;
      for (const col of ['white', 'yellow', 'green', 'brown', 'grey', 'gray']) {
        if (!pack[col]) continue;
        for (const tid of Object.keys(pack[col])) tilePackMap[tid] = pn;
      }
    }
  }
  const enabledPacks = state.enabledPacks;
  for (const [id, td] of Object.entries(TileRegistry.getAllTileDefs())) {
    // X tiles are manifest-only — skip them in the map palette
    if (/^X/i.test(id)) continue;
    // Pack filtering: skip tiles whose pack is disabled.
    // Tiles with no pack classification are always shown.
    if (enabledPacks) {
      const pn = tilePackMap[id];
      if (pn !== undefined && !enabledPacks[pn]) continue;
    }
    // Normalise 'gray' → 'grey' for DSL-injected tiles
    const color = td.color === 'gray' ? 'grey' : td.color;
    if (groups[color]) groups[color].push(id);
  }
  // Empty-state message when all packs are disabled
  const totalTiles = colorOrder.reduce((n, c) => n + groups[c].length, 0);
  if (totalTiles === 0) {
    const msg = document.createElement('div');
    msg.style.cssText = 'padding:20px 12px; color:#666; font-size:12px; text-align:center; line-height:1.6;';
    msg.innerHTML = 'No tile packs enabled.<br><span style="color:#999;">Go to <strong>Config → Tile Packs</strong> to turn some on.</span>';
    container.appendChild(msg);
    return;
  }
  function sortTileIds(ids) {
    const numeric = ids.filter(id => /^\d+$/.test(id)).sort((a, b) => parseInt(a) - parseInt(b));
    const xIds    = ids.filter(id => /^X\d+$/.test(id)).sort((a, b) => parseInt(a.slice(1)) - parseInt(b.slice(1)));
    const other   = ids.filter(id => !/^\d+$/.test(id) && !/^X\d+$/.test(id)).sort();
    return [...numeric, ...xIds, ...other];
  }
  for (const color of colorOrder) {
    const ids = sortTileIds(groups[color]);
    if (!ids.length) continue;
    // Section header (collapsible)
    const header = document.createElement('div');
    header.className = 'palette-header';
    header.textContent = colorLabels[color];
    header.addEventListener('click', () => {
      header.classList.toggle('collapsed');
      const grid = header.nextElementSibling;
      if (grid) grid.classList.toggle('collapsed');
    });
    container.appendChild(header);
    const grid = document.createElement('div');
    grid.className = 'tile-swatches-grid';
    container.appendChild(grid);
    for (const id of ids) {
      const swatch = document.createElement('div');
      swatch.className = 'tile-swatch';
      swatch.setAttribute('data-tile', id);
      swatch.draggable = true;
      swatch.innerHTML = makeTileSwatchSvg(id); // tile number rendered as SVG badge inside hex
      swatch.addEventListener('click', () => {
        activeTool = 'tile';
        activeTile = /^\d+$/.test(id) ? parseInt(id) : id;
        document.querySelectorAll('.tile-swatch').forEach(s => s.classList.remove('selected'));
        swatch.classList.add('selected');
        updateStatus(`Tool: Tile #${id}`);
      });
      swatch.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/plain', id);
        e.dataTransfer.effectAllowed = 'copy';
      });
      grid.appendChild(swatch);
    }
  }
}
function updateStatus(text) {
  document.getElementById('statusBar').textContent = text;
}
document.getElementById('labelApplyBtn').addEventListener('click', () => {
  activeLabel = document.getElementById('labelInput').value;
  activeTool = 'label';
  updateStatus(`Tool: Label "${activeLabel}"`);
});
document.getElementById('eraseBtn').addEventListener('click', () => {
  activeTool = 'erase';
  document.getElementById('eraseBtn').style.background = '#a00000';
  updateStatus('Tool: Erase');
});
// ── Terrain brush buttons ─────────────────────────────────────────────────────
// clearAllToolHighlights defined below (also clears terrain brushes)
function clearAllToolHighlights() {
  document.querySelectorAll('.palette-item').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.tile-swatch').forEach(s => s.classList.remove('selected'));
  document.querySelectorAll('.tile-item').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.terrain-brush-btn').forEach(b => b.classList.remove('tb-active'));
  document.querySelectorAll('.edge-tool-btn').forEach(b => { b.style.outline = ''; b.style.background = ''; });
}
document.querySelectorAll('.terrain-brush-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const terrain = btn.dataset.terrain; // '' = clear terrain
    // Toggle off if already active
    if (activeTool === 'terrain' && activeTerrainType === terrain) {
      activeTool = null;
      activeTerrainType = null;
      btn.classList.remove('tb-active');
      updateStatus('');
      return;
    }
    clearAllToolHighlights();
    if (terrain === '') {
      // "Clear terrain" — uses a special erase-terrain mode
      activeTool = 'terrain-clear';
      activeTerrainType = '';
      btn.classList.add('tb-active');
      updateStatus('Tool: Clear terrain — click a hex to remove its terrain');
    } else {
      activeTool = 'terrain';
      activeTerrainType = terrain;
      btn.classList.add('tb-active');
      const costStr = { mountain:'$80', hill:'$40', water:'$40', swamp:'$20', forest:'$20', desert:'$40', pass:'$120', offmap:'' }[terrain] || '';
      updateStatus(`Tool: ${terrain.charAt(0).toUpperCase()+terrain.slice(1)} terrain${costStr ? ' '+costStr : ''}`);
    }
  });
});
// ── White tile buttons ────────────────────────────────────────────────────────
// White tile buttons removed — white tiles are now regular tile-pack swatches.
// ── Edge tool buttons ────────────────────────────────────────────────────────
function clearEdgeToolActive() {
  document.querySelectorAll('.edge-tool-btn').forEach(b => {
    b.style.outline = '';
    b.style.background = '';
  });
}
document.getElementById('edgeImpassableBtn').addEventListener('click', () => {
  activeTool = 'impassable';
  clearAllToolHighlights();
  document.getElementById('edgeImpassableBtn').style.outline = '2px solid #ffd700';
  document.getElementById('edgeImpassableBtn').style.background = 'rgba(255,215,0,0.15)';
  updateStatus('Tool: Impassable Edge — click an edge on the map');
});
document.getElementById('edgeWaterBtn').addEventListener('click', () => {
  if (activeTool === 'water-crossing') {
    activeTool = null;
    clearEdgeToolActive();
    updateStatus('');
    return;
  }
  activeTool = 'water-crossing';
  clearAllToolHighlights();
  document.getElementById('edgeWaterBtn').style.outline = '2px solid #ffd700';
  document.getElementById('edgeWaterBtn').style.background = 'rgba(255,215,0,0.15)';
  updateStatus('Tool: Water Crossing — click an edge on the map');
});
