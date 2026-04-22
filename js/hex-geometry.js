// ─── HEX GEOMETRY ─────────────────────────────────────────────────────────────
// Pure geometric functions for flat-top hexagonal grids.
// Load order: THIRD — after state.js (uses HEX_SIZE, EDGE_MIDPOINTS from constants).
//
// ── Coordinate systems ───────────────────────────────────────────────────────
//
// INTERNAL (editor) grid:  row=0..N, col=0..M  (integers, 0-based)
//
// 18XX.GAMES coord string: letter + number, e.g. "B3", "J10"
//   Standard convention:  letter = column (A=col0, B=col1 …), number = row
//   hexId(row, col) converts internal → string.
//
//   Standard row numbering per column (flat-top stagger):
//     even cols (0,2,4…): string rows 2,4,6,8…  → internal row = (strRow-2)/2
//     odd  cols (1,3,5…): string rows 1,3,5,7…  → internal row = (strRow-1)/2
//
// ── Transposed-axes games (e.g. 1882 Saskatchewan) ──────────────────────────
//
// Some Ruby source files declare  AXES = { x: :number, y: :letter }
// meaning the coord string is  {letter}{number}  but letter = ROW, number = COL.
// So "I1" = row I (letterIdx=8), col 1.
//
// coordToGrid (import-ruby.js) handles this reversal.  After the reversal the
// internal (row, col) indices are correct, BUT the stagger direction flips:
//
//   Standard game:  even internal cols are the "tall" ones (get t_y/2 offset).
//   1882 transposed: odd  internal cols are the "tall" ones (get t_y/2 offset).
//
// This is encoded in  state.meta.staggerParity:
//   0 = default (even cols staggered)
//   1 = transposed (odd cols staggered)
//
// getHexCenter, pixelToHex, and getNeighborHex all read staggerParity so the
// visual layout and click-to-hex math match the actual coordinate mapping.
//
// ── API ──────────────────────────────────────────────────────────────────────
// hexId(row, col) → '18xx.games' coord string, e.g. (0,0)→'A2', (0,1)→'B1'
// getHexCenter(row, col, size, orientation) → {x, y} canvas coords
// pixelToHex(px, py, size, orientation) → {row, col} from canvas pixel coords
// hexCorners(cx, cy, size) → [{x,y}×6] polygon corners
// trackPath(e1, e2) → SVG path string for a track segment between two edges

// hexCorners: orientation='flat' → corners at 0°,60°,...; 'pointy' → rotated 30°.
function hexCorners(cx, cy, size, orientation) {
  const offset = (orientation === 'pointy') ? 30 : 0;
  const corners = [];
  for (let i = 0; i < 6; i++) {
    const angle = (i * 60 + offset) * Math.PI / 180;
    corners.push({ x: cx + size * Math.cos(angle), y: cy + size * Math.sin(angle) });
  }
  return corners;
}

function getHexCenter(row, col, size, orientation) {
  let x, y;
  if (orientation === 'pointy') {
    // Pointy-top: columns spaced by size*√3, rows by size*1.5, some rows stagger right by half column.
    //
    // pointyStaggerParity (psp) controls which rows get the dx/2 rightward offset:
    //   psp=0 (default): odd  internal rows stagger right — standard pointy convention
    //   psp=1:           even internal rows stagger right — used by games like 1822 MX
    //     where even letter-rows (A,C,E…) use even column-numbers (A2,C4…)
    //
    // Detection: importRubyMap tallies whether even-letter rows use even or odd numbers;
    // if even numbers dominate, psp=1 is stored in state.meta.pointyStaggerParity.
    const dx = size * Math.sqrt(3);
    const dy = size * 1.5;
    const psp = (typeof state !== 'undefined' && state?.meta?.pointyStaggerParity) || 0;
    x = col * dx + dx / 2;
    y = row * dy + size;
    // psp=0: odd  rows stagger RIGHT (+dx/2) — standard pointy convention
    // psp=1: even rows stagger LEFT  (-dx/2) — 18OE / 1822MX style
    //   With psp=1: even-row cols are numbered 0,2,4… matching col=numPart/2,
    //   so the stagger must go LEFT to put odd rows (B1,D3…) between them.
    if ((row + psp) % 2 === 1) x += (psp === 0 ? 1 : -1) * dx / 2;
  } else {
    // Flat-top layout:
    //   Column pitch  = size * 1.5  (3/4 of hex width)
    //   Row pitch     = size * √3   (full hex height)
    //
    // In a standard 18xx flat-top grid, alternate columns are offset downward by
    // half a row (t_y/2) so that adjacent columns interlock.  Which set of columns
    // gets the offset depends on the coordinate convention of the source game:
    //
    //   staggerParity = 0  (default, most games)
    //     Even internal cols (0,2,4…) receive the t_y/2 downward offset.
    //     In 18xx.games coords these are the A,C,E… columns whose string rows
    //     are 2,4,6… — i.e. the "lower" starting position.
    //
    //   staggerParity = 1  (transposed-axes games, e.g. 1882 Saskatchewan)
    //     The Ruby file uses  AXES = { x: :number, y: :letter }, so the coord
    //     letter encodes the ROW and the number encodes the COLUMN.  After
    //     coordToGrid transposes them into internal (row,col) the mapping between
    //     "which internal cols are tall" flips: odd internal cols now need the
    //     offset.  Adding sp=1 before the modulo test achieves this cheaply.
    //
    // The formula  (col + sp) % 2 === 0  evaluates to:
    //   sp=0: true for even cols  → even cols staggered  (standard)
    //   sp=1: true for odd  cols  → odd  cols staggered  (1882 transposed)
    const t_x = size * 1.5;
    const t_y = size * Math.sqrt(3);
    const sp = (typeof state !== 'undefined' && state?.meta?.staggerParity) || 0;
    x = col * t_x + size;
    y = row * t_y + size + ((col + sp) % 2 === 0 ? t_y / 2 : 0);
  }
  return { x, y };
}

function pixelToHex(px, py, size, orientation) {
  // Inverse of getHexCenter: convert pixel coords back to col/row.
  //
  // Step 1 — rectangular estimate via Math.round.  Fast but inaccurate near the
  // angled edges of flat-top columns (or the angled edges of pointy-top rows),
  // where adjacent column (or row) bands overlap in x (or y).  A click on the
  // lower-right edge of hex (r,c) can fall in the Math.round zone of (r,c+1).
  //
  // Step 2 — Voronoi refinement: compare the click against the candidate and all
  // 8 grid neighbours and return the one whose center is closest.  For regular
  // hexagonal grids the nearest-center criterion is exactly the Voronoi partition,
  // so this correctly handles all overlap zones without any shape math.
  let col, row;
  if (orientation === 'flat') {
    const t_x = size * 1.5;
    const t_y = size * Math.sqrt(3);
    const sp = (typeof state !== 'undefined' && state?.meta?.staggerParity) || 0;
    col = Math.round((px - size) / t_x);
    const stagger = ((col + sp) % 2 === 0 ? t_y / 2 : 0);
    row = Math.round((py - size - stagger) / t_y);
  } else {
    const dx = size * Math.sqrt(3);
    const dy = size * 1.5;
    const psp = (typeof state !== 'undefined' && state?.meta?.pointyStaggerParity) || 0;
    row = Math.round((py - size) / dy);
    // Inverse of getHexCenter stagger: psp=0 → subtract dx/2 on odd rows;
    // psp=1 → add dx/2 on even rows (stagger was leftward, so invert rightward).
    const stagger = ((row + psp) % 2 === 1) ? (psp === 0 ? 1 : -1) * dx / 2 : 0;
    col = Math.round((px - dx / 2 - stagger) / dx);
  }
  // Voronoi refinement — check 3×3 neighbourhood, pick nearest center.
  let bestRow = Math.max(0, row), bestCol = Math.max(0, col), bestDist2 = Infinity;
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      const cr = row + dr, cc = col + dc;
      if (cr < 0 || cc < 0) continue;
      const ctr = getHexCenter(cr, cc, size, orientation);
      const d2  = (px - ctr.x) ** 2 + (py - ctr.y) ** 2;
      if (d2 < bestDist2) { bestDist2 = d2; bestRow = cr; bestCol = cc; }
    }
  }
  return { row: bestRow, col: bestCol };
}

function hexId(row, col) {
  const orientation = (typeof state !== 'undefined') ? (state.meta?.orientation ?? 'flat') : 'flat';

  if (orientation === 'pointy') {
    // Pointy layout: coordToGrid stores row=letterIdx (tobymao x=letter), col=normalised(numPart).
    // Invert back to tobymao coordinate format: letter from row, numPart from col.
    //
    // Formula: numPart = 2*col + offset
    //   where offset = pointyEvenOffset for even rows, pointyOddOffset for odd rows.
    //
    // Examples:
    //   18OE   (psp=1): evenOffset=0, oddOffset=1 → A0,A2…  B1,B3…
    //   1822PNW(psp=1): evenOffset=2, oddOffset=1 → A2,A4…  B1,B3…
    //   psp=0  default: evenOffset=1, oddOffset=0 → A1,A3…  B0,B2… (or +2 variant)
    // Derive psp-based defaults for maps that predate explicit offset storage.
    const psp = (typeof state !== 'undefined') ? (state.meta?.pointyStaggerParity ?? 0) : 0;
    const defEven = (psp === 1) ? 2 : 1;  // psp=1 maps: A2,A4… offset=2; psp=0: A1,A3… offset=1
    const defOdd  = (psp === 1) ? 1 : 2;  // psp=1 maps: B1,B3… offset=1; psp=0: B2,B4… offset=2
    const evenOffset = (typeof state !== 'undefined') ? (state.meta?.pointyEvenOffset ?? defEven) : defEven;
    const oddOffset  = (typeof state !== 'undefined') ? (state.meta?.pointyOddOffset  ?? defOdd)  : defOdd;
    const letter  = String.fromCharCode(65 + row);
    const offset  = (row % 2 === 0) ? evenOffset : oddOffset;
    const numPart = 2 * col + offset;
    return letter + numPart;
  }

  // Flat layout (and transposed-axes flat):
  // coordParity=0 (default): even cols use even row-nums (A2,A4…), odd cols odd (B1,B3…) — e.g. 1889
  // coordParity=1:           even cols use odd  row-nums (A1,A3…), odd cols even (B2,B4…) — e.g. 1830, 1846
  const cp = (typeof state !== 'undefined') ? (state.meta?.coordParity ?? 0) : 0;
  const evenCol  = (col % 2 === 0);
  // When cp=0: evenCol→even(+2), !evenCol→odd(+1)
  // When cp=1: evenCol→odd(+1),  !evenCol→even(+2)
  const coordRow = ((evenCol) === (cp === 0)) ? (2 * row + 2) : (2 * row + 1);
  return String.fromCharCode(65 + col) + coordRow;
}

function terrainCost(type) {
  return state.terrainCosts[type] || 0;
}

// Track path drawing function — returns an SVG path string for a track
// segment between edge midpoints e1 and e2.
// span=1 → sharp curve (adjacent edges, quadratic bezier around shared corner)
// span=2 → gentle curve (2 edges apart, cubic bezier toward center)
// span=3 → straight (opposite edges, line through center)
function trackPath(e1, e2) {
  const p1 = EDGE_MIDPOINTS[e1];
  const p2 = EDGE_MIDPOINTS[e2];
  const diff = Math.abs(e1 - e2);
  const span = Math.min(diff, 6 - diff); // 1=adjacent, 2=gentle, 3=straight

  if (span === 3) {
    // Straight: line through center
    return `M ${p1.x},${p1.y} L ${p2.x},${p2.y}`;
  } else if (span === 2) {
    // Gentle curve: cubic bezier pulling toward center
    const cx1 = p1.x * 0.3;
    const cy1 = p1.y * 0.3;
    const cx2 = p2.x * 0.3;
    const cy2 = p2.y * 0.3;
    return `M ${p1.x},${p1.y} C ${cx1},${cy1} ${cx2},${cy2} ${p2.x},${p2.y}`;
  } else {
    // Sharp curve: quadratic bezier around the shared corner vertex.
    // The corner between e1 and e2 (going the short way) has index:
    //   diff=1: corner = (max(e1,e2) + 1) % 6
    //   diff=5: corner = (min(e1,e2) + 1) % 6  (wrap case: e.g. e1=5, e2=0)
    const later = (diff === 1) ? Math.max(e1, e2) : Math.min(e1, e2);
    const ci = (later + 1) % 6;
    const R = 50; // circumradius of tile hex (50-unit tile space)
    const cpx = R * Math.cos(ci * Math.PI / 3);
    const cpy = R * Math.sin(ci * Math.PI / 3);
    return `M ${p1.x},${p1.y} Q ${cpx},${cpy} ${p2.x},${p2.y}`;
  }
}