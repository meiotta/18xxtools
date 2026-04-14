// ─── RENDERER ─────────────────────────────────────────────────────────────────
// SVG map drawing functions.
// Load order: FOURTH — after hex-geometry.js.
//
// render()          — rebuilds all hex SVG content and updates viewport transform
// updateViewport()  — updates viewport transform only (pan/zoom, no content rebuild)
// resizeCanvas()    — legacy name; calls render() for compat with setup.js/io.js
// buildHexSvg(r,c,hex) — returns SVG string for one hex group
// hexToSvgInner(hex,tileDef) — inner track/city/town geometry (shared with swatches)

const RENDERER_VERSION = '2026-04-14-pure-svg';
console.log(`[renderer] loaded version=${RENDERER_VERSION}`);

// ── Debug: inspect a hex by grid key or by clicking ──────────────────────────
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
function edgePos(edge, dist) {
  if (dist === undefined) dist = 43.3;
  const a = edge * Math.PI / 3;
  const x0 = -Math.sin(a) * dist;
  const y0 =  Math.cos(a) * dist;
  if (state && state.meta && state.meta.orientation === 'pointy') {
    const R = Math.PI / 6;
    const cosR = Math.cos(R), sinR = Math.sin(R);
    return { x: x0 * cosR - y0 * sinR, y: x0 * sinR + y0 * cosR };
  }
  return { x: x0, y: y0 };
}

function rotateLocPos(x, y) {
  if (state && state.meta && state.meta.orientation === 'pointy') {
    const R = Math.PI / 6;
    const cosR = Math.cos(R), sinR = Math.sin(R);
    return { x: x * cosR - y * sinR, y: x * sinR + y * cosR };
  }
  return { x, y };
}

function computeTownPos(exits) {
  if (!exits || exits.length === 0) return { x: 0, y: 0, angle: 0 };

  if (exits.length === 1) {
    const a = exits[0] * Math.PI / 3;
    return { x: +(-Math.sin(a) * 25).toFixed(2), y: +(Math.cos(a) * 25).toFixed(2), angle: exits[0] * 60 };
  }

  let ea = exits[0], eb = exits[1];
  if (Math.abs(ea - eb) > 3) { if (ea < eb) ea += 6; else eb += 6; }
  const minEdge = Math.min(ea, eb);
  const diff    = Math.abs(ea - eb);
  const type    = diff === 1 ? 'sharp' : diff === 2 ? 'gentle' : 'straight';

  if (type === 'straight') {
    return { x: 0, y: 0, angle: minEdge * 60 };
  } else if (type === 'sharp') {
    const a = (minEdge + 0.5) * Math.PI / 3;
    return { x: +(-Math.sin(a) * 25).toFixed(2), y: +(Math.cos(a) * 25).toFixed(2), angle: (minEdge + 2) * 60 };
  } else {
    const a = (minEdge + 1) * Math.PI / 3;
    return { x: +(-Math.sin(a) * 11.6).toFixed(2), y: +(Math.cos(a) * 11.6).toFixed(2), angle: (minEdge * 60) - 30 };
  }
}

function checkColinear(x0, y0, x1, y1) {
  const angleBE     = Math.atan2(y1 - y0, x1 - x0);
  const angleBCenter = Math.atan2(-y0, -x0);
  return Math.abs(angleBE - angleBCenter) < 0.05;
}

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

// ─── SVG BUILD HELPERS ─────────────────────────────────────────────────────────
// buildBordersSvg: border markers (impassable/water) in hex-local world-unit coords.
// All positions relative to hex center (0,0).
function buildBordersSvg(hex) {
  if (!hex || !hex.borders || hex.borders.length === 0) return '';
  const sc = HEX_SIZE / 50;  // 50-unit edgePos space → world-unit scale
  let svg = '';
  for (const border of hex.borders) {
    const mp = edgePos(border.edge);         // orientation-aware midpoint in 43.3-unit space
    const bx = mp.x * sc, by = mp.y * sc;   // world space
    const len = Math.hypot(bx, by);
    const edgeDx = -by / len, edgeDy = bx / len;
    const halfLen = 11 * sc;
    if (border.type === 'impassable') {
      svg += `<line x1="${(bx-edgeDx*halfLen).toFixed(2)}" y1="${(by-edgeDy*halfLen).toFixed(2)}" x2="${(bx+edgeDx*halfLen).toFixed(2)}" y2="${(by+edgeDy*halfLen).toFixed(2)}" stroke="#8b0000" stroke-width="4" stroke-linecap="round"/>`;
    } else if (border.type === 'water' || border.type === 'mountain') {
      const col = border.type === 'water' ? '#2266cc' : '#8B6914';
      svg += `<line x1="${(bx-edgeDx*halfLen).toFixed(2)}" y1="${(by-edgeDy*halfLen).toFixed(2)}" x2="${(bx+edgeDx*halfLen).toFixed(2)}" y2="${(by+edgeDy*halfLen).toFixed(2)}" stroke="${col}" stroke-width="3" stroke-linecap="round"/>`;
      if (border.cost) {
        const radDx = bx / len, radDy = by / len;
        svg += `<text x="${(bx-radDx*8*sc).toFixed(2)}" y="${(by-radDy*8*sc).toFixed(2)}" font-family="Arial" font-size="7" font-weight="bold" fill="${col}" text-anchor="middle" dominant-baseline="middle">${escSvg(String(border.cost))}</text>`;
      }
    }
  }
  return svg;
}

// buildTerrainSvg: terrain upgrade badge (cost + icon) for a hex with no placed tile.
//
// Replicates tobymao's Part::Upgrade rendering (assets/app/view/game/part/upgrade.rb).
//
// Placement (simplified tobymao region system):
//   The upgrade part iterates preferred_render_locations and picks the one with the
//   lowest combined region-use cost.  For flat-top layout the preference order is:
//     P_CENTER (0,0)  →  P_TOP_RIGHT_CORNER (30,−60)  →  P_EDGE2 (−50,−45)  →  …
//   (all in tobymao's 100-unit hex space; scaled ×0.4 for our HEX_SIZE=40 space).
//   A city/town occupies the CENTER regions, so when one is present the upgrade
//   badge falls through to P_TOP_RIGHT_CORNER.
//
// Icon shapes match tobymao's upgrade.rb:
//   mountain — inline brown (#cb7745) triangle  TRIANGLE_PATH scaled ×0.4
//   water    — inline WATER_PATH wavy lines,  stroke #147ebe
//   hill/swamp/desert/lake/river/forest — inlined from /icons/*.svg
//
// Cost text: tobymao text.number CSS → font-size 21px×0.4=8.4, font-weight 300,
//   text-anchor middle, fill black, at the badge origin.  Icon below at delta_y=2.
function buildTerrainSvg(hex, hasCityFeature) {
  if (!hex || !hex.terrain) return '';

  // ── Tobymao preferred_render_locations (flat, scaled to 40-unit space) ──────
  // P_TOP_RIGHT_CORNER = (30,−60) × 0.4 = (12,−24)
  const bx = hasCityFeature ? HEX_SIZE * 0.30 : 0;
  const by = hasCityFeature ? HEX_SIZE * -0.60 : 0;

  // ── Tobymao SIZE = 20 (100-unit space) × 0.4 = 8 ──────────────────────────
  const S  = HEX_SIZE * 0.20;   // = 8
  const dx = -S / 2;             // = −4   (delta_x = −SIZE/2)
  const dy = HEX_SIZE * 0.05;   // = 2    (delta_y = 5 × 0.4)

  let svg = `<g transform="translate(${bx.toFixed(1)},${by.toFixed(1)})">`;

  // Cost number — tobymao text.number: font-size 21×0.4, font-weight 300, text-anchor middle
  if (hex.terrainCost && hex.terrainCost > 0) {
    svg += `<text text-anchor="middle" font-family="Arial" font-size="${(HEX_SIZE * 0.21).toFixed(1)}" font-weight="300" fill="black">${escSvg(String(hex.terrainCost))}</text>`;
  }

  // Terrain icon below cost, at (dx, dy) relative to badge origin
  svg += _terrainIconSvg(hex.terrain, S, dx, dy);

  svg += '</g>';
  return svg;
}

// _terrainIconSvg: SVG element for one terrain type positioned at (dx, dy).
// S  = icon size (tobymao SIZE × hex-scale); dx/dy = delta within badge group.
// Shapes and colours taken directly from tobymao's upgrade.rb and /icons/*.svg.
function _terrainIconSvg(terrain, S, dx, dy) {
  // px / py: top-left of the icon bounding box (tobymao uses translate(dx dy))
  const px = dx.toFixed(2), py = dy.toFixed(2);

  switch (terrain) {
    case 'mountain':
      // tobymao TRIANGLE_PATH = '0,20 10,0 20,20'  fill #cb7745 (brown tile colour)
      // scaled by 0.4: '0,S S/2,0 S,S'
      return `<polygon transform="translate(${px},${py})" points="0,${S.toFixed(2)} ${(S/2).toFixed(2)},0 ${S.toFixed(2)},${S.toFixed(2)}" fill="#cb7745"/>`;

    case 'water': {
      // tobymao inline WATER_PATH in g{ translate(10+dx, 12+dy) scale(0.7) }
      // All in 100-unit space → ×0.4 for our scale; path coords ×0.4×0.7=×0.28
      const tx = (10 * 0.4 + dx).toFixed(2);
      const ty = (12 * 0.4 + dy).toFixed(2);
      return `<g transform="translate(${tx},${ty}) scale(0.28)">` +
             `<path d="M -15 -7 Q -7.5 -15 0 -7 S 7.5 1 15 -7 M -15 -2 Q -7.5 -10 0 -2 S 7.5 6 15 -2"` +
             ` fill="none" stroke="#147ebe" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>` +
             `</g>`;
    }

    case 'river':
      // Same wavy-line style as water but darker blue (#0a2ebe from river.svg)
      return `<g transform="translate(${(10*0.4+dx).toFixed(2)},${(12*0.4+dy).toFixed(2)}) scale(0.28)">` +
             `<path d="M -15 -7 Q -7.5 -15 0 -7 S 7.5 1 15 -7 M -15 -2 Q -7.5 -10 0 -2 S 7.5 6 15 -2"` +
             ` fill="none" stroke="#0a2ebe" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/>` +
             `</g>`;

    case 'lake':
      // lake.svg: two rows of wavy blue lines, viewBox −12.5 −12.5 25 25
      // scale to S×S centred at (dx+S/2, dy+S/2)
      return `<g transform="translate(${(dx+S/2).toFixed(2)},${(dy+S/2).toFixed(2)}) scale(${(S/25).toFixed(3)})">` +
             `<path d="M-10.75 3c0 3 6 3 6 0 0 3 6 3 6 0 0 3 6 3 6 0m-15-8c0 3 6 3 6 0 0 3 6 3 6 0 0 3 6 3 6 0"` +
             ` fill="none" stroke="#67a7c4" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>` +
             `</g>`;

    case 'hill':
      // hill.svg: green (#4e983b) dome, viewBox 0 0 174 87  (half-ellipse)
      // Scaled to S wide × S/2 tall, top-left at (dx, dy)
      return `<ellipse cx="${(dx+S/2).toFixed(2)}" cy="${(dy+S/2).toFixed(2)}" rx="${(S/2).toFixed(2)}" ry="${(S/4).toFixed(2)}"` +
             ` fill="#4e983b" clip-path="none"/>` +
             `<rect x="${px}" y="${(dy+S/2).toFixed(2)}" width="${S.toFixed(2)}" height="${(S/2).toFixed(2)}" fill="${TERRAIN_COLORS[''] || '#c8a87a'}"/>`;

    case 'swamp':
    case 'marsh':
      // swamp.svg: three drooping U-shapes, viewBox −12.5 −12.5 25 25, stroke #59b578
      return `<g transform="translate(${(dx+S/2).toFixed(2)},${(dy+S/2).toFixed(2)}) scale(${(S/25).toFixed(3)})">` +
             `<path fill="none" stroke="#000" stroke-linecap="round" stroke-linejoin="round" stroke-width="4"` +
             ` d="M-7.5 3q0-3.75-3.75-3.75M-7.5 3q0-3.75 3.75-3.75M0-.75Q0-4.5-3.75-4.5M0-.75Q0-4.5 3.75-4.5M7.5 3q0-3.75 3.75-3.75M7.5 3q0-3.75-3.75-3.75"/>` +
             `<path fill="none" stroke="#59b578" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"` +
             ` d="M-7.5 3q0-3.75-3.75-3.75M-7.5 3q0-3.75 3.75-3.75M0-.75Q0-4.5-3.75-4.5M0-.75Q0-4.5 3.75-4.5M7.5 3q0-3.75 3.75-3.75M7.5 3q0-3.75-3.75-3.75"/>` +
             `</g>`;

    case 'desert':
      // cactus.svg: vertical line + two arms, viewBox −12.5 −12.5 25 25, stroke #59b578
      return `<g transform="translate(${(dx+S/2).toFixed(2)},${(dy+S/2).toFixed(2)}) scale(${(S/25).toFixed(3)})">` +
             `<path fill="none" stroke="#000" stroke-linecap="round" stroke-linejoin="round" stroke-width="4"` +
             ` d="M0 8V-8M0 5q-5 0-5-5m5 0q5 0 5-5"/>` +
             `<path fill="none" stroke="#59b578" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"` +
             ` d="M0 8V-8M0 5q-5 0-5-5m5 0q5 0 5-5"/>` +
             `</g>`;

    case 'forest':
      // tree.svg is complex; use a simplified green tree triangle (matches tobymao colour)
      return `<polygon transform="translate(${px},${py})" points="${(S/2).toFixed(2)},0 0,${S.toFixed(2)} ${S.toFixed(2)},${S.toFixed(2)}" fill="#2d7a2d"/>`;

    case 'pass':
      // Two brown mountains side-by-side (mountain pass)
      return `<polygon transform="translate(${(dx - S*0.3).toFixed(2)},${dy.toFixed(2)})" points="0,${S.toFixed(2)} ${(S*0.5).toFixed(2)},0 ${S.toFixed(2)},${S.toFixed(2)}" fill="#cb7745"/>` +
             `<polygon transform="translate(${(dx + S*0.3).toFixed(2)},${(dy + S*0.15).toFixed(2)})" points="0,${(S*0.85).toFixed(2)} ${(S*0.5).toFixed(2)},0 ${S.toFixed(2)},${(S*0.85).toFixed(2)}" fill="#9b6030"/>`;

    default:
      // Fallback: small brown mountain (unknown terrain still has a cost)
      return `<polygon transform="translate(${px},${py})" points="0,${S.toFixed(2)} ${(S/2).toFixed(2)},0 ${S.toFixed(2)},${S.toFixed(2)}" fill="#cb7745"/>`;
  }
}

// buildIconsSvg: resource icons (mine/port/factory) in hex-local world-unit coords.
function buildIconsSvg(hex) {
  if (!hex.icons || hex.icons.length === 0) return '';
  const s   = 7;
  const ox0 = HEX_SIZE * 0.32;
  const oy  = HEX_SIZE * 0.28;
  const gap = s * 1.6;
  const n   = hex.icons.length;
  let svg = '';
  hex.icons.forEach((icon, idx) => {
    const ix = ox0 + (idx - (n - 1) / 2) * gap;
    svg += `<g transform="translate(${ix.toFixed(1)},${oy.toFixed(1)})">`;
    if (icon.image === 'mine') {
      const d = (s*0.7).toFixed(2), r = (s*0.22).toFixed(2);
      svg += `<line x1="${-d}" y1="${-d}" x2="${d}" y2="${d}" stroke="#5a3e1b" stroke-width="1.5" stroke-linecap="round"/>`;
      svg += `<line x1="${d}" y1="${-d}" x2="${-d}" y2="${d}" stroke="#5a3e1b" stroke-width="1.5" stroke-linecap="round"/>`;
      svg += `<circle cx="${-d}" cy="${-d}" r="${r}" fill="#8B6914"/>`;
      svg += `<circle cx="${d}" cy="${-d}" r="${r}" fill="#8B6914"/>`;
    } else if (icon.image === 'port') {
      const shaft = (s*0.75).toFixed(2), bar = (s*0.42).toFixed(2), ring = (s*0.16).toFixed(2);
      const cr = s*0.65, cy_a = s*0.05;
      const ax1 = (Math.cos(0.2)*cr).toFixed(2),  ay  = (cy_a+Math.sin(0.2)*cr).toFixed(2);
      const ax2 = (Math.cos(Math.PI-0.2)*cr).toFixed(2);
      svg += `<line x1="0" y1="${-shaft}" x2="0" y2="${shaft}" stroke="#1a3a7a" stroke-width="1.2" stroke-linecap="round"/>`;
      svg += `<line x1="${-bar}" y1="${-bar}" x2="${bar}" y2="${-bar}" stroke="#1a3a7a" stroke-width="1.2" stroke-linecap="round"/>`;
      svg += `<circle cx="0" cy="${-shaft}" r="${ring}" fill="#1a3a7a"/>`;
      svg += `<path d="M ${ax1},${ay} A ${cr.toFixed(2)},${cr.toFixed(2)} 0 0 0 ${ax2},${ay}" stroke="#1a3a7a" stroke-width="1.2" fill="none" stroke-linecap="round"/>`;
      svg += `<circle cx="${ax1}" cy="${ay}" r="${(s*0.13).toFixed(2)}" fill="#1a3a7a"/>`;
      svg += `<circle cx="${ax2}" cy="${ay}" r="${(s*0.13).toFixed(2)}" fill="#1a3a7a"/>`;
    } else if (icon.image === 'factory') {
      svg += `<rect x="${(-s*0.7).toFixed(2)}" y="${(-s*0.2).toFixed(2)}" width="${(s*1.4).toFixed(2)}" height="${s.toFixed(2)}" fill="#555"/>`;
      svg += `<rect x="${(-s*0.45).toFixed(2)}" y="${(-s*0.9).toFixed(2)}" width="${(s*0.28).toFixed(2)}" height="${(s*0.7).toFixed(2)}" fill="#555"/>`;
      svg += `<rect x="${(s*0.17).toFixed(2)}" y="${(-s*0.75).toFixed(2)}" width="${(s*0.28).toFixed(2)}" height="${(s*0.55).toFixed(2)}" fill="#555"/>`;
      svg += `<rect x="${(-s*0.2).toFixed(2)}" y="0" width="${(s*0.4).toFixed(2)}" height="${(s*0.3).toFixed(2)}" fill="#aaddff"/>`;
    } else {
      svg += `<circle r="${(s*0.5).toFixed(2)}" fill="#888"/>`;
    }
    svg += '</g>';
  });
  return svg;
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

function escSvg(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ─── HEX GROUP BUILDER ────────────────────────────────────────────────────────
// buildHexSvg: returns complete SVG <g> element for one hex.
// Coordinate space: hex-local world units centered at (0,0), group translated to hex center.
// Uses shared clip path #tile-clip (updated by render() in mapDefs).
function buildHexSvg(r, c, hex) {
  const id      = hexId(r, c);
  const center  = getHexCenter(r, c, HEX_SIZE, state.meta.orientation);
  const tileDef = hex?.tile ? TileRegistry.getTileDef(hex.tile) : null;
  const isPointy = state.meta.orientation === 'pointy';
  const orientOff = isPointy ? 30 : 0;
  const sc  = HEX_SIZE / 50;
  const sz  = HEX_SIZE;

  // Background color
  const _tc = tileDef ? (tileDef.color === 'gray' ? 'grey' : tileDef.color) : null;
  const color = _tc
    ? (TILE_HEX_COLORS[_tc] || TERRAIN_COLORS[''])
    : (hex?.bg ? (STATIC_BG_COLORS[hex.bg] || TERRAIN_COLORS[''])
               : (TERRAIN_COLORS[hex?.terrain || ''] || TERRAIN_COLORS['']));

  // Hex polygon corners (local coords, centered at 0,0)
  const hexPts = Array.from({length: 6}, (_, i) => {
    const a = (orientOff + i * 60) * Math.PI / 180;
    return `${(sz * Math.cos(a)).toFixed(2)},${(sz * Math.sin(a)).toFixed(2)}`;
  }).join(' ');

  // Selection / drag stroke
  const _isSel   = selectedHex === id;
  const _isMulti = selectedHexes && selectedHexes.has(id);
  const _isDrag  = (typeof dragOverHex !== 'undefined') && dragOverHex === id;
  let strokeColor = '#666', strokeWidth = 1, strokeDash = '';
  if (_isDrag)        { strokeColor = '#ffffff'; strokeWidth = 3; strokeDash = '5,3'; }
  else if (_isMulti)  { strokeColor = '#00ccff'; strokeWidth = 2; strokeDash = '4,3'; }
  else if (_isSel)    { strokeColor = '#ffd700'; strokeWidth = 2; }

  let g = `<g id="hex_${r}_${c}" data-id="${escSvg(id)}" transform="translate(${center.x.toFixed(2)},${center.y.toFixed(2)})">`;
  g += `<polygon points="${hexPts}" fill="${color}" stroke="${strokeColor}" stroke-width="${strokeWidth}"${strokeDash ? ` stroke-dasharray="${strokeDash}"` : ''}/>`;

  if (!hex?.killed) {
    // Determine whether this hex has a city/town/oo symbol that occupies hex centre.
    // Used to collision-avoid terrain icon placement (see buildTerrainSvg).
    const hasCityFeature = (tileDef && (tileDef.city || tileDef.oo || tileDef.cities))
      || !!hex?.city || !!hex?.town
      || hex?.feature === 'city' || hex?.feature === 'oo'
      || hex?.feature === 'town' || hex?.feature === 'dualTown';

    // Terrain icon (no tile) — passes hasCityFeature for collision-safe layout
    if (hex?.terrain && hex.terrain !== '' && !hex?.tile) {
      g += buildTerrainSvg(hex, hasCityFeature);
    }

    // City name (placed tile or DSL city/oo)
    if (hex?.cityName && hasCityFeature) {
      g += `<text x="0" y="${(-sz*0.5).toFixed(1)}" font-family="Arial" font-size="9" font-weight="bold" fill="#111" stroke="rgba(255,255,255,0.85)" stroke-width="2.5" paint-order="stroke" text-anchor="middle" dominant-baseline="middle">${escSvg(hex.cityName)}</text>`;
    }

    // Location name (unplaced hexes)
    const locName = !hex ? '' :
      (hex.city  && !hex.tile) ? (hex.city.name  || '') :
      (hex.town  && !hex.tile) ? (hex.town.name  || '') :
      (!hex.tile) ? (hex.featureName || hex.name || '') : '';
    if (locName) {
      const ny = (hex?.feature === 'city') ? -sz * 0.42 : sz * 0.58;
      g += `<text x="0" y="${ny.toFixed(1)}" font-family="Arial" font-size="8" font-weight="bold" fill="#111" stroke="rgba(255,255,255,0.75)" stroke-width="2.5" paint-order="stroke" text-anchor="middle" dominant-baseline="middle">${escSvg(locName)}</text>`;
    }

    // Resource icons
    if (hex?.icons && hex.icons.length > 0 && !hex?.tile) {
      g += buildIconsSvg(hex);
    }

    // Tile / DSL geometry
    const hasDslContent = !hex?.tile && hex && (
      (hex.feature && hex.feature !== 'none' && hex.feature !== 'blank') ||
      (hex.exits  && hex.exits.length  > 0) ||
      (hex.pathPairs  && hex.pathPairs.length  > 0) ||
      (hex.exitPairs  && hex.exitPairs.length  > 0) ||
      (hex.label  && hex.label !== '')
    );

    if (tileDef || hasDslContent) {
      const tileDeg  = (hex?.rotation || 0) * 60;
      const totalDeg = orientOff + tileDeg;
      const inner    = hexToSvgInner(hex, tileDef);

      // Clipped rotated tile content — uses shared #tile-clip from mapDefs
      g += `<g clip-path="url(#tile-clip)"><g transform="rotate(${totalDeg}) scale(${sc.toFixed(4)})">${inner}</g></g>`;

      // Tile label (upright)
      if (tileDef?.tileLabel) {
        g += `<text x="${(-sz*0.62).toFixed(1)}" y="0" font-family="Arial" font-size="9" font-weight="bold" fill="#111" dominant-baseline="middle">${escSvg(tileDef.tileLabel)}</text>`;
      }

      // Revenue bubbles (orbit with tile rotation, text stays upright)
      const revList = tileDef?.revenues || (tileDef?.revenue ? [tileDef.revenue] : []);
      if (revList.length > 0) {
        const revRotRad = tileDeg * Math.PI / 180 + (isPointy ? Math.PI / 6 : 0);
        const cosR = Math.cos(revRotRad), sinR = Math.sin(revRotRad);
        for (const rev of revList) {
          if (!rev || rev.v === 0) continue;
          const rx = (rev.x * cosR - rev.y * sinR) * sc;
          const ry = (rev.x * sinR + rev.y * cosR) * sc;
          if (rev.phases) {
            const segs = rev.phases.split('|').map(s => {
              const u = s.indexOf('_');
              return u < 0 ? null : { ph: s.slice(0,u) === 'gray' ? 'grey' : s.slice(0,u), val: +s.slice(u+1) };
            }).filter(Boolean);
            if (segs.length) {
              const bw = 13*sc, bh = 9*sc, gapW = sc;
              const tw = segs.length * bw + (segs.length - 1) * gapW;
              let bx = rx - tw / 2;
              const byp = ry - bh / 2;
              for (const { ph, val } of segs) {
                const pc = TILE_HEX_COLORS[ph] || '#ccc';
                g += `<rect x="${bx.toFixed(1)}" y="${byp.toFixed(1)}" width="${bw.toFixed(1)}" height="${bh.toFixed(1)}" fill="${pc}" stroke="rgba(0,0,0,0.35)" stroke-width="0.5"/>`;
                g += `<text x="${(bx+bw/2).toFixed(1)}" y="${ry.toFixed(1)}" font-family="Arial" font-size="6" font-weight="bold" fill="#111" text-anchor="middle" dominant-baseline="middle">${val}</text>`;
                bx += bw + gapW;
              }
            }
          } else {
            g += `<circle cx="${rx.toFixed(1)}" cy="${ry.toFixed(1)}" r="7.5" fill="white" stroke="#777" stroke-width="1"/>`;
            g += `<text x="${rx.toFixed(1)}" y="${ry.toFixed(1)}" font-family="Arial" font-size="8" font-weight="bold" fill="#000" text-anchor="middle" dominant-baseline="middle">${rev.v}</text>`;
          }
        }
      }

      // DSL hex label (OO, NY, etc.)
      if (!tileDef && hex?.label && hex.label !== '') {
        g += `<text x="${(-sz*0.62).toFixed(1)}" y="${(-sz*0.45).toFixed(1)}" font-family="Arial" font-size="9" font-weight="bold" fill="#111" dominant-baseline="middle">${escSvg(hex.label)}</text>`;
      }

      // DSL phase revenue (offboards, gray cities, etc.)
      if (!tileDef && hex?.phaseRevenue) {
        const phaseKeys = ['yellow', 'green', 'brown', 'gray'];
        const activeP = phaseKeys.filter(p => hex.activePhases && hex.activePhases[p]);
        if (activeP.length > 0) {
          const revVals = activeP.map(p => hex.phaseRevenue[p] || 0);
          const allSame = revVals.every(v => v === revVals[0]);
          const ryn = sz * 0.44;
          if (allSame && revVals[0] > 0) {
            g += `<circle cx="0" cy="${ryn.toFixed(1)}" r="7.5" fill="white" stroke="#777" stroke-width="1"/>`;
            g += `<text x="0" y="${ryn.toFixed(1)}" font-family="Arial" font-size="8" font-weight="bold" fill="#000" text-anchor="middle" dominant-baseline="middle">${revVals[0]}</text>`;
          } else if (!allSame) {
            const bw2 = 13*sc, bh2 = 9*sc, gapW2 = sc;
            const tw2 = activeP.length * bw2 + (activeP.length - 1) * gapW2;
            let bx2 = -tw2 / 2;
            const byp2 = ryn - bh2 / 2;
            for (const ph of activeP) {
              const pc2 = TILE_HEX_COLORS[ph] || '#ccc';
              g += `<rect x="${bx2.toFixed(1)}" y="${byp2.toFixed(1)}" width="${bw2.toFixed(1)}" height="${bh2.toFixed(1)}" fill="${pc2}" stroke="rgba(0,0,0,0.35)" stroke-width="0.5"/>`;
              g += `<text x="${(bx2+bw2/2).toFixed(1)}" y="${ryn.toFixed(1)}" font-family="Arial" font-size="6" font-weight="bold" fill="#111" text-anchor="middle" dominant-baseline="middle">${hex.phaseRevenue[ph] || 0}</text>`;
              bx2 += bw2 + gapW2;
            }
          }
        }
      }
    }
  }

  // Killed hex overlay
  if (hex?.killed) {
    g += `<polygon points="${hexPts}" fill="rgba(0,0,0,0.55)"/>`;
  }

  // Border markers
  g += buildBordersSvg(hex);

  // Coordinate label
  g += `<text x="0" y="${(-sz*0.62).toFixed(1)}" font-family="Arial" font-size="7" fill="rgba(140,140,140,0.7)" text-anchor="middle" dominant-baseline="middle">${escSvg(id)}</text>`;

  g += '</g>';
  return g;
}

// ─── SVG VIEWPORT UPDATE ─────────────────────────────────────────────────────
// Update the mapViewport (and lassoLayer) transform for current pan/zoom.
// Call instead of render() for pan/zoom-only changes — no content rebuild.
function updateViewport() {
  const t = `scale(${zoom}) translate(${panX},${panY})`;
  const vp = document.getElementById('mapViewport');
  const ll = document.getElementById('lassoLayer');
  if (vp) vp.setAttribute('transform', t);
  if (ll) ll.setAttribute('transform', t);
}

// ─── RENDER ──────────────────────────────────────────────────────────────────
// Rebuilds all hex SVG content in mapViewport, then applies viewport transform.
function render() {
  const vp = document.getElementById('mapViewport');
  if (!vp) return;

  const isPointy = state.meta.orientation === 'pointy';
  const orientOff = isPointy ? 30 : 0;
  const sz = HEX_SIZE;

  // Rebuild shared clip path in defs (hexagonal polygon in hex-local coords)
  const defsEl = document.getElementById('mapDefs');
  if (defsEl) {
    const clipPts = Array.from({length: 6}, (_, n) => {
      const a = (orientOff + n * 60) * Math.PI / 180;
      return `${(sz * Math.cos(a)).toFixed(1)},${(sz * Math.sin(a)).toFixed(1)}`;
    }).join(' ');
    defsEl.innerHTML = `<clipPath id="tile-clip"><polygon points="${clipPts}"/></clipPath>`;
  }

  let content = '';
  for (let r = 0; r < state.meta.rows; r++) {
    for (let c = 0; c < state.meta.cols; c++) {
      content += buildHexSvg(r, c, state.hexes[hexId(r, c)] || null);
    }
  }
  vp.innerHTML = content;

  // Update lasso visibility if active
  if (typeof _updateLassoSvg === 'function') _updateLassoSvg();

  updateViewport();
}

// ─── RESIZE ──────────────────────────────────────────────────────────────────
// resizeCanvas: legacy name kept for compatibility with setup.js and io.js.
// SVG fills container automatically; just re-render on resize.
function resizeCanvas() {
  render();
}
