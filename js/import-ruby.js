// ─── IMPORT RUBY MAP ──────────────────────────────────────────────────────────
// Parses 18xx.games Ruby source files (.rb) and populates state.hexes.
// Load order: LAST — after io.js.
//
// Entry point: importRubyMap(content) → { hexes, rows, cols, orientation }
// Called by the "Import Map" button handler at the bottom of this file.
//
// Pipeline overview:
//   1. Strip Ruby string-continuation backslashes.
//   2. Detect AXES convention (standard x=letter vs transposed x=number for 1882).
//   3. Detect LAYOUT (:flat vs :pointy).
//   4. Parse LOCATION_NAMES block → { coord: cityName } map.
//   5. Parse HEXES block for all colors (white/yellow/green/gray/red/blue).
//   6. Convert each coord to editor grid indices via coordToGrid().
//   7. Match yellow/green hexes to TILE_DEFS by edge set + color.
//   8. Parse gray/red/blue hexes as static hexes.
//   9. Fill unused grid positions with killed hexes.

// ── Edge midpoints in manifest SVG path-space (apothem=43.3, y-down) ─────────
// Index = 18xx edge number (0=N/top, 1=NE, 2=SE, 3=S/bottom, 4=SW, 5=NW)
const IMPORT_EDGE_PTS = [
  [0,    -43.3],  // 0 N
  [37.5, -21.65], // 1 NE
  [37.5,  21.65], // 2 SE
  [0,    43.3],   // 3 S
  [-37.5, 21.65], // 4 SW
  [-37.5,-21.65], // 5 NW
];

// Convert a SVG path string to a Set of edge indices by matching each M command
// endpoint to the nearest IMPORT_EDGE_PTS entry.
function svgPathToEdgeSet(svgPath) {
  const edges = new Set();
  const re = /M\s*([\d.-]+)\s+([\d.-]+)/g;
  let m;
  while ((m = re.exec(svgPath)) !== null) {
    const x = parseFloat(m[1]), y = parseFloat(m[2]);
    let best = 0, bestD = Infinity;
    IMPORT_EDGE_PTS.forEach(([ex, ey], i) => {
      const d = Math.hypot(x - ex, y - ey);
      if (d < bestD) { bestD = d; best = i; }
    });
    edges.add(best);
  }
  return edges;
}

function edgeSetsEqual(a, b) {
  if (a.size !== b.size) return false;
  for (const v of a) if (!b.has(v)) return false;
  return true;
}

// Pre-compute each tile's base edge set once
const TILE_EDGE_CACHE = {};
function getTileEdges(tileNum) {
  if (!TILE_EDGE_CACHE[tileNum]) {
    TILE_EDGE_CACHE[tileNum] = svgPathToEdgeSet(TILE_DEFS[String(tileNum)].svgPath);
  }
  return TILE_EDGE_CACHE[tileNum];
}

// Find the TILE_DEFS entry + rotation that matches a set of target edges and color.
// hasCityOrOO: true if the Ruby hex code has city= or slots:2
function matchTileDef(targetEdges, color, hasCityOrOO) {
  if (targetEdges.size === 0) return null;
  for (const [tileNum, tileDef] of Object.entries(TILE_DEFS)) {
    if (tileDef.color !== color) continue;
    const tileHasCityOrOO = !!(tileDef.city || tileDef.oo);
    if (hasCityOrOO !== tileHasCityOrOO) continue;
    const base = getTileEdges(tileNum);
    if (base.size !== targetEdges.size) continue;
    for (let rot = 0; rot < 6; rot++) {
      const rotated = new Set([...base].map(e => (e + rot) % 6));
      if (edgeSetsEqual(rotated, targetEdges)) return { tile: parseInt(tileNum), rotation: rot };
    }
  }
  return null;
}

// ── Phase revenue parsing ─────────────────────────────────────────────────────
// Parse "yellow_30|brown_60|gray_90" or flat "30" into phases object.
function parsePhaseRevenue(revStr) {
  if (!revStr) return { phases: { yellow: 0, green: 0, brown: 0, gray: 0 }, active: { yellow: true, green: true, brown: true, gray: true } };
  if (!revStr.includes('_')) {
    const v = parseInt(revStr) || 0;
    return { phases: { yellow: v, green: v, brown: v, gray: v }, active: { yellow: true, green: true, brown: true, gray: true } };
  }
  const phases = { yellow: 0, green: 0, brown: 0, gray: 0 };
  const active = { yellow: false, green: false, brown: false, gray: false };
  revStr.split('|').forEach(part => {
    const m = part.trim().match(/^([a-z]+)_(\d+)$/);
    if (!m) return;
    const ph = m[1], val = parseInt(m[2]);
    if (ph === 'yellow' || ph === 'green' || ph === 'brown' || ph === 'gray' || ph === 'grey') {
      const p = ph === 'grey' ? 'gray' : ph;
      phases[p] = val; active[p] = true;
    } else if (ph === 'diesel' || ph === 'electric' || ph === 'steam' || ph === 'rust') {
      // Map non-standard phases to gray slot
      if (val > phases.gray) { phases.gray = val; active.gray = true; }
    }
  });
  // Fill gaps: inherit forward
  if (!active.green  && active.yellow)  { phases.green  = phases.yellow;  active.green  = true; }
  if (!active.brown  && active.green)   { phases.brown  = phases.green;   active.brown  = true; }
  if (!active.gray   && active.brown)   { phases.gray   = phases.brown;   active.gray   = true; }
  return { phases, active };
}

// ── Parse a single Ruby hex code string (for white/yellow/green) ──────────────
// Returns: { city, oo, town, dualTown, paths, label, terrain, terrainCost }
function parseHexCode(code) {
  const result = { city: null, oo: false, town: false, dualTown: false, paths: [], label: '', terrain: '', terrainCost: 0 };
  let cityCount = 0, townCount = 0;
  const parts = code.split(';').map(s => s.trim()).filter(Boolean);
  for (const part of parts) {
    if (part.startsWith('city=')) {
      cityCount++;
      if (cityCount === 1) {
        const rev   = (part.match(/revenue:([\d|_a-z]+)/) || [])[1];
        const slots = (part.match(/slots:(\d+)/)           || [])[1];
        result.city = { revenue: rev || '0', slots: parseInt(slots || 1) };
      }
    } else if (part.startsWith('town=')) {
      townCount++;
    } else if (part.startsWith('path=')) {
      // Collect edges that connect to any city/town node (_0 or _1 etc.)
      const m = part.match(/a:(\d+),b:_[0-9]/);
      if (m) result.paths.push(parseInt(m[1]));
      const m2 = part.match(/a:_[0-9],b:(\d+)/);
      if (m2) result.paths.push(parseInt(m2[1]));
    } else if (part.startsWith('label=')) {
      result.label = part.slice(6).trim();
    } else if (part.includes('terrain:')) {
      const m = part.match(/terrain:([a-z|]+)/);
      if (m) result.terrain = m[1].split('|')[0];
      const c = (part.match(/cost:(\d+)/) || [])[1];
      if (c) result.terrainCost = parseInt(c);
    } else if (part.startsWith('upgrade=')) {
      const c = (part.match(/cost:(\d+)/) || [])[1];
      if (c) result.terrainCost = parseInt(c);
    }
  }
  // Synthesise compound flags
  if (cityCount >= 2) result.oo = true;
  if (townCount >= 2) result.dualTown = true;
  if (townCount >= 1) result.town = true;
  return result;
}

// ── Parse full code string into a static hex object (gray/red/blue/pre-placed) ──
// bg: 'gray', 'red', 'blue', 'yellow', 'green'
function parseStaticHex(code, bg, locationName) {
  const hex = {
    static: true,
    bg,
    feature: bg === 'red' ? 'offboard' : 'none',
    slots: 1,
    exits: [],
    rotation: 0,
    terminal: false,
    taperStyle: 1,
    pathMode: 'star',
    pathPairs: [],
    exitPairs: [],
    townRevenue: 0,
    townRevenues: [0, 0],
    ooFlatRevenues: [0, 0],
    phaseRevenue: { yellow: 0, green: 0, brown: 0, gray: 0 },
    activePhases: { yellow: true, green: true, brown: true, gray: true },
    name: locationName || '',
    label: '',
    terrain: '',
    terrainCost: 0,
    killed: false,
    borders: [],   // [{ edge, type, cost }] — imported for export fidelity
    icons: [],     // [{ image }]
  };

  const parts = code.split(';').map(s => s.trim()).filter(Boolean);
  let cityCount = 0, townCount = 0;
  const exitSet = new Set();
  const pathPairs = [];
  const cityRevs = [];

  for (const part of parts) {
    if (part.startsWith('city=')) {
      cityCount++;
      const revStr = (part.match(/revenue:([\d|_.a-z]+)/) || [])[1] || '0';
      const slots  = parseInt((part.match(/slots:(\d+)/) || [])[1] || '1');
      const { phases, active } = parsePhaseRevenue(revStr);
      const flatVal = !revStr.includes('_') ? (parseInt(revStr) || 0) : null;
      cityRevs.push({ phases, flat: flatVal });
      if (cityCount === 1) {
        hex.slots = slots;
        hex.phaseRevenue = phases;
        hex.activePhases = (Object.values(active).some(Boolean)) ? active : { yellow: true, green: true, brown: true, gray: true };
      }
    } else if (part.startsWith('offboard=')) {
      const revStr = (part.match(/revenue:([\d|_.a-z]+)/) || [])[1] || '0';
      const { phases, active } = parsePhaseRevenue(revStr);
      hex.phaseRevenue = phases;
      hex.activePhases = (Object.values(active).some(Boolean)) ? active : { yellow: true, green: true, brown: true, gray: true };
      hex.feature = 'offboard';
    } else if (part.startsWith('town=')) {
      townCount++;
      const rev = parseInt((part.match(/revenue:(\d+)/) || [])[1] || '0');
      if (townCount === 1) { hex.townRevenue = rev; hex.townRevenues[0] = rev; }
      if (townCount === 2) { hex.townRevenues[1] = rev; }
    } else if (part.startsWith('path=')) {
      const toNode   = part.match(/a:(\d+),b:_\d+/);
      const fromNode = part.match(/a:_\d+,b:(\d+)/);
      const edgePair = !toNode && !fromNode ? part.match(/^path=a:(\d+),b:(\d+)/) : null;
      if (toNode)   exitSet.add(parseInt(toNode[1]));
      else if (fromNode) exitSet.add(parseInt(fromNode[1]));
      else if (edgePair) pathPairs.push([parseInt(edgePair[1]), parseInt(edgePair[2])]);
    } else if (part.startsWith('label=')) {
      hex.label = part.slice(6).trim();
    } else if (part.includes('terrain:')) {
      const m = part.match(/terrain:([a-z|]+)/);
      if (m) hex.terrain = m[1].split('|')[0];
      const c = (part.match(/cost:(\d+)/) || [])[1];
      if (c) hex.terrainCost = parseInt(c);
    } else if (part.startsWith('upgrade=')) {
      const c = (part.match(/cost:(\d+)/) || [])[1];
      if (c) hex.terrainCost = parseInt(c);
    } else if (part.startsWith('border=')) {
      const edgeM = part.match(/edge:(\d+)/);
      const typeM = part.match(/type:(\w+)/);
      const costM = part.match(/cost:(\d+)/);
      if (edgeM) {
        hex.borders.push({
          edge: parseInt(edgeM[1]),
          type: typeM ? typeM[1] : 'impassable',
          cost: costM ? parseInt(costM[1]) : 0,
        });
      }
    } else if (part.startsWith('icon=')) {
      const imgM = part.match(/image:([^\s,;]+)/);
      const stickyM = part.match(/sticky:1/);
      if (imgM) hex.icons.push({ image: imgM[1], sticky: !!stickyM });
    }
  }

  hex.exits    = [...exitSet];
  hex.pathPairs = pathPairs;

  // Path mode: use 'pairs' when only edge-to-edge paths (no feature exits)
  hex.pathMode = (pathPairs.length > 0 && exitSet.size === 0) ? 'pairs' : 'star';

  // Determine feature from counts (only override for non-offboard hexes)
  if (hex.feature !== 'offboard') {
    if (cityCount >= 2) {
      hex.feature = 'oo';
      hex.ooFlatRevenues = [
        cityRevs[0]?.flat !== null ? (cityRevs[0]?.flat || 0) : (cityRevs[0]?.phases?.yellow || 0),
        cityRevs[1]?.flat !== null ? (cityRevs[1]?.flat || 0) : (cityRevs[1]?.phases?.yellow || 0),
      ];
      // exitPairs: try to assign one exit per city node for OO
      if (exitSet.size === 2) {
        const exits = [...exitSet];
        hex.exitPairs = [[exits[0]], [exits[1]]];
      }
    } else if (cityCount === 1) {
      hex.feature = 'city';
    } else if (townCount >= 2) {
      hex.feature = 'dualTown';
    } else if (townCount === 1) {
      hex.feature = 'town';
    }
  }

  return hex;
}

// ── Extract the text body of a color sub-block from HEXES ───────────────────
function extractColorBlock(hexesText, color) {
  const marker = color + ':';
  const start = hexesText.indexOf(marker);
  if (start === -1) return '';
  let depth = 0, i = start + marker.length;
  while (i < hexesText.length && hexesText[i] !== '{') i++;
  const bodyStart = i + 1;
  depth = 1; i = bodyStart;
  while (i < hexesText.length && depth > 0) {
    if (hexesText[i] === '{') depth++;
    else if (hexesText[i] === '}') depth--;
    i++;
  }
  return hexesText.substring(bodyStart, i - 1);
}

// ── Main import function ──────────────────────────────────────────────────────
// Returns { hexes, rows, cols, orientation }
function importRubyMap(content) {
  // Join Ruby string line-continuations: '\<newline>'
  content = content.replace(/'\s*\\\s*\r?\n\s*'/g, '');

  // ── Detect axis convention ──────────────────────────────────────────────
  const axesMatch = content.match(/AXES\s*=\s*\{\s*x:\s*:(\w+),\s*y:\s*:(\w+)/);
  const xAxis = axesMatch ? axesMatch[1] : 'letter';
  const transposedAxes = (xAxis === 'number');
  console.log(`[importRubyMap] AXES: x=${xAxis} transposed=${transposedAxes}`);

  // ── Detect LAYOUT (:flat or :pointy) ───────────────────────────────────
  const layoutMatch = content.match(/LAYOUT\s*=\s*:(\w+)/);
  const orientation = layoutMatch ? (layoutMatch[1] === 'pointy' ? 'pointy' : 'flat') : 'flat';
  console.log(`[importRubyMap] LAYOUT=${orientation}`);

  // ── LOCATION_NAMES ─────────────────────────────────────────────────────
  const locationNames = {};
  const namesBlock = (content.match(/LOCATION_NAMES\s*=\s*\{([^}]+)\}/) || [])[1] || '';
  const nameRe = /'([A-Z]\d{1,2})'\s*=>\s*'([^']+)'/g;
  let nm;
  while ((nm = nameRe.exec(namesBlock)) !== null) locationNames[nm[1]] = nm[2];

  // ── HEXES ───────────────────────────────────────────────────────────────
  const hexesStart = content.indexOf('HEXES = {');
  const hexesEnd   = content.indexOf('}.freeze', hexesStart);
  const hexesText  = content.substring(hexesStart + 9, hexesEnd);

  const hexEntries = {}; // coord → { color, code, parsed }

  // Colors to import and how to handle them
  const staticColors = new Set(['gray', 'red', 'blue']);
  const colorsToImport = ['white', 'yellow', 'green', 'gray', 'red', 'blue'];

  for (const color of colorsToImport) {
    const block = extractColorBlock(hexesText, color);
    if (!block) continue;

    // Match both %w[A1 B2 C3] => 'code' and ['A1'] => 'code'
    const pairRe = /(?:%w\[([^\]]+)\]|\['([^']+)'\])\s*=>\s*'([^']*)'/g;
    let pm;
    while ((pm = pairRe.exec(block)) !== null) {
      const hexStr  = (pm[1] || pm[2]).trim();
      const hexList = hexStr.split(/\s+/);
      const code    = pm[3];
      for (const coord of hexList) {
        hexEntries[coord] = { color, code };
      }
    }
  }

  // ── Grid bounds ─────────────────────────────────────────────────────────
  console.log(`[importRubyMap] hexEntries=${Object.keys(hexEntries).length} locationNames=${Object.keys(locationNames).length}`);
  let maxRow = 0, maxCol = 0, skippedCoords = 0;
  const allCoords = [...new Set([...Object.keys(hexEntries), ...Object.keys(locationNames)])];

  function coordToGrid(coord) {
    if (!/^[A-Z]\d{1,2}$/.test(coord)) return null;
    let col, row;
    if (transposedAxes) {
      const numPart   = parseInt(coord.slice(1));
      const letterIdx = coord.charCodeAt(0) - 65;
      col = numPart - 1;
      row = (col % 2 === 0) ? letterIdx / 2 : (letterIdx - 1) / 2;
    } else {
      col = coord.charCodeAt(0) - 65;
      const coordRow = parseInt(coord.slice(1));
      row = (col % 2 === 0) ? (coordRow - 2) / 2 : (coordRow - 1) / 2;
    }
    if (!Number.isInteger(row) || row < 0 || col < 0) return null;
    return { col, row };
  }

  for (const coord of allCoords) {
    const g = coordToGrid(coord);
    if (!g) { skippedCoords++; continue; }
    maxRow = Math.max(maxRow, g.row + 1);
    maxCol = Math.max(maxCol, g.col + 1);
  }
  console.log(`[importRubyMap] bounds → maxRow=${maxRow} maxCol=${maxCol} skipped=${skippedCoords}`);

  // ── Build state.hexes ────────────────────────────────────────────────────
  const newHexes = {};

  for (const [coord, { color, code }] of Object.entries(hexEntries)) {
    const g = coordToGrid(coord);
    if (!g) { console.warn(`[importRubyMap] skipping ${coord} (non-integer grid)`); continue; }
    const key  = hexId(g.row, g.col);
    const name = locationNames[coord] || '';

    if (staticColors.has(color)) {
      // ── Gray / red / blue → parse as static hex ──
      const h = parseStaticHex(code, color, name);
      // Blue hexes with no content are ocean — mark killed so they're not shown
      if (color === 'blue' && !code.trim()) {
        newHexes[key] = { terrain: '', terrainCost: 0, tile: 0, rotation: 0, city: null, town: null, label: '', killed: true };
      } else {
        newHexes[key] = h;
      }
    } else {
      // ── White / yellow / green ───────────────────
      const parsed = parseHexCode(code);
      const h = {
        terrain:    parsed.terrain,
        terrainCost: parsed.terrainCost,
        tile: 0, rotation: 0,
        city: null, town: null,
        label: parsed.label,
        upgradesTo: [], overrideUpgrades: false,
        riverEdges: [], killed: false,
        cityName: '',
      };

      if (color === 'white') {
        if (parsed.oo) {
          h.oo = true; h.ooCityName = name;
          h.label = parsed.label || 'OO';
        } else if (parsed.city) {
          h.city = { name, slots: parsed.city.slots, home: '', revenue: { yellow: 0, green: 0, brown: 0, grey: 0 } };
        } else if (parsed.dualTown) {
          h.dualTown = true; h.town = { name };
        } else if (parsed.town) {
          h.town = { name };
        }
        newHexes[key] = h;

      } else {
        // Yellow or green: try to match a tile, fall back to static if not found
        const targetEdges = new Set(parsed.paths);
        const hasCityOrOO = !!(parsed.city);
        const match = !parsed.oo ? matchTileDef(targetEdges, color, hasCityOrOO) : null;

        if (match) {
          h.tile     = match.tile;
          h.rotation = match.rotation;
          if (name) h.cityName = name;
          newHexes[key] = h;
        } else {
          // No matching tile → import as static hex at this color
          const sh = parseStaticHex(code, color, name);
          newHexes[key] = sh;
        }
      }
    }
  }

  // Kill all grid positions not in the .rb file
  for (let r = 0; r < maxRow; r++) {
    for (let c = 0; c < maxCol; c++) {
      const k = hexId(r, c);
      if (!newHexes[k]) {
        newHexes[k] = { terrain: '', terrainCost: 0, tile: 0, rotation: 0, city: null, town: null, label: '', killed: true };
      }
    }
  }

  const live    = Object.values(newHexes).filter(h => !h.killed).length;
  const killed  = Object.values(newHexes).filter(h =>  h.killed).length;
  const statics = Object.values(newHexes).filter(h => h.static).length;
  console.log(`[importRubyMap] done → live=${live} static=${statics} killed=${killed}`);
  return { hexes: newHexes, rows: maxRow, cols: maxCol, orientation };
}

// ── Wire up the Import Map button ─────────────────────────────────────────────

document.getElementById('importMapBtn').addEventListener('click', () => {
  document.getElementById('importMapFile').click();
});

document.getElementById('importMapFile').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    try {
      const result = importRubyMap(ev.target.result);
      state.hexes = result.hexes;
      state.meta.rows = result.rows;
      state.meta.cols = result.cols;
      state.meta.orientation = result.orientation;
      // Sync orientation radio buttons in the UI
      const radioEl = document.querySelector(`input[name="orientation"][value="${result.orientation}"]`);
      if (radioEl) radioEl.checked = true;
      // Reset pan so map is visible
      panX = 0; panY = 0; zoom = 1;
      render();
      autosave();
      const staticCount = Object.values(result.hexes).filter(h => h.static).length;
      updateStatus(`Imported ${result.orientation} map: ${result.rows}r × ${result.cols}c — ${staticCount} static hexes`);
    } catch (err) {
      console.error('[importRubyMap] error:', err);
      alert('Import failed: ' + err.message);
    }
  };
  reader.readAsText(file);
  e.target.value = ''; // reset so same file can be re-imported
});
