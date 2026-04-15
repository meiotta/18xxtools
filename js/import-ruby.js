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
//   8. Parse all colored hexes into DSL hex objects via parseDslHex.
//   9. Fill unused grid positions with killed hexes.

// ── Edge midpoints in manifest SVG path-space (apothem=43.3, y-down) ─────────
// Index = 18xx edge number.  Both the Ruby DSL (tile.rb / HEXES) and edgePos()
// in renderer.js use 0=Bottom, clockwise — matching hex.rb's Y_B=87 convention.
//   0=S/bottom  (0,    +43.3)   edgePos(0) = (0, +43.3)
//   1=SW/LL     (-37.5, +21.65) edgePos(1)
//   2=NW/UL     (-37.5, -21.65) edgePos(2)
//   3=N/top     (0,    -43.3)   edgePos(3)
//   4=NE/UR     (+37.5, -21.65) edgePos(4)
//   5=SE/LR     (+37.5, +21.65) edgePos(5)
const IMPORT_EDGE_PTS = [
  [ 0,     43.3 ],  // 0 Bottom / S
  [-37.5,  21.65],  // 1 LL / SW
  [-37.5, -21.65],  // 2 UL / NW
  [ 0,    -43.3 ],  // 3 Top / N
  [ 37.5, -21.65],  // 4 UR / NE
  [ 37.5,  21.65],  // 5 LR / SE
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
    const _td = TileRegistry.getTileDef(tileNum);
    TILE_EDGE_CACHE[tileNum] = _td ? svgPathToEdgeSet(_td.svgPath) : new Set();
  }
  return TILE_EDGE_CACHE[tileNum];
}

// Find the TILE_DEFS entry + rotation that matches a set of target edges and color.
// hasCityOrOO: true if the Ruby hex code has city= or slots:2
function matchTileDef(targetEdges, color, hasCityOrOO) {
  if (targetEdges.size === 0) return null;
  for (const [tileNum, tileDef] of Object.entries(TileRegistry.getAllTileDefs())) {
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
  // No forward-fill: only explicitly named phases are shown.
  // (Forward-filling yellow→green→brown caused offboards with e.g. yellow+brown
  // to show 4 colored boxes instead of 2, mismatching the 18xx.games display.)
  return { phases, active };
}

// ── Parse a single Ruby hex code string (for white/yellow/green) ──────────────
// Returns: { city, oo, town, dualTown, paths, label, terrain, terrainCost, borders, icons }
function parseHexCode(code) {
  const result = { city: null, oo: false, town: false, dualTown: false, offboard: false, paths: [], directPaths: [], label: '', terrain: '', terrainHasWater: false, terrainCost: 0, borders: [], icons: [] };
  let cityCount = 0, townCount = 0;
  const parts = code.split(';').map(s => s.trim()).filter(Boolean);
  for (const part of parts) {
    // Handle bare keywords 'city' and 'town' (no = sign, no attributes)
    // e.g.  %w[E19 H4] => 'city'   or   %w[B20 D4 F10] => 'town'
    if (part === 'city') { cityCount++; continue; }
    if (part === 'town') { townCount++; continue; }
    if (part === 'city=') { cityCount++; continue; } // degenerate city=

    if (part.startsWith('city=')) {
      cityCount++;
      if (cityCount === 1) {
        const rev   = (part.match(/revenue:([\d|_a-z]+)/) || [])[1];
        const slots = (part.match(/slots:(\d+)/)           || [])[1];
        const loc   = (part.match(/loc:([\d.]+)/)          || [])[1]; // off-center placement
        result.city = { revenue: rev || '0', slots: parseInt(slots || 1), loc };
      }
    } else if (part.startsWith('town=')) {
      townCount++;
    } else if (part.startsWith('path=')) {
      // Collect edges that connect to any city/town node (_0 or _1 etc.)
      const m = part.match(/a:(\d+),b:_[0-9]/);
      if (m) result.paths.push(parseInt(m[1]));
      const m2 = part.match(/a:_[0-9],b:(\d+)/);
      if (m2) result.paths.push(parseInt(m2[1]));
      // Also capture direct edge-to-edge paths (no node reference) e.g. path=a:1,b:4
      if (!m && !m2) {
        const ep = part.match(/^path=a:(\d+),b:(\d+)/);
        if (ep) result.directPaths.push([parseInt(ep[1]), parseInt(ep[2])]);
      }
    } else if (part.startsWith('label=')) {
      result.label = part.slice(6).trim();
    } else if (part.startsWith('icon=')) {
      // Preserve icons (port, NWR franchise marker, fish, etc.)
      const imgM = part.match(/image:([^\s,;]+)/);
      if (imgM) result.icons.push({ image: imgM[1] });
    } else if (part.includes('terrain:')) {
      const m = part.match(/terrain:([a-z|]+)/);
      if (m) {
        const types = m[1].split('|');
        // Prefer non-water terrain for visual rendering (water = crossing cost, not ocean color).
        // Set terrainHasWater so the renderer can draw a supplemental water indicator.
        result.terrain = types.find(t => t !== 'water') || types[0];
        if (types.includes('water')) result.terrainHasWater = true;
      }
      const c = (part.match(/cost:(\d+)/) || [])[1];
      if (c) result.terrainCost = parseInt(c);
    } else if (part.startsWith('upgrade=')) {
      const c = (part.match(/cost:(\d+)/) || [])[1];
      if (c) result.terrainCost = parseInt(c);
      const m = part.match(/terrain:([a-z|]+)/);
      if (m) {
        const types = m[1].split('|');
        result.terrain = types.find(t => t !== 'water') || types[0];
        if (types.includes('water')) result.terrainHasWater = true;
      }
    } else if (part.startsWith('border=')) {
      const edgeM = part.match(/edge:(\d+)/);
      const typeM = part.match(/type:(\w+)/);
      const costM = part.match(/cost:(\d+)/);
      if (edgeM) {
        result.borders.push({
          edge: parseInt(edgeM[1]),
          type: typeM ? typeM[1] : 'impassable',
          cost: costM ? parseInt(costM[1]) : 0,
        });
      }
    }
  }
  // Synthesise compound flags
  if (cityCount >= 3) {
    // Triple (or more) city: treat as multi-slot city, not OO
    result.city = result.city || { revenue: '0', slots: cityCount };
    result.city.slots = cityCount;
  } else if (cityCount === 2) {
    result.oo = true;
  }
  if (townCount >= 2) result.dualTown = true;
  if (townCount >= 1) result.town = true;
  return result;
}

// ── Parse a Ruby hex DSL code string into a hex object ────────────────────────
// bg: hex background color ('white', 'yellow', 'green', 'gray', 'red', 'blue')
//
// ── TOBYMAO DATA MODEL ────────────────────────────────────────────────────────
// This function builds hex.nodes[] and hex.paths[] matching tobymao's:
//   tile.cities[]  /  tile.towns[]  →  hex.nodes[]  (type:'city'|'town')
//   tile.paths[]                    →  hex.paths[]  (each endpoint: edge N or node _N)
//
// FUTURE CLAUDE — DO NOT INVENT FLAGS:
//   hex.hasSecondaryTown  ← DELETED.  Use hex.nodes.filter(n=>n.type==='town')
//   hex.townLoc           ← DELETED.  Use node.locStr on the town node
//   hex.internalPaths     ← DELETED.  Use hex.paths[] entries with both endpoints as nodes
//   hex.cityExitsByNode   ← DELETED.  Use hex.paths[] to find edges per node
//
// hex.feature is kept as a DERIVED SUMMARY only for terrain badge collision code
// and revenue box display.  DO NOT add rendering switch cases on hex.feature for
// city/town/oo/dualTown — all such rendering is driven by hex.nodes[]+hex.paths[].
//
// Node positions (x, y, angle) are NOT stored here; they are computed lazily by
// the renderer's inline position logic from node.locStr + connected path edges.
// This keeps the parser free of geometry dependencies (computeTownPos lives in
// renderer.js and must not be called here).
function parseDslHex(code, bg, locationName) {
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
    // ── Tobymao-faithful node / path model ────────────────────────────────────
    // nodes[i] = { type:'city'|'town', slots, flat, phaseRevenue, activePhases, locStr }
    //   locStr: raw loc: value from DSL (e.g. '1', '2.5', 'center', undefined)
    //   Position computed by renderer; not stored here (see note above).
    // paths[i] = { a:{type:'edge'|'node', n:int}, b:{type:'edge'|'node', n:int} }
    //   Matches DSL path=a:X,b:Y exactly.  _N → {type:'node',n:N}, N → {type:'edge',n:N}
    nodes: [],
    paths: [],
    // stubs[i] = { edge:int, track:string } — tobymao Part::Stub
    //   DSL: stub=edge:N[,track:narrow|broad|dual]
    stubs: [],
  };

  const parts = code.split(';').map(s => s.trim()).filter(Boolean);
  let cityCount = 0, townCount = 0;
  const exitSet = new Set();
  const exitsByNode = {};   // nodeIndex → [edge, …] — used to derive exitPairs
  const pathPairList = [];  // edge-to-edge pairs (no nodes)
  const cityRevs = [];

  // Parse 'N' → edge endpoint, '_N' → node endpoint
  const parseEndpt = s =>
    s.startsWith('_') ? { type: 'node', n: parseInt(s.slice(1)) }
                      : { type: 'edge', n: parseInt(s) };

  for (const part of parts) {
    // Bare keywords: 'city', 'town', 'junction' with no attributes
    // junction: sea/port interchange node (1822 blue hexes) — tobymao Part::Junction
    if (part === 'junction') {
      hex.nodes.push({ type: 'junction', locStr: undefined });
      continue;
    }
    if (part === 'city' || part === 'city=') {
      hex.nodes.push({ type: 'city', slots: 1, flat: 0,
        phaseRevenue: { yellow:0, green:0, brown:0, gray:0 },
        activePhases: { yellow:true, green:true, brown:true, gray:true },
        locStr: undefined });
      cityCount++; continue;
    }
    if (part === 'town' || part === 'town=') {
      hex.nodes.push({ type: 'town', flat: 0,
        phaseRevenue: { yellow:0, green:0, brown:0, gray:0 },
        activePhases: { yellow:false, green:false, brown:false, gray:false },
        locStr: undefined });
      townCount++; continue;
    }

    if (part.startsWith('city=')) {
      cityCount++;
      const revStr = (part.match(/revenue:([\d|_.a-z]+)/) || [])[1] || '0';
      const slots  = parseInt((part.match(/slots:(\d+)/) || [])[1] || '1');
      const { phases, active } = parsePhaseRevenue(revStr);
      const flatVal = !revStr.includes('_') ? (parseInt(revStr) || 0) : null;
      const locStr  = (part.match(/loc:([\w.]+)/) || [])[1];
      cityRevs.push({ phases, flat: flatVal });
      const nodeActive = (Object.values(active).some(Boolean))
        ? active : { yellow:true, green:true, brown:true, gray:true };
      if (cityCount === 1) {
        hex.slots = slots;
        hex.phaseRevenue = phases;
        hex.activePhases = nodeActive;
      }
      hex.nodes.push({ type: 'city', slots, flat: flatVal,
        phaseRevenue: phases, activePhases: nodeActive, locStr });

    } else if (part.startsWith('offboard=')) {
      const revStr = (part.match(/revenue:([\d|_.a-z]+)/) || [])[1] || '0';
      const { phases, active } = parsePhaseRevenue(revStr);
      hex.phaseRevenue = phases;
      hex.activePhases = (Object.values(active).some(Boolean)) ? active
        : { yellow:true, green:true, brown:true, gray:true };
      hex.feature = 'offboard';

    } else if (part.startsWith('town=')) {
      townCount++;
      const revStr = (part.match(/revenue:([\d|_.a-z]+)/) || [])[1] || '0';
      const locStr = (part.match(/loc:([\w.]+)/) || [])[1];
      const { phases, active } = parsePhaseRevenue(revStr);
      const rev = !revStr.includes('_') ? (parseInt(revStr) || 0) : null;
      hex.nodes.push({ type: 'town', flat: rev, phaseRevenue: phases,
        activePhases: active, locStr });
      if (townCount === 1) { hex.townRevenue = rev ?? 0; hex.townRevenues[0] = rev ?? 0; }
      if (townCount === 2) { hex.townRevenues[1] = rev ?? 0; }

    } else if (part.startsWith('path=')) {
      // Parse path=a:X,b:Y[,terminal:N] where X/Y may be 'N' (edge) or '_N' (node ref)
      // terminal:N marks a tapered stub end (spike) — tobymao track_node_path.rb
      const pm = part.match(/^path=a:(_?\d+),b:(_?\d+)/);
      if (pm) {
        const a = parseEndpt(pm[1]), b = parseEndpt(pm[2]);
        const termM = part.match(/terminal:(\d+)/);
        const terminal = termM ? parseInt(termM[1]) : 0;
        hex.paths.push({ a, b, terminal });
        // Collect edge exits
        if (a.type === 'edge') {
          exitSet.add(a.n);
          if (b.type === 'node') (exitsByNode[b.n] = exitsByNode[b.n] || []).push(a.n);
        }
        if (b.type === 'edge') {
          exitSet.add(b.n);
          if (a.type === 'node') (exitsByNode[a.n] = exitsByNode[a.n] || []).push(b.n);
        }
        if (a.type === 'edge' && b.type === 'edge') pathPairList.push([a.n, b.n]);
      }

    } else if (part.startsWith('label=')) {
      hex.label = part.slice(6).trim();
    } else if (part.includes('terrain:')) {
      const m = part.match(/terrain:([a-z|]+)/);
      if (m) {
        const types = m[1].split('|');
        hex.terrain = types.find(t => t !== 'water') || types[0];
      }
      const c = (part.match(/cost:(\d+)/) || [])[1];
      if (c) hex.terrainCost = parseInt(c);
    } else if (part.startsWith('stub=')) {
      // stub=edge:N[,track:X] — tobymao Part::Stub, engine/part/stub.rb
      // Renders as a short track line from edge inward (track_stub.rb: M 0 87 L 0 65)
      const edgeM = part.match(/edge:(\d+)/);
      const trackM = part.match(/track:(\w+)/);
      if (edgeM) {
        const edge = parseInt(edgeM[1]);
        hex.stubs.push({ edge, track: trackM ? trackM[1] : 'broad' });
        exitSet.add(edge);
      }
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
    } else if (/^hide:\s*1/.test(part)) {
      hex.hidden = true;
    }
  }

  hex.exits     = [...exitSet];
  hex.pathPairs = pathPairList;

  // ── Derive hex.feature (summary only — NOT used for rendering cities/towns) ─
  if (hex.feature !== 'offboard') {
    if (cityCount >= 3) {
      hex.feature = 'city';
      hex.slots   = cityCount;
      hex.ooFlatRevenues = [
        cityRevs[0]?.flat ?? (cityRevs[0]?.phases?.yellow || 0),
        cityRevs[1]?.flat ?? (cityRevs[1]?.phases?.yellow || 0),
      ];
    } else if (cityCount === 2) {
      hex.feature = 'oo';
      hex.ooFlatRevenues = [
        cityRevs[0]?.flat !== null ? (cityRevs[0]?.flat || 0) : (cityRevs[0]?.phases?.yellow || 0),
        cityRevs[1]?.flat !== null ? (cityRevs[1]?.flat || 0) : (cityRevs[1]?.phases?.yellow || 0),
      ];
      // exitPairs: for OO revenue bubble positioning (nodes[0] exits, nodes[1] exits)
      const cityNIs = hex.nodes.map((n, i) => n.type === 'city' ? i : null).filter(i => i !== null);
      if (Object.keys(exitsByNode).length >= 1) {
        hex.exitPairs = [exitsByNode[cityNIs[0]] || [], exitsByNode[cityNIs[1]] || []];
      } else if (exitSet.size >= 2) {
        const exits = [...exitSet];
        hex.exitPairs = [[exits[0]], [exits[1]]];
      }
    } else if (cityCount === 1) {
      hex.feature = 'city';
      // cityLocX/Y: backward-compat for terrain-badge collision avoidance
      const cn = hex.nodes.find(n => n.type === 'city');
      if (cn?.locStr && cn.locStr !== 'center') {
        const f = parseFloat(cn.locStr);
        if (!isNaN(f)) {
          const angle = f * Math.PI / 3;
          hex.cityLocX = parseFloat((-Math.sin(angle) * 25).toFixed(2));
          hex.cityLocY = parseFloat(( Math.cos(angle) * 25).toFixed(2));
        }
      }
    } else if (townCount >= 2) {
      hex.feature = 'dualTown';
      // exitPairs: for dualTown revenue bubble positioning
      const townNIs = hex.nodes.map((n, i) => n.type === 'town' ? i : null).filter(i => i !== null);
      if (Object.keys(exitsByNode).length >= 1) {
        hex.exitPairs = [exitsByNode[townNIs[0]] || [], exitsByNode[townNIs[1]] || []];
      }
    } else if (townCount === 1) {
      hex.feature = 'town';
    }
  }

  // ── Sync phaseRevenue / activePhases from primary node ──────────────────────
  if (hex.feature === 'town' || hex.feature === 'dualTown') {
    const rev = hex.townRevenue || 0;
    if (rev > 0) {
      hex.phaseRevenue = { yellow: rev, green: rev, brown: rev, gray: rev };
      hex.activePhases = { yellow: true, green: true, brown: true, gray: true };
    } else {
      hex.activePhases = { yellow: false, green: false, brown: false, gray: false };
    }
  }
  if (hex.feature === 'none') {
    hex.activePhases = { yellow: false, green: false, brown: false, gray: false };
  }

  // pathMode: 'pairs' only when all paths are edge-to-edge (no nodes at all)
  hex.pathMode = (pathPairList.length > 0 && hex.nodes.length === 0) ? 'pairs' : 'star';

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
  // Most games: HEXES = { ... }.freeze (constant)
  // Some games (e.g. 1824): def map_optional_hexes / def map_hexes (Ruby method)
  // We search for both forms; if neither is found we return an empty map.
  let hexesText = '';
  {
    // Try constant form first
    let hexesStart = content.indexOf('HEXES = {');
    if (hexesStart === -1) hexesStart = content.indexOf('MAP_HEXES = {');
    if (hexesStart !== -1) {
      const innerStart = hexesStart + content.slice(hexesStart).indexOf('{') + 1;
      const hexesEnd   = content.indexOf('}.freeze', innerStart);
      if (hexesEnd !== -1) hexesText = content.substring(innerStart, hexesEnd);
    }

    // Fallback: Ruby method form (def map_hexes / def map_optional_hexes)
    if (!hexesText.trim()) {
      const methodRe = /def\s+map(?:_optional)?_hexes[^{]*\{/g;
      const mMatch = methodRe.exec(content);
      if (mMatch) {
        const bodyStart = mMatch.index + mMatch[0].length;
        // Walk braces to find the matching closing brace
        let depth = 1, i = bodyStart;
        while (i < content.length && depth > 0) {
          if (content[i] === '{') depth++;
          else if (content[i] === '}') depth--;
          i++;
        }
        hexesText = content.substring(bodyStart, i - 1);
        console.log(`[importRubyMap] Found method-form hex block (${hexesText.length} chars)`);
      }
    }

    if (!hexesText.trim()) {
      console.warn('[importRubyMap] No HEXES block found — map will be empty');
    }
  }

  const hexEntries = {}; // coord → { color, code, parsed }

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
  const maxRowPerCol = {}; // track per-column max row for killed-hex bounds
  const allCoords = [...new Set([...Object.keys(hexEntries), ...Object.keys(locationNames)])];

  // ── Detect coordinate parity ───────────────────────────────────────────────
  // coordParity=0: even-index cols (A,C,E…) use even row-numbers (2,4,6…) — e.g. 1889
  // coordParity=1: even-index cols (A,C,E…) use odd  row-numbers (1,3,5…) — e.g. 1830, 1846
  // We detect this by tallying which parity the even-letter columns actually use.
  let _evenColEven = 0, _evenColOdd = 0;
  if (!transposedAxes && orientation !== 'pointy') {
    for (const coord of allCoords) {
      const letterIdx = coord.charCodeAt(0) - 65;
      const numPart   = parseInt(coord.slice(1));
      if (letterIdx % 2 === 0) {
        if (numPart % 2 === 0) _evenColEven++; else _evenColOdd++;
      }
    }
  }
  const coordParity = (_evenColOdd > _evenColEven) ? 1 : 0;
  console.log(`[importRubyMap] coordParity=${coordParity} (evenColEven=${_evenColEven} evenColOdd=${_evenColOdd})`);

  // ── Detect pointy-top stagger parity ──────────────────────────────────────
  // In a pointy-top grid, alternate rows are offset right by dx/2.
  // Standard convention (psp=0): odd internal rows stagger right.
  // Some games (e.g. 1822 MX) use even rows staggered right (psp=1).
  // We detect this by checking what column-numbers even letter-rows (A,C,E…) use:
  //   If they mostly use EVEN numbers → even rows stagger → psp=1
  //   If they mostly use ODD  numbers → standard odd-row stagger → psp=0
  let _evenRowEven = 0, _evenRowOdd = 0;
  if (!transposedAxes && orientation === 'pointy') {
    for (const coord of allCoords) {
      const letterIdx = coord.charCodeAt(0) - 65;
      const numPart   = parseInt(coord.slice(1));
      if (letterIdx % 2 === 0) {
        if (numPart % 2 === 0) _evenRowEven++; else _evenRowOdd++;
      }
    }
  }
  const pointyStaggerParity = (orientation === 'pointy' && _evenRowEven > _evenRowOdd) ? 1 : 0;
  console.log(`[importRubyMap] pointyStaggerParity=${pointyStaggerParity} (evenRowEven=${_evenRowEven} evenRowOdd=${_evenRowOdd})`);

  // coordToGrid: convert an 18xx.games Ruby coord string → internal {row, col}.
  //
  // ── Standard flat-top convention (most games) ────────────────────────────
  //   Coord string:  letter = column (A=0, B=1 …), number = row identifier.
  //   Ruby string rows are NOT the same as internal rows; the stagger means:
  //     even cols use even string rows (2,4,6…):  internal row = (strRow-2)/2
  //     odd  cols use odd  string rows (1,3,5…):  internal row = (strRow-1)/2
  //   Example: "B3" → col=1 (B), strRow=3 → row=(3-1)/2=1 → internal (1,1).
  //   If neither formula produces an integer, the game uses the opposite parity
  //   convention (formula B) — we try both and take whichever is an integer.
  //
  // ── Transposed-axes convention (e.g. 1882 Saskatchewan) ─────────────────
  //   Ruby file declares:  AXES = { x: :number, y: :letter }
  //   This means:  coord letter = ROW identifier, coord number = COLUMN.
  //   So "I1" = col 1-1=0, row derived from letter I (letterIdx=8).
  //
  //   Because letter now encodes the row, the stagger still applies but via the
  //   COLUMN number (which is now the numeric part):
  //     even cols (numPart-1 even): letterIdx must be even → row = letterIdx/2
  //     odd  cols (numPart-1 odd):  letterIdx must be odd  → row = (letterIdx-1)/2
  //   Example: "I1" → col=0 (1-1), letterIdx=8 → col%2==0 → row=8/2=4.
  //            "L2" → col=1 (2-1), letterIdx=11 → col%2==1 → row=(11-1)/2=5.
  //
  //   After transposition, internal (row,col) values are correct, BUT the visual
  //   stagger direction flips (see staggerParity below).
  //
  // ── staggerParity ────────────────────────────────────────────────────────
  //   Standard:     even internal cols are the "tall" (offset) columns.
  //   Transposed:   odd  internal cols are the "tall" columns.
  //   We set  state.meta.staggerParity = transposedAxes ? 1 : 0  so that
  //   getHexCenter, pixelToHex, and getNeighborHex all read this value and
  //   apply  (col + sp) % 2 === 0  instead of  col % 2 === 0.
  //   This corrects the visual layout without touching any other code.
  function coordToGrid(coord) {
    if (!/^[A-Z]\d{1,2}$/.test(coord)) return null;
    let col, row;
    if (transposedAxes) {
      // Transposed: letter=row-indicator, number=col-indicator.
      // col = numPart - 1  (1-based → 0-based)
      // row = letterIdx/2 for even cols, (letterIdx-1)/2 for odd cols
      //   (same stagger arithmetic as standard, but now applied to letterIdx
      //    rather than to the numeric part)
      const numPart   = parseInt(coord.slice(1));
      const letterIdx = coord.charCodeAt(0) - 65;
      col = numPart - 1;
      row = (col % 2 === 0) ? letterIdx / 2 : (letterIdx - 1) / 2;
    } else if (orientation === 'pointy') {
      // Pointy-top: letter=row, number=col
      const letterIdx = coord.charCodeAt(0) - 65;
      const numPart   = parseInt(coord.slice(1));
      row = letterIdx;
      col = (letterIdx % 2 === 0) ? (numPart - 1) / 2 : (numPart - 2) / 2;
      if (!Number.isInteger(col)) {
        col = (letterIdx % 2 === 0) ? (numPart - 2) / 2 : (numPart - 1) / 2;
      }
    } else {
      // Standard flat-top: letter=col, number=row-identifier.
      // Use the detected coordParity to pick the correct formula directly.
      //   coordParity=0: even cols use even row-nums (A2,A4…), odd cols odd (B1,B3…)
      //   coordParity=1: even cols use odd  row-nums (A1,A3…), odd cols even (B2,B4…)
      col = coord.charCodeAt(0) - 65;
      const coordRow = parseInt(coord.slice(1));
      const evenColUsesEven = (coordParity === 0);
      row = ((col % 2 === 0) === evenColUsesEven)
        ? (coordRow - 2) / 2   // even row-number formula: (n-2)/2
        : (coordRow - 1) / 2;  // odd  row-number formula: (n-1)/2
      // Fallback in case a coord doesn't fit detected parity (shouldn't happen in valid maps)
      if (!Number.isInteger(row)) {
        row = ((col % 2 === 0) === evenColUsesEven)
          ? (coordRow - 1) / 2
          : (coordRow - 2) / 2;
      }
    }
    if (!Number.isInteger(row) || !Number.isInteger(col) || row < 0 || col < 0) return null;
    return { col, row };
  }

  for (const coord of allCoords) {
    const g = coordToGrid(coord);
    if (!g) { skippedCoords++; continue; }
    maxRow = Math.max(maxRow, g.row + 1);
    maxCol = Math.max(maxCol, g.col + 1);
    maxRowPerCol[g.col] = Math.max(maxRowPerCol[g.col] || 0, g.row + 1);
  }
  console.log(`[importRubyMap] bounds → maxRow=${maxRow} maxCol=${maxCol} skipped=${skippedCoords}`);

  // ── Build state.hexes ────────────────────────────────────────────────────
  const newHexes = {};

  for (const [coord, { color, code }] of Object.entries(hexEntries)) {
    const g = coordToGrid(coord);
    if (!g) { console.warn(`[importRubyMap] skipping ${coord} (non-integer grid)`); continue; }
    const key  = hexId(g.row, g.col);
    const name = locationNames[coord] || '';

    // ── Blue ocean: no content → killed hex ──────────────────────────────────
    if (color === 'blue' && !code.trim()) {
      newHexes[key] = { terrain: '', terrainCost: 0, tile: 0, rotation: 0,
                        city: null, town: null, label: '', killed: true };
      continue;
    }

    if (color === 'white') {
      // White hexes: detect whether any DSL content is present.
      // Hexes with content → DSL rendering via parseDslHex.
      // Blank white hexes (only terrain/cost/borders) → upgradeable blank hex structure.
      const parsed = parseHexCode(code);
      const hasContent = parsed.city || parsed.oo || parsed.town || parsed.dualTown ||
        (parsed.paths && parsed.paths.length > 0) ||
        (parsed.directPaths && parsed.directPaths.length > 0) ||
        (parsed.label && parsed.label !== '');

      if (hasContent) {
        newHexes[key] = parseDslHex(code, 'white', name);
      } else {
        // Blank upgradeable hex — keeps terrain, borders, icons for tile placement UI
        newHexes[key] = {
          terrain:         parsed.terrain,
          terrainHasWater: parsed.terrainHasWater || false,
          terrainCost:     parsed.terrainCost,
          tile: 0, rotation: 0,
          city: null, town: null,
          label: '',
          upgradesTo: [], overrideUpgrades: false,
          riverEdges: [], killed: false,
          cityName: '',
          borders: parsed.borders || [],
          icons:   parsed.icons   || [],
        };
      }
    } else {
      // All non-white hexes (yellow, green, gray, red, blue with content)
      // → unified DSL rendering via parseDslHex.
      // No tile matching at import time — the renderer reads DSL fields directly.
      newHexes[key] = parseDslHex(code, color, name);
    }
  }

  // ── Fill unused grid positions with killed hexes ────────────────────────
  //
  // The renderer draws every (row,col) in the maxRow×maxCol bounding box, so
  // we need a killed hex at every position that has no Ruby hex entry.
  //
  // Use the global bounding box (maxRow × maxCol) — do NOT clip per column.
  // A per-column ceiling (maxRowPerCol) breaks jagged maps like 1830 where
  // only some columns reach the last row; those corner positions must still
  // become killed hexes to fill out the visual grid rectangle.
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
  return { hexes: newHexes, rows: maxRow, cols: maxCol, orientation, staggerParity: transposedAxes ? 1 : 0, coordParity, pointyStaggerParity, maxRowPerCol };
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
      state.meta.staggerParity      = result.staggerParity;
      state.meta.coordParity        = result.coordParity;
      state.meta.pointyStaggerParity = result.pointyStaggerParity || 0;
      state.meta.maxRowPerCol       = result.maxRowPerCol;
      // Sync orientation select and dimension inputs in the toolbar/config panel
      syncOrientationSelect();
      syncDimInputs();
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