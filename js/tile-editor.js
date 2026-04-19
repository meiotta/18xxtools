// ─── TILE EDITOR ──────────────────────────────────────────────────────────────
// Standalone 18xx tile designer.
// Loaded by tile-editor.html after constants.js and renderer.js.
//
// Two operating modes:
//   standalone  — generic tile creation; all 6 edges available
//   hex-linked  — opened from a specific map hex; edges constrained to that
//                 hex's exit set; tile is linked into the hex upgrade chain
//
// URL params for hex-linked mode (future map-editor integration):
//   ?hex=3,4            sourceHexKey
//   &edges=0,1,3        comma-separated allowed edge numbers
//   &upgradeOf=14       tile ID this upgrades
//   &color=green        pre-set tile color
//   &orient=flat        pre-set orientation
//   &tileId=9001        override auto-assigned ID
//
// Architecture notes:
//   - LOCAL_HEX_SIZE (160px circumradius) is the enlarged canvas size.
//     The global HEX_SIZE (40) from constants.js is NEVER mutated.
//   - edgePos(e, dist) from renderer.js drives all snap geometry.
//     It reads window.state.meta.orientation — mocked below.
//   - calcArc(bx, by, ex, ey) from renderer.js for edge-to-edge arcs.
//   - All drawing uses local ctx2, not the main app's ctx global.

// ─── MOCK GLOBALS (for renderer.js function bodies) ──────────────────────────
// renderer.js references these only inside function bodies, so assignment here
// is safe — no errors at parse/load time.
window.state  = { meta: { orientation: 'flat' } };
window.panX   = 0;
window.panY   = 0;
window.zoom   = 1;

// ─── LOCAL GEOMETRY CONSTANTS ────────────────────────────────────────────────
const LOCAL_HEX_SIZE = 160;                             // circumradius, canvas px
const APOTHEM        = LOCAL_HEX_SIZE * Math.sqrt(3) / 2; // ≈ 138.6 px
const SVG_SCALE      = LOCAL_HEX_SIZE / 50;            // 3.2 — SVG-space → canvas
const OO_NODE_DIST   = APOTHEM * 0.48;                 // ≈ 66.5 px from center
const SNAP_RADIUS    = 18;                              // px — hit detection radius
const CANVAS_W       = 520;
const CANVAS_H       = 520;
const HEX_CX         = CANVAS_W / 2;                   // 260
const HEX_CY         = CANVAS_H / 2;                   // 260

// ─── EDITOR STATE ────────────────────────────────────────────────────────────
// Single source of truth for the tile being designed.
const editorState = {

  // ── Mode ────────────────────────────────────────────────────────────────────
  // 'standalone' : generic creation, all 6 edges available
  // 'hex-linked' : opened from a map hex, edges constrained to that hex's exits
  mode:         'standalone',
  sourceHexKey: null,            // 'row,col' string (e.g. '3,4') if hex-linked
  allowedEdges: [0,1,2,3,4,5],  // full set in standalone; subset when hex-linked
  upgradeOf:    null,            // tile ID string this upgrades (upgrade chain)
  tileId:       null,            // auto-assigned 9000+ ID; null until first use

  // ── Tile content ────────────────────────────────────────────────────────────
  orientation: 'flat',    // 'flat' | 'pointy'
  color:       'yellow',  // 'yellow' | 'green' | 'brown' | 'grey'
  label:       '',

  // nodes: placed station markers
  //   { id, type, slots, locIndex, revenue }
  //   id:       'n0', 'n1', ... (monotonically assigned per session)
  //   type:     'town' | 'city'
  //   slots:    1|2|3  (for cities; towns always 1)
  //   locIndex: null = hex center; 0..5 = OO radial slot (edgePos direction e)
  //   revenue:  number (default 10 for towns, 20 for cities)
  nodes: [],

  // paths: track segments
  //   { id, a, b }
  //   id:  'p0', 'p1', ...
  //   a/b: 'e0'..'e5' (hex edge) | node id ('n0', 'n1', ...)
  paths: [],

  selectedPath:  null,  // id of currently selected path, or null
  _nodeCounter:  0,
  _pathCounter:  0,
};

// ─── CANVAS SETUP ────────────────────────────────────────────────────────────
const canvas = document.getElementById('tileCanvas');
const ctx2   = canvas.getContext('2d');

// ─── HOVER STATE ─────────────────────────────────────────────────────────────
// Snap point currently under the cursor.
// { type: 'edge'|'nodeSnap'|'node', id: string } | null
let hoverTarget = null;

// ─── DRAG STATE ──────────────────────────────────────────────────────────────
// Set on mousedown over an edge or placed node to begin a path drag.
// { fromId, fromX, fromY, curX, curY }
let dragState = null;

// ─── TILE ID ─────────────────────────────────────────────────────────────────

// Returns the next available tile ID in the 9000+ custom range.
// Uses TileRegistry to avoid collisions with any already-registered custom tiles.
// Standard tiles (1–999) are far below 9000 so they never collide.
function nextCustomTileId() {
  const used = new Set(
    Object.keys(TileRegistry.getAllTileDefs())
      .map(k => parseInt(k, 10))
      .filter(n => !isNaN(n) && n >= 9000)
  );
  let id = 9000;
  while (used.has(id)) id++;
  return String(id);
}

// Ensure editorState.tileId is populated. Called lazily before first export/save.
function ensureTileId() {
  if (!editorState.tileId) {
    editorState.tileId = nextCustomTileId();
    const el = document.getElementById('tileIdInput');
    if (el) el.value = editorState.tileId;
  }
}

// ─── GEOMETRY HELPERS ────────────────────────────────────────────────────────

// Returns the 6 corners of the editor's enlarged hex in canvas coordinates.
function localHexCorners() {
  const r = LOCAL_HEX_SIZE;
  const offset = editorState.orientation === 'pointy' ? Math.PI / 6 : 0;
  const pts = [];
  for (let i = 0; i < 6; i++) {
    const a = offset + i * Math.PI / 3;
    pts.push({ x: HEX_CX + r * Math.cos(a), y: HEX_CY + r * Math.sin(a) });
  }
  return pts;
}

// Canvas coordinates of edge e midpoint.
// Uses edgePos() from renderer.js which respects window.state.meta.orientation.
function edgeCanvasPos(e) {
  const p = edgePos(e, APOTHEM);
  return { x: HEX_CX + p.x, y: HEX_CY + p.y };
}

// Canvas coordinates of OO radial node slot e.
function ooNodeCanvasPos(e) {
  const p = edgePos(e, OO_NODE_DIST);
  return { x: HEX_CX + p.x, y: HEX_CY + p.y };
}

// Canvas coordinates of a placed node.
function nodeCanvasPos(node) {
  if (node.locIndex === null) return { x: HEX_CX, y: HEX_CY };
  return ooNodeCanvasPos(node.locIndex);
}

// Canvas coordinates for a path endpoint id.
//   'e3' → edge 3 midpoint;  'n1' → placed node n1 position
function endpointCanvasPos(epId) {
  if (epId.startsWith('e')) return edgeCanvasPos(parseInt(epId[1], 10));
  const node = editorState.nodes.find(n => n.id === epId);
  return node ? nodeCanvasPos(node) : null;
}

// All UNOCCUPIED node snap positions. Entry: { x, y, locIndex, snapId }
function getNodeSnapPositions() {
  const occupied = new Set(
    editorState.nodes.map(n => n.locIndex === null ? 'center' : `oo${n.locIndex}`)
  );
  const positions = [];
  if (!occupied.has('center')) {
    positions.push({ x: HEX_CX, y: HEX_CY, locIndex: null, snapId: 'center' });
  }
  for (let e = 0; e < 6; e++) {
    if (!occupied.has(`oo${e}`)) {
      const p = ooNodeCanvasPos(e);
      positions.push({ x: p.x, y: p.y, locIndex: e, snapId: `oo${e}` });
    }
  }
  return positions;
}

// All 6 edge snap positions, each tagged with whether it is currently allowed.
// In standalone mode all are allowed; in hex-linked mode only allowedEdges are.
// Entry: { x, y, edgeIndex, snapId, allowed }
function getEdgeSnapPositions() {
  return [0, 1, 2, 3, 4, 5].map(e => {
    const p = edgeCanvasPos(e);
    return {
      x:          p.x,
      y:          p.y,
      edgeIndex:  e,
      snapId:     `e${e}`,
      allowed:    editorState.allowedEdges.includes(e),
    };
  });
}

// Nearest allowed snap point within SNAP_RADIUS of (mx, my), or null.
// Pass the full list; this function only returns allowed entries.
function nearestAllowedEdgeSnap(mx, my) {
  const snaps = getEdgeSnapPositions().filter(s => s.allowed);
  let best = null, bestDist = SNAP_RADIUS;
  for (const s of snaps) {
    const d = Math.hypot(s.x - mx, s.y - my);
    if (d < bestDist) { bestDist = d; best = s; }
  }
  return best;
}

// Nearest snap point (any allowed status) within SNAP_RADIUS, or null.
function nearestSnap(snaps, mx, my) {
  let best = null, bestDist = SNAP_RADIUS;
  for (const s of snaps) {
    const d = Math.hypot(s.x - mx, s.y - my);
    if (d < bestDist) { bestDist = d; best = s; }
  }
  return best;
}

// Nearest placed node within SNAP_RADIUS of (mx, my), or null.
function nearestNode(mx, my) {
  let best = null, bestDist = SNAP_RADIUS;
  for (const n of editorState.nodes) {
    const p = nodeCanvasPos(n);
    const d = Math.hypot(p.x - mx, p.y - my);
    if (d < bestDist) { bestDist = d; best = n; }
  }
  return best;
}

// Nearest path by midpoint proximity (15 px tolerance), or null.
function nearestPath(mx, my) {
  let best = null, bestDist = 15;
  for (const path of editorState.paths) {
    const a = endpointCanvasPos(path.a);
    const b = endpointCanvasPos(path.b);
    if (!a || !b) continue;
    const d = Math.hypot((a.x + b.x) / 2 - mx, (a.y + b.y) / 2 - my);
    if (d < bestDist) { bestDist = d; best = path; }
  }
  return best;
}

// True if a path between these two endpoint ids already exists.
function pathExists(id1, id2) {
  return editorState.paths.some(
    p => (p.a === id1 && p.b === id2) || (p.a === id2 && p.b === id1)
  );
}

// ─── DRAWING ─────────────────────────────────────────────────────────────────

// Main render entry point. Call after any state change.
// rubberBand: optional { fromX, fromY, toX, toY } for in-progress drag line.
function drawEditor(rubberBand) {
  ctx2.clearRect(0, 0, CANVAS_W, CANVAS_H);

  const corners   = localHexCorners();
  const fillColor = TILE_HEX_COLORS[editorState.color] || '#fde900';

  // 1 — Hex background
  ctx2.beginPath();
  ctx2.moveTo(corners[0].x, corners[0].y);
  for (let i = 1; i < 6; i++) ctx2.lineTo(corners[i].x, corners[i].y);
  ctx2.closePath();
  ctx2.fillStyle = fillColor;
  ctx2.fill();
  ctx2.strokeStyle = '#777';
  ctx2.lineWidth = 2;
  ctx2.stroke();

  // Clip track/node drawing to the hex interior
  ctx2.save();
  ctx2.beginPath();
  ctx2.moveTo(corners[0].x, corners[0].y);
  for (let i = 1; i < 6; i++) ctx2.lineTo(corners[i].x, corners[i].y);
  ctx2.closePath();
  ctx2.clip();

  // 2 — Committed track paths
  for (const path of editorState.paths) {
    drawPath(path, path.id === editorState.selectedPath);
  }

  // 3 — Rubber-band drag line
  if (rubberBand) {
    const { fromX, fromY, toX, toY } = rubberBand;
    ctx2.save();
    ctx2.strokeStyle = 'rgba(255,255,200,0.55)';
    ctx2.lineWidth   = 6;
    ctx2.setLineDash([8, 5]);
    ctx2.lineCap     = 'round';
    ctx2.beginPath();
    ctx2.moveTo(fromX, fromY);
    ctx2.lineTo(toX, toY);
    ctx2.stroke();
    ctx2.setLineDash([]);
    ctx2.restore();
  }

  // 4 — Placed nodes (drawn over track)
  for (const node of editorState.nodes) {
    drawNode(node);
  }

  ctx2.restore(); // end hex clip

  // 5 — Snap point indicators (outside clip so edge circles are fully visible)
  drawSnapPoints();

  // 6 — Tile label
  if (editorState.label) {
    ctx2.fillStyle    = 'rgba(0,0,0,0.55)';
    ctx2.font         = `bold ${Math.round(SVG_SCALE * 10)}px Arial`;
    ctx2.textAlign    = 'left';
    ctx2.textBaseline = 'middle';
    ctx2.fillText(editorState.label, HEX_CX - LOCAL_HEX_SIZE * 0.75, HEX_CY);
  }
}

// Draw a committed path: arc for edge–edge, straight line for edge–node.
function drawPath(path, selected) {
  const aPos = endpointCanvasPos(path.a);
  const bPos = endpointCanvasPos(path.b);
  if (!aPos || !bPos) return;

  const ax = aPos.x - HEX_CX, ay = aPos.y - HEX_CY; // relative to hex center
  const bx = bPos.x - HEX_CX, by = bPos.y - HEX_CY;

  ctx2.save();
  ctx2.strokeStyle = selected ? '#ffd700' : '#222';
  ctx2.lineWidth   = selected ? 11 : 8;
  ctx2.lineCap     = 'round';

  const aIsEdge = path.a.startsWith('e');
  const bIsEdge = path.b.startsWith('e');

  if (aIsEdge && bIsEdge) {
    const { radius, sweep } = calcArc(ax, ay, bx, by);
    ctx2.stroke(new Path2D(
      `M ${aPos.x} ${aPos.y} A ${radius} ${radius} 0 0 ${sweep} ${bPos.x} ${bPos.y}`
    ));
  } else {
    ctx2.beginPath();
    ctx2.moveTo(aPos.x, aPos.y);
    ctx2.lineTo(bPos.x, bPos.y);
    ctx2.stroke();
  }

  // Bright inner highlight for selected path
  if (selected) {
    ctx2.strokeStyle = '#ffe066';
    ctx2.lineWidth   = 4;
    if (aIsEdge && bIsEdge) {
      const { radius, sweep } = calcArc(ax, ay, bx, by);
      ctx2.stroke(new Path2D(
        `M ${aPos.x} ${aPos.y} A ${radius} ${radius} 0 0 ${sweep} ${bPos.x} ${bPos.y}`
      ));
    } else {
      ctx2.beginPath();
      ctx2.moveTo(aPos.x, aPos.y);
      ctx2.lineTo(bPos.x, bPos.y);
      ctx2.stroke();
    }
  }

  ctx2.restore();
}

// Draw snap point indicators:
//   - Edge exits: numbered hollow circles, dimmed/crossed if disallowed
//   - Node snap dots: small filled dots for unoccupied node positions
function drawSnapPoints() {
  const allEdgeSnaps = getEdgeSnapPositions();

  for (const snap of allEdgeSnaps) {
    const { x, y, edgeIndex: e, snapId, allowed } = snap;
    const isHov  = hoverTarget && hoverTarget.id === snapId;
    const hasPth = editorState.paths.some(p => p.a === snapId || p.b === snapId);

    if (allowed) {
      // ── Allowed edge exit ──
      ctx2.beginPath();
      ctx2.arc(x, y, isHov ? 10 : 7, 0, Math.PI * 2);
      ctx2.strokeStyle = isHov  ? '#ffffff'
                       : hasPth ? '#88ffaa'
                       :           '#777';
      ctx2.lineWidth = isHov ? 3 : 2;
      ctx2.stroke();
      if (isHov) {
        ctx2.fillStyle = 'rgba(255,255,255,0.12)';
        ctx2.fill();
      }

      // Edge number label just outside perimeter
      const lp = edgePos(e, APOTHEM + 20);
      ctx2.fillStyle    = isHov ? '#ddeeff' : '#667788';
      ctx2.font         = `${isHov ? 'bold ' : ''}12px Arial`;
      ctx2.textAlign    = 'center';
      ctx2.textBaseline = 'middle';
      ctx2.fillText(String(e), HEX_CX + lp.x, HEX_CY + lp.y);

    } else {
      // ── Disallowed edge exit (hex-linked mode: this exit is blocked) ──
      // Draw a dimmed, reddish circle with a small × to communicate "no track here"
      ctx2.beginPath();
      ctx2.arc(x, y, 7, 0, Math.PI * 2);
      ctx2.strokeStyle = 'rgba(180,60,60,0.55)';
      ctx2.lineWidth   = 1.5;
      ctx2.stroke();
      // × mark
      const xs = 4;
      ctx2.save();
      ctx2.strokeStyle = 'rgba(180,60,60,0.55)';
      ctx2.lineWidth   = 1.5;
      ctx2.lineCap     = 'round';
      ctx2.beginPath();
      ctx2.moveTo(x - xs, y - xs); ctx2.lineTo(x + xs, y + xs);
      ctx2.moveTo(x + xs, y - xs); ctx2.lineTo(x - xs, y + xs);
      ctx2.stroke();
      ctx2.restore();

      // Dimmed edge number label
      const lp = edgePos(e, APOTHEM + 20);
      ctx2.fillStyle    = 'rgba(120,60,60,0.5)';
      ctx2.font         = '11px Arial';
      ctx2.textAlign    = 'center';
      ctx2.textBaseline = 'middle';
      ctx2.fillText(String(e), HEX_CX + lp.x, HEX_CY + lp.y);
    }
  }

  // Node snap dots — unoccupied positions only
  const nodeSnaps = getNodeSnapPositions();
  for (const sp of nodeSnaps) {
    const isHov = hoverTarget && hoverTarget.id === sp.snapId;
    ctx2.beginPath();
    ctx2.arc(sp.x, sp.y, isHov ? 8 : 5, 0, Math.PI * 2);
    ctx2.fillStyle = isHov ? '#ffffff' : '#555';
    ctx2.fill();
    if (isHov) {
      ctx2.strokeStyle = '#aaaaaa';
      ctx2.lineWidth   = 1;
      ctx2.stroke();
    }
  }
}

// Draw a placed node (town bar or city circles) plus its revenue bubble.
function drawNode(node) {
  const pos = nodeCanvasPos(node);
  const sc  = SVG_SCALE;  // 3.2 — same scale convention as renderer.js

  ctx2.save();
  ctx2.translate(pos.x, pos.y);

  if (node.type === 'town') {
    const bw = 16 * sc, bh = 5 * sc;
    ctx2.fillStyle = '#111';
    ctx2.beginPath();
    if (ctx2.roundRect) {
      ctx2.roundRect(-bw / 2, -bh / 2, bw, bh, 2);
    } else {
      ctx2.rect(-bw / 2, -bh / 2, bw, bh);
    }
    ctx2.fill();
  } else {
    const sr     = 12.5 * sc;
    const slotPts = citySlotPositions(node.slots, sr);

    if (slotPts.length > 1) {
      const xs = slotPts.map(p => p.x), ys = slotPts.map(p => p.y);
      ctx2.fillStyle = 'white';
      ctx2.fillRect(
        Math.min(...xs) - sr,
        Math.min(...ys) - sr,
        (Math.max(...xs) - Math.min(...xs)) + 2 * sr,
        (Math.max(...ys) - Math.min(...ys)) + 2 * sr
      );
    }

    for (const sp of slotPts) {
      ctx2.beginPath();
      ctx2.arc(sp.x, sp.y, sr, 0, Math.PI * 2);
      ctx2.fillStyle   = 'white';
      ctx2.fill();
      ctx2.strokeStyle = '#444';
      ctx2.lineWidth   = 2;
      ctx2.stroke();
    }
  }

  // Revenue bubble (upper-right of node marker)
  const rr  = 8 * sc;
  const rbx = node.type === 'town' ? rr * 1.8 : rr * 1.6;
  const rby = node.type === 'town' ? -rr * 2.2 : -rr * 2.0;
  ctx2.beginPath();
  ctx2.arc(rbx, rby, rr, 0, Math.PI * 2);
  ctx2.fillStyle   = TILE_HEX_COLORS[editorState.color] || '#fde900';
  ctx2.fill();
  ctx2.strokeStyle = '#666';
  ctx2.lineWidth   = 1.5;
  ctx2.stroke();
  ctx2.fillStyle    = '#000';
  ctx2.font         = `bold ${Math.round(7 * sc)}px Arial`;
  ctx2.textAlign    = 'center';
  ctx2.textBaseline = 'middle';
  ctx2.fillText(String(node.revenue), rbx, rby);

  ctx2.restore();
}

// City slot positions relative to city center.  sr = slot radius (canvas px).
function citySlotPositions(slots, sr) {
  if (slots === 1) return [{ x: 0, y: 0 }];
  if (slots === 2) {
    const g = sr * 1.1;
    return [{ x: -g, y: 0 }, { x: g, y: 0 }];
  }
  const r = sr * 1.25;
  return [
    { x: 0,                           y: -r },
    { x: -r * Math.cos(Math.PI / 6),  y:  r * 0.5 },
    { x:  r * Math.cos(Math.PI / 6),  y:  r * 0.5 },
  ];
}

// ─── DSL GENERATION ──────────────────────────────────────────────────────────

// Converts editorState to a Toby Mao / 18xx.games DSL string.
// tileId is NOT part of the DSL string itself — it is shown separately in the
// panel. When manifest wiring is added, caller combines tileId + DSL.
//
// Example output: city=revenue:20,slots:2;path=a:0,b:_0;path=a:3,b:_0;label=OO
function generateDSL() {
  const parts = [];

  for (const node of editorState.nodes) {
    parts.push(
      node.type === 'town'
        ? `town=revenue:${node.revenue}`
        : `city=revenue:${node.revenue},slots:${node.slots}`
    );
  }

  for (const path of editorState.paths) {
    parts.push(`path=a:${dslEndpointId(path.a)},b:${dslEndpointId(path.b)}`);
  }

  if (editorState.label) parts.push(`label=${editorState.label}`);

  return parts.join(';');
}

// 'e3' → '3'  (edge number)
// 'n0' → '_0' (node index in editorState.nodes declaration order)
function dslEndpointId(epId) {
  if (epId.startsWith('e')) return epId[1];
  const idx = editorState.nodes.findIndex(n => n.id === epId);
  return idx >= 0 ? `_${idx}` : epId;
}

function updateDSL() {
  ensureTileId();
  document.getElementById('dslOutput').value = generateDSL();
}

// ─── REVENUE PANEL ───────────────────────────────────────────────────────────

function updateRevenueUI() {
  const container = document.getElementById('nodeRevenues');
  if (editorState.nodes.length === 0) {
    container.innerHTML = '<span class="empty-note">Place nodes on the hex to set revenue.</span>';
    return;
  }
  container.innerHTML = '';
  editorState.nodes.forEach((node, i) => {
    const row  = document.createElement('div');
    row.className = 'node-rev-row';

    const locLabel  = node.locIndex === null ? 'center' : `pos ${node.locIndex}`;
    const typeLabel = node.type === 'town' ? 'Town' : `City (${node.slots}-slot)`;

    const label = document.createElement('label');
    label.textContent = `_${i} ${typeLabel}\n@ ${locLabel}`;
    label.style.whiteSpace = 'pre';

    const input = document.createElement('input');
    input.type  = 'number';
    input.value = node.revenue;
    input.min   = 0;
    input.step  = 10;
    input.addEventListener('change', () => {
      node.revenue = parseInt(input.value, 10) || 0;
      drawEditor();
      updateDSL();
    });

    row.appendChild(label);
    row.appendChild(input);
    container.appendChild(row);
  });
}

// ─── MODE BANNER ─────────────────────────────────────────────────────────────

// Update the mode info strip and related panel fields to reflect editorState.
function updateModeBanner() {
  const banner = document.getElementById('modeBanner');
  if (!banner) return;

  if (editorState.mode === 'hex-linked') {
    const edgeList = editorState.allowedEdges.join(', ');
    const upStr    = editorState.upgradeOf ? ` — upgrades tile ${editorState.upgradeOf}` : '';
    banner.textContent  = `Hex-linked: ${editorState.sourceHexKey || '?'}  ·  edges ${edgeList}${upStr}`;
    banner.className    = 'mode-banner mode-hex';
  } else {
    banner.textContent = 'Standalone — all 6 edges available';
    banner.className   = 'mode-banner mode-standalone';
  }

  // Upgrade-of field
  const upRow = document.getElementById('upgradeOfRow');
  if (upRow) {
    upRow.style.display = editorState.upgradeOf ? '' : 'none';
    const upVal = document.getElementById('upgradeOfVal');
    if (upVal) upVal.textContent = editorState.upgradeOf || '';
  }
}

// ─── URL PARAMETER INIT ──────────────────────────────────────────────────────

// Read URL search params and configure editorState accordingly.
// This is the seam for future map-editor → tile-editor navigation.
// All params are optional; absence of 'hex' keeps standalone mode.
function initFromURLParams() {
  const params = new URLSearchParams(window.location.search);

  if (params.has('hex')) {
    editorState.mode         = 'hex-linked';
    editorState.sourceHexKey = params.get('hex');
  }

  if (params.has('edges')) {
    editorState.allowedEdges = params.get('edges')
      .split(',')
      .map(s => parseInt(s.trim(), 10))
      .filter(n => !isNaN(n) && n >= 0 && n <= 5);
    // Safety: if empty (malformed param), fall back to all edges
    if (editorState.allowedEdges.length === 0) editorState.allowedEdges = [0,1,2,3,4,5];
  }

  if (params.has('upgradeOf'))  editorState.upgradeOf = params.get('upgradeOf');

  if (params.has('color')) {
    const c = params.get('color');
    if (['yellow','green','brown','grey'].includes(c)) editorState.color = c;
  }

  if (params.has('orient')) {
    const o = params.get('orient');
    if (['flat','pointy'].includes(o)) {
      editorState.orientation      = o;
      window.state.meta.orientation = o;
    }
  }

  // Explicit tileId override (e.g. when re-editing an existing custom tile)
  if (params.has('tileId')) {
    const id = params.get('tileId').trim();
    if (id) editorState.tileId = id;
  }
}

// Sync all panel DOM controls to match editorState after init.
function syncUIFromState() {
  // Color buttons
  document.querySelectorAll('.color-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.color === editorState.color);
  });

  // Orientation buttons
  document.querySelectorAll('.orient-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.orient === editorState.orientation);
  });

  // Label
  const labelEl = document.getElementById('labelInput');
  if (labelEl) labelEl.value = editorState.label;

  // Tile ID — show if already assigned, otherwise leave blank (auto-assigned on first export)
  const tileIdEl = document.getElementById('tileIdInput');
  if (tileIdEl) tileIdEl.value = editorState.tileId || '';

  updateModeBanner();
  updateRevenueUI();
}

// ─── MOUSE EVENT HELPERS ─────────────────────────────────────────────────────

function canvasPos(e) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (e.clientX - rect.left) * (canvas.width  / rect.width),
    y: (e.clientY - rect.top)  * (canvas.height / rect.height),
  };
}

// ─── INTERACTION ─────────────────────────────────────────────────────────────

canvas.addEventListener('mousedown',   onMouseDown);
canvas.addEventListener('mousemove',   onMouseMove);
canvas.addEventListener('mouseup',     onMouseUp);
canvas.addEventListener('contextmenu', onContextMenu);
canvas.addEventListener('dblclick',    onDblClick);
window.addEventListener('keydown',     onKeyDown);

function onMouseDown(e) {
  if (e.button !== 0) return;
  const { x, y } = canvasPos(e);

  // Select a committed path
  const hitPath = nearestPath(x, y);
  if (hitPath) {
    editorState.selectedPath = hitPath.id;
    drawEditor();
    return;
  }

  // Drag from an ALLOWED edge exit to add track
  const hitEdge = nearestAllowedEdgeSnap(x, y);
  if (hitEdge) {
    dragState = { fromId: hitEdge.snapId, fromX: hitEdge.x, fromY: hitEdge.y, curX: x, curY: y };
    return;
  }

  // Drag from a placed node to add track from that node
  const hitNode = nearestNode(x, y);
  if (hitNode) {
    const p = nodeCanvasPos(hitNode);
    dragState = { fromId: hitNode.id, fromX: p.x, fromY: p.y, curX: x, curY: y };
    return;
  }

  if (editorState.selectedPath) {
    editorState.selectedPath = null;
    drawEditor();
  }
}

function onMouseMove(e) {
  const { x, y } = canvasPos(e);

  if (dragState) {
    dragState.curX = x;
    dragState.curY = y;
    drawEditor({ fromX: dragState.fromX, fromY: dragState.fromY, toX: x, toY: y });

    const snapTarget = nearestAllowedEdgeSnap(x, y) || nearestNode(x, y);
    canvas.style.cursor = snapTarget ? 'cell' : 'crosshair';
    return;
  }

  // Hover — only consider ALLOWED edges for active hover styling
  const prev = hoverTarget ? hoverTarget.id : null;

  const hitEdge     = nearestAllowedEdgeSnap(x, y);
  const hitNode     = nearestNode(x, y);
  const hitNodeSnap = nearestSnap(getNodeSnapPositions(), x, y);

  if (hitEdge) {
    hoverTarget = { type: 'edge',     id: hitEdge.snapId };
    canvas.style.cursor = 'crosshair';
  } else if (hitNode) {
    hoverTarget = { type: 'node',     id: hitNode.id };
    canvas.style.cursor = 'context-menu';
  } else if (hitNodeSnap) {
    hoverTarget = { type: 'nodeSnap', id: hitNodeSnap.snapId };
    canvas.style.cursor = 'pointer';
  } else {
    hoverTarget = null;
    canvas.style.cursor = 'default';
  }

  if ((hoverTarget ? hoverTarget.id : null) !== prev) drawEditor();
}

function onMouseUp(e) {
  if (e.button !== 0) { dragState = null; return; }
  const { x, y } = canvasPos(e);

  if (dragState) {
    const fromId = dragState.fromId;
    const moved  = Math.hypot(x - dragState.fromX, y - dragState.fromY);

    if (moved >= 5) {
      // Genuine drag — resolve target (allowed edges only, or any node)
      const hitEdge = nearestAllowedEdgeSnap(x, y);
      const hitNode = nearestNode(x, y);

      let toId = null;
      if (hitEdge && hitEdge.snapId !== fromId)  toId = hitEdge.snapId;
      else if (hitNode && hitNode.id !== fromId)  toId = hitNode.id;

      if (toId && !pathExists(fromId, toId)) {
        editorState.paths.push({ id: `p${editorState._pathCounter++}`, a: fromId, b: toId });
        updateDSL();
      }
    }

    dragState = null;
    drawEditor();
    return;
  }

  // Click on an unoccupied node snap position → place town
  const hitNodeSnap = nearestSnap(getNodeSnapPositions(), x, y);
  if (hitNodeSnap) {
    editorState.nodes.push({
      id:       `n${editorState._nodeCounter++}`,
      type:     'town',
      slots:    1,
      locIndex: hitNodeSnap.locIndex,
      revenue:  10,
    });
    updateRevenueUI();
    drawEditor();
    updateDSL();
  }
}

function onContextMenu(e) {
  e.preventDefault();
  const { x, y } = canvasPos(e);
  const hitNode = nearestNode(x, y);
  if (!hitNode) return;

  // Cycle: town → city(1) → city(2) → city(3) → remove
  if (hitNode.type === 'town') {
    hitNode.type = 'city'; hitNode.slots = 1; hitNode.revenue = 20;
  } else if (hitNode.type === 'city' && hitNode.slots < 3) {
    hitNode.slots++;
  } else {
    editorState.paths = editorState.paths.filter(p => p.a !== hitNode.id && p.b !== hitNode.id);
    editorState.nodes = editorState.nodes.filter(n => n.id !== hitNode.id);
  }

  updateRevenueUI();
  drawEditor();
  updateDSL();
}

function onDblClick() {
  editorState.selectedPath = null;
  drawEditor();
}

function onKeyDown(e) {
  if ((e.key === 'Delete' || e.key === 'Backspace') && editorState.selectedPath) {
    editorState.paths = editorState.paths.filter(p => p.id !== editorState.selectedPath);
    editorState.selectedPath = null;
    drawEditor();
    updateDSL();
  }
}

// ─── PANEL CONTROLS ──────────────────────────────────────────────────────────

document.querySelectorAll('.color-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    editorState.color = btn.dataset.color;
    document.querySelectorAll('.color-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    drawEditor();
    updateDSL();
  });
});

document.querySelectorAll('.orient-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    editorState.orientation      = btn.dataset.orient;
    window.state.meta.orientation = btn.dataset.orient;
    document.querySelectorAll('.orient-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    drawEditor();
  });
});

document.getElementById('labelInput').addEventListener('input', e => {
  editorState.label = e.target.value.trim();
  drawEditor();
  updateDSL();
});

document.getElementById('tileIdInput').addEventListener('change', e => {
  const raw = e.target.value.trim();
  if (raw) {
    editorState.tileId = raw;
  } else {
    // Re-auto-assign on clear
    editorState.tileId = nextCustomTileId();
    e.target.value = editorState.tileId;
  }
});

document.getElementById('copyBtn').addEventListener('click', () => {
  const dsl = document.getElementById('dslOutput').value;
  if (!dsl) return;
  navigator.clipboard.writeText(dsl).then(() => {
    const btn = document.getElementById('copyBtn');
    const orig = btn.textContent;
    btn.textContent = 'Copied!';
    setTimeout(() => { btn.textContent = orig; }, 1500);
  }).catch(() => {
    document.getElementById('dslOutput').select();
    document.execCommand('copy');
  });
});

document.getElementById('clearBtn').addEventListener('click', () => {
  editorState.nodes        = [];
  editorState.paths        = [];
  editorState.selectedPath = null;
  editorState.label        = '';
  editorState._nodeCounter = 0;
  editorState._pathCounter = 0;
  // Keep tileId, mode, allowedEdges — those are session context, not tile content
  document.getElementById('labelInput').value = '';
  updateRevenueUI();
  drawEditor();
  updateDSL();
});

// ─── BOOT ────────────────────────────────────────────────────────────────────
initFromURLParams();
syncUIFromState();
drawEditor();
updateDSL();
