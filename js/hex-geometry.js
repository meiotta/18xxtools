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
    // Pointy-top: columns spaced by size*√3, rows by size*1.5, odd rows stagger right by half column.
    const dx = size * Math.sqrt(3);
    const dy = size * 1.5;
    x = col * dx + dx / 2;
    y = row * dy + size;
    if (row % 2 === 1) x += dx / 2;
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
  // Inverse of getHexCenter: convert pixel coords back to col/row
  let col, row;
  if (orientation === 'flat') {
    // Flat-top hexagon hit test — inverse of getHexCenter's flat-top branch.
    // Must use the same staggerParity so that clicking a hex returns the exact
    // (row,col) that getHexCenter would place it at.
    // See getHexCenter's comment block for a full explanation of staggerParity.
    const t_x = size * 1.5;
    const t_y = size * Math.sqrt(3);
    const sp = (typeof state !== 'undefined' && state?.meta?.staggerParity) || 0;
    col = Math.round((px - size) / t_x);
    const stagger = ((col + sp) % 2 === 0 ? t_y / 2 : 0);
    row = Math.round((py - size - stagger) / t_y);
  } else {
    // Pointy-top: inverse of the pointy-top getHexCenter formula
    const dx = size * Math.sqrt(3);
    const dy = size * 1.5;
    row = Math.round((py - size) / dy);
    const stagger = (row % 2 === 1) ? dx / 2 : 0;
    col = Math.round((px - dx / 2 - stagger) / dx);
  }
  return { row: Math.max(0, row), col: Math.max(0, col) };
}

function hexId(row, col) {
  // 18xx.games flat layout: odd cols (1,3,5...) use odd coord rows (1,3,5...→ 2r+1)
  //                         even cols (0,2,4...) use even coord rows (2,4,6...→ 2r+2)
  const coordRow = (col % 2 === 0) ? (2 * row + 2) : (2 * row + 1);
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
    // Sharp curve (span=1): quadratic bezier around shared corner
    const corners = [
      {x:50,y:0}, {x:25,y:43.3}, {x:-25,y:43.3},
      {x:-50,y:0}, {x:-25,y:-43.3}, {x:25,y:-43.3}
    ];
    // For adjacent edges, find the shared corner
    const e1mod = e1 % 6, e2mod = e2 % 6;
    let sharedCorner = null;
    for (let ci = 0; ci < 6; ci++) {
      if ((ci === e1mod || (ci+1)%6 === e1mod) && (ci === e2mod || (ci+1)%6 === e2mod)) {
        sharedCorner = corners[ci]; break;
      }
      if (((ci+1)%6 === e1mod || ci === e1mod) && ((ci+1)%6 === e2mod || ci === e2mod)) {
        sharedCorner = corners[(ci+1)%6]; break;
      }
    }
    // Fallback: use midpoint corner
    if (!sharedCorner) {
      const avgEdge = (e1 + e2) / 2;
      sharedCorner = corners[Math.round(avgEdge) % 6];
    }
    // Pull control point inward by 30%
    const cpx = sharedCorner.x * 0.7;
    const cpy = sharedCorner.y * 0.7;
    return `M ${p1.x},${p1.y} Q ${cpx},${cpy} ${p2.x},${p2.y}`;
  }
}
