// ─── RENDERER ─────────────────────────────────────────────────────────────────
// Canvas drawing functions.
// Load order: FOURTH — after hex-geometry.js.
//
// drawHex(row, col, hex)  — renders a single hex cell with terrain, tile, city, etc.
// render()                — clears canvas and redraws all hexes + coordinate labels
// resizeCanvas()          — called on window resize; sets canvas size then re-renders

// ─── STATIC HEX RENDERER ──────────────────────────────────────────────────────
// Renders a static hex (offboard area, border, pre-printed track, etc.)
// Called from drawHex when hex.static === true.

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
// Called at the end of both drawStaticHex and drawHex.
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

function drawStaticHex(row, col, hex) {
  const center = getHexCenter(row, col, HEX_SIZE, state.meta.orientation);
  const cx = (center.x + panX) * zoom + LABEL_PAD;
  const cy = (center.y + panY) * zoom + LABEL_PAD;
  const size = HEX_SIZE * zoom;
  const sc = size / 50;

  const corners = hexCorners(cx, cy, size, state.meta.orientation);

  // 1. Fill background
  ctx.fillStyle = STATIC_BG_COLORS[hex.bg] || '#D4B483';
  ctx.beginPath();
  ctx.moveTo(corners[0].x, corners[0].y);
  for (let i = 1; i < 6; i++) ctx.lineTo(corners[i].x, corners[i].y);
  ctx.closePath();
  ctx.fill();

  // 2. Hex border (gold when selected; cyan dashed when in multi-selection; darker for plain red fill hexes)
  const isPlainRed = hex.bg === 'red' && (!hex.feature || hex.feature === 'none');
  const thisId = hexId(row, col);
  const inMulti = selectedHexes && selectedHexes.has(thisId);
  const isDragTarget = (typeof dragOverHex !== 'undefined') && dragOverHex === thisId;
  if (isDragTarget) {
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3 * zoom;
    ctx.setLineDash([5 * zoom, 3 * zoom]);
  } else if (inMulti) {
    ctx.strokeStyle = '#00ccff';
    ctx.lineWidth = 2 * zoom;
    ctx.setLineDash([4 * zoom, 3 * zoom]);
  } else {
    ctx.strokeStyle = selectedHex === thisId ? '#ffd700' : (isPlainRed ? '#333' : '#666');
    ctx.lineWidth   = selectedHex === thisId ? 2 * zoom : 1;
    ctx.setLineDash([]);
  }
  ctx.stroke();
  ctx.setLineDash([]);

  // Hidden offboard hex (hide:1) — solid color only, no features
  if (hex.hidden) return;

  // Plain red fill hex — solid color area only, no features or labels
  if (isPlainRed) return;

  // Pre-compute multi-city node positions for OO, C, and M features.
  //   OO — two cities at opposite vertices (180° default)
  //   C  — two cities at 120° diagonal vertices
  //   M  — three cities in equilateral triangle (Moscow / ATL layout)
  // Positions snap toward the average exit direction for each node group;
  // defaults are used when no exits are assigned.
  const MULTI_DEFAULTS = {
    oo: [{ x: -14, y:   0 }, { x:  14, y:   0 }],
    c:  [{ x:  14, y:   0 }, { x:  -7, y:  12 }],
    m:  [{ x:   0, y: -16 }, { x:  14, y:   9 }, { x: -14, y:  9 }],
  };
  let ooNodes = null;  // alias used throughout sections 3–6
  if (MULTI_DEFAULTS[hex.feature]) {
    const ep = hex.exitPairs;
    ooNodes = MULTI_DEFAULTS[hex.feature].map((def, ni) => {
      const grp = ep && ep[ni] ? ep[ni] : [];
      if (!grp.length) {
        // Rotate the default position to match hex.rotation so circles move with the tile
        const rot = hex.rotation || 0;
        if (rot === 0) return def;
        const θ = rot * Math.PI / 3;
        const cosθ = Math.cos(θ), sinθ = Math.sin(θ);
        return { x: def.x * cosθ - def.y * sinθ, y: def.x * sinθ + def.y * cosθ };
      }
      let sx = 0, sy = 0;
      for (const e of grp) {
        const re = (e + (hex.rotation || 0)) % 6;
        const pos = edgePos(re);
        sx += pos.x; sy += pos.y;
      }
      return { x: sx / grp.length * 0.55, y: sy / grp.length * 0.55 };
    });
  }

  // 3. Track stubs — offboard exits draw short tapered arrows; others draw lines to center
  if (hex.exits && hex.exits.length > 0) {
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(corners[0].x, corners[0].y);
    for (let i = 1; i < 6; i++) ctx.lineTo(corners[i].x, corners[i].y);
    ctx.closePath();
    ctx.clip();

    if (hex.feature === 'offboard') {
      // Tapered triangle arrow: size depends on taperStyle (1=medium, 2=short)
      ctx.fillStyle = '#222';
      for (const exit of hex.exits) {
        const re = (exit + (hex.rotation || 0)) % 6;
        const mp = edgePos(re);
        const len = Math.hypot(mp.x, mp.y);
        const dx = mp.x / len; // unit vector pointing outward (center → edge)
        const dy = mp.y / len;
        const perp_x = -dy;   // perpendicular to edge direction
        const perp_y =  dx;
        const taperStyle = hex.taperStyle || 1;
        const depth  = (taperStyle === 2 ? 10 : 18) * sc;
        const halfW  = (taperStyle === 2 ?  4 :  6) * sc;
        const ex = cx + mp.x * sc;
        const ey = cy + mp.y * sc;
        ctx.beginPath();
        ctx.moveTo(ex + perp_x * halfW, ey + perp_y * halfW); // base left
        ctx.lineTo(ex - perp_x * halfW, ey - perp_y * halfW); // base right
        ctx.lineTo(ex - dx * depth,     ey - dy * depth);      // tip (inward)
        ctx.closePath();
        ctx.fill();
      }
    } else {
      ctx.strokeStyle = '#222';
      ctx.lineWidth   = 6 * sc;
      ctx.lineCap     = 'round';
      if (MULTI_DEFAULTS[hex.feature]) {
        // OO/C/M: tracks drawn in section 4 (after box fill so they're visible)
      } else if (hex.feature === 'city') {
        // City hex: each exit draws a straight line to center (city circle sits at center)
        for (const exit of hex.exits) {
          const re = (exit + (hex.rotation || 0)) % 6;
          const mp = edgePos(re);
          ctx.beginPath();
          ctx.moveTo(cx + mp.x * sc, cy + mp.y * sc);
          ctx.lineTo(cx, cy);
          ctx.stroke();
        }
      } else {
        // Town/dualTown/generic: arcs between paired exits (track curves through town).
        const exits = hex.exits.slice();
        for (let i = 0; i + 1 < exits.length; i += 2) {
          const ra = (exits[i]   + (hex.rotation || 0)) % 6;
          const rb = (exits[i+1] + (hex.rotation || 0)) % 6;
          const pa = edgePos(ra), pb = edgePos(rb);
          const bxA = cx + pa.x * sc, byA = cy + pa.y * sc;
          const exA = cx + pb.x * sc, eyA = cy + pb.y * sc;
          if (Math.abs(ra - rb) === 3) {
            ctx.beginPath(); ctx.moveTo(bxA, byA); ctx.lineTo(exA, eyA); ctx.stroke();
          } else {
            const arc = calcArc(pa.x * sc, pa.y * sc, pb.x * sc, pb.y * sc);
            ctx.stroke(new Path2D(`M ${bxA} ${byA} A ${arc.radius} ${arc.radius} 0 0 ${arc.sweep} ${exA} ${eyA}`));
          }
        }
        // Odd remaining exit: straight stub to center
        if (exits.length % 2 === 1) {
          const re = (exits[exits.length - 1] + (hex.rotation || 0)) % 6;
          const mp = edgePos(re);
          ctx.beginPath();
          ctx.moveTo(cx + mp.x * sc, cy + mp.y * sc);
          ctx.lineTo(cx, cy);
          ctx.stroke();
        }
      }
    }
    ctx.restore();
  }

  // 3b. pathPairs — edge-to-edge tracks not through any node (e.g. bypass arc at Dünaberg)
  if (hex.pathPairs && hex.pathPairs.length > 0) {
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(corners[0].x, corners[0].y);
    for (let i = 1; i < 6; i++) ctx.lineTo(corners[i].x, corners[i].y);
    ctx.closePath();
    ctx.clip();

    ctx.strokeStyle = '#222';
    ctx.lineWidth   = 6 * sc;
    ctx.lineCap     = 'round';

    for (const [a, b] of hex.pathPairs) {
      const ra = (a + (hex.rotation || 0)) % 6;
      const rb = (b + (hex.rotation || 0)) % 6;
      const pa  = edgePos(ra);   // relative to center, 43.3-unit space
      const pb  = edgePos(rb);
      const pax = pa.x * sc, pay = pa.y * sc;
      const pbx = pb.x * sc, pby = pb.y * sc;
      const bxA = cx + pax, byA = cy + pay;
      const exA = cx + pbx, eyA = cy + pby;

      if (Math.abs(ra - rb) === 3) {
        // Straight through center
        ctx.beginPath();
        ctx.moveTo(bxA, byA);
        ctx.lineTo(exA, eyA);
        ctx.stroke();
      } else {
        // Curved arc using 18xx.games calcArc formula
        const arc = calcArc(pax, pay, pbx, pby);
        const p = new Path2D(`M ${bxA} ${byA} A ${arc.radius} ${arc.radius} 0 0 ${arc.sweep} ${exA} ${eyA}`);
        ctx.stroke(p);
      }
    }
    ctx.restore();
  }

  // 4. Feature at center
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(sc, sc);

  const slots = hex.slots || 1;
  switch (hex.feature) {
    case 'town': {
      // Town: black dot. Revenue is rendered separately — NEVER inside this marker.
      ctx.beginPath();
      ctx.arc(0, 0, 5, 0, Math.PI * 2);
      ctx.fillStyle = '#000';
      ctx.fill();
      break;
    }

    case 'dualTown': {
      // Two town nodes — bar or dot per node. Revenue rendered separately, never inside markers.
      // Unconnected towns (no exits) are dots per Ruby town.rect? = exits.size==2.
      const _hasDtExits = hex.exits && hex.exits.length > 0;
      const dtPositions = (hex.townPositions && hex.townPositions.length >= 2)
        ? hex.townPositions
        : _hasDtExits
          ? [{ x: -14, y: 0, rot: 0, rw: 16.93, rh: 4.23 }, { x: 14, y: 0, rot: 0, rw: 16.93, rh: 4.23 }]
          : [{ x: -14, y: 0, dot: true }, { x: 14, y: 0, dot: true }];
      for (const pos of dtPositions) {
        ctx.save();
        ctx.translate(pos.x, pos.y);
        ctx.fillStyle = '#000';
        if (pos.dot) {
          // 3+-exit junction town → dot
          ctx.beginPath();
          ctx.arc(0, 0, 5, 0, Math.PI * 2);
          ctx.fill();
        } else {
          const rw = pos.rw || 16.93;
          const rh = pos.rh || 4.23;
          ctx.rotate((pos.rot || 0) * Math.PI / 180);
          ctx.fillRect(-rw / 2, -rh / 2, rw, rh);
        }
        ctx.restore();
      }
      break;
    }

    case 'oo':
    case 'c':
    case 'm': {
      // Draw tracks connecting edges to city nodes
      if (hex.exits && hex.exits.length > 0) {
        ctx.strokeStyle = '#222';
        ctx.lineWidth = 6;
        ctx.lineCap = 'round';
        const ep4 = hex.exitPairs;
        for (const exit of hex.exits) {
          const re = (exit + (hex.rotation || 0)) % 6;
          const mp = edgePos(re);
          let nodeIdx = 0;
          if (ep4) {
            for (let ni = 0; ni < ep4.length; ni++) {
              if ((ep4[ni] || []).includes(exit)) { nodeIdx = ni; break; }
            }
          }
          const npos = ooNodes[nodeIdx] || ooNodes[0];
          ctx.beginPath();
          ctx.moveTo(mp.x, mp.y);
          ctx.lineTo(npos.x, npos.y);
          ctx.stroke();
        }
      }
      // One circle per node (drawn on top of tracks)
      for (const npos of ooNodes) {
        ctx.beginPath();
        ctx.arc(npos.x, npos.y, 11, 0, Math.PI * 2);
        ctx.fillStyle = 'white';
        ctx.fill();
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
      break;
    }

    case 'city':
      if (slots === 3) {
        for (const [px, py] of [[-16, -10], [16, -10], [0, 12]]) {
          ctx.beginPath();
          ctx.arc(px, py, 11, 0, Math.PI * 2);
          ctx.fillStyle = 'white';
          ctx.fill();
          ctx.strokeStyle = '#333';
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
      } else if (slots === 4) {
        for (const [px, py] of [[-14, -7], [14, -7], [-14, 7], [14, 7]]) {
          ctx.beginPath();
          ctx.arc(px, py, 9, 0, Math.PI * 2);
          ctx.fillStyle = 'white';
          ctx.fill();
          ctx.strokeStyle = '#333';
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
      } else if (slots === 2) {
        for (const ox of [-13, 13]) {
          ctx.beginPath();
          ctx.arc(ox, 0, 11, 0, Math.PI * 2);
          ctx.fillStyle = 'white';
          ctx.fill();
          ctx.strokeStyle = '#333';
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
      } else {
        ctx.beginPath();
        ctx.arc(0, 0, 14, 0, Math.PI * 2);
        ctx.fillStyle = 'white';
        ctx.fill();
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      break;
  }

  ctx.restore();

  // 5a. Per-city revenue for OO, C, and M — one bubble per node, positioned outward.
  if (MULTI_DEFAULTS[hex.feature] && ooNodes) {
    // Prefer explicit per-node flat revenues; fall back to phaseRevenue uniform value.
    const flatRevs = hex.feature === 'm'
      ? (hex.mFlatRevenues || null)
      : (hex.ooFlatRevenues || null);

    let perNodeRevs = null;
    if (flatRevs && flatRevs.some(v => v > 0)) {
      perNodeRevs = flatRevs;
    } else {
      const phaseKeys = ['yellow', 'green', 'brown', 'gray'];
      const activePhases = phaseKeys.filter(p => hex.activePhases && hex.activePhases[p]);
      if (hex.phaseRevenue && activePhases.length > 0) {
        const rv = hex.phaseRevenue[activePhases[0]] || 0;
        if (rv > 0) perNodeRevs = ooNodes.map(() => rv);
      }
    }

    if (perNodeRevs) {
      for (let ni = 0; ni < ooNodes.length; ni++) {
        const rv = perNodeRevs[ni] || perNodeRevs[0] || 0;
        if (!rv) continue;
        const npos = ooNodes[ni];
        const mag = Math.hypot(npos.x, npos.y) || 1;
        const dx = npos.x / mag, dy = npos.y / mag;
        // Perpendicular offset so bubble sits beside track rather than on it
        const revX = cx + (npos.x - dy * 16) * sc;
        const revY = cy + (npos.y + dx * 16) * sc;
        const r = 10 * sc;
        ctx.beginPath();
        ctx.arc(revX, revY, r, 0, Math.PI * 2);
        ctx.fillStyle = 'white';
        ctx.fill();
        ctx.strokeStyle = '#888';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.fillStyle = '#000';
        ctx.font = `bold ${Math.max(6, Math.round(8 * zoom))}px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(rv), revX, revY);
      }
    }
  }

  // 5. Revenue display (OO/C/M handled above per-city; skip for those)
  if (!MULTI_DEFAULTS[hex.feature]) {
    const phaseKeys = ['yellow', 'green', 'brown', 'gray'];
    const activePhases = phaseKeys.filter(p => hex.activePhases && hex.activePhases[p]);
    if (hex.phaseRevenue && activePhases.length > 0) {
      const revVals = activePhases.map(p => hex.phaseRevenue[p] || 0);
      const allSame = revVals.every(v => v === revVals[0]);
      const revenueY = cy + size * 0.44;

      if (allSame && revVals[0] > 0) {
        // Single white circle (matches 18xx.games single_revenue.rb)
        const r = 12 * sc;
        ctx.beginPath();
        ctx.arc(cx, revenueY, r, 0, Math.PI * 2);
        ctx.fillStyle = 'white';
        ctx.fill();
        ctx.strokeStyle = '#888';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.fillStyle = '#000';
        ctx.font = `bold ${Math.max(6, Math.round(8 * zoom))}px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(revVals[0]), cx, revenueY);
      } else if (!allSame) {
        // Colored phase boxes for offboard-style varying revenues
        const bw = 14 * sc, bh = 10 * sc, gap = 2 * sc;
        const totalW = activePhases.length * (bw + gap) - gap;
        let bx = cx - totalW / 2;
        const by = revenueY;
        for (const ph of activePhases) {
          ctx.fillStyle = STATIC_PHASE_COLORS[ph];
          ctx.fillRect(bx, by, bw, bh);
          ctx.strokeStyle = '#333';
          ctx.lineWidth = 0.5;
          ctx.strokeRect(bx, by, bw, bh);
          ctx.fillStyle = '#111';
          ctx.font = `bold ${Math.max(5, Math.round(6 * zoom))}px Arial`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(String(hex.phaseRevenue[ph] || 0), bx + bw / 2, by + bh / 2);
          bx += bw + gap;
        }
      }
      // allSame && revVals[0] === 0: no display (zero revenue, suppress)
    }
  }

  // 6. Name label — OO/C/M: center of all nodes (inside frame); others: below feature.
  if (hex.name) {
    let lx = cx;
    let ly;
    if (MULTI_DEFAULTS[hex.feature] && ooNodes) {
      // Centroid of all nodes
      const avgX = ooNodes.reduce((s, n) => s + n.x, 0) / ooNodes.length;
      const avgY = ooNodes.reduce((s, n) => s + n.y, 0) / ooNodes.length;
      lx = cx + avgX * sc;
      ly = cy + avgY * sc;
    } else {
      // Below the city/town feature; avoids overlap with center circle
      ly = cy + size * 0.35;
    }
    ctx.font = `bold ${Math.max(7, Math.round(8 * zoom))}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.lineWidth = 2.5;
    ctx.strokeText(hex.name, lx, ly);
    ctx.fillStyle = '#111';
    ctx.fillText(hex.name, lx, ly);
  }

  // 7. Tile label (label=X)
  if (hex.label) {
    ctx.font = `bold ${Math.max(8, Math.round(9 * zoom))}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#333';
    ctx.fillText(hex.label, cx, cy);
  }

  // 8. (Static badge removed — was "S" in bottom-right corner; unnecessary noise.)

  // 9. Border markers (impassable / water crossing)
  drawBorders(hex, cx, cy, size);
}

function drawHex(row, col, hex = null) {
  if (hex && hex.static) { drawStaticHex(row, col, hex); return; }
  const center = getHexCenter(row, col, HEX_SIZE, state.meta.orientation);
  const cx = (center.x + panX) * zoom + LABEL_PAD;
  const cy = (center.y + panY) * zoom + LABEL_PAD;
  const size = HEX_SIZE * zoom;

  const terrain = hex?.terrain || '';
  const tileDef = hex?.tile ? TileRegistry.getTileDef(hex.tile) : null;
  // Normalise 'gray' → 'grey' to match TILE_HEX_COLORS key (tile-packs.js uses American spelling)
  const _tileColor = tileDef ? (tileDef.color === 'gray' ? 'grey' : tileDef.color) : null;
  const color = _tileColor
    ? (TILE_HEX_COLORS[_tileColor] || TERRAIN_COLORS[''])
    : (TERRAIN_COLORS[terrain] || TERRAIN_COLORS['']);

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

  // OO white hex: two city circles, no bounding box (no tile placed)
  if (hex?.feature === 'oo' && !hex?.tile) {
    ctx.save();
    ctx.translate(cx, cy);
    const sc = size / 50;
    ctx.scale(sc, sc);
    for (const ox of [-13, 13]) {
      ctx.beginPath();
      ctx.arc(ox, 0, 11, 0, Math.PI * 2);
      ctx.fillStyle = 'white';
      ctx.fill();
      ctx.strokeStyle = '#333';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    ctx.restore();
    if (hex.ooCityName) {
      const name = hex.ooCityName;
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
  }

  // City circle(s) for hexes that have a city marker but no placed tile
  if ((hex?.feature === 'city' || (hex?.city && !hex?.tile && !hex?.feature)) && !hex?.tile) {
    ctx.save();
    ctx.translate(cx, cy);
    const sc = size / 50;
    ctx.scale(sc, sc);
    const slots = hex.feature === 'city' ? (hex.slots || 1) : (hex.city?.slots || 1);
    const isJoined = hex.feature === 'city' ? !!hex.joined : !!(hex.city?.joined);
    if (slots >= 3) {
      // Triple city: three circles in triangle formation — no bounding box
      const triPts = [{ x: 0, y: -16 }, { x: -16, y: 10 }, { x: 16, y: 10 }];
      for (const p of triPts) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 10, 0, Math.PI * 2);
        ctx.fillStyle = 'white';
        ctx.fill();
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    } else if (slots >= 2) {
      // 2-slot city: two circles side by side — no bounding box
      for (const ox of [-13, 13]) {
        ctx.beginPath();
        ctx.arc(ox, 0, 11, 0, Math.PI * 2);
        ctx.fillStyle = 'white';
        ctx.fill();
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    } else {
      ctx.beginPath();
      ctx.arc(0, 0, 14, 0, Math.PI * 2);
      ctx.fillStyle = 'white';
      ctx.fill();
      ctx.strokeStyle = '#333';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    ctx.restore();
  }

  // town / dualTown features are fully rendered by the switch above — no second pass needed.

  // Location name for unplaced city/town hexes (below the feature)
  {
    const locName = (hex?.city && !hex?.tile) ? (hex.city.name || '') :
                    (hex?.town && !hex?.tile)  ? (hex.town.name  || '') :
                    (hex?.feature && !hex?.tile) ? (hex.featureName || '') : '';
    if (locName) {
      const ny = cy + size * 0.35;
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

  // Hex label (label= field, rendered at center when no tile)
  if (hex?.label && !hex?.tile) {
    ctx.font = `bold ${Math.max(8, Math.round(9 * zoom))}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#555';
    ctx.fillText(hex.label, cx, cy);
  }

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
  const mRPC = state.meta.maxRowPerCol || null;
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
      if (mRPC !== null && r >= (mRPC[c] !== undefined ? mRPC[c] : state.meta.rows)) continue;
      const id = hexId(r, c);
      const hex = state.hexes[id] || null;
      if (!hex?.tile) continue;
      const tileDef = TileRegistry.getTileDef(hex.tile);
      if (!tileDef) continue;

      // Use HEX_SIZE (not pre-scaled) — same formula as drawHex so SVG aligns with canvas
      const center = getHexCenter(r, c, HEX_SIZE, state.meta.orientation);
      const cx = (center.x + panX) * zoom + LABEL_PAD;
      const cy = (center.y + panY) * zoom + LABEL_PAD;
      const tileDeg = (hex.rotation || 0) * 60;
      const totalDeg = orientDeg + tileDeg;

      // ── Rotated content (tracks + city/town symbols) ──
      let inner = '';

      if (tileDef.svgPath) {
        inner += `<path d="${tileDef.svgPath}" stroke="#222" stroke-width="8" stroke-linecap="round" fill="none"/>`;
      }

      if (tileDef.city) {
        inner += `<circle cx="0" cy="0" r="14" fill="white" stroke="#333" stroke-width="2"/>`;

      } else if (tileDef.oo) {
        const SR = 12.5;
        const positions = tileDef.cityPositions || [{ x: -SR, y: 0 }, { x: SR, y: 0 }];
        if (positions.length === 2) {
          // White background rect bridges the two circles
          const xs = positions.map(p => p.x);
          const ys = positions.map(p => p.y);
          const bx = Math.min(...xs) - SR, by = Math.min(...ys) - SR;
          const bw = Math.max(...xs) - Math.min(...xs) + 2 * SR;
          const bh = Math.max(...ys) - Math.min(...ys) + 2 * SR;
          inner += `<rect x="${bx}" y="${by}" width="${bw}" height="${bh}" fill="white"/>`;
        } else if (positions.length >= 3) {
          // 3-slot: white triangle connecting circle centers fills the whole interior.
          // Edges 0/2/4 of tile 171 go exactly BETWEEN the circles and would show as
          // black stubs — the triangle covers them from center to the circle boundary.
          const pts = positions.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
          inner += `<polygon points="${pts}" fill="white" stroke="none"/>`;
        }
        for (const pos of positions) {
          inner += `<circle cx="${pos.x}" cy="${pos.y}" r="${SR}" fill="white" stroke="#333" stroke-width="1.5"/>`;
        }

      } else if (tileDef.cities && tileDef.cities.length) {
        const SR = 12.5;
        for (const pos of tileDef.cities) {
          inner += `<circle cx="${pos.x}" cy="${pos.y}" r="${SR}" fill="white" stroke="#333" stroke-width="1.5"/>`;
        }

      } else if (tileDef.town) {
        inner += `<circle cx="0" cy="0" r="5" fill="black"/>`;

      } else if (tileDef.townAt) {
        const { x, y, rot, rw, rh } = tileDef.townAt;
        inner += `<g transform="translate(${x},${y}) rotate(${rot})"><rect x="${-rw / 2}" y="${-rh / 2}" width="${rw}" height="${rh}" fill="black"/></g>`;

      } else if (tileDef.dualTown) {
        const dtPos = (tileDef.townPositions && tileDef.townPositions.length)
          ? tileDef.townPositions
          : [{ x: -10, y: 0, rot: 0, rw: 16, rh: 4 }, { x: 10, y: 0, rot: 0, rw: 16, rh: 4 }];
        for (const pos of dtPos) {
          if (pos.dot) {
            inner += `<circle cx="${pos.x}" cy="${pos.y}" r="5" fill="black"/>`;
          } else {
            const rw = pos.rw || 16, rh = pos.rh || 4;
            inner += `<g transform="translate(${pos.x},${pos.y}) rotate(${pos.rot || 0})"><rect x="${-rw / 2}" y="${-rh / 2}" width="${rw}" height="${rh}" fill="black"/></g>`;
          }
        }
      }

      // Tile group: translate to hex center; clip to hex; rotate+scale tile content
      content += `<g transform="translate(${cx.toFixed(1)},${cy.toFixed(1)})">`;
      content += `<g clip-path="url(#tile-clip)"><g transform="rotate(${totalDeg}) scale(${sc.toFixed(4)})">${inner}</g></g>`;

      // ── Upright content (stays level regardless of tile rotation) ──

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

      content += '</g>'; // close translate group
    }
  }

  svgEl.innerHTML = `<defs>${defs}</defs>${content}`;
}

// ─── RENDER ───────────────────────────────────────────────────────────────────
// Clears the canvas and redraws all hex cells, then overlays SVG tile content.

function render() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const mRPC = state.meta.maxRowPerCol || null;
  for (let r = 0; r < state.meta.rows; r++) {
    for (let c = 0; c < state.meta.cols; c++) {
      if (mRPC !== null && r >= (mRPC[c] !== undefined ? mRPC[c] : state.meta.rows)) continue;
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
  const savedSelect