// ─── EXPORT RUBY MAP ──────────────────────────────────────────────────────────
// Converts state.hexes back into an 18xx.games-compatible Ruby source file.
// Load order: after hex-geometry.js (needs hexId) and io.js (needs state).
//
// Entry point: exportRubyMap() → string (Ruby source)
// Called by the "Export as .rb" button at the bottom of this file.
//
// Round-trip guarantees:
//   importRubyMap  → parseDslHex  → state.hexes
//   exportRubyMap  → hexToDslCode ← state.hexes
//
// What IS preserved: nodes, paths, stubs, borders, icons, terrain, labels,
//   revenue (flat and phase), loc: positions, feature=offboard, location names.
// What is NOT preserved: placed tiles (hex.tile > 0 is game-state, not map
//   definition — the underlying DSL of the base hex is exported instead),
//   TILE_TYPE (not stored on import), module/class hierarchy (generic wrapper).

// ── Revenue string helpers ────────────────────────────────────────────────────

// Reconstruct a revenue string from phase revenue + active-phase booleans.
//   All four phases active and equal → flat number  '0' / '30' / …
//   Otherwise → 'yellow_30|brown_60'  (only active phases, pipe-separated)
function _rbRevenueStr(phases, active) {
  const keys = ['yellow', 'green', 'brown', 'gray'];
  const ph   = phases || {};
  const act  = active || {};
  const on   = keys.filter(k => act[k]);
  if (on.length === 0) return '0';
  if (on.length === 4) {
    const v = ph[on[0]] || 0;
    if (on.every(k => (ph[k] || 0) === v)) return String(v);
  }
  return on.map(k => `${k}_${ph[k] || 0}`).join('|');
}

// Per-node revenue: prefer node.flat (set when the DSL used a bare number)
// to avoid turning 'revenue:30' into 'revenue:yellow_30|green_30|brown_30|gray_30'.
function _rbNodeRev(node) {
  if (node.flat !== null && node.flat !== undefined) return String(node.flat);
  return _rbRevenueStr(node.phaseRevenue, node.activePhases);
}

// ── hex object → DSL code string ─────────────────────────────────────────────
// Inverse of parseDslHex.  Returns '' for blank/ocean hexes, null for killed.
function hexToDslCode(hex) {
  if (!hex || hex.killed) return null;

  const parts = [];

  // Offboard declaration (revenue stored at hex level, not in a node)
  if (hex.feature === 'offboard') {
    parts.push(`offboard=revenue:${_rbRevenueStr(hex.phaseRevenue, hex.activePhases)}`);
  }

  // Nodes — city / town / junction
  for (const node of (hex.nodes || [])) {
    if (node.type === 'city') {
      let s = `city=revenue:${_rbNodeRev(node)}`;
      if ((node.slots || 1) > 1) s += `,slots:${node.slots}`;
      if (node.locStr && node.locStr !== 'center') s += `,loc:${node.locStr}`;
      parts.push(s);
    } else if (node.type === 'town') {
      let s = `town=revenue:${_rbNodeRev(node)}`;
      if (node.locStr && node.locStr !== 'center') s += `,loc:${node.locStr}`;
      parts.push(s);
    } else if (node.type === 'junction') {
      parts.push('junction');
    }
  }

  // Paths (edge-to-edge and edge-to-node)
  for (const path of (hex.paths || [])) {
    const a = path.a.type === 'node' ? `_${path.a.n}` : String(path.a.n);
    const b = path.b.type === 'node' ? `_${path.b.n}` : String(path.b.n);
    let s = `path=a:${a},b:${b}`;
    if (path.terminal)            s += `,terminal:${path.terminal}`;
    if (path.lanes)               s += `,lanes:${path.lanes}`;
    // aLane/bLane stored as [total, idx]; tobymao DSL format is N.I (e.g. "2.0", "2.1")
    if (Array.isArray(path.aLane)) s += `,a_lane:${path.aLane[0]}.${path.aLane[1]}`;
    if (Array.isArray(path.bLane)) s += `,b_lane:${path.bLane[0]}.${path.bLane[1]}`;
    parts.push(s);
  }

  // Stubs
  for (const stub of (hex.stubs || [])) {
    let s = `stub=edge:${stub.edge}`;
    if (stub.track && stub.track !== 'broad') s += `,track:${stub.track}`;
    parts.push(s);
  }

  // Label
  if (hex.label) parts.push(`label=${hex.label}`);

  // Terrain / upgrade cost
  // White hexes with only terrain/cost (hasContent=false on import) don't have
  // nodes[] but do have hex.terrain and hex.terrainCost — handled here.
  if (hex.terrainCost > 0 || hex.terrain) {
    let s = `upgrade=cost:${hex.terrainCost || 0}`;
    if (hex.terrain) {
      let t = hex.terrain;
      if (hex.terrainHasWater && t !== 'water') t += '|water';
      s += `,terrain:${t}`;
    }
    parts.push(s);
  }

  // Borders
  for (const border of (hex.borders || [])) {
    let s = `border=edge:${border.edge},type:${border.type}`;
    if (border.cost) s += `,cost:${border.cost}`;
    if (border.color) s += `,color:${border.color}`;
    parts.push(s);
  }

  // Icons
  for (const icon of (hex.icons || [])) {
    let s = `icon=image:${icon.image}`;
    if (icon.sticky) s += `,sticky:1`;
    parts.push(s);
  }

  if (hex.hidden) parts.push('hide:1');

  return parts.join(';');
}

// ── Grid-to-coord conversion ──────────────────────────────────────────────────
// Inverse of coordToGrid in import-ruby.js.
// Reads orientation / staggerParity / coordParity / pointyStaggerParity from
// state.meta — set by importRubyMap (or the map config panel for new maps).

function _rbLetterStr(li) {
  // 0→'A' … 25→'Z', 26→'AA', 27→'AB' … (mirrors parseCoordParts in importer)
  if (li < 26) return String.fromCharCode(65 + li);
  return String.fromCharCode(64 + Math.floor(li / 26)) +
         String.fromCharCode(65 + (li % 26));
}

function _rbGridToCoord(row, col) {
  const orientation    = state.meta.orientation         || 'flat';
  // transposedAxes only meaningful for flat-top maps (see import-ruby.js note)
  const transposedAxes = (state.meta.staggerParity      === 1) && orientation !== 'pointy';
  const coordParity    = state.meta.coordParity         || 0;
  const psp            = state.meta.pointyStaggerParity || 0;

  let li, numPart;

  if (orientation === 'pointy') {
    // letter = row index; numPart encodes col with stagger
    // psp=0: even rows → odd  nums (2c+1), odd rows → even nums (2c+2)
    // psp=1: even rows → even nums (2c+2), odd rows → odd  nums (2c+1)
    li = row;
    const useEven = (psp === 1) ? (row % 2 === 0) : (row % 2 !== 0);
    numPart = useEven ? col * 2 + 2 : col * 2 + 1;

  } else if (transposedAxes) {
    // Flat transposed (e.g. 1882 Saskatchewan):
    //   letter = row, number = col+1
    //   even col: letterIdx = row*2; odd col: letterIdx = row*2+1
    numPart = col + 1;
    li      = (col % 2 === 0) ? row * 2 : row * 2 + 1;

  } else {
    // Standard flat-top:
    //   letter = col; row-number depends on coordParity
    //   coordParity=0: even cols use even nums (2r+2), odd cols odd (2r+1)
    //   coordParity=1: even cols use odd  nums (2r+1), odd cols even (2r+2)
    li = col;
    const colIsEven      = (col % 2 === 0);
    const evenColEvenNum = (coordParity === 0);
    numPart = (colIsEven === evenColEvenNum) ? row * 2 + 2 : row * 2 + 1;
  }

  return _rbLetterStr(li) + numPart;
}

// ── Coord sort: letter-alphabetical then number-ascending ─────────────────────
function _rbSortCoords(arr) {
  return [...arr].sort((a, b) => {
    const am = a.match(/^([A-Z]{1,2})(\d+)$/);
    const bm = b.match(/^([A-Z]{1,2})(\d+)$/);
    if (!am || !bm) return 0;
    if (am[1] !== bm[1]) return am[1] < bm[1] ? -1 : 1;
    return parseInt(am[2]) - parseInt(bm[2]);
  });
}

// ── Format a list of coords as a Ruby %w[] or ['X'] literal ──────────────────
// indent: the leading whitespace of the enclosing line (for continuation lines)
function _rbCoordsLiteral(coords, indent) {
  const sorted = _rbSortCoords(coords);
  if (sorted.length === 1) return `['${sorted[0]}']`;
  const pad   = indent + '  ';
  const lines = [];
  let   line  = '';
  for (const c of sorted) {
    if (line && line.length + 1 + c.length > 80) { lines.push(line); line = c; }
    else line = line ? `${line} ${c}` : c;
  }
  if (line) lines.push(line);
  return `%w[\n${lines.map(l => pad + l).join('\n')}\n${indent}]`;
}

// ── Main export function ──────────────────────────────────────────────────────
function exportRubyMap() {
  const orientation = state.meta.orientation || 'flat';
  const transposed  = (state.meta.staggerParity === 1) && orientation !== 'pointy';

  // ── Collect hexes into color buckets: color → { code → [coord, …] } ───────
  const colorOrder = ['white', 'yellow', 'green', 'gray', 'red', 'blue'];
  const buckets    = {};
  colorOrder.forEach(c => { buckets[c] = {}; });
  const nameMap    = {};  // coord → location name

  const rows = state.meta.rows || 0;
  const cols = state.meta.cols || 0;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const hex = state.hexes[hexId(r, c)];
      if (!hex || hex.killed) continue;

      const coord = _rbGridToCoord(r, c);
      const color = hex.bg || 'white';
      const code  = hexToDslCode(hex);
      if (code === null) continue;  // should not happen (killed already filtered)

      (buckets[color] = buckets[color] || {})[code] =
        (buckets[color][code] || []);
      buckets[color][code].push(coord);

      if (hex.cityName) nameMap[coord] = hex.cityName;
    }
  }

  // ── Ruby source assembly ───────────────────────────────────────────────────
  let out = `# frozen_string_literal: true\n`;
  out += `# Exported by 18xxtools — edit freely\n\n`;

  out += `LAYOUT = :${orientation}\n`;
  // AXES: required for pointy maps and flat-transposed maps.
  // Standard flat (x:letter, y:number) is the tobymao default; omit it.
  if (orientation === 'pointy' || transposed) {
    out += `AXES = { x: :number, y: :letter }.freeze\n`;
  }
  out += `\n`;

  // LOCATION_NAMES
  const nameEntries = Object.entries(nameMap).sort(([a], [b]) => {
    const am = a.match(/^([A-Z]{1,2})(\d+)$/);
    const bm = b.match(/^([A-Z]{1,2})(\d+)$/);
    if (!am || !bm) return 0;
    if (am[1] !== bm[1]) return am[1] < bm[1] ? -1 : 1;
    return parseInt(am[2]) - parseInt(bm[2]);
  });
  if (nameEntries.length > 0) {
    out += `LOCATION_NAMES = {\n`;
    for (const [coord, name] of nameEntries) {
      const escaped = name.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
      out += `  '${coord}' => '${escaped}',\n`;
    }
    out += `}.freeze\n\n`;
  }

  // TILES — only emit if the manifest has entries
  const manifest    = state.manifest    || {};
  const customTiles = state.customTiles || {};
  const manifestIds = Object.keys(manifest).filter(id => (manifest[id] || 0) > 0);
  if (manifestIds.length > 0) {
    // Sort: numeric IDs first (ascending), then X-ids, then others
    manifestIds.sort((a, b) => {
      const aNum = /^\d+$/.test(a), bNum = /^\d+$/.test(b);
      if (aNum && bNum) return parseInt(a) - parseInt(b);
      if (aNum) return -1; if (bNum) return 1;
      const aX = /^X\d+$/i.test(a), bX = /^X\d+$/i.test(b);
      if (aX && bX) return parseInt(a.slice(1)) - parseInt(b.slice(1));
      if (aX) return -1; if (bX) return 1;
      return a.localeCompare(b);
    });
    out += `TILES = {\n`;
    for (const id of manifestIds) {
      const count  = manifest[id];
      const custom = customTiles[id];
      if (custom) {
        // Round-trip custom tile definition
        const code = (custom.code || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
        out += `  '${id}' => { 'count' => ${count}, 'color' => '${custom.color}', 'code' => '${code}' },\n`;
      } else {
        out += `  '${id}' => ${count},\n`;
      }
    }
    out += `}.freeze\n\n`;
  }

  // HEXES
  out += `HEXES = {\n`;
  for (const color of colorOrder) {
    const bucket = buckets[color];
    if (!bucket || Object.keys(bucket).length === 0) continue;

    out += `  ${color}: {\n`;

    // Sort groups: blank '' first, then alphabetically by code string
    const groups = Object.entries(bucket).sort(([a], [b]) => {
      if (a === b) return 0;
      if (a === '') return -1;
      if (b === '') return 1;
      return a < b ? -1 : 1;
    });

    for (const [code, coords] of groups) {
      const literal = _rbCoordsLiteral(coords, '    ');
      // Single quotes in the code string need escaping (rare but possible)
      const escapedCode = code.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
      out += `    ${literal} => '${escapedCode}',\n`;
    }
    out += `  },\n`;
  }
  out += `}.freeze\n`;

  return out;
}

// ── Wire up button ────────────────────────────────────────────────────────────
document.getElementById('exportRubyBtn').addEventListener('click', () => {
  try {
    const src  = exportRubyMap();
    const blob = new Blob([src], { type: 'text/plain' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    const title = (state.meta.title || 'map')
      .replace(/[^a-z0-9_-]/gi, '_')
      .toLowerCase();
    a.download = `${title}_map.rb`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    updateStatus('Exported ' + a.download);
  } catch (err) {
    console.error('[exportRubyMap]', err);
    alert('Export failed: ' + err.message);
  }
});
