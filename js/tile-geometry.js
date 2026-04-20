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
// Town bar dimensions from town_rect.rb: height=(width/2)+4, bar_width=height*4
// Default track width=8 → bar height=8, bar_width=32 at scale 100 → 4×16 at scale 50
const BAR_RW = 16;
const BAR_RH = 4;
// City slot from city.rb: SLOT_RADIUS=25 at scale 100 → 12.5 at scale 50
const SLOT_RADIUS = 12.5;

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
// Formula mirrors edgeMidpoint (same trig, circumradius instead of inradius, NO +90 offset).
function cornerPosition(loc) {
  const angle = loc * Math.PI / 3;
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
// exitEdges: array of edge indices (0-5) connecting to this node.
// Finds the largest angular gap between consecutive exit directions and places
// the bubble in the clear space, keeping it off the track lines.
function computeRevenuePos(nx, ny, exitEdges, radius) {
  if (radius === undefined) radius = 18;

  if (!exitEdges || exitEdges.length === 0) {
    // No exits: place above node
    return { x: parseFloat(nx.toFixed(2)), y: parseFloat((ny - radius).toFixed(2)) };
  }

  if (exitEdges.length === 1) {
    // Terminus: push bubble directly away from the single exit
    const a = exitEdges[0] * Math.PI / 3;
    return {
      x: parseFloat((nx + Math.sin(a) * radius).toFixed(2)),
      y: parseFloat((ny - Math.cos(a) * radius).toFixed(2)),
    };
  }

  // Sort exit angles in [0, 2π) then find the largest gap between consecutive exits.
  // Edge e outward direction follows edgePos convention: angle = e * π/3,
  // vector = (-sin(angle), cos(angle)).
  const angles = exitEdges.map(e => ((e % 6) + 6) % 6 * Math.PI / 3);
  angles.sort((a, b) => a - b);

  let maxGap = -1, gapMid = 0;
  for (let i = 0; i < angles.length; i++) {
    const curr = angles[i];
    const next = i + 1 < angles.length ? angles[i + 1] : angles[0] + 2 * Math.PI;
    const gap = next - curr;
    if (gap > maxGap) {
      maxGap = gap;
      gapMid = curr + gap / 2;
    }
  }

  // Place bubble in the gap midpoint direction from the node
  return {
    x: parseFloat((nx - Math.sin(gapMid) * radius).toFixed(2)),
    y: parseFloat((ny + Math.cos(gapMid) * radius).toFixed(2)),
  };
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

// ── computeCityTownEdges ──────────────────────────────────────────────────────
// Port of tile.rb#compute_city_town_edges.
// Returns preferred[nodeIdx] = edge 0-5, or null (center placement).

function computeCityTownEdges(nodes, paths) {
  const ctIs = nodes.reduce((a, n, i) => {
    if (n.type === 'town' || n.type === 'city') a.push(i);
    return a;
  }, []);
  const preferred = new Array(nodes.length).fill(null);
  if (!ctIs.length) return preferred;

  // Edges directly connected to each city/town via paths
  const ctEdges = {};
  for (const ni of ctIs) ctEdges[ni] = edgesForNode(ni, paths);

  const hasPaths = paths.length > 0;
  const cityIs   = ctIs.filter(i => nodes[i].type === 'city');
  const townIs   = ctIs.filter(i => nodes[i].type === 'town');

  // No paths + multiple cities → spread evenly around hex
  if (!hasPaths && cityIs.length >= 2) {
    const div = Math.floor(6 / cityIs.length);
    cityIs.forEach((ci, idx) => { preferred[ci] = (idx * div) % 6; });
    townIs.forEach((ti, idx) => { preferred[ti] = (idx * 3) % 6; });
    return preferred;
  }
  // Single city, no towns, no loc → center (null)
  if (cityIs.length === 1 && townIs.length === 0 && nodes[cityIs[0]].loc === undefined)
    return preferred;
  // Single town with ≠2 exits, no loc → center (null)
  if (cityIs.length === 0 && townIs.length === 1) {
    const ti = townIs[0];
    if (ctEdges[ti].length !== 2 && nodes[ti].loc === undefined) return preferred;
  }

  // Build edge_count: edge → weighted traffic count + 0.1 for neighboring edges.
  // Slightly favour keeping edge 0 free for hex location name.
  const edgeCount = new Array(6).fill(0);
  edgeCount[0] += 0.1;
  for (const ni of ctIs) {
    for (const e of ctEdges[ni]) {
      edgeCount[e]           += 1;
      edgeCount[(e + 1) % 6] += 0.1;
      edgeCount[(e - 1 + 6) % 6] += 0.1;
    }
  }

  // Process nodes lowest-min-edge first (matches Ruby sort_by)
  const sorted = [...ctIs].sort((a, b) => {
    const ma = ctEdges[a].length ? Math.min(...ctEdges[a]) : 999;
    const mb = ctEdges[b].length ? Math.min(...ctEdges[b]) : 999;
    return ma - mb;
  });

  for (const ni of sorted) {
    const node  = nodes[ni];
    const edges = ctEdges[ni];
    if (node.loc !== undefined) {
      // Explicit loc: round to nearest edge
      const v = parseFloat(node.loc);
      preferred[ni] = isNaN(v) ? null : Math.round(v) % 6;
    } else if (edges.length > 0) {
      // Pick connected edge with lowest count
      let best = edges[0], bestCnt = edgeCount[best];
      for (const e of edges) {
        if (edgeCount[e] < bestCnt) { bestCnt = edgeCount[e]; best = e; }
      }
      preferred[ni] = best;
      edgeCount[best]           += 1;
      edgeCount[(best + 1) % 6] += 0.1;
      edgeCount[(best - 1 + 6) % 6] += 0.1;
    }
    // else: no edge connections → stays null (center)
  }

  // Pathless node when exactly 2 total ct nodes → place opposite the other
  const pathlessIs = ctIs.filter(ni => ctEdges[ni].length === 0);
  if (pathlessIs.length === 1 && ctIs.length === 2) {
    const other = ctIs.find(ni => ni !== pathlessIs[0]);
    if (preferred[other] !== null)
      preferred[pathlessIs[0]] = (preferred[other] + 3) % 6;
  }

  return preferred;
}

// ── townPosition ──────────────────────────────────────────────────────────────
// Port of town_location.rb#town_position.
// Returns { x, y, rot } for a town bar at nodeIdx.
//   preferredEdge: from computeCityTownEdges — edge 0-5, or null (center).
//   tileExitCount: total unique exit edges on the tile (for center_town? check).
// All distances at scale 50 (source uses scale 100; divide by 2).
//
// Position constants (source → ÷2):
//   center straight: 0      center sharp: 50→25    center gentle: 23.2→11.6
//   non-ctr straight:40→20  non-ctr sharp:55.7→27.85  non-ctr gentle:48.05→24.025

function townPosition(nodeIdx, nodes, paths, tileExitCount, preferredEdge) {
  const myEdges = edgesForNode(nodeIdx, paths);

  // No preferred edge → center (null means center_town or explicit center)
  if (preferredEdge === null || preferredEdge === undefined) {
    const rot = myEdges.length > 0 ? (myEdges[0] * 60) % 180 : 0;
    return { x: 0, y: 0, rot };
  }

  const edgeA = preferredEdge;

  if (myEdges.length === 2) {
    // Normalize so |normA - normB| ≤ 3 (add 6 to the smaller if needed)
    let normA = edgeA;
    let normB = myEdges.find(e => e !== edgeA);
    if (normB === undefined) normB = myEdges[0]; // shouldn't happen
    if (Math.abs(normA - normB) > 3) {
      if (normA < normB) normA += 6; else normB += 6;
    }
    const minEdge = Math.min(normA, normB) % 6;
    const absDiff = Math.abs(normA - normB);
    // [nil, :sharp, :gentle, :straight][absDiff]
    const trackType = absDiff === 1 ? 'sharp' : absDiff === 2 ? 'gentle' : 'straight';

    // center_town? = exits.size==2 && tile.exits.size==2 or 3
    const isCenterTown = (tileExitCount === 2 || tileExitCount === 3);

    if (isCenterTown) {
      let position, posAngle, rotAngle;
      if (trackType === 'straight') {
        position = 0;    posAngle = minEdge * 60;          rotAngle = minEdge * 60;
      } else if (trackType === 'sharp') {
        position = 25;   posAngle = (minEdge + 0.5) * 60;  rotAngle = (minEdge + 2) * 60;
      } else { // gentle
        position = 11.6; posAngle = (minEdge + 1) * 60;    rotAngle = (minEdge * 60) - 30;
      }
      const rad = posAngle * Math.PI / 180;
      return {
        x:   parseFloat((-Math.sin(rad) * position).toFixed(2)),
        y:   parseFloat(( Math.cos(rad) * position).toFixed(2)),
        rot: ((rotAngle % 180) + 180) % 180,
      };
    } else {
      // Non-center 2-exit town: positional + rotational offset by track type/direction
      const POSITIONAL = { sharp: 12.12, gentle: 6.11,  straight: 0 };
      const TILT       = { sharp: 40,    gentle: 15,     straight: 0 };
      const DISTANCE   = { sharp: 27.85, gentle: 24.025, straight: 20 };

      // Track direction from edgeA perspective
      const trackDir = absDiff === 3 ? 'straight'
                     : normA > normB  ? 'right' : 'left';
      const posDelta = trackDir === 'left'  ?  POSITIONAL[trackType]
                     : trackDir === 'right' ? -POSITIONAL[trackType] : 0;
      const rotDelta = trackDir === 'left'  ? -TILT[trackType]
                     : trackDir === 'right' ?  TILT[trackType]       : 0;

      const posAngle = edgeA * 60 + posDelta;
      const rotAngle = edgeA * 60 + rotDelta;
      const rad = posAngle * Math.PI / 180;
      const dist = DISTANCE[trackType];
      return {
        x:   parseFloat((-Math.sin(rad) * dist).toFixed(2)),
        y:   parseFloat(( Math.cos(rad) * dist).toFixed(2)),
        rot: ((rotAngle % 180) + 180) % 180,
      };
    }
  }

  // 0-exit, 1-exit, or 3+ exits: position toward preferred edge at half-inradius
  const rad = edgeA * 60 * Math.PI / 180;
  return {
    x:   parseFloat((-Math.sin(rad) * 20).toFixed(2)),
    y:   parseFloat(( Math.cos(rad) * 20).toFixed(2)),
    rot: (edgeA * 60) % 180,
  };
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

  // Count unique exit edges (needed for center_town? check in townPosition)
  const exitEdgeSet = new Set();
  for (const p of paths) {
    const ea = parseEndpoint(p.a), eb = parseEndpoint(p.b);
    if (ea.type === 'edge') exitEdgeSet.add(ea.index);
    if (eb.type === 'edge') exitEdgeSet.add(eb.index);
  }
  const tileExitCount = exitEdgeSet.size;

  // Compute preferred edges for all city/town nodes
  const preferred = computeCityTownEdges(nodes, paths);

  const townPositions = [];
  const revenues      = [];
  const cityPositions = [];
  const cityGroups    = [];   // per-city-node [{cx,cy,slots,positions}] for independent rendering
  let townCount  = 0;
  let cityCount  = 0;
  let totalSlots = 0;

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];

    if (node.type === 'town') {
      // town.rect? = exits.size == 2 (bar); 0 exits = unconnected dot; 3+ = junction dot
      // tobymao: rect? = exits.size < 3, but that's safe because tile set never has 0-exit towns.
      // Our white tiles (no DSL paths) have 0 exits → must be dots, not bars.
      const pathCount = pathCountForNode(i, paths);
      const isBar     = pathCount > 0 && pathCount < 3;
      const pos       = townPosition(i, nodes, paths, tileExitCount, preferred[i]);

      if (isBar) {
        townPositions.push({ x: pos.x, y: pos.y, rot: pos.rot, rw: BAR_RW, rh: BAR_RH });
      } else {
        // 3+-exit junction town → dot (rw/rh=0 signals dot rendering)
        townPositions.push({ x: pos.x, y: pos.y, rot: 0, rw: 0, rh: 0, dot: true });
      }

      if (node.revenue !== undefined) {
        const tp = townPositions[townPositions.length - 1];
        const rp = node.revenueX !== undefined
          ? { x: node.revenueX, y: node.revenueY }
          : computeRevenuePos(tp.x, tp.y, edgesForNode(i, paths));
        const rev = { x: rp.x, y: rp.y, v: node.revenue };
        if (node.revenuePhases) rev.phases = node.revenuePhases;
        revenues.push(rev);
      }
      townCount++;

    } else if (node.type === 'city') {
      const slots = node.slots || 1;
      totalSlots += slots;
      const cx = node.x, cy = node.y;

      // Build slot positions for THIS city node only.
      // tobymao city.rb CITY_SLOT_POSITION[n] (100-unit × 0.5 for our scale):
      //   1: center circle at (cx, cy)
      //   2: two circles at cx ± SLOT_RADIUS
      //   3: triangle — CITY_SLOT_POSITION[3]=[0,−29] × 0.5 → R3=14.5
      //   4: CITY_SLOT_POSITION[4]=[−12.5,−12.5] rotated at 90° intervals
      //   5+: [0,−SLOT_RADIUS×1.5] rotated at 360/n intervals
      const slotPositions = [];
      if (slots >= 2) {
        if (slots === 2) {
          slotPositions.push({ x: cx - SLOT_RADIUS, y: cy });
          slotPositions.push({ x: cx + SLOT_RADIUS, y: cy });
        } else if (slots === 3) {
          const R3 = 14.5;
          const h3 = R3 * Math.sqrt(3) / 2; // ≈12.56
          slotPositions.push({ x: cx,       y: cy - R3 });
          slotPositions.push({ x: cx + h3,  y: cy + R3 * 0.5 });
          slotPositions.push({ x: cx - h3,  y: cy + R3 * 0.5 });
        } else {
          const SR = SLOT_RADIUS; // 12.5
          const [bx, by] = slots === 4 ? [-SR, -SR] : [0, -SR * 1.5];
          for (let si = 0; si < slots && si < 9; si++) {
            const rad = (2 * Math.PI / slots) * si;
            const cos = Math.cos(rad), sin = Math.sin(rad);
            slotPositions.push({
              x: parseFloat((cx + cos * bx - sin * by).toFixed(2)),
              y: parseFloat((cy + sin * bx + cos * by).toFixed(2)),
            });
          }
        }
        if (node.revenue !== undefined) {
          revenues.push({ x: cx + 33.5, y: cy, v: node.revenue });
        }
      } else {
        // 1-slot city: single circle at city centre
        slotPositions.push({ x: cx, y: cy });
        if (node.revenue !== undefined) {
          const rp = node.revenueX !== undefined
            ? { x: node.revenueX, y: node.revenueY }
            : computeRevenuePos(node.x, node.y, edgesForNode(i, paths));
          const rev = { x: rp.x, y: rp.y, v: node.revenue };
          if (node.revenuePhases) rev.phases = node.revenuePhases;
          revenues.push(rev);
        }
      }

      // Flat array (backward compat for revenue placement & misc code)
      for (const p of slotPositions) cityPositions.push(p);
      // Per-node group: canonical data for independent per-city rendering
      cityGroups.push({ cx, cy, slots, positions: slotPositions });
      cityCount++;
    }
    // offboard / junction: extend later
  }

  const out = { color, svgPath: buildSvgPath(nodes, paths) };
  if (label) out.tileLabel = label;
  // Always output cityGroups — canonical per-city rendering data.
  // Each group: { cx, cy, slots, positions: [{x,y}...] }
  // Renderer iterates groups independently so each city node gets its own
  // render_box (when slots≥2) and slot circles — exactly as tobymao city.rb does.
  if (cityGroups.length) out.cityGroups = cityGroups;

  if (townCount === 1 && cityCount === 0) {
    const t = townPositions[0];
    if (t.dot) {
      out.town = true; // centered dot town
    } else {
      out.townAt = t;
    }
    if (revenues.length > 0) out.revenue = revenues[0];

  } else if (townCount >= 2 && cityCount === 0) {
    out.dualTown = true;
    out.townPositions = townPositions;
    if (revenues.length > 0) out.revenues = revenues;

  } else if (cityCount === 1 && townCount === 0) {
    if (totalSlots >= 2) {
      out.oo   = true;
      out.cityPositions = cityPositions;
    } else {
      out.city = true;
      const cp = cityPositions[0];
      if (cp && (cp.x !== 0 || cp.y !== 0)) { out.cityX = cp.x; out.cityY = cp.y; }
    }
    if (revenues.length > 0) out.revenue = revenues[0];

  } else if (cityCount >= 2 && townCount === 0) {
    // Two (or more) separate city nodes — cityGroups handles rendering.
    // Keep oo+cityPositions for hasCityFeature checks elsewhere.
    out.oo = true;
    out.cityPositions = cityPositions;
    // Multiple cities → multiple revenue bubbles; use revenues[] not revenue
    if (revenues.length === 1) out.revenue  = revenues[0];
    else if (revenues.length > 1) out.revenues = revenues;

  }
  // Mixed (town + city) and offboard: extend later

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
  // Also handle bare keywords like 'junction' that appear without '=' (tile.rb
  // format: 'junction;path=a:0,b:_0;...' — junction is a naked component).
  const BARE_KEYWORDS = new Set(['junction', 'pass', 'halt']);

  const raw = dslString.trim();
  const tokens = raw.split(';');

  const components = [];
  let cur = null;
  for (const tok of tokens) {
    const trimmed = tok.trim();
    // Check for bare keyword (no '=') that starts a new component
    if (BARE_KEYWORDS.has(trimmed.toLowerCase())) {
      if (cur) components.push(cur);
      cur = trimmed.toLowerCase() + '=';  // normalize to 'keyword=' form
      continue;
    }
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx !== -1) {
      const kw = trimmed.slice(0, eqIdx).trim().toLowerCase();
      if (COMPONENT_KEYWORDS.includes(kw)) {
        if (cur) components.push(cur);
        cur = trimmed;
        continue;
      }
    }
    // Continuation of previous component
    if (cur !== null) cur += ';' + trimmed;
    else cur = trimmed;
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
      const revStr = kv['revenue'];
      const rev = revStr !== undefined ? parseRevenue(revStr) : undefined;
      const node = { type };
      if (kv['loc'] !== undefined) node.locStr = kv['loc'];
      if (rev !== undefined) node.revenue = rev;
      // Preserve the full phase string so renderer can draw a phase-color bar
      if (revStr && revStr.includes('|')) node.revenuePhases = revStr;
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
      // label=Y format (bare value, no colon separator) — tobymao standard.
      // kvStr.split(',')[0] handles any trailing comma-continuations; split(';')[0]
      // handles any semicolon-appended continuation components.
      if (!labelStr) labelStr = kvStr.split(';')[0].split(',')[0].trim() || null;

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
  // Integer: edge midpoint
  return edgeMidpoint(Math.round(f));
}

return { normalizeTileDef, parseDSL, computeCityTownEdges, townPosition, SLOT_RADIUS, BAR_RW, BAR_RH };
})();