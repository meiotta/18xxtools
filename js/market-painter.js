// ─── ADVANCED MARKET PAINTER ──────────────────────────────────────────────────
// Logic for "Painting" market zones, locking prices, and managing short rows.

let activeBrush = 'price';
let isPainting = false;

function initMarketPainter() {
  document.querySelectorAll('.painter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.painter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeBrush = btn.dataset.brush;
    });
  });

  window.addEventListener('mouseup', () => { isPainting = false; });
}

function attachCellPainter(input, r, c) {
  input.addEventListener('mousedown', (e) => {
    if (activeBrush === 'price') return; // let default selection happen
    isPainting = true;
    applyBrush(input, r, c);
    e.preventDefault(); 
  });

  input.addEventListener('mouseenter', () => {
    if (isPainting) applyBrush(input, r, c);
  });
}

function applyBrush(input, r, c) {
  let val = state.financials.market[r][c] || '';
  const key = `${r},${c}`;

  if (activeBrush === 'locked') {
    // Toggle lock
    if (state.financials.locks[key]) {
      delete state.financials.locks[key];
    } else if (val) {
      state.financials.locks[key] = parseInt(val);
    }
  } else if (activeBrush === 'eraser') {
    state.financials.market[r][c] = '';
    delete state.financials.locks[key];
  } else if (activeBrush === 'price') {
    // No-op for painting
  } else {
    // Zone brushes (p, y, o, b, c)
    let numeric = val.replace(/[pyobc]/g, '');
    state.financials.market[r][c] = numeric + activeBrush;
  }

  styleMarketInput(input, state.financials.market[r][c], r, c);
  renderMarketLegend();
  autosave();
}

/**
 * Ensures all empty cells in a row are at the end (staircase style).
 * This enforces 18xx logic where tokens move UP from the end of a short row.
 */
function enforceContiguity() {
  state.financials.market = state.financials.market.map((row, r) => {
    // 18xx standard: Prices in a row must be contiguous from the LEFT.
    // If there's a hole, we shift everything left.
    const filtered = row.filter(cell => cell !== '');
    const padded = Array(row.length).fill('');
    for (let i = 0; i < filtered.length; i++) {
        padded[i] = filtered[i];
    }
    // We also need to update locks if we shift!
    // For simplicity, we'll warn the user that "Cleaning Nulls" clears locks.
    return padded;
  });
  state.financials.locks = {}; 
  renderMarketEditor();
  autosave();
}

// Global Exports
window.enforceContiguity = enforceContiguity;
