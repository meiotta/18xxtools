// ─── PALETTE ──────────────────────────────────────────────────────────────────
// Left-panel tool palette: terrain tools, tile swatches, label tool, erase.
// Load order: SEVENTH — after context-menu.js.
//
// buildPalette() — called once on startup and after terrain costs change.
// makeTileSwatchSvg(tileId) — returns SVG string for a tile swatch.
// updateStatus(text) — sets the status bar text.

// ── Tile swatch SVG generation ───────────────────────────────────────────────

function makeTileSwatchSvg(tileId) {
  const td = TILE_DEFS[String(tileId)];
  if (!td) return '';

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
    if (td.cityPositions) {
      // Custom-positioned OO: just draw the circles at given positions (no rect)
      // Use r=12.5 for standalone circles
      for (const pos of td.cityPositions) {
        inner += `<circle cx="${pos.x}" cy="${pos.y}" r="12.5" fill="white" stroke="#333" stroke-width="2"/>`;
      }
    } else {
      // Standard inline OO: white station box + two side-by-side circles
      inner += `<rect x="-25" y="-14" width="50" height="28" fill="white" stroke="#333" stroke-width="2" rx="3"/>`;
      inner += `<circle cx="-13" cy="0" r="11" fill="white" stroke="#333" stroke-width="1.5"/>`;
      inner += `<circle cx="13" cy="0" r="11" fill="white" stroke="#333" stroke-width="1.5"/>`;
    }
    // Revenue
    if (td.revenue) {
      const rv = td.revenue;
      inner += `<circle cx="${rv.x}" cy="${rv.y}" r="9" fill="white" stroke="#777" stroke-width="1"/>`;
      inner += `<text x="${rv.x}" y="${rv.y + 0.5}" font-size="8" fill="#000" font-weight="bold" text-anchor="middle" dominant-baseline="middle">${rv.v}</text>`;
    }
    // OO label (top-left corner, doesn't rotate with tile)
    inner += `<text x="-14" y="-37" font-size="7" fill="${labelColor}">OO</text>`;

  } else if (td.city) {
    // Single city
    inner += `<circle cx="0" cy="0" r="14" fill="white" stroke="#333" stroke-width="2"/>`;
    if (td.revenue) {
      const rv = td.revenue;
      inner += `<circle cx="${rv.x}" cy="${rv.y}" r="9" fill="white" stroke="#777" stroke-width="1"/>`;
      inner += `<text x="${rv.x}" y="${rv.y + 0.5}" font-size="8" fill="#000" font-weight="bold" text-anchor="middle" dominant-baseline="middle">${rv.v}</text>`;
    }

  } else if (td.dualTown) {
    // Dual town: two dit circles
    const positions = td.townPositions || [{ x: -10, y: -10 }, { x: 10, y: 10 }];
    for (const pos of positions) {
      inner += `<circle cx="${pos.x}" cy="${pos.y}" r="10" fill="black" stroke="white" stroke-width="3"/>`;
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

  // Tile label (Y / T)
  if (td.tileLabel) {
    inner += `<text x="-46" y="1" font-size="11" fill="#111" font-weight="bold" dominant-baseline="middle">${td.tileLabel}</text>`;
  }

  // Tile number — bolder and larger so it reads at swatch size
  inner += `<text x="-41" y="-36" font-size="10" font-weight="bold" fill="${labelColor}">#${tileId}</text>`;

  return `<svg viewBox="-50 -50 100 100" width="72" height="72">${inner}</svg>`;
}

// ── Palette builder ──────────────────────────────────────────────────────────

function buildPalette() {
  // ── Tile swatches — dynamic from TILE_DEFS ────────────────────────────────
  const container = document.getElementById('starterTilesGrid');
  container.innerHTML = '';

  const colorOrder = ['yellow', 'green', 'brown', 'grey'];
  const colorLabels = { yellow: 'Yellow Tiles', green: 'Green Tiles', brown: 'Brown Tiles', grey: 'Grey Tiles' };

  // Group tile IDs by color, sorted: numeric IDs first (ascending), then X-IDs (ascending by number)
  const groups = {};
  for (const color of colorOrder) groups[color] = [];

  for (const id of Object.keys(TILE_DEFS)) {
    const td = TILE_DEFS[id];
    // X tiles are manifest-only — skip them in the map palette
    if (/^X/i.test(id)) continue;
    if (groups[td.color]) groups[td.color].push(id);
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
      swatch.innerHTML = makeTileSwatchSvg(id) + `<div class="tile-swatch-label">#${id}</div>`;

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

// ── Edge tool buttons ────────────────────────────────────────────────────────

function clearEdgeToolActive() {
  document.querySelectorAll('.edge-tool-btn').forEach(b => {
    b.style.outline = '';
    b.style.background = '';
  });
}

document.getElementById('edgeImpassableBtn').addEventListener('click', () => {
  activeTool = 'impassable';
  document.querySelectorAll('.palette-item').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.tile-swatch').forEach(s => s.classList.remove('selected'));
  clearEdgeToolActive();
  document.getElementById('edgeImpassableBtn').style.outline = '2px solid #ffd700';
  document.getElementById('edgeImpassableBtn').style.background = 'rgba(255,215,0,0.15)';
  updateStatus('Tool: Impassable Edge — click an edge on the map');
});

document.getElementById('edgeWaterBtn').addEventListener('click', () => {
  activeTool = 'water-crossing';
  document.querySelectorAll('.palette-item').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.tile-swatch').forEach(s => s.classList.remove('selected'));
  clearEdgeToolActive();
  document.getElementById('edgeWaterBtn').style.outline = '2px solid #ffd700';
  document.getElementById('edgeWaterBtn').style.background = 'rgba(255,215,0,0.15)';
  updateStatus('Tool: Water Crossing — click an edge on the map');
});
