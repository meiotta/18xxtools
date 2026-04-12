// ─── PALETTE ──────────────────────────────────────────────────────────────────
// Left-panel tool palette: terrain tools, tile swatches, label tool, erase.
// Load order: SEVENTH — after context-menu.js.
//
// buildPalette() — called once on startup and after terrain costs change.
// makeTileSwatchSvg(tileId) — returns SVG string for a tile swatch.
// updateStatus(text) — sets the status bar text.

// ── Pack tile injection ───────────────────────────────────────────────────────
// Injects DSL-based tiles from enabled packs into TILE_DEFS so the palette
// and renderer can use them. Manually-defined TILE_DEFS entries take priority.
// Tracks injected IDs so they can be cleared on pack toggle.

let _packInjectedIds = new Set();

function _injectPackTiles() {
  if (typeof getAllRenderableTiles !== 'function') return;
  if (typeof TILE_GEO === 'undefined' || typeof TILE_GEO.parseDSL !== 'function') return;

  // Initialize enabledPacks to defaults if not set
  if (!state.enabledPacks) {
    state.enabledPacks = typeof DEFAULT_ENABLED_PACKS !== 'undefined'
      ? Object.assign({}, DEFAULT_ENABLED_PACKS)
      : {};
  }

  // Remove previously pack-injected tiles from TILE_DEFS
  for (const id of _packInjectedIds) delete TILE_DEFS[id];
  _packInjectedIds = new Set();

  const packTiles = getAllRenderableTiles(state.enabledPacks);
  for (const [id, entry] of Object.entries(packTiles)) {
    if (TILE_DEFS[id]) continue; // manually-defined entry takes priority
    const parsed = TILE_GEO.parseDSL(entry.dsl, entry.color);
    if (!parsed) continue;
    const normalized = TILE_GEO.normalizeTileDef(parsed);
    if (normalized) {
      TILE_DEFS[id] = normalized;
      _packInjectedIds.add(id);
    }
  }
}

// ── Tile swatch SVG generation ───────────────────────────────────────────────

function makeTileSwatchSvg(tileId) {
  const td = TILE_DEFS[String(tileId)];
  if (!td) return '';
  // Geometry constants (sourced from TILE_GEO to avoid duplication)
  const SLOT_RADIUS = TILE_GEO.SLOT_RADIUS; // 12.5 at scale 50
  const BAR_RW = TILE_GEO.BAR_RW;           // 16
  const BAR_RH = TILE_GEO.BAR_RH;           // 4

  const hexColor = TILE_HEX_COLORS[td.color] || '#c8a87a';
  const trackStroke = '#222';
  const labelColor  = td.color === 'brown' ? '#111' : '#555';

  let inner = '';

  // Hex background
  inner += `<polygon points="50,0 25,43.3 -25,43.3 -50,0 -25,-43.3 25,-43.3" fill="${hexColor}" stroke="#999" stroke-width="1.5"/>`;

  // Track paths — each M...segment as a separate <path>
  if (td.svgPath) {
    const segments = td.svgPath.split(/(?=M )/).map(s => s.trim()).filter(Boolean);
    for (const seg of segments) {
      inner += `<path d="${seg}" stroke="${trackStroke}" stroke-width="6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
    }
  }

  // Station graphics
  if (td.oo) {
    // City slot layout from city.rb:
    //   BOX_ATTRS[2] = white rect, SLOT_DIAMETER×SLOT_DIAMETER at (-SLOT_RADIUS,-SLOT_RADIUS), NO stroke
    //   CitySlot: white circle r=SLOT_RADIUS, NO stroke
    // At scale 50: SLOT_RADIUS=12.5, box 25×25 at (-12.5,-12.5)
    if (td.cityPositions && td.cityPositions.length >= 2) {
      // Custom-positioned (off-centre or multi-slot at computed positions)
      // Draw a white background box spanning the positions, then the circles
      const p0 = td.cityPositions[0], p1 = td.cityPositions[1];
      const bx = Math.min(p0.x, p1.x) - SLOT_RADIUS;
      const by = Math.min(p0.y, p1.y) - SLOT_RADIUS;
      const bw = Math.abs(p1.x - p0.x) + 2 * SLOT_RADIUS;
      const bh = Math.abs(p1.y - p0.y) + 2 * SLOT_RADIUS;
      inner += `<rect x="${bx}" y="${by}" width="${bw}" height="${bh}" fill="white"/>`;
      for (const pos of td.cityPositions) {
        inner += `<circle cx="${pos.x}" cy="${pos.y}" r="${SLOT_RADIUS}" fill="white"/>`;
      }
    } else {
      // Standard inline OO (legacy static tiles with no cityPositions set)
      // Matches source exactly: white 25×25 box then two white circles, no strokes
      inner += `<rect x="${-SLOT_RADIUS}" y="${-SLOT_RADIUS}" width="${2*SLOT_RADIUS}" height="${2*SLOT_RADIUS}" fill="white"/>`;
      inner += `<circle cx="${-SLOT_RADIUS}" cy="0" r="${SLOT_RADIUS}" fill="white"/>`;
      inner += `<circle cx="${SLOT_RADIUS}" cy="0" r="${SLOT_RADIUS}" fill="white"/>`;
    }
    // Revenue
    if (td.revenue) {
      const rv = td.revenue;
      inner += `<circle cx="${rv.x}" cy="${rv.y}" r="9" fill="white" stroke="#777" stroke-width="1"/>`;
      inner += `<text x="${rv.x}" y="${rv.y + 0.5}" font-size="8" fill="#000" font-weight="bold" text-anchor="middle" dominant-baseline="middle">${rv.v}</text>`;
    }
    // OO label removed — the two city circles already identify the tile type

  } else if (td.city) {
    // Single city
    inner += `<circle cx="0" cy="0" r="14" fill="white" stroke="#333" stroke-width="2"/>`;
    if (td.revenue) {
      const rv = td.revenue;
      inner += `<circle cx="${rv.x}" cy="${rv.y}" r="9" fill="white" stroke="#777" stroke-width="1"/>`;
      inner += `<text x="${rv.x}" y="${rv.y + 0.5}" font-size="8" fill="#000" font-weight="bold" text-anchor="middle" dominant-baseline="middle">${rv.v}</text>`;
    }

  } else if (td.dualTown) {
    // Dual town: two bars (town_rect.rb render_part: black rect, no stroke for normal towns)
    // Fallback positions for legacy tiles without computed townPositions
    const positions = td.townPositions || [{ x: -10, y: 0, rot: 0, rw: BAR_RW, rh: BAR_RH },
                                            { x:  10, y: 0, rot: 0, rw: BAR_RW, rh: BAR_RH }];
    for (const pos of positions) {
      if (pos.dot) {
        // 3+-exit junction town → dot
        inner += `<circle cx="${pos.x}" cy="${pos.y}" r="5" fill="black"/>`;
      } else {
        const rw = pos.rw || BAR_RW, rh = pos.rh || BAR_RH;
        inner += `<g transform="translate(${pos.x},${pos.y}) rotate(${pos.rot || 0})">` +
                 `<rect x="${-rw/2}" y="${-rh/2}" width="${rw}" height="${rh}" fill="black"/>` +
                 `</g>`;
      }
    }
    if (td.revenues) {
      for (const rv of td.revenues) {
        inner += `<circle cx="${rv.x}" cy="${rv.y}" r="7" fill="white" stroke="#777" stroke-width="1"/>`;
        inner += `<text x="${rv.x}" y="${rv.y + 0.5}" font-size="8" fill="#000" font-weight="bold" text-anchor="middle" dominant-baseline="middle">${rv.v}</text>`;
      }
    }

  } else if (td.town) {
    // Single town at center
    inner += `<rect x="-8" y="-4" width="16" height="8" fill="#000" rx="1"/>`;
    inner += `<circle cx="0" cy="0" r="6" fill="white" stroke="#555" stroke-width="1"/>`;
    if (td.revenue) {
      const rv = td.revenue;
      inner += `<circle cx="${rv.x}" cy="${rv.y}" r="9" fill="white" stroke="#777" stroke-width="1"/>`;
      inner += `<text x="${rv.x}" y="${rv.y + 0.5}" font-size="8" fill="#000" font-weight="bold" text-anchor="middle" dominant-baseline="middle">${rv.v}</text>`;
    }

  } else if (td.townAt) {
    // Off-center town bar
    const t = td.townAt;
    inner += `<g transform="translate(${t.x},${t.y}) rotate(${t.rot})"><rect x="${-t.rw / 2}" y="${-t.rh / 2}" width="${t.rw}" height="${t.rh}" fill="#000"/></g>`;
    if (td.revenue) {
      const rv = td.revenue;
      inner += `<circle cx="${rv.x}" cy="${rv.y}" r="9" fill="white" stroke="#777" stroke-width="1"/>`;
      inner += `<text x="${rv.x}" y="${rv.y + 0.5}" font-size="8" fill="#000" font-weight="bold" text-anchor="middle" dominant-baseline="middle">${rv.v}</text>`;
    }
  }

  // Tile label (Y / T / OO etc.) — shown as a small badge in the bottom-right corner,
  // outside the rotated group so it stays upright
  const labelBadge = td.tileLabel
    ? `<text x="36" y="44" font-size="8" fill="rgba(255,255,255,0.55)" font-weight="bold" text-anchor="end" dominant-baseline="auto">${td.tileLabel}</text>`
    : '';

  // Tile number — small badge bottom-right, semi-transparent, doesn't rotate
  const numBadge = `<text x="46" y="44" font-size="8" fill="rgba(255,255,255,0.4)" text-anchor="end" dominant-baseline="auto">#${tileId}</text>`;

  // Rotate entire hex + track for pointy-top orientation (30° = flat→pointy)
  const isPointy = (state.meta && state.meta.orientation === 'pointy');
  const hexGroup = isPointy
    ? `<g transform="rotate(30)">${inner}</g>`
    : inner;

  return `<svg viewBox="-50 -50 100 100" width="90" height="90">${hexGroup}${labelBadge}${numBadge}</svg>`;
}

// ── Palette builder ──────────────────────────────────────────────────────────

function buildPalette() {
  // Inject DSL tiles from enabled packs into TILE_DEFS before rendering
  _injectPackTiles();

  // ── Tile swatches — dynamic from TILE_DEFS ────────────────────────────────
  const container = document.getElementById('starterTilesGrid');
  container.innerHTML = '';

  const colorOrder = ['yellow', 'green', 'brown', 'grey'];
  const colorLabels = { yellow: 'Yellow Tiles', green: 'Green Tiles', brown: 'Brown Tiles', grey: 'Grey Tiles' };

  // Group tile IDs by color, sorted: numeric IDs first (ascending), then X-IDs (ascending by number)
  const groups = {};
  for (const color of colorOrder) groups[color] = [];

  // Precompute tile → pack name map for reliable filtering (avoids per-tile nested loops)
  const tilePackMap = {};
  if (typeof TILE_PACK_ORDER !== 'undefined' && typeof TILE_PACKS !== 'undefined') {
    for (const pn of TILE_PACK_ORDER) {
      const pack = TILE_PACKS[pn];
      if (!pack) continue;
      for (const col of ['yellow', 'green', 'brown', 'grey', 'gray']) {
        if (!pack[col]) continue;
        for (const tid of Object.keys(pack[col])) tilePackMap[tid] = pn;
      }
    }
  }

  const enabledPacks = state.enabledPacks; // already initialised by _injectPackTiles()

  for (const id of Object.keys(TILE_DEFS)) {
    const td = TILE_DEFS[id];
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
  document.querySelectorAll('.white-tile-btn').forEach(b => b.classList.remove('wt-active'));
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

const WHITE_TILE_LABELS = {
  'white-blank':   'Blank hex',
  'town':          'Tool: Single Dit',
  'dual-town':     'Tool: Double Dit',
  'city-1':        'Tool: Single City',
  'city-joined':   'Tool: Double City (joined)',
  'city-oo':       'Tool: OO City',
  'city-3':        'Tool: 3-Slot City',
};

document.querySelectorAll('.white-tile-btn').forEach(btn => {
  // Make draggable so users can drag directly onto the canvas
  btn.draggable = true;
  btn.addEventListener('dragstart', (e) => {
    e.dataTransfer.setData('text/plain', btn.dataset.wtool);
    e.dataTransfer.effectAllowed = 'copy';
  });

  btn.addEventListener('click', () => {
    const tool = btn.dataset.wtool;
    if (activeTool === tool) {
      // Toggle off
      activeTool = null;
      btn.classList.remove('wt-active');
      updateStatus('');
      return;
    }
    clearAllToolHighlights();
    activeTool = tool;
    btn.classList.add('wt-active');
    updateStatus(WHITE_TILE_LABELS[tool] || `Tool: ${tool}`);
  });
});

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
