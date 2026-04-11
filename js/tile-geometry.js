// ─── TILE GEOMETRY ─────────────────────────────────────────────────────────────
// Structural tile definition model and geometry computation layer.
// Load order: FIRST — before constants.js, which calls normalizeTileDef().
//
// ── Edge Numbering (matches tobymao TILES.md exactly) ───────────────────────
//   Flat-top hex, numbered 0-5 clockwise from bottom:
//   0=Bottom (0, +43.3)   1=LL (−37.5, +21.65)   2=UL (−37.5, −21.65)
//   3=Top    (0, −43.3)   4=UR (+37.5, −21.65)   5=LR (+37.5, +21.65)
//
//   edgeAngle(e) = (e × 60 + 90) % 360  [degrees from canvas +x axis, clockwise]
//   edgeMidpoint(e) = { x: −sin(e×π/3)×43.3, y: cos(e×π/3)×43.3 }
//
// ── New Tile Definition Format ───────────────────────────────────────────────
//
//   {
//     color: 'yellow',
//     nodes: [
//       { type: 'town'|'city'|'offboard', x, y, revenue, revenueX, revenueY },
//       // revenueX/revenueY optional — if omitted, computed from bar rotation
//     ],
//     paths: [
//       { a: <edge|{node:N}>, b: <edge|{node:N}>, lanes: N, terminal: 1 }
//       // a and b: integer = edge index (0-5); {node:N} = reference to nodes[N]
//       // lanes: number of parallel paths (default 1)
//       // terminal: 1 = pointed/tapered (for offboard stubs)
//     ],
//     label: 'H'  // optional tile label
//   }
//
// ── Migration Strategy ───────────────────────────────────────────────────────
//   normalizeTileDef(def) accepts EITHER old format OR new format and outputs
//   the structure expected by renderer.js. Old-format tiles pass through
//   unchanged. Migrate tiles one at a time — renderer never needs to know.
//
// ── What remains for next session ────────────────────────────────────────────
//   1. Convert all remaining TILE_DEFS entries to new format
//   2. Replace renderer.js flag-based drawing branches with geometry-driven
//      calls (town bar from normalizeTileDef output, not dualTown/town flags)
//   3. Altoona + Chicago: explicit loc-based nodePositions + arc path handling
//      for the static preprinted hex definitions
//   4. Multi-lane rendering: draw N offset parallel lines for paths with lanes>1
//   5. terminal path rendering: pointed/tapered track for offboard stubs
// ───────────────────────────────────────────────────────────────────────────────

'use strict';

// ── Constants ─────────────────────────────────────────────────────────────────

const TILE_GEO = (() => {

const HEX_CIRCUMRADIUS = 50;
const HEX_INRADIUS = 43.5;   // hex.rb: Y_B=87 at scale 100 → 43.5 at scale 50
const BAR_RW = 16.93;
const BAR_RH = 4.23;

// ── Edge geometry ─────────────────────────────────────────────────────────────

// Returns {x, y} of the midpoint of edge e in tile-local coords (center = 0,0).
function edgeMidpoint(e) {
  const a = e * Math.PI / 3;
  return {
    x: parseFloat((-Math.sin(a) * HEX_INRADIUS).toFixed(2)),
    y: parseFloat(( Math.cos(a) * HEX_INRADIUS).toFixed(2))
  };
}

// Returns the direction angle (degrees, canvas convention: 0=right, CW positive)
// of the radial line from hex center to edge e midpoint.
function edgeAngleDeg(e) {
  return (e * 60 + 90) % 360;
}

// Returns the {x, y} of the vertex (corner) at position loc (e.g. 2.5 = corner
// between edges 2 and 3). Used for Altoona-style off-center city placements.
function cornerPosition(loc) {
  const angle = (loc * 60 + 90) * Math.PI / 180;
  return {
    x: parseFloat((-Math.sin(angle) * HEX_CIRCUMRADIUS).toFixed(2)),
    y: parseFloat(( Math.cos(angle) * HEX_CIRCUMRADIUS).toFixed(2))
  };
}

// True if edges e1 and e2 are exactly opposite (180° apart).
function edgesAreOpposite(e1, e2) {
  return (e1 + 3) % 6 === e2 || (e2 + 3) % 6 === e1;
}

// ── Endpoint parsing ──────────────────────────────────────────────────────────

// Parses a path endpoint.
// Integer  → { type: 'edge', index: N }
// {node:N} → { type: 'node', index: N }
function parseEndpoint(ep) {
  if (typeof ep === 'number') return { type: 'edge', index: ep };
  if (ep && typeof ep === 'object' && 'node' in ep) return { type: 'node', index: ep.node };
  throw new Error('tile-geometry: invalid endpoint ' + JSON.stringify(ep));
}

// ── Node analysis ─────────────────────────────────────────────────────────────

// Returns all edge indices that connect directly to nodeIdx via any path.
// Node-to-node paths (e.g. town→city in Mexico City) are NOT included.
function edgesForNode(nodeIdx, paths) {
  const edges = [];
  for (const p of paths) {
    const ea = parseEndpoint(p.a);
    const eb = parseEndpoint(p.b);
    if (ea.type === 'node' && ea.index === nodeIdx && eb.type === 'edge') {
      edges.push(eb.index);
    } else if (eb.type === 'node' && eb.index === nodeIdx && ea.type === 'edge') {
      edges.push(ea.index);
    }
  }
  return edges;
}

// Returns the number of paths that touch a given node (any endpoint type).
function pathCountForNode(nodeIdx, paths) {
  let count = 0;
  for (const p of paths) {
    const ea = parseEndpoint(p.a);
    const eb = parseEndpoint(p.b);
    if ((ea.type === 'node' && ea.index === nodeIdx) ||
        (eb.type === 'node' && eb.index === nodeIdx)) {
      count++;
    }
  }
  return count;
}

// ── Bar rotation ──────────────────────────────────────────────────────────────

// Computes the bar rotation angle (degrees) for a town node from its connecting
// edge directions. Formula: average of exit angles mod 180.
function computeBarRotation(nodeIdx, paths) {
  const edges = edgesForNode(nodeIdx, paths);
  if (edges.length === 0) return 0;
  if (edges.length === 1) return edgeAngleDeg(edges[0]) % 180;
  // Average of the two primary edges (take first two if more than 2)
  const a1 = edgeAngleDeg(edges[0]);
  const a2 = edgeAngleDeg(edges[1]);
  // Handle the case where averaging wraps: use modular average
  let avg = (a1 + a2) / 2;
  // If the two angles are on opposite sides of 0/360, average differently
  if (Math.abs(a1 - a2) > 180) avg = ((a1 + a2 + 360) / 2) % 360;
  return Math.round(avg % 180 * 100) / 100;
}

// ── Revenue bubble positioning ────────────────────────────────────────────────

// Computes a good position for the revenue bubble near a town/city.
// Offset perpendicular to the bar axis, in the direction away from hex center.
function computeRevenuePos(nx, ny, barRot) {
  const perp1 = (barRot + 90) % 360;
  const perp2 = (barRot - 90 + 360) % 360;
  const offset = 14;
  const r1 = perp1 * Math.PI / 180;
  const r2 = perp2 * Math.PI / 180;
  const p1 = { x: nx + offset * Math.cos(r1), y: ny + offset * Math.sin(r1) };
  const p2 = { x: nx + offset * Math.cos(r2), y: ny + offset * Math.sin(r2) };
  // Pick whichever is further from center (away from hex interior)
  const d1 = p1.x * p1.x + p1.y * p1.y;
  const d2 = p2.x * p2.x + p2.y * p2.y;
  const rp = d1 >= d2 ? p1 : p2;
  return { x: parseFloat(rp.x.toFixed(2)), y: parseFloat(rp.y.toFixed(2)) };
}

// ── Arc computation ───────────────────────────────────────────────────────────

// Translated from 18xx.games track_node_path.rb — same formula as renderer.js
// calcArc. Returns {radius, sweep} for SVG arc "A r r 0 0 sweep ex ey".
function calcArcGeom(bx, by, ex, ey) {
  const dist    = Math.hypot(bx - ex, by - ey);
  const angleBo = Math.atan2(by, -bx);
  const angleBe = Math.atan2(by - ey, ex - bx);
  let da = angleBo - angleBe;
  if (da < -Math.PI) da += 2 * Math.PI;
  else if (da >  Math.PI) da -= 2 * Math.PI;
  const cosA   = Math.cos(Math.PI / 2 - Math.abs(da));
  const radius = cosA < 0.001 ? 1e6 : dist / (2 * cosA);
  return { radius: parseFloat(radius.toFixed(2)), sweep: da < 0 ? 0 : 1 };
}

// True if the path from edgeIdx to nodeIdx should be drawn straight.
// A path is straight when its two connecting edges are exactly opposite.
function pathToNodeIsStraight(edgeIdx, nodeIdx, paths) {
  const otherEdges = edgesForNode(nodeIdx, paths).filter(e => e !== edgeIdx);
  // Straight if any peer edge is exactly opposite to this edge
  return otherEdges.some(e => edgesAreOpposite(edgeIdx, e));
}

// ── SVG path string generation ────────────────────────────────────────────────

// Generates a complete SVG path string from the structured tile definition.
// Output format matches what renderer.js expects for tileDef.svgPath.
//
// KEY DESIGN RULE — towns vs. cities:
//   Towns are THROUGH stops: the track is a continuous arc from edge to edge,
//   and the town bar is rendered on top at the computed position.
//   So pairs of edge→town paths are MERGED into one edge-to-edge arc.
//
//   Cities are TERMINUS stops: each edge path terminates at the city circle.
//   They are drawn as individual half-paths to the city's (x, y) position.
//
//   This distinction is structural (node type), never a flag.
//
// Through-town merge rule:
//   A town node with exactly 2 edge-to-node paths → emit one edge-to-edge arc.
//   A town node with 3+ paths, or paths involving node-to-node connections,
//   → fall through to individual path rendering (dot style towns).
//
// The arc formula (calcArcGeom) computes degenerate arcs (da≈0) for any path
// whose two endpoints are co-directional from the origin — including ALL paths
// that start at an edge midpoint and end at (0,0). Never split through-towns.

function buildSvgPath(nodes, paths) {
  const parts = [];
  const emitted = new Set(); // indices of paths already handled

  for (let i = 0; i < paths.length; i++) {
    if (emitted.has(i)) continue;
    const p = paths[i];
    if (p.terminal) continue; // terminal stubs handled separately in renderer

    const ea = parseEndpoint(p.a);
    const eb = parseEndpoint(p.b);

    // ── Through-town merge ───────────────────────────────────────────────────
    // Detect if this is an edge→town path. If the town has exactly 2
    // edge connections, merge both half-paths into one edge-to-edge arc.
    let townIdx = -1;
    let thisEdge = -1;
    if (ea.type === 'edge' && eb.type === 'node' &&
        nodes[eb.index] && nodes[eb.index].type === 'town') {
      townIdx = eb.index; thisEdge = ea.index;
    } else if (ea.type === 'node' && eb.type === 'edge' &&
        nodes[ea.index] && nodes[ea.index].type === 'town') {
      townIdx = ea.index; thisEdge = eb.index;
    }

    if (townIdx >= 0) {
      // Collect all edge-to-node paths for this town
      const edgeConns = [];
      for (let j = 0; j < paths.length; j++) {
        const qp = paths[j];
        const qa = parseEndpoint(qp.a);
        const qb = parseEndpoint(qp.b);
        if (qa.type === 'edge' && qb.type === 'node' && qb.index === townIdx)
          edgeConns.push({ pathIdx: j, edge: qa.index });
        else if (qb.type === 'edge' && qa.type === 'node' && qa.index === townIdx)
          edgeConns.push({ pathIdx: j, edge: qb.index });
      }

      if (edgeConns.length === 2) {
        // Two-path through-town: emit single edge-to-edge arc, skip both halves
        edgeConns.forEach(c => emitted.add(c.pathIdx));
        const sp = edgeMidpoint(edgeConns[0].edge);
        const ep = edgeMidpoint(edgeConns[1].edge);
        if (edgesAreOpposite(edgeConns[0].edge, edgeConns[1].edge)) {
          parts.push(`M ${sp.x} ${sp.y} L ${ep.x} ${ep.y}`);
        } else {
          const arc = calcArcGeom(sp.x, sp.y, ep.x, ep.y);
          parts.push(`M ${sp.x} ${sp.y} A ${arc.radius} ${arc.radius} 0 0 ${arc.sweep} ${ep.x} ${ep.y}`);
        }
        continue;
      }
      // 3+ edge paths (dot-style town) or mixed node/edge: fall through
    }

    // ── Normal path ──────────────────────────────────────────────────────────
    // Handles: edge-to-edge, city half-paths, 3+-path town segments,
    // and node-to-node connectors (Mexico City style).
    emitted.add(i);

    const startPt = ea.type === 'edge'
      ? edgeMidpoint(ea.index)
      : { x: nodes[ea.index].x, y: nodes[ea.index].y };
    const endPt = eb.type === 'edge'
      ? edgeMidpoint(eb.index)
      : { x: nodes[eb.index].x, y: nodes[eb.index].y };

    let useArc = false;
    if (ea.type === 'edge' && eb.type === 'edge') {
      useArc = !edgesAreOpposite(ea.index, eb.index);
    } else if (ea.type === 'edge' && eb.type === 'node') {
      useArc = !pathToNodeIsStraight(ea.index, eb.index, paths);
    } else if (ea.type === 'node' && eb.type === 'edge') {
      // Arc from node→edge: reverse endpoints for calcArcGeom, flip sweep
      useArc = !pathToNodeIsStraight(eb.index, ea.index, paths);
      if (useArc) {
        const arc = calcArcGeom(endPt.x, endPt.y, startPt.x, startPt.y);
        parts.push(`M ${startPt.x} ${startPt.y} A ${arc.radius} ${arc.radius} 0 0 ${arc.sweep ? 0 : 1} ${endPt.x} ${endPt.y}`);
        continue;
      }
    }
    // node-to-node: always straight (e.g. town→city connector)

    if (useArc) {
      const arc = calcArcGeom(startPt.x, startPt.y, endPt.x, endPt.y);
      parts.push(`M ${startPt.x} ${startPt.y} A ${arc.radius} ${arc.radius} 0 0 ${arc.sweep} ${endPt.x} ${endPt.y}`);
    } else {
      parts.push(`M ${startPt.x} ${startPt.y} L ${endPt.x} ${endPt.y}`);
    }
  }

  return parts.join(' ');
}

// ── normalizeTileDef ──────────────────────────────────────────────────────────

// Converts a new-format tile definition (nodes + paths) into the structure
// that renderer.js currently expects. Old-format tiles (no nodes/paths field)
// are returned unchanged — backward compatible.
//
// Output shape (what renderer.js reads):
//   { color, svgPath, tileLabel?,
//     // Single town (tiles 3, 4, 58, 141, 142...):
//     townAt: { x, y, rot, rw, rh }, revenue: { x, y, v }
//     // Dual town (tiles 1, 2, 55, 56, 69...):
//     dualTown: true, townPositions: [{x,y,rot,rw,rh}...], revenues: [{x,y,v}...]
//     // Single city:
//     city: true, revenue: { x, y, v }
//     // OO / 2-slot city:
//     oo: true, cityPositions: [{x,y}...], revenue: { x, y, v }
//   }
function normalizeTileDef(def) {
  // Old-format: no nodes/paths → pass through unchanged
  if (!def.nodes || !def.paths) return def;

  const { nodes, paths, color, label } = def;

  const townPositions = [];
  const revenues      = [];
  const cityPositions = [];
  let townCount = 0;
  let cityCount = 0;

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const nx = node.x, ny = node.y;

    if (node.type === 'town') {
      const barRot = computeBarRotation(i, paths);
      townPositions.push({ x: nx, y: ny, rot: barRot, rw: BAR_RW, rh: BAR_RH });

      // Revenue: use explicit revenueX/Y if provided, else compute
      if (node.revenue !== undefined) {
        const rp = (node.revenueX !== undefined)
          ? { x: node.revenueX, y: node.revenueY }
          : computeRevenuePos(nx, ny, barRot);
        revenues.push({ x: rp.x, y: rp.y, v: node.revenue });
      }
      townCount++;

    } else if (node.type === 'city') {
      cityPositions.push({ x: nx, y: ny });
      if (node.revenue !== undefined) {
        const rp = (node.revenueX !== undefined)
          ? { x: node.revenueX, y: node.revenueY }
          : { x: parseFloat((nx + 16).toFixed(2)), y: parseFloat((ny + 0).toFixed(2)) };
        revenues.push({ x: rp.x, y: rp.y, v: node.revenue });
      }
      cityCount++;
    }
    // offboard and junction: not yet implemented here — add in next session
  }

  const out = { color, svgPath: buildSvgPath(nodes, paths) };
  if (label) out.tileLabel = label;

  if (townCount === 1 && cityCount === 0) {
    out.townAt = townPositions[0];
    if (revenues.length > 0) out.revenue = revenues[0];

  } else if (townCount >= 2 && cityCount === 0) {
    out.dualTown = true;
    out.townPositions = townPositions;
    if (revenues.length > 0) out.revenues = revenues;

  } else if (cityCount === 1 && townCount === 0) {
    out.city = true;
    if (revenues.length > 0) out.revenue = revenues[0];

  } else if (cityCount === 2 && townCount === 0) {
    out.oo = true;
    out.cityPositions = cityPositions;
    if (revenues.length > 0) out.revenue = revenues[0];

  } else if (cityCount >= 3 && townCount === 0) {
    // Multi-slot city (3-slot etc.) — extend in next session
    out.city = true;
    out.slots = cityCount;
    if (revenues.length > 0) out.revenue = revenues[0];
  }
  // Mixed (town + city, e.g. Mexico City): extend in next session

  return out;
}

// ── DSL Parser ────────────────────────────────────────────────────────────────
//
// parseDSL(dslString) — converts a tobymao tile.rb DSL string into the
// new {nodes, paths, color, label} format understood by normalizeTileDef().
//
// DSL syntax (subset we handle):
//   component=key:value;key:value  (semicolon-separated k:v pairs per component)
//   components separated by vertical pipe  |  (tile.rb joins them that way)
//   OR newline-separated.
//
// Components handled: city, town, path, label, upgrade
// Components ignored:  border, icon, frame, junction (logged, not fatal)
//
// Path endpoint encoding:
//   Integer N  → edge N
//   _N         → node reference index N (order of city/town appearances)
//
// Color comes from calling code (upgrade line gives next color, not current).
// Pass the tile's color explicitly as the second argument.
//
// Example:
//   parseDSL('town=revenue:10;path=a:0,b:_0;path=a:3,b:_0', 'yellow')
//   → { color:'yellow', nodes:[{type:'town',x:0,y:0,revenue:10}],
//       paths:[{a:0,b:{node:0}},{a:3,b:{node:0}}] }
//
// Node positions: town/city at hex center (0,0) unless loc: is specified.
//   loc:N   → biased toward edge N midpoint (halfway between center and edge)
//   loc:N.5 → corner vertex between edges N and N+1 at circumradius
//   loc:center → (0, 0)
//
// Revenue encoding: revenue:N or revenue:yellow_N|green_M|... (phase-variable).
// For phase-variable revenues we take the first value (yellow phase default).

function parseDSL(dslString, color) {
  if (!dslString || typeof dslString !== 'string') return null;

  const nodes = [];
  const paths = [];
  let labelStr = null;

  // Split into component strings. tile.rb format uses literal ';' between
  // key:value pairs within a component, and components are separated by
  // either '|' or semicolons followed by a new component keyword.
  // We split on the top-level component boundaries by detecting keyword starts.
  const COMPONENT_KEYWORDS = ['city', 'town', 'path', 'label', 'upgrade',
                               'border', 'icon', 'frame', 'junction', 'offboard',
                               'pass', 'halt'];

  // Tokenize: split on ';' then re-join into components by detecting keyword=
  const raw = dslString.trim();
  const tokens = raw.split(';');

  const components = [];
  let cur = null;
  for (const tok of tokens) {
    const eqIdx = tok.indexOf('=');
    if (eqIdx !== -1) {
      const kw = tok.slice(0, eqIdx).trim().toLowerCase();
      if (COMPONENT_KEYWORDS.includes(kw)) {
        if (cur) components.push(cur);
        cur = tok.trim();
        continue;
      }
    }
    // Continuation of previous component
    if (cur !== null) cur += ';' + tok.trim();
    else cur = tok.trim();
  }
  if (cur) components.push(cur);

  for (const comp of components) {
    const eqIdx = comp.indexOf('=');
    if (eqIdx === -1) continue;
    const type = comp.slice(0, eqIdx).trim().toLowerCase();
    const kvStr = comp.slice(eqIdx + 1);

    // Parse key:value pairs from remainder
    const kv = {};
    // kvStr may itself contain commas separating k:v pairs, or semicolons.
    // tile.rb uses comma-separated k:v within a component after the '='.
    for (const pair of kvStr.split(',')) {
      const ci = pair.indexOf(':');
      if (ci === -1) continue;
      const k = pair.slice(0, ci).trim();
      const v = pair.slice(ci + 1).trim();
      kv[k] = v;
    }

    if (type === 'city' || type === 'town' || type === 'offboard' || type === 'junction') {
      const nodeIdx = nodes.length;
      const rev = kv['revenue'] !== undefined ? parseRevenue(kv['revenue']) : undefined;
      const pos = kv['loc'] !== undefined ? locToPos(kv['loc']) : { x: 0, y: 0 };
      const node = { type, x: pos.x, y: pos.y };
      if (rev !== undefined) node.revenue = rev;
      if (kv['slots'])  node.slots  = parseInt(kv['slots'], 10);
      if (kv['style'])  node.style  = kv['style'];   // rect | dot | hidden
      if (kv['groups']) node.groups = kv['groups'];
      if (kv['hide'])   node.hide   = 1;
      nodes.push(node);

    } else if (type === 'path') {
      const a = parsePathEndpoint(kv['a']);
      const b = parsePathEndpoint(kv['b']);
      if (a === null || b === null) continue;
      const path = { a, b };
      if (kv['lanes'])    path.lanes    = parseInt(kv['lanes'], 10);
      if (kv['a_lane'])   path.a_lane   = kv['a_lane'];
      if (kv['b_lane'])   path.b_lane   = kv['b_lane'];
      if (kv['terminal']) path.terminal = parseInt(kv['terminal'], 10) || 1;
      if (kv['ignore'])   path.ignore   = 1;
      if (kv['track'])    path.track    = kv['track'];
      paths.push(path);

    } else if (type === 'label') {
      labelStr = kv['label'] || Object.keys(kv)[0] || null;
      // label=label:OO or label=label:Chi
      if (labelStr === null && kv['label']) labelStr = kv['label'];

    } else if (type === 'upgrade') {
      // upgrade component tells us tile color transitions — we don't need it
      // for rendering. Skip silently.
    }
    // border, icon, frame, junction, halt: silently ignored
  }

  const result = { color: color || 'yellow', nodes, paths };
  if (labelStr) result.label = labelStr;
  return result;
}

// Parse a phase-variable or simple revenue string.
// 'yellow_10|green_20|brown_30' → 10 (take first/yellow value)
// '20' → 20
// 'E' → 'E' (for offboard variable revenues — keep as string)
function parseRevenue(str) {
  if (!str) return undefined;
  // Phase-variable: yellow_N|green_M|...
  if (str.includes('|')) {
    const first = str.split('|')[0];
    const colIdx = first.indexOf('_');
    if (colIdx !== -1) return parseRevValue(first.slice(colIdx + 1));
  }
  return parseRevValue(str);
}
function parseRevValue(s) {
  const n = parseInt(s, 10);
  return isNaN(n) ? s : n;
}

// Convert a DSL path endpoint string to our format.
// '0'..'5' → integer edge index
// '_0'..'_N' → { node: N }
function parsePathEndpoint(str) {
  if (str === undefined || str === null) return null;
  str = str.trim();
  if (str.startsWith('_')) {
    const n = parseInt(str.slice(1), 10);
    return isNaN(n) ? null : { node: n };
  }
  const n = parseInt(str, 10);
  return isNaN(n) ? null : n;
}

// Convert a DSL loc: value to {x, y} in tile-local coordinates.
// Integer N → midpoint biased halfway between center and edge (canonical town loc).
// N.5 → corner vertex between edges N and N+1 at circumradius.
// 'center' → {0, 0}
// In 18xx.games, loc:N for a city/town is the edge midpoint scaled to ~50%
// inradius — but checking actual tile definitions, most non-center locs use
// the edge midpoint exactly (for off-center towns). We use full inradius here
// to match the engine's positioning; callers can override with explicit x/y.
function locToPos(loc) {
  if (loc === 'center' || loc === undefined) return { x: 0, y: 0 };
  const f = parseFloat(loc);
  if (isNaN(f)) return { x: 0, y: 0 };
  // N.5 = corner between edges N and N+1
  if (!Number.isInteger(f) && Math.abs(f - Math.round(f)) === 0.5) {
    return cornerPosition(f);
  }
  // Integer: edge midpoint (city/town sitting on an edge side)
  return edgeMidpoint(Math.round(f));
}

// ── Public API ────────────────────────────────────────────────────────────────

return {
  edgeMidpoint,
  edgeAngleDeg,
  cornerPosition,
  edgesAreOpposite,
  edgesForNode,
  computeBarRotation,
  computeRevenuePos,
  calcArcGeom,
  buildSvgPath,
  normalizeTileDef,
  parseDSL,
  BAR_RW,
  BAR_RH,
  HEX_INRADIUS,
  HEX_CIRCUMRADIUS
};

})(); // end TILE_GEO IIFE
