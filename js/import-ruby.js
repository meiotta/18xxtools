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
    feature: 'none',  // set to 'offboard' only when offboard= part is parsed (not from bg alone)
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
    cityRevenues: [0, 0],
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
      // Parse path=a:X,b:Y[,terminal:N][,lanes:N][,a_lane:T.I][,b_lane:T.I]
      // terminal:N  — tapered stub end (spike) — tobymao track_node_path.rb
      // lanes:N     — EXPANDS into N separate paths (source: Path.make_lanes in engine/part/path.rb)
      //               Each has its own index; edge→edge reverses b_lane index.
      //               lane index i: a_lane=[N,i], b_lane=[N,N-i-1] if edge→edge, else [N,i]
      // a_lane:T.I  — tobymao decimal: T=totalLanes, I=laneIndex (0-based); explicit per-endpoint
      // b_lane:T.I  — same for b endpoint
      // source: Engine::Part::Path.decode_lane_spec (engine/part/path.rb)
      const pm = part.match(/^path=a:(_?\d+),b:(_?\d+)/);
      if (pm) {
        const a = parseEndpt(pm[1]), b = parseEndpt(pm[2]);
        const termM   = part.match(/terminal:(\d+)/);
        const terminal = termM ? parseInt(termM[1]) : 0;
        const lanesM  = part.match(/\blanes:(\d+)/);
        const aLaneM  = part.match(/\ba_lane:(\d+)\.(\d+)/);
        const bLaneM  = part.match(/\bb_lane:(\d+)\.(\d+)/);
        const bothEdge = (a.type === 'edge' && b.type === 'edge');

        if (lanesM && !aLaneM && !bLaneM) {
          // lanes:N shorthand → expand into N parallel paths, mirroring Path.make_lanes
          const N = parseInt(lanesM[1]);
          for (let i = 0; i < N; i++) {
            const pathObj = { a, b, terminal,
              aLane: [N, i],
              bLane: bothEdge ? [N, N - i - 1] : [N, i],
            };
            hex.paths.push(pathObj);
            if (bothEdge) pathPairList.push([a.n, b.n]);
          }
        } else {
          // Explicit a_lane/b_lane (or no lane info at all) → single path
          const pathObj = { a, b, terminal };
          if (aLaneM) pathObj.aLane = [parseInt(aLaneM[1]), parseInt(aLaneM[2])];
          if (bLaneM) pathObj.bLane = [parseInt(bLaneM[1]), parseInt(bLaneM[2])];
          hex.paths.push(pathObj);
          if (bothEdge) pathPairList.push([a.n, b.n]);
        }
        // Collect edge exits
        if (a.type === 'edge') {
          exitSet.add(a.n);
          if (b.type === 'node') (exitsByNode[b.n] = exitsByNode[b.n] || []).push(a.n);
        }
        if (b.type === 'edge') {
          exitSet.add(b.n);
          if (a.type === 'node') (exitsByNode[a.n] = exitsByNode[a.n] || []).push(b.n);
        }
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
      hex.cityRevenues = [
        cityRevs[0]?.flat ?? (cityRevs[0]?.phases?.yellow || 0),
        cityRevs[1]?.flat ?? (cityRevs[1]?.phases?.yellow || 0),
      ];
    } else if (cityCount === 2) {
      hex.feature = 'oo';
      hex.cityRevenues = [
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
  // Generic — no special-casing by feature type. First node wins, same as tobymao.
  // Offboards set these fields directly above and have no nodes[], so they are
  // unaffected. Hexes with no nodes get activePhases cleared.
  const _pn = hex.nodes[0];
  if (_pn) {
    hex.phaseRevenue = { ..._pn.phaseRevenue };
    hex.activePhases = { ..._pn.activePhases };
  } else if (hex.feature !== 'offboard') {
    hex.activePhases = { yellow: false, green: false, brown: false, gray: false };
  }

  // pathMode: 'pairs' only when all paths are edge-to-edge (no nodes at all)
  hex.pathMode = (pathPairList.length > 0 && hex.nodes.length === 0) ? 'pairs' : 'star';

  return hex;
}

// ── Parse the TILES block ─────────────────────────────────────────────────────
// Returns { tileId: count } matching state.manifest format.
// Handles both simple form ('1' => 2) and complex custom-tile form
// ('X1' => { 'count' => 2, 'color' => 'yellow', 'code' => '...' }).
// Custom tile definitions (color/code) are stored in state.customTiles so the
// exporter can round-trip them even when TileRegistry doesn't know the tile.
function parseTilesBlock(content) {
  // Locate TILES = { ... } using brace counting (handles no .freeze too)
  const tStart = content.search(/\bTILES\s*=\s*\{/);
  if (tStart === -1) return { manifest: {}, customTiles: {} };

  let i = tStart + content.slice(tStart).indexOf('{') + 1;
  let depth = 1;
  const bodyStart = i;
  while (i < content.length && depth > 0) {
    if (content[i] === '{') depth++;
    else if (content[i] === '}') depth--;
    i++;
  }
  const body = content.substring(bodyStart, i - 1);

  const manifest    = {};
  const customTiles = {};

  // Simple form: 'id' => integer
  const simpleRe = /'([^']+)'\s*=>\s*(\d+)/g;
  let m;
  while ((m = simpleRe.exec(body)) !== null) {
    manifest[m[1]] = parseInt(m[2]);
  }

  // Complex form: 'id' => { 'count' => N, 'color' => 'X', 'code' => '...' }
  // [^}]* is safe here because the inner hash values contain no braces.
  const complexRe = /'([^']+)'\s*=>\s*\{([^}]+)\}/g;
  while ((m = complexRe.exec(body)) !== null) {
    const id    = m[1];
    const inner = m[2];
    // Skip entries already captured by simpleRe (won't match — they have no {)
    const cntM   = inner.match(/'count'\s*=>\s*(\d+)/);
    const colM   = inner.match(/'color'\s*=>\s*'([^']+)'/);
    const codeM  = inner.match(/'code'\s*=>\s*'([^']*)'/);
    const count  = cntM ? parseInt(cntM[1]) : 1;
    manifest[id] = count;
    if (colM || codeM) {
      customTiles[id] = {
        count,
        color: colM  ? colM[1]  : 'white',
        code:  codeM ? codeM[1] : '',
      };
    }
  }

  const tileCount = Object.keys(manifest).length;
  const customCount = Object.keys(customTiles).length;
  console.log(`[parseTilesBlock] ${tileCount} tiles (${customCount} custom)`);
  return { manifest, customTiles };
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
  // transposedAxes only applies to flat-top maps.  For pointy maps,
  // AXES={x:number, y:letter} is the standard convention (letter=row, number=col)
  // and falls through to the normal pointy-path in coordToGrid.
  const transposedAxes = (xAxis === 'number');  // refined below after orientation is known
  console.log(`[importRubyMap] AXES: x=${xAxis} transposed=${transposedAxes}`);

  // ── Detect LAYOUT (:flat or :pointy) ───────────────────────────────────
  const layoutMatch = content.match(/LAYOUT\s*=\s*:(\w+)/);
  const orientation = layoutMatch ? (layoutMatch[1] === 'pointy' ? 'pointy' : 'flat') : 'flat';
  console.log(`[importRubyMap] LAYOUT=${orientation}`);

  // ── LOCATION_NAMES ─────────────────────────────────────────────────────
  const locationNames = {};
  const namesBlock = (content.match(/LOCATION_NAMES\s*=\s*\{([^}]+)\}/) || [])[1] || '';
  const nameRe = /'([A-Z]{1,2}\d{1,3})'\s*=>\s*'([^']+)'/g;
  let nm;
  while ((nm = nameRe.exec(namesBlock)) !== null) locationNames[nm[1]] = nm[2];

  // ── HEXES ───────────────────────────────────────────────────────────────
  // Most games: HEXES = { ... }.freeze (constant)
  // Some games (e.g. 1824): def map_optional_hexes / def map_hexes (Ruby method)
  // We search for both forms; if neither is found we return an empty map.
  let hexesText = '';
  const _localVars = {}; // populated from method-local %w[] assignments (e.g. 1824)
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
        // Capture pre-hash text so we can extract method-local variable arrays.
        // e.g. 1824: plain_hexes = %w[...], one_town = %w[...] defined before the { hash }.
        const preHashText = content.substring(mMatch.index, mMatch.index + mMatch[0].length - 1);
        const localVarRe = /\b([a-z][a-z0-9_]*)\s*=\s*%w\[([^\]]+)\]/g;
        let lm;
        while ((lm = localVarRe.exec(preHashText)) !== null) {
          _localVars[lm[1]] = lm[2].trim().split(/\s+/);
        }

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

  // ── Module-level Ruby string constants ──────────────────────────────────────
  // Some games (e.g. 1824) define DSL code strings as named constants in the module
  // and reference them as values in the hex hash: e.g.  ['E12'] => WIEN
  // Multiline concatenation:  MINE_2 = 'city=...,loc:0;'\
  //                                    'path=a:1,b:_0,terminal:1'
  const _rubyConsts = {};
  {
    const cr = /\b([A-Z][A-Z0-9_]+)\s*=\s*('(?:[^'\\]|\\.)*'(?:\s*\\\s*\n[ \t]*'(?:[^'\\]|\\.)*')*)/g;
    let cm;
    while ((cm = cr.exec(content)) !== null) {
      const frags = cm[2].match(/'([^']*)'/g);
      if (frags) _rubyConsts[cm[1]] = frags.map(f => f.slice(1, -1)).join('');
    }
  }

  // ── Method-local variable arrays (populated above during method-form extraction)
  // _localVars is keyed by Ruby variable name → array of coord strings.

  // ── Pre-process hexesText: join Ruby string continuation lines ──────────────
  // 'str1'\       →  'str1str2'
  //         'str2'
  hexesText = hexesText.replace(/'\s*\\\s*\n[ \t]*'/g, '');

  const hexEntries = {}; // coord → { color, code, parsed }

  const colorsToImport = ['white', 'yellow', 'green', 'gray', 'red', 'brown', 'blue'];

  for (const color of colorsToImport) {
    const block = extractColorBlock(hexesText, color);
    if (!block) continue;

    // Match hex entries with any combination of:
    //   Key:   %w[coord1 coord2]  |  ['coord']  |  local_variable (e.g. one_town)
    //   Value: 'inline DSL code'  |  CONSTANT_NAME (e.g. TOWN, MINE_2)
    const pairRe = /(?:%w\[([^\]]+)\]|\['([^']+)'\]|([a-z][a-z0-9_]*))\s*=>\s*(?:'([^']*)'|([A-Z][A-Z0-9_]*))/g;
    let pm;
    while ((pm = pairRe.exec(block)) !== null) {
      // Resolve key → list of coord strings
      let coordList;
      if      (pm[1]) { coordList = pm[1].trim().split(/\s+/); }
      else if (pm[2]) { coordList = [pm[2]]; }
      else if (pm[3]) { coordList = _localVars[pm[3]]; if (!coordList?.length) continue; }
      // Resolve value → DSL code string
      const code = pm[4] !== undefined ? pm[4] : (_rubyConsts[pm[5]] || '');
      for (const coord of coordList) {
        hexEntries[coord] = { color, code };
      }
    }
  }

  // ── Grid bounds ─────────────────────────────────────────────────────────
  console.log(`[importRubyMap] hexEntries=${Object.keys(hexEntries).length} locationNames=${Object.keys(locationNames).length}`);
  let maxRow = 0, maxCol = 0, minRow = 0, minCol = 0, skippedCoords = 0;
  const maxRowPerCol = {}; // track per-column max row for killed-hex bounds
  const allCoords = [...new Set([...Object.keys(hexEntries), ...Object.keys(locationNames)])];

  // Helper: parse a Ruby hex coord string into {letterIdx, numPart}.
  // Handles single-letter (A-Z / a-z) and double-letter (AA-AZ) prefixes.
  // letterIdx: A=0, B=1, …, Z=25, AA=26, …, AZ=51 (tobymao LETTERS)
  //            a=-1, b=-2, … (tobymao NEGATIVE_LETTERS — used by 1849 "a12"-style coords)
  function parseCoordParts(coord) {
    const m = coord.match(/^([A-Za-z]{1,2})(\d{1,3})$/);
    if (!m) return null;
    const lp = m[1], np = parseInt(m[2]);
    const li = (lp.length === 1 && lp >= 'a')
      ? -(lp.charCodeAt(0) - 96)           // 'a'→-1, 'b'→-2, …
      : lp.length === 1
        ? lp.charCodeAt(0) - 65
        : 26 * (lp.charCodeAt(0) - 64) + (lp.charCodeAt(1) - 65);
    return { letterIdx: li, numPart: np };
  }

  // ── Detect coordinate parity ───────────────────────────────────────────────
  // coordParity=0: even-index cols (A,C,E…) use even row-numbers (2,4,6…) — e.g. 1889
  // coordParity=1: even-index cols (A,C,E…) use odd  row-numbers (1,3,5…) — e.g. 1830, 1846
  // We detect this by tallying which parity the even-letter columns actually use.
  let _evenColEven = 0, _evenColOdd = 0;
  if (!transposedAxes && orientation !== 'pointy') {
    for (const coord of allCoords) {
      const p = parseCoordParts(coord); if (!p) continue;
      if (p.letterIdx % 2 === 0) {
        if (p.numPart % 2 === 0) _evenColEven++; else _evenColOdd++;
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
  // Run for ALL pointy maps regardless of transposedAxes — pointy+transposed
  // (e.g. 18OEUKFR) still uses letter=row and needs the same parity detection.
  let _evenRowEven = 0, _evenRowOdd = 0;
  if (orientation === 'pointy') {
    for (const coord of allCoords) {
      const p = parseCoordParts(coord); if (!p) continue;
      if (p.letterIdx % 2 === 0) {
        if (p.numPart % 2 === 0) _evenRowEven++; else _evenRowOdd++;
      }
    }
  }
  const pointyStaggerParity = (orientation === 'pointy' && _evenRowEven > _evenRowOdd) ? 1 : 0;
  console.log(`[importRubyMap] pointyStaggerParity=${pointyStaggerParity} (evenRowEven=${_evenRowEven} evenRowOdd=${_evenRowOdd})`);

  // ── Eagerly update state.meta so hexId uses the correct keys during build ────
  // hexId() reads state.meta.orientation / coordParity / pointyStaggerParity at
  // call time.  Without this early update, hexId would use the *previous* map's
  // settings while building newHexes, storing hexes under wrong coord strings.
  // The upload handler sets these again after we return — that is idempotent.
  if (typeof state !== 'undefined') {
    state.meta.orientation          = orientation;
    state.meta.coordParity          = coordParity;
    state.meta.pointyStaggerParity  = pointyStaggerParity;
    state.meta.staggerParity        = transposedAxes ? 1 : coordParity;
  }

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
    // Support single-letter (A-Z / a-z) and double-letter (AA-AZ) prefixes.
    // Lowercase single letters encode negative indices (tobymao NEGATIVE_LETTERS):
    //   a=-1, b=-2, …  Used by 1849 "a12"-style coords.
    const coordMatch = coord.match(/^([A-Za-z]{1,2})(\d{1,3})$/);
    if (!coordMatch) return null;
    const letterPart = coordMatch[1];
    const numPart    = parseInt(coordMatch[2]);

    // Convert letter prefix to index (same formula as parseCoordParts):
    //   uppercase: A=0, B=1, …, Z=25, AA=26, …
    //   lowercase: a=-1, b=-2, … (negative)
    const letterIdx = (letterPart.length === 1 && letterPart >= 'a')
      ? -(letterPart.charCodeAt(0) - 96)
      : letterPart.length === 1
        ? letterPart.charCodeAt(0) - 65
        : 26 * (letterPart.charCodeAt(0) - 64) + (letterPart.charCodeAt(1) - 65);

    let col, row;
    if (transposedAxes && orientation !== 'pointy') {
      // Flat-top transposed (e.g. 1882 Saskatchewan):
      //   AXES={x:number, y:letter} on a flat map — letter=row, number=col.
      // col = numPart - 1  (1-based → 0-based)
      // row = letterIdx/2 for even cols, (letterIdx-1)/2 for odd cols
      col = numPart - 1;
      row = (col % 2 === 0) ? letterIdx / 2 : (letterIdx - 1) / 2;
    } else if (orientation === 'pointy') {
      // Pointy-top: letter=row, number encodes col with stagger.
      // Works for both AXES={x:letter,y:number} and AXES={x:number,y:letter} —
      // in both cases the letter prefix is the row indicator for pointy maps.
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
      col = letterIdx;
      const coordRow = numPart;
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
    if (!Number.isInteger(row) || !Number.isInteger(col)) return null;
    return { col, row };
  }

  for (const coord of allCoords) {
    const g = coordToGrid(coord);
    if (!g) { skippedCoords++; continue; }
    maxRow = Math.max(maxRow, g.row + 1);
    maxCol = Math.max(maxCol, g.col + 1);
    minRow = Math.min(minRow, g.row);
    minCol = Math.min(minCol, g.col);
    maxRowPerCol[g.col] = Math.max(maxRowPerCol[g.col] || 0, g.row + 1);
  }
  // Apply offset for any coords with negative row/col (e.g. 1861 "P0" → row=-1,
  // 1849 "a12" → col=-1).  Shift the whole grid so minimum row/col is 0.
  const rowOff = -minRow, colOff = -minCol;
  if (rowOff > 0 || colOff > 0) {
    maxRow += rowOff;
    maxCol += colOff;
    // Rebuild maxRowPerCol with adjusted column keys and row values
    const rawMRPC = { ...maxRowPerCol };
    for (const k of Object.keys(maxRowPerCol)) delete maxRowPerCol[k];
    for (const [c, v] of Object.entries(rawMRPC)) {
      maxRowPerCol[+c + colOff] = +v + rowOff;
    }
  }
  console.log(`[importRubyMap] bounds → maxRow=${maxRow} maxCol=${maxCol} rowOff=${rowOff} colOff=${colOff} skipped=${skippedCoords}`);

  // ── Build state.hexes ────────────────────────────────────────────────────
  const newHexes = {};

  for (const [coord, { color, code }] of Object.entries(hexEntries)) {
    const g = coordToGrid(coord);
    if (!g) { console.warn(`[importRubyMap] skipping ${coord} (non-integer grid)`); continue; }
    const key  = hexId(g.row + rowOff, g.col + colOff);
    const name = locationNames[coord] || '';

    // ── Blue ocean: no content → plain blue hex (not killed) ────────────────
    // killed=true would draw a black overlay; ocean tiles must show as blue.
    // Only the auto-filled boundary positions (grid-fill loop below) are killed.
    if (color === 'blue' && !code.trim()) {
      newHexes[key] = { bg: 'blue', static: true, terrain: '', terrainCost: 0,
                        tile: 0, rotation: 0, nodes: [], paths: [],
                        stubs: [], exits: [], borders: [], icons: [],
                        killed: false };
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

  // ── Parse TILES block if present ────────────────────────────────────────────
  const { manifest, customTiles } = parseTilesBlock(content);

  return { hexes: newHexes, rows: maxRow, cols: maxCol, orientation,
           staggerParity: transposedAxes ? 1 : coordParity, coordParity, pointyStaggerParity,
           maxRowPerCol, manifest, customTiles };
}

// ─── IMPORT ENTITIES.RB ───────────────────────────────────────────────────────
// Parses COMPANIES and CORPORATIONS arrays from an entities.rb file and
// populates state.privates (privates + concessions) and state.corpPacks.
//
// Detection rules (from IMPLEMENTATION_PLAN.md data model):
//   Concession  — COMPANIES entry with exchange ability { from: 'par' }
//   Assoc minor — CORPORATIONS entry with description ability matching /Associated minor for XYZ/

function _rbExtractArray(src, name) {
  const marker = name + ' =';
  const idx = src.indexOf(marker);
  if (idx === -1) return '';
  let i = src.indexOf('[', idx + marker.length);
  if (i === -1) return '';
  let depth = 0;
  while (i < src.length) {
    if (src[i] === '[') depth++;
    else if (src[i] === ']') { depth--; if (depth === 0) return src.slice(src.indexOf('[', idx + marker.length) + 1, i); }
    i++;
  }
  return '';
}

function _rbSplitHashes(content) {
  const hashes = [];
  let depth = 0, start = -1;
  for (let i = 0; i < content.length; i++) {
    if (content[i] === '{') { if (depth === 0) start = i; depth++; }
    else if (content[i] === '}') {
      depth--;
      if (depth === 0 && start !== -1) { hashes.push(content.slice(start, i + 1)); start = -1; }
    }
  }
  return hashes;
}

function _rbStr(str, key) {
  const m = str.match(new RegExp('\\b' + key + ':\\s*[\'"]([^\'"]*)[\'"]'));
  return m ? m[1] : null;
}

function _rbNum(str, key) {
  const m = str.match(new RegExp('\\b' + key + ':\\s*(-?\\d+)'));
  return m ? parseInt(m[1], 10) : null;
}

function _rbStrArr(str, key) {
  const wm = str.match(new RegExp('\\b' + key + ':\\s*%w\\[([^\\]]+)\\]'));
  if (wm) return wm[1].trim().split(/\s+/).filter(Boolean);
  const am = str.match(new RegExp('\\b' + key + ':\\s*\\[([^\\]]*)\\]'));
  if (am) { const ms = am[1].match(/['"]([^'"]+)['"]/g); return ms ? ms.map(s => s.slice(1, -1)) : []; }
  return [];
}

function _rbTokens(str) {
  const m = str.match(/\btokens:\s*\[([^\]]*)\]/);
  if (!m) return [0];
  return m[1].split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n));
}

function _rbAbilities(hashStr) {
  const abIdx = hashStr.indexOf('abilities:');
  if (abIdx === -1) return [];
  let i = hashStr.indexOf('[', abIdx);
  if (i === -1) return [];
  let depth = 0, start = i;
  while (i < hashStr.length) {
    if (hashStr[i] === '[') depth++;
    else if (hashStr[i] === ']') { depth--; if (depth === 0) break; }
    i++;
  }
  return _rbSplitHashes(hashStr.slice(start + 1, i)).map(h => {
    const ab = {};
    const type = _rbStr(h, 'type');       if (type)  ab.type        = type;
    const from = _rbStr(h, 'from');       if (from)  ab.from        = from;
    const otype = _rbStr(h, 'owner_type');if (otype) ab.owner_type  = otype;
    const desc = _rbStr(h, 'description');if (desc)  ab.description = desc;
    const corps = _rbStrArr(h, 'corporations'); if (corps.length) ab.corporations = corps;
    const hexes = _rbStrArr(h, 'hexes');        if (hexes.length) ab.hexes        = hexes;
    const disc  = _rbNum(h, 'discount');  if (disc !== null) ab.discount = disc;
    return ab;
  });
}

function _rbParseCompany(hashStr) {
  const sym      = _rbStr(hashStr, 'sym')        || '';
  const name     = _rbStr(hashStr, 'name')       || '';
  const value    = _rbNum(hashStr, 'value')      || 0;
  const revenue  = _rbNum(hashStr, 'revenue')    || 0;
  const color    = _rbStr(hashStr, 'color')      || '#666666';
  const textColor= _rbStr(hashStr, 'text_color') || '#ffffff';
  const abilities= _rbAbilities(hashStr);

  const exchAb  = abilities.find(a => a.type === 'exchange' && a.from === 'par');
  const isConc  = !!exchAb;

  const desc = _rbStr(hashStr, 'desc') || '';
  const priv = {
    id: _cpRandId('prv'),
    sym, name,
    cost: value, revenue,
    color, textColor,
    companyType: isConc ? 'concession' : 'private',
    closesOn: '', buyerType: 'any',
    ability: desc,
    abilities: isConc
      ? abilities.filter(a => a.type !== 'exchange' && a.type !== 'blocks_hexes_consent' && a.type !== 'blocks_hexes')
      : abilities,
  };

  if (isConc) {
    priv.linkedMajor  = (exchAb.corporations || [])[0] || '';
    const blockAb     = abilities.find(a => a.type === 'blocks_hexes_consent' || a.type === 'blocks_hexes');
    priv.blocksHexes  = blockAb ? (blockAb.hexes || []) : [];
    const discAb      = abilities.find(a => a.discount != null);
    priv.minBidAdjust = discAb ? -discAb.discount : 0;
  }

  return priv;
}

function _rbParseCorp(hashStr) {
  const sym         = _rbStr(hashStr, 'sym')          || '';
  const name        = _rbStr(hashStr, 'name')         || '';
  const type        = _rbStr(hashStr, 'type')         || 'minor';
  const color       = _rbStr(hashStr, 'color')        || '#ffffff';
  const textColor   = _rbStr(hashStr, 'text_color')   || '#000000';
  const coordinates = _rbStr(hashStr, 'coordinates')  || '';
  const city        = _rbNum(hashStr, 'city')         || 0;
  const floatPct    = _rbNum(hashStr, 'float_percent');
  const logo        = _rbStr(hashStr, 'logo')         || '';
  const tokens      = _rbTokens(hashStr);
  const abilities   = _rbAbilities(hashStr);

  const descAb = abilities.find(a => a.type === 'description' && a.description);
  let associatedMajor = null;
  if (descAb) {
    const m = descAb.description.match(/Associated minor for (\S+)/);
    if (m) associatedMajor = m[1];
  }

  const co = { id: _cpRandId('co'), sym, name, color, textColor, coordinates, city, logo, tokensOverride: tokens };
  if (floatPct !== null) co.floatPctOverride = floatPct;
  if (associatedMajor)   co.associatedMajor  = associatedMajor;
  return { co, type };
}

function importEntitiesRb(content) {
  // Normalize: join Ruby string-continuation lines, strip comments
  const src = content
    .replace(/'\s*\\\s*\n\s*'/g, '')
    .replace(/#[^\n]*/g, '');

  const privates = _rbSplitHashes(_rbExtractArray(src, 'COMPANIES'))
    .map(_rbParseCompany)
    .filter(p => !p.name.startsWith('MINOR:'));

  const corpsByType = {};
  _rbSplitHashes(_rbExtractArray(src, 'CORPORATIONS')).forEach(hashStr => {
    const { co, type } = _rbParseCorp(hashStr);
    if (!corpsByType[type]) corpsByType[type] = [];
    corpsByType[type].push(co);
  });

  const packs = Object.entries(corpsByType).map(([type, companies]) =>
    Object.assign({}, _packDefaults(type), {
      id:    'pk_' + Math.random().toString(36).slice(2, 9),
      type, companies,
      label: type.charAt(0).toUpperCase() + type.slice(1) + 's',
    })
  );

  return { privates, packs };
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
      state.meta.maxRowPerCol        = result.maxRowPerCol;
      // Tile manifest — overwrite only if the file had a TILES block
      if (Object.keys(result.manifest).length > 0) {
        state.manifest = result.manifest;
        if (!state.customTiles) state.customTiles = {};
        Object.assign(state.customTiles, result.customTiles);
        // Register game-specific tiles (X-series etc.) immediately so they render in
        // the manifest view.  customTiles format is { id: { count, color, code } }
        // where `code` is the DSL string.  _processEntry now accepts `code` as an
        // alias for `dsl` so we can pass customTiles directly.
        if (Object.keys(result.customTiles).length > 0) {
          TileRegistry.setEmbeddedTiles(result.customTiles);
        }
      }
      // Sync orientation select and dimension inputs in the toolbar/config panel
      syncOrientationSelect();
      syncDimInputs();
      // Reset pan so map is visible
      panX = 0; panY = 0; zoom = 1;
      render();
      autosave();
      const staticCount = Object.values(result.hexes).filter(h => h.static).length;
      const tileCount   = Object.keys(result.manifest).length;
      const tileMsg     = tileCount ? ` — ${tileCount} tiles` : '';
      updateStatus(`Imported ${result.orientation} map: ${result.rows}r × ${result.cols}c — ${staticCount} static hexes${tileMsg}`);
    } catch (err) {
      console.error('[importRubyMap] error:', err);
      alert('Import failed: ' + err.message);
    }
  };
  reader.readAsText(file);
  e.target.value = ''; // reset so same file can be re-imported
});

// ── Wire up Import Entities (.rb) ─────────────────────────────────────────────

document.getElementById('importEntitiesBtn').addEventListener('click', () => {
  document.getElementById('importEntitiesFile').click();
});

document.getElementById('importEntitiesFile').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    try {
      const { privates, packs } = importEntitiesRb(ev.target.result);

      state.privates = privates;
      if (!state.corpPacks) state.corpPacks = [];
      packs.forEach(newPack => {
        const xi = state.corpPacks.findIndex(p => p.type === newPack.type);
        if (xi !== -1) state.corpPacks[xi] = newPack;
        else state.corpPacks.push(newPack);
      });

      // Auto-select first private so detail panel opens immediately
      if (typeof _selectedPrivateIdx !== 'undefined' && privates.length) _selectedPrivateIdx = 0;
      if (typeof renderPrivatesCards   === 'function') renderPrivatesCards();
      if (typeof renderCorpsSection    === 'function') renderCorpsSection();
      if (typeof renderHomeCompanySelect === 'function') renderHomeCompanySelect();
      autosave();
      document.getElementById('fileMenu').style.display = 'none';

      const pCount = privates.length;
      const cCount = packs.reduce((s, p) => s + p.companies.length, 0);
      const concCount = privates.filter(p => p.companyType === 'concession').length;
      const abCount  = privates.reduce((s, p) => s + (p.abilities || []).length, 0);
      updateStatus(`Imported ${pCount} privates (${concCount} concessions, ${abCount} abilities) + ${cCount} corporations from ${file.name}`);
    } catch (err) {
      console.error('[importEntitiesRb] error:', err);
      alert('Entities import failed: ' + err.message);
    }
    e.target.value = '';
  };
  reader.readAsText(file);
});

// ── Stub handlers for not-yet-implemented import/export types ─────────────────

['importGameBtn', 'importMarketBtn',
 'exportEntitiesBtn', 'exportGameBtn', 'exportMarketBtn'].forEach(id => {
  const el = document.getElementById(id);
  if (el) el.addEventListener('click', () => {
    document.getElementById('fileMenu').style.display = 'none';
    updateStatus('Not yet implemented.');
  });
});