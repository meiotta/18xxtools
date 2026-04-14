// ─── RENDERER ─────────────────────────────────────────────────────────────────
// Canvas drawing functions.
// Load order: FOURTH — after hex-geometry.js.
//
// drawHex(row, col, hex)  — renders a single hex cell with terrain, tile, city, etc.
// render()                — clears canvas and redraws all hexes + coordinate labels
// resizeCanvas()          — called on window resize; sets canvas size then re-renders

const RENDERER_VERSION = '2026-04-13-london-nobg';
console.log(`[renderer] loaded version=${RENDERER_VERSION}`);

// ── Debug: inspect a hex by grid key or by clicking ──────────────────────────
// Usage in console:
//   debugHex('r3_c5')          — dump hex object + what SVG hexToSvgInner would produce
//   debugHex()                 — dump all DSL hexes with feature, exits, bg
window.debugHex = function(key) {
  if (typeof state === 'undefined' || !state.hexes) { console.warn('[debugHex] no state'); return; }
  if (key) {
    const hex = state.hexes[key];
    if (!hex) { console.warn(`[debugHex] no hex at ${key}`); return; }
    console.group(`[debugHex] ${key}`);
    console.log('hex object:', JSON.parse(JSON.stringify(hex)));
    if (!hex.tile && hex.feature && hex.feature !== 'none' && hex.feature !== 'blank') {
      try {
        const svg = hexToSvgInner(hex, null);
        console.log('hexToSvgInner output:', svg || '(empty string)');
      } catch(e) {
        console.error('hexToSvgInner threw:', e);
      }
    } else if (hex.tile) {
      const td = TileRegistry.getTileDef(hex.tile);
      console.log('tile:', hex.tile, 'rotation:', hex.rotation, 'tileDef:', td);
    }
    console.groupEnd();
  } else {
    const all = Object.entries(state.hexes).filter(([,h]) => !h.killed);
    console.group(`[debugHex] all live hexes (${all.length})`);
    const dsl  = all.filter(([,h]) => !h.tile && h.feature && h.feature !== 'none' && h.feature !== 'blank');
    const tile = all.filter(([,h]) => h.tile);
    const blank = all.filter(([,h]) => !h.tile && (!h.feature || h.feature === 'none' || h.feature === 'blank'));
    console.log(`DSL hexes: ${dsl.length}  |  tile hexes: ${tile.length}  |  blank: ${blank.length}`);
    console.table(dsl.map(([k,h]) => ({ key: k, bg: h.bg, feature: h.feature, exits: (h.exits||[]).join(','), name: h.name||'' })));
    console.groupEnd();
  }
};

// ─── DSL HEX COLORS ───────────────────────────────────────────────────────────
// Background colors for DSL hexes keyed by hex.bg (set at import time).
const STATIC_BG_COLORS = {
  white:  '#D4B483',
  yellow: '#F0D070',
  green:  '#71BF44',
  brown:  '#CB7745',
  gray:   '#BCBDC0',
  red:    '#E05050',
  blue:   '#35A7FF',
};

const STATIC_PHASE_COLORS = {
  yellow: '#F0D070',
  green:  '#71BF44',
  brown:  '#CB7745',
  gray:   '#BCBDC0',
};

// ─── EDGE POSITION HELPERS ────────────────────────────────────────────────────
// edgePos: returns {x,y} (relative to hex center) for 18xx edge number e.
//   18xx edge 0 = bottom (flat-top), 1 = lower-left, 2 = upper-left, 3 = top,
//                4 = upper-right, 5 = lower-right.
//   For pointy-top games the whole hex is rotated 30°, so we rotate edge positions too.
//   dist defaults to 43.3 (apothem of a 50-unit hex).
function edgePos(edge, dist) {
  if (dist === undefined) dist = 43.3;
  const a = edge * Math.PI / 3;
  const x0 = -Math.sin(a) * dist;
  const y0 =  Math.cos(a) * dist;
  if (state && state.meta && state.meta.orientation === 'pointy') {
    // Rotate 30° clockwise in SVG space to align with pointy-top hex shape
    const R = Math.PI / 6;
    const cosR = Math.cos(R), sinR = Math.sin(R);
    return { x: x0 * cosR - y0 * sinR, y: x0 * sinR + y0 * cosR };
  }
  return { x: x0, y: y0 };
}

// rotateLocPos: apply the same 30° pointy-top rotation as edgePos to a
// tile-space (x,y) position (e.g. cityLocX/Y from a loc: value).
function rotateLocPos(x, y) {
  if (state && state.meta && state.meta.orientation === 'pointy') {
    const R = Math.PI / 6;
    const cosR = Math.cos(R), sinR = Math.sin(R);
    return { x: x * cosR - y * sinR, y: x * sinR + y * cosR };
  }
  return { x, y };
}

// computeTownPos: port of tobymao town_location.rb#town_position + town_rotation_angles.
// Returns {x, y, angle} for the town rectangle in 50-unit tile space.
// All formulas are verbatim from tobymao source, scaled by 0.5 (100→50 unit space).
function computeTownPos(exits) {
  if (!exits || exits.length === 0) return { x: 0, y: 0, angle: 0 };

  if (exits.length === 1) {
    // Single-exit town: position=50 (our 25), angle=edge*60. From town_position elsif edge_a branch.
    const a = exits[0] * Math.PI / 3;
    return { x: +(-Math.sin(a) * 25).toFixed(2), y: +(Math.cos(a) * 25).toFixed(2), angle: exits[0] * 60 };
  }

  // 2-exit: normalized_edges — ensure |ea-eb| <= 3
  let ea = exits[0], eb = exits[1];
  if (Math.abs(ea - eb) > 3) { if (ea < eb) ea += 6; else eb += 6; }
  const minEdge = Math.min(ea, eb);
  const diff    = Math.abs(ea - eb);
  const type    = diff === 1 ? 'sharp' : diff === 2 ? 'gentle' : 'straight';

  // center_town? is true for feature='town' DSL hexes with exactly 2 exits
  // (tile.exits.size == 2). From town_location.rb center_town?().
  if (type === 'straight') {
    // positions=[0] → (0,0); rotation = min_edge*60
    return { x: 0, y: 0, angle: minEdge * 60 };
  } else if (type === 'sharp') {
    // angle=(min_edge+0.5)*60, dist=50 (→25); rotation=(min_edge+2)*60
    const a = (minEdge + 0.5) * Math.PI / 3;
    return { x: +(-Math.sin(a) * 25).toFixed(2), y: +(Math.cos(a) * 25).toFixed(2), angle: (minEdge + 2) * 60 };
  } else {
    // gentle: angle=(min_edge+1)*60, dist=23.2 (→11.6); rotation=(min_edge*60)-30
    const a = (minEdge + 1) * Math.PI / 3;
    return { x: +(-Math.sin(a) * 11.6).toFixed(2), y: +(Math.cos(a) * 11.6).toFixed(2), angle: (minEdge * 60) - 30 };
  }
}

// checkColinear: port of tobymao track_node_path.rb#colinear?().
// True when the line from (x0,y0) to (x1,y1) passes through hex center (0,0).
function checkColinear(x0, y0, x1, y1) {
  const angleBE     = Math.atan2(y1 - y0, x1 - x0);
  const angleBCenter = Math.atan2(-y0, -x0);
  return Math.abs(angleBE - angleBCenter) < 0.05;
}

// calcArc: given start/end positions relative to hex center (canvas scale),
// returns {radius, sweep} for SVG arc  "A r r 0 0 sweep ex ey".
// Translated from 18xx.games track_node_path.rb.
function calcArc(bx, by, ex, ey) {
  const dist   = Math.hypot(bx - ex, by - ey);
  const angleBo = Math.atan2(by, -bx);
  const angleBe = Math.atan2(by - ey, ex - bx);
  let da = angleBo - angleBe;
  if (da < -Math.PI) da += 2 * Math.PI;
  else if (da > Math.PI) da -= 2 * Math.PI;
  const cosA = Math.cos(Math.PI / 2 - Math.abs(da));
  const radius = cosA < 0.001 ? 1e6 : dist / (2 * cosA);
  return { radius, sweep: da < 0 ? 0 : 1 };
}

// Draw impassable / water-crossing border markers for a hex.
// Called at the end of drawHex.
function drawBorders(hex, cx, cy, size) {
  if (!hex || !hex.borders || hex.borders.length === 0) return;
  const sc = size / 50;
  for (const border of hex.borders) {
    const mp = edgePos(border.edge);
    const len = Math.hypot(mp.x, mp.y);
    // Direction along the hex side (perpendicular to radial)
    const edgeDx = -mp.y / len;
    const edgeDy =  mp.x / len;
    const bx = cx + mp.x * sc;
    const by = cy + mp.y * sc;
    const halfLen = 11 * sc;

    ctx.save();
    ctx.lineCap = 'round';
    if (border.type === 'impassable') {
      ctx.strokeStyle = '#8b0000';
      ctx.lineWidth = Math.max(2, 4 * zoom);
      ctx.beginPath();
      ctx.moveTo(bx - edgeDx * halfLen, by - edgeDy * halfLen);
      ctx.lineTo(bx + edgeDx * halfLen, by + edgeDy * halfLen);
      ctx.stroke();
    } else if (border.type === 'water' || border.type === 'mountain') {
      ctx.strokeStyle = border.type === 'water' ? '#2266cc' : '#8B6914';
      ctx.lineWidth = Math.max(1.5, 3 * zoom);
      ctx.beginPath();
      ctx.moveTo(bx - edgeDx * halfLen, by - edgeDy * halfLen);
      ctx.lineTo(bx + edgeDx * halfLen, by + edgeDy * halfLen);
      ctx.stroke();
      if (border.cost) {
        ctx.fillStyle = ctx.strokeStyle;
        ctx.font = `bold ${Math.max(6, Math.round(7 * zoom))}px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const radDx = mp.x / len, radDy = mp.y / len;
        ctx.fillText(String(border.cost), bx - radDx * 8 * sc, by - radDy * 8 * sc);
      }
    }
    ctx.restore();
  }
}


function drawHex(row, col, hex = null) {
  const center = getHexCenter(row, col, HEX_SIZE, state.meta.orientation);
  const cx = (center.x + panX) * zoom + LABEL_PAD;
  const cy = (center.y + panY) * zoom + LABEL_PAD;
  const size = HEX_SIZE * zoom;

  const terrain = hex?.terrain || '';
  const tileDef = hex?.tile ? TileRegistry.getTileDef(hex.tile) : null;
  // Normalise 'gray' → 'grey' to match TILE_HEX_COLORS key (tile-packs.js uses American spelling)
  const _tileColor = tileDef ? (tileDef.color === 'gray' ? 'grey' : tileDef.color) : null;
  // Color priority: placed tile color > static hex bg color > terrain/default
  const color = _tileColor
    ? (TILE_HEX_COLORS[_tileColor] || TERRAIN_COLORS[''])
    : (hex?.bg ? (STATIC_BG_COLORS[hex.bg] || TERRAIN_COLORS['']) : (TERRAIN_COLORS[terrain] || TERRAIN_COLORS['']));

  const corners = hexCorners(cx, cy, size, state.meta.orientation);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(corners[0].x, corners[0].y);
  for (let i = 1; i < 6; i++) ctx.lineTo(corners[i].x, corners[i].y);
  ctx.closePath();
  ctx.fill();

  const _thisId = hexId(row, col);
  const _inMulti = selectedHexes && selectedHexes.has(_thisId);
  const _isDragTarget = (typeof dragOverHex !== 'undefined') && dragOverHex === _thisId;
  if (_isDragTarget) {
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth   = 3 * zoom;
    ctx.setLineDash([5 * zoom, 3 * zoom]);
  } else if (_inMulti) {
    ctx.strokeStyle = '#00ccff';
    ctx.lineWidth   = 2 * zoom;
    ctx.setLineDash([4 * zoom, 3 * zoom]);
  } else {
    ctx.strokeStyle = selectedHex === _thisId ? '#ffd700' : '#666';
    ctx.lineWidth   = selectedHex === _thisId ? 2 * zoom : 1;
    ctx.setLineDash([]);
  }
  ctx.stroke();
  ctx.setLineDash([]);

  // Terrain icon — show whenever terrain type is set and no tile placed
  if (hex?.terrain && hex.terrain !== '' && !hex?.tile) {
    const iconX = cx;
    const iconY = cy + size * 0.22;
    const is = Math.max(6, Math.round(8 * zoom));  // icon scale
    ctx.save();
    ctx.translate(iconX, iconY);

    if (terrain === 'mountain') {
      // Large triangle (snow-capped)
      ctx.beginPath();
      ctx.moveTo(0, -is * 1.4);
      ctx.lineTo(-is * 1.2, is * 0.6);
      ctx.lineTo( is * 1.2, is * 0.6);
      ctx.closePath();
      ctx.fillStyle = '#777';
      ctx.fill();
      // Snow cap
      ctx.beginPath();
      ctx.moveTo(0, -is * 1.4);
      ctx.lineTo(-is * 0.4, -is * 0.5);
      ctx.lineTo( is * 0.4, -is * 0.5);
      ctx.closePath();
      ctx.fillStyle = 'white';
      ctx.fill();
    } else if (terrain === 'hill') {
      // Smaller rounded hill bump
      ctx.beginPath();
      ctx.arc(0, is * 0.2, is * 0.9, Math.PI, 0);
      ctx.closePath();
      ctx.fillStyle = '#8B7355';
      ctx.fill();
    } else if (terrain === 'water') {
      // Water drop / wave
      ctx.beginPath();
      ctx.moveTo(0, -is);
      ctx.bezierCurveTo(is * 0.8, -is * 0.2, is * 0.8, is * 0.6, 0, is * 0.7);
      ctx.bezierCurveTo(-is * 0.8, is * 0.6, -is * 0.8, -is * 0.2, 0, -is);
      ctx.fillStyle = '#3366CC';
      ctx.fill();
    } else if (terrain === 'swamp' || terrain === 'marsh') {
      // Three vertical grass tufts
      ctx.strokeStyle = '#4A7A4A';
      ctx.lineWidth = Math.max(1.5, 1.5 * zoom);
      ctx.lineCap = 'round';
      for (const ox of [-is * 0.6, 0, is * 0.6]) {
        ctx.beginPath();
        ctx.moveTo(ox, is * 0.5);
        ctx.lineTo(ox, -is * 0.5);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(ox, -is * 0.2);
        ctx.lineTo(ox - is * 0.35, -is * 0.8);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(ox, -is * 0.2);
        ctx.lineTo(ox + is * 0.35, -is * 0.8);
        ctx.stroke();
      }
    } else {
      // Generic: small diamond
      ctx.beginPath();
      ctx.moveTo(0, -is); ctx.lineTo(is * 0.7, 0); ctx.lineTo(0, is); ctx.lineTo(-is * 0.7, 0);
      ctx.closePath();
      ctx.fillStyle = '#AA8844';
      ctx.fill();
    }

    ctx.restore();

    // Supplemental water indicator: small blue drop beside the main terrain icon.
    // Shown when a hex has compound terrain like water|mountain (water crossing cost
    // stacks with the other terrain cost — both are shown visually).
    if (hex?.terrainHasWater && terrain !== 'water') {
      const ws = Math.max(4, Math.round(5 * zoom));
      ctx.save();
      ctx.translate(iconX + is * 1.5, iconY - is * 0.5);
      ctx.beginPath();
      ctx.moveTo(0, -ws);
      ctx.bezierCurveTo(ws * 0.8, -ws * 0.2, ws * 0.8, ws * 0.6, 0, ws * 0.7);
      ctx.bezierCurveTo(-ws * 0.8, ws * 0.6, -ws * 0.8, -ws * 0.2, 0, -ws);
      ctx.fillStyle = '#3366CC';
      ctx.fill();
      ctx.restore();
    }

    // Cost number below icon — only when cost is explicitly set and > 0
    if (hex.terrainCost && hex.terrainCost > 0) {
      const fs = Math.max(6, Math.round(7 * zoom));
      ctx.font = `bold ${fs}px Arial`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#222';
      ctx.fillText(String(hex.terrainCost), cx, iconY + is * 1.2);
    }
  }



  // City name for placed tiles (city:true or oo:true) AND for feature-schema city/oo hexes
  const hasCityOrOo = (tileDef && (tileDef.city || tileDef.oo || tileDef.cities)) || !!hex?.city
    || hex?.feature === 'city' || hex?.feature === 'oo';
  if (hex?.cityName && hasCityOrOo) {
    const name = hex.cityName;
    ctx.font = `bold ${9 * zoom}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const tw = ctx.measureText(name).width;
    const bw = tw + 10 * zoom;
    const bh = 13 * zoom;
    const bx = cx - bw / 2;
    const by = cy - size * 0.5 - bh / 2;
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillRect(bx, by, bw, bh);
    ctx.fillStyle = '#111';
    ctx.fillText(name, cx, by + bh / 2);
  }

  // City circles, OO circles, tracks, and town dots are all rendered in SVG via renderTilesSVG().
  // drawHex handles background fill, border, terrain icons, names, and coordinate labels only.

  // Location name for unplaced city/town hexes (below the feature)
  {
    const locName = !hex ? '' :
                    (hex.city && !hex.tile) ? (hex.city.name || '') :
                    (hex.town && !hex.tile) ? (hex.town.name  || '') :
                    (!hex.tile) ? (hex.featureName || hex.name || '') : '';
    if (locName) {
      // Name position matches tobymao convention:
      //   city → top of hex (above the circle)
      //   OO / dualTown → bottom (below the circles)
      //   town / offboard / other → bottom
      const feat = hex ? hex.feature : '';
      const ny = (feat === 'city')
        ? cy - size * 0.42
        : cy + size * 0.58;
      ctx.font = `bold ${Math.max(7, Math.round(8 * zoom))}px Arial`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.strokeStyle = 'rgba(255,255,255,0.75)';
      ctx.lineWidth = 2.5;
      ctx.strokeText(locName, cx, ny);
      ctx.fillStyle = '#111';
      ctx.fillText(locName, cx, ny);
    }
  }

  // Resource icons (mine, port, factory) — drawn in lower-right cluster.
  // iconSize is kept intentionally small so icons don't obscure city/town markers.
  if (hex?.icons && hex.icons.length > 0 && !hex?.tile) {
    const iconSize = Math.max(6, Math.round(7 * zoom));
    const startX = cx + size * 0.32;
    const startY = cy + size * 0.28;
    const gap = iconSize * 1.6;
    hex.icons.forEach((icon, idx) => {
      const ix = startX + (idx - (hex.icons.length - 1) / 2) * gap;
      const iy = startY;
      ctx.save();
      ctx.translate(ix, iy);
      const s = iconSize;
      if (icon.image === 'mine') {
        // Crossed pick axes (two diagonal strokes forming an X, with a dot shaft end)
        ctx.strokeStyle = '#5a3e1b';
        ctx.lineWidth = Math.max(1.5, 1.5 * zoom);
        ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(-s * 0.7, -s * 0.7); ctx.lineTo(s * 0.7,  s * 0.7); ctx.stroke();
        ctx.beginPath(); ctx.moveTo( s * 0.7, -s * 0.7); ctx.lineTo(-s * 0.7, s * 0.7); ctx.stroke();
        // Pick head at top-left of each stroke
        ctx.beginPath(); ctx.arc(-s * 0.7, -s * 0.7, s * 0.22, 0, Math.PI * 2);
        ctx.fillStyle = '#8B6914'; ctx.fill();
        ctx.beginPath(); ctx.arc( s * 0.7, -s * 0.7, s * 0.22, 0, Math.PI * 2);
        ctx.fillStyle = '#8B6914'; ctx.fill();
      } else if (icon.image === 'port') {
        // Small anchor icon. No large badge circle — just the anchor outline so it
        // doesn't block city/town markers.  Dark blue on land, lighter on water.
        const isWaterHex = (hex.bg === 'blue') || (hex.terrain === 'water' || hex.terrain === 'lake' || hex.terrain === 'river');
        const aStroke = isWaterHex ? '#cce0ff' : '#1a3a7a';
        ctx.strokeStyle = aStroke;
        ctx.lineWidth = Math.max(1, 1.2 * zoom);
        ctx.lineCap = 'round';
        // Vertical shaft
        ctx.beginPath(); ctx.moveTo(0, -s * 0.75); ctx.lineTo(0, s * 0.75); ctx.stroke();
        // Top crossbar
        ctx.beginPath(); ctx.moveTo(-s * 0.42, -s * 0.42); ctx.lineTo(s * 0.42, -s * 0.42); ctx.stroke();
        // Top ring
        ctx.beginPath(); ctx.arc(0, -s * 0.75, s * 0.16, 0, Math.PI * 2);
        ctx.fillStyle = aStroke; ctx.fill();
        // Bottom arc
        ctx.beginPath(); ctx.arc(0, s * 0.05, s * 0.65, 0.2, Math.PI - 0.2);
        ctx.strokeStyle = aStroke; ctx.stroke();
        // Bottom endpoints (small dots)
        ctx.beginPath(); ctx.arc(-s * 0.60, s * 0.18, s * 0.13, 0, Math.PI * 2);
        ctx.fillStyle = aStroke; ctx.fill();
        ctx.beginPath(); ctx.arc( s * 0.60, s * 0.18, s * 0.13, 0, Math.PI * 2);
        ctx.fillStyle = aStroke; ctx.fill();
      } else if (icon.image === 'factory') {
        // Simple factory silhouette: base rectangle + two chimneys
        ctx.fillStyle = '#555';
        // Building body
        ctx.fillRect(-s * 0.7, -s * 0.2, s * 1.4, s * 1.0);
        // Left chimney
        ctx.fillRect(-s * 0.45, -s * 0.9, s * 0.28, s * 0.7);
        // Right chimney
        ctx.fillRect( s * 0.17, -s * 0.75, s * 0.28, s * 0.55);
        // Window
        ctx.fillStyle = '#aaddff';
        ctx.fillRect(-s * 0.2, s * 0.0, s * 0.4, s * 0.3);
      } else {
        // Unknown icon: small circle
        ctx.beginPath(); ctx.arc(0, 0, s * 0.5, 0, Math.PI * 2);
        ctx.fillStyle = '#888'; ctx.fill();
      }
      ctx.restore();
    });
  }

  // Killed hex — dark overlay so it reads as out-of-bounds
  if (hex?.killed) {
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(corners[0].x, corners[0].y);
    for (let i = 1; i < 6; i++) ctx.lineTo(corners[i].x, corners[i].y);
    ctx.closePath();
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fill();
    ctx.restore();
  }

  // Hex label (label= field) is rendered by the SVG layer (hexToSvgInner) for
  // all DSL hexes — the hasDslContent gate now includes hex.label. Removed the
  // canvas fallback here to prevent double-rendering on OO/NY/label-only hexes.

  // Border markers (impassable / water crossing)
  drawBorders(hex, cx, cy, size);

  // Coordinate ID — small label near top of each hex
  const coordLabel = hexId(row, col);
  ctx.font = `${Math.max(6, Math.round(7 * zoom))}px Arial`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(140,140,140,0.7)';
  ctx.fillText(coordLabel, cx, cy - size * 0.62);
}

// ─── EDGE POSITION HELPERS FOR SVG (flat-top unrotated, 50-unit space) ───────
// All geometry uses tobymao's 100-unit values halved to match tile-geometry.js:
//   HEX_INRADIUS  = 43.5  (track endpoint distance, tobymao Y_B=87 / 2)
//   SLOT_RADIUS   = 12.5  (city/token circle radius, tobymao SLOT_RADIUS=25 / 2)
//   CITY_EDGE_DIST = 25   (city center at edge, tobymao distance=50 / 2)
//   BAR_RW = 16, BAR_RH = 4  (town bar, tobymao 32×8 / 2)
//   TRACK_W = 5              (track stroke-width)
//
// ep(edge): track endpoint at hex edge midpoint (distance HEX_INRADIUS=43.5).
//   Edge 0=S(0,+43.5)  1=SW(-37.7,+21.75)  2=NW(-37.7,-21.75)
//   3=N(0,-43.5)  4=NE(+37.7,-21.75)  5=SE(+37.7,+21.75)
const DSL_SLOT_R  = 12.5;  // city/token circle radius
const DSL_CITY_D  = 25;    // city center distance from hex center (at an edge)
const DSL_TRACK_W = 5;     // track stroke-width
const DSL_BAR_RW  = 16;    // town bar half-width
const DSL_BAR_RH  = 4;     // town bar half-height

function ep(edge) {
  const a = edge * Math.PI / 3;
  return { x: -Math.sin(a) * 43.5, y: Math.cos(a) * 43.5 };
}

// cityEdgePos: city center when placed at an edge (distance DSL_CITY_D=25).
// x = -sin(edge*60°)*25, y = cos(edge*60°)*25  (tobymao city.rb distance=50, halved).
function cityEdgePos(edge) {
  const a = edge * Math.PI / 3;
  return { x: -Math.sin(a) * DSL_CITY_D, y: Math.cos(a) * DSL_CITY_D };
}

// ─── HEX TO SVG INNER GEOMETRY ─────────────────────────────────────────────
// Generates SVG string for the INNER geometry of a hex (tracks, cities, towns, features).
// Operates in flat-top unrotated coordinate space centered at (0,0).
// The caller wraps this in a <g transform="rotate(deg) scale(sc)"> group.
// Returns SVG string (path, circle, line elements).
function hexToSvgInner(hex, tileDef) {
  let svg = '';

  // For placed tiles: use tileDef geometry
  if (tileDef) {
    if (tileDef.svgPath) {
      // Track stroke-width from tobymao track.rb:16 — width:9 at scale 100 → DSL_TRACK_W (5) at scale 50
      svg += `<path d="${tileDef.svgPath}" stroke="#222" stroke-width="${DSL_TRACK_W}" stroke-linecap="round" fill="none"/>`;
    }

    if (tileDef.city) {
      const cix = tileDef.cityX || 0, ciy = tileDef.cityY || 0;
      // City radius from tobymao city.rb:14 — SLOT_RADIUS=25 at scale 100 → DSL_SLOT_R (12.5) at scale 50
      svg += `<circle cx="${cix}" cy="${ciy}" r="${DSL_SLOT_R}" fill="white" stroke="#000" stroke-width="2"/>`;

    } else if (tileDef.oo) {
      const SR = 12.5;
      const positions = tileDef.cityPositions || [{ x: -SR, y: 0 }, { x: SR, y: 0 }];
      if (positions.length === 2) {
        const xs = positions.map(p => p.x);
        const ys = positions.map(p => p.y);
        const bx = Math.min(...xs) - SR, by = Math.min(...ys) - SR;
        const bw = Math.max(...xs) - Math.min(...xs) + 2 * SR;
        const bh = Math.max(...ys) - Math.min(...ys) + 2 * SR;
        svg += `<rect x="${bx}" y="${by}" width="${bw}" height="${bh}" fill="white"/>`;
      } else if (positions.length >= 3) {
        svg += `<polygon points="22.9,0 11.45,-19.923 -11.45,-19.923 -22.9,0 -11.45,19.923 11.45,19.923" fill="white" stroke="none"/>`;
      }
      for (const pos of positions) {
        svg += `<circle cx="${pos.x}" cy="${pos.y}" r="${SR}" fill="white" stroke="#333" stroke-width="1.5"/>`;
      }

    } else if (tileDef.cities && tileDef.cities.length) {
      const SR = 12.5;
      for (const pos of tileDef.cities) {
        svg += `<circle cx="${pos.x}" cy="${pos.y}" r="${SR}" fill="white" stroke="#333" stroke-width="1.5"/>`;
      }

    } else if (tileDef.town) {
      svg += `<circle cx="0" cy="0" r="5" fill="black"/>`;

    } else if (tileDef.townAt) {
      const { x, y, rot, rw, rh } = tileDef.townAt;
      svg += `<g transform="translate(${x},${y}) rotate(${rot})"><rect x="${-rw / 2}" y="${-rh / 2}" width="${rw}" height="${rh}" fill="black"/></g>`;

    } else if (tileDef.dualTown) {
      const dtPos = (tileDef.townPositions && tileDef.townPositions.length)
        ? tileDef.townPositions
        : [{ x: -10, y: 0, rot: 0, rw: 16, rh: 4 }, { x: 10, y: 0, rot: 0, rw: 16, rh: 4 }];
      for (const pos of dtPos) {
        if (pos.dot) {
          svg += `<circle cx="${pos.x}" cy="${pos.y}" r="5" fill="black"/>`;
        } else {
          const rw = pos.rw || 16, rh = pos.rh || 4;
          svg += `<g transform="translate(${pos.x},${pos.y}) rotate(${pos.rot || 0})"><rect x="${-rw / 2}" y="${-rh / 2}" width="${rw}" height="${rh}" fill="black"/></g>`;
        }
      }
    }
    return svg;
  }

  // ─── DSL hexes (no tileDef) — geometry in 50-unit space ─────────────────────
  // Constants (from tile-geometry.js, matching tobymao at scale 0.5):
  //   DSL_SLOT_R=12.5, DSL_CITY_D=25, DSL_TRACK_W=5, DSL_BAR_RW=16, DSL_BAR_RH=4
  // ep()          → track endpoint at HEX_INRADIUS=43.5
  // cityEdgePos() → city center at DSL_CITY_D=25 (tobymao city.rb distance=50/2)

  if (hex.feature === 'town') {
    // Canonical tobymao rendering from town_location.rb + track_node_path.rb:
    //   - Town position is NOT always (0,0) — computed by computeTownPos()
    //   - Each path=a:e,b:_0 draws arc/line from ep(e) TO the town position
    //   - Bar at town position with canonical rotation angle
    const exits = hex.exits || [];
    if (exits.length === 0) {
      // Lone dit (no paths) — canonical tobymao town_dot.rb: black fill, white stroke
      svg += `<circle cx="0" cy="0" r="5" fill="black" stroke="white" stroke-width="2"/>`;
    } else {
      const tp = computeTownPos(exits);
      const tx = tp.x, ty = tp.y;

      for (const e of exits) {
        const p = ep(e);
        if (checkColinear(p.x, p.y, tx, ty)) {
          svg += `<line x1="${p.x.toFixed(1)}" y1="${p.y.toFixed(1)}" x2="${tx.toFixed(1)}" y2="${ty.toFixed(1)}" stroke="#000" stroke-width="${DSL_TRACK_W}" stroke-linecap="round"/>`;
        } else {
          const arc = calcArc(p.x, p.y, tx, ty);
          svg += `<path d="M ${p.x.toFixed(1)} ${p.y.toFixed(1)} A ${arc.radius} ${arc.radius} 0 0 ${arc.sweep} ${tx.toFixed(1)} ${ty.toFixed(1)}" stroke="#000" stroke-width="${DSL_TRACK_W}" stroke-linecap="round" fill="none"/>`;
        }
      }

      svg += `<g transform="translate(${tx.toFixed(1)},${ty.toFixed(1)}) rotate(${tp.angle})"><rect x="${-DSL_BAR_RW/2}" y="${-DSL_BAR_RH/2}" width="${DSL_BAR_RW}" height="${DSL_BAR_RH}" fill="black" rx="1"/></g>`;
    }

  } else if (hex.feature === 'city') {
    if (hex.slots >= 3 && hex.cityExitsByNode) {
      // Multi-node city (London-style).
      // Node positions from city.rb CITY_SLOT_POSITION (at scale 50):
      //   2 nodes: ±DSL_SLOT_R*2 = ±25 apart  (SLOT_POSITION[2]=[-25,0]/[25,0] at scale 100)
      //   3 nodes: [0,-29/2] rotated at 0°,120°,240°  (CITY_SLOT_POSITION[3]=[0,-29] at scale 100)
      //   4+ nodes: cityEdgePos(ni) — each at its own edge
      const nodeIndices = Object.keys(hex.cityExitsByNode).map(Number).sort((a, b) => a - b);
      const nodeCount = nodeIndices.length;
      const nodePosMap = {};
      if (nodeCount <= 2) {
        nodePosMap[nodeIndices[0]] = { x: -DSL_CITY_D, y: 0 };
        nodePosMap[nodeIndices[1] ?? 1] = { x:  DSL_CITY_D, y: 0 };
      } else if (nodeCount === 3) {
        // CITY_SLOT_POSITION[3]=[0,-29]; slots rotate 120° each. At scale 50: [0,-14.5], [12.55,7.25], [-12.55,7.25]
        nodePosMap[nodeIndices[0]] = { x: 0,      y: -14.5 };
        nodePosMap[nodeIndices[1]] = { x:  12.55, y:   7.25 };
        nodePosMap[nodeIndices[2]] = { x: -12.55, y:   7.25 };
      } else {
        for (const ni of nodeIndices) nodePosMap[ni] = cityEdgePos(ni % 6);
      }

      // Tracks from exit edges to node centers
      for (const ni of nodeIndices) {
        const nodePos = nodePosMap[ni] || { x: 0, y: 0 };
        for (const e of (hex.cityExitsByNode[ni] || [])) {
          const p = ep(e);
          svg += `<line x1="${p.x.toFixed(1)}" y1="${p.y.toFixed(1)}" x2="${nodePos.x.toFixed(1)}" y2="${nodePos.y.toFixed(1)}" stroke="#000" stroke-width="${DSL_TRACK_W}" stroke-linecap="round"/>`;
        }
      }
      // White background: only for tight 2–3 node clusters. For 4+ nodes the
      // cities are spread across edge positions (e.g. London 6-node) — a bbox
      // would cover the entire hex interior. Tobymao renders each node circle
      // independently in that case with no shared background.
      if (nodeCount === 3) {
        svg += `<polygon points="22.9,0 11.45,-19.923 -11.45,-19.923 -22.9,0 -11.45,19.923 11.45,19.923" fill="white" stroke="none"/>`;
      } else if (nodeCount === 2) {
        const xs = Object.values(nodePosMap).map(p => p.x);
        const ys = Object.values(nodePosMap).map(p => p.y);
        const bx = Math.min(...xs)-DSL_SLOT_R, by = Math.min(...ys)-DSL_SLOT_R;
        const bw = Math.max(...xs)-Math.min(...xs)+2*DSL_SLOT_R;
        const bh = Math.max(...ys)-Math.min(...ys)+2*DSL_SLOT_R;
        svg += `<rect x="${bx.toFixed(1)}" y="${by.toFixed(1)}" width="${bw.toFixed(1)}" height="${bh.toFixed(1)}" fill="white" stroke="none" rx="${DSL_SLOT_R}"/>`;
      }
      // nodeCount >= 4: no background (spread-out nodes like London)
      for (const ni of nodeIndices) {
        const pos = nodePosMap[ni] || { x: 0, y: 0 };
        svg += `<circle cx="${pos.x.toFixed(1)}" cy="${pos.y.toFixed(1)}" r="${DSL_SLOT_R}" fill="white" stroke="#000" stroke-width="2"/>`;
      }

    } else if (hex.slots >= 2) {
      // Multi-slot single-city cluster (e.g. Glasgow 2-slot, Birmingham 3-slot).
      // City center is at cityLocX/Y (from loc: in DSL, distance DSL_CITY_D=25).
      const clX = hex.cityLocX || 0;
      const clY = hex.cityLocY || 0;

      for (const e of (hex.exits || [])) {
        const p = ep(e);
        svg += `<line x1="${p.x.toFixed(1)}" y1="${p.y.toFixed(1)}" x2="${clX.toFixed(1)}" y2="${clY.toFixed(1)}" stroke="#000" stroke-width="${DSL_TRACK_W}" stroke-linecap="round"/>`;
      }

      const slots = hex.slots || 2;
      // Slot positions: CITY_SLOT_POSITION[slots] at scale 50, rotated per slot.
      // 2-slot: [-12.5,0]/[12.5,0];  3-slot: [0,-14.5],[12.55,7.25],[-12.55,7.25]
      const offsets = slots >= 3
        ? [{ x: 0, y: -14.5 }, { x: 12.55, y: 7.25 }, { x: -12.55, y: 7.25 }]
        : [{ x: -DSL_SLOT_R, y: 0 }, { x: DSL_SLOT_R, y: 0 }];
      if (slots >= 3) {
        svg += `<g transform="translate(${clX.toFixed(1)},${clY.toFixed(1)})"><polygon points="22.9,0 11.45,-19.923 -11.45,-19.923 -22.9,0 -11.45,19.923 11.45,19.923" fill="white" stroke="none"/></g>`;
      } else {
        svg += `<rect x="${(clX-DSL_SLOT_R).toFixed(1)}" y="${(clY-DSL_SLOT_R).toFixed(1)}" width="${(2*DSL_SLOT_R).toFixed(1)}" height="${(2*DSL_SLOT_R).toFixed(1)}" fill="white" stroke="none"/>`;
      }
      for (const off of offsets) {
        svg += `<circle cx="${(clX+off.x).toFixed(1)}" cy="${(clY+off.y).toFixed(1)}" r="${DSL_SLOT_R}" fill="white" stroke="#000" stroke-width="2"/>`;
      }

    } else {
      // Single-slot city. cityLocX/Y come from loc: in the DSL — this IS the
      // visual position for preprinted map hexes (e.g. Altoona loc:2.5 places
      // the city above center). Operates in flat-top coordinate space; the SVG
      // rotate(orientDeg) wrapper handles orientation. rotateLocPos must NOT be
      // applied here — that was a double-rotation bug.
      const locX = hex.cityLocX || 0;
      const locY = hex.cityLocY || 0;

      // Bypass tracks (edge-to-edge paths independent of the city, e.g. Altoona path=a:1,b:4)
      for (const [ea, eb] of (hex.pathPairs || [])) {
        const pa = ep(ea), pb = ep(eb);
        const diff = Math.abs(ea - eb);
        if (diff === 3 || diff === 0) {
          svg += `<line x1="${pa.x.toFixed(1)}" y1="${pa.y.toFixed(1)}" x2="${pb.x.toFixed(1)}" y2="${pb.y.toFixed(1)}" stroke="#000" stroke-width="${DSL_TRACK_W}" stroke-linecap="round"/>`;
        } else {
          const arc = calcArc(pa.x, pa.y, pb.x, pb.y);
          svg += `<path d="M ${pa.x.toFixed(1)} ${pa.y.toFixed(1)} A ${arc.radius} ${arc.radius} 0 0 ${arc.sweep} ${pb.x.toFixed(1)} ${pb.y.toFixed(1)}" stroke="#000" stroke-width="${DSL_TRACK_W}" stroke-linecap="round" fill="none"/>`;
        }
      }

      // Tracks from exits to city. Port of tobymao track_node_path.rb line 363:
      // use arc when city is off-center and begin/end are not colinear with origin.
      for (const e of (hex.exits || [])) {
        const p = ep(e);
        const isCenter = (locX === 0 && locY === 0);
        if (!isCenter && !checkColinear(p.x, p.y, locX, locY)) {
          const arc = calcArc(p.x, p.y, locX, locY);
          svg += `<path d="M ${p.x.toFixed(1)} ${p.y.toFixed(1)} A ${arc.radius.toFixed(2)} ${arc.radius.toFixed(2)} 0 0 ${arc.sweep} ${locX.toFixed(1)} ${locY.toFixed(1)}" stroke="#000" stroke-width="${DSL_TRACK_W}" stroke-linecap="round" fill="none"/>`;
        } else {
          svg += `<line x1="${p.x.toFixed(1)}" y1="${p.y.toFixed(1)}" x2="${locX.toFixed(1)}" y2="${locY.toFixed(1)}" stroke="#000" stroke-width="${DSL_TRACK_W}" stroke-linecap="round"/>`;
        }
      }

      // City circle (drawn after tracks so it sits on top)
      svg += `<circle cx="${locX.toFixed(1)}" cy="${locY.toFixed(1)}" r="${DSL_SLOT_R}" fill="white" stroke="#000" stroke-width="2"/>`;
    }

  } else if (hex.feature === 'oo') {
    // OO: two separate single-slot cities.
    // Positions from computeCityTownEdges (tile-geometry.js):
    //   With paths → each city at cityEdgePos(its primary exit edge)
    //   No paths   → spread evenly: city0=edge0(bottom), city1=edge3(top)
    // Reference: tile-geometry.js computeCityTownEdges, city.rb preferred_render_locations
    const exitPairs = hex.exitPairs || [];
    const pos0 = (exitPairs[0] && exitPairs[0].length > 0)
      ? cityEdgePos(exitPairs[0][0])
      : cityEdgePos(0);   // default: edge 0 = bottom
    const pos1 = (exitPairs[1] && exitPairs[1].length > 0)
      ? cityEdgePos(exitPairs[1][0])
      : cityEdgePos(3);   // default: edge 3 = top

    // Tracks from each city's exits to its circle center
    for (const e of (exitPairs[0] || [])) {
      const p = ep(e);
      svg += `<line x1="${p.x.toFixed(1)}" y1="${p.y.toFixed(1)}" x2="${pos0.x.toFixed(1)}" y2="${pos0.y.toFixed(1)}" stroke="#000" stroke-width="${DSL_TRACK_W}" stroke-linecap="round"/>`;
    }
    for (const e of (exitPairs[1] || [])) {
      const p = ep(e);
      svg += `<line x1="${p.x.toFixed(1)}" y1="${p.y.toFixed(1)}" x2="${pos1.x.toFixed(1)}" y2="${pos1.y.toFixed(1)}" stroke="#000" stroke-width="${DSL_TRACK_W}" stroke-linecap="round"/>`;
    }

    // OO = two separate single-slot cities — each is just a circle, no connecting rect.
    svg += `<circle cx="${pos0.x.toFixed(1)}" cy="${pos0.y.toFixed(1)}" r="${DSL_SLOT_R}" fill="white" stroke="#000" stroke-width="2"/>`;
    svg += `<circle cx="${pos1.x.toFixed(1)}" cy="${pos1.y.toFixed(1)}" r="${DSL_SLOT_R}" fill="white" stroke="#000" stroke-width="2"/>`;

  } else if (hex.feature === 'offboard') {
    // Offboard exits: tapered triangle arrows pointing inward from each exit edge
    for (const e of (hex.exits || [])) {
      const p = ep(e);
      const len = Math.hypot(p.x, p.y);
      const dx = p.x / len, dy = p.y / len;
      const px_perp = -dy, py_perp = dx;
      const depth = hex.taperStyle === 2 ? 10 : 18;
      const halfW = hex.taperStyle === 2 ? 4 : 6;
      const pts = [
        `${(p.x + px_perp * halfW).toFixed(1)},${(p.y + py_perp * halfW).toFixed(1)}`,
        `${(p.x - px_perp * halfW).toFixed(1)},${(p.y - py_perp * halfW).toFixed(1)}`,
        `${(p.x - dx * depth).toFixed(1)},${(p.y - dy * depth).toFixed(1)}`,
      ].join(' ');
      svg += `<polygon points="${pts}" fill="#222"/>`;
    }

  } else if (hex.feature === 'dualTown' || (hex.pathPairs && hex.pathPairs.length > 0)) {
    // DualTown with no exits: double-dit
    if (hex.feature === 'dualTown' && (!hex.exits || hex.exits.length === 0) && (!hex.exitPairs || hex.exitPairs.every(p => !p.length))) {
      svg += `<circle cx="${-DSL_SLOT_R * 1.2}" cy="0" r="5" fill="black" stroke="white" stroke-width="2"/>`;
      svg += `<circle cx="${ DSL_SLOT_R * 1.2}" cy="0" r="5" fill="black" stroke="white" stroke-width="2"/>`;
    }
    const pathPairs = hex.pathPairs || [];

    const drawSegment = (e1, e2) => {
      const p1 = ep(e1), p2 = ep(e2);
      const diff = Math.abs(e1 - e2);
      if (diff === 3 || diff === 0) {
        svg += `<line x1="${p1.x.toFixed(1)}" y1="${p1.y.toFixed(1)}" x2="${p2.x.toFixed(1)}" y2="${p2.y.toFixed(1)}" stroke="#000" stroke-width="${DSL_TRACK_W}" stroke-linecap="round"/>`;
      } else {
        const arc = calcArc(p1.x, p1.y, p2.x, p2.y);
        svg += `<path d="M ${p1.x.toFixed(1)} ${p1.y.toFixed(1)} A ${arc.radius} ${arc.radius} 0 0 ${arc.sweep} ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}" stroke="#000" stroke-width="${DSL_TRACK_W}" stroke-linecap="round" fill="none"/>`;
      }
    };

    if (hex.exitPairs && hex.exitPairs.length >= 2) {
      for (const pair of hex.exitPairs) {
        if (pair.length >= 2) drawSegment(pair[0], pair[1]);
        else if (pair.length === 1) {
          const p = ep(pair[0]);
          svg += `<line x1="${p.x.toFixed(1)}" y1="${p.y.toFixed(1)}" x2="0" y2="0" stroke="#000" stroke-width="${DSL_TRACK_W}" stroke-linecap="round"/>`;
        }
      }
    } else {
      const exits = hex.exits || [];
      for (let i = 0; i + 1 < exits.length; i += 2) drawSegment(exits[i], exits[i + 1]);
      if (exits.length % 2 === 1) {
        const p = ep(exits[exits.length - 1]);
        svg += `<line x1="${p.x.toFixed(1)}" y1="${p.y.toFixed(1)}" x2="0" y2="0" stroke="#000" stroke-width="${DSL_TRACK_W}" stroke-linecap="round"/>`;
      }
    }

    for (const [ea, eb] of pathPairs) drawSegment(ea, eb);
  }

  return svg;
}


// ─── SVG TILE OVERLAY ─────────────────────────────────────────────────────────
// renderTilesSVG() writes placed-tile content (tracks, city/town symbols,
// revenue bubbles) into the <svg id="tileSvg"> element overlaid on the canvas.
// SVG transforms handle rotation and orientation correctly by construction —
// no manual trigonometry needed per symbol type.

function escSvg(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function renderTilesSVG() {
  const svgEl = document.getElementById('tileSvg');
  if (!svgEl) return;

  const w = canvas.clientWidth || 800;
  const h = canvas.clientHeight || 600;
  svgEl.setAttribute('viewBox', `0 0 ${w} ${h}`);

  const isPointy = state.meta.orientation === 'pointy';
  const orientDeg = isPointy ? 30 : 0;
  const size = HEX_SIZE * zoom; // canvas-space circumradius
  const sc = size / 50;         // scale: tile-SVG-units → canvas-pixels

  // Shared clip path: hex boundary in canvas-space centered at (0,0).
  // orientDeg rotates the polygon to match the visual hex for the current orientation.
  const clipPts = Array.from({ length: 6 }, (_, n) => {
    const a = (orientDeg + n * 60) * Math.PI / 180;
    return `${(size * Math.cos(a)).toFixed(1)},${(size * Math.sin(a)).toFixed(1)}`;
  }).join(' ');

  let defs = `<clipPath id="tile-clip"><polygon points="${clipPts}"/></clipPath>`;
  let content = '';

  for (let r = 0; r < state.meta.rows; r++) {
    for (let c = 0; c < state.meta.cols; c++) {
      const id = hexId(r, c);
      const hex = state.hexes[id] || null;
      if (!hex) continue;

      // Determine if this hex has anything to render in SVG
      const tileDef = hex.tile ? TileRegistry.getTileDef(hex.tile) : null;
      const hasDslContent = !hex.tile && (
        (hex.feature && hex.feature !== 'none' && hex.feature !== 'blank') ||
        (hex.exits && hex.exits.length > 0) ||
        (hex.pathPairs && hex.pathPairs.length > 0) ||
        (hex.exitPairs && hex.exitPairs.length > 0) ||
        (hex.label && hex.label !== '')
      );
      if (!tileDef && !hasDslContent) continue;

      // Use HEX_SIZE (not pre-scaled) — same formula as drawHex so SVG aligns with canvas
      const center = getHexCenter(r, c, HEX_SIZE, state.meta.orientation);
      const cx = (center.x + panX) * zoom + LABEL_PAD;
      const cy = (center.y + panY) * zoom + LABEL_PAD;
      const tileDeg = (hex.rotation || 0) * 60;
      const totalDeg = orientDeg + tileDeg;

      // ── Rotated content (tracks + city/town symbols) ──
      const inner = hexToSvgInner(hex, tileDef);

      // Tile group: translate to hex center; clip to hex; rotate+scale tile content
      content += `<g transform="translate(${cx.toFixed(1)},${cy.toFixed(1)})">`;
      content += `<g clip-path="url(#tile-clip)"><g transform="rotate(${totalDeg}) scale(${sc.toFixed(4)})">${inner}</g></g>`;

      // ── Upright content (stays level regardless of tile rotation) ──

      if (tileDef) {
      // Tile label (Y, T, OO …) — left of center, same position as canvas version
      if (tileDef.tileLabel) {
        const fs = Math.max(8, Math.round(9 * zoom));
        content += `<text x="${(-size * 0.62).toFixed(1)}" y="0" font-family="Arial" font-size="${fs}" font-weight="bold" fill="#111" dominant-baseline="middle">${escSvg(tileDef.tileLabel)}</text>`;
      }

      // Revenue bubbles — position orbits with tile rotation, text stays upright
      const revList = tileDef.revenues || (tileDef.revenue ? [tileDef.revenue] : []);
      const revRotRad = tileDeg * Math.PI / 180 + (isPointy ? Math.PI / 6 : 0);
      const cosR = Math.cos(revRotRad), sinR = Math.sin(revRotRad);

      for (const rev of revList) {
        if (!rev || rev.v === 0) continue;
        const rx = (rev.x * cosR - rev.y * sinR) * sc;
        const ry = (rev.x * sinR + rev.y * cosR) * sc;

        if (rev.phases) {
          const segs = rev.phases.split('|').map(s => {
            const u = s.indexOf('_');
            return u < 0 ? null : { ph: s.slice(0, u) === 'gray' ? 'grey' : s.slice(0, u), val: +s.slice(u + 1) };
          }).filter(Boolean);
          if (segs.length) {
            const bw = 13 * sc, bh = 9 * sc, gap = 1 * sc;
            const tw = segs.length * bw + (segs.length - 1) * gap;
            let bx = rx - tw / 2;
            const by = ry - bh / 2;
            const fs = Math.max(5, Math.round(6 * zoom));
            for (const { ph, val } of segs) {
              const col = TILE_HEX_COLORS[ph] || '#ccc';
              content += `<rect x="${bx.toFixed(1)}" y="${by.toFixed(1)}" width="${bw.toFixed(1)}" height="${bh.toFixed(1)}" fill="${col}" stroke="rgba(0,0,0,0.35)" stroke-width="0.5"/>`;
              content += `<text x="${(bx + bw / 2).toFixed(1)}" y="${ry.toFixed(1)}" font-family="Arial" font-size="${fs}" font-weight="bold" fill="#111" text-anchor="middle" dominant-baseline="middle">${val}</text>`;
              bx += bw + gap;
            }
          }
        } else {
          const rr = Math.max(7, Math.round(7.5 * zoom));
          const fs = Math.max(6, Math.round(8 * zoom));
          content += `<circle cx="${rx.toFixed(1)}" cy="${ry.toFixed(1)}" r="${rr}" fill="white" stroke="#777" stroke-width="1"/>`;
          content += `<text x="${rx.toFixed(1)}" y="${ry.toFixed(1)}" font-family="Arial" font-size="${fs}" font-weight="bold" fill="#000" text-anchor="middle" dominant-baseline="middle">${rev.v}</text>`;
        }
      }
      } // end if (tileDef)

      // DSL hex label (OO, B, NY, etc.) — upper-left, same position as tile labels
      if (!tileDef && hex.label && hex.label !== '') {
        const fs = Math.max(8, Math.round(9 * zoom));
        content += `<text x="${(-size * 0.62).toFixed(1)}" y="${(-size * 0.45).toFixed(1)}" font-family="Arial" font-size="${fs}" font-weight="bold" fill="#111" dominant-baseline="middle">${escSvg(hex.label)}</text>`;
      }

      // DSL hex revenue (for non-tile hexes: offboards, gray cities, etc.)
      if (!tileDef && hex.phaseRevenue) {
        const phaseKeys = ['yellow', 'green', 'brown', 'gray'];
        const activePhases = phaseKeys.filter(p => hex.activePhases && hex.activePhases[p]);
        if (activePhases.length > 0) {
          const revVals = activePhases.map(p => hex.phaseRevenue[p] || 0);
          const allSame = revVals.every(v => v === revVals[0]);
          const ry = size * 0.44;
          if (allSame && revVals[0] > 0) {
            const rr = Math.max(7, Math.round(7.5 * zoom));
            const fs = Math.max(6, Math.round(8 * zoom));
            content += `<circle cx="0" cy="${ry.toFixed(1)}" r="${rr}" fill="white" stroke="#777" stroke-width="1"/>`;
            content += `<text x="0" y="${ry.toFixed(1)}" font-family="Arial" font-size="${fs}" font-weight="bold" fill="#000" text-anchor="middle" dominant-baseline="middle">${revVals[0]}</text>`;
          } else if (!allSame) {
            const bw = 13 * sc, bh = 9 * sc, gap = sc;
            const tw = activePhases.length * bw + (activePhases.length - 1) * gap;
            let bx = -tw / 2;
            const by_pos = ry - bh / 2;
            const fs = Math.max(5, Math.round(6 * zoom));
            for (const ph of activePhases) {
              const col = TILE_HEX_COLORS[ph] || '#ccc';
              content += `<rect x="${bx.toFixed(1)}" y="${by_pos.toFixed(1)}" width="${bw.toFixed(1)}" height="${bh.toFixed(1)}" fill="${col}" stroke="rgba(0,0,0,0.35)" stroke-width="0.5"/>`;
              content += `<text x="${(bx + bw/2).toFixed(1)}" y="${ry.toFixed(1)}" font-family="Arial" font-size="${fs}" font-weight="bold" fill="#111" text-anchor="middle" dominant-baseline="middle">${hex.phaseRevenue[ph] || 0}</text>`;
              bx += bw + gap;
            }
          }
        }
      }

      content += '</g>'; // close translate group
    }
  }

  svgEl.innerHTML = `<defs>${defs}</defs>${content}`;
}

// ─── RENDER ───────────────────────────────────────────────────────────────────
// Clears the canvas and redraws all hex cells, then overlays SVG tile content.

function render() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  // Iterate the full bounding box — killed hexes exist in state.hexes for every
  // position that has no live hex, so drawHex must be called for all (r,c).
  // Do NOT gate on maxRowPerCol here; that caused corner killed hexes to be skipped.
  for (let r = 0; r < state.meta.rows; r++) {
    for (let c = 0; c < state.meta.cols; c++) {
      drawHex(r, c, state.hexes[hexId(r, c)] || null);
    }
  }
  // Lasso selection rectangle overlay
  if (typeof _lasso !== 'undefined' && _lasso) {
    const lx = Math.min(_lasso.startX, _lasso.endX);
    const ly = Math.min(_lasso.startY, _lasso.endY);
    const lw = Math.abs(_lasso.endX - _lasso.startX);
    const lh = Math.abs(_lasso.endY - _lasso.startY);
    ctx.save();
    ctx.fillStyle = 'rgba(0,204,255,0.07)';
    ctx.fillRect(lx, ly, lw, lh);
    ctx.strokeStyle = '#00ccff';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 3]);
    ctx.strokeRect(lx, ly, lw, lh);
    ctx.setLineDash([]);
    ctx.restore();
  }
  // Render placed tile content (tracks, symbols, revenue) as crisp SVG
  renderTilesSVG();
}

// ─── RESIZE CANVAS ────────────────────────────────────────────────────────────
// Matches canvas and SVG overlay to the container size; applies HiDPI scaling.

function resizeCanvas() {
  const dpr = window.devicePixelRatio || 1;
  const w = container.clientWidth || 800;
  const h = container.clientHeight || 600;
  canvas.width  = w * dpr;
  canvas.height = h * dpr;
  canvas.style.width  = w + 'px';
  canvas.style.height = h + 'px';
  const svgEl = document.getElementById('tileSvg');
  if (svgEl) {
    svgEl.style.width  = w + 'px';
    svgEl.style.height = h + 'px';
  }
  ctx.scale(dpr, dpr);
  render();
}

// ── Wizard preview adapter ───────────────────────────────────────────────────
// Called by static-hex-builder.js to render a wizard hex using the canonical
// canvas renderer rather than duplicating logic in SVG.
function renderStaticHexPreview(previewCanvas, hexData, previewSize) {
  previewSize = previewSize || 170;
  previewCanvas.width  = previewSize;
  previewCanvas.height = previewSize;
  const ctx2 = previewCanvas.getContext('2d');
  ctx2.clearRect(0, 0, previewSize, previewSize);

  const hs = previewSize * 0.45;
  const orientation = 'flat';
  const center = getHexCenter(0, 0, hs, orientation);

  const savedCtx         = window.ctx;
  const savedZoom        = window.zoom;
  const savedPanX        = window.panX;
  const savedPanY        = window.panY;
  const savedHexSize     = window.HEX_SIZE;
  const savedLabelPad    = window.LABEL_PAD;
  const savedSelectedHex = window.selectedHex;
  const savedOrientation = state.meta.orientation;

  window.ctx              = ctx2;
  window.zoom             = 1;
  window.LABEL_PAD        = 0;
  window.HEX_SIZE         = hs;
  window.panX             = previewSize / 2 - center.x;
  window.panY             = previewSize / 2 - center.y;
  window.selectedHex      = null;
  state.meta.orientation  = orientation;

  try {
    // Static hex wizard removed — preview no longer available
    void hexData;
  } finally {
    window.ctx             = savedCtx;
    window.zoom            = savedZoom;
    window.panX            = savedPanX;
    window.panY            = savedPanY;
    window.HEX_SIZE        = savedHexSize;
    window.LABEL_PAD       = savedLabelPad;
    window.selectedHex     = savedSelectedHex;
    state.meta.orientation = savedOrientation;
  }
}
