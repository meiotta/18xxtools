// ─── MARKET PAINTER ───────────────────────────────────────────────────────────
// Brush-based cell editor for the stock-market grid.
// Brushes:
//   'select'  — default. Click cell → selects it (opens inspector).
//   'eraser'  — drag-paints clear.
//   'lock'    — drag-paints lock toggle (consistent direction across stroke).
//   <flag>    — any FLAG_DEFS key. Drag-paints add/remove that flag.
//
// Stroke semantics: the first cell touched on mousedown decides the stroke direction
// (add vs remove for flag brushes; lock-on vs lock-off for the lock brush). Subsequent
// mouseenter events apply the same direction.

let _activeBrush = 'select';
let _isPainting = false;
let _strokeMode = null;        // 'add' | 'remove' for flags
let _lockStroke = null;        // 'on' | 'off' for lock brush
let _openPopover = null;       // {el, anchor}

// ── Brush activation ─────────────────────────────────────────────────────────
function setActiveBrush(brush) {
  if (brush !== 'select' && !BRUSH_DEFS[brush]) brush = 'select';
  _activeBrush = brush;
  // Tools
  document.querySelectorAll('.mkt-tool[data-brush]').forEach(btn => {
    const on = btn.dataset.brush === brush;
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
  // Brushes
  document.querySelectorAll('.mkt-brush[data-brush]').forEach(btn => {
    const on = btn.dataset.brush === brush;
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
  // Popover (Tier 2)
  const pop = document.getElementById('flagPopover');
  if (pop) {
    pop.querySelectorAll('[data-brush]').forEach(btn => {
      btn.setAttribute('aria-pressed', btn.dataset.brush === brush ? 'true' : 'false');
    });
  }
  // Cursor hint on the grid
  const host = document.getElementById('marketContainerWide');
  if (host) host.dataset.brush = brush;
}

function getActiveBrush() { return _activeBrush; }

// ── Init ─────────────────────────────────────────────────────────────────────
function initMarketPainter() {
  document.querySelectorAll('.mkt-tool[data-brush], .mkt-brush[data-brush]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const next = btn.dataset.brush;
      // Tools (select/eraser/lock) — clicking re-affirms; allow toggling brushes off back to select
      if (BRUSH_DEFS[next] && BRUSH_DEFS[next].kind === 'flag' && _activeBrush === next) {
        setActiveBrush('select');
      } else {
        setActiveBrush(next);
      }
    });
  });

  const moreBtn = document.getElementById('paintMoreBtn');
  if (moreBtn) {
    moreBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      togglePaintPopover(moreBtn);
    });
  }

  window.addEventListener('mouseup', () => {
    _isPainting = false;
    _strokeMode = null;
    _lockStroke = null;
  });
  document.addEventListener('mousedown', (e) => {
    if (_openPopover && !_openPopover.el.contains(e.target) && e.target !== _openPopover.anchor) {
      closePaintPopover();
    }
  }, true);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (_openPopover) { closePaintPopover(); return; }
      if (typeof clearSelection === 'function') clearSelection();
    }
  });

  setActiveBrush('select');
}

// ── Cell wiring ──────────────────────────────────────────────────────────────
function attachCellPainter(cellEl, r, c) {
  cellEl.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault();

    // Always select (so the inspector follows the user's interaction)
    if (typeof selectCell === 'function') selectCell(r, c);

    // If brush is 'select', selection is the only effect.
    if (_activeBrush === 'select') return;

    _isPainting = true;
    _strokeMode = _decideStrokeMode(r, c, _activeBrush);
    _applyBrushToCell(r, c);
  });

  cellEl.addEventListener('mouseenter', () => {
    if (!_isPainting) return;
    if (_activeBrush === 'select') return;
    _applyBrushToCell(r, c);
  });
}

function _decideStrokeMode(r, c, brush) {
  if (brush === 'eraser') return 'erase';
  if (brush === 'lock') {
    const oneD = state.financials.marketType !== '2D';
    const cell = parseCell(getCellRaw(r, c, oneD));
    const key = `${r},${c}`;
    _lockStroke = state.financials.locks[key] ? 'off' : 'on';
    return _lockStroke;
  }
  if (BRUSH_DEFS[brush] && BRUSH_DEFS[brush].kind === 'flag') {
    const oneD = state.financials.marketType !== '2D';
    const cell = parseCell(getCellRaw(r, c, oneD));
    return cell.types.includes(brush) ? 'remove' : 'add';
  }
  return null;
}

function _applyBrushToCell(r, c) {
  const oneD = state.financials.marketType !== '2D';
  const cur = getCellRaw(r, c, oneD);
  const cell = parseCell(cur);
  const key = `${r},${c}`;

  if (_activeBrush === 'eraser') {
    setCellRaw(r, c, oneD, '');
    if (state.financials.locks) delete state.financials.locks[key];
  } else if (_activeBrush === 'lock') {
    if (cell.price == null) return;
    if (_lockStroke === 'on') state.financials.locks[key] = cell.price;
    else delete state.financials.locks[key];
  } else if (BRUSH_DEFS[_activeBrush] && BRUSH_DEFS[_activeBrush].kind === 'flag') {
    if (cell.price == null) return;
    const updated = setCellFlag(cell, _activeBrush, _strokeMode === 'add');
    setCellRaw(r, c, oneD, serializeCell(updated));
  }

  if (typeof renderOneCell === 'function') renderOneCell(r, c);
  if (typeof renderLegend === 'function') renderLegend();
  if (typeof renderValidation === 'function') renderValidation();
  // If this cell is the selected one, refresh the inspector
  const sel = state.financials.selectedCell;
  if (sel && sel.r === r && sel.c === c && typeof renderCellInspector === 'function') {
    renderCellInspector();
  }
  if (typeof autosave === 'function') autosave();
}

// Read the canonical raw string from state, handling 2D vs 1D.
function getCellRaw(r, c, oneD) {
  const m = state.financials.market;
  if (oneD) return m[c] || '';
  return (m[r] && m[r][c]) || '';
}
function setCellRaw(r, c, oneD, v) {
  const m = state.financials.market;
  if (oneD) m[c] = v;
  else if (m[r]) m[r][c] = v;
}

// ── More-flags popover ──────────────────────────────────────────────────────
function togglePaintPopover(anchor) {
  if (_openPopover && _openPopover.anchor === anchor) {
    closePaintPopover();
    return;
  }
  closePaintPopover();
  const pop = buildPaintPopover();
  document.body.appendChild(pop);
  const r = anchor.getBoundingClientRect();
  const pw = pop.offsetWidth;
  const left = Math.max(8, Math.min(window.innerWidth - pw - 8, r.left));
  pop.style.left = left + 'px';
  pop.style.top = (r.bottom + 6) + 'px';
  _openPopover = { el: pop, anchor };
  anchor.setAttribute('aria-expanded', 'true');
}

function closePaintPopover() {
  if (!_openPopover) return;
  _openPopover.el.remove();
  _openPopover.anchor.setAttribute('aria-expanded', 'false');
  _openPopover = null;
}

function buildPaintPopover() {
  const wrap = document.createElement('div');
  wrap.id = 'flagPopover';
  wrap.className = 'mkt-popover';
  wrap.setAttribute('role', 'dialog');
  wrap.setAttribute('aria-label', 'Additional flag brushes');

  // Show every flag NOT already represented in the toolbar. Source-of-truth for
  // "in the toolbar" is the rendered DOM, so editing the toolbar HTML auto-adjusts
  // the popover. Avoids the previous tier-2-only filter that left 4 tier-1 flags
  // (par_1, repar, ignore_one_sale, pays_bonus) unreachable from any brush.
  const inToolbar = new Set(
    Array.from(document.querySelectorAll('.mkt-brush[data-brush]')).map(b => b.dataset.brush)
  );

  for (const cat of BRUSH_CATEGORY_ORDER) {
    const flags = Object.keys(FLAG_DEFS).filter(t =>
      FLAG_DEFS[t].category === cat && !inToolbar.has(t)
    );
    if (flags.length === 0) continue;
    const sec = document.createElement('div');
    sec.className = 'mkt-popover-section';
    const head = document.createElement('div');
    head.className = 'mkt-popover-cat';
    head.textContent = BRUSH_CATEGORY_LABEL[cat];
    sec.appendChild(head);
    const row = document.createElement('div');
    row.className = 'mkt-popover-row';
    for (const type of flags) {
      const def = FLAG_DEFS[type];
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'mkt-brush';
      btn.dataset.brush = type;
      btn.style.setProperty('--brush-color', def.color);
      btn.title = def.text;
      btn.setAttribute('aria-pressed', type === _activeBrush ? 'true' : 'false');
      btn.innerHTML = `<span class="mkt-brush-swatch"></span><span>${def.label}</span>`;
      btn.addEventListener('click', () => {
        setActiveBrush(type);
        closePaintPopover();
      });
      row.appendChild(btn);
    }
    sec.appendChild(row);
    wrap.appendChild(sec);
  }
  return wrap;
}

// ── Globals ──────────────────────────────────────────────────────────────────
window.initMarketPainter = initMarketPainter;
window.attachCellPainter = attachCellPainter;
window.setActiveBrush = setActiveBrush;
window.getActiveBrush = getActiveBrush;
