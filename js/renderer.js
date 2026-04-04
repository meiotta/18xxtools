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
  if (inMulti) {
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
      // Gray pre-printed town: revenue box on the track rather than a black dot.
      // The track arc passes through center; this white rectangle sits on top of it,
      // showing the revenue value (like 18xx.games gray town rendering).
      const revVal = (hex.phaseRevenue && Object.values(hex.phaseRevenue).find(v => v > 0)) || 0;
      const boxW = revVal > 0 ? 30 : 18;
      const boxH = 16;
      ctx.fillStyle = 'white';
      ctx.strokeStyle = '#444';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(-boxW / 2, -boxH / 2, boxW, boxH, 2);
      ctx.fill();
      ctx.stroke();
      if (revVal > 0) {
        ctx.fillStyle = '#000';
        ctx.font = `bold 10px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(revVal), 0, 0);
      }
      break;
    }

    case 'dualTown':
      for (const [px, py] of [[-14, 0], [14, 0]]) {
        ctx.beginPath();
        ctx.arc(px, py, 10, 0, Math.PI * 2);
        ctx.fillStyle = '#000';
        ctx.fill();
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 4;
        ctx.stroke();
      }
      break;

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
        ctx.beginPath();
        ctx.roundRect(-29, -16, 58, 32, 3);
        ctx.fillStyle = 'white';
        ctx.fill();
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 2;
        ctx.stroke();
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
        ctx.beginPath();
        ctx.roundRect(-26, -15, 52, 30, 3);
        ctx.fillStyle = 'white';
        ctx.fill();
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 2;
        ctx.stroke();
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

  // 5. Revenue display (OO/C/M handled above per-city; skip for those and for
  //    town/dualTown which embed revenue in their center marker instead)
  if (!MULTI_DEFAULTS[hex.feature] && hex.feature !== 'town' && hex.feature !== 'dualTown') {
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
  const tileDef = hex?.tile ? TILE_DEFS[String(hex.tile)] : null;
  const color = tileDef ? (TILE_HEX_COLORS[tileDef.color] || '#F0D070') : (TERRAIN_COLORS[terrain] || TERRAIN_COLORS['']);

  const corners = hexCorners(cx, cy, size, state.meta.orientation);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(corners[0].x, corners[0].y);
  for (let i = 1; i < 6; i++) ctx.lineTo(corners[i].x, corners[i].y);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = selectedHex === hexId(row, col) ? '#ffd700' : '#666';
  ctx.lineWidth = selectedHex === hexId(row, col) ? 2 * zoom : 1;
  ctx.stroke();

  // Render tile track if placed
  if (hex?.tile) {
    if (tileDef && tileDef.svgPath) {
      const rotation = (hex.rotation || 0) * 60; // degrees

      // Outer save: clip to hex shape so track doesn't bleed outside
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(corners[0].x, corners[0].y);
      for (let ci = 1; ci < 6; ci++) ctx.lineTo(corners[ci].x, corners[ci].y);
      ctx.closePath();
      ctx.clip();

      // Inner save: translate/rotate/scale for tile path coords
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(rotation * Math.PI / 180);
      // Scale from SVG coords (apothem=43.3) to canvas hex size
      const scale = size / 50;
      ctx.scale(scale, scale);

      ctx.strokeStyle = '#222';
      ctx.lineWidth = 8;
      ctx.lineCap = 'round';

      const p = new Path2D(tileDef.svgPath);
      ctx.stroke(p);

      // City/OO/town indicators (drawn in scaled SVG space)
      if (tileDef.city) {
        ctx.beginPath();
        ctx.arc(0, 0, 14, 0, Math.PI * 2);
        ctx.fillStyle = 'white';
        ctx.fill();
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 2;
        ctx.stroke();
      } else if (tileDef.dualTown && tileDef.townPositions) {
        // Dual-town (dit×2) placed tile — draw two town circles at specific positions
        for (const pos of tileDef.townPositions) {
          ctx.beginPath();
          ctx.arc(pos.x, pos.y, 10.25, 0, Math.PI * 2);
          ctx.fillStyle = '#000';
          ctx.fill();
          ctx.strokeStyle = 'white';
          ctx.lineWidth = 4;
          ctx.stroke();
        }
      } else if (tileDef.oo) {
        if (tileDef.cityPositions) {
          // Custom-positioned OO cities (e.g. tiles X3, X4, X5, 1, 2, 94)
          for (const pos of tileDef.cityPositions) {
            ctx.beginPath();
            ctx.arc(pos.x, pos.y, 12.5, 0, Math.PI * 2);
            ctx.fillStyle = 'white';
            ctx.fill();
            ctx.strokeStyle = '#333';
            ctx.lineWidth = 2;
            ctx.stroke();
          }
        } else {
          ctx.fillStyle = 'white';
          ctx.strokeStyle = '#333';
          ctx.lineWidth = 2;
          // Rectangular frame
          ctx.beginPath();
          ctx.roundRect(-25, -14, 50, 28, 3);
          ctx.fill();
          ctx.stroke();
          // Two token circles
          for (const ox of [-13, 13]) {
            ctx.beginPath();
            ctx.arc(ox, 0, 11, 0, Math.PI * 2);
            ctx.fillStyle = 'white';
            ctx.fill();
            ctx.strokeStyle = '#333';
            ctx.lineWidth = 1.5;
            ctx.stroke();
          }
        }
      } else if (tileDef.town) {
        // Small black bar at center
        ctx.fillStyle = '#000';
        ctx.beginPath();
        ctx.roundRect(-8, -4, 16, 8, 1);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(0, 0, 6, 0, Math.PI * 2);
        ctx.fillStyle = 'white';
        ctx.fill();
        ctx.strokeStyle = '#555';
        ctx.lineWidth = 1;
        ctx.stroke();
      } else if (tileDef.townAt) {
        // Positioned town bar (e.g. tile 3/58 — junction off-center)
        const { x, y, rot, rw, rh } = tileDef.townAt;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(rot * Math.PI / 180);
        ctx.fillStyle = '#000';
        ctx.fillRect(-rw / 2, -rh / 2, rw, rh);
        ctx.restore();
      }

      ctx.restore(); // restore transform
      ctx.restore(); // restore clip

      // Y / T label — drawn in canvas space so it does NOT rotate with the tile
      if (tileDef.tileLabel) {
        ctx.fillStyle = '#111';
        ctx.font = `bold ${Math.max(8, Math.round(9 * zoom))}px Arial`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(tileDef.tileLabel, cx - size * 0.62, cy);
      }

      // Revenue bubble(s) — drawn in canvas space (no rotation), scaled with zoom
      const revList = tileDef.revenues || (tileDef.revenue ? [tileDef.revenue] : []);
      for (const rev of revList) {
        const sc = size / 50;
        const rx = cx + rev.x * sc;
        const ry = cy + rev.y * sc;
        const r = 7.5 * sc;
        ctx.beginPath();
        ctx.arc(rx, ry, r, 0, Math.PI * 2);
        ctx.fillStyle = 'white';
        ctx.fill();
        ctx.strokeStyle = '#777';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.fillStyle = '#000';
        ctx.font = `bold ${Math.max(6, Math.round(8 * zoom))}px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(rev.v), rx, ry);
      }
    }
  }

  // City name for placed tiles (city:true or oo:true)
  if (hex?.cityName && tileDef && (tileDef.city || tileDef.oo)) {
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

  // OO white hex: two horizontal city circles in a frame (no tile placed)
  if (hex?.oo && !hex?.tile) {
    ctx.save();
    ctx.translate(cx, cy);
    const sc = size / 50;
    ctx.scale(sc, sc);
    // Rectangular frame
    ctx.fillStyle = 'white';
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(-27, -15, 54, 30, 3);
    ctx.fill();
    ctx.stroke();
    // Two horizontal city circles
    for (const ox of [-14, 14]) {
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
  if (hex?.city && !hex?.tile) {
    ctx.save();
    ctx.translate(cx, cy);
    const sc = size / 50;
    ctx.scale(sc, sc);
    const slots = hex.city.slots || 1;
    if (slots >= 2) {
      ctx.fillStyle = 'white';
      ctx.strokeStyle = '#333';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(-26, -15, 52, 30, 3);
      ctx.fill();
      ctx.stroke();
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

  // Town dot for hexes that have a town marker but no placed tile
  if (hex?.town && !hex?.tile) {
    ctx.save();
    ctx.translate(cx, cy);
    const sc = size / 50;
    ctx.scale(sc, sc);
    ctx.beginPath();
    ctx.arc(0, 0, 10, 0, Math.PI * 2);
    ctx.fillStyle = '#000';
    ctx.fill();
    ctx.strokeStyle = 'white';
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.restore();
  }

  // Location name for unplaced city/town hexes (below the feature)
  {
    const locName = (hex?.city && !hex?.tile) ? (hex.city.name || '') :
                    (hex?.town && !hex?.tile)  ? (hex.town.name  || '') : '';
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

  // Terrain icon — show whenever terrain type is set and no tile placed
  if (hex?.terrain && hex.terrain !== '' && !hex?.tile) {
    const terrain = hex.terrain || '';
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

// ─── RENDER ───────────────────────────────────────────────────────────────────
// Clears the canvas and redraws all hex cells.

function render() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  // maxRowPerCol: per-column row extents set by importRubyMap.
  // When present, skip positions beyond each column's valid range so that
  // imported maps (e.g. 1889 Shikoku) don't render blank tan hexes outside
  // the island shape.  Null = no per-column clipping (user-created maps).
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
}

// ─── RESIZE CANVAS ────────────────────────────────────────────────────────────
// Matches the canvas pixel dimensions to its CSS container and re-renders.
// Called once at startup and on every window resize event.

function resizeCanvas() {
  canvas.width  = container.clientWidth  || 800;
  canvas.height = container.clientHeight || 600;
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

  // Save and override globals that drawStaticHex reads
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
  window.selectedHex      = null;   // never show selection border in preview
  state.meta.orientation  = orientation;

  try {
    drawStaticHex(0, 0, hexData);
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