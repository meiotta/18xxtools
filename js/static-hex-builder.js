// ─── STATIC HEX BUILDER ────────────────────────────────────────────────────────
// Single-panel, non-modal overlay for building map hexes — the pre-printed tiles
// that are fixed on the board before play begins (cities, towns, offboards, terrain
// tracks, blank grey/colored hexes).  Distinct from the player tile pool (manifest).
//
// Load order: SEVENTH — after context-menu.js
//
// Public API:
//   window.openHexBuilder(hexId)         — open builder for the given hex grid key
//   window.openStaticHexWizard(hexId)    — alias kept for backward compatibility
//   window.staticHexCode(hex)            — emit tobymao map.rb DSL for a saved hex model
//
// ── Relationship to renderer.js / hexToSvgInner ──────────────────────────────
// The builder's live canvas preview calls hexToSvgInner() directly (via _toDslHex).
// When the user clicks Place, _buildFinalModel() writes the hex to state.hexes[],
// and the main render() loop calls hexToSvgInner() again from there.
// Both calls must produce the same output, so _buildFinalModel() must mirror
// the nodes[]+paths[] structure that hexToSvgInner requires — not just feature/exits.
//
// ── Data model written to state.hexes[hexId] by _buildFinalModel() ───────────
//   nodes[]      — [{type, slots, locStr}]       required for town/city rendering
//   paths[]      — [{a:{type,n/e}, b:{type,n/e}, terminal?}]  all track connections
//   blankPaths[] — [[ea, eb], …]                 edge-to-edge tracks with no node
//   exits[]      — [edge, …]                     union of all connected edges
//   exitPairs[]  — [[edge,…], …]                 per-node exits for multi-node tiles
//   feature      — 'town'|'city'|'oo'|'dualTown'|'offboard'|'none'  (summary only)
//   bg           — 'white'|'yellow'|'green'|'brown'|'gray'|'red'|'blue'
//
// ── Internal builder state ────────────────────────────────────────────────────
//   _nodes[]     — full node descriptors including revenue and phaseMode
//   _nodeEdges{} — {nodeId: [edge, …]}  which exits connect to each node
//   _segments[]  — [{id, ea, eb}]       bare edge-to-edge tracks (no node)
//
// ── Edge numbering — matches tobymao DSL and ep() in renderer.js ─────────────
//   0=S  1=SW  2=NW  3=N  4=NE  5=SE   (clockwise from bottom)
//
// ── Loc / snap positions ──────────────────────────────────────────────────────
//   13 snap targets per hex: 'center' + integer locs '0'–'5' + half locs '0.5'–'5.5'
//   Position formula: x = -sin(N×π/3) × 25 × SC,  y = cos(N×π/3) × 25 × SC
//   Same formula as ep() but at distance 25 (half the inradius) instead of 43.5.

(function () {
'use strict';

// ── Constants ──────────────────────────────────────────────────────────────────

const PHASES       = ['yellow', 'green', 'brown', 'gray'];
// Source: tobymao lib/hex.rb Lib::Hex::COLOR — must match TILE_HEX_COLORS in constants.js
const PHASE_COLORS = { yellow:'#fde900', green:'#71BF44', brown:'#CB7745', gray:'#BCBDC0' };

// Color rail definitions (no "Blank" option)
const BG_OPTS = [
  { v:'white',  label:'White',  hex:'#EAE0C8', border:'#bba060', title:'White — upgrades to Yellow'  },
  { v:'yellow', label:'Yellow', hex:'#fde900', border:'#c8a800', title:'Yellow — upgrades to Green'  },
  { v:'green',  label:'Green',  hex:'#71BF44', border:'#3a8a1a', title:'Green — upgrades to Brown'   },
  { v:'brown',  label:'Brown',  hex:'#CB7745', border:'#8a4010', title:'Brown — fully upgraded'      },
  { v:'gray',   label:'Gray',   hex:'#BCBDC0', border:'#888',    title:'Gray — cannot be upgraded'   },
  { v:'red',    label:'Red',    hex:'#E05050', border:'#900',    title:'Red — cannot be upgraded'    },
  { v:'blue',   label:'Blue',   hex:'#35A7FF', border:'#1070cc', title:'Blue — water hex'            },
];

// Canvas geometry — flat-top hex, 280×300 canvas
const CW  = 280, CH  = 300;
const CCX = 140, CCY = 150;
const SC  = 2.2;           // scale: tile 50-unit space → canvas pixels
const OR  = 50   * SC;     // outer (circum) radius
const IR  = 43.3 * SC;     // inner (apothem)

// Edge midpoints in canvas space (absolute pixels on the 280×300 canvas).
// Order matches ep() in renderer.js and tobymao DSL (0=S, clockwise).
// ep(N): x = -sin(N×π/3)×43.5, y = cos(N×π/3)×43.5  — scaled by SC and shifted to center.
// NOTE: constants.js has a different EDGE_MIDPOINTS ordering (0=SE); do NOT use it here.
const EMP = [
  [CCX,              CCY + 43.3  * SC],  // 0 bottom
  [CCX - 37.5 * SC,  CCY + 21.65 * SC],  // 1 lower-left
  [CCX - 37.5 * SC,  CCY - 21.65 * SC],  // 2 upper-left
  [CCX,              CCY - 43.3  * SC],  // 3 top
  [CCX + 37.5 * SC,  CCY - 21.65 * SC],  // 4 upper-right
  [CCX + 37.5 * SC,  CCY + 21.65 * SC],  // 5 lower-right
];

// Flat-top hex corners
const CORNERS = [
  [CCX + OR,      CCY       ],
  [CCX + OR / 2,  CCY + IR  ],
  [CCX - OR / 2,  CCY + IR  ],
  [CCX - OR,      CCY       ],
  [CCX - OR / 2,  CCY - IR  ],
  [CCX + OR / 2,  CCY - IR  ],
];

const EDGE_R = 14;   // edge circle radius

// Snap positions for node placement (canvas space, relative to canvas origin)
// Center loc
const SNAP_CENTER = { locStr: 'center', x: CCX, y: CCY };
// Integer locs 0-5 and half locs 0.5-5.5
function _snapPositions() {
  const positions = [SNAP_CENTER];
  const offsets = [];
  for (let n = 0; n < 6; n++) offsets.push(n);
  for (let n = 0; n < 6; n++) offsets.push(n + 0.5);
  for (const n of offsets) {
    const a  = n * Math.PI / 3;
    const cx = CCX + (-Math.sin(a) * 25 * SC);
    const cy = CCY + ( Math.cos(a) * 25 * SC);
    positions.push({ locStr: String(n), x: cx, y: cy });
  }
  return positions;
}
const SNAP_POSITIONS = _snapPositions();

// ── Orientation helpers ───────────────────────────────────────────────────────
// The builder canvas is always drawn in flat-top internal space.
// For pointy-top maps the whole canvas group is rotated 30° visually, and mouse
// coordinates are counter-rotated before hit-testing flat-top constants.
function _orientOff() {
  return (typeof state !== 'undefined' && state?.meta?.orientation === 'pointy') ? 30 : 0;
}
function _unrotate(mx, my) {
  const r = -_orientOff() * Math.PI / 180;
  if (r === 0) return { x: mx, y: my };
  const dx = mx - CCX, dy = my - CCY;
  return {
    x: CCX + dx * Math.cos(r) - dy * Math.sin(r),
    y: CCY + dx * Math.sin(r) + dy * Math.cos(r),
  };
}

// ── Internal state ────────────────────────────────────────────────────────────

let _hexId          = null;
let _bg             = 'white';
let _segments       = [];   // [{id, ea, eb}]  blank edge-to-edge paths
let _nodes          = [];   // [{id, type, slots, locStr, revenue, phaseRevenue:{y,g,br,gr}, terminal, phaseMode}]
let _nodeEdges      = {};   // {nodeId: [edge,...]}  edges connected to each node
let _nodePaths      = [];   // [{id, nodeAId, nodeBId}]  node-to-node connections (e.g. Swansea city↔town)
let _label          = '';
let _terrain        = '';   // terrain type string (e.g. 'hill', 'water', 'mountain')
let _terrainCost    = 0;    // upgrade cost
let _borders        = [];   // [{edge, type, cost}]
let _selectedNodeId = null;
let _pendingEdge    = null;   // edge index waiting for a second endpoint
let _pendingNode    = null;   // node id waiting for a second endpoint (track tool)
let _activeTool     = 'city'; // 'town'|'city'|'offboard'|'track'|'erase'
let _uid            = 1;
let _mousePos       = { x: 0, y: 0 };
let _highlightSnap  = null;  // locStr of currently highlighted snap pos
let _hoveredEdge    = null;  // edge index (0-5) currently under mouse
let _edgeLane       = {};    // edge → active lane cursor (0-indexed).  "+/-" advances/retreats it.
let _nodeEdgeLane   = {};    // {nodeId: {edgeIndex: laneCount}}  — parallel tracks on node stubs (≥2 = multi-lane)
let _showManifest   = false;
let _manifestId     = '';
let _manifestCount  = 1;

function _nextId() { return _uid++; }

function _reset(hexId) {
  _hexId = hexId;
  _bg = 'white';
  _segments = [];
  _nodes = [];
  _nodeEdges = {};
  _nodePaths = [];
  _label = '';
  _terrain = '';
  _terrainCost = 0;
  _borders = [];
  _uid = 1;
  _selectedNodeId = null;
  _pendingEdge = null;
  _pendingNode = null;
  _activeTool = 'city';
  _mousePos = { x: 0, y: 0 };
  _highlightSnap = null;
  _edgeLane = {};
  _nodeEdgeLane = {};
  _showManifest = false;
  _manifestId = '';
  _manifestCount = 1;

  // Load existing hex data if present (works for static map hexes and placed tiles)
  const h = (state.hexes || {})[hexId];
  if (h) {
    _bg    = h.bg    || 'white';
    _label = h.label || '';
    // Re-hydrate nodes and segments from saved model
    _loadFromModel(h);
  }
}

// Re-hydrate internal state from a saved model.
// DSL is the source of truth: read h.nodes[] + h.paths[] directly.
// Never infer structure from h.feature — that summary is lossy (e.g. Wien's
// 3 independent cities collapse to feature:'city',slots:3 but nodes[] is intact).
function _loadFromModel(h) {
  _terrain     = h.terrain     || '';
  _terrainCost = h.terrainCost || 0;
  _borders     = h.borders ? h.borders.map(b => ({ ...b })) : [];

  const savedNodes = h.nodes || [];
  const savedPaths = h.paths || [];

  // Build builder nodes from DSL nodes
  // nodeIdByIndex[i] = internal builder ID for DSL node index i
  const nodeIdByIndex = {};
  savedNodes.forEach((sn, i) => {
    const nodeId = _nextId();
    nodeIdByIndex[i] = nodeId;
    // Detect phase revenue: flat===null means explicit phase revenue was used in DSL
    const hasPhaseRev = sn.flat === null || sn.flat === undefined
      ? Object.values(sn.phaseRevenue || {}).some(v => v > 0)
      : false;
    const nodeType = sn.originalType || sn.type; // originalType preserves 'offboard' across save/reload
    _nodes.push({
      id:           nodeId,
      type:         nodeType,
      slots:        sn.slots || 1,
      locStr:       sn.locStr || 'center',
      revenue:      sn.flat ?? (sn.phaseRevenue?.yellow ?? 0),
      phaseRevenue: { yellow: 0, green: 0, brown: 0, gray: 0, ...(sn.phaseRevenue || {}) },
      terminal:     !!(sn.terminal),
      phaseMode:    hasPhaseRev,
    });
    _nodeEdges[nodeId] = [];
  });

  // Build connections from DSL paths.
  // Edge-to-edge paths are grouped by endpoint pair first because parseDslHex
  // expands lanes:N into N separate path objects (each with aLane/bLane).
  // We collapse those back into a single segment with a lanes count.
  //
  // Key:  Math.min(ea,eb) + '-' + Math.max(ea,eb)
  // Value: { ea, eb, lanes } where lanes = count of paths with those endpoints
  //        OR the explicit p.lanes value for new-builder-format paths.
  const eeGroups = {};

  savedPaths.forEach(p => {
    const aEdge = p.a?.type === 'edge', aNode = p.a?.type === 'node';
    const bEdge = p.b?.type === 'edge', bNode = p.b?.type === 'node';

    if (aEdge && bEdge) {
      // Group by endpoint pair — handles both formats:
      //   parseDslHex: N paths with aLane/bLane, each counted +1
      //   New builder:  1 path with explicit p.lanes = N
      const ea = p.a.n, eb = p.b.n;
      const key = Math.min(ea, eb) + '-' + Math.max(ea, eb);

      // Extract explicit per-endpoint lane indices (1-indexed).
      // import-ruby.js produces arrays [total,idx]; tile-geometry.js produces strings "N.I".
      const _extractLane = (laneArr, laneStr) => {
        if (Array.isArray(laneArr)) return laneArr[1];           // already 0-indexed
        if (typeof laneStr === 'string') {
          const [, i] = laneStr.split('.');
          return i !== undefined ? parseInt(i) : null;           // already 0-indexed
        }
        return null;
      };
      const laneA = _extractLane(p.aLane, p.a_lane);
      const laneB = _extractLane(p.bLane, p.b_lane);

      const grp = eeGroups[key];
      if (!grp) {
        eeGroups[key] = { ea, eb, lanes: p.lanes || 1, laneA, laneB };
      } else if (p.lanes && p.lanes > grp.lanes) {
        grp.lanes = p.lanes;          // explicit lanes supersedes count
      } else if (!p.lanes) {
        grp.lanes++;                  // parseDslHex expansion: each copy = +1 lane
      }

    } else if (aEdge && bNode) {
      const nodeId = nodeIdByIndex[p.b.n];
      if (nodeId !== undefined) {
        const edges = _nodeEdges[nodeId];
        // Handle both aLane:[N,i] (new expanded format) and lanes:N (old compact format)
        const totalLanes = Array.isArray(p.aLane) ? p.aLane[0] : (p.lanes || 1);
        if (!edges.includes(p.a.n)) {
          edges.push(p.a.n);
          if (totalLanes > 1) { if (!_nodeEdgeLane[nodeId]) _nodeEdgeLane[nodeId] = {}; _nodeEdgeLane[nodeId][p.a.n] = totalLanes; }
        }
      }
    } else if (aNode && bEdge) {
      const nodeId = nodeIdByIndex[p.a.n];
      if (nodeId !== undefined) {
        const edges = _nodeEdges[nodeId];
        // Handle both bLane:[N,i] (new expanded format) and lanes:N (old compact format)
        const totalLanes = Array.isArray(p.bLane) ? p.bLane[0] : (p.lanes || 1);
        if (!edges.includes(p.b.n)) {
          edges.push(p.b.n);
          if (totalLanes > 1) { if (!_nodeEdgeLane[nodeId]) _nodeEdgeLane[nodeId] = {}; _nodeEdgeLane[nodeId][p.b.n] = totalLanes; }
        }
      }
    } else if (aNode && bNode) {
      // Node-to-node path (e.g. Swansea city↔town)
      const nodeAId = nodeIdByIndex[p.a.n];
      const nodeBId = nodeIdByIndex[p.b.n];
      if (nodeAId !== undefined && nodeBId !== undefined) {
        if (!_nodePaths.some(np => (np.nodeAId===nodeAId&&np.nodeBId===nodeBId)||(np.nodeAId===nodeBId&&np.nodeBId===nodeAId))) {
          _nodePaths.push({ id: _nextId(), nodeAId, nodeBId });
        }
      }
    }
  });

  // Create one segment per endpoint group, carrying lane count + per-endpoint lane index.
  // laneA/laneB are 0-indexed and correspond directly to b_lane:N.I index I.
  Object.values(eeGroups).forEach(({ ea, eb, lanes, laneA, laneB }) => {
    const laneCount = lanes > 1 ? lanes : 1;
    _segments.push({ id: _nextId(), ea, eb, lanes: laneCount,
      laneA: laneA != null ? laneA : null, laneB: laneB != null ? laneB : null });
    // Restore the edge lane cursor positioned PAST the max used lane.
    // For a multi-lane segment the ea side expands as [laneA, laneA+1, …, laneA+N-1],
    // so the next free slot is laneA + laneCount (not laneA + 1).
    // The eb side is stored as the HIGHEST bLane (= N-1 for the reversal pattern), so
    // laneB + 1 already equals N — no special case needed there.
    if (laneA != null) _edgeLane[ea] = Math.max(_edgeLane[ea] || 0, laneA + laneCount);
    if (laneB != null) _edgeLane[eb] = Math.max(_edgeLane[eb] || 0, laneB + 1);
  });

  // Fallback: if h had no paths[] (old format), try blankPaths for segments
  if (savedPaths.length === 0) {
    (h.blankPaths || []).forEach(([ea, eb]) => {
      if (!_segments.some(s => (s.ea===ea&&s.eb===eb)||(s.ea===eb&&s.eb===ea))) {
        _segments.push({ id: _nextId(), ea, eb });
      }
    });
  }
}

// ── DSL hex conversion (for hexToSvgInner + save) ─────────────────────────────

function _toDslHex() {
  // Build nodes[] and paths[] that hexToSvgInner understands.
  // Path endpoint convention: { type:'edge'|'node', n:int }
  const nodes = _nodes.map(n => {
    // Towns at the center snap must NOT carry locStr:'center' — that forces the
    // preview to (0,0) and bypasses computeTownPos, which picks the arc-midpoint
    // position from connected edges (gentle/sharp/straight curve).  The DSL emitter
    // already omits loc: for center towns, so the placed tile is always computed
    // correctly; the preview should match.  Omitting the key entirely (not setting
    // it to undefined) is the correct form — matching what parseDSL produces when
    // there is no loc: in the DSL string.
    // Cities keep locStr (including 'center') — a center city genuinely means
    // "pin to origin", and edge cities carry an explicit numeric locStr.
    const ls = (n.type === 'town' && n.locStr === 'center') ? null : (n.locStr || 'center');
    const node = { type: n.type, slots: n.slots ?? 1 };
    if (ls) node.locStr = ls;
    return node;
  });

  const paths = [];

  // Edge-to-node paths — expand multi-lane stubs into N paths with aLane+bLane offsets
  // so hexToSvgInner renders truly parallel tracks (matching tobymao Path.make_lanes:
  // for edge→node bLane=[N,i], same index as aLane — NOT reversed like edge→edge).
  _nodes.forEach((node, ni) => {
    const edges = _nodeEdges[node.id] || [];
    const terminal = node.terminal ? 1 : undefined;
    edges.forEach(edge => {
      const lc = (_nodeEdgeLane[node.id] || {})[edge] || 1;
      if (lc > 1) {
        for (let i = 0; i < lc; i++) {
          paths.push({ a: { type: 'edge', n: edge }, b: { type: 'node', n: ni },
                       aLane: [lc, i], bLane: [lc, i], terminal });
        }
      } else {
        paths.push({ a: { type: 'edge', n: edge }, b: { type: 'node', n: ni }, terminal });
      }
    });
  });

  // Node-to-node paths (e.g. Swansea city↔town, Wien city↔city)
  _nodePaths.forEach(np => {
    const niA = _nodes.findIndex(n => n.id === np.nodeAId);
    const niB = _nodes.findIndex(n => n.id === np.nodeBId);
    if (niA >= 0 && niB >= 0) {
      paths.push({ a: { type: 'node', n: niA }, b: { type: 'node', n: niB } });
    }
  });

  // Blank edge-to-edge segments — expand lanes for hexToSvgInner.
  // parseDslHex expands lanes:N → N paths each with aLane:[N,i] / bLane:[N,N-1-i].
  // hexToSvgInner requires that expanded form to draw parallel tracks.
  // For convergent single-lane paths (P9 pattern), assign aLane/bLane offsets so
  // parallel tracks are drawn at shared endpoint edges.
  // (_buildFinalModel also expands to N aLane:[N,i] paths, so placed hex renders correctly.)

  // Build per-edge max explicit lane value (0-indexed; total = max + 1).
  // Mirrors _buildFinalModel() exactly — only explicit laneA/laneB are emitted,
  // no auto-detect. This keeps the preview consistent with what is saved to the map.
  const _rEdgeMax = {};
  _segments.forEach(seg => {
    if (seg.laneA != null) _rEdgeMax[seg.ea] = Math.max(_rEdgeMax[seg.ea] || 0, seg.laneA);
    if (seg.laneB != null) _rEdgeMax[seg.eb] = Math.max(_rEdgeMax[seg.eb] || 0, seg.laneB);
  });

  _segments.forEach(seg => {
    const a = { type: 'edge', n: seg.ea };
    const b = { type: 'edge', n: seg.eb };
    const lanes = seg.lanes || 1;
    if (lanes <= 1) {
      const p = { a, b };
      if (seg.laneA != null && _rEdgeMax[seg.ea] > 0)
        p.aLane = [_rEdgeMax[seg.ea] + 1, seg.laneA];
      if (seg.laneB != null && _rEdgeMax[seg.eb] > 0)
        p.bLane = [_rEdgeMax[seg.eb] + 1, seg.laneB];
      paths.push(p);
    } else {
      for (let i = 0; i < lanes; i++) {
        paths.push({ a, b, aLane: [lanes, i], bLane: [lanes, lanes - 1 - i] });
      }
    }
  });

  // Compute exits: union of all edge endpoints
  const exitSet = new Set();
  _nodes.forEach(node => {
    (_nodeEdges[node.id] || []).forEach(e => exitSet.add(e));
  });
  _segments.forEach(seg => { exitSet.add(seg.ea); exitSet.add(seg.eb); });
  const exits = Array.from(exitSet).sort((a, b) => a - b);

  // blankPaths for DSL
  const blankPaths = _segments.map(s => [s.ea, s.eb]);

  // 'offboard' is the only feature value the renderer and exporter branch on.
  const feature = _nodes.some(n => n.type === 'offboard') ? 'offboard' : 'none';

  // Pass through stubs from the original hex (not editable in builder — shown read-only on canvas).
  const stubs = (_hexId && state.hexes[_hexId]?.stubs) || undefined;

  return { nodes, paths, exits, blankPaths, feature, bg: _bg,
           terrain: _terrain || undefined, terrainCost: _terrainCost || undefined,
           stubs: stubs?.length ? stubs : undefined };
}

// ── Final model builder ───────────────────────────────────────────────────────

function _buildFinalModel() {
  // 'offboard' is the only feature value the renderer and exporter branch on.
  const feature = _nodes.some(n => n.type === 'offboard') ? 'offboard' : 'none';

  const exitSet = new Set();
  _nodes.forEach(node => (_nodeEdges[node.id] || []).forEach(e => exitSet.add(e)));
  _segments.forEach(s => { exitSet.add(s.ea); exitSet.add(s.eb); });
  const exits = Array.from(exitSet).sort((a, b) => a - b);

  // exitPairs: per-node connected edge arrays.  Always written (even for single
  // nodes) so that staticHexCode() can distinguish node-connected exits from
  // bypass-segment edges when both exist on the same hex.
  const exitPairs = _nodes.map(n => _nodeEdges[n.id] || []);

  // nodes[] — rich format; type is stored as-is ('offboard' stays 'offboard').
  // originalType kept as fallback for old saves that stored 'city' with originalType:'offboard'.
  // Revenue uses the same field names as parseDslHex: flat (non-phase) / phaseRevenue.
  const nodes = _nodes.map(n => {
    const isPhase = n.phaseMode || n.type === 'offboard';
    return {
      type:         n.type,
      slots:        n.slots  ?? 1,
      locStr:       n.locStr || 'center',
      flat:         isPhase ? null : (n.revenue || 0),
      phaseRevenue: isPhase
                      ? { yellow: 0, green: 0, brown: 0, gray: 0, ...(n.phaseRevenue || {}) }
                      : null,
      terminal:     n.terminal || false,
      phaseMode:    isPhase,
    };
  });

  // paths[] — edge-to-node, node-to-node (Wien, Swansea), and edge-to-edge bypass
  // Edge-to-node multi-lane stubs are expanded to N separate paths with aLane:[N,i],
  // exactly as _toDslHex does, so hexToSvgInner can render parallel tracks on the map.
  const paths = [];
  _nodes.forEach((node, ni) => {
    (_nodeEdges[node.id] || []).forEach(edge => {
      const lc = (_nodeEdgeLane[node.id] || {})[edge] || 1;
      const terminal = node.terminal ? 1 : undefined;
      if (lc > 1) {
        // Mirror tobymao Path.make_lanes: for edge→node, bLane=[N,i] (same index as aLane,
        // NOT reversed — reversal only applies to edge→edge paths).
        for (let i = 0; i < lc; i++) {
          paths.push({ a: { type: 'edge', n: edge }, b: { type: 'node', n: ni },
                       aLane: [lc, i], bLane: [lc, i], terminal });
        }
      } else {
        paths.push({ a: { type: 'edge', n: edge }, b: { type: 'node', n: ni }, terminal });
      }
    });
  });
  _nodePaths.forEach(np => {
    const niA = _nodes.findIndex(n => n.id === np.nodeAId);
    const niB = _nodes.findIndex(n => n.id === np.nodeBId);
    if (niA >= 0 && niB >= 0)
      paths.push({ a: { type: 'node', n: niA }, b: { type: 'node', n: niB } });
  });
  // Compute edge max for lane array construction (0-indexed; total = max + 1)
  const _bmEdgeMax = {};
  _segments.forEach(seg => {
    if (seg.laneA != null) _bmEdgeMax[seg.ea] = Math.max(_bmEdgeMax[seg.ea] || 0, seg.laneA);
    if (seg.laneB != null) _bmEdgeMax[seg.eb] = Math.max(_bmEdgeMax[seg.eb] || 0, seg.laneB);
  });
  _segments.forEach(seg => {
    const sp = { a: { type: 'edge', n: seg.ea }, b: { type: 'edge', n: seg.eb } };
    if ((seg.lanes || 1) > 1) sp.lanes = seg.lanes;
    // Write aLane/bLane as [total, idx] so hexToSvgInner can render lane offsets on placed tiles.
    if (seg.laneA != null && _bmEdgeMax[seg.ea] > 0)
      sp.aLane = [_bmEdgeMax[seg.ea] + 1, seg.laneA];
    if (seg.laneB != null && _bmEdgeMax[seg.eb] > 0)
      sp.bLane = [_bmEdgeMax[seg.eb] + 1, seg.laneB];
    paths.push(sp);
  });

  const p0 = _nodes[0];

  // Phase revenue is active if any node has phaseMode, or any offboard is present.
  const usesPhaseRev = _nodes.some(n => n.type === 'offboard' || n.phaseMode);
  const phaseRevenue = usesPhaseRev
    ? (p0?.phaseRevenue && Object.keys(p0.phaseRevenue).length ? { ...p0.phaseRevenue } : { yellow: 20, green: 30, brown: 40, gray: 60 })
    : {};
  const activePhases = usesPhaseRev
    ? { yellow: true, green: true, brown: true, gray: true }
    : {};

  return {
    static:         true,
    bg:             _bg,
    feature,
    exits,
    exitPairs,
    nodes,
    paths,
    blankPaths:     _segments.map(s => [s.ea, s.eb]),
    rotation:       0,
    terminal:       p0?.terminal || false,
    taperStyle:     1,
    pathMode:       'star',
    pathPairs:      [],
    phaseRevenue,
    activePhases,
    label:          _label,
    name:           '',
    terrain:        _terrain      || undefined,
    terrainCost:    _terrainCost  || undefined,
    borders:        _borders.length ? _borders.map(b => ({ ...b })) : undefined,
  };
}

// ── Save ──────────────────────────────────────────────────────────────────────

function _save() {
  if (!_hexId) return;
  const model = _buildFinalModel();
  window.HBD?.log('save', `Saved hex ${_hexId}`, {
    feature: model.feature, bg: model.bg,
    nodes: model.nodes?.length, paths: model.paths?.length, exits: model.exits,
  });
  ensureHex(_hexId);
  Object.assign(state.hexes[_hexId], model);
  if (typeof updateHexPanel === 'function') updateHexPanel(_hexId);
  render();
  autosave();
}

// ── Open / close ──────────────────────────────────────────────────────────────

window.openHexBuilder = function (hexId) {
  _reset(hexId);
  const el = document.getElementById('hexBuilder');
  if (el) { el.style.display = 'flex'; }
  _buildPanel();
  window.HBD?.log('state', `Builder opened for hex ${hexId}`,
    { nodes: _nodes.length, segs: _segments.length, bg: _bg, tool: _activeTool });
};

// Backward-compatibility alias
window.openStaticHexWizard = window.openHexBuilder;

function _close() {
  const el = document.getElementById('hexBuilder');
  if (el) el.style.display = 'none';
  window.HBD?.log('state', 'Builder closed');
}

// ── Next manifest ID helper ───────────────────────────────────────────────────

function _nextManifestId() {
  const ct = state.customTiles || {};
  let max = 0;
  for (const key of Object.keys(ct)) {
    const m = key.match(/^ch(\d+)$/);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return 'ch' + String(max + 1).padStart(2, '0');
}

// ── Panel builder ─────────────────────────────────────────────────────────────

function _buildPanel() {
  const panel = document.getElementById('hbPanel');
  if (!panel) return;

  panel.innerHTML = _panelHtml();
  _bindPanel();
  _renderCanvas();
  _updateDslPreview();
}

function _bgHexColor() {
  return BG_OPTS.find(o => o.v === _bg)?.hex || '#EAE0C8';
}

function _bordersHtml() {
  if (!_borders.length) return '<div class="hb-hint">No borders defined</div>';
  return _borders.map((b, i) => {
    const col   = b.type === 'water'    ? '#3399ff'
                : b.type === 'province' ? '#ff8800'
                :                         '#d32020';
    const label = b.type === 'water'    ? 'Water'
                : b.type === 'province' ? 'Province'
                :                         'Impassable';
    return `
    <div class="hb-border-row">
      <span class="hb-border-dot" style="background:${col};"></span>
      <span class="hb-border-info">Edge ${b.edge} — ${label}${b.cost ? ` <span class="hb-border-cost-badge">+$${b.cost}</span>` : ''}</span>
      <button class="hb-btn-xs hb-btn-danger" data-remove-border="${i}" title="Remove">✕</button>
    </div>`;
  }).join('');
}

function _panelHtml() {
  const hexLabel = _hexId ? `[${_hexId}]` : '';
  return `
    <div class="hb-titlebar">
      <span class="hb-title">Hex Builder <span class="hb-hexid">${hexLabel}</span></span>
      <div class="hb-debug-tip">
        <button id="hbDebugBtn" class="hb-debug-btn" aria-label="Open debug logger">ℹ</button>
        <div class="hb-debug-tooltip">Build not rendering right?<br>Click to open the debug logger.</div>
      </div>
      <button class="hb-close" id="hbClose" title="Close">&#x2715;</button>
    </div>

    <div class="hb-color-rail" id="hbColorRail">
      ${BG_OPTS.map(o => `
        <button class="hb-color-btn${_bg === o.v ? ' active' : ''}"
          style="background:${o.hex};border-color:${_bg === o.v ? '#ffd700' : 'transparent'};"
          data-bg="${o.v}" title="${o.title}">
          <span class="hb-color-label">${o.label}</span>
        </button>`).join('')}
    </div>

    <div class="hb-main">
      <div class="hb-canvas-col">
        <svg id="hbCanvas" width="${CW}" height="${CH}" viewBox="0 0 ${CW} ${CH}"
             style="cursor:crosshair;user-select:none;display:block;"></svg>
      </div>

      <div class="hb-right-col">
        ${_toolbarHtml()}
        <div id="hbNodeConfig" class="hb-section">
          ${_nodeConfigHtml()}
        </div>
        <div class="hb-section">
          <div class="hb-section-label">Label</div>
          <input type="text" id="hbLabelInput" class="hb-text-input" value="${_esc(_label)}"
                 placeholder="e.g. P, OO, NY" autocomplete="off" maxlength="8">
        </div>
        <div class="hb-section">
          <div class="hb-section-label">Upgrade Cost &amp; Terrain</div>
          <div class="hb-field-row">
            <div class="hb-field" style="width:72px;">
              <div class="hb-field-label">Cost</div>
              <input type="number" id="hbTerrainCost" class="hb-num-input" min="0" step="10"
                     value="${_terrainCost || 0}" placeholder="0">
            </div>
            <div class="hb-field" style="flex:1;">
              <div class="hb-field-label">Terrain</div>
              <select id="hbTerrain" class="hb-select">
                ${['', 'hill', 'mountain', 'water', 'desert', 'swamp', 'river'].map(t =>
                  `<option value="${t}"${_terrain === t ? ' selected' : ''}>${t || '(none)'}</option>`
                ).join('')}
              </select>
            </div>
          </div>
        </div>
        <div class="hb-section">
          <div class="hb-section-label">Borders</div>
          <div id="hbBorderList">${_bordersHtml()}</div>
          <div class="hb-border-add-row">
            <select id="hbBorderEdge" class="hb-select-sm" style="max-width:76px;">
              ${[0,1,2,3,4,5].map(e => `<option value="${e}">Edge ${e}</option>`).join('')}
            </select>
            <select id="hbBorderType" class="hb-select-sm">
              <option value="impassable">Impassable</option>
              <option value="water">Water</option>
              <option value="province">Province</option>
            </select>
            <input type="number" id="hbBorderCost" class="hb-num-input hb-border-cost-input"
                   min="0" step="10" placeholder="$" title="Crossing cost (optional)">
            <button class="hb-btn-secondary hb-btn-xs" id="hbAddBorder">+ Add</button>
          </div>
        </div>
      </div>
    </div>

    <div class="hb-dsl-row">
      <pre id="hbDslPreview" class="hb-dsl-pre"></pre>
      <button class="hb-dsl-copy" id="hbDslCopy" title="Copy DSL to clipboard">Copy</button>
    </div>

    <div class="hb-footer">
      <button class="hb-btn-cancel" id="hbBtnCancel">Cancel</button>
      <div class="hb-footer-right">
        <button class="hb-btn-secondary" id="hbBtnManifest" title="Save to tile manifest without placing on map">Save to Manifest</button>
        <button class="hb-btn-primary"   id="hbBtnPlace"    title="Place tile on map">Place</button>
      </div>
    </div>

    <div id="hbManifestForm" class="hb-manifest-form" style="display:none;">
      ${_manifestFormHtml()}
    </div>`;
}

function _toolbarHtml() {
  // Node type — determines what gets created when you click an empty snap.
  // Track tool — connect nodes to each other or to edges via click-then-click.
  const showOff = (_bg === 'red');
  const tools = [
    { id: 'town',     label: 'Town',     icon: '&#9670;',  title: 'Place towns — click snap, or click edge then snap' },
    { id: 'city',     label: 'City',     icon: '&#9675;',  title: 'Place cities — click snap, or click edge then snap' },
    ...(showOff ? [{ id: 'offboard', label: 'Offboard', icon: '&#10022;', title: 'Place offboard revenue hex' }] : []),
    { id: 'junction', label: 'Junction', icon: '&#9737;',  title: 'Place junction — routes pass through without tokens (e.g. tile 80)' },
    { id: 'track',    label: 'Track',    icon: '&#9135;',  title: 'Connect nodes to each other or to edges — click node, then click another node or edge' },
  ];
  const hint = _activeTool === 'track'
    ? 'Click a node, then another node or an edge to connect'
    : _activeTool === 'erase'
    ? 'Click an edge circle, a node, or a track midpoint to remove it'
    : 'Click an edge, then: another edge (bypass), a node (connect), or empty snap (place + connect)';
  return `<div class="hb-section">
    <div class="hb-section-label">Tool</div>
    <div class="hb-toolbar" id="hbToolbar">
      ${tools.map(t => `
        <button class="hb-tool-btn${_activeTool === t.id ? ' active' : ''}"
          data-tool="${t.id}" title="${t.title}">${t.icon} ${t.label}</button>`).join('')}
      <span class="hb-toolbar-sep"></span>
      <button class="hb-tool-btn${_activeTool === 'erase' ? ' active' : ''}"
        data-tool="erase" title="Erase nodes and connections">&#10006; Erase</button>
    </div>
    <div class="hb-hint" id="hbToolHint">${hint}</div>
  </div>`;
}

function _nodeConfigHtml() {
  const node = _nodes.find(n => n.id === _selectedNodeId);
  if (!node) {
    return `<div class="hb-section-label">Node Config</div>
      <div class="hb-node-empty">
        <div class="hb-node-empty-icon">&#9675;</div>
        <div>Click a city or town on the canvas to set revenue, slots, and more</div>
      </div>`;
  }
  // Phase revenue rules:
  //   white/yellow/green/brown — tile color IS the phase; no phase revenue UI
  //   gray  — permanent board hex may have phase revenue (e.g. 1822 e6); checkbox opt-in
  //   red   — offboard; always phase revenue, no checkbox needed
  //   offboard node type — always phase revenue regardless of tile color
  const isRedOrOff  = _bg === 'red' || node.type === 'offboard';
  const canOptPhase = _bg === 'gray' && node.type !== 'offboard';
  const isPhaseMode = isRedOrOff || (canOptPhase && !!node.phaseMode);

  const phaseGrid = () => `<div class="hb-field"><div class="hb-field-label">Revenue by phase</div>
    <div class="hb-phase-rows">
      ${PHASES.map(p => `
        <div class="hb-phase-row">
          <span class="hb-phase-dot" style="background:${PHASE_COLORS[p]};"></span>
          <span class="hb-phase-label">${p}</span>
          <input class="hb-rev-input shw-rev-input" type="number" min="0" step="10"
            value="${node.phaseRevenue?.[p] ?? 0}" data-phase="${p}">
        </div>`).join('')}
    </div></div>`;

  // Junction nodes have no revenue or slots — show a simple info panel
  if (node.type === 'junction') {
    return `<div class="hb-section-label">Node Config — <span style="color:#ffd700;">Junction</span></div>
      <div class="hb-hint">Junctions pass routes through without tokens or revenue.<br>Use Track tool or click edge dots to connect edges.</div>`;
  }

  let html = `<div class="hb-section-label">Node Config — <span style="text-transform:capitalize;color:#ffd700;">${node.type}</span></div>
    <div class="hb-hint" style="margin-bottom:4px;">Click edge dots to connect/disconnect</div>`;

  if (isRedOrOff) {
    // Red / offboard: phase revenue always shown, no toggle
    html += phaseGrid();
  } else if (canOptPhase) {
    // Gray non-offboard: optional phase revenue (could be terminal tile or permanent board feature)
    html += `<div class="hb-check-row">
      <input type="checkbox" id="hbPhaseMode" ${node.phaseMode ? 'checked' : ''}>
      <label for="hbPhaseMode">Phase revenue</label>
    </div>`;
    if (node.phaseMode) {
      html += phaseGrid();
    } else {
      html += `<div class="hb-field">
        <div class="hb-field-label">Revenue</div>
        <input type="number" id="hbRevenue" class="hb-num-input" min="0" step="10" value="${node.revenue || 0}">
      </div>`;
    }
  } else {
    // white/yellow/green/brown: flat revenue only
    html += `<div class="hb-field">
      <div class="hb-field-label">Revenue</div>
      <input type="number" id="hbRevenue" class="hb-num-input" min="0" step="10" value="${node.revenue || 0}">
    </div>`;
  }

  if (node.type === 'city') {
    html += `<div class="hb-field">
      <div class="hb-field-label">Slots</div>
      <div class="hb-slot-btns">
        ${[0, 1, 2, 3, 4].map(s => `<button class="hb-slot-btn${(node.slots ?? 1) === s ? ' active' : ''}" data-slots="${s}">${s === 0 ? '0 (port)' : s}</button>`).join('')}
      </div>
    </div>`;
  }

  if (node.type === 'city' || node.type === 'offboard') {
    html += `<div class="hb-check-row">
      <input type="checkbox" id="hbTerminal" ${node.terminal ? 'checked' : ''}>
      <label for="hbTerminal">Terminal (dead-end)</label>
    </div>`;
  }

  return html;
}

function _manifestFormHtml() {
  const nextId = _nextManifestId();
  if (!_manifestId) _manifestId = nextId;
  return `<div class="hb-manifest-inner">
    <div class="hb-section-label">Save to Manifest</div>
    <div class="hb-manifest-row">
      <div class="hb-field" style="flex:1;">
        <div class="hb-field-label">ID</div>
        <input type="text" id="hbManId" class="hb-text-input" value="${_esc(_manifestId)}" placeholder="${nextId}">
      </div>
      <div class="hb-field" style="width:80px;">
        <div class="hb-field-label">Count</div>
        <input type="number" id="hbManCount" class="hb-num-input" min="1" max="99" value="${_manifestCount}">
      </div>
      <div class="hb-field" style="flex:2;">
        <div class="hb-field-label">Label</div>
        <input type="text" id="hbManLabel" class="hb-text-input" value="${_esc(_label)}" placeholder="optional">
      </div>
    </div>
    <div style="display:flex;gap:8px;margin-top:8px;">
      <button class="hb-btn-primary"   id="hbManSave">Save to Manifest</button>
      <button class="hb-btn-secondary" id="hbManFork"></button>
    </div>
  </div>`;
}

function _esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Canvas rendering ──────────────────────────────────────────────────────────

function _renderCanvas() {
  const svg = document.getElementById('hbCanvas');
  if (!svg) return;

  const cornerPts = CORNERS.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const off = _orientOff();
  // Everything inside this group rotates together: hex polygon, content, snaps, edge circles.
  // hexToSvgInner always works in flat-top space; the outer rotate(off) brings the result
  // to pointy orientation for pointy-top maps — same contract as the main render loop.
  let s = `<g transform="rotate(${off}, ${CCX}, ${CCY})">`;

  // Hex background
  s += `<polygon points="${cornerPts}" fill="${_bgHexColor()}" stroke="#888" stroke-width="2"/>`;

  // ── Live hex content via hexToSvgInner ─────────────────────────────────────
  const dsl = _toDslHex();
  if (typeof hexToSvgInner === 'function' && (dsl.nodes.length > 0 || dsl.paths.length > 0)) {
    try {
      const inner = hexToSvgInner(dsl, null);
      if (inner) {
        s += `<g transform="translate(${CCX},${CCY}) scale(${SC})">${inner}</g>`;
      }
    } catch (e) {
      // silently ignore render errors in preview
    }
  }

  // ── Snap targets ──────────────────────────────────────────────────────────
  // Always show when a pending edge is set (any node type can be connected).
  // Also show when in town/city/offboard mode for direct placement.
  const showSnaps = (_pendingEdge !== null) || (_activeTool !== 'erase');
  if (showSnaps) {
    for (const snap of SNAP_POSITIONS) {
      const existing = _nodes.find(n => n.locStr === snap.locStr);
      // Hide dot where node already sits (unless it's an expandable city)
      if (existing && !(existing.type === 'city' && (existing.slots || 1) < 4)) continue;

      const isHighlight = (_highlightSnap === snap.locStr);
      // Highlight more strongly when a pending edge is set (these are valid drop targets)
      const isPendingTarget = _pendingEdge !== null;
      const fill   = isHighlight ? '#ffd700' : (isPendingTarget ? 'rgba(255,215,0,0.15)' : 'rgba(200,200,200,0.15)');
      const stroke = isHighlight ? '#ffd700' : (isPendingTarget ? 'rgba(255,215,0,0.4)'  : 'rgba(200,200,200,0.4)');
      s += `<circle cx="${snap.x.toFixed(1)}" cy="${snap.y.toFixed(1)}" r="8"
               fill="${fill}" stroke="${stroke}" stroke-width="1.5"
               pointer-events="none"/>`;
    }
  }

  // ── Node hit circles (Track tool) ─────────────────────────────────────────
  // Drawn OVER the hex content so they're clickable. Shown whenever Track tool
  // is active or a node-pending state is in progress.
  const showNodeHits = (_activeTool === 'track' || _pendingNode !== null);
  if (showNodeHits) {
    for (const node of _nodes) {
      const snap = SNAP_POSITIONS.find(sp => sp.locStr === node.locStr);
      if (!snap) continue;
      const isPendingSrc = (_pendingNode === node.id);
      const fill   = isPendingSrc ? 'rgba(255,215,0,0.45)' : 'rgba(80,200,255,0.25)';
      const stroke = isPendingSrc ? '#ffd700' : '#5bc8ff';
      s += `<circle cx="${snap.x.toFixed(1)}" cy="${snap.y.toFixed(1)}" r="18"
               fill="${fill}" stroke="${stroke}" stroke-width="${isPendingSrc ? 2.5 : 1.5}"
               data-node-id="${node.id}" style="cursor:pointer;"/>`;
    }
  }

  // ── Node-to-node path lines (visual only — topology rendered by hexToSvgInner) ─
  // When there are nodePaths between nodes at distinct positions, draw a dashed line.
  for (const np of _nodePaths) {
    const nA = _nodes.find(n => n.id === np.nodeAId);
    const nB = _nodes.find(n => n.id === np.nodeBId);
    if (!nA || !nB || nA.locStr === nB.locStr) continue;
    const sA = SNAP_POSITIONS.find(sp => sp.locStr === nA.locStr);
    const sB = SNAP_POSITIONS.find(sp => sp.locStr === nB.locStr);
    if (!sA || !sB) continue;
    s += `<line x1="${sA.x.toFixed(1)}" y1="${sA.y.toFixed(1)}"
               x2="${sB.x.toFixed(1)}" y2="${sB.y.toFixed(1)}"
               stroke="#5bc8ff" stroke-width="3" stroke-dasharray="6,4"
               opacity="0.7" pointer-events="none"/>`;
  }

  // ── Pending edge glow ──────────────────────────────────────────────────────
  if (_pendingEdge !== null) {
    const [px, py] = EMP[_pendingEdge];
    s += `<circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="${EDGE_R + 6}"
             fill="#ffd700" opacity="0.35" pointer-events="none"/>`;
  }

  // ── Pending node glow ─────────────────────────────────────────────────────
  if (_pendingNode !== null) {
    const pn = _nodes.find(n => n.id === _pendingNode);
    const pSnap = pn && SNAP_POSITIONS.find(sp => sp.locStr === pn.locStr);
    if (pSnap) {
      s += `<circle cx="${pSnap.x.toFixed(1)}" cy="${pSnap.y.toFixed(1)}" r="26"
               fill="#ffd700" opacity="0.20" pointer-events="none"/>`;
    }
  }

  // ── Edge circles (always visible) ─────────────────────────────────────────
  // Color key: yellow = pending start, green = has a connection, dark = unconnected.
  // When a node is selected its connected edges glow brighter green.
  // Circles are pushed outward from center by EDGE_R so they sit just outside the
  // hex polygon — freeing the actual edge midpoint (track endpoint) from occlusion.
  //
  // Lane subscripts: connected edges show a small lane-index indicator.
  // Lane +/- controls: when Track tool is active, hovering an edge with track shows
  //   "+" / "−" side-buttons to advance/retreat the per-edge lane cursor.
  const selEdges = _selectedNodeId ? (_nodeEdges[_selectedNodeId] || []) : [];
  for (let e = 0; e < 6; e++) {
    const [ex, ey] = EMP[e];
    const ddx = ex - CCX, ddy = ey - CCY;
    const ddist = Math.hypot(ddx, ddy) || 1;
    const cx = ex + ddx / ddist * EDGE_R;   // circle center, just outside hex boundary
    const cy = ey + ddy / ddist * EDGE_R;

    const connectedToNode = _nodes.some(n => (_nodeEdges[n.id] || []).includes(e));
    const edgeSegs        = _segments.filter(seg => seg.ea === e || seg.eb === e);
    const connectedSeg    = edgeSegs.length > 0;
    const hasTrack        = connectedToNode || connectedSeg;
    const isSelEdge  = selEdges.includes(e);
    const isPending  = (_pendingEdge === e);
    const fill   = isPending  ? '#c8a000'
                 : isSelEdge  ? '#3d9a2a'
                 : connectedToNode ? '#2a6a1a'
                 : connectedSeg    ? '#1a4a6a'
                 : '#333';
    const stroke = isPending ? '#ffd700' : isSelEdge ? '#7ddf60' : '#111';
    const sw     = isPending ? 2.5 : isSelEdge ? 2 : 1.5;

    s += `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${EDGE_R}"
             fill="${fill}" stroke="${stroke}" stroke-width="${sw}"
             data-edge="${e}" style="cursor:pointer;"/>`;

    // Edge number — lifted into the top half when a lane subscript shares the circle
    const numY = hasTrack ? cy - 0.5 : cy + 4;
    s += `<text x="${cx.toFixed(1)}" y="${numY.toFixed(1)}"
             text-anchor="middle" font-size="10" font-weight="bold" fill="white"
             pointer-events="none">${e}</text>`;

    // Lane subscript — when track tool is active and this edge is hovered, show the
    // cursor value (yellow) so +/- feedback is immediate.  hasTrack covers both node
    // stubs and bypass segments so the cursor is visible before the first bypass is drawn.
    // When not hovering, show the bypass segment lane indices instead.
    if (hasTrack) {
      const segsHere = _segments.filter(sg => sg.ea === e || sg.eb === e);
      let label, laneColor;
      if (_activeTool === 'track' && _hoveredEdge === e) {
        // Cursor mode: show what lane the next draw will use
        const cursor = _edgeLane[e] || 0;
        label = String(cursor);
        laneColor = cursor > 0 ? '#ffd700' : 'rgba(255,255,255,0.50)';
      } else {
        // Collect ALL occupied lane indices for this edge.
        // Multi-lane segments (lanes:N) occupy [laneA, laneA+1, …] on the ea side and
        // [0, 1, …, N-1] on the eb side (reversal pattern from parseDslHex expansion).
        const laneVals = [];
        for (const sg of segsHere) {
          const baseLane = sg.ea === e ? sg.laneA : sg.laneB;
          if (baseLane == null) continue;
          const n = sg.lanes || 1;
          if (n > 1) {
            if (sg.ea === e) {
              // ea: expands as [baseLane, baseLane+1, …, baseLane+N-1]
              for (let i = 0; i < n; i++) laneVals.push(baseLane + i);
            } else {
              // eb: bLane is the HIGHEST (N-1), so occupied set is [0, 1, …, N-1]
              for (let i = 0; i < n; i++) laneVals.push(i);
            }
          } else {
            laneVals.push(baseLane);
          }
        }
        label = laneVals.length > 0
          ? [...new Set(laneVals)].sort((a, b) => a - b).join(',')
          : '0';  // track exists but no explicit lane — default lane 0
        const hasAdvanced = laneVals.some(l => l > 0);
        laneColor = hasAdvanced ? '#7ac8ff' : 'rgba(255,255,255,0.40)';
      }
      s += `<text x="${cx.toFixed(1)}" y="${(cy + 9.5).toFixed(1)}"
               text-anchor="middle" font-size="8" fill="${laneColor}"
               pointer-events="none">${_esc(label)}</text>`;
    }

    // Lane +/- controls: Track tool active, edge has any track (node stub OR bypass), hovered.
    // "+" advances the lane cursor (next draw through this edge lands on a new lane).
    // "−" retreats it (min 0).  Shown for node-stub edges too so the cursor can be set
    // before the first bypass is drawn through that edge.
    if (_activeTool === 'track' && _hoveredEdge === e && hasTrack) {
      const cursor = _edgeLane[e] || 0;   // 0-indexed: next draw on this edge uses lane `cursor`
      // Perpendicular direction (tangential to hex perimeter)
      const perpX = -ddy / ddist;
      const perpY =  ddx / ddist;
      const pOff  = 21;

      const plusCx  = cx + perpX * pOff;
      const plusCy  = cy + perpY * pOff;
      const minusCx = cx - perpX * pOff;
      const minusCy = cy - perpY * pOff;

      // "+" shown only when cursor < 3 (max lane index = 3; renderer supports ≤4 lanes)
      if (cursor < 3) {
        s += `<circle cx="${plusCx.toFixed(1)}" cy="${plusCy.toFixed(1)}" r="9"
                 fill="#1a3060" stroke="#4a7aff" stroke-width="1.5"
                 data-edge-plus="${e}" style="cursor:pointer;" title="Next lane: ${cursor} → ${cursor + 1}"/>`;
        s += `<text x="${plusCx.toFixed(1)}" y="${(plusCy + 4.5).toFixed(1)}"
                 text-anchor="middle" font-size="13" font-weight="bold" fill="#7ac8ff"
                 pointer-events="none">+</text>`;
      }

      // "−" only when cursor > 0
      if (cursor > 0) {
        s += `<circle cx="${minusCx.toFixed(1)}" cy="${minusCy.toFixed(1)}" r="9"
                 fill="#3a1010" stroke="#a06060" stroke-width="1.5"
                 data-edge-minus="${e}" style="cursor:pointer;" title="Prev lane: ${cursor} → ${cursor - 1}"/>`;
        s += `<text x="${minusCx.toFixed(1)}" y="${(minusCy + 4.5).toFixed(1)}"
                 text-anchor="middle" font-size="13" font-weight="bold" fill="#f88"
                 pointer-events="none">−</text>`;
      }
    }
  }

  // ── Lane-count badges for multi-lane segments ─────────────────────────────
  // Shown at segment midpoint; click cycles lanes 1→2→3→4→1.
  // Only show a prominent badge when lanes > 1.  For single-lane (the default),
  // draw a tiny invisible hit-target so the midpoint is still clickable to bump
  // lanes up, but don't clutter the fork with misleading "×1" labels.
  if (_activeTool !== 'erase') {
    for (const seg of _segments) {
      const lanes = seg.lanes || 1;
      const [ax, ay] = EMP[seg.ea];
      const [bx, by] = EMP[seg.eb];
      const mx2 = (ax + bx) / 2, my2 = (ay + by) / 2;
      if (lanes > 1) {
        // Prominent badge: blue circle with ×N label
        s += `<circle cx="${mx2.toFixed(1)}" cy="${my2.toFixed(1)}" r="11"
                 fill="#4a7aff" stroke="#8ab0ff" stroke-width="1.5"
                 data-seg-id="${seg.id}" style="cursor:pointer;" title="Double-track — click to change lane count"/>`;
        s += `<text x="${mx2.toFixed(1)}" y="${(my2 + 4).toFixed(1)}"
                 text-anchor="middle" font-size="10" font-weight="bold" fill="white"
                 pointer-events="none">×${lanes}</text>`;
      } else {
        // Invisible hit target only — no badge drawn for single-lane segments
        s += `<circle cx="${mx2.toFixed(1)}" cy="${my2.toFixed(1)}" r="12"
                 fill="transparent" stroke="none"
                 data-seg-id="${seg.id}" style="cursor:pointer;" title="Single-lane — click to add double-track"/>`;
      }
    }
  }

  // ── Border lines ──────────────────────────────────────────────────────────
  // Drawn last so they appear on top of the hex face, just like tobymao's border
  // pass renders after track. Color encodes border type; cost badge at midpoint.
  for (const border of _borders) {
    const e = border.edge;
    const [x1, y1] = CORNERS[(e + 1) % 6];
    const [x2, y2] = CORNERS[(e + 2) % 6];
    const col = border.type === 'water'    ? '#3399ff'
              : border.type === 'province' ? '#ff8800'
              :                              '#d32020';   // impassable
    s += `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}"
               x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}"
               stroke="${col}" stroke-width="7" stroke-linecap="round"
               opacity="0.88" pointer-events="none"/>`;
    if (border.cost) {
      const [mx, my] = EMP[e];
      s += `<text x="${mx.toFixed(1)}" y="${(my + 4.5).toFixed(1)}"
               text-anchor="middle" font-size="11" font-weight="bold"
               fill="${col}" stroke="#fff" stroke-width="3" paint-order="stroke"
               pointer-events="none">${border.cost}</text>`;
    }
  }

  s += `</g>`; // close rotate group
  svg.innerHTML = s;
}

// ── DSL preview ───────────────────────────────────────────────────────────────

function _updateDslPreview() {
  const pre = document.getElementById('hbDslPreview');
  if (!pre) return;
  const model = _buildFinalModel();
  const dsl = (typeof window.staticHexCode === 'function') ? window.staticHexCode(model) : '';
  pre.textContent = dsl || '(blank hex — no tracks)';
}

// ── Nearest snap position ─────────────────────────────────────────────────────

function _nearestSnap(mx, my) {
  let best = null, bestD = Infinity;
  for (const snap of SNAP_POSITIONS) {
    const d = Math.hypot(mx - snap.x, my - snap.y);
    if (d < bestD) { bestD = d; best = snap; }
  }
  return best;
}

// ── Panel event binding ───────────────────────────────────────────────────────

function _bindPanel() {
  // Debug logger toggle
  const debugBtn = document.getElementById('hbDebugBtn');
  if (debugBtn) debugBtn.onclick = () => {
    window.HBD?.toggle();
    // Pulse the button to confirm the action
    debugBtn.classList.add('hb-debug-btn--active');
    setTimeout(() => debugBtn.classList.remove('hb-debug-btn--active'), 600);
  };

  // Close
  const closeBtn = document.getElementById('hbClose');
  if (closeBtn) closeBtn.onclick = _close;

  // Cancel
  const cancelBtn = document.getElementById('hbBtnCancel');
  if (cancelBtn) cancelBtn.onclick = _close;

  // Place
  const placeBtn = document.getElementById('hbBtnPlace');
  if (placeBtn) placeBtn.onclick = () => { _save(); _close(); };

  // Save to Manifest (no map placement)
  const manBtn = document.getElementById('hbBtnManifest');
  if (manBtn) manBtn.onclick = () => {
    _showManifest = !_showManifest;
    const mf = document.getElementById('hbManifestForm');
    if (mf) {
      mf.style.display = _showManifest ? 'block' : 'none';
      if (_showManifest) { mf.innerHTML = _manifestFormHtml(); _bindManifestForm(); }
    }
  };

  // Color rail
  const rail = document.getElementById('hbColorRail');
  if (rail) rail.addEventListener('click', e => {
    const btn = e.target.closest('[data-bg]');
    if (!btn) return;
    const prev = _bg;
    _bg = btn.dataset.bg;
    window.HBD?.log('state', `BG color: ${prev} → ${_bg}`);
    // Rebuild panel (bg change affects toolbar, node config, etc.)
    _buildPanel();
  });

  // Toolbar
  const toolbar = document.getElementById('hbToolbar');
  if (toolbar) toolbar.addEventListener('click', e => {
    const btn = e.target.closest('[data-tool]');
    if (!btn) return;
    const prevTool = _activeTool;
    _activeTool = btn.dataset.tool;
    _pendingEdge = null;
    if (_activeTool !== prevTool) window.HBD?.log('state', `Tool: ${prevTool} → ${_activeTool}`);
    _refreshToolbar();
    _renderCanvas();
  });

  // Canvas
  const canvas = document.getElementById('hbCanvas');
  if (canvas) {
    canvas.addEventListener('click', _onCanvasClick);
    canvas.addEventListener('mousemove', _onCanvasMouseMove);
    canvas.addEventListener('mouseleave', () => {
      _highlightSnap = null;
      _hoveredEdge   = null;
      _renderCanvas();
    });
  }

  // Label input
  const lblInput = document.getElementById('hbLabelInput');
  if (lblInput) lblInput.addEventListener('input', e => {
    _label = e.target.value.trim();
    _updateDslPreview();
  });

  // Terrain cost
  const costInput = document.getElementById('hbTerrainCost');
  if (costInput) costInput.addEventListener('input', e => {
    const prev = _terrainCost;
    _terrainCost = parseInt(e.target.value) || 0;
    window.HBD?.log('state', `Terrain cost: ${prev} → ${_terrainCost}`);
    _updateDslPreview();
  });

  // Terrain type
  const terrainSel = document.getElementById('hbTerrain');
  if (terrainSel) terrainSel.addEventListener('change', e => {
    const prev = _terrain;
    _terrain = e.target.value;
    window.HBD?.log('state', `Terrain type: '${prev}' → '${_terrain}'`);
    _updateDslPreview();
  });

  // Borders list (delegation — remove buttons)
  const borderList = document.getElementById('hbBorderList');
  if (borderList) borderList.addEventListener('click', e => {
    const btn = e.target.closest('[data-remove-border]');
    if (!btn) return;
    const idx = parseInt(btn.dataset.removeBorder, 10);
    window.HBD?.log('state', `Border removed: edge ${_borders[idx]?.edge}`);
    _borders.splice(idx, 1);
    borderList.innerHTML = _bordersHtml();
    _renderCanvas();
    _updateDslPreview();
  });

  // Add border button
  const addBorderBtn = document.getElementById('hbAddBorder');
  if (addBorderBtn) addBorderBtn.addEventListener('click', () => {
    const edgeSel  = document.getElementById('hbBorderEdge');
    const typeSel  = document.getElementById('hbBorderType');
    const costEl   = document.getElementById('hbBorderCost');
    const edge = parseInt(edgeSel?.value ?? 0, 10);
    const type = typeSel?.value || 'impassable';
    const cost = parseInt(costEl?.value || '0', 10) || 0;
    if (!_borders.some(b => b.edge === edge)) {
      const nb = { edge, type };
      if (cost) nb.cost = cost;
      if (type === 'province') nb.color = 'black';
      _borders.push(nb);
      window.HBD?.log('state', `Border added: edge ${edge}, type ${type}${cost ? ', cost ' + cost : ''}`);
      const bl = document.getElementById('hbBorderList');
      if (bl) bl.innerHTML = _bordersHtml();
      _renderCanvas();
      _updateDslPreview();
    }
  });

  // Node config events (delegated to hbNodeConfig)
  _bindNodeConfig();

  // DSL copy button
  const copyBtn = document.getElementById('hbDslCopy');
  if (copyBtn) copyBtn.onclick = () => {
    const dsl = document.getElementById('hbDslPreview')?.textContent?.trim();
    if (!dsl || dsl.startsWith('(')) return;
    navigator.clipboard?.writeText(dsl).then(() => {
      copyBtn.textContent = '✓ Copied';
      copyBtn.classList.add('copied');
      setTimeout(() => { copyBtn.textContent = 'Copy'; copyBtn.classList.remove('copied'); }, 1600);
    });
  };

  // Backdrop click to close
  const overlay = document.getElementById('hexBuilder');
  if (overlay) overlay.addEventListener('click', e => {
    if (e.target === overlay) _close();
  });
}

function _refreshToolbar() {
  const toolbar = document.getElementById('hbToolbar');
  if (!toolbar) return;
  toolbar.querySelectorAll('[data-tool]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tool === _activeTool);
  });
  const hint = document.getElementById('hbToolHint');
  if (hint) {
    hint.textContent = _activeTool === 'track'
      ? 'Click a node (glowing circle), then click another node or edge to connect'
      : 'Click an edge, then: another edge (bypass), a node (connect), or empty space (place & connect)';
  }
}

function _bindNodeConfig() {
  const cfg = document.getElementById('hbNodeConfig');
  if (!cfg) return;

  // Revenue input
  cfg.addEventListener('input', e => {
    const node = _nodes.find(n => n.id === _selectedNodeId);
    if (!node) return;
    if (e.target.id === 'hbRevenue') {
      const prev = node.revenue;
      node.revenue = parseInt(e.target.value) || 0;
      window.HBD?.log('node', `Node ${node.id} revenue: ${prev} → ${node.revenue}`);
      _updateDslPreview();
    }
    if (e.target.dataset.phase) {
      if (!node.phaseRevenue) node.phaseRevenue = {};
      const ph = e.target.dataset.phase;
      const prev = node.phaseRevenue[ph];
      node.phaseRevenue[ph] = parseInt(e.target.value) || 0;
      window.HBD?.log('node', `Node ${node.id} phaseRevenue.${ph}: ${prev} → ${node.phaseRevenue[ph]}`);
      _updateDslPreview();
    }
  });

  cfg.addEventListener('change', e => {
    const node = _nodes.find(n => n.id === _selectedNodeId);
    if (!node) return;
    if (e.target.id === 'hbPhaseMode') {
      node.phaseMode = e.target.checked;
      window.HBD?.log('node', `Node ${node.id} phaseMode → ${node.phaseMode}`);
      _refreshNodeConfig();
    }
    if (e.target.id === 'hbTerminal') {
      node.terminal = e.target.checked;
      window.HBD?.log('node', `Node ${node.id} terminal → ${node.terminal}`);
      _updateDslPreview();
    }
  });

  cfg.addEventListener('click', e => {
    const slotBtn = e.target.closest('[data-slots]');
    if (!slotBtn) return;
    const node = _nodes.find(n => n.id === _selectedNodeId);
    if (!node) return;
    const prev = node.slots;
    node.slots = parseInt(slotBtn.dataset.slots);
    window.HBD?.log('node', `Node ${node.id} slots: ${prev} → ${node.slots} (via slot btn)`);
    _refreshNodeConfig();
    _renderCanvas();
    _updateDslPreview();
  });
}

function _refreshNodeConfig() {
  const cfg = document.getElementById('hbNodeConfig');
  if (!cfg) return;
  cfg.innerHTML = _nodeConfigHtml();
  _bindNodeConfig();
  _updateDslPreview();
}

// Color upgrade chain: white→yellow→green→brown→gray (gray is the terminal phase).
// Red and blue are off-board/water types — no upgrade path.
const UPGRADE_CHAIN = { white: 'yellow', yellow: 'green', green: 'brown', brown: 'gray' };

function _bindManifestForm() {
  const saveBtn = document.getElementById('hbManSave');
  if (saveBtn) saveBtn.onclick = () => {
    const idInput    = document.getElementById('hbManId');
    const countInput = document.getElementById('hbManCount');
    const lblInput   = document.getElementById('hbManLabel');
    const id    = (idInput?.value.trim()  || _nextManifestId());
    const count = parseInt(countInput?.value || '1');
    const label = lblInput?.value.trim() || _label;
    _manifestId = id;  // remember for fork
    _manifestCount = count;
    const model = { ...(_buildFinalModel()), label };
    state.customTiles = state.customTiles || {};
    state.customTiles[id] = { count, hex: model };
    // Also register in the tile manifest so it appears in the Tile Manifest view.
    // Preserve an existing count (user may have edited it there) but always write
    // the tile def so a re-save reflects the latest build.
    state.manifest = state.manifest || {};
    if (!(id in state.manifest)) state.manifest[id] = count;
    autosave();
    // Visual feedback
    saveBtn.textContent = 'Saved ✓';
    setTimeout(() => { saveBtn.textContent = 'Save to Manifest'; }, 1500);
    // Enable fork button now that we have a saved ID to fork from
    const forkBtn = document.getElementById('hbManFork');
    if (forkBtn) {
      const nextColor = UPGRADE_CHAIN[_bg];
      forkBtn.disabled = !nextColor;
      forkBtn.textContent = nextColor ? `Fork as ${nextColor} upgrade →` : 'No upgrade (fully upgraded)';
    }
  };

  const forkBtn = document.getElementById('hbManFork');
  if (forkBtn) {
    const nextColor = UPGRADE_CHAIN[_bg];
    forkBtn.disabled = !nextColor;
    forkBtn.textContent = nextColor ? `Fork as ${nextColor} upgrade →` : 'No upgrade (fully upgraded)';
    forkBtn.onclick = () => {
      const next = UPGRADE_CHAIN[_bg];
      if (!next) return;
      // Advance color, keep full topology
      _bg = next;
      // Suggest next manifest ID (ch01 → ch02, or append 'u')
      const m = (_manifestId || '').match(/^(.+?)(\d+)$/);
      _manifestId = m ? m[1] + (parseInt(m[2]) + 1) : (_manifestId || 'ch01') + 'u';
      // Hide form, rebuild panel (new color affects toolbar + node config defaults)
      _showManifest = false;
      _buildPanel();
    };
  }
}

// ── Canvas interaction ────────────────────────────────────────────────────────

function _onCanvasMouseMove(e) {
  const rect = e.currentTarget.getBoundingClientRect();
  _mousePos.x = e.clientX - rect.left;
  _mousePos.y = e.clientY - rect.top;

  // Highlight nearest snap whenever snaps are visible
  if (_activeTool !== 'erase') {
    const snap = _nearestSnapAt(_mousePos.x, _mousePos.y);
    const newHl = snap?.locStr || null;
    if (newHl !== _highlightSnap) {
      _highlightSnap = newHl;
      _renderCanvas();
    }
  }

  // Track which edge circle (including its +/- side-buttons) is under the cursor.
  // Used to show lane +/- controls when Track tool is active.
  if (_activeTool === 'track') {
    const rp = _unrotate(_mousePos.x, _mousePos.y);
    let newHovEdge = null;
    for (let ei = 0; ei < 6; ei++) {
      const [ex, ey] = EMP[ei];
      const ddx = ex - CCX, ddy = ey - CCY;
      const ddist = Math.hypot(ddx, ddy) || 1;
      const cxe = ex + ddx / ddist * EDGE_R;
      const cye = ey + ddy / ddist * EDGE_R;
      // Extend detection radius to cover the +/- side-buttons (offset by pOff=21, radius 9)
      if (Math.hypot(rp.x - cxe, rp.y - cye) <= EDGE_R + 22) { newHovEdge = ei; break; }
    }
    if (newHovEdge !== _hoveredEdge) {
      _hoveredEdge = newHovEdge;
      _renderCanvas();
    }
  } else if (_hoveredEdge !== null) {
    _hoveredEdge = null;
    _renderCanvas();
  }
}

// ── Unified canvas interaction ────────────────────────────────────────────────
//
// One model for all connections:
//   1. Click an edge  → sets pending edge (glows yellow)
//   2a. Click another edge → toggle bypass between the two edges
//   2b. Click a node       → toggle stub from pending edge into that node
//   2c. Click empty snap   → place node of current type + stub from pending edge
//   2d. Click same edge    → cancel
//
// No tool switching required.  "Node Type" toolbar only determines what gets
// created when you click an empty snap (town vs city).
//
// Erase: click edge → remove all connections through it; click node → remove node.

// Returns the node whose snap position is within NODE_HIT_R of (mx, my), else null.
const NODE_HIT_R = 22;
function _nodeAtPoint(mx, my) {
  const p = _unrotate(mx, my);
  for (const node of _nodes) {
    const snap = SNAP_POSITIONS.find(sp => sp.locStr === node.locStr);
    if (!snap) continue;
    const d = Math.hypot(p.x - snap.x, p.y - snap.y);
    if (d <= NODE_HIT_R) return node;
  }
  return null;
}

function _onCanvasClick(e) {
  const rect = e.currentTarget.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;

  window.HBD?.log('click', `(${mx.toFixed(0)},${my.toFixed(0)}) tool=${_activeTool} pendingEdge=${_pendingEdge} pendingNode=${_pendingNode}`,
    { tgt: e.target.tagName + (e.target.id ? '#'+e.target.id : ''), ds: JSON.stringify(e.target.dataset||{}) });

  if (_activeTool === 'erase') {
    const clickedEdge = _edgeAtPoint(mx, my);
    if (clickedEdge !== null) {
      window.HBD?.log('hit', `ERASE edge=${clickedEdge}`);
      _segments = _segments.filter(s => s.ea !== clickedEdge && s.eb !== clickedEdge);
      _nodes.forEach(n => {
        _nodeEdges[n.id] = (_nodeEdges[n.id] || []).filter(e => e !== clickedEdge);
        if (_nodeEdgeLane[n.id]) delete _nodeEdgeLane[n.id][clickedEdge];
      });
      // Reset cursor to 0 for any edge that now has no segments — prevents stale
      // lane values bleeding into the next fresh draw through that edge.
      if (!_segments.some(s => s.ea === clickedEdge || s.eb === clickedEdge)) {
        _edgeLane[clickedEdge] = 0;
      }
    } else {
      window.HBD?.log('hit', 'ERASE no edge — trying node/seg midpoint');
      _handleErase(mx, my);
    }
    _renderCanvas();
    _updateDslPreview();
    return;
  }

  // ── Edge lane +/- click ────────────────────────────────────────────────────
  // Advances / retreats the per-edge lane cursor (_edgeLane).
  // Does NOT modify any existing segment — the cursor only affects future draws.
  {
    const plusEdge  = e.target.dataset.edgePlus;
    const minusEdge = e.target.dataset.edgeMinus;
    if (plusEdge !== undefined) {
      const edge = parseInt(plusEdge);
      const prev = _edgeLane[edge] || 0;
      _edgeLane[edge] = Math.min(3, prev + 1);  // max lane index = 3 (4 lanes)
      window.HBD?.log('lane', `edge ${edge} lane+ : ${prev} → ${_edgeLane[edge]}`);
      _renderCanvas();
      _updateDslPreview();
      return;
    }
    if (minusEdge !== undefined) {
      const edge = parseInt(minusEdge);
      const prev = _edgeLane[edge] || 0;
      _edgeLane[edge] = Math.max(0, prev - 1);
      window.HBD?.log('lane', `edge ${edge} lane- : ${prev} → ${_edgeLane[edge]}`);
      _renderCanvas();
      _updateDslPreview();
      return;
    }
  }

  // ── Lane badge click — cycle lanes on a segment ───────────────────────────
  // Checked before edge/snap hits so a small badge on the segment midpoint
  // takes priority over placing new track.
  {
    const p2 = _unrotate(mx, my);
    let _badgeHit = false;
    for (const seg of _segments) {
      const [ax, ay] = EMP[seg.ea];
      const [bx, by] = EMP[seg.eb];
      const smx = (ax + bx) / 2, smy = (ay + by) / 2;
      const _bd = Math.hypot(p2.x - smx, p2.y - smy);
      if (_bd <= 12) {
        // Cycle lanes 1→2→3→4→1
        const prev = seg.lanes || 1;
        seg.lanes = (prev % 4) + 1;
        window.HBD?.log('lane', `badge seg(${seg.ea}↔${seg.eb}) lanes: ${prev} → ${seg.lanes}`, { dist: _bd.toFixed(1) });
        _badgeHit = true;
        _renderCanvas();
        _updateDslPreview();
        return;
      }
    }
    if (!_badgeHit && _segments.length) {
      // Log near-miss distances to help diagnose hit-area problems
      const _dists = _segments.map(seg => {
        const [ax,ay] = EMP[seg.ea], [bx,by] = EMP[seg.eb];
        return { seg: `${seg.ea}↔${seg.eb}`, d: Math.hypot(p2.x-(ax+bx)/2, p2.y-(ay+by)/2).toFixed(1) };
      });
      window.HBD?.log('hit', 'badge: no hit', _dists);
    }
  }

  // ── Track tool — node-first click model ───────────────────────────────────
  // Click a node → pending; then click another node (nodePath) or edge (stub).
  // When no pending node and nothing hit, fall through to normal edge/snap handling
  // so the Track tool doesn't block adding edges on a blank hex.
  if (_activeTool === 'track' || _pendingNode !== null) {
    const clickedNode = _nodeAtPoint(mx, my);
    const clickedEdge = _edgeAtPoint(mx, my);

    window.HBD?.log('hit', `TRACK probe: node=${clickedNode ? clickedNode.id+'('+clickedNode.locStr+')' : 'none'} edge=${clickedEdge}`,
      { pendingNode: _pendingNode, nodes: _nodes.map(n=>({id:n.id,loc:n.locStr,type:n.type})) });

    if (_pendingNode === null) {
      if (clickedNode && _pendingEdge === null) {
        // First click hit a node with no pending edge — enter node-pending mode.
        // If _pendingEdge is set, fall through so the edge→node connection logic handles it.
        window.HBD?.log('state', `TRACK: pending → node ${clickedNode.id} (${clickedNode.locStr})`);
        _pendingNode = clickedNode.id;
        _renderCanvas();
        return;
      }
      // No node hit, or a pending edge takes priority — fall through to edge/snap handling
      if (clickedNode && _pendingEdge !== null) {
        window.HBD?.log('hit', `TRACK: node hit but pendingEdge=${_pendingEdge} — falling through to connect`);
      } else {
        window.HBD?.log('hit', 'TRACK: no node hit — falling through to edge/snap');
      }
    } else {
      // Second click with a pending node
      if (clickedNode && clickedNode.id === _pendingNode) {
        // Same node — cancel
        window.HBD?.log('state', `TRACK: same node ${_pendingNode} — cancel pending`);
        _pendingNode = null;
        _renderCanvas();
        return;
      }
      if (clickedNode) {
        // Node → Node: toggle nodePath
        const niA = _pendingNode, niB = clickedNode.id;
        const xi = _nodePaths.findIndex(np =>
          (np.nodeAId === niA && np.nodeBId === niB) ||
          (np.nodeAId === niB && np.nodeBId === niA)
        );
        if (xi >= 0) {
          window.HBD?.log('path', `nodePath REMOVED: ${niA}↔${niB}`);
          _nodePaths.splice(xi, 1);
        } else {
          window.HBD?.log('path', `nodePath ADDED: ${niA}↔${niB}`);
          _nodePaths.push({ id: _nextId(), nodeAId: niA, nodeBId: niB });
        }
        _pendingNode = null;
        _renderCanvas();
        _updateDslPreview();
        return;
      }
      if (clickedEdge !== null) {
        // Node → Edge: add stub, or update lane count if it already exists.
        // Use the Erase tool to remove stubs.
        const edges = _nodeEdges[_pendingNode] || [];
        const idx = edges.indexOf(clickedEdge);
        const lc = (_edgeLane[clickedEdge] || 0) + 1;
        if (idx >= 0) {
          // Stub already exists — update lane count if cursor changed, otherwise no-op
          const existingLc = (_nodeEdgeLane[_pendingNode] || {})[clickedEdge] || 1;
          if (lc !== existingLc) {
            if (!_nodeEdgeLane[_pendingNode]) _nodeEdgeLane[_pendingNode] = {};
            if (lc > 1) _nodeEdgeLane[_pendingNode][clickedEdge] = lc;
            else delete _nodeEdgeLane[_pendingNode][clickedEdge];
            window.HBD?.log('seg', `stub UPDATED: node ${_pendingNode} ← edge ${clickedEdge}`, { lanes: `${existingLc}→${lc}` });
          } else {
            window.HBD?.log('seg', `stub no-op: node ${_pendingNode} ← edge ${clickedEdge} already lanes=${lc}`);
          }
        } else {
          edges.push(clickedEdge);
          if (lc > 1) { if (!_nodeEdgeLane[_pendingNode]) _nodeEdgeLane[_pendingNode] = {}; _nodeEdgeLane[_pendingNode][clickedEdge] = lc; }
          window.HBD?.log('seg', `stub ADDED: node ${_pendingNode} ← edge ${clickedEdge}`, { lanes: lc, edgesNow: [...edges] });
        }
        _nodeEdges[_pendingNode] = edges;
        _pendingNode = null;
        _renderCanvas();
        _updateDslPreview();
        return;
      }
      // Missed everything — cancel
      window.HBD?.log('hit', `TRACK: second click missed everything — cancel pending node ${_pendingNode}`);
      _pendingNode = null;
      _renderCanvas();
      return;
    }
  }

  const clickedEdge = _edgeAtPoint(mx, my);

  // ── Edge clicked ──────────────────────────────────────────────────────────
  if (clickedEdge !== null) {
    if (_pendingEdge === null) {
      // First endpoint — set pending, deselect node config
      window.HBD?.log('hit', `Edge ${clickedEdge} → pending (first endpoint)`);
      _pendingEdge = clickedEdge;
      _selectedNodeId = null;
      _refreshNodeConfig();
      _renderCanvas();
    } else if (_pendingEdge === clickedEdge) {
      // Same edge — cancel
      window.HBD?.log('state', `Edge ${clickedEdge} again — cancel pendingEdge`);
      _pendingEdge = null;
      _renderCanvas();
    } else {
      // Second endpoint is another edge — toggle bypass
      const ea = _pendingEdge, eb = clickedEdge;
      _pendingEdge = null;
      const xi = _segments.findIndex(s => (s.ea===ea&&s.eb===eb)||(s.ea===eb&&s.eb===ea));
      if (xi >= 0) {
        window.HBD?.log('seg', `bypass REMOVED: ${ea}↔${eb}`);
        _segments.splice(xi, 1);
      } else {
        const lA = _edgeLane[ea] || 0, lB = _edgeLane[eb] || 0;
        window.HBD?.log('seg', `bypass ADDED: ${ea}↔${eb}`, { laneA: lA, laneB: lB, totalSegs: _segments.length + 1 });
        _segments.push({ id: _nextId(), ea, eb, laneA: lA, laneB: lB });
      }
      _renderCanvas();
      _updateDslPreview();
    }
    return;
  }
  window.HBD?.log('hit', 'No edge hit');

  // ── Node or snap clicked ──────────────────────────────────────────────────
  const snap = _nearestSnapAt(mx, my);
  window.HBD?.log('hit', snap ? `Snap hit: ${snap.locStr}` : 'No snap hit');

  if (_pendingEdge !== null) {
    // Completing a connection to a node or snap
    if (snap) {
      const existing = _nodes.find(n => n.locStr === snap.locStr);
      if (existing) {
        // Add stub, or update lane count if it already exists.
        // Use the Erase tool to remove stubs.
        const edges = _nodeEdges[existing.id] || [];
        const idx = edges.indexOf(_pendingEdge);
        const lc = (_edgeLane[_pendingEdge] || 0) + 1;
        if (idx >= 0) {
          // Stub already exists — update lane count if cursor changed, otherwise no-op
          const existingLc = (_nodeEdgeLane[existing.id] || {})[_pendingEdge] || 1;
          if (lc !== existingLc) {
            if (!_nodeEdgeLane[existing.id]) _nodeEdgeLane[existing.id] = {};
            if (lc > 1) _nodeEdgeLane[existing.id][_pendingEdge] = lc;
            else delete _nodeEdgeLane[existing.id][_pendingEdge];
            window.HBD?.log('seg', `stub UPDATED: edge ${_pendingEdge} → node ${existing.id} (${existing.locStr})`, { lanes: `${existingLc}→${lc}` });
          } else {
            window.HBD?.log('seg', `stub no-op: edge ${_pendingEdge} → node ${existing.id} already lanes=${lc}`);
          }
        } else {
          edges.push(_pendingEdge);
          if (lc > 1) { if (!_nodeEdgeLane[existing.id]) _nodeEdgeLane[existing.id] = {}; _nodeEdgeLane[existing.id][_pendingEdge] = lc; }
          window.HBD?.log('seg', `stub ADDED: edge ${_pendingEdge} → node ${existing.id} (${existing.locStr})`, { lanes: lc, edgesNow: [...edges] });
        }
        _nodeEdges[existing.id] = edges;
        _selectedNodeId = existing.id;
        _refreshNodeConfig();
      } else {
        // Create node at snap + connect pending edge
        const lc = (_edgeLane[_pendingEdge] || 0) + 1;
        window.HBD?.log('node', `CREATE node at ${snap.locStr} + connect edge ${_pendingEdge}`, { lanes: lc });
        const nodeId = _placeNode(snap.locStr);
        if (nodeId !== null) {
          const edges = _nodeEdges[nodeId] || [];
          if (!edges.includes(_pendingEdge)) {
            edges.push(_pendingEdge);
            if (lc > 1) { if (!_nodeEdgeLane[nodeId]) _nodeEdgeLane[nodeId] = {}; _nodeEdgeLane[nodeId][_pendingEdge] = lc; }
          }
          _nodeEdges[nodeId] = edges;
        }
      }
    } else {
      window.HBD?.log('hit', `pendingEdge ${_pendingEdge}: no snap → edge connection dropped`);
    }
    // Whether we connected or not, clear pending
    _pendingEdge = null;
    _renderCanvas();
    _updateDslPreview();
    return;
  }

  // ── No pending: click snap to place/select/configure ─────────────────────
  if (snap) {
    const existing = _nodes.find(n => n.locStr === snap.locStr);
    if (existing) {
      if (_selectedNodeId === existing.id) {
        // Re-click selected node: cycle city slots, deselect town
        if (existing.type === 'city') {
          const prev = existing.slots || 1;
          existing.slots = (prev % 4) + 1;
          window.HBD?.log('node', `City slots cycled: ${prev} → ${existing.slots} (node ${existing.id})`);
          _refreshNodeConfig();
          _updateDslPreview();
        } else {
          window.HBD?.log('node', `Re-click ${existing.type} ${existing.id} → deselect`);
          _selectedNodeId = null;
          _refreshNodeConfig();
        }
      } else {
        window.HBD?.log('node', `SELECT node ${existing.id} (${existing.type} @ ${existing.locStr})`);
        _selectedNodeId = existing.id;
        _refreshNodeConfig();
      }
      _renderCanvas();
    } else {
      // Empty snap — place new node (unconnected; connect edges after)
      window.HBD?.log('node', `Place new node at ${snap.locStr} (tool=${_activeTool})`);
      _placeNode(snap.locStr);
    }
    return;
  }

  // Click on empty canvas — deselect
  window.HBD?.log('hit', 'Empty canvas — deselect');
  _selectedNodeId = null;
  _refreshNodeConfig();
  _renderCanvas();
}

function _edgeAtPoint(mx, my) {
  const p = _unrotate(mx, my);
  for (let e = 0; e < 6; e++) {
    const [ex, ey] = EMP[e];
    if (Math.hypot(p.x - ex, p.y - ey) <= EDGE_R + 10) return e;  // generous hit area
  }
  return null;
}

// Returns the nearest snap if within SNAP_HIT_R of (mx,my), else null.
// Unlike _nearestSnap(), this won't snap to faraway positions on misclicks.
const SNAP_HIT_R = 30;
function _nearestSnapAt(mx, my) {
  const p = _unrotate(mx, my);
  let best = null, bestD = Infinity;
  for (const snap of SNAP_POSITIONS) {
    const d = Math.hypot(p.x - snap.x, p.y - snap.y);
    if (d < bestD && d <= SNAP_HIT_R) { bestD = d; best = snap; }
  }
  return best;
}

function _placeNode(locStr) {
  // Return existing city id if we're incrementing slots, else create new node
  const existing = _nodes.find(n => n.locStr === locStr);

  if (existing) {
    if (existing.type === 'city') {
      // Increment slots (1→2→3→4→1)
      const prev = existing.slots || 1;
      existing.slots = (prev % 4) + 1;
      window.HBD?.log('node', `_placeNode: city slots ${prev}→${existing.slots} (id=${existing.id} @ ${locStr})`);
      _selectedNodeId = existing.id;
      _refreshNodeConfig();
      _renderCanvas();
      _updateDslPreview();
      return existing.id;
    }
    if (existing.type === 'town' || existing.type === 'junction') {
      // Toggle — remove town or junction
      window.HBD?.log('node', `_placeNode: REMOVE ${existing.type} id=${existing.id} @ ${locStr}`);
      _removeNode(existing.id);
      return null;
    }
  }

  const type = _activeTool === 'offboard'  ? 'offboard'
             : _activeTool === 'junction'  ? 'junction'
             : (_activeTool === 'town'     ? 'town' : 'city');
  const defaultPhase = (type === 'offboard');  // offboard always starts in phase mode; others default off
  const node = {
    id:           _nextId(),
    type,
    slots:        1,
    locStr,
    revenue:      type === 'town' ? 10 : (type === 'junction' ? 0 : 20),
    phaseRevenue: { yellow: 20, green: 30, brown: 40, gray: 60 },
    terminal:     type === 'offboard',
    phaseMode:    defaultPhase,
  };
  _nodes.push(node);
  _nodeEdges[node.id] = [];
  _selectedNodeId = node.id;
  window.HBD?.log('node', `_placeNode: NEW ${type} id=${node.id} @ ${locStr}`, { revenue: node.revenue, phaseMode: node.phaseMode });
  _refreshNodeConfig();
  _renderCanvas();
  _updateDslPreview();
  return node.id;
}


function _removeNode(nodeId) {
  // Capture edges before deletion so we can reclaim lane cursors below.
  const freedEdges = (_nodeEdges[nodeId] || []).slice();
  _nodes = _nodes.filter(n => n.id !== nodeId);
  delete _nodeEdges[nodeId];
  delete _nodeEdgeLane[nodeId];
  // Remove any node-to-node paths involving this node
  _nodePaths = _nodePaths.filter(np => np.nodeAId !== nodeId && np.nodeBId !== nodeId);
  if (_selectedNodeId === nodeId) _selectedNodeId = null;
  if (_pendingNode === nodeId) _pendingNode = null;
  // Reset lane cursor for any edge that now has NO track at all
  // (no remaining node stubs and no bypass segments).
  for (const e of freedEdges) {
    const stillUsed = _nodes.some(n => (_nodeEdges[n.id] || []).includes(e))
                   || _segments.some(s => s.ea === e || s.eb === e);
    if (!stillUsed) _edgeLane[e] = 0;
  }
  _refreshNodeConfig();
  _renderCanvas();
  _updateDslPreview();
}

function _handleErase(mx, my) {
  const p = _unrotate(mx, my);

  // Check for node click (in canvas space, nodes render at snap positions)
  for (const node of _nodes) {
    const snap = SNAP_POSITIONS.find(s => s.locStr === node.locStr);
    if (!snap) continue;
    if (Math.hypot(p.x - snap.x, p.y - snap.y) <= 20 * SC) {
      window.HBD?.log('hit', `ERASE node=${node.id} (${node.type} @ ${node.locStr})`);
      _removeNode(node.id);
      return;
    }
  }

  // Check for segment midpoint click
  for (const seg of _segments) {
    const [ax, ay] = EMP[seg.ea];
    const [bx, by] = EMP[seg.eb];
    const mx2 = (ax + bx) / 2, my2 = (ay + by) / 2;
    if (Math.hypot(p.x - mx2, p.y - my2) <= 18) {
      window.HBD?.log('hit', `ERASE seg=${seg.ea}↔${seg.eb}`);
      _segments = _segments.filter(s => s.id !== seg.id);
      // Reset lane cursor for each endpoint that now has no remaining track.
      for (const e of [seg.ea, seg.eb]) {
        const stillUsed = _nodes.some(n => (_nodeEdges[n.id] || []).includes(e))
                       || _segments.some(s => s.ea === e || s.eb === e);
        if (!stillUsed) _edgeLane[e] = 0;
      }
      _renderCanvas();
      _updateDslPreview();
      return;
    }
  }

  // Check for node-to-node path midpoint click (dashed lines between nodes)
  for (const np of _nodePaths) {
    const nA = _nodes.find(n => n.id === np.nodeAId);
    const nB = _nodes.find(n => n.id === np.nodeBId);
    if (!nA || !nB || nA.locStr === nB.locStr) continue;
    const sA = SNAP_POSITIONS.find(sp => sp.locStr === nA.locStr);
    const sB = SNAP_POSITIONS.find(sp => sp.locStr === nB.locStr);
    if (!sA || !sB) continue;
    const mx2 = (sA.x + sB.x) / 2, my2 = (sA.y + sB.y) / 2;
    if (Math.hypot(p.x - mx2, p.y - my2) <= 18) {
      window.HBD?.log('hit', `ERASE nodePath=${np.nodeAId}↔${np.nodeBId}`);
      _nodePaths = _nodePaths.filter(n => n.id !== np.id);
      _renderCanvas();
      _updateDslPreview();
      return;
    }
  }

  window.HBD?.log('hit', 'ERASE no hit');
}

// ── Init ──────────────────────────────────────────────────────────────────────

(function _init() {
  const overlay = document.getElementById('hexBuilder');
  if (!overlay) {
    document.addEventListener('DOMContentLoaded', _init);
    return;
  }
})();

// ── Public: staticHexCode ─────────────────────────────────────────────────────
// Generates tobymao map.rb DSL from a saved static hex model.
//
// Source of truth: hex.nodes[] + hex.paths[].
//   nodes[i] — { type, originalType, slots, locStr, flat, phaseRevenue, terminal, phaseMode }
//   paths[]  — [{ a:{type,n}, b:{type,n}, terminal? }]  — edge-to-node, node-to-node, edge-to-edge
//
// Legacy fallback for older saves that lack revenue in nodes[] or paths[] entirely.

window.staticHexCode = function staticHexCode(hex) {
  if (!hex || !hex.static) return '';
  const parts = [];
  const rot   = hex.rotation || 0;

  const savedNodes = hex.nodes || [];
  const savedPaths = hex.paths || [];

  // ── Revenue string helper ─────────────────────────────────────────────────
  function nodeRevStr(node) {
    const isPhase = node.phaseMode ||
      (node.phaseRevenue !== null && node.phaseRevenue !== undefined &&
       Object.values(node.phaseRevenue || {}).some(v => v > 0));
    if (isPhase && node.phaseRevenue) {
      const pr   = node.phaseRevenue;
      const bits = PHASES.filter(p => (pr[p] || 0) > 0).map(p => `${p}_${pr[p]}`);
      return bits.length ? bits.join('|') : '0';
    }
    return String(node.flat ?? 0);
  }

  // ── Node directives ───────────────────────────────────────────────────────
  savedNodes.forEach(node => {
    const locAttr  = (node.locStr && node.locStr !== 'center') ? `,loc:${node.locStr}` : '';
    const slots    = node.slots ?? 1;
    const slotAttr = slots !== 1 ? `,slots:${slots}` : ''; // emits slots:0 for port cities, slots:N for multi-slot
    const termAttr = node.terminal ? ',terminal:1' : '';
    const rev      = nodeRevStr(node);
    const origType = node.originalType || node.type;

    if      (origType === 'junction') parts.push(`junction`);
    else if (origType === 'offboard') parts.push(`offboard=revenue:${rev}${termAttr}${locAttr}`);
    else if (origType === 'city')     parts.push(`city=revenue:${rev}${slotAttr}${locAttr}`);
    else if (origType === 'town')     parts.push(`town=revenue:${rev}${locAttr}`);
  });

  // ── Path directives ───────────────────────────────────────────────────────
  // Edge-to-edge: group by endpoint pair to collapse aLane expansions into lanes:N.
  const eeGroups = new Map();
  const nonEe    = [];

  savedPaths.forEach(p => {
    const aE = p.a?.type === 'edge', bE = p.b?.type === 'edge';
    if (aE && bE) {
      const ea = p.a.n, eb = p.b.n;
      const key = Math.min(ea, eb) + '-' + Math.max(ea, eb);
      const grp = eeGroups.get(key);
      if (!grp) {
        eeGroups.set(key, { ea, eb, lanes: p.lanes || 1 });
      } else if (p.lanes && p.lanes > grp.lanes) {
        grp.lanes = p.lanes;
      } else if (!p.lanes) {
        grp.lanes++;
      }
    } else {
      nonEe.push(p);
    }
  });

  for (const { ea, eb, lanes } of eeGroups.values()) {
    const lanesAttr = lanes > 1 ? `,lanes:${lanes}` : '';
    parts.push(`path=a:${(ea + rot) % 6},b:${(eb + rot) % 6}${lanesAttr}`);
  }

  // Non-edge-to-edge: collapse multi-lane aLane:[N,i] expansions back to lanes:N.
  nonEe.forEach(p => {
    const termAttr = p.terminal ? `,terminal:${p.terminal}` : '';
    const aE = p.a?.type === 'edge', bE = p.b?.type === 'edge';
    const aN = p.a?.type === 'node', bN = p.b?.type === 'node';
    if (aE && bN) {
      if (Array.isArray(p.aLane) && p.aLane[1] > 0) return;
      const lanesAttr = Array.isArray(p.aLane) && p.aLane[0] > 1 ? `,lanes:${p.aLane[0]}` :
                        (p.lanes || 1) > 1 ? `,lanes:${p.lanes}` : '';
      parts.push(`path=a:${(p.a.n+rot)%6},b:_${p.b.n}${termAttr}${lanesAttr}`);
    } else if (aN && bE) {
      if (Array.isArray(p.bLane) && p.bLane[1] > 0) return;
      const lanesAttr = Array.isArray(p.bLane) && p.bLane[0] > 1 ? `,lanes:${p.bLane[0]}` :
                        (p.lanes || 1) > 1 ? `,lanes:${p.lanes}` : '';
      parts.push(`path=a:_${p.a.n},b:${(p.b.n+rot)%6}${termAttr}${lanesAttr}`);
    } else if (aN && bN) {
      parts.push(`path=a:_${p.a.n},b:_${p.b.n}`);
    }
  });

  // ── Upgrade / terrain ─────────────────────────────────────────────────────
  if (hex.terrain || hex.terrainCost) {
    const upgParts = [];
    if (hex.terrainCost) upgParts.push(`cost:${hex.terrainCost}`);
    if (hex.terrain)     upgParts.push(`terrain:${hex.terrain}`);
    parts.push(`upgrade=${upgParts.join(',')}`);
  }

  if (hex.label) parts.push(`label=${hex.label}`);

  (hex.borders || []).forEach(b => {
    let d = `border=edge:${b.edge}`;
    if (b.type) d += `,type:${b.type}`;
    if (b.cost) d += `,cost:${b.cost}`;
    parts.push(d);
  });

  return parts.join(';');
};

}());
