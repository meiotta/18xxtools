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
  gray:   '#BCBDC0',
  red:    '#E05050',
};

const STATIC_PHASE_COLORS = {
  yellow: '#F0D070',
  green:  '#71BF44',
  brown:  '#CB7745',
  gray:   '#BCBDC0',
};

// Draw impassable / water-crossing border markers for a hex.
// Called at the end of both drawStaticHex and drawHex.
function drawBorders(hex, cx, cy, size) {
  if (!hex || !hex.borders || hex.borders.length === 0) return;
  const sc = size / 50;
  for (const border of hex.borders) {
    const mp = EDGE_MIDPOINTS[border.edge];
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
    } else if (border.type === 'water') {
      ctx.strokeStyle = '#2266cc';
      ctx.lineWidth = Math.max(1.5, 3 * zoom);
      ctx.beginPath();
      ctx.moveTo(bx - edgeDx * halfLen, by - edgeDy * halfLen);
      ctx.lineTo(bx + edgeDx * halfLen, by + edgeDy * halfLen);
      ctx.stroke();
      if (border.cost) {
        ctx.fillStyle = '#2266cc';
        ctx.font = `bold ${Math.max(6, Math.round(7 * zoom))}px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        // Offset label slightly inward (radial direction)
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

  const corners = hexCorners(cx, cy, size);

  // 1. Fill background
  ctx.fillStyle = STATIC_BG_COLORS[hex.bg] || '#D4B483';
  ctx.beginPath();
  ctx.moveTo(corners[0].x, corners[0].y);
  for (let i = 1; i < 6; i++) ctx.lineTo(corners[i].x, corners[i].y);
  ctx.closePath();
  ctx.fill();

  // 2. Hex border (gold when selected; darker for plain red fill hexes)
  const isPlainRed = hex.bg === 'red' && (!hex.feature || hex.feature === 'none');
  ctx.strokeStyle = selectedHex === hexId(row, col) ? '#ffd700' : (isPlainRed ? '#333' : '#666');
  ctx.lineWidth   = selectedHex === hexId(row, col) ? 2 * zoom : 1;
  ctx.stroke();

  // Plain red fill hex — solid color area only, no features or labels
  if (isPlainRed) return;

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
        const mp = EDGE_MIDPOINTS[re];
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
      if (hex.feature === 'oo') {
        const ooEP = hex.exitPairs;
        const ooHasEP = ooEP && ((ooEP[0] || []).length + (ooEP[1] || []).length) > 0;
        const ooNodes = [0, 1].map(ni => {
          if (!ooHasEP) return ni === 0 ? { x: -14, y: 0 } : { x: 14, y: 0 };
          const grp = ooEP[ni] || [];
          if (!grp.length) return ni === 0 ? { x: -14, y: 0 } : { x: 14, y: 0 };
          let sx = 0, sy = 0;
          for (const e of grp) {
            const re = (e + (hex.rotation || 0)) % 6;
            sx += EDGE_MIDPOINTS[re].x;
            sy += EDGE_MIDPOINTS[re].y;
          }
          return { x: sx / grp.length * 0.55, y: sy / grp.length * 0.55 };
        });
        for (const exit of hex.exits) {
          const re = (exit + (hex.rotation || 0)) % 6;
          const mp = EDGE_MIDPOINTS[re];
          const nodeIdx = ooHasEP
            ? ((ooEP[0] || []).includes(exit) ? 0 : 1)
            : (hex.exits.indexOf(exit) < Math.ceil(hex.exits.length / 2) ? 0 : 1);
          const npos = ooNodes[nodeIdx];
          ctx.beginPath();
          ctx.moveTo(cx + mp.x * sc, cy + mp.y * sc);
          ctx.lineTo(cx + npos.x * sc, cy + npos.y * sc);
          ctx.stroke();
        }
      } else {
        for (const exit of hex.exits) {
          const re = (exit + (hex.rotation || 0)) % 6;
          const mp = EDGE_MIDPOINTS[re];
          ctx.beginPath();
          ctx.moveTo(cx + mp.x * sc, cy + mp.y * sc);
          ctx.lineTo(cx, cy);
          ctx.stroke();
        }
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
    case 'town':
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.roundRect(-16, -8, 32, 16, 2);
      ctx.fill();
      break;

    case 'dualTown':
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.roundRect(-30, -7, 24, 14, 2);
      ctx.fill();
      ctx.beginPath();
      ctx.roundRect(6, -7, 24, 14, 2);
      ctx.fill();
      break;

    case 'oo': {
      const ooEP = hex.exitPairs;
      const ooHasEP = ooEP && ((ooEP[0] || []).length + (ooEP[1] || []).length) > 0;
      const ooNodes = [0, 1].map(ni => {
        if (!ooHasEP) return ni === 0 ? { x: -14, y: 0 } : { x: 14, y: 0 };
        const grp = ooEP[ni] || [];
        if (!grp.length) return ni === 0 ? { x: -14, y: 0 } : { x: 14, y: 0 };
        let sx = 0, sy = 0;
        for (const e of grp) {
          const re = (e + (hex.rotation || 0)) % 6;
          sx += EDGE_MIDPOINTS[re].x;
          sy += EDGE_MIDPOINTS[re].y;
        }
        return { x: sx / grp.length * 0.55, y: sy / grp.length * 0.55 };
      });
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

  // 5. Phase revenue boxes — colored rectangles near bottom
  const phases = ['yellow', 'green', 'brown', 'gray'];
  const activePhases = phases.filter(p => hex.activePhases && hex.activePhases[p]);
  if (hex.phaseRevenue && activePhases.length > 0) {
    const bw = 14 * sc, bh = 10 * sc, gap = 2 * sc;
    const totalW = activePhases.length * (bw + gap) - gap;
    let bx = cx - totalW / 2;
    const by = cy + size * 0.44;

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

  // 6. Name label — above center or near top
  if (hex.name) {
    const ly = cy - size * 0.42;
    ctx.font = `bold ${Math.max(7, Math.round(8 * zoom))}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.lineWidth = 2.5;
    ctx.strokeText(hex.name, cx, ly);
    ctx.fillStyle = '#111';
    ctx.fillText(hex.name, cx, ly);
  }

  // 7. Tile label (label=X)
  if (hex.label) {
    ctx.font = `bold ${Math.max(8, Math.round(9 * zoom))}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#333';
    ctx.fillText(hex.label, cx, cy);
  }

  // 8. "STATIC" badge (small, bottom-right corner) so designer can identify it
  ctx.font = `${Math.max(5, Math.round(5.5 * zoom))}px Arial`;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'bottom';
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.fillText('S', cx + size * 0.54, cy + size * 0.62);

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

  const corners = hexCorners(cx, cy, size);
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

  // OO white hex: two city circles with OO label (no tile placed)
  if (hex?.oo && !hex?.tile) {
    ctx.save();
    ctx.translate(cx, cy);
    const sc = size / 50;
    ctx.scale(sc, sc);
    for (const oy of [-22, 22]) {
      ctx.beginPath();
      ctx.arc(0, oy, 14, 0, Math.PI * 2);
      ctx.fillStyle = 'white';
      ctx.fill();
      ctx.strokeStyle = '#333';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    ctx.restore();
    // OO label between the circles
    ctx.save();
    ctx.font = `bold ${10 * zoom}px Arial`;
    ctx.fillStyle = '#555';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('OO', cx, cy);
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

  // Town bar for hexes that have a town marker but no placed tile
  if (hex?.town && !hex?.tile) {
    ctx.save();
    ctx.translate(cx, cy);
    const sc 