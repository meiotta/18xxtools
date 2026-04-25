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
    cityName: locationName || '',
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
        // Do NOT overwrite hex-level phaseRevenue / activePhases when this is
        // an offboard hex — the offboard= declaration already set those fields
        // and its phase-variable revenue (e.g. yellow_30|green_40|brown_60|gray_80)
        // must not be clobbered by the city's revenue:0.
        if (hex.feature !== 'offboard') {
          hex.phaseRevenue = phases;
          hex.activePhases = nodeActive;
        }
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
  let m;

  // Complex form: 'id' => { 'count' => N, 'color' => 'X', 'code' => '...' }
  // [^}]* is safe here because the inner hash values contain no braces.
  const complexRe = /'([^']+)'\s*=>\s*\{([^}]+)\}/g;
  while ((m = complexRe.exec(body)) !== null) {
    const id    = m[1];
    const inner = m[2];
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

  // Simple form: 'id' => integer
  // Strip complex-entry inner hashes first so we never match 'count' => N
  // that lives inside a complex entry's inner hash.
  const simpleBody = body.replace(/'[^']+'\s*=>\s*\{[^}]+\}/g, '');
  const simpleRe   = /'([^']+)'\s*=>\s*(\d+)/g;
  while ((m = simpleRe.exec(simpleBody)) !== null) {
    if (!manifest[m[1]]) manifest[m[1]] = parseInt(m[2]);
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

  // If this file was exported by 18xxtools it carries an EDITOR_GRID comment
  // with the original grid dimensions.  Use those as a minimum so that a
  // round-trip (export → import) restores the full grid even if most hexes
  // were killed (and therefore not written to the HEXES block).
  const _egMatch = content.match(/^#\s*EDITOR_GRID\s+rows=(\d+)\s+cols=(\d+)/m);
  const _editorRows = _egMatch ? parseInt(_egMatch[1]) : 0;
  const _editorCols = _egMatch ? parseInt(_egMatch[2]) : 0;
  if (_editorRows > 0) console.log(`[importRubyMap] EDITOR_GRID hint: ${_editorRows}r × ${_editorCols}c`);

  let maxRow = _editorRows, maxCol = _editorCols, minRow = 0, minCol = 0, skippedCoords = 0;
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
  let _evenRowEven = 0, _evenRowOdd = 0, _minEvenNumPart = Infinity;
  if (orientation === 'pointy') {
    for (const coord of allCoords) {
      const p = parseCoordParts(coord); if (!p) continue;
      if (p.letterIdx % 2 === 0) {
        if (p.numPart % 2 === 0) {
          _evenRowEven++;
          _minEvenNumPart = Math.min(_minEvenNumPart, p.numPart);
        } else _evenRowOdd++;
      }
    }
  }
  const pointyStaggerParity = (orientation === 'pointy' && _evenRowEven > _evenRowOdd) ? 1 : 0;
  // Detect even-row column base: most psp=1 games start even-row numParts at 2,
  // but some (e.g. 18OE) start at 0.  This drives coordToGrid's fallback formula
  // and hexId's inverse, so they must agree.
  const pointyEvenBase = (pointyStaggerParity === 1 && _minEvenNumPart === 0) ? 0 : 2;
  console.log(`[importRubyMap] pointyStaggerParity=${pointyStaggerParity} pointyEvenBase=${pointyEvenBase} (evenRowEven=${_evenRowEven} evenRowOdd=${_evenRowOdd})`);

  // Derive the actual column offsets for even / odd letter-rows.
  //   psp=1 standard : evenOffset=2 (A2,A4…), oddOffset=1 (B1,B3…)
  //   psp=1 18OE-style: evenOffset=0 (A0,A2…), oddOffset=1 (B1,B3…)
  //   psp=0 standard : evenOffset=1 (A1,A3…), oddOffset=2 (B2,B4…)
  // These are stored in state.meta so hexId() can invert the same formula.
  const pointyEvenOffset = (pointyStaggerParity === 1) ? pointyEvenBase : 1;
  const pointyOddOffset  = (pointyStaggerParity === 1) ? 1 : 2;

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
    state.meta.pointyEvenOffset     = pointyEvenOffset;
    state.meta.pointyOddOffset      = pointyOddOffset;
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
      // pointyEvenOffset / pointyOddOffset are pre-computed from the detected
      // coordinate base so that games like 18OE (A0,A2,… / B1,B3,…) work
      // correctly — the old hardcoded try-1-then-2 approach mapped A0 → col=-1.
      row = letterIdx;
      col = (letterIdx % 2 === 0)
        ? (numPart - pointyEvenOffset) / 2
        : (numPart - pointyOddOffset)  / 2;
      if (!Number.isInteger(col)) {
        // Fallback: swap even/odd offsets (handles unexpected parity mixtures)
        col = (letterIdx % 2 === 0)
          ? (numPart - pointyOddOffset)  / 2
          : (numPart - pointyEvenOffset) / 2;
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
          cityName: name || '',
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
           pointyEvenOffset, pointyOddOffset,
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
  let buyerType = 'any';
  if (/^CANNOT\s+BE\s+ACQUIRED/i.test(desc)) buyerType = 'no_acquire';
  else if (/^MAJOR\/MINOR[,\s]/i.test(desc)) buyerType = 'major_minor';
  else if (/^MAJOR[,\s]/i.test(desc))        buyerType = 'major_only';
  const priv = {
    id: _cpRandId('prv'),
    sym, name,
    cost: value, revenue,
    color, textColor,
    companyType: isConc ? 'concession' : 'private',
    closesOn: '', buyerType,
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
  const coordinates     = _rbStr(hashStr, 'coordinates')          || '';
  const destCoordinates = _rbStr(hashStr, 'destination_coordinates'); // null if absent
  const city            = _rbNum(hashStr, 'city')                  || 0;
  const floatPct        = _rbNum(hashStr, 'float_percent');
  const logo            = _rbStr(hashStr, 'logo')                  || '';
  const tokens          = _rbTokens(hashStr);
  const abilities       = _rbAbilities(hashStr);

  const descAb = abilities.find(a => a.type === 'description' && a.description);
  let associatedMajor = null;
  if (descAb) {
    const m = descAb.description.match(/Associated minor for (\S+)/);
    if (m) associatedMajor = m[1];
  }

  // Drop display-only abilities already consumed or derivable from other fields
  const CORP_ABILITY_DISCARD = new Set(['base', 'description']);
  const storedAbilities = abilities.filter(a => !CORP_ABILITY_DISCARD.has(a.type));

  const co = { id: _cpRandId('co'), sym, name, color, textColor, coordinates, city, logo, tokensOverride: tokens, abilities: storedAbilities };
  if (destCoordinates)   co.destinationCoordinates = destCoordinates;
  if (floatPct !== null) co.floatPctOverride        = floatPct;
  if (associatedMajor)   co.associatedMajor         = associatedMajor;
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

// ─── IMPORT GAME.RB ──────────────────────────────────────────────────────────
// Parses TRAINS and PHASES constants from a tobymao game.rb file.
// Returns { trains, phases } ready to merge into state.trains / state.phases.
//
// Source reference: lib/engine/game/g_1830/game.rb (TRAINS + PHASES)
//                   lib/engine/game/g_1822/game.rb (complex distance arrays,
//                                                   train_limit hashes, %i tiles)

function _rbDistField(hashStr) {
  // Check array-form FIRST: distance: [ ... ]
  // This must come before the scalar check so that a base train with an array
  // distance (e.g. 1822 L-train) doesn't accidentally pick up a scalar
  // distance: N from inside its own variants: [...] sub-hash.
  const di = hashStr.indexOf('distance:');
  if (di !== -1) {
    let peek = di + 9;
    while (peek < hashStr.length && /\s/.test(hashStr[peek])) peek++;
    if (hashStr[peek] === '[') {
      let depth = 0, ei = peek;
      while (ei < hashStr.length) {
        if (hashStr[ei] === '[') depth++;
        else if (hashStr[ei] === ']') { depth--; if (depth === 0) break; }
        ei++;
      }
      const flat = hashStr.slice(peek + 1, ei).replace(/\n/g, ' ');
      let cityPay = 0, townPay = 0;
      const re = /'nodes'\s*=>\s*\[([^\]]*)\][^}]*?'pay'\s*=>\s*(\d+)/g;
      let m;
      while ((m = re.exec(flat)) !== null) {
        if (m[1].includes('city'))       cityPay = parseInt(m[2], 10);
        else if (m[1].includes('town'))  townPay = parseInt(m[2], 10);
      }
      if (townPay > 0) return { distType: 'nm', n: Math.max(cityPay, 1), m: townPay };
      return { distType: 'n', n: Math.max(cityPay, 1) };
    }
  }
  // Scalar distance: N (≥ 99 means unlimited — covers both distance:99 and distance:999)
  const n = _rbNum(hashStr, 'distance');
  if (n !== null) {
    if (n >= 99) return { distType: 'u', isExpress: false, multiplier: 1 };
    return { distType: 'n', n };
  }
  return { distType: 'n', n: 2 };
}

function _rbTrainEvents(hashStr) {
  const idx = hashStr.indexOf('events:');
  if (idx === -1) return [];
  let bi = hashStr.indexOf('[', idx + 7);
  if (bi === -1) return [];
  let depth = 0, ei = bi;
  while (ei < hashStr.length) {
    if (hashStr[ei] === '[') depth++;
    else if (hashStr[ei] === ']') { depth--; if (depth === 0) break; }
    ei++;
  }
  const sub = hashStr.slice(bi + 1, ei);
  const events = [];
  const re = /'type'\s*=>\s*'([^']+)'/g;
  let m;
  while ((m = re.exec(sub)) !== null) events.push({ type: m[1] });
  return events;
}

function _rbParseTrain(hashStr) {
  const label  = _rbStr(hashStr, 'name')  || '';
  const cost   = _rbNum(hashStr, 'price') || 0;
  const count  = _rbNum(hashStr, 'num')   || 0;

  // Restrict distance-sensitive fields to the portion of the hash before any
  // variants: key so that a base train (e.g. 1822 '7' with an E-variant) does
  // not accidentally inherit the variant's distance:99 / multiplier:2.
  const topLevel    = hashStr.split(/\bvariants:/)[0];
  const rustsOnName = _rbStr(topLevel, 'rusts_on');
  const mult        = _rbNum(topLevel, 'multiplier');
  const events      = _rbTrainEvents(hashStr);
  const id          = 't_' + Math.random().toString(36).substr(2, 6);
  const distFields  = _rbDistField(topLevel);

  // multiplier trains (e.g. 1822 E-train: distance:99, multiplier:2) → unlimited express
  if (mult !== null && mult > 1) {
    distFields.distType   = 'u';
    distFields.isExpress  = true;
    distFields.multiplier = mult;
  }
  const tr = Object.assign(
    { id, label, cost, count, rusts: !!rustsOnName, rustsOn: rustsOnName || '', phase: '' },
    distFields
  );
  if (events.length) tr.events = events;
  return tr;
}

function _rbParsePhase(hashStr) {
  const name = _rbStr(hashStr, 'name') || '';

  // on: can be absent, empty string, a quoted name, or %w[...] array
  const onStr = _rbStr(hashStr, 'on');
  let onTrain = onStr !== null ? onStr : '';
  if (!onTrain) {
    const arr = _rbStrArr(hashStr, 'on');
    if (arr.length) onTrain = arr[0];
  }

  // train_limit: integer or { minor: N, major: N } — take major (or the integer)
  let limit = _rbNum(hashStr, 'train_limit');
  if (limit === null) {
    const m = hashStr.match(/\btrain_limit:\s*\{[^}]*\bmajor:\s*(\d+)/);
    limit = m ? parseInt(m[1], 10) : 4;
  }

  // tiles: last recognized color in [:yellow,:green,...] or %i[...] or %w[...]
  // tobymao uses 'gray'; editor state uses 'grey' — normalise on import.
  const COLOR_ORDER = ['yellow', 'green', 'brown', 'gray', 'grey'];
  let tiles = 'yellow';
  const tm = hashStr.match(/\btiles:\s*(?:%[iw]\[([^\]]+)\]|\[([^\]]+)\])/);
  if (tm) {
    const raw = (tm[1] || tm[2] || '').replace(/[:'"]/g, ' ');
    const cols = raw.trim().split(/\s+/).filter(Boolean);
    for (let i = cols.length - 1; i >= 0; i--) {
      if (COLOR_ORDER.includes(cols[i])) { tiles = cols[i] === 'gray' ? 'grey' : cols[i]; break; }
    }
  }

  const ors    = _rbNum(hashStr, 'operating_rounds') || 2;
  const status = _rbStrArr(hashStr, 'status');
  const PHASE_COLORS = { yellow: '#d4a017', green: '#3a843a', brown: '#8b5e3c', grey: '#777777' };

  const ph = { name, onTrain, limit, tiles, ors, color: PHASE_COLORS[tiles] || '#d4a017' };
  if (status.length) ph.status = status;
  return ph;
}

// ── Mechanics constant parsers ────────────────────────────────────────────────
// Each _rbConst* function extracts a single top-level constant from stripped src.
// Returns null when the constant is absent so callers can skip vs. default.

// NAME = :symbol → 'symbol'
function _rbConstSym(src, name) {
  const m = src.match(new RegExp(`^[ \\t]*${name}\\s*=\\s*:(\\w+)`, 'm'));
  return m ? m[1] : null;
}

// NAME = true | false → boolean (null when absent)
function _rbConstBool(src, name) {
  const m = src.match(new RegExp(`^[ \\t]*${name}\\s*=\\s*(true|false)(?:[^\\w]|$)`, 'm'));
  if (!m) return null;
  return m[1] === 'true';
}

// NAME = 12_000 → 12000 (null when absent)
function _rbConstInt(src, name) {
  const m = src.match(new RegExp(`^[ \\t]*${name}\\s*=\\s*([\\d_]+)(?:[^\\w]|$)`, 'm'));
  return m ? parseInt(m[1].replace(/_/g, ''), 10) : null;
}

// NAME = 'string' or "string" → string (null when absent)
function _rbConstStr(src, name) {
  const m = src.match(new RegExp(`^[ \\t]*${name}\\s*=\\s*['"]([^'"]*?)['"]`, 'm'));
  return m ? m[1] : null;
}

// NAME = %w[A B C].freeze → ['A', 'B', 'C']  (empty array when constant absent or empty)
// Source: lib/engine/game/g_1822/game.rb:530 (PRIVATE_MAIL_CONTRACTS = %w[P6 P7].freeze)
function _rbConstWordArray(src, name) {
  const m = src.match(new RegExp(`^[ \\t]*${name}\\s*=\\s*%w\\[([^\\]]*)\\]`, 'm'));
  if (!m) return [];
  return m[1].trim().split(/\s+/).filter(Boolean);
}

// NAME = { 3 => 100, 4 => 80 }.freeze → { '3': 100, '4': 80 }
// Handles integer-keyed, integer-value hashes (STARTING_CASH, CERT_LIMIT).
function _rbConstIntHash(src, name) {
  const re = new RegExp(`^[ \\t]*${name}\\s*=\\s*\\{`, 'm');
  const start = re.exec(src);
  if (!start) return null;
  const inner = _rbExtractBraces(src, start.index + start[0].length - 1);
  if (!inner) return null;
  const result = {};
  const pair = /(\d+)\s*=>\s*(\d+)/g;
  let m;
  while ((m = pair.exec(inner)) !== null) result[m[1]] = parseInt(m[2], 10);
  return Object.keys(result).length ? result : null;
}

// NAME = { bank: :full_or, bankrupt: :immediate }.freeze
// Handles symbol-key → symbol-value hashes (GAME_END_CHECK).
// Accepts both colon-key `key: :val` and hashrocket `:key => :val` forms.
function _rbConstSymSymHash(src, name) {
  const re = new RegExp(`^[ \\t]*${name}\\s*=\\s*\\{`, 'm');
  const start = re.exec(src);
  if (!start) return null;
  const inner = _rbExtractBraces(src, start.index + start[0].length - 1);
  if (!inner) return null;
  const result = {};
  let m;
  const reColon = /(\w+):\s*:(\w+)/g;
  while ((m = reColon.exec(inner)) !== null) result[m[1]] = m[2];
  const reArrow = /:(\w+)\s*=>\s*:(\w+)/g;
  while ((m = reArrow.exec(inner)) !== null) result[m[1]] = m[2];
  return Object.keys(result).length ? result : null;
}

// NAME = [{ lay: true, upgrade: true, cost: 0 }].freeze → slot array
function _rbConstTileLays(src, name) {
  const content = _rbExtractArray(src, name);
  if (!content) return null;
  const slots = _rbSplitHashes(content).map(h => {
    const slot = {};
    const layM = h.match(/\blay:\s*(true|false|:[\w]+)/);
    if (layM) {
      if      (layM[1] === 'true')  slot.lay = true;
      else if (layM[1] === 'false') slot.lay = false;
      else                          slot.lay = layM[1].slice(1);
    } else { slot.lay = true; }
    const upgM = h.match(/\bupgrade:\s*(true|false)/);
    slot.upgrade = upgM ? upgM[1] === 'true' : true;
    const costM = h.match(/\bcost:\s*(\d+)/);
    if (costM) slot.cost = parseInt(costM[1], 10);
    const ucM = h.match(/\bupgrade_cost:\s*(\d+)/);
    if (ucM) slot.upgrade_cost = parseInt(ucM[1], 10);
    if (/\bcannot_reuse_same_hex:\s*true/.test(h)) slot.cannot_reuse_same_hex = true;
    return slot;
  });
  return slots.length ? slots : null;
}

// Walk a {…} block starting at the opening brace index, return inner content.
function _rbExtractBraces(src, openIdx) {
  let depth = 0, i = openIdx;
  while (i < src.length) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) return src.slice(openIdx + 1, i); }
    i++;
  }
  return null;
}

// ── Main mechanics parser ─────────────────────────────────────────────────────
// Reads all supported constants from a stripped game.rb string.
// Returns a partial mechanics object — only keys that were explicitly present in
// the file.  Missing keys are left for the caller to fill from defaultMechanics().
function _rbParseMechanics(src) {
  const m = {};

  // ── Bank & Players ──────────────────────────────────────────────────────────
  const bank = _rbConstInt(src, 'BANK_CASH');
  if (bank !== null) m.bankCash = bank;

  const currency = _rbConstStr(src, 'CURRENCY_FORMAT_STR');
  if (currency !== null) m.currency = currency;

  const startingCash = _rbConstIntHash(src, 'STARTING_CASH');
  if (startingCash) {
    m.startingCash = startingCash;
    // Derive player count range from the hash keys
    const counts = Object.keys(startingCash).map(Number).filter(n => n > 0);
    if (counts.length) {
      m.minPlayers = Math.min(...counts);
      m.maxPlayers = Math.max(...counts);
    }
  }

  const certLimit = _rbConstIntHash(src, 'CERT_LIMIT');
  if (certLimit) m.certLimit = certLimit;

  // ── Corporation Rules ───────────────────────────────────────────────────────
  const homeTokenTiming = _rbConstSym(src, 'HOME_TOKEN_TIMING');
  if (homeTokenTiming) m.homeTokenTiming = homeTokenTiming;

  const marketShareLimit = _rbConstInt(src, 'MARKET_SHARE_LIMIT');
  if (marketShareLimit !== null) m.marketShareLimit = marketShareLimit;

  const trackRestriction = _rbConstSym(src, 'TRACK_RESTRICTION');
  if (trackRestriction) m.trackRestriction = trackRestriction;

  const bankruptcyAllowed = _rbConstBool(src, 'BANKRUPTCY_ALLOWED');
  if (bankruptcyAllowed !== null) m.bankruptcyAllowed = bankruptcyAllowed;

  const bankruptcyEndsGameAfter = _rbConstSym(src, 'BANKRUPTCY_ENDS_GAME_AFTER');
  if (bankruptcyEndsGameAfter) m.bankruptcyEndsGameAfter = bankruptcyEndsGameAfter;

  // ── Stock Round ─────────────────────────────────────────────────────────────
  const sellBuyOrder = _rbConstSym(src, 'SELL_BUY_ORDER');
  if (sellBuyOrder) m.sellBuyOrder = sellBuyOrder;

  const sellMovement = _rbConstSym(src, 'SELL_MOVEMENT');
  if (sellMovement) m.sellMovement = sellMovement;

  const poolShareDrop = _rbConstSym(src, 'POOL_SHARE_DROP');
  if (poolShareDrop) m.poolShareDrop = poolShareDrop;

  const mustSellInBlocks = _rbConstBool(src, 'MUST_SELL_IN_BLOCKS');
  if (mustSellInBlocks !== null) m.mustSellInBlocks = mustSellInBlocks;

  const sellAfter = _rbConstSym(src, 'SELL_AFTER');
  if (sellAfter) m.sellAfter = sellAfter;

  const soldOutTopRowMovement = _rbConstSym(src, 'SOLD_OUT_TOP_ROW_MOVEMENT');
  if (soldOutTopRowMovement) m.soldOutTopRowMovement = soldOutTopRowMovement;

  // ── Operating Round ─────────────────────────────────────────────────────────
  const mustBuyTrain = _rbConstSym(src, 'MUST_BUY_TRAIN');
  if (mustBuyTrain) m.mustBuyTrain = mustBuyTrain;

  const allowRemovingTowns = _rbConstBool(src, 'ALLOW_REMOVING_TOWNS');
  if (allowRemovingTowns !== null) m.allowRemovingTowns = allowRemovingTowns;

  // TILE_LAYS family
  const tileLays      = _rbConstTileLays(src, 'TILE_LAYS');
  const majorTileLays = _rbConstTileLays(src, 'MAJOR_TILE_LAYS');
  const minorTileLays = _rbConstTileLays(src, 'MINOR_TILE_LAYS');
  if (tileLays || majorTileLays || minorTileLays) {
    m.tileLays = {};
    if (tileLays) m.tileLays.default = tileLays;
    if (majorTileLays || minorTileLays) {
      m.tileLays.byType = {};
      if (majorTileLays) m.tileLays.byType.major = majorTileLays;
      if (minorTileLays) m.tileLays.byType.minor = minorTileLays;
    }
  }

  // ── Emergency Buy ───────────────────────────────────────────────────────────
  const ebuyFromOthers = _rbConstSym(src, 'EBUY_FROM_OTHERS');
  if (ebuyFromOthers) m.ebuyFromOthers = ebuyFromOthers;

  const ebuyDepotCheapest = _rbConstBool(src, 'EBUY_DEPOT_TRAIN_MUST_BE_CHEAPEST');
  if (ebuyDepotCheapest !== null) m.ebuyDepotCheapest = ebuyDepotCheapest;

  const mustIssueBeforeEbuy = _rbConstBool(src, 'MUST_EMERGENCY_ISSUE_BEFORE_EBUY');
  if (mustIssueBeforeEbuy !== null) m.mustIssueBeforeEbuy = mustIssueBeforeEbuy;

  const ebuyOwnerMustHelp = _rbConstBool(src, 'EBUY_OWNER_MUST_HELP');
  if (ebuyOwnerMustHelp !== null) m.ebuyOwnerMustHelp = ebuyOwnerMustHelp;

  const ebuyCanSellShares = _rbConstBool(src, 'EBUY_CAN_SELL_SHARES');
  if (ebuyCanSellShares !== null) m.ebuyCanSellShares = ebuyCanSellShares;

  const ebuyPresSwap = _rbConstBool(src, 'EBUY_PRES_SWAP');
  if (ebuyPresSwap !== null) m.ebuyPresSwap = ebuyPresSwap;

  // EBUY_CAN_TAKE_PLAYER_LOAN is false | :after_sell | :no_sell (true unsupported in UI)
  const loanSym  = _rbConstSym(src,  'EBUY_CAN_TAKE_PLAYER_LOAN');
  const loanBool = _rbConstBool(src, 'EBUY_CAN_TAKE_PLAYER_LOAN');
  if (loanSym)                    m.ebuyCanTakePlayerLoan = loanSym;  // :after_sell | :no_sell
  else if (loanBool === false)    m.ebuyCanTakePlayerLoan = 'false';  // explicit false

  const loanRate = _rbConstInt(src, 'PLAYER_LOAN_INTEREST_RATE');
  if (loanRate !== null) m.playerLoanInterestRate = loanRate;

  const loanPenalty = _rbConstInt(src, 'PLAYER_LOAN_ENDGAME_PENALTY');
  if (loanPenalty !== null) m.playerLoanEndgamePenalty = loanPenalty;

  // ── Game End ────────────────────────────────────────────────────────────────
  const gecRaw = _rbConstSymSymHash(src, 'GAME_END_CHECK');
  if (gecRaw) {
    // Known triggers with their editor-default timing values
    const GEC_DEFAULTS = {
      bank:         'full_or',
      bankrupt:     'immediate',
      stock_market: 'current_or',
      all_closed:   'immediate',
      final_train:  'one_more_full_or_set',
      final_round:  'one_more_full_or_set',
      final_or_set: 'one_more_full_or_set',
    };
    m.gameEndCheck = {};
    for (const [key, defTiming] of Object.entries(GEC_DEFAULTS)) {
      m.gameEndCheck[key] = gecRaw[key]
        ? { enabled: true,  timing: gecRaw[key] }
        : { enabled: false, timing: defTiming };
    }
  }

  console.log(`[importGameRb] parsed mechanics: ${Object.keys(m).join(', ')}`);
  return m;
}

function importGameRb(content) {
  const src = content
    .replace(/'\s*\\\s*\n\s*'/g, '')
    .replace(/#[^\n]*/g, '');

  const trainHashes = _rbSplitHashes(_rbExtractArray(src, 'TRAINS'));
  const trains = [];

  trainHashes.forEach(hashStr => {
    const tr = _rbParseTrain(hashStr);
    if (tr.label) trains.push(tr);

    // Expand variants as sibling trains (e.g. 1822 L-train → 2-variant)
    const vi = hashStr.indexOf('variants:');
    if (vi === -1) return;
    let bi = hashStr.indexOf('[', vi + 9);
    if (bi === -1) return;
    let depth = 0, ei = bi;
    while (ei < hashStr.length) {
      if (hashStr[ei] === '[') depth++;
      else if (hashStr[ei] === ']') { depth--; if (depth === 0) break; }
      ei++;
    }
    _rbSplitHashes(hashStr.slice(bi + 1, ei)).forEach(vh => {
      const vtr = _rbParseTrain(vh);
      if (vtr.label) trains.push(vtr);
    });
  });

  const phases = _rbSplitHashes(_rbExtractArray(src, 'PHASES'))
    .map(_rbParsePhase)
    .filter(p => p.name);

  // ── Cross-reference resolution ────────────────────────────────────────────
  // Step 1: train.phase ← phase.name where phase.onTrain (still a name) === train.label
  trains.forEach(tr => {
    const ph = phases.find(p => p.onTrain === tr.label);
    if (ph) tr.phase = ph.name;
  });

  // Step 2: train.rustsOn: name string → target train's id
  trains.forEach(tr => {
    if (!tr.rustsOn) return;
    const target = trains.find(t => t.label === tr.rustsOn);
    if (target) tr.rustsOn = target.id;
    else { tr.rusts = false; tr.rustsOn = ''; }
  });

  // Step 3: phase.onTrain: name string → train id (must run after Step 1)
  phases.forEach(ph => {
    if (!ph.onTrain) return;
    const target = trains.find(t => t.label === ph.onTrain);
    ph.onTrain = target ? target.id : '';
  });

  // ── Step 4: @company_trains linkage ───────────────────────────────────────
  // Source: lib/engine/game/g_1822/game.rb init_company_trains method.
  // Pattern: @company_trains['SYM'] = find_and_remove_train_by_id('LABEL-N'[, buyable: false])
  // Train ID format is always LABEL-N where N is the 0-based slot index.
  // We attach grantedBy: [{sym, name, buyable}] to the train object so
  // the trains panel can group and label private company trains separately.
  const companyTrainLinks = _rbParseCompanyTrains(src);
  if (companyTrainLinks.length) {
    const byLabel = {};
    companyTrainLinks.forEach(lk => {
      (byLabel[lk.trainLabel] = byLabel[lk.trainLabel] || []).push(lk);
    });
    trains.forEach(tr => {
      const links = byLabel[tr.label];
      if (!links || !links.length) return;
      links.sort((a, b) => a.trainIndex - b.trainIndex);
      tr.grantedBy = links.map(lk => ({
        sym:     lk.privateSym,
        name:    null,   // resolved by _resolveGrantedByNames() below
        buyable: lk.buyable,
      }));
      // privateOnly: every train instance is locked to a private (none from open depot)
      tr.privateOnly = (tr.count !== null) &&
                       (tr.grantedBy.length >= (tr.count || 1)) &&
                       tr.grantedBy.every(g => !g.buyable);
    });
  }

  // Best-effort name fill — may leave names null when entities not yet imported.
  // The entities import wire-up calls _resolveGrantedByNames() after setting
  // state.privates, which covers the game.rb-first workflow.
  _resolveGrantedByNames(trains);

  // ── Step 5: PRIVATE_MAIL_CONTRACTS → priv.mailContract ──────────────────
  // Source: lib/engine/game/g_1822/game.rb:530
  //   PRIVATE_MAIL_CONTRACTS = %w[P6 P7].freeze
  // Source: lib/engine/game/g_1822/game.rb:1831 mail_contract_bonus
  //   subsidy = (first_stop + last_stop) / 2  → formula: 'first_last_half'
  // Back-populates state.privates[] so Jenny's panel can display the toggle.
  // Runs after entities.rb import; no-ops silently if privates not yet loaded.
  const mailSyms = _rbConstWordArray(src, 'PRIVATE_MAIL_CONTRACTS');
  if (mailSyms.length && typeof state !== 'undefined' && state.privates) {
    state.privates.forEach(function(priv) {
      const sym = priv.sym || priv.abbr || '';
      if (mailSyms.includes(sym)) {
        priv.mailContract = { enabled: true, formula: 'first_last_half' };
      }
    });
  }

  const mechanics = _rbParseMechanics(src);

  return { trains, phases, mechanics };
}

// Parses all @company_trains[...] = find_and_remove_train_by_id(...) assignments
// from a game.rb source string (comments already stripped by caller).
// Returns array of { privateSym, trainLabel, trainIndex, buyable }.
function _rbParseCompanyTrains(src) {
  const result = [];
  // Regex handles both quoted key styles and optional buyable: false argument.
  const re = /@company_trains\[['"]([^'"]+)['"]\]\s*=\s*find_and_remove_train_by_id\(['"]([^'"]+)['"](?:[^)]*\bbuyable:\s*(false|true))?/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    const privateSym = m[1];
    const trainId    = m[2];                    // e.g. '2P-0', 'P+-1', 'LP-0'
    const buyable    = (m[3] !== 'false');      // default true when arg is absent
    // Train ID is always LABEL-N — split on the last hyphen-followed-by-digits
    const idM = trainId.match(/^(.+)-(\d+)$/);
    if (!idM) continue;
    result.push({ privateSym, trainLabel: idM[1], trainIndex: parseInt(idM[2], 10), buyable });
  }
  return result;
}

// Fills null name entries in any tr.grantedBy arrays by looking up each sym
// in the supplied privates list (defaults to state.privates when omitted).
// Names are a snapshot — if a private is renamed after import, use g.name || g.sym
// for display (sym is the stable identifier). This should NOT be hooked into the
// Companies panel save path; Evan's display code already has the g.name || g.sym
// fallback.
function _resolveGrantedByNames(trains, privates) {
  const privList = privates || (typeof state !== 'undefined' && state.privates) || [];
  (trains || (typeof state !== 'undefined' && state.trains) || []).forEach(tr => {
    if (!tr.grantedBy) return;
    tr.grantedBy.forEach(g => {
      if (g.name) return; // already resolved — don't overwrite
      const priv = privList.find(p => p.sym === g.sym);
      if (priv) g.name = priv.name;
    });
  });
}

// ── Wire up the Import Map button ─────────────────────────────────────────────

document.getElementById('importMapBtn').addEventListener('click', () => {
  document.getElementById('importMapFile').click();
});

// ── Tile collision dialog ─────────────────────────────────────────────────────
// Shows a modal when embedded tiles from a map.rb conflict with built-in pack
// tiles.  Three actions are available per collision:
//
//   Swap         — remap hex refs to a pack tile with matching DSL (discards
//                  the embedded definition; only available when suggestedPackId
//                  is a *different* pack tile, i.e. orange rows).
//   Build as custom — remap hex refs to a new 9000+ custom tile ID and keep
//                  the embedded DSL alive under that ID (available for all
//                  non-green rows; pre-allocates the ID so the user sees it).
//   Neither      — pack tile wins silently (embedded def is ignored).
//
// Swap and Build-as-custom are mutually exclusive per collision row.
//
// onApply(swaps, buildAsCustom) is called after the user confirms.
//   swaps         = { [oldId]: packId }     — discard embedded, use pack tile
//   buildAsCustom = { [oldId]: newCustomId } — keep embedded under new ID
function _showTileCollisionDialog(collisions, onApply) {
  // Pre-allocate custom IDs for every non-green collision so the user sees
  // the actual ID they'll get before confirming.
  let nextCustNum = parseInt(TileRegistry.nextCustomId(), 10);
  const prealloc = {}; // oldId → pre-allocated custom ID string
  for (const { id, sameDefinition } of collisions) {
    if (!sameDefinition) prealloc[id] = String(nextCustNum++);
  }

  // ── Build overlay ──────────────────────────────────────────────────────────
  const overlay = document.createElement('div');
  overlay.style.cssText = [
    'position:fixed;inset:0;z-index:9999',
    'background:rgba(0,0,0,0.72)',
    'display:flex;align-items:center;justify-content:center',
  ].join(';');

  const modal = document.createElement('div');
  modal.style.cssText = [
    'background:#1e1e1e;color:#ddd;font-family:monospace;font-size:13px',
    'border:1px solid #555;border-radius:6px',
    'padding:20px 24px;max-width:580px;width:90%',
    'max-height:80vh;overflow-y:auto',
    'box-shadow:0 8px 32px rgba(0,0,0,0.7)',
  ].join(';');

  modal.innerHTML = `
    <div style="font-size:15px;font-weight:bold;color:#f0c040;margin-bottom:14px">
      ⚠ Tile import collision${collisions.length > 1 ? 's' : ''}
    </div>
    <div style="color:#aaa;margin-bottom:16px;font-size:12px">
      These tiles in your map conflict with built-in pack tiles.<br>
      Choose an action for each — or do nothing and the pack version will render.
    </div>
  `;

  // pending[id] = { type: 'swap'|'custom', newId }  or absent = no action
  const pending = {};

  for (const col of collisions) {
    const { id, sameDefinition, suggestedPackId } = col;
    const custId = prealloc[id]; // undefined when sameDefinition

    const borderColor = sameDefinition ? '#4caf50'
      : (suggestedPackId && suggestedPackId !== id) ? '#ff9800' : '#f44336';

    const row = document.createElement('div');
    row.style.cssText = `margin-bottom:14px;padding:10px 12px;background:#2a2a2a;border-radius:4px;border-left:3px solid ${borderColor}`;

    // ── Header line ──
    let headerHtml = `<div style="margin-bottom:6px"><span style="color:#fff;font-weight:bold">Tile #${id}</span> `;
    if (sameDefinition) {
      headerHtml += `<span style="color:#4caf50">✓ identical to pack tile #${id}</span>`;
    } else if (suggestedPackId && suggestedPackId !== id) {
      headerHtml += `<span style="color:#ff9800">⚠ your DSL matches pack tile #${suggestedPackId} (not #${id})</span>`;
    } else {
      headerHtml += `<span style="color:#f44336">✗ differs from pack tile #${id}, no pack match found</span>`;
    }
    headerHtml += '</div>';

    // ── Description line ──
    let descHtml = '<div style="color:#888;font-size:11px;margin-bottom:8px">';
    if (sameDefinition) {
      descHtml += 'Safe collision — pack tile renders identically. No action needed.';
    } else if (suggestedPackId && suggestedPackId !== id) {
      descHtml += `Your map's definition is the same as pack tile <strong style="color:#ccc">#${suggestedPackId}</strong>. Pack tile #${id} will render instead unless you act.`;
    } else {
      descHtml += `Pack tile #${id} wins by default; your map's definition is silently ignored.`;
    }
    descHtml += '</div>';

    // ── Action buttons (not shown for green / safe collisions) ──
    let btnHtml = '';
    if (!sameDefinition) {
      btnHtml = '<div style="display:flex;gap:8px;flex-wrap:wrap">';
      if (suggestedPackId && suggestedPackId !== id) {
        btnHtml += `<button data-id="${id}" data-action="swap" data-new="${suggestedPackId}"
          class="col-action-btn"
          style="padding:4px 10px;background:#555;color:#ccc;border:none;border-radius:3px;cursor:pointer;font-size:12px">
          Swap → pack #${suggestedPackId}
        </button>`;
      }
      btnHtml += `<button data-id="${id}" data-action="custom" data-new="${custId}"
        class="col-action-btn"
        style="padding:4px 10px;background:#555;color:#ccc;border:none;border-radius:3px;cursor:pointer;font-size:12px">
        Build as custom #${custId}
      </button>`;
      btnHtml += `<span class="col-status-${id}" style="font-size:11px;color:#888;align-self:center"></span>`;
      btnHtml += '</div>';
    }

    row.innerHTML = headerHtml + descHtml + btnHtml;
    modal.appendChild(row);
  }

  // ── Button toggle logic — Swap and Build-as-custom are mutually exclusive ──
  const BTN_IDLE    = '#555';
  const BTN_ACTIVE  = '#337733';

  modal.querySelectorAll('.col-action-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id     = btn.dataset.id;
      const action = btn.dataset.action; // 'swap' | 'custom'
      const newId  = btn.dataset.new;
      const status = modal.querySelector(`.col-status-${id}`);

      // Sibling buttons for this collision row
      const siblings = modal.querySelectorAll(`.col-action-btn[data-id="${id}"]`);

      if (pending[id] && pending[id].type === action) {
        // Toggle off — deactivate this button
        delete pending[id];
        siblings.forEach(b => { b.style.background = BTN_IDLE; b.style.color = '#ccc'; });
        if (status) status.textContent = '';
      } else {
        // Activate this button, deactivate all others for this row
        pending[id] = { type: action, newId };
        siblings.forEach(b => {
          b.style.background = b === btn ? BTN_ACTIVE : BTN_IDLE;
          b.style.color = b === btn ? '#fff' : '#ccc';
        });
        if (status) {
          status.textContent = action === 'swap'
            ? `→ hexes will reference pack #${newId}`
            : `→ hexes will reference custom #${newId}`;
        }
      }
    });
  });

  // ── Footer ────────────────────────────────────────────────────────────────
  const footer = document.createElement('div');
  footer.style.cssText = 'margin-top:18px;display:flex;gap:10px;justify-content:flex-end';

  const dismissBtn = document.createElement('button');
  dismissBtn.textContent = 'Continue (pack wins)';
  dismissBtn.style.cssText = 'padding:6px 16px;background:#444;color:#ddd;border:none;border-radius:4px;cursor:pointer;font-size:13px';
  dismissBtn.addEventListener('click', () => {
    overlay.remove();
    onApply({}, {});
  });

  const applyBtn = document.createElement('button');
  applyBtn.textContent = 'Apply & Continue';
  applyBtn.style.cssText = 'padding:6px 16px;background:#2a6a2a;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:13px';
  applyBtn.addEventListener('click', () => {
    const swaps = {}, buildAsCustom = {};
    for (const [id, { type, newId }] of Object.entries(pending)) {
      if (type === 'swap')   swaps[id]         = newId;
      if (type === 'custom') buildAsCustom[id] = newId;
    }
    overlay.remove();
    onApply(swaps, buildAsCustom);
  });

  footer.appendChild(dismissBtn);
  footer.appendChild(applyBtn);
  modal.appendChild(footer);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
}

// ── apply helpers — called by both file and URL import paths ──────────────────

// Parses map content, handles tile collision dialog, applies to state.
// sourceName is a display string (filename or URL label) for the status bar.
function applyMapImport(content, sourceName) {
  const result = importRubyMap(content);

  const applyResult = (swaps, buildAsCustom) => {
    const remapHexTile = (oldId, newId) => {
      for (const hex of Object.values(result.hexes)) {
        if (hex.tile !== undefined && hex.tile !== null && String(hex.tile) === oldId)
          hex.tile = /^\d+$/.test(newId) ? parseInt(newId, 10) : newId;
      }
    };
    for (const [oldId, newId] of Object.entries(buildAsCustom || {})) {
      remapHexTile(oldId, newId);
      result.customTiles[newId] = result.customTiles[oldId];
      delete result.customTiles[oldId];
    }
    for (const [oldId, newId] of Object.entries(swaps || {})) {
      remapHexTile(oldId, newId);
      delete result.customTiles[oldId];
    }
    state.hexes = result.hexes;
    state.meta.rows               = result.rows;
    state.meta.cols               = result.cols;
    state.meta.orientation        = result.orientation;
    state.meta.staggerParity      = result.staggerParity;
    state.meta.coordParity        = result.coordParity;
    state.meta.pointyStaggerParity = result.pointyStaggerParity || 0;
    state.meta.pointyEvenOffset   = result.pointyEvenOffset;
    state.meta.pointyOddOffset    = result.pointyOddOffset;
    state.meta.maxRowPerCol       = result.maxRowPerCol;
    if (Object.keys(result.manifest).length > 0) {
      state.manifest = result.manifest;
      if (!state.customTiles) state.customTiles = {};
      Object.assign(state.customTiles, result.customTiles);
      if (Object.keys(result.customTiles).length > 0)
        TileRegistry.setEmbeddedTiles(result.customTiles);
    }
    syncOrientationSelect();
    syncDimInputs();
    panX = 0; panY = 0; zoom = 1;
    render();
    autosave();
    const staticCount = Object.values(result.hexes).filter(h => h.static).length;
    const tileCount   = Object.keys(result.manifest).length;
    const tileMsg     = tileCount ? ` — ${tileCount} tiles` : '';
    updateStatus(`Imported ${result.orientation} map: ${result.rows}r × ${result.cols}c — ${staticCount} static hexes${tileMsg} from ${sourceName}`);
  };

  const collisions = Object.keys(result.customTiles).length > 0
    ? TileRegistry.detectEmbeddedCollisions(result.customTiles) : [];
  if (collisions.length > 0) _showTileCollisionDialog(collisions, applyResult);
  else applyResult({}, {});
}

// Parses entities content and applies to state.
function applyEntitiesImport(content, sourceName) {
  const { privates, packs } = importEntitiesRb(content);
  state.privates = privates;
  _resolveGrantedByNames(state.trains, privates);
  if (!state.corpPacks) state.corpPacks = [];
  packs.forEach(newPack => {
    const xi = state.corpPacks.findIndex(p => p.type === newPack.type);
    if (xi !== -1) state.corpPacks[xi] = newPack;
    else state.corpPacks.push(newPack);
  });
  if (typeof _selectedPrivateIdx !== 'undefined' && privates.length) _selectedPrivateIdx = 0;
  if (typeof renderPrivatesCards    === 'function') renderPrivatesCards();
  if (typeof renderCorpsSection     === 'function') renderCorpsSection();
  if (typeof renderHomeCompanySelect === 'function') renderHomeCompanySelect();
  autosave();
  document.getElementById('fileMenu').style.display = 'none';
  const pCount    = privates.length;
  const cCount    = packs.reduce((s, p) => s + p.companies.length, 0);
  const concCount = privates.filter(p => p.companyType === 'concession').length;
  const abCount   = privates.reduce((s, p) => s + (p.abilities || []).length, 0);
  updateStatus(`Imported ${pCount} privates (${concCount} concessions, ${abCount} abilities) + ${cCount} corporations from ${sourceName}`);
}

// Parses game.rb content and applies trains / phases / mechanics to state.
function applyGameImport(content, sourceName) {
  const { trains, phases, mechanics } = importGameRb(content);
  state.trains = trains;
  state.phases = phases;
  if (mechanics && Object.keys(mechanics).length) {
    if (!state.mechanics) state.mechanics = (typeof defaultMechanics === 'function') ? defaultMechanics() : {};
    Object.assign(state.mechanics, mechanics);
  }
  if (typeof renderTrainsTable    === 'function') renderTrainsTable();
  if (typeof renderPhasesTable    === 'function') renderPhasesTable();
  if (typeof renderMechanicsLeft  === 'function') renderMechanicsLeft();
  if (typeof renderMechanicsRight === 'function') renderMechanicsRight();
  autosave();
  const evCount   = trains.reduce((s, t) => s + (t.events ? t.events.length : 0), 0);
  const mechCount = Object.keys(mechanics || {}).length;
  updateStatus(
    `Imported ${trains.length} trains, ${phases.length} phases` +
    (evCount   ? `, ${evCount} events`           : '') +
    (mechCount ? `, ${mechCount} mechanics fields` : '') +
    ` from ${sourceName}`
  );
}

// ── File-picker wiring ────────────────────────────────────────────────────────

document.getElementById('importMapFile').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    try { applyMapImport(ev.target.result, file.name); }
    catch (err) { console.error('[importRubyMap] error:', err); alert('Import failed: ' + err.message); }
  };
  reader.readAsText(file);
  e.target.value = '';
});

document.getElementById('importEntitiesBtn').addEventListener('click', () => {
  document.getElementById('importEntitiesFile').click();
});
document.getElementById('importEntitiesFile').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    try { applyEntitiesImport(ev.target.result, file.name); }
    catch (err) { console.error('[importEntitiesRb] error:', err); alert('Entities import failed: ' + err.message); }
  };
  reader.readAsText(file);
  e.target.value = '';
});

document.getElementById('importGameBtn').addEventListener('click', () => {
  document.getElementById('fileMenu').style.display = 'none';
  document.getElementById('importGameFile').click();
});
document.getElementById('importGameFile').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    try { applyGameImport(ev.target.result, file.name); }
    catch (err) { console.error('[importGameRb] error:', err); alert('Game import failed: ' + err.message); }
  };
  reader.readAsText(file);
  e.target.value = '';
});

// ── Stub handlers for not-yet-implemented types ───────────────────────────────

['exportGameBtn'].forEach(id => {
  const el = document.getElementById(id);
  if (el) el.addEventListener('click', () => {
    document.getElementById('fileMenu').style.display = 'none';
    updateStatus('Not yet implemented.');
  });
});