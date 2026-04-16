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
const PHASE_COLORS = { yellow:'#F0D070', green:'#71BF44', brown:'#CB7745', gray:'#BCBDC0' };

// Color rail definitions (no "Blank" option)
const BG_OPTS = [
  { v:'white',  label:'White',  hex:'#D4B483', border:'#bba060', title:'White — upgrades to Yellow'  },
  { v:'yellow', label:'Yellow', hex:'#F0D070', border:'#c8a800', title:'Yellow — upgrades to Green'  },
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

// ── Internal state ────────────────────────────────────────────────────────────

let _hexId          = null;
let _bg             = 'white';
let _segments       = [];   // [{id, ea, eb}]  blank edge-to-edge paths
let _nodes          = [];   // [{id, type, slots, locStr, revenue, phaseRevenue:{y,g,br,gr}, terminal, phaseMode}]
let _nodeEdges      = {};   // {nodeId: [edge,...]}  edges connected to each node
let _label          = '';
let _selectedNodeId = null;
let _pendingEdge    = null;
let _activeTool     = 'track';
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
  _label = '';
  _uid = 1;
  _selectedNodeId = null;
  _pendingEdge = null;
  _activeTool = 'track';
  _mousePos = { x: 0, y: 0 };
  _highlightSnap = null;
  _showManifest = false;
  _manifestId = '';
  _manifestCount = 1;

  // Load existing static hex data if present
  const h = (state.hexes || {})[hexId];
  if (h && h.static) {
    _bg    = h.bg    || 'white';
    _label = h.label || '';
    // Re-hydrate nodes and segments from saved model
    _loadFromModel(h);
  }
}

// Re-hydrate internal state from a saved model (best-effort)
function _loadFromModel(h) {
  // Restore nodes from feature + exits + exitPairs
  const feature  = h.feature || 'none';
  const exitPairs = h.exitPairs || [];

  // If the saved model has nodes[], use their locStr directly (round-trip fidelity).
  // Otherwise fall back to feature-based reconstruction with locStr:'center'.
  const savedNodes = h.nodes || [];

  if (feature === 'town' || feature === 'dualTown') {
    const revs = feature === 'dualTown' ? (h.townRevenues || [10, 10]) : [h.townRevenue || 10];
    const exits = h.exits || [];
    const pairs = exitPairs.length ? exitPairs : [exits];
    revs.forEach((rev, i) => {
      const nodeId = _nextId();
      const edges  = pairs[i] || [];
      const locStr = savedNodes[i]?.locStr || 'center';
      _nodes.push({ id: nodeId, type: 'town', slots: 1, locStr, revenue: rev, phaseRevenue: { yellow: 20, green: 30, brown: 40, gray: 60 }, terminal: false, phaseMode: false });
      _nodeEdges[nodeId] = edges;
    });
  } else if (feature === 'city' || feature === 'oo' || feature === 'm') {
    const revs  = h.ooFlatRevenues || h.mFlatRevenues || [];
    const slots = feature === 'city' ? [h.slots || 1] : (h.ooSlots || [1, 1]);
    const count = feature === 'm' ? 3 : (feature === 'oo' ? 2 : 1);
    const pairs = exitPairs.length ? exitPairs : [];
    for (let i = 0; i < count; i++) {
      const nodeId = _nextId();
      const edges  = pairs[i] || [];
      const rev    = revs[i] || 20;
      const locStr = savedNodes[i]?.locStr || 'center';
      _nodes.push({ id: nodeId, type: 'city', slots: slots[i] || 1, locStr, revenue: rev, phaseRevenue: { ...(h.phaseRevenue || { yellow: 20, green: 30, brown: 40, gray: 60 }) }, terminal: h.terminal || false, phaseMode: !!(h.phaseRevenue && Object.keys(h.phaseRevenue).length && h.activePhases?.yellow) });
      _nodeEdges[nodeId] = edges;
    }
  } else if (feature === 'offboard') {
    const nodeId = _nextId();
    const locStr = savedNodes[0]?.locStr || 'center';
    _nodes.push({ id: nodeId, type: 'offboard', slots: 1, locStr, revenue: 0, phaseRevenue: { ...(h.phaseRevenue || { yellow: 20, green: 30, brown: 40, gray: 60 }) }, terminal: true, phaseMode: true });
    _nodeEdges[nodeId] = h.exits || [];
  }

  // Restore blank segments
  (h.blankPaths || []).forEach(([ea, eb]) => {
    _segments.push({ id: _nextId(), ea, eb });
  });
}

// ── DSL hex conversion (for hexToSvgInner + save) ─────────────────────────────

function _toDslHex() {
  // Build nodes[] and paths[] that hexToSvgInner understands
  const nodes = _nodes.map(n => ({
    type:   n.type === 'offboard' ? 'city' : n.type,
    slots:  n.slots  || 1,
    locStr: n.locStr || 'center',
  }));

  const paths = [];

  // Edge-to-node paths
  // Path endpoint convention (matches import-ruby.js parseEndpt and renderer):
  //   edge endpoint → { type: 'edge', n: edgeNumber }
  //   node endpoint → { type: 'node', n: nodeIndex }
  // Both use .n — do NOT use .e for edges here.
  _nodes.forEach((node, ni) => {
    const edges = _nodeEdges[node.id] || [];
    edges.forEach(edge => {
      paths.push({ a: { type: 'edge', n: edge }, b: { type: 'node', n: ni }, terminal: (node.terminal && node.type === 'offboard') ? 1 : undefined });
    });
  });

  // Blank edge-to-edge segments become paths too
  _segments.forEach(seg => {
    paths.push({ a: { type: 'edge', n: seg.ea }, b: { type: 'edge', n: seg.eb } });
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

  // nodes[] + paths[] — required by hexToSvgInner for rendering.
  // hex.feature is only a derived summary; the renderer iterates nodes[]/paths[].
  const nodes = _nodes.map(n => ({
    type:   n.type === 'offboard' ? 'city' : n.type,
    slots:  n.slots  || 1,
    locStr: n.locStr || 'center',
  }));
  const paths = [];
  _nodes.forEach((node, ni) => {
    (_nodeEdges[node.id] || []).forEach(edge => {
      paths.push({ a: { type: 'edge', n: edge }, b: { type: 'node', n: ni },
                   terminal: (node.terminal && node.type === 'offboard') ? 1 : undefined });
    });
  });
  _segments.forEach(seg => {
    paths.push({ a: { type: 'edge', n: seg.ea }, b: { type: 'edge', n: seg.eb } });
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
    ooFlatRevenues: cityNodes.map(c => c.revenue || 20),
    mFlatRevenues:  cityNodes.map(c => c.revenue || 20),
    phaseRevenue,
    activePhases,
    label:          _label,
    name:           '',
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
  return BG_OPTS.find(o => o.v === _bg)?.hex || '#D4B483';
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
  const showOff = (_bg === 'red');
  const tools = [
    { id: 'track',    label: 'Track',    icon: '&#9135;' },
    { id: 'town',     label: 'Town',     icon: '&#9670;' },
    { id: 'city',     label: 'City',     icon: '&#9675;' },
    ...(showOff ? [{ id: 'offboard', label: 'Offboard', icon: '&#10022;' }] : []),
    { id: 'erase',    label: 'Erase',    icon: '&#10006;' },
  ];
  return `<div class="hb-section">
    <div class="hb-section-label">Tool</div>
    <div class="hb-toolbar" id="hbToolbar">
      ${tools.map(t => `
        <button class="hb-tool-btn${_activeTool === t.id ? ' active' : ''}"
          data-tool="${t.id}" title="${t.label}">${t.icon} ${t.label}</button>`).join('')}
    </div>
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

  let html = `<div class="hb-section-label">Node Config — <span style="text-transform:capitalize;color:#ffd700;">${node.type}</span></div>`;

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
  let s = '';

  // Hex background
  s += `<polygon points="${cornerPts}" fill="${_bgHexColor()}" stroke="#888" stroke-width="2"/>`;

  // ── Live hex content via hexToSvgInner ─────────────────────────────────────
  const dsl = _toDslHex();
  if (typeof hexToSvgInner === 'function' && (dsl.nodes.length > 0 || dsl.paths.length > 0)) {
    const savedOrientation = state?.meta?.orientation;
    if (state && state.meta) state.meta.orientation = 'flat';
    try {
      const inner = hexToSvgInner(dsl, null);
      if (inner) {
        s += `<g transform="translate(${CCX},${CCY}) scale(${SC})">${inner}</g>`;
      }
    } catch (e) {
      // silently ignore render errors in preview
    }
    if (state && state.meta) state.meta.orientation = savedOrientation;
  }

  // ── Snap targets for Town/City/Offboard tools ──────────────────────────────
  if (_activeTool === 'town' || _activeTool === 'city' || _activeTool === 'offboard') {
    for (const snap of SNAP_POSITIONS) {
      // Don't show snap dot where a non-expandable node already sits
      const existing = _nodes.find(n => n.locStr === snap.locStr);
      if (existing && !(existing.type === 'city' && (existing.slots || 1) < 4)) continue;

      const isHighlight = (_highlightSnap === snap.locStr);
      const fill   = isHighlight ? '#ffd700' : 'rgba(200,200,200,0.25)';
      const stroke = isHighlight ? '#ffd700' : 'rgba(200,200,200,0.5)';
      s += `<circle cx="${snap.x.toFixed(1)}" cy="${snap.y.toFixed(1)}" r="7"
               fill="${fill}" stroke="${stroke}" stroke-width="1.5"
               pointer-events="none"/>`;
    }
  }

  // ── Pending edge glow ──────────────────────────────────────────────────────
  if (_pendingEdge !== null) {
    const [px, py] = EMP[_pendingEdge];
    s += `<circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="${EDGE_R + 6}"
             fill="#ffd700" opacity="0.35" pointer-events="none"/>`;
  }

  // ── Edge circles (always visible) ─────────────────────────────────────────
  for (let e = 0; e < 6; e++) {
    const [ex, ey] = EMP[e];
    const connected = _nodes.some(n => (_nodeEdges[n.id] || []).includes(e)) ||
                      _segments.some(seg => seg.ea === e || seg.eb === e);
    const isPending  = (_pendingEdge === e);
    const fill = isPending ? '#c8a000' : (connected ? '#2a6a1a' : '#333');
    const stroke = isPending ? '#ffd700' : '#111';
    const sw     = isPending ? 2.5 : 1.5;

    s += `<circle cx="${ex.toFixed(1)}" cy="${ey.toFixed(1)}" r="${EDGE_R}"
             fill="${fill}" stroke="${stroke}" stroke-width="${sw}"
             data-edge="${e}" style="cursor:pointer;"/>`;
    s += `<text x="${ex.toFixed(1)}" y="${(ey + 4).toFixed(1)}"
             text-anchor="middle" font-size="11" font-weight="bold" fill="white"
             pointer-events="none">${e}</text>`;
  }

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

  if (_activeTool === 'town' || _activeTool === 'city' || _activeTool === 'offboard') {
    const snap = _nearestSnap(_mousePos.x, _mousePos.y);
    const newHl = snap?.locStr || null;
    if (newHl !== _highlightSnap) {
      _highlightSnap = newHl;
      _renderCanvas();
    }
  }
}

function _onCanvasClick(e) {
  const rect = e.currentTarget.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;

  // Check if an edge circle was clicked
  const clickedEdge = _edgeAtPoint(mx, my);
  if (clickedEdge !== null) {
    _handleEdgeClick(clickedEdge);
    return;
  }

  if (_activeTool === 'track') {
    // In track mode outside edges — cancel pending
    if (_pendingEdge !== null) { _pendingEdge = null; _renderCanvas(); }
    return;
  }

  if (_activeTool === 'town' || _activeTool === 'city' || _activeTool === 'offboard') {
    const snap = _nearestSnap(mx, my);
    if (snap) _handleNodePlacement(snap.locStr);
    return;
  }

  if (_activeTool === 'erase') {
    _handleErase(mx, my);
  }
}

function _edgeAtPoint(mx, my) {
  for (let e = 0; e < 6; e++) {
    const [ex, ey] = EMP[e];
    if (Math.hypot(mx - ex, my - ey) <= EDGE_R + 4) return e;
  }
  return null;
}

function _handleEdgeClick(edge) {
  if (_activeTool === 'track') {
    if (_pendingEdge === null) {
      _pendingEdge = edge;
    } else if (_pendingEdge === edge) {
      // Same edge twice — cancel
      _pendingEdge = null;
    } else {
      // Create blank segment
      const ea = _pendingEdge, eb = edge;
      _pendingEdge = null;
      if (!_segments.some(s => (s.ea === ea && s.eb === eb) || (s.ea === eb && s.eb === ea))) {
        _segments.push({ id: _nextId(), ea, eb });
      }
      _updateDslPreview();
    }
    _renderCanvas();
    return;
  }

  if (_activeTool === 'town' || _activeTool === 'city' || _activeTool === 'offboard') {
    if (_selectedNodeId !== null) {
      // A node is selected — single-click toggles this edge's connection to it
      const edges = _nodeEdges[_selectedNodeId] || [];
      const idx = edges.indexOf(edge);
      if (idx >= 0) {
        edges.splice(idx, 1);   // disconnect
      } else {
        edges.push(edge);       // connect
      }
      _nodeEdges[_selectedNodeId] = edges;
      _pendingEdge = null;
    } else {
      // No node selected yet — two-click shortcut: place a node at center
      // connecting both clicked edges (quicker than clicking canvas + edges separately)
      if (_pendingEdge === null) {
        _pendingEdge = edge;
      } else if (_pendingEdge === edge) {
        _pendingEdge = null;
      } else {
        const nodeId = _placeNode('center');
        if (nodeId !== null) {
          const nodeEdges = _nodeEdges[nodeId] || [];
          if (!nodeEdges.includes(_pendingEdge)) nodeEdges.push(_pendingEdge);
          if (!nodeEdges.includes(edge))         nodeEdges.push(edge);
          _nodeEdges[nodeId] = nodeEdges;
        }
        _pendingEdge = null;
      }
    }
    _renderCanvas();
    _updateDslPreview();
    return;
  }

  if (_activeTool === 'erase') {
    // Remove all connections through this edge
    _segments = _segments.filter(s => s.ea !== edge && s.eb !== edge);
    _nodes.forEach(n => {
      _nodeEdges[n.id] = (_nodeEdges[n.id] || []).filter(e => e !== edge);
    });
    _renderCanvas();
    _updateDslPreview();
  }
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

  const type = _activeTool === 'offboard' ? 'offboard' : _activeTool;
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

function _handleNodePlacement(locStr) {
  const existing = _nodes.find(n => n.locStr === locStr);

  if (_pendingEdge !== null) {
    // Connect pending edge to node at this locStr
    let nodeId;
    if (existing) {
      nodeId = existing.id;
    } else {
      nodeId = _placeNode(locStr);
    }
    if (nodeId !== null) {
      const edges = _nodeEdges[nodeId] || [];
      if (!edges.includes(_pendingEdge)) edges.push(_pendingEdge);
      _nodeEdges[nodeId] = edges;
    }
    _pendingEdge = null;
    _renderCanvas();
    _updateDslPreview();
    return;
  }

  if (existing) {
    // Select existing node for config
    _selectedNodeId = existing.id;
    _refreshNodeConfig();
    _renderCanvas();
    return;
  }

  _placeNode(locStr);
}

function _removeNode(nodeId) {
  _nodes = _nodes.filter(n => n.id !== nodeId);
  delete _nodeEdges[nodeId];
  if (_selectedNodeId === nodeId) _selectedNodeId = null;
  _refreshNodeConfig();
  _renderCanvas();
  _updateDslPreview();
}

function _handleErase(mx, my) {
  // Check for node click (in canvas space, nodes render at snap positions)
  for (const node of _nodes) {
    const snap = SNAP_POSITIONS.find(s => s.locStr === node.locStr);
    if (!snap) continue;
    if (Math.hypot(mx - snap.x, my - snap.y) <= 20 * SC) {
      _removeNode(node.id);
      return;
    }
  }

  // Check for segment midpoint click
  for (const seg of _segments) {
    const [ax, ay] = EMP[seg.ea];
    const [bx, by] = EMP[seg.eb];
    const mx2 = (ax + bx) / 2, my2 = (ay + by) / 2;
    if (Math.hypot(mx - mx2, my - my2) <= 18) {
      _segments = _segments.filter(s => s.id !== seg.id);
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
// KEPT EXACTLY AS-IS from the original file — do not modify.

window.staticHexCode = function staticHexCode(hex) {
  if (!hex || !hex.static) return '';
  const parts  = [];
  const exits  = hex.exits || [];
  const rot    = hex.rotation || 0;
  // Phase revenue is node-driven (hex.activePhases set when any node has phaseMode).
  // Color does not gate phase revenue — a gray map hex can have phase revenue too.
  const isPhase = !!(hex.activePhases && Object.values(hex.activePhases).some(Boolean));
  // noExits: true when no node has any connected edges (bypass-only or isolated node).
  // Check exitPairs if available; fall back to full exits array for imported hexes.
  const nodeExitCount = (hex.exitPairs || []).reduce((n, arr) => n + (arr||[]).length, 0);
  const noExits = hex.exitPairs ? nodeExitCount === 0 : exits.length === 0;

  function phaseRevStr() {
    const pr = hex.phaseRevenue || {};
    const active = PHASES.filter(p => hex.activePhases?.[p]);
    return active.length ? active.map(p=>`${p}_${pr[p]||0}`).join('|') : '0';
  }

  const termSuffix = hex.feature==='offboard'
    ? `,terminal:${hex.taperStyle||1}`
    : (hex.terminal?',terminal:1':'');

  // ── Node directives ───────────────────────────────────────────────────────
  switch (hex.feature) {
    case 'town': {
      // Phase revenue for towns is unusual but valid in custom games
      const hasPhase = Object.keys(hex.phaseRevenue||{}).length && hex.activePhases?.yellow;
      parts.push(`town=revenue:${noExits?0:(hasPhase?phaseRevStr():(hex.townRevenue??10))}`);
      break;
    }
    case 'dualTown': {
      const [r0,r1] = hex.townRevenues||[10,10];
      parts.push(`town=revenue:${noExits?0:r0}`);
      parts.push(`town=revenue:${noExits?0:r1}`);
      break;
    }
    case 'offboard':
      parts.push(`offboard=revenue:${isPhase?phaseRevStr():'0'}`);
      break;
    case 'oo':
    case 'c': {
      const revs = hex.ooFlatRevenues||[20,20];
      const sl   = hex.ooSlots||[1,1];
      [0,1].forEach(i=>parts.push(`city=revenue:${noExits?0:revs[i]||0}${sl[i]>1?`,slots:${sl[i]}`:''}`));
      break;
    }
    case 'm': {
      const revs = hex.mFlatRevenues||[20,20,20];
      [0,1,2].forEach(i=>parts.push(`city=revenue:${noExits?0:revs[i]||0}`));
      break;
    }
    case 'city': {
      const slots = hex.slots||1;
      const rev   = isPhase ? phaseRevStr() : (noExits?0:(hex.ooFlatRevenues?.[0]??20));
      const sl    = slots>1?`,slots:${slots}`:'';
      const loc   = slots===3?',loc:1':'';
      parts.push(`city=revenue:${rev}${sl}${loc}`);
      break;
    }
    default: break;
  }

  // ── Path directives ───────────────────────────────────────────────────────
  //
  // Two orthogonal path types — never derive one from the other:
  //   Node stubs  → use exitPairs[i] (per-node edge lists), emit as path=a:X,b:_i
  //   Bypass paths → use blankPaths ([[ea,eb],...]),       emit as path=a:X,b:Y
  //
  // exitPairs[i] is authoritative for which edges stub into node i.
  // For imported hexes that lack exitPairs, fall back to exits÷nodes heuristic.
  // blankPaths are ALWAYS emitted after node stubs for every feature type.
  //
  const ep   = hex.exitPairs || [];
  const byp  = hex.blankPaths || [];
  const emitBypass = () => byp.forEach(([a,b]) => parts.push(`path=a:${(a+rot)%6},b:${(b+rot)%6}`));

  // Helper: get per-node exits, falling back to heuristic split of exits[] when
  // exitPairs is absent (e.g. hexes imported from Ruby DSL before exitPairs was added).
  function nodeExits(i, total) {
    if (ep.length > i) return ep[i] || [];
    // Fallback: split exits evenly across nodes
    const chunk = Math.ceil(exits.length / total);
    return exits.slice(i * chunk, (i + 1) * chunk);
  }

  if (!hex.feature || hex.feature === 'none') {
    // Pure bypass hex — no nodes at all
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
    // city (single), town, offboard
    nodeExits(0,1).forEach(e => parts.push(`path=a:${(e+rot)%6},b:_0${termSuffix}`));
    emitBypass();
  }

  if (hex.label) parts.push(`label=${hex.label}`);

  (hex.borders||[]).forEach(b=>{
    let d=`border=edge:${b.edge}`;
    if(b.type)d+=`,type:${b.type}`;
    if(b.cost)d+=`,cost:${b.cost}`;
    parts.push(d);
  });

  return parts.join(';');
};

}());
