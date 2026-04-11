// ─── ADVANCED MARKET DESIGNER (SOLVER) ────────────────────────────────────────
// Handles generating market prices while respecting manual Locks.

function initMarketWizard() {
  const genBtn = document.getElementById('wizGenerateBtn');
  if (genBtn) {
    genBtn.addEventListener('click', () => {
      // Read from the main grid dimension inputs — no duplicate fields
      const rows = parseInt(document.getElementById('finMarketRows')?.value) || state.financials.marketRows || 8;
      const cols = parseInt(document.getElementById('finMarketCols')?.value) || state.financials.marketCols || 16;
      // Also sync the hidden stubs so any legacy code reading wizRows/wizCols still works
      const rStub = document.getElementById('wizRows');
      const cStub = document.getElementById('wizCols');
      if (rStub) rStub.value = rows;
      if (cStub) cStub.value = cols;
      solveMarket(rows, cols);
    });
  }
}

function solveMarket(rows, cols) {
  state.financials.marketRows = rows;
  state.financials.marketCols = cols;
  
  // Initialize grid if empty or wrong size
  if (!state.financials.market || state.financials.market.length !== rows) {
    state.financials.market = Array.from({length: rows}, () => Array(cols).fill(''));
  }

  // ── Step 1: Solve Row 0 (Interpolation) ─────────────────────────────────────
  let row0 = state.financials.market[0];
  if (row0.length !== cols) row0 = Array(cols).fill('');

  // Anchors = explicitly locked cells OR any cell that already has a value.
  // This ensures Generate never overwrites work the user has already done.
  const locks0 = [];
  for (let c = 0; c < cols; c++) {
    const v = (row0[c] || '').trim();
    if (v || state.financials.locks[`0,${c}`]) {
      locks0.push({ col: c, val: parseInt(v) || 0 });
    }
  }

  // If no anchors at all in row 0, use Min/Max from the wizard inputs
  if (locks0.length === 0) {
    const min = parseInt(document.getElementById('wizMin').value) || 40;
    const max = parseInt(document.getElementById('wizMax').value) || 400;
    row0[0] = min.toString();
    row0[cols - 1] = max.toString();
    locks0.push({ col: 0, val: min });
    locks0.push({ col: cols - 1, val: max });
  } else {
    // Ensure we have a left edge: if first anchor is not col 0, extrapolate back
    if (locks0[0].col > 0) {
      const rightAnchor = locks0[0];
      // Use the Min input as the implied left edge if available
      const min = parseInt(document.getElementById('wizMin').value) || 40;
      locks0.unshift({ col: 0, val: min });
      row0[0] = min.toString();
    }
    // Ensure a right edge
    if (locks0[locks0.length - 1].col < cols - 1) {
      const max = parseInt(document.getElementById('wizMax').value) || 400;
      locks0.push({ col: cols - 1, val: max });
      row0[cols - 1] = max.toString();
    }
  }

  // Fill gaps between anchors in Row 0
  for (let i = 0; i < locks0.length - 1; i++) {
    const start = locks0[i];
    const end = locks0[i+1];
    const steps = end.col - start.col;
    if (steps <= 0) continue;

    const diff = end.val - start.val;
    const avgJump = diff / steps;

    for (let c = start.col + 1; c < end.col; c++) {
      // Skip cells the user already filled
      if ((row0[c] || '').trim()) continue;
      const distFromStart = c - start.col;
      let p = start.val + (avgJump * distFromStart);
      p = roundTo18xxIncrement(p);
      row0[c] = p.toString();
    }
  }
  state.financials.market[0] = row0;

  // ── Step 2: Solve Lower Rows (Propagation) ──────────────────────────────────
  for (let r = 1; r < rows; r++) {
    const taper = r; // Standard staircase (each row is 1 shorter than above)
    const activeCols = cols - taper;

    for (let c = 0; c < cols; c++) {
      // Respect manual locks and any existing value the user typed
      if (state.financials.locks[`${r},${c}`]) continue;
      if ((state.financials.market[r][c] || '').trim()) continue;

      if (c >= activeCols) {
        state.financials.market[r][c] = '';
        continue;
      }

      const valAbove = parseInt(state.financials.market[r-1][c]) || 0;
      if (valAbove > 0) {
        state.financials.market[r][c] = getPrev18xxPrice(valAbove).toString();
      } else {
        state.financials.market[r][c] = '';
      }
    }
  }

  syncFinancialsUI();
  renderMarketEditor();
  autosave();
}

function roundTo18xxIncrement(p) {
  // Snap to nearest 5 or 10
  if (p < 100) return Math.round(p / 5) * 5;
  if (p < 300) return Math.round(p / 10) * 10;
  return Math.round(p / 20) * 20;
}

function getPrev18xxPrice(p) {
  let jump = 5;
  if (p > 500) jump = 50;
  else if (p > 200) jump = 20;
  else if (p > 100) jump = 10;
  else jump = 5;

  return Math.max(0, p - jump);
}

function validateMarketFlow() {
  // Scans grid for anomalies (handled in the render loop styleMarketInput)
  // But we could add a high-level report here if needed.
}
