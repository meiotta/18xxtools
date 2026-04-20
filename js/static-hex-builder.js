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
  { v:'blue',   label:'Blue',   hex:'#4080c0', border:'#205090', title:'Blue — water hex'            },
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
    const nodeType = sn.type === 'junction' ? 'city' : sn.type; // junctions render as cities in builder
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
      const grp = eeGroups[key];
      if (!grp) {
        eeGroups[key] = { ea, eb, lanes: p.lanes || 1 };
      } else if (p.lanes && p.lanes > grp.lanes) {
        grp.lanes = p.lanes;          // explicit lanes supersedes count
      } else if (!p.lanes) {
        grp.lanes++;                  // parseDslHex expansion: each copy = +1 lane
      }

    } else if (aEdge && bNode) {
      const nodeId = nodeIdByIndex[p.b.n];
      if (nodeId !== undefined) {
        const edges = _nodeEdges[nodeId];
        if (!edges.includes(p.a.n)) edges.push(p.a.n);
      }
    } else if (aNode && bEdge) {
      const nodeId = nodeIdByIndex[p.a.n];
      if (nodeId !== undefined) {
        const edges = _nodeEdges[nodeId];
        if (!edges.includes(p.b.n)) edges.push(p.b.n);
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

  // Create one segment per endpoint group, carrying the lane count.
  Object.values(eeGroups).forEach(({ ea, eb, lanes }) => {
    _segments.push({ id: _nextId(), ea, eb, lanes: lanes > 1 ? lanes : 1 });
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
  const nodes = _nodes.map(n => ({
    type:   n.type === 'offboard' ? 'city' : n.type,
    slots:  n.slots  || 1,
    locStr: n.locStr || 'center',
  }));

  const paths = [];

  // Edge-to-node paths
  _nodes.forEach((node, ni) => {
    const edges = _nodeEdges[node.id] || [];
    edges.forEach(edge => {
      paths.push({ a: { type: 'edge', n: edge }, b: { type: 'node', n: ni },
                   terminal: (node.terminal && node.type === 'offboard') ? 1 : undefined });
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

  // Blank edge-to-edge segments become paths too (carry lane count when > 1)
  _segments.forEach(seg => {
    const p = { a: { type: 'edge', n: seg.ea }, b: { type: 'edge', n: seg.eb } };
    if ((seg.lanes || 1) > 1) p.lanes = seg.lanes;
    paths.push(p);
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

  // Derive feature
  const cityNodes    = _nodes.filter(n => n.type === 'city');
  const townNodes    = _nodes.filter(n => n.type === 'town');
  const offNodes     = _nodes.filter(n => n.type === 'offboard');
  let feature = 'none';
  if      (offNodes.length)           feature = 'offboard';
  else if (cityNodes.length >= 3)     feature = 'm';
  else if (cityNodes.length === 2)    feature = 'oo';
  else if (cityNodes.length === 1)    feature = 'city';
  else if (townNodes.length >= 2)     feature = 'dualTown';
  else if (townNodes.length === 1)    feature = 'town';

  return { nodes, paths, exits, blankPaths, feature, bg: _bg };
}

// ── Final model builder ───────────────────────────────────────────────────────

function _buildFinalModel() {
  const cityNodes = _nodes.filter(n => n.type === 'city');
  const townNodes = _nodes.filter(n => n.type === 'town');
  const offNodes  = _nodes.filter(n => n.type === 'offboard');

  let feature = 'none';
  if      (offNodes.length)         feature = 'offboard';
  else if (cityNodes.length >= 3)   feature = 'm';
  else if (cityNodes.length === 2)  feature = 'oo';
  else if (cityNodes.length === 1)  feature = 'city';
  else if (townNodes.length >= 2)   feature = 'dualTown';
  else if (townNodes.length === 1)  feature = 'town';

  const exitSet = new Set();
  _nodes.forEach(node => (_nodeEdges[node.id] || []).forEach(e => exitSet.add(e)));
  _segments.forEach(s => { exitSet.add(s.ea); exitSet.add(s.eb); });
  const exits = Array.from(exitSet).sort((a, b) => a - b);

  // exitPairs: per-node connected edge arrays.  Always written (even for single
  // nodes) so that staticHexCode() can distinguish node-connected exits from
  // bypass-segment edges when both exist on the same hex.
  const exitPairs = _nodes.map(n => _nodeEdges[n.id] || []);

  // nodes[] — rich format; type is renderer-safe ('city' for offboard).
  // originalType carries 'offboard' so staticHexCode can emit the right directive.
  // Revenue uses the same field names as parseDslHex: flat (non-phase) / phaseRevenue.
  const nodes = _nodes.map(n => {
    const isPhase = n.phaseMode || n.type === 'offboard';
    return {
      type:         n.type === 'offboard' ? 'city' : n.type,
      originalType: n.type,
      slots:        n.slots  || 1,
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
  const paths = [];
  _nodes.forEach((node, ni) => {
    (_nodeEdges[node.id] || []).forEach(edge => {
      paths.push({
        a:        { type: 'edge', n: edge },
        b:        { type: 'node', n: ni },
        terminal: (node.terminal && node.type === 'offboard') ? 1 : undefined,
      });
    });
  });
  _nodePaths.forEach(np => {
    const niA = _nodes.findIndex(n => n.id === np.nodeAId);
    const niB = _nodes.findIndex(n => n.id === np.nodeBId);
    if (niA >= 0 && niB >= 0)
      paths.push({ a: { type: 'node', n: niA }, b: { type: 'node', n: niB } });
  });
  _segments.forEach(seg => {
    const sp = { a: { type: 'edge', n: seg.ea }, b: { type: 'edge', n: seg.eb } };
    if ((seg.lanes || 1) > 1) sp.lanes = seg.lanes;
    paths.push(sp);
  });

  const p0 = _nodes[0];

  // Phase revenue is driven entirely by node.phaseMode — not by tile color.
  const usesPhaseRev =
    feature === 'offboard' ||
    (feature === 'city'     && cityNodes.some(n => n.phaseMode))  ||
    (feature === 'town'     && (townNodes[0]?.phaseMode || false)) ||
    (feature === 'dualTown' && townNodes.some(t => t.phaseMode))  ||
    (feature === 'oo'       && cityNodes.some(n => n.phaseMode))  ||
    (feature === 'm'        && cityNodes.some(n => n.phaseMode));
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
    slots:          cityNodes.length === 1 ? (cityNodes[0].slots || 1) : undefined,
    ooSlots:        cityNodes.length >= 2  ? cityNodes.map(c => c.slots || 1) : undefined,
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
    townRevenue:    townNodes[0]?.revenue ?? 10,
    townRevenues:   townNodes.map(t => t.revenue || 10),
    cityRevenues:   cityNodes.map(c => c.revenue || 20),
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
};

// Backward-compatibility alias
window.openStaticHexWizard = window.openHexBuilder;

function _close() {
  const el = document.getElementById('hexBuilder');
  if (el) el.style.display = 'none';
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
  if (!_borders.length) return '<div class="hb-hint">No borders</div>';
  return _borders.map((b, i) => `
    <div class="hb-border-row">
      <span>Edge ${b.edge} — ${b.type || 'impassable'}${b.cost ? ', cost ' + b.cost : ''}</span>
      <button class="hb-btn-xs hb-btn-danger" data-remove-border="${i}" title="Remove">✕</button>
    </div>`).join('');
}

function _panelHtml() {
  const hexLabel = _hexId ? `[${_hexId}]` : '';
  return `
    <div class="hb-titlebar">
      <span class="hb-title">Hex Builder <span class="hb-hexid">${hexLabel}</span></span>
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
            <select id="hbBorderEdge" class="hb-select-sm">
              ${[0,1,2,3,4,5].map(e => `<option value="${e}">Edge ${e}</option>`).join('')}
            </select>
            <select id="hbBorderType" class="hb-select-sm">
              <option value="impassable">Impassable</option>
              <option value="price">Price</option>
            </select>
            <button class="hb-btn-secondary hb-btn-xs" id="hbAddBorder">+ Add</button>
          </div>
        </div>
      </div>
    </div>

    <div class="hb-dsl-row">
      <pre id="hbDslPreview" class="hb-dsl-pre"></pre>
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
    { id: 'town',     label: 'Town',  icon: '&#9670;',  title: 'Place towns — click snap, or click edge then snap' },
    { id: 'city',     label: 'City',  icon: '&#9675;',  title: 'Place cities — click snap, or click edge then snap' },
    ...(showOff ? [{ id: 'offboard', label: 'Offboard', icon: '&#10022;', title: 'Place offboard revenue hex' }] : []),
    { id: 'track',    label: 'Track', icon: '&#9135;',  title: 'Connect nodes to each other or to edges — click node, then click another node or edge' },
    { id: 'erase',    label: 'Erase', icon: '&#10006;', title: 'Erase nodes and connections' },
  ];
  const hint = _activeTool === 'track'
    ? 'Click a node (circle), then click another node or an edge to connect'
    : 'Click an edge, then: another edge (bypass), a node (connect), or empty space (place &amp; connect)';
  return `<div class="hb-section">
    <div class="hb-section-label">Tool</div>
    <div class="hb-toolbar" id="hbToolbar">
      ${tools.map(t => `
        <button class="hb-tool-btn${_activeTool === t.id ? ' active' : ''}"
          data-tool="${t.id}" title="${t.title}">${t.icon} ${t.label}</button>`).join('')}
    </div>
    <div class="hb-hint" id="hbToolHint">${hint}</div>
  </div>`;
}

function _nodeConfigHtml() {
  const node = _nodes.find(n => n.id === _selectedNodeId);
  if (!node) {
    return `<div class="hb-section-label">Node Config</div>
            <div class="hb-hint">Select a node to configure it</div>`;
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
        ${[1, 2, 3, 4].map(s => `<button class="hb-slot-btn${(node.slots || 1) === s ? ' active' : ''}" data-slots="${s}">${s}</button>`).join('')}
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
  // Color key: yellow = pending start, green = has a connection, dark = unconnected
  // When a node is selected, its connected edges glow brighter green.
  // Circles are pushed outward from center by EDGE_R so they sit just outside the
  // hex polygon — freeing the actual edge midpoint (track endpoint) from occlusion.
  // Hit-testing in _edgeAtPoint still checks around EMP[e] with a generous radius.
  const selEdges = _selectedNodeId ? (_nodeEdges[_selectedNodeId] || []) : [];
  for (let e = 0; e < 6; e++) {
    const [ex, ey] = EMP[e];
    // Outward direction from center
    const ddx = ex - CCX, ddy = ey - CCY;
    const ddist = Math.hypot(ddx, ddy) || 1;
    const cx = ex + ddx / ddist * EDGE_R;   // circle center, just outside hex boundary
    const cy = ey + ddy / ddist * EDGE_R;

    const connectedToNode = _nodes.some(n => (_nodeEdges[n.id] || []).includes(e));
    const connectedSeg    = _segments.some(seg => seg.ea === e || seg.eb === e);
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
    s += `<text x="${cx.toFixed(1)}" y="${(cy + 4).toFixed(1)}"
             text-anchor="middle" font-size="11" font-weight="bold" fill="white"
             pointer-events="none">${e}</text>`;
  }

  // ── Lane-count badges for multi-lane segments ─────────────────────────────
  // Shown at segment midpoint; click cycles lanes 1→2→3→4→1.
  // Only visible when activeTool is NOT erase (erase shows no badge, just delete).
  if (_activeTool !== 'erase') {
    for (const seg of _segments) {
      const lanes = seg.lanes || 1;
      // Always draw a subtle indicator at the midpoint, highlight multi-lane ones
      const [ax, ay] = EMP[seg.ea];
      const [bx, by] = EMP[seg.eb];
      const mx2 = (ax + bx) / 2, my2 = (ay + by) / 2;
      const fill   = lanes > 1 ? '#4a7aff' : '#2a3a5a';
      const stroke = lanes > 1 ? '#8ab0ff' : '#3a5a8a';
      const label  = lanes > 1 ? `×${lanes}` : '×1';
      s += `<circle cx="${mx2.toFixed(1)}" cy="${my2.toFixed(1)}" r="10"
               fill="${fill}" stroke="${stroke}" stroke-width="1.5"
               data-seg-id="${seg.id}" style="cursor:pointer;" title="Click to change lane count"/>`;
      s += `<text x="${mx2.toFixed(1)}" y="${(my2 + 4).toFixed(1)}"
               text-anchor="middle" font-size="10" font-weight="bold" fill="white"
               pointer-events="none">${label}</text>`;
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
    _bg = btn.dataset.bg;
    // Rebuild panel (bg change affects toolbar, node config, etc.)
    _buildPanel();
  });

  // Toolbar
  const toolbar = document.getElementById('hbToolbar');
  if (toolbar) toolbar.addEventListener('click', e => {
    const btn = e.target.closest('[data-tool]');
    if (!btn) return;
    _activeTool = btn.dataset.tool;
    _pendingEdge = null;
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
    _terrainCost = parseInt(e.target.value) || 0;
    _updateDslPreview();
  });

  // Terrain type
  const terrainSel = document.getElementById('hbTerrain');
  if (terrainSel) terrainSel.addEventListener('change', e => {
    _terrain = e.target.value;
    _updateDslPreview();
  });

  // Borders list (delegation — remove buttons + future additions)
  const borderList = document.getElementById('hbBorderList');
  if (borderList) borderList.addEventListener('click', e => {
    const btn = e.target.closest('[data-remove-border]');
    if (!btn) return;
    const idx = parseInt(btn.dataset.removeBorder, 10);
    _borders.splice(idx, 1);
    borderList.innerHTML = _bordersHtml();
    _updateDslPreview();
  });

  // Add border button
  const addBorderBtn = document.getElementById('hbAddBorder');
  if (addBorderBtn) addBorderBtn.addEventListener('click', () => {
    const edgeSel  = document.getElementById('hbBorderEdge');
    const typeSel  = document.getElementById('hbBorderType');
    const edge = parseInt(edgeSel?.value ?? 0, 10);
    const type = typeSel?.value || 'impassable';
    if (!_borders.some(b => b.edge === edge)) {
      _borders.push({ edge, type });
      const bl = document.getElementById('hbBorderList');
      if (bl) bl.innerHTML = _bordersHtml();
      _updateDslPreview();
    }
  });

  // Node config events (delegated to hbNodeConfig)
  _bindNodeConfig();

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
      node.revenue = parseInt(e.target.value) || 0;
      _updateDslPreview();
    }
    if (e.target.dataset.phase) {
      if (!node.phaseRevenue) node.phaseRevenue = {};
      node.phaseRevenue[e.target.dataset.phase] = parseInt(e.target.value) || 0;
      _updateDslPreview();
    }
  });

  cfg.addEventListener('change', e => {
    const node = _nodes.find(n => n.id === _selectedNodeId);
    if (!node) return;
    if (e.target.id === 'hbPhaseMode') {
      node.phaseMode = e.target.checked;
      _refreshNodeConfig();
    }
    if (e.target.id === 'hbTerminal') {
      node.terminal = e.target.checked;
      _updateDslPreview();
    }
  });

  cfg.addEventListener('click', e => {
    const slotBtn = e.target.closest('[data-slots]');
    if (!slotBtn) return;
    const node = _nodes.find(n => n.id === _selectedNodeId);
    if (!node) return;
    node.slots = parseInt(slotBtn.dataset.slots);
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
    if (Math.hypot(p.x - snap.x, p.y - snap.y) <= NODE_HIT_R) return node;
  }
  return null;
}

function _onCanvasClick(e) {
  const rect = e.currentTarget.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;

  if (_activeTool === 'erase') {
    const clickedEdge = _edgeAtPoint(mx, my);
    if (clickedEdge !== null) {
      _segments = _segments.filter(s => s.ea !== clickedEdge && s.eb !== clickedEdge);
      _nodes.forEach(n => {
        _nodeEdges[n.id] = (_nodeEdges[n.id] || []).filter(e => e !== clickedEdge);
      });
    } else {
      _handleErase(mx, my);
    }
    _renderCanvas();
    _updateDslPreview();
    return;
  }

  // ── Lane badge click — cycle lanes on a segment ───────────────────────────
  // Checked before edge/snap hits so a small badge on the segment midpoint
  // takes priority over placing new track.
  {
    const p2 = _unrotate(mx, my);
    for (const seg of _segments) {
      const [ax, ay] = EMP[seg.ea];
      const [bx, by] = EMP[seg.eb];
      const smx = (ax + bx) / 2, smy = (ay + by) / 2;
      if (Math.hypot(p2.x - smx, p2.y - smy) <= 12) {
        // Cycle lanes 1→2→3→4→1
        seg.lanes = ((seg.lanes || 1) % 4) + 1;
        _renderCanvas();
        _updateDslPreview();
        return;
      }
    }
  }

  // ── Track tool — node-first click model ───────────────────────────────────
  // Click a node → pending; then click another node (nodePath) or edge (stub).
  if (_activeTool === 'track' || _pendingNode !== null) {
    const clickedNode = _nodeAtPoint(mx, my);
    const clickedEdge = _edgeAtPoint(mx, my);

    if (_pendingNode === null) {
      // First click: must hit a node
      if (clickedNode) {
        _pendingNode = clickedNode.id;
        _pendingEdge = null;
        _renderCanvas();
      }
      return;
    }

    // Second click with a pending node
    if (clickedNode && clickedNode.id === _pendingNode) {
      // Same node — cancel
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
      if (xi >= 0) _nodePaths.splice(xi, 1);
      else _nodePaths.push({ id: _nextId(), nodeAId: niA, nodeBId: niB });
      _pendingNode = null;
      _renderCanvas();
      _updateDslPreview();
      return;
    }
    if (clickedEdge !== null) {
      // Node → Edge: toggle stub from edge into pending node
      const edges = _nodeEdges[_pendingNode] || [];
      const idx = edges.indexOf(clickedEdge);
      if (idx >= 0) edges.splice(idx, 1);
      else edges.push(clickedEdge);
      _nodeEdges[_pendingNode] = edges;
      _pendingNode = null;
      _renderCanvas();
      _updateDslPreview();
      return;
    }
    // Missed everything — cancel
    _pendingNode = null;
    _renderCanvas();
    return;
  }

  const clickedEdge = _edgeAtPoint(mx, my);

  // ── Edge clicked ──────────────────────────────────────────────────────────
  if (clickedEdge !== null) {
    if (_pendingEdge === null) {
      // First endpoint — set pending, deselect node config
      _pendingEdge = clickedEdge;
      _selectedNodeId = null;
      _refreshNodeConfig();
      _renderCanvas();
    } else if (_pendingEdge === clickedEdge) {
      // Same edge — cancel
      _pendingEdge = null;
      _renderCanvas();
    } else {
      // Second endpoint is another edge — toggle bypass
      const ea = _pendingEdge, eb = clickedEdge;
      _pendingEdge = null;
      const xi = _segments.findIndex(s => (s.ea===ea&&s.eb===eb)||(s.ea===eb&&s.eb===ea));
      if (xi >= 0) _segments.splice(xi, 1);
      else _segments.push({ id: _nextId(), ea, eb });
      _renderCanvas();
      _updateDslPreview();
    }
    return;
  }

  // ── Node or snap clicked ──────────────────────────────────────────────────
  const snap = _nearestSnapAt(mx, my);

  if (_pendingEdge !== null) {
    // Completing a connection to a node or snap
    if (snap) {
      const existing = _nodes.find(n => n.locStr === snap.locStr);
      if (existing) {
        // Toggle stub: pending edge ↔ existing node
        const edges = _nodeEdges[existing.id] || [];
        const idx = edges.indexOf(_pendingEdge);
        if (idx >= 0) edges.splice(idx, 1);
        else edges.push(_pendingEdge);
        _nodeEdges[existing.id] = edges;
        _selectedNodeId = existing.id;
        _refreshNodeConfig();
      } else {
        // Create node at snap + connect pending edge
        const nodeId = _placeNode(snap.locStr);
        if (nodeId !== null) {
          const edges = _nodeEdges[nodeId] || [];
          if (!edges.includes(_pendingEdge)) edges.push(_pendingEdge);
          _nodeEdges[nodeId] = edges;
        }
      }
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
          existing.slots = ((existing.slots || 1) % 4) + 1;
          _refreshNodeConfig();
          _updateDslPreview();
        } else {
          _selectedNodeId = null;
          _refreshNodeConfig();
        }
      } else {
        _selectedNodeId = existing.id;
        _refreshNodeConfig();
      }
      _renderCanvas();
    } else {
      // Empty snap — place new node (unconnected; connect edges after)
      _placeNode(snap.locStr);
    }
    return;
  }

  // Click on empty canvas — deselect
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
      existing.slots = ((existing.slots || 1) % 4) + 1;
      _selectedNodeId = existing.id;
      _refreshNodeConfig();
      _renderCanvas();
      _updateDslPreview();
      return existing.id;
    }
    if (existing.type === 'town') {
      // Toggle — remove town
      _removeNode(existing.id);
      return null;
    }
  }

  const type = _activeTool === 'offboard' ? 'offboard'
             : (_activeTool === 'town' ? 'town' : 'city');  // default city if somehow called in wrong mode
  const defaultPhase = (type === 'offboard');  // offboard always starts in phase mode; cities/towns default off
  const node = {
    id:           _nextId(),
    type,
    slots:        1,
    locStr,
    revenue:      type === 'town' ? 10 : 20,
    phaseRevenue: { yellow: 20, green: 30, brown: 40, gray: 60 },
    terminal:     type === 'offboard',
    phaseMode:    defaultPhase,
  };
  _nodes.push(node);
  _nodeEdges[node.id] = [];
  _selectedNodeId = node.id;
  _refreshNodeConfig();
  _renderCanvas();
  _updateDslPreview();
  return node.id;
}


function _removeNode(nodeId) {
  _nodes = _nodes.filter(n => n.id !== nodeId);
  delete _nodeEdges[nodeId];
  // Remove any node-to-node paths involving this node
  _nodePaths = _nodePaths.filter(np => np.nodeAId !== nodeId && np.nodeBId !== nodeId);
  if (_selectedNodeId === nodeId) _selectedNodeId = null;
  if (_pendingNode === nodeId) _pendingNode = null;
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
      _segments = _segments.filter(s => s.id !== seg.id);
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
      _nodePaths = _nodePaths.filter(n => n.id !== np.id);
      _renderCanvas();
      _updateDslPreview();
      return;
    }
  }
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
  // Used for new-format nodes that carry flat / phaseRevenue.
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

  // ── Detect node format ────────────────────────────────────────────────────
  // parseDslHex and new builder saves include 'flat' (possibly null) or a
  // non-undefined 'phaseRevenue' object.  Old builder saves (pre-rewrite) only
  // have { type, slots, locStr } — no revenue fields at all.
  const nodesHaveRevenue = savedNodes.length > 0 && savedNodes.some(n =>
    n.flat !== undefined ||
    (n.phaseRevenue !== null && n.phaseRevenue !== undefined)
  );

  // ── Node directives ───────────────────────────────────────────────────────
  if (nodesHaveRevenue) {
    // New path: every node carries its own revenue — works for any topology
    // (single city, OO, Wien's 3×independent cities, offboard, etc.)
    savedNodes.forEach(node => {
      const locAttr  = (node.locStr && node.locStr !== 'center') ? `,loc:${node.locStr}` : '';
      const slotAttr = (node.slots  || 1) > 1 ? `,slots:${node.slots}` : '';
      const termAttr = node.terminal ? ',terminal:1' : '';
      const rev      = nodeRevStr(node);
      // originalType ('offboard'|'city'|'town') is written by new _buildFinalModel.
      // Older parseDslHex saves don't set it, but they never had type='offboard' in
      // nodes[] (offboard was stored as type:'city' with hex.feature='offboard').
      const origType = node.originalType || node.type;

      if      (origType === 'offboard') parts.push(`offboard=revenue:${rev}${termAttr}${locAttr}`);
      else if (origType === 'city')     parts.push(`city=revenue:${rev}${slotAttr}${locAttr}`);
      else if (origType === 'town')     parts.push(`town=revenue:${rev}${locAttr}`);
    });

  } else {
    // ── Legacy: old builder saves — nodes[] has no revenue; use feature fields ─
    const exits    = hex.exits || [];
    const isPhase  = !!(hex.activePhases && Object.values(hex.activePhases).some(Boolean));
    const nodeExitCount = (hex.exitPairs || []).reduce((n, arr) => n + (arr||[]).length, 0);
    const noExits  = hex.exitPairs ? nodeExitCount === 0 : exits.length === 0;

    function phaseRevStr() {
      const pr     = hex.phaseRevenue || {};
      const active = PHASES.filter(p => hex.activePhases?.[p]);
      return active.length ? active.map(p => `${p}_${pr[p]||0}`).join('|') : '0';
    }
    function locAttr(i) {
      const ls = savedNodes[i]?.locStr;
      return (ls && ls !== 'center') ? `,loc:${ls}` : '';
    }

    switch (hex.feature) {
      case 'town': {
        const hasPhase = Object.keys(hex.phaseRevenue||{}).length && hex.activePhases?.yellow;
        parts.push(`town=revenue:${noExits?0:(hasPhase?phaseRevStr():(hex.townRevenue??10))}${locAttr(0)}`);
        break;
      }
      case 'dualTown': {
        const [r0,r1] = hex.townRevenues||[10,10];
        parts.push(`town=revenue:${noExits?0:r0}${locAttr(0)}`);
        parts.push(`town=revenue:${noExits?0:r1}${locAttr(1)}`);
        break;
      }
      case 'offboard':
        parts.push(`offboard=revenue:${isPhase?phaseRevStr():'0'}${locAttr(0)}`);
        break;
      case 'oo':
      case 'c': {
        const revs = hex.cityRevenues || [20,20];
        const sl   = hex.ooSlots||[1,1];
        [0,1].forEach(i => parts.push(`city=revenue:${noExits?0:revs[i]||0}${sl[i]>1?`,slots:${sl[i]}`:''}${locAttr(i)}`));
        break;
      }
      case 'm': {
        const revs = hex.cityRevenues || [20,20,20];
        [0,1,2].forEach(i => parts.push(`city=revenue:${noExits?0:revs[i]||0}${locAttr(i)}`));
        break;
      }
      case 'city': {
        const slots = hex.slots||1;
        const rev   = isPhase ? phaseRevStr() : (noExits?0:(hex.cityRevenues?.[0]??20));
        const sl    = slots>1?`,slots:${slots}`:'';
        parts.push(`city=revenue:${rev}${sl}${locAttr(0)}`);
        break;
      }
      default: break;
    }
  }

  // ── Path directives ───────────────────────────────────────────────────────
  if (savedPaths.length > 0) {
    // Edge-to-edge paths need lane-count collapsing.
    // parseDslHex expands lanes:N into N paths with aLane/bLane — re-group them.
    // New builder format stores a single path with p.lanes = N — use directly.
    // Group key: min(ea,eb)-max(ea,eb) to handle both orderings.
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
          grp.lanes = p.lanes;    // explicit attribute supersedes count
        } else if (!p.lanes) {
          grp.lanes++;            // parseDslHex expansion: another copy = +1 lane
        }
      } else {
        nonEe.push(p);
      }
    });

    // Emit edge-to-edge paths (with lanes when > 1)
    for (const { ea, eb, lanes } of eeGroups.values()) {
      const lanesAttr = lanes > 1 ? `,lanes:${lanes}` : '';
      parts.push(`path=a:${(ea + rot) % 6},b:${(eb + rot) % 6}${lanesAttr}`);
    }

    // Emit all non-edge-to-edge paths (edge-to-node, node-to-node, node-to-edge)
    nonEe.forEach(p => {
      const termAttr = p.terminal ? `,terminal:${p.terminal}` : '';
      const aE = p.a?.type === 'edge', bE = p.b?.type === 'edge';
      const aN = p.a?.type === 'node', bN = p.b?.type === 'node';
      if      (aE && bN) parts.push(`path=a:${(p.a.n+rot)%6},b:_${p.b.n}${termAttr}`);
      else if (aN && bE) parts.push(`path=a:_${p.a.n},b:${(p.b.n+rot)%6}${termAttr}`);
      else if (aN && bN) parts.push(`path=a:_${p.a.n},b:_${p.b.n}`);
    });

  } else {
    // ── Legacy: very old saves with no paths[] — use exitPairs + blankPaths ──
    const exits  = hex.exits || [];
    const ep     = hex.exitPairs || [];
    const byp    = hex.blankPaths || [];
    const termSuffix = hex.feature === 'offboard'
      ? `,terminal:${hex.taperStyle||1}`
      : (hex.terminal ? ',terminal:1' : '');
    const emitBypass = () => byp.forEach(([a,b]) => parts.push(`path=a:${(a+rot)%6},b:${(b+rot)%6}`));
    function nodeExits(i, total) {
      if (ep.length > i) return ep[i] || [];
      const chunk = Math.ceil(exits.length / total);
      return exits.slice(i * chunk, (i + 1) * chunk);
    }

    if (!hex.feature || hex.feature === 'none') {
      emitBypass();
    } else if (hex.feature === 'oo' || hex.feature === 'c') {
      nodeExits(0,2).forEach(e => parts.push(`path=a:${(e+rot)%6},b:_0${termSuffix}`));
      nodeExits(1,2).forEach(e => parts.push(`path=a:${(e+rot)%6},b:_1${termSuffix}`));
      emitBypass();
    } else if (hex.feature === 'm') {
      [0,1,2].forEach(i => nodeExits(i,3).forEach(e => parts.push(`path=a:${(e+rot)%6},b:_${i}${termSuffix}`)));
      emitBypass();
    } else if (hex.feature === 'dualTown') {
      nodeExits(0,2).forEach(e => parts.push(`path=a:${(e+rot)%6},b:_0${termSuffix}`));
      nodeExits(1,2).forEach(e => parts.push(`path=a:${(e+rot)%6},b:_1${termSuffix}`));
      emitBypass();
    } else {
      nodeExits(0,1).forEach(e => parts.push(`path=a:${(e+rot)%6},b:_0${termSuffix}`));
      emitBypass();
    }
  }

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
