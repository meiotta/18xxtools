// ─── MARKET WIZARD (price solver) ─────────────────────────────────────────────
// Generates prices across the market, respecting locks and existing values.
// Works for all three market shapes:
//   2D     — interpolate row 0, propagate down with the standard 18xx step ladder.
//   1D     — interpolate the single strip from min to max, preserving locks.
//   zigzag — same as 1D price-wise.
//
// 18xx step ladder used by the propagator and by 1D interpolation snapping:
//   < 100        → step 5
//   100..200     → step 10
//   200..500     → step 20
//   > 500        → step 50

function initMarketWizard() {
  const genBtn = document.getElementById('wizGenerateBtn');
  if (!genBtn) return;
  genBtn.addEventListener('click', () => {
    const f = state.financials;
    const beforeShape = _shapeKey(f.market);
    const before = _snapshotMarket(f.market);
    if (f.marketType === '2D') {
      const rows = parseInt(document.getElementById('finMarketRows')?.value, 10) || f.marketRows || 8;
      const cols = parseInt(document.getElementById('finMarketCols')?.value, 10) || f.marketCols || 16;
      solveMarket2D(rows, cols);
    } else {
      const count = parseInt(document.getElementById('finMarketCount')?.value, 10)
                  || (Array.isArray(f.market) ? f.market.length : 0)
                  || 28;
      solveMarket1D(count);
    }
    const afterShape = _shapeKey(f.market);
    if (beforeShape !== afterShape) {
      // Structural change: full re-render
      if (typeof renderMarketEditor === 'function') renderMarketEditor();
    } else {
      _renderChangedCells(before, f.market);
    }
    if (typeof syncFinancialsUI === 'function') syncFinancialsUI();
    if (typeof renderLegend === 'function') renderLegend();
    if (typeof renderValidation === 'function') renderValidation();
    if (typeof renderCellInspector === 'function') renderCellInspector();
    if (typeof autosave === 'function') autosave();
    // Hidden legacy stubs for any code that still reads them
    const rStub = document.getElementById('wizRows');
    const cStub = document.getElementById('wizCols');
    if (rStub) rStub.value = state.financials.marketRows || rStub.value;
    if (cStub) cStub.value = state.financials.marketCols || cStub.value;
  });
}

function _shapeKey(market) {
  if (!Array.isArray(market)) return 'none';
  if (Array.isArray(market[0])) return `2d:${market.length}x${market[0].length}`;
  return `1d:${market.length}`;
}
function _snapshotMarket(market) {
  if (!Array.isArray(market)) return null;
  if (Array.isArray(market[0])) return market.map(row => row.slice());
  return market.slice();
}
function _renderChangedCells(before, after) {
  if (!before || !after) return;
  const oneD = !Array.isArray(after[0]);
  if (oneD) {
    for (let i = 0; i < after.length; i++) {
      if (before[i] !== after[i] && typeof renderOneCell === 'function') {
        renderOneCell(0, i);
        _flashCell(0, i);
      }
    }
  } else {
    for (let r = 0; r < after.length; r++) {
      for (let c = 0; c < after[r].length; c++) {
        const wasV = (before[r] && before[r][c]) || '';
        const isV  = after[r][c] || '';
        if (wasV !== isV && typeof renderOneCell === 'function') {
          renderOneCell(r, c);
          _flashCell(r, c);
        }
      }
    }
  }
}
function _flashCell(r, c) {
  const el = document.querySelector(`.mkt-cell[data-r="${r}"][data-c="${c}"]`);
  if (!el) return;
  el.classList.add('is-flash');
  setTimeout(() => el.classList.remove('is-flash'), 480);
}

// ── Math helpers ─────────────────────────────────────────────────────────────
function roundTo18xxIncrement(p) {
  if (p < 100) return Math.round(p / 5) * 5;
  if (p < 300) return Math.round(p / 10) * 10;
  return Math.round(p / 20) * 20;
}
function getPrev18xxPrice(p) {
  let step = 5;
  if (p > 500) step = 50;
  else if (p > 200) step = 20;
  else if (p > 100) step = 10;
  return Math.max(0, p - step);
}

function _readMinMax() {
  return {
    min: parseInt(document.getElementById('wizMin')?.value, 10) || 40,
    max: parseInt(document.getElementById('wizMax')?.value, 10) || 400,
  };
}

// Cell raw read/write that preserves the cell's flag suffix.
// Generate only fills empty cells and unlocked cells; it never touches flagged ones with values.
function _writeNewPrice(rawSlot, newPrice) {
  // rawSlot may be '' (empty) or '<digits>[flags]'. We only write if empty.
  // Caller checks lock; here we just produce the new string.
  const cell = parseCell(rawSlot);
  if (cell.price != null) return rawSlot;
  return String(newPrice);
}

// ── 2D solver ────────────────────────────────────────────────────────────────
function solveMarket2D(rows, cols) {
  const f = state.financials;
  f.marketType = '2D';
  f.marketRows = rows;
  f.marketCols = cols;

  // Initialize grid if shape mismatches
  if (!Array.isArray(f.market) || !Array.isArray(f.market[0]) ||
      f.market.length !== rows || f.market[0].length !== cols) {
    const oldFlat = (f.market || []).flat ? f.market.flat() : [];
    f.market = Array.from({ length: rows }, () => Array(cols).fill(''));
    // Best-effort restore of values into top-left corner
    let i = 0;
    for (let r = 0; r < rows && i < oldFlat.length; r++) {
      for (let c = 0; c < cols && i < oldFlat.length; c++) {
        if (typeof oldFlat[i] === 'string') f.market[r][c] = oldFlat[i];
        i++;
      }
    }
  }

  // Step 1 — Row 0 interpolation between anchors.
  let row0 = f.market[0];
  const anchors = [];
  for (let c = 0; c < cols; c++) {
    const cell = parseCell(row0[c]);
    if (cell.price != null || f.locks[`0,${c}`]) {
      anchors.push({ col: c, val: cell.price != null ? cell.price : (parseInt(f.locks[`0,${c}`], 10) || 0) });
    }
  }

  if (anchors.length === 0) {
    const { min, max } = _readMinMax();
    row0[0]        = String(min);
    row0[cols - 1] = String(max);
    anchors.push({ col: 0, val: min });
    anchors.push({ col: cols - 1, val: max });
  } else {
    // Extrapolate to ends if anchors don't cover them
    if (anchors[0].col > 0) {
      const { min } = _readMinMax();
      row0[0] = String(min);
      anchors.unshift({ col: 0, val: min });
    }
    if (anchors[anchors.length - 1].col < cols - 1) {
      const { max } = _readMinMax();
      row0[cols - 1] = String(max);
      anchors.push({ col: cols - 1, val: max });
    }
  }

  // Fill gaps between adjacent anchors with linear interpolation, snapped to the 18xx ladder.
  for (let i = 0; i < anchors.length - 1; i++) {
    const a = anchors[i], b = anchors[i + 1];
    const span = b.col - a.col;
    if (span <= 1) continue;
    const inc = (b.val - a.val) / span;
    for (let c = a.col + 1; c < b.col; c++) {
      const cur = parseCell(row0[c]);
      if (cur.price != null) continue; // never overwrite an existing value
      const v = roundTo18xxIncrement(a.val + inc * (c - a.col));
      row0[c] = String(v);
    }
  }

  // Step 2 — propagate down. Each lower row tapers by 1 column from the right.
  for (let r = 1; r < rows; r++) {
    const activeCols = cols - r;
    for (let c = 0; c < cols; c++) {
      if (c >= activeCols) {
        // Outside staircase: leave any existing flagged cell alone, but blank empties remain blank.
        continue;
      }
      if (f.locks[`${r},${c}`]) continue;
      const cur = parseCell(f.market[r][c]);
      if (cur.price != null) continue;
      const above = parseCell(f.market[r - 1][c]);
      if (above.price == null) continue;
      f.market[r][c] = String(getPrev18xxPrice(above.price));
    }
  }
  // Refresh handled by the click handler in initMarketWizard.
}

// ── 1D / zigzag solver ───────────────────────────────────────────────────────
// `count` is the desired strip length. The strip is interpolated from min→max,
// stepping along the 18xx ladder. Locked / pre-filled cells anchor.
function solveMarket1D(count) {
  const f = state.financials;
  // Keep marketType as-is (1D or zigzag)
  if (f.marketType === '2D') f.marketType = '1D';

  // Coerce shape to flat array
  if (!Array.isArray(f.market) || Array.isArray(f.market[0])) {
    f.market = Array(count).fill('');
  } else if (f.market.length !== count) {
    const next = Array(count).fill('');
    for (let i = 0; i < Math.min(count, f.market.length); i++) next[i] = f.market[i];
    f.market = next;
  }

  // Anchors
  const anchors = [];
  for (let i = 0; i < count; i++) {
    const cell = parseCell(f.market[i]);
    if (cell.price != null || f.locks[`0,${i}`]) {
      anchors.push({ idx: i, val: cell.price != null ? cell.price : (parseInt(f.locks[`0,${i}`], 10) || 0) });
    }
  }

  if (anchors.length === 0) {
    const { min, max } = _readMinMax();
    f.market[0]         = String(min);
    f.market[count - 1] = String(max);
    anchors.push({ idx: 0, val: min });
    anchors.push({ idx: count - 1, val: max });
  } else {
    if (anchors[0].idx > 0) {
      const { min } = _readMinMax();
      f.market[0] = String(min);
      anchors.unshift({ idx: 0, val: min });
    }
    if (anchors[anchors.length - 1].idx < count - 1) {
      const { max } = _readMinMax();
      f.market[count - 1] = String(max);
      anchors.push({ idx: count - 1, val: max });
    }
  }

  // Fill gaps
  for (let i = 0; i < anchors.length - 1; i++) {
    const a = anchors[i], b = anchors[i + 1];
    const span = b.idx - a.idx;
    if (span <= 1) continue;
    const inc = (b.val - a.val) / span;
    for (let k = a.idx + 1; k < b.idx; k++) {
      const cur = parseCell(f.market[k]);
      if (cur.price != null) continue;
      const v = roundTo18xxIncrement(a.val + inc * (k - a.idx));
      f.market[k] = String(v);
    }
  }

  // Refresh handled by the click handler in initMarketWizard.
}

// ── Globals ──────────────────────────────────────────────────────────────────
window.initMarketWizard = initMarketWizard;
window.solveMarket = solveMarket2D;     // legacy alias
window.solveMarket2D = solveMarket2D;
window.solveMarket1D = solveMarket1D;
window.roundTo18xxIncrement = roundTo18xxIncrement;
window.getPrev18xxPrice = getPrev18xxPrice;
